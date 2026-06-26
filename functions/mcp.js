/**
 * Remote MCP server for the portfolio — lets an MCP client (e.g. Claude) connect
 * over OAuth 2.1 and act on the portfolio agentically (read bookings/messages,
 * read the treasury, add/edit/delete projects, log expenses/income, manage
 * accounts). On connect it hands the LLM prompt rules + the current date/time (in
 * the admin's configured timezone) via the MCP `initialize` instructions field.
 *
 * Architecture:
 *   - This Cloud Function IS the OAuth 2.1 Authorization Server. For the human
 *     login step it reuses the portfolio's EXISTING Firebase Google sign-in (no
 *     separate Google OAuth client / Console setup): /authorize redirects to the
 *     site's /mcp-login bridge page, which signs the user in with Google, gets a
 *     Firebase ID token, and POSTs it back to /oauth/firebase/callback. We verify
 *     the token, confirm its uid == the admin (Settings/Account.uid), then WE mint
 *     the code + tokens Claude uses.
 *   - The MCP endpoint runs the official MCP SDK over Streamable HTTP in stateless
 *     mode (a fresh server+transport per request — Cloud Functions are stateless).
 *
 * Config (env, set in functions/.env — no secrets needed):
 *   MCP_BASE_URL = the deployed function URL (e.g.
 *                  https://us-central1-temrevil1.cloudfunctions.net/mcp)
 *   MCP_SITE_URL = the portfolio origin hosting /mcp-login (default temrevil.com)
 *
 * Settings/MCP doc gates everything: { enabled, writesEnabled, revokedBefore }.
 */
const { onRequest } = require("firebase-functions/v2/https");
const admin = require("firebase-admin");
const crypto = require("crypto");
const { z } = require("zod");

// Portfolio origin (an authorized Firebase Auth domain) that hosts /mcp-login.
const SITE_URL = (process.env.MCP_SITE_URL || "https://temrevil.com").replace(/\/+$/, "");

const ACCESS_TTL_MS = 60 * 60 * 1000;          // 1 hour
const REFRESH_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days
const CODE_TTL_MS = 5 * 60 * 1000;             // 5 minutes
const LOGIN_TTL_MS = 10 * 60 * 1000;           // 10 minutes

// ── small helpers ──────────────────────────────────────────────────
const rand = (n = 32) => crypto.randomBytes(n).toString("base64url");
const sha256url = (s) => crypto.createHash("sha256").update(s).digest("base64url");
const now = () => Date.now();

function json(res, status, obj) {
  res.set("Content-Type", "application/json");
  res.set("Cache-Control", "no-store");
  res.status(status).send(JSON.stringify(obj));
}

// CORS for the bridge callback: the /mcp-login page calls it with fetch() (not a
// navigating form POST — that trips CSP form-action on the downstream redirect),
// so the response body must be readable from the site origin.
function setCors(req, res) {
  const origin = req.headers.origin || "";
  if (origin === SITE_URL) {
    res.set("Access-Control-Allow-Origin", origin);
    res.set("Vary", "Origin");
  }
  res.set("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.set("Access-Control-Allow-Headers", "Content-Type, Accept");
}

// The bridge page sends `Accept: application/json` so it can read the redirect URL
// and navigate itself; a direct browser POST (no such header) still gets a 302.
const wantsJson = (req) => ((req.headers.accept || "").includes("application/json"));

function callbackError(req, res, status, msg) {
  setCors(req, res);
  if (wantsJson(req)) return json(res, status, { error: msg });
  return res.status(status).send(msg);
}

function callbackRedirect(req, res, url) {
  setCors(req, res);
  if (wantsJson(req)) return json(res, 200, { redirect: url });
  return res.redirect(302, url);
}

// External base URL of THIS function (must include the /mcp path segment). Prefer
// the explicit env so OAuth metadata advertises stable, exact URLs.
function baseUrl(req) {
  if (process.env.MCP_BASE_URL) return process.env.MCP_BASE_URL.replace(/\/+$/, "");
  const proto = req.headers["x-forwarded-proto"] || "https";
  return `${proto}://${req.headers.host}`.replace(/\/+$/, "");
}

const db = () => admin.firestore();

async function mcpConfig() {
  const snap = await db().doc("Settings/MCP").get();
  const d = snap.exists ? snap.data() : {};
  return {
    enabled: d.enabled !== false,
    writesEnabled: d.writesEnabled === true,
    revokedBefore: d.revokedBefore || 0, // tokens issued before this ms are rejected
  };
}

// ── treasury math + time helpers (mirrors src/lib/treasury.ts) ──────
const DEFAULT_RATES = { USD: 1, EGP: 48, EUR: 0.92 };

/** Convert between currencies using units-per-USD rates. */
function convert(amount, from, to, rates) {
  if (!amount || from === to) return amount || 0;
  const fr = (rates && rates[from]) || DEFAULT_RATES[from];
  const tr = (rates && rates[to]) || DEFAULT_RATES[to];
  return (amount / fr) * tr;
}

const pad2 = (n) => String(n).padStart(2, "0");

/** Advance a 'YYYY-MM-DD' by one calendar month, clamping the day. */
function addOneMonth(dateStr) {
  const d = new Date(`${dateStr}T00:00:00Z`);
  if (isNaN(d.getTime())) return dateStr;
  const day = d.getUTCDate();
  const lastDayNext = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 2, 0)).getUTCDate();
  const nd = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, Math.min(day, lastDayNext)));
  return nd.toISOString().slice(0, 10);
}

/** Next due date for a monthly retainer once a payment is confirmed. */
function nextMonthlyDate(proj, paymentDate) {
  const valid = (s) => s && !isNaN(new Date(`${s}T00:00:00Z`).getTime());
  const anchor = valid(proj.nextPaymentDate) ? proj.nextPaymentDate
    : valid(proj.startDate) ? proj.startDate
    : valid(paymentDate) ? paymentDate
    : new Date().toISOString().slice(0, 10);
  return addOneMonth(anchor);
}

const round2 = (n) => Math.round((n + Number.EPSILON) * 100) / 100;

/** Sum of income linked to a project, converted to a target currency. */
function linkedIncome(projectId, income, toCurrency, rates) {
  return income.filter((i) => i.projectId === projectId)
    .reduce((s, i) => s + convert(i.amount || 0, i.currency, toCurrency, rates), 0);
}

/** Total received by a project = legacy paidAmount + every linked income. */
function projectReceived(p, income, rates) {
  return (p.paidAmount || 0) + linkedIncome(p.id, income, p.priceCurrency, rates);
}

/** Derived payment status (the app never stores this — it computes it live). */
function projectPaymentStatus(p, income, rates) {
  if (!p.priceAmount) return "unpaid";
  const r = projectReceived(p, income, rates);
  if (r >= p.priceAmount) return "paid";
  if (r > 0) return "partial";
  return "unpaid";
}

/** Running balance of an account in its own currency. */
function accountBalance(acc, income, expenses, rates) {
  let bal = acc.openingBalance || 0;
  for (const i of income) if (i.accountId === acc.id) bal += convert(i.amount || 0, i.currency, acc.currency, rates);
  for (const e of expenses) if (e.accountId === acc.id && !e.clientPaid) bal -= convert(e.amount || 0, e.currency, acc.currency, rates);
  return bal;
}

/** Current date/time at a numeric UTC offset (hours, may be .5). */
function formatLocal(offsetHours) {
  const off = Number.isFinite(offsetHours) ? offsetHours : 0;
  const d = new Date(Date.now() + off * 3600000);
  const days = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  const abs = Math.abs(off);
  const label = `UTC${off >= 0 ? "+" : "-"}${pad2(Math.floor(abs))}:${pad2(Math.round((abs % 1) * 60))}`;
  const date = `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}-${pad2(d.getUTCDate())}`;
  const time = `${pad2(d.getUTCHours())}:${pad2(d.getUTCMinutes())}`;
  return { date, time, offsetLabel: label, weekday: days[d.getUTCDay()], pretty: `${days[d.getUTCDay()]}, ${date} ${time} (${label})` };
}

/** Read the admin's configured UTC offset (Settings/Availability.timezoneOffset). */
async function timezoneOffset() {
  try {
    const snap = await db().doc("Settings/Availability").get();
    const v = snap.exists ? snap.data().timezoneOffset : undefined;
    return typeof v === "number" ? v : 2; // default UTC+2 (matches the dashboard default)
  } catch {
    return 2;
  }
}

/**
 * System-prompt rules + live clock the client feeds the LLM on connect (the MCP
 * `initialize` `instructions` field). Rebuilt every request (stateless server),
 * so the date/time is always current.
 */
function buildInstructions(t, cfg) {
  return [
    "You are connected to the Revil portfolio's PRIVATE admin MCP. The only user is the portfolio owner (admin); treat every booking, message, project and financial figure as confidential, owner-only data — never expose it to anyone else.",
    "",
    `CURRENT DATE & TIME: ${t.pretty}. This is authoritative — use it as \"now\" instead of your training cutoff. Resolve \"today\", \"yesterday\", \"this month\", etc. from it, and use it for any tool date argument. Call get_current_time to re-check.`,
    "",
    "Rules:",
    "- Ground answers in the read tools (list_*, treasury_overview, get_current_time) before stating facts or acting.",
    "- Money: amounts are in the stated currency; valid currencies are USD, EGP, EUR. Don't convert silently — the treasury has its own display currency and FX rates.",
    "- Accounts: income lands INTO an account and expenses are paid FROM one. Use list_accounts and pass the right accountId; never invent an id.",
    "- Client-paid expenses: if the client/customer covered a cost, set clientPaid=true on the expense - it's recorded for reference but not counted as spending or deducted from any account.",
    "- Monthly retainers: when logging a payment that is the month's retainer payment, set monthlyPayment=true so the project's next-due date advances (early or late doesn't matter).",
    cfg.writesEnabled
      ? "- Writes are ENABLED. Before any create/update/delete, briefly state exactly what will change and get the owner's go-ahead. Be extra careful with delete_* (irreversible)."
      : "- Writes are currently DISABLED in settings, so only read tools are available. Don't promise changes you can't make.",
    "- Be concise and factual.",
  ].join("\n");
}

// ── OAuth: discovery metadata ──────────────────────────────────────
function protectedResourceMetadata(req, res) {
  const base = baseUrl(req);
  json(res, 200, {
    resource: base,
    authorization_servers: [base],
    scopes_supported: ["mcp"],
    bearer_methods_supported: ["header"],
  });
}

function authServerMetadata(req, res) {
  const base = baseUrl(req);
  json(res, 200, {
    issuer: base,
    authorization_endpoint: `${base}/authorize`,
    token_endpoint: `${base}/token`,
    registration_endpoint: `${base}/register`,
    response_types_supported: ["code"],
    grant_types_supported: ["authorization_code", "refresh_token"],
    code_challenge_methods_supported: ["S256"],
    token_endpoint_auth_methods_supported: ["none"],
    scopes_supported: ["mcp"],
  });
}

// ── OAuth: dynamic client registration (RFC 7591) ──────────────────
async function register(req, res) {
  const body = req.body || {};
  const redirectUris = Array.isArray(body.redirect_uris) ? body.redirect_uris : [];
  if (redirectUris.length === 0) {
    return json(res, 400, { error: "invalid_client_metadata", error_description: "redirect_uris required" });
  }
  const clientId = `mcp_${rand(16)}`;
  const record = {
    client_id: clientId,
    redirect_uris: redirectUris,
    client_name: String(body.client_name || "MCP Client").slice(0, 200),
    token_endpoint_auth_method: "none",
    grant_types: ["authorization_code", "refresh_token"],
    response_types: ["code"],
    createdAt: now(),
  };
  await db().doc(`MCP/clients_${clientId}`).set(record);
  return json(res, 201, { ...record, client_id_issued_at: Math.floor(now() / 1000) });
}

// ── OAuth: /authorize → bounce to Google for the human login ───────
async function authorize(req, res) {
  const q = req.query;
  const clientId = q.client_id;
  const redirectUri = q.redirect_uri;
  const codeChallenge = q.code_challenge;
  if (!clientId || !redirectUri || q.response_type !== "code") {
    return json(res, 400, { error: "invalid_request" });
  }
  if (q.code_challenge_method !== "S256" || !codeChallenge) {
    return json(res, 400, { error: "invalid_request", error_description: "PKCE S256 required" });
  }
  const clientSnap = await db().doc(`MCP/clients_${clientId}`).get();
  if (!clientSnap.exists || !(clientSnap.data().redirect_uris || []).includes(redirectUri)) {
    return json(res, 400, { error: "invalid_client", error_description: "unknown client / redirect_uri" });
  }

  // Stash the pending request; resume after the bridge page confirms the admin.
  const loginState = rand(24);
  await db().doc(`MCP/login_${loginState}`).set({
    clientId,
    redirectUri,
    codeChallenge,
    clientState: q.state || "",
    scope: q.scope || "mcp",
    resource: q.resource || baseUrl(req),
    exp: now() + LOGIN_TTL_MS,
  });

  // Send the user to the portfolio's Google sign-in bridge page. Use the explicit
  // `.html` file: the static export deploys the page as `mcp-login.html`, while a
  // bare `/mcp-login` 301-redirects to `/mcp-login/`, which the host serves as a
  // directory request → 403 Forbidden. Pointing straight at the file avoids that.
  const bridge = new URL(`${SITE_URL}/mcp-login.html`);
  bridge.searchParams.set("s", loginState);
  bridge.searchParams.set("cb", `${baseUrl(req)}/oauth/firebase/callback`);
  res.redirect(302, bridge.toString());
}

// ── OAuth: bridge callback → verify Firebase ID token → issue code ─
// The /mcp-login page fetch()es { s, id_token } here with Accept: application/json
// and reads back { redirect } to navigate itself (a navigating form POST trips CSP
// form-action on the downstream client redirect). A plain browser POST still gets a
// 302. CORS is set on every response so the site origin can read the body.
async function firebaseCallback(req, res) {
  const loginState = (req.body && req.body.s) || req.query.s;
  const idToken = (req.body && req.body.id_token) || req.query.id_token;
  if (!loginState || !idToken) return callbackError(req, res, 400, "Missing login state or token.");

  const loginRef = db().doc(`MCP/login_${loginState}`);
  const loginSnap = await loginRef.get();
  if (!loginSnap.exists || loginSnap.data().exp < now()) {
    return callbackError(req, res, 400, "Login request expired — start again from your MCP client.");
  }
  const login = loginSnap.data();

  let decoded;
  try {
    decoded = await admin.auth().verifyIdToken(idToken);
  } catch {
    return callbackError(req, res, 401, "Invalid sign-in token.");
  }

  // Admin gate. The portfolio's canonical admin signal is the `admin: true` custom
  // claim (what every Firestore rule checks via request.auth.token.admin). Fall back
  // to a Settings/Account.uid match for older setups where the claim isn't minted.
  const acc = await db().doc("Settings/Account").get();
  const adminUid = acc.exists ? acc.data().uid : null;
  const isAdmin = decoded.admin === true || (adminUid && decoded.uid === adminUid);
  if (!isAdmin) {
    return callbackError(req, res, 403, "Access denied — this account is not the portfolio admin.");
  }

  await loginRef.delete();

  // Mint our authorization code, bound to the client + PKCE challenge.
  const authCode = rand(24);
  await db().doc(`MCP/codes_${authCode}`).set({
    clientId: login.clientId,
    redirectUri: login.redirectUri,
    codeChallenge: login.codeChallenge,
    scope: login.scope,
    resource: login.resource,
    sub: decoded.uid,
    exp: now() + CODE_TTL_MS,
  });

  const back = new URL(login.redirectUri);
  back.searchParams.set("code", authCode);
  if (login.clientState) back.searchParams.set("state", login.clientState);
  return callbackRedirect(req, res, back.toString());
}

// ── OAuth: /token (authorization_code + refresh_token) ─────────────
async function issueTokens(sub, scope) {
  const accessToken = rand(32);
  const refreshToken = rand(32);
  const accessExp = now() + ACCESS_TTL_MS;
  await db().doc(`MCP/tokens_${accessToken}`).set({ sub, scope, exp: accessExp, iat: now(), refreshToken });
  await db().doc(`MCP/refresh_${refreshToken}`).set({ sub, scope, exp: now() + REFRESH_TTL_MS, accessToken });
  return {
    access_token: accessToken,
    token_type: "Bearer",
    expires_in: Math.floor(ACCESS_TTL_MS / 1000),
    refresh_token: refreshToken,
    scope,
  };
}

async function token(req, res) {
  const b = req.body || {};
  if (b.grant_type === "authorization_code") {
    const codeRef = db().doc(`MCP/codes_${b.code}`);
    const codeSnap = await codeRef.get();
    if (!codeSnap.exists) return json(res, 400, { error: "invalid_grant" });
    const c = codeSnap.data();
    await codeRef.delete();
    if (c.exp < now()) return json(res, 400, { error: "invalid_grant", error_description: "code expired" });
    if (c.clientId !== b.client_id) return json(res, 400, { error: "invalid_grant", error_description: "client mismatch" });
    if (c.redirectUri !== b.redirect_uri) return json(res, 400, { error: "invalid_grant", error_description: "redirect mismatch" });
    if (!b.code_verifier || sha256url(b.code_verifier) !== c.codeChallenge) {
      return json(res, 400, { error: "invalid_grant", error_description: "PKCE verification failed" });
    }
    return json(res, 200, await issueTokens(c.sub, c.scope));
  }

  if (b.grant_type === "refresh_token") {
    const refRef = db().doc(`MCP/refresh_${b.refresh_token}`);
    const refSnap = await refRef.get();
    if (!refSnap.exists) return json(res, 400, { error: "invalid_grant" });
    const r = refSnap.data();
    await refRef.delete();
    if (r.exp < now()) return json(res, 400, { error: "invalid_grant", error_description: "refresh expired" });
    // Invalidate the old access token paired with this refresh (rotation).
    if (r.accessToken) await db().doc(`MCP/tokens_${r.accessToken}`).delete().catch(() => {});
    return json(res, 200, await issueTokens(r.sub, r.scope));
  }

  return json(res, 400, { error: "unsupported_grant_type" });
}

async function verifyBearer(req) {
  const auth = req.headers.authorization || "";
  const m = auth.match(/^Bearer\s+(.+)$/i);
  if (!m) return null;
  const snap = await db().doc(`MCP/tokens_${m[1]}`).get();
  if (!snap.exists) return null;
  const t = snap.data();
  if (t.exp < now()) return null;
  return t; // { sub, scope, exp }
}

// ── MCP tools ──────────────────────────────────────────────────────
const SERVER_TIMESTAMP = () => admin.firestore.FieldValue.serverTimestamp();
const ok = (obj) => ({ content: [{ type: "text", text: JSON.stringify(obj, null, 2) }] });
const fail = (msg) => ({ content: [{ type: "text", text: msg }], isError: true });

function registerTools(server, cfg, time) {
  // ---- reads ----
  server.registerTool("get_current_time",
    { title: "Current date & time", description: "The current date and time in the owner's configured timezone. Use this as 'now'.", inputSchema: {}, annotations: { readOnlyHint: true } },
    async () => ok({ now: time.pretty, date: time.date, time: time.time, weekday: time.weekday, utcOffset: time.offsetLabel }));

  server.registerTool("list_projects",
    { title: "List portfolio projects", description: "All projects in the public portfolio (Projects collection).", inputSchema: {}, annotations: { readOnlyHint: true } },
    async () => {
      const snap = await db().collection("Projects").get();
      return ok(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    });

  server.registerTool("list_bookings",
    { title: "List bookings", description: "Scheduled meetings/calls booked through the site.", inputSchema: {}, annotations: { readOnlyHint: true } },
    async () => {
      const snap = await db().doc("Settings/Canary").get();
      const meetings = snap.exists ? (snap.data().Meetings || {}) : {};
      return ok(Object.entries(meetings).map(([id, m]) => ({ id, ...m })));
    });

  server.registerTool("list_messages",
    { title: "List contact messages", description: "Messages submitted through the contact form.", inputSchema: {}, annotations: { readOnlyHint: true } },
    async () => {
      const snap = await db().doc("Settings/Canary").get();
      const emails = snap.exists ? (snap.data().Emails || {}) : {};
      return ok(Object.entries(emails).map(([id, e]) => ({ id, ...e })));
    });

  server.registerTool("treasury_overview",
    { title: "Treasury overview", description: "Treasury projects, expenses, income, accounts (with balances) and currency settings.", inputSchema: {}, annotations: { readOnlyHint: true } },
    async () => {
      const [proj, spend, inc, acc, settings] = await Promise.all([
        db().doc("Treasury/projects").get(),
        db().doc("Treasury/spendings").get(),
        db().doc("Treasury/income").get(),
        db().doc("Treasury/accounts").get(),
        db().doc("Treasury/settings").get(),
      ]);
      const entries = (s) => (s.exists ? Object.entries(s.data().entries || {}).map(([id, v]) => ({ id, ...v })) : []);
      const settingsData = settings.exists ? settings.data() : {};
      const rates = settingsData.rates || DEFAULT_RATES;
      const income = entries(inc), expenses = entries(spend);
      const accounts = entries(acc).map((a) => ({ ...a, balance: accountBalance(a, income, expenses, rates) }));
      // payment status is DERIVED from linked income (the app doesn't store it);
      // overwrite the legacy raw paidAmount/paymentStatus with the real figures.
      const projects = entries(proj).map((p) => {
        const received = round2(projectReceived(p, income, rates));
        const paymentStatus = p.monthly ? "monthly" : projectPaymentStatus(p, income, rates);
        const outstanding = p.monthly ? null : round2(Math.max(0, (p.priceAmount || 0) - received));
        return { ...p, paidAmount: received, received, paymentStatus, outstanding };
      });
      return ok({
        serverTime: time.pretty,
        projects,
        expenses,
        income,
        accounts,
        settings: settingsData,
      });
    });

  server.registerTool("list_accounts",
    { title: "List treasury accounts", description: "All money accounts (bank/cash/card/wallet) with their current balance.", inputSchema: {}, annotations: { readOnlyHint: true } },
    async () => {
      const [acc, inc, spend, settings] = await Promise.all([
        db().doc("Treasury/accounts").get(),
        db().doc("Treasury/income").get(),
        db().doc("Treasury/spendings").get(),
        db().doc("Treasury/settings").get(),
      ]);
      const entries = (s) => (s.exists ? Object.entries(s.data().entries || {}).map(([id, v]) => ({ id, ...v })) : []);
      const rates = (settings.exists ? settings.data().rates : null) || DEFAULT_RATES;
      const income = entries(inc), expenses = entries(spend);
      return ok(entries(acc).map((a) => ({ id: a.id, name: a.name, type: a.type, currency: a.currency, balance: accountBalance(a, income, expenses, rates), archived: !!a.archived })));
    });

  if (!cfg.writesEnabled) return; // writes globally disabled in Settings/MCP

  // ---- writes ----
  server.registerTool("create_or_update_project",
    {
      title: "Create or update a project",
      description: "Add a new portfolio project or update an existing one (matched by name).",
      inputSchema: {
        name: z.string().min(1).describe("Project name (also the document id)"),
        description: z.string().optional(),
        liveLink: z.string().optional(),
        repoLink: z.string().optional(),
        downloadLink: z.string().optional(),
        tags: z.array(z.string()).optional(),
        listing: z.number().optional().describe("Sort order (lower shows first)"),
      },
      annotations: { destructiveHint: false },
    },
    async (a) => {
      const tagsMap = {};
      (a.tags || []).forEach((t, i) => { tagsMap[(i + 1).toString()] = t; });
      const doc = {
        Description: a.description ?? "",
        "Live Link": a.liveLink ?? "",
        "Repository Link": a.repoLink ?? "",
        "Download Link": a.downloadLink ?? "",
        ...(a.tags ? { Tags: tagsMap } : {}),
        ...(typeof a.listing === "number" ? { Listing: a.listing } : {}),
      };
      await db().doc(`Projects/${a.name}`).set(doc, { merge: true });
      return ok({ status: "saved", id: a.name });
    });

  server.registerTool("delete_project",
    {
      title: "Delete a project",
      description: "Permanently remove a portfolio project by name.",
      inputSchema: { name: z.string().min(1) },
      annotations: { destructiveHint: true },
    },
    async (a) => {
      await db().doc(`Projects/${a.name}`).delete();
      return ok({ status: "deleted", id: a.name });
    });

  server.registerTool("add_account",
    {
      title: "Add a treasury account",
      description: "Create a money account (bank/cash/card/wallet) that income lands in and expenses are paid from.",
      inputSchema: {
        name: z.string().min(1),
        type: z.enum(["cash", "bank", "card", "wallet", "other"]).optional().describe("defaults bank"),
        currency: z.enum(["USD", "EGP", "EUR"]),
        openingBalance: z.number().optional().describe("starting balance, defaults 0"),
        notes: z.string().optional(),
      },
      annotations: { destructiveHint: false },
    },
    async (a) => {
      const id = `acct_${rand(6)}`;
      const acc = await db().doc("Treasury/accounts").get();
      const order = acc.exists ? Object.keys(acc.data().entries || {}).length : 0;
      const entry = {
        name: a.name, type: a.type || "bank", currency: a.currency,
        openingBalance: a.openingBalance || 0,
        ...(a.notes ? { notes: a.notes } : {}),
        order, createdAt: now(),
      };
      await db().doc("Treasury/accounts").set({ entries: { [id]: entry }, lastWrite: SERVER_TIMESTAMP() }, { merge: true });
      return ok({ status: "added", id });
    });

  server.registerTool("update_account",
    {
      title: "Update a treasury account",
      description: "Change an existing account's settings (name, type, currency, opening/starting balance, notes, archived). Match by id from list_accounts; only the fields you pass are changed.",
      inputSchema: {
        id: z.string().min(1).describe("account id (see list_accounts)"),
        name: z.string().min(1).optional(),
        type: z.enum(["cash", "bank", "card", "wallet", "other"]).optional(),
        currency: z.enum(["USD", "EGP", "EUR"]).optional(),
        openingBalance: z.number().optional().describe("the starting balance before logged activity"),
        notes: z.string().optional(),
        archived: z.boolean().optional(),
      },
      annotations: { destructiveHint: false },
    },
    async (a) => {
      const snap = await db().doc("Treasury/accounts").get();
      const existing = snap.exists ? (snap.data().entries || {})[a.id] : null;
      if (!existing) return fail(`No account with id ${a.id}. Use list_accounts to find the right id.`);
      const patch = {};
      for (const k of ["name", "type", "currency", "openingBalance", "notes", "archived"]) {
        if (a[k] !== undefined) patch[k] = a[k];
      }
      if (!Object.keys(patch).length) return fail("Nothing to update — pass at least one field to change.");
      await db().doc("Treasury/accounts").set({ entries: { [a.id]: patch }, lastWrite: SERVER_TIMESTAMP() }, { merge: true });
      return ok({ status: "updated", id: a.id, changed: Object.keys(patch) });
    });

  server.registerTool("add_expense",
    {
      title: "Add a treasury expense",
      description: "Log a spending in the treasury. Pass accountId to deduct it from a specific account (see list_accounts).",
      inputSchema: {
        label: z.string().min(1),
        amount: z.number(),
        currency: z.enum(["USD", "EGP", "EUR"]),
        category: z.string().optional(),
        date: z.string().optional().describe("YYYY-MM-DD (defaults today)"),
        recurring: z.boolean().optional(),
        projectId: z.string().optional().describe("link to a treasury project id"),
        accountId: z.string().optional().describe("account it was paid FROM (see list_accounts)"),
        clientPaid: z.boolean().optional().describe("the client/customer paid it - recorded only, not counted as spending or pulled from an account"),
      },
      annotations: { destructiveHint: false },
    },
    async (a) => {
      const id = `exp_${rand(6)}`;
      const entry = {
        label: a.label, amount: a.amount, currency: a.currency, recurring: !!a.recurring,
        ...(a.category ? { category: a.category } : {}),
        ...(a.projectId ? { projectId: a.projectId } : {}),
        ...(a.accountId && !a.clientPaid ? { accountId: a.accountId } : {}),
        ...(a.clientPaid ? { clientPaid: true } : {}),
        date: a.date || new Date().toISOString().slice(0, 10), createdAt: now(),
      };
      await db().doc("Treasury/spendings").set({ entries: { [id]: entry }, lastWrite: SERVER_TIMESTAMP() }, { merge: true });
      return ok({ status: "added", id });
    });

  server.registerTool("update_expense",
    {
      title: "Update a treasury expense",
      description: "Change fields on an existing expense by id (e.g. link an account, fix the amount/date). Only the fields you pass change. Find ids via treasury_overview.",
      inputSchema: {
        id: z.string().min(1).describe("expense id (see treasury_overview)"),
        label: z.string().min(1).optional(),
        amount: z.number().optional(),
        currency: z.enum(["USD", "EGP", "EUR"]).optional(),
        category: z.string().optional(),
        date: z.string().optional().describe("YYYY-MM-DD"),
        recurring: z.boolean().optional(),
        projectId: z.string().optional(),
        accountId: z.string().optional().describe("account it was paid FROM (see list_accounts)"),
        clientPaid: z.boolean().optional().describe("the client/customer paid it - recorded only, not counted as spending or pulled from an account"),
      },
      annotations: { destructiveHint: false },
    },
    async (a) => {
      const snap = await db().doc("Treasury/spendings").get();
      const existing = snap.exists ? (snap.data().entries || {})[a.id] : null;
      if (!existing) return fail(`No expense with id ${a.id}. Use treasury_overview to find the right id.`);
      const patch = {};
      for (const k of ["label", "amount", "currency", "category", "date", "recurring", "projectId", "accountId", "clientPaid"]) {
        if (a[k] !== undefined) patch[k] = a[k];
      }
      if (!Object.keys(patch).length) return fail("Nothing to update — pass at least one field to change.");
      await db().doc("Treasury/spendings").set({ entries: { [a.id]: patch }, lastWrite: SERVER_TIMESTAMP() }, { merge: true });
      return ok({ status: "updated", id: a.id, changed: Object.keys(patch) });
    });

  server.registerTool("add_income",
    {
      title: "Add treasury income",
      description: "Log money received. Pass accountId to add it to an account, and monthlyPayment=true if it's a monthly retainer's payment (advances the project's next-due date).",
      inputSchema: {
        amount: z.number(),
        currency: z.enum(["USD", "EGP", "EUR"]),
        date: z.string().optional().describe("YYYY-MM-DD (defaults today)"),
        note: z.string().optional(),
        projectId: z.string().optional().describe("link to a treasury project id"),
        accountId: z.string().optional().describe("account it landed IN (see list_accounts)"),
        monthlyPayment: z.boolean().optional().describe("true if this IS a monthly retainer's payment"),
      },
      annotations: { destructiveHint: false },
    },
    async (a) => {
      const id = `inc_${rand(6)}`;
      const date = a.date || new Date().toISOString().slice(0, 10);
      const entry = {
        amount: a.amount, currency: a.currency, date, createdAt: now(),
        ...(a.note ? { note: a.note } : {}),
        ...(a.projectId ? { projectId: a.projectId } : {}),
        ...(a.accountId ? { accountId: a.accountId } : {}),
        ...(a.monthlyPayment ? { monthlyPayment: true } : {}),
      };
      await db().doc("Treasury/income").set({ entries: { [id]: entry }, lastWrite: SERVER_TIMESTAMP() }, { merge: true });

      // A confirmed monthly payment advances the linked retainer's schedule.
      let nextPaymentDate;
      if (a.monthlyPayment && a.projectId) {
        const pdoc = await db().doc("Treasury/projects").get();
        const proj = pdoc.exists ? (pdoc.data().entries || {})[a.projectId] : null;
        if (proj && proj.monthly) {
          nextPaymentDate = nextMonthlyDate(proj, date);
          await db().doc("Treasury/projects").set(
            { entries: { [a.projectId]: { nextPaymentDate } }, lastWrite: SERVER_TIMESTAMP() },
            { merge: true },
          );
        }
      }
      return ok({ status: "added", id, ...(nextPaymentDate ? { nextPaymentDate } : {}) });
    });

  server.registerTool("update_income",
    {
      title: "Update treasury income",
      description: "Change fields on an existing income entry by id (e.g. link an account, fix the amount/date). Only the fields you pass change. Find ids via treasury_overview.",
      inputSchema: {
        id: z.string().min(1).describe("income id (see treasury_overview)"),
        amount: z.number().optional(),
        currency: z.enum(["USD", "EGP", "EUR"]).optional(),
        date: z.string().optional().describe("YYYY-MM-DD"),
        note: z.string().optional(),
        projectId: z.string().optional(),
        accountId: z.string().optional().describe("account it landed IN (see list_accounts)"),
        monthlyPayment: z.boolean().optional(),
      },
      annotations: { destructiveHint: false },
    },
    async (a) => {
      const snap = await db().doc("Treasury/income").get();
      const existing = snap.exists ? (snap.data().entries || {})[a.id] : null;
      if (!existing) return fail(`No income with id ${a.id}. Use treasury_overview to find the right id.`);
      const patch = {};
      for (const k of ["amount", "currency", "date", "note", "projectId", "accountId", "monthlyPayment"]) {
        if (a[k] !== undefined) patch[k] = a[k];
      }
      if (!Object.keys(patch).length) return fail("Nothing to update — pass at least one field to change.");
      await db().doc("Treasury/income").set({ entries: { [a.id]: patch }, lastWrite: SERVER_TIMESTAMP() }, { merge: true });
      return ok({ status: "updated", id: a.id, changed: Object.keys(patch) });
    });

  server.registerTool("delete_treasury_entry",
    {
      title: "Delete a treasury expense or income entry",
      description: "Remove an entry by id from spendings or income.",
      inputSchema: { kind: z.enum(["expense", "income"]), id: z.string().min(1) },
      annotations: { destructiveHint: true },
    },
    async (a) => {
      const docPath = a.kind === "expense" ? "Treasury/spendings" : "Treasury/income";
      await db().doc(docPath).set(
        { entries: { [a.id]: admin.firestore.FieldValue.delete() }, lastWrite: SERVER_TIMESTAMP() },
        { merge: true },
      );
      return ok({ status: "deleted", kind: a.kind, id: a.id });
    });
}

// ── MCP endpoint (stateless Streamable HTTP) ───────────────────────
async function handleMcp(req, res) {
  const base = baseUrl(req);
  const tokenInfo = await verifyBearer(req);
  if (!tokenInfo) {
    res.set("WWW-Authenticate", `Bearer resource_metadata="${base}/.well-known/oauth-protected-resource"`);
    return json(res, 401, { error: "invalid_token", error_description: "Missing or invalid access token." });
  }

  const cfg = await mcpConfig();
  if (!cfg.enabled) return json(res, 503, { error: "server_disabled", error_description: "MCP is turned off in Settings." });
  if ((tokenInfo.iat || 0) < cfg.revokedBefore) {
    res.set("WWW-Authenticate", `Bearer resource_metadata="${base}/.well-known/oauth-protected-resource"`);
    return json(res, 401, { error: "invalid_token", error_description: "Access was revoked. Re-connect to continue." });
  }

  const { McpServer } = await import("@modelcontextprotocol/sdk/server/mcp.js");
  const { StreamableHTTPServerTransport } = await import("@modelcontextprotocol/sdk/server/streamableHttp.js");

  // Live clock (in the admin's configured timezone) + prompt rules, handed to the
  // LLM via the MCP `initialize` instructions field on every connect.
  const time = formatLocal(await timezoneOffset());
  const server = new McpServer(
    {
      name: "revil-portfolio",
      version: "1.2.0",
      title: "Revil Portfolio",
      websiteUrl: "https://temrevil.com",
      // The site's glitch-"r" monogram, so clients show it instead of a generated avatar.
      icons: [
        { src: "https://temrevil.com/icon.svg", mimeType: "image/svg+xml", sizes: ["any"] },
        { src: "https://temrevil.com/icon-512.webp", mimeType: "image/webp", sizes: ["512x512"] },
        { src: "https://temrevil.com/icon-192.webp", mimeType: "image/webp", sizes: ["192x192"] },
      ],
    },
    { instructions: buildInstructions(time, cfg) },
  );
  registerTools(server, cfg, time);

  const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
  res.on("close", () => { transport.close(); server.close(); });
  await server.connect(transport);
  await transport.handleRequest(req, res, req.body);
}

// ── Router ─────────────────────────────────────────────────────────
exports.mcp = onRequest(
  {
    region: "us-central1",
    cors: false,
    maxInstances: 10,
  },
  async (req, res) => {
    try {
      const p = req.path || "/";
      if (p.endsWith("/.well-known/oauth-protected-resource")) return protectedResourceMetadata(req, res);
      if (p.endsWith("/.well-known/oauth-authorization-server") || p.endsWith("/.well-known/openid-configuration")) return authServerMetadata(req, res);
      if (p.endsWith("/register")) return register(req, res);
      if (p.endsWith("/authorize")) return authorize(req, res);
      if (p.endsWith("/oauth/firebase/callback")) {
        if (req.method === "OPTIONS") { setCors(req, res); return res.status(204).send(""); }
        return firebaseCallback(req, res);
      }
      if (p.endsWith("/token")) return token(req, res);
      return handleMcp(req, res);
    } catch (err) {
      console.error("[mcp] error:", err);
      if (!res.headersSent) json(res, 500, { error: "server_error" });
    }
  },
);
