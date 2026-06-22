/**
 * Remote MCP server for the portfolio — lets an MCP client (e.g. Claude) connect
 * over OAuth 2.1 and act on the portfolio agentically (read bookings/messages,
 * read the treasury, add/edit/delete projects, log expenses/income).
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

function registerTools(server, cfg) {
  // ---- reads ----
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
    { title: "Treasury overview", description: "Treasury projects, expenses, income and currency settings.", inputSchema: {}, annotations: { readOnlyHint: true } },
    async () => {
      const [proj, spend, inc, settings] = await Promise.all([
        db().doc("Treasury/projects").get(),
        db().doc("Treasury/spendings").get(),
        db().doc("Treasury/income").get(),
        db().doc("Treasury/settings").get(),
      ]);
      const entries = (s) => (s.exists ? Object.entries(s.data().entries || {}).map(([id, v]) => ({ id, ...v })) : []);
      return ok({
        projects: entries(proj),
        expenses: entries(spend),
        income: entries(inc),
        settings: settings.exists ? settings.data() : {},
      });
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

  server.registerTool("add_expense",
    {
      title: "Add a treasury expense",
      description: "Log a spending in the treasury.",
      inputSchema: {
        label: z.string().min(1),
        amount: z.number(),
        currency: z.enum(["USD", "EGP", "EUR"]),
        category: z.string().optional(),
        date: z.string().optional().describe("YYYY-MM-DD (defaults today)"),
        recurring: z.boolean().optional(),
      },
      annotations: { destructiveHint: false },
    },
    async (a) => {
      const id = `exp_${rand(6)}`;
      const entry = {
        label: a.label, amount: a.amount, currency: a.currency,
        category: a.category, recurring: !!a.recurring,
        date: a.date || new Date().toISOString().slice(0, 10), createdAt: now(),
      };
      await db().doc("Treasury/spendings").set({ entries: { [id]: entry }, lastWrite: SERVER_TIMESTAMP() }, { merge: true });
      return ok({ status: "added", id });
    });

  server.registerTool("add_income",
    {
      title: "Add treasury income",
      description: "Log money received in the treasury.",
      inputSchema: {
        amount: z.number(),
        currency: z.enum(["USD", "EGP", "EUR"]),
        date: z.string().optional().describe("YYYY-MM-DD (defaults today)"),
        note: z.string().optional(),
        projectId: z.string().optional(),
      },
      annotations: { destructiveHint: false },
    },
    async (a) => {
      const id = `inc_${rand(6)}`;
      const entry = {
        amount: a.amount, currency: a.currency, note: a.note, projectId: a.projectId,
        date: a.date || new Date().toISOString().slice(0, 10), createdAt: now(),
      };
      await db().doc("Treasury/income").set({ entries: { [id]: entry }, lastWrite: SERVER_TIMESTAMP() }, { merge: true });
      return ok({ status: "added", id });
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

  const server = new McpServer({ name: "revil-portfolio", version: "1.0.0" });
  registerTools(server, cfg);

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
