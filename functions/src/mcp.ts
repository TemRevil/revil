/**
 * Remote MCP server for the portfolio - lets an MCP client (e.g. Claude) connect
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
 *     mode (a fresh server+transport per request - Cloud Functions are stateless).
 *
 * Config (env, set in functions/.env - no secrets needed):
 *   MCP_BASE_URL = the deployed function URL (e.g.
 *                  https://us-central1-temrevil1.cloudfunctions.net/mcp)
 *   MCP_SITE_URL = the portfolio origin hosting /mcp-login (default temrevil.com)
 *
 * Settings/MCP doc gates everything: { enabled, writesEnabled, revokedBefore }.
 */
import { onRequest, type Request } from "firebase-functions/v2/https";
import { defineSecret } from "firebase-functions/params";
import admin from "firebase-admin";
import { randomBytes, createHash } from "crypto";
import { z } from "zod";
import nodemailer, { type Transporter } from "nodemailer";
import type { Response } from "express";
import type { DocumentSnapshot } from "firebase-admin/firestore";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import {
  buildReceiptHtml, receiptNumber, type ReceiptLine,
  buildItemizedReceiptHtml, revReceiptNumber,
} from "./receipt";

// Email (Resend SMTP relay) - mirrors index.ts, so the MCP send-receipt tool can email.
const smtpUser = defineSecret("SMTP_USER");
const resendKey = defineSecret("RESEND_API_KEY");
// Google Apps Script endpoint that actually creates/updates/cancels the Google Calendar
// event (the deployed `syncMeeting` callable is just an App Check-gated proxy to it).
// Held as a secret, NOT in the repo: this repo is public, and anyone with the URL could
// manipulate the owner's calendar.
const meetingSyncUrl = defineSecret("MEETING_SYNC_URL");
const HELLO_EMAIL = "hello@temrevil.com";
function createTransporter(): Transporter {
  return nodemailer.createTransport({
    host: "smtp.resend.com",
    port: 465,
    secure: true,
    auth: { user: "resend", pass: resendKey.value() },
  });
}

// The MCP server class is loaded via dynamic import() below (the SDK is ESM-only),
// which resolves to the package's ESM build. Type against that same build - a plain
// `import type` from a CommonJS module resolves to the CJS build, whose McpServer is
// nominally distinct (private fields), so the two wouldn't be assignable.
type McpServerInstance = import("@modelcontextprotocol/sdk/server/mcp.js", { with: { "resolution-mode": "import" } }).McpServer;

// Portfolio origin (an authorized Firebase Auth domain) that hosts /mcp-login.
const SITE_URL = (process.env.MCP_SITE_URL || "https://temrevil.com").replace(/\/+$/, "");

const ACCESS_TTL_MS = 60 * 60 * 1000;          // 1 hour
const REFRESH_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days
const CODE_TTL_MS = 5 * 60 * 1000;             // 5 minutes
const LOGIN_TTL_MS = 10 * 60 * 1000;           // 10 minutes

// ── small helpers ──────────────────────────────────────────────────
const rand = (n = 32): string => randomBytes(n).toString("base64url");
const sha256url = (s: string): string => createHash("sha256").update(s).digest("base64url");
const now = (): number => Date.now();

function json(res: Response, status: number, obj: unknown): void {
  res.set("Content-Type", "application/json");
  res.set("Cache-Control", "no-store");
  res.status(status).send(JSON.stringify(obj));
}

// CORS for the bridge callback: the /mcp-login page calls it with fetch() (not a
// navigating form POST - that trips CSP form-action on the downstream redirect),
// so the response body must be readable from the site origin.
function setCors(req: Request, res: Response): void {
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
const wantsJson = (req: Request): boolean => ((req.headers.accept || "").includes("application/json"));

function callbackError(req: Request, res: Response, status: number, msg: string): void {
  setCors(req, res);
  if (wantsJson(req)) { json(res, status, { error: msg }); return; }
  res.status(status).send(msg);
}

function callbackRedirect(req: Request, res: Response, url: string): void {
  setCors(req, res);
  if (wantsJson(req)) { json(res, 200, { redirect: url }); return; }
  res.redirect(302, url);
}

// External base URL of THIS function (must include the /mcp path segment). Pinned to
// the MCP_BASE_URL env so the OAuth metadata + login callback advertise a stable,
// exact origin. We deliberately do NOT fall back to the request's Host header: that
// value is client-controlled, and trusting it would let a spoofed Host poison the
// advertised OAuth endpoints and the token callback URL. MCP_BASE_URL is set in
// functions/.env; if it's ever missing we fail closed rather than trust the request.
function baseUrl(): string {
  const configured = process.env.MCP_BASE_URL;
  if (!configured) {
    throw new Error("MCP_BASE_URL is not configured - refusing to derive the base URL from the untrusted Host header.");
  }
  return configured.replace(/\/+$/, "");
}

const db = () => admin.firestore();

// ── Settings + record shapes ────────────────────────────────────────
interface McpCfg {
  enabled: boolean;
  writesEnabled: boolean;
  revokedBefore: number; // tokens issued before this ms are rejected
}
interface LoginRec {
  clientId: string;
  redirectUri: string;
  codeChallenge: string;
  clientState: string;
  scope: string;
  resource: string;
  exp: number;
}
interface CodeRec {
  clientId: string;
  redirectUri: string;
  codeChallenge: string;
  scope: string;
  resource: string;
  sub: string;
  exp: number;
}
interface TokenRec {
  sub: string;
  scope: string;
  exp: number;
  iat: number;
  refreshToken: string;
}
interface RefreshRec {
  sub: string;
  scope: string;
  exp: number;
  accessToken: string;
}

async function mcpConfig(): Promise<McpCfg> {
  const snap = await db().doc("Settings/MCP").get();
  const d = (snap.data() || {}) as Record<string, unknown>;
  return {
    enabled: d.enabled !== false,
    writesEnabled: d.writesEnabled === true,
    revokedBefore: typeof d.revokedBefore === "number" ? d.revokedBefore : 0,
  };
}

// ── treasury math + time helpers (mirrors src/lib/treasury.ts) ──────
type Rates = Record<string, number>;
const DEFAULT_RATES: Rates = { USD: 1, EGP: 48, EUR: 0.92 };

interface Account { id?: string; name?: string; type?: string; currency: string; openingBalance?: number; archived?: boolean; order?: number; createdAt?: number; notes?: string; }
interface Income { id?: string; amount?: number; currency: string; date?: string; note?: string; projectId?: string; accountId?: string; monthlyPayment?: boolean; createdAt?: number; }
interface Expense { id?: string; label?: string; amount?: number; currency: string; category?: string; date?: string; recurring?: boolean; projectId?: string; accountId?: string; clientPaid?: boolean; notes?: string; createdAt?: number; }
interface Project { id?: string; name?: string; client?: string; clientEmail?: string; monthly?: boolean; priceAmount?: number; priceCurrency: string; paidAmount?: number; nextPaymentDate?: string; startDate?: string; installmentMonths?: number; installmentPercent?: number; }
interface TreasurySettings { rates?: Rates; [k: string]: unknown; }

/** Convert between currencies using units-per-USD rates. */
function convert(amount: number, from: string, to: string, rates?: Rates): number {
  if (!amount || from === to) return amount || 0;
  const fr = (rates && rates[from]) || DEFAULT_RATES[from];
  const tr = (rates && rates[to]) || DEFAULT_RATES[to];
  return (amount / fr) * tr;
}

const pad2 = (n: number): string => String(n).padStart(2, "0");

/** Advance a 'YYYY-MM-DD' by one calendar month, clamping the day. */
function addOneMonth(dateStr: string): string {
  const d = new Date(`${dateStr}T00:00:00Z`);
  if (isNaN(d.getTime())) return dateStr;
  const day = d.getUTCDate();
  const lastDayNext = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 2, 0)).getUTCDate();
  const nd = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, Math.min(day, lastDayNext)));
  return nd.toISOString().slice(0, 10);
}

/** Next due date for a monthly retainer once a payment is confirmed. */
function nextMonthlyDate(proj: Project, paymentDate: string): string {
  const valid = (s?: string): boolean => !!s && !isNaN(new Date(`${s}T00:00:00Z`).getTime());
  const anchor = valid(proj.nextPaymentDate) ? proj.nextPaymentDate!
    : valid(proj.startDate) ? proj.startDate!
    : valid(paymentDate) ? paymentDate
    : new Date().toISOString().slice(0, 10);
  return addOneMonth(anchor);
}

const round2 = (n: number): number => Math.round((n + Number.EPSILON) * 100) / 100;

/**
 * Total received by a project = legacy paidAmount + linked income. For a monthly
 * retainer this counts ONLY the month's payments (monthlyPayment); one-off/goodwill
 * income linked to it stays out of the retainer tally (but is still real earned money).
 */
function projectReceived(p: Project, income: Income[], rates: Rates): number {
  const sum = income
    .filter((i) => i.projectId === p.id && (!p.monthly || i.monthlyPayment))
    .reduce((s, i) => s + convert(i.amount || 0, i.currency, p.priceCurrency, rates), 0);
  return (p.paidAmount || 0) + sum;
}

/** True when the project is billed as a fixed-total installment plan. */
function hasInstallments(p: Project): boolean {
  return !p.monthly && (p.installmentMonths || 0) > 1;
}

/**
 * The full amount owed: the contracted price PLUS any installment surcharge (a % of the
 * WHOLE price). Mirrors projectContractTotal() in src/lib/treasury.ts - keep the two in
 * step. With no plan the surcharge is x1, so this is just priceAmount.
 */
function projectContractTotal(p: Project): number {
  const price = p.priceAmount || 0;
  return hasInstallments(p) ? price * (1 + (p.installmentPercent || 0) / 100) : price;
}

/** Derived payment status (the app never stores this - it computes it live). */
function projectPaymentStatus(p: Project, income: Income[], rates: Rates): string {
  if (!p.priceAmount) return "unpaid";
  const r = projectReceived(p, income, rates);
  // Measured against price + surcharge, not the raw price, or a plan with an extra
  // charge would read as "paid" while the client still owes the surcharge.
  if (r >= projectContractTotal(p)) return "paid";
  if (r > 0) return "partial";
  return "unpaid";
}

/** Running balance of an account in its own currency. */
function accountBalance(acc: Account, income: Income[], expenses: Expense[], rates: Rates): number {
  let bal = acc.openingBalance || 0;
  for (const i of income) if (i.accountId === acc.id) bal += convert(i.amount || 0, i.currency, acc.currency, rates);
  for (const e of expenses) if (e.accountId === acc.id && !e.clientPaid) bal -= convert(e.amount || 0, e.currency, acc.currency, rates);
  return bal;
}

interface TimeInfo { date: string; time: string; offsetLabel: string; weekday: string; pretty: string; }

/** Current date/time at a numeric UTC offset (hours, may be .5). */
function formatLocal(offsetHours: number): TimeInfo {
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
async function timezoneOffset(): Promise<number> {
  try {
    const snap = await db().doc("Settings/Availability").get();
    const v = snap.exists ? snap.data()?.timezoneOffset : undefined;
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
function buildInstructions(t: TimeInfo, cfg: McpCfg): string {
  return [
    "You are connected to the Revil portfolio's PRIVATE admin MCP. The only user is the portfolio owner (admin); treat every booking, message, project and financial figure as confidential, owner-only data - never expose it to anyone else.",
    "",
    `CURRENT DATE & TIME (captured the moment you connected): ${t.pretty}, in the owner's configured timezone from settings. Use it instead of your training cutoff - but it AGES as this conversation continues, so re-fetch with get_current_time before acting (see the CLOCK rule below). Never resolve "today"/"yesterday"/"this month" from a value you saw earlier.`,
    "",
    "==================== #1 RULE - THE CLOCK ====================",
    "ALWAYS call get_current_time FIRST, before ANY move - and ALWAYS again right before any create/update that carries a date (add_expense, add_income, add_booking, receipts, etc.). It returns the real current date/time in the owner's configured timezone (settings). That value is the ONLY valid 'now'.",
    "NEVER guess the date, and NEVER reuse a date/time you saw earlier in this conversation - it goes stale as real time passes. Re-check every single time, even if you called get_current_time moments ago.",
    "For date-carrying writes, prefer to OMIT the `date` argument entirely so the server stamps its own current date; only pass a `date` to deliberately backdate a real past entry.",
    "============================================================",
    "",
    "Rules:",
    "- Ground answers in the read tools (list_*, treasury_overview, get_current_time) before stating facts or acting.",
    "- Money: amounts are in the stated currency; valid currencies are USD, EGP, EUR. Don't convert silently - the treasury has its own display currency and FX rates.",
    "- Accounts: income lands INTO an account and expenses are paid FROM one. Use list_accounts and pass the right accountId; never invent an id.",
    "- Client-paid expenses: if the client/customer covered a cost, set clientPaid=true on the expense - it's recorded for reference but not counted as spending or deducted from any account.",
    "- Monthly retainers: when logging a payment that is the month's retainer payment, set monthlyPayment=true so the project's next-due date advances (early or late doesn't matter).",
    cfg.writesEnabled
      ? "- Writes are ENABLED. Before any create/update/delete, briefly state exactly what will change and get the owner's go-ahead. Be extra careful with delete_* (irreversible)."
      : "- Writes are currently DISABLED in settings, so only read tools are available. Don't promise changes you can't make.",
    ...(cfg.writesEnabled
      ? [
          "- Bookings (add_booking) come in TWO modes - decide which one BEFORE creating a booking, and confirm it with the owner:",
          "    • WITH a meeting link: pass `meetingLink`, an existing Google Meet / Zoom / etc. URL. Never invent or guess a link - if the owner wants one but hasn't given a URL, ask for it first.",
          "    • WITHOUT a meeting link: omit `meetingLink` (an in-person / phone booking, or a link to be added later).",
          "  Pass date as YYYY-MM-DD and time as 24-hour HH:MM in the owner's timezone. add_booking marks the slot busy on the public calendar and emails the admin (and the guest, if an email is given), but it does NOT create a Google Calendar event or auto-generate a link. Check list_bookings first to avoid double-booking a slot.",
          "- PAST DATES (add_booking / update_booking): a date before today is refused by default. Recording a meeting that already happened - or correcting one onto a past day - is possible ONLY here over MCP, and ONLY with the owner's explicit go-ahead: state the exact past date back to them, wait for a clear yes, and only then repeat the call with allowPast: true. Never set allowPast just to clear an error, and never assume a past date was intended - it is far more often a stale clock, so re-check get_current_time first. The public booking form on the site can never book a past slot.",
          "- CATEGORIES (list_categories): every booking sits in one - the owner's own buckets (a company, a client, a side project) or the built-in \"Personal\", which is where anything booked from the public site lands. Read list_categories before setting one and pass an EXACT name from it; never invent a category. Creating, renaming and deleting categories happens in the dashboard (Canary → Options) only, so if the one they want does not exist, say so and let them add it there.",
          "  If the owner did not say which category a booking belongs to, ASK before creating it - list their categories and let them pick, including \"Personal\". Do not quietly fall back to Personal because it is the default, and do not infer the category from the guest's name, email domain or the reason: a booking filed in the wrong bucket is worse than one question. The same goes for anything else they left unsaid on a write - a missing time, an unclear guest, a meeting link you were not given: ask, never invent.",
          "- Working hours & days (get_availability / update_availability): the public booking calendar only offers the owner's selected working days and picked hours. update_availability REPLACES the entire list you send - read get_availability first, then send the FULL new list (workingDays: 0=Sun … 6=Sat; hours: 24-hour 0–23). Confirm with the owner before changing.",
        ]
      : []),
    "- Be concise and factual.",
  ].join("\n");
}

// ── OAuth: discovery metadata ──────────────────────────────────────
function protectedResourceMetadata(_req: Request, res: Response): void {
  const base = baseUrl();
  json(res, 200, {
    resource: base,
    authorization_servers: [base],
    scopes_supported: ["mcp"],
    bearer_methods_supported: ["header"],
  });
}

function authServerMetadata(_req: Request, res: Response): void {
  const base = baseUrl();
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
async function register(req: Request, res: Response): Promise<void> {
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
async function authorize(req: Request, res: Response): Promise<void> {
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
  if (!clientSnap.exists || !(clientSnap.data()?.redirect_uris || []).includes(redirectUri)) {
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
    resource: q.resource || baseUrl(),
    exp: now() + LOGIN_TTL_MS,
  });

  // Send the user to the portfolio's Google sign-in bridge page. Use the explicit
  // `.html` file: the static export deploys the page as `mcp-login.html`, while a
  // bare `/mcp-login` 301-redirects to `/mcp-login/`, which the host serves as a
  // directory request → 403 Forbidden. Pointing straight at the file avoids that.
  const bridge = new URL(`${SITE_URL}/mcp-login.html`);
  bridge.searchParams.set("s", loginState);
  bridge.searchParams.set("cb", `${baseUrl()}/oauth/firebase/callback`);
  res.redirect(302, bridge.toString());
}

// ── OAuth: bridge callback → verify Firebase ID token → issue code ─
// The /mcp-login page fetch()es { s, id_token } here with Accept: application/json
// and reads back { redirect } to navigate itself (a navigating form POST trips CSP
// form-action on the downstream client redirect). A plain browser POST still gets a
// 302. CORS is set on every response so the site origin can read the body.
async function firebaseCallback(req: Request, res: Response): Promise<void> {
  const loginState = (req.body && req.body.s) || req.query.s;
  const idToken = (req.body && req.body.id_token) || req.query.id_token;
  if (!loginState || !idToken) return callbackError(req, res, 400, "Missing login state or token.");

  const loginRef = db().doc(`MCP/login_${loginState}`);
  const loginSnap = await loginRef.get();
  const login = loginSnap.data() as LoginRec | undefined;
  if (!login || login.exp < now()) {
    return callbackError(req, res, 400, "Login request expired - start again from your MCP client.");
  }

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
  const adminUid = acc.exists ? acc.data()?.uid : null;
  const isAdmin = decoded.admin === true || (adminUid && decoded.uid === adminUid);
  if (!isAdmin) {
    return callbackError(req, res, 403, "Access denied - this account is not the portfolio admin.");
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
async function issueTokens(sub: string, scope: string) {
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

async function token(req: Request, res: Response): Promise<void> {
  const b = req.body || {};
  if (b.grant_type === "authorization_code") {
    const codeRef = db().doc(`MCP/codes_${b.code}`);
    const codeSnap = await codeRef.get();
    if (!codeSnap.exists) return json(res, 400, { error: "invalid_grant" });
    const c = codeSnap.data() as CodeRec;
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
    const r = refSnap.data() as RefreshRec;
    await refRef.delete();
    if (r.exp < now()) return json(res, 400, { error: "invalid_grant", error_description: "refresh expired" });
    // Invalidate the old access token paired with this refresh (rotation).
    if (r.accessToken) await db().doc(`MCP/tokens_${r.accessToken}`).delete().catch(() => { /* already gone */ });
    return json(res, 200, await issueTokens(r.sub, r.scope));
  }

  return json(res, 400, { error: "unsupported_grant_type" });
}

async function verifyBearer(req: Request): Promise<TokenRec | null> {
  const auth = req.headers.authorization || "";
  const m = auth.match(/^Bearer\s+(.+)$/i);
  if (!m) return null;
  const snap = await db().doc(`MCP/tokens_${m[1]}`).get();
  if (!snap.exists) return null;
  const t = snap.data() as TokenRec;
  if (t.exp < now()) return null;
  return t; // { sub, scope, exp }
}

// ── MCP tools ──────────────────────────────────────────────────────
const SERVER_TIMESTAMP = () => admin.firestore.FieldValue.serverTimestamp();
const ok = (obj: unknown): CallToolResult => ({ content: [{ type: "text", text: JSON.stringify(obj, null, 2) }] });
const fail = (msg: string): CallToolResult => ({ content: [{ type: "text", text: msg }], isError: true });

// ── Audit log ──────────────────────────────────────────────────────
// Every tool call is recorded to the top-level `McpAudit` collection (admin-only via
// the catch-all rule; the token-locked `MCP/` collection is intentionally left alone).
// This is the trail the dashboard shows: what the connected AI actually did, and when.

/** The short, PII-light text of a failed tool result. */
function resultError(r: CallToolResult): string | undefined {
  const c = r?.content?.[0] as { text?: string } | undefined;
  return c?.text ? String(c.text).slice(0, 300) : undefined;
}

/** Compact, redacted snapshot of a tool's args (never full HTML/long strings, but enough
 *  to see what happened). Long strings are truncated; arrays/objects are collapsed. */
function summarizeArgs(args: unknown): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  if (!args || typeof args !== "object") return out;
  for (const [k, v] of Object.entries(args as Record<string, unknown>)) {
    if (v === null || v === undefined) continue;
    if (typeof v === "string") out[k] = v.length > 80 ? `${v.slice(0, 80)}…` : v;
    else if (typeof v === "number" || typeof v === "boolean") out[k] = v;
    else if (Array.isArray(v)) out[k] = `[${v.length}]`;
    else out[k] = "{…}";
  }
  return out;
}

/** Append one entry to the MCP audit log. Best-effort - never throws into a tool call. */
async function logAudit(e: {
  tool: string; write: boolean; ok: boolean; error?: string;
  args: unknown; sub?: string; iat?: number;
}): Promise<void> {
  try {
    const id = `${now().toString(36)}_${rand(4)}`;
    await db().doc(`McpAudit/${id}`).set({
      tool: e.tool,
      write: e.write,
      ok: e.ok,
      ...(e.error ? { error: e.error.slice(0, 300) } : {}),
      args: summarizeArgs(e.args),
      at: now(),
      ...(e.sub ? { sub: e.sub } : {}),
      ...(e.iat ? { iat: e.iat } : {}),
    });
  } catch (err) {
    console.error("[mcp] audit log write failed:", err);
  }
}

/** Pull the `entries` map off a treasury doc into a typed array. */
function readEntries<T extends object>(s: DocumentSnapshot): Array<T & { id: string }> {
  const map = (s.data()?.entries ?? {}) as Record<string, T>;
  return Object.entries(map).map(([id, v]) => ({ id, ...v }));
}

// ── Availability (working days + hours) - mirrors src/utils/availability.ts ──
const WEEKDAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const DEFAULT_WORKING_DAYS = [0, 1, 2, 3, 4, 5, 6];
const DEFAULT_HOURS = [9, 10, 11, 12, 14, 15, 16, 17];

function sortUnique(arr: number[]): number[] {
  return [...new Set(arr)].sort((a, b) => a - b);
}
function hourLabel(h: number): string {
  const period = h >= 12 ? "PM" : "AM";
  return `${pad2(h % 12 || 12)}:00 ${period}`;
}
async function readAvailability(): Promise<{ workingDays: number[]; hours: number[] }> {
  const snap = await db().doc("Settings/Availability").get();
  const d = (snap.data() || {}) as Record<string, unknown>;
  const workingDays = Array.isArray(d.workingDays)
    ? sortUnique(d.workingDays.filter((x): x is number => typeof x === "number" && x >= 0 && x <= 6))
    : DEFAULT_WORKING_DAYS;
  const hours = Array.isArray(d.hours)
    ? sortUnique(d.hours.filter((x): x is number => typeof x === "number" && Number.isInteger(x) && x >= 0 && x <= 23))
    : DEFAULT_HOURS;
  return { workingDays, hours };
}

/** One of the owner's meeting categories, as stored under Settings/Canary.Categories. */
interface CategoryRow { id: string; name: string; color: string; created: number }

/**
 * The built-in bucket. It is never stored: a booking is Personal exactly when it
 * carries no `Category` field. Mirrors src/utils/categories.ts on the dashboard side.
 */
const PERSONAL_CATEGORY_ID = "personal";
const PERSONAL_CATEGORY_NAME = "Personal";

/** The owner's categories, oldest first - the same order the dashboard shows. */
async function readCategories(): Promise<CategoryRow[]> {
  const snap = await db().doc("Settings/Canary").get();
  const raw = (snap.exists ? snap.data()?.Categories : null) || {};
  const rows: CategoryRow[] = [];
  for (const [id, val] of Object.entries(raw as Record<string, { Name?: string; Color?: string; Created?: number }>)) {
    const name = typeof val?.Name === "string" ? val.Name.trim() : "";
    if (!id || id === PERSONAL_CATEGORY_ID || !name) continue;
    rows.push({
      id,
      name,
      color: typeof val?.Color === "string" ? val.Color : "#3b82f6",
      created: typeof val?.Created === "number" ? val.Created : 0,
    });
  }
  return rows.sort((a, b) => a.created - b.created || a.name.localeCompare(b.name));
}

/** Name of a stored category id, for read tools. Unknown/absent reads as Personal. */
function categoryName(cats: CategoryRow[], id: unknown): string {
  if (typeof id !== "string" || !id || id === PERSONAL_CATEGORY_ID) return PERSONAL_CATEGORY_NAME;
  return cats.find((c) => c.id === id)?.name || PERSONAL_CATEGORY_NAME;
}

/**
 * Resolve what the caller passed - an exact name or the raw id, case-insensitive.
 * `id: null` means Personal (store nothing). An unknown value is an ERROR rather
 * than a silently-created category: the owner makes those in the dashboard, so
 * inventing one here would put a booking in a bucket that does not exist.
 */
async function resolveCategory(input: string): Promise<{ id?: string | null; name?: string; error?: string }> {
  const want = input.trim().toLowerCase();
  if (!want || want === PERSONAL_CATEGORY_ID) return { id: null, name: PERSONAL_CATEGORY_NAME };
  const cats = await readCategories();
  const hit = cats.find((c) => c.id.toLowerCase() === want || c.name.toLowerCase() === want);
  if (!hit) {
    const list = cats.length ? cats.map((c) => `"${c.name}"`).join(", ") : "none yet";
    return {
      error: `No category called "${input}". The owner's categories are: ${list} (plus the built-in "Personal"). ` +
        "Call list_categories to see them. Categories are created in the dashboard (Canary → Options), not from here - " +
        "if this one should exist, tell the owner to add it there first.",
    };
  }
  return { id: hit.id, name: hit.name };
}

function registerTools(server: McpServerInstance, cfg: McpCfg, time: TimeInfo, session: { sub?: string; iat?: number }): void {
  // Patch registerTool once so EVERY tool registered below is wrapped with audit logging,
  // without editing each registration. The clock ping (get_current_time) is skipped - it
  // touches nothing and is called constantly. Failures in a tool are logged, then rethrown.
  const origRegister = server.registerTool.bind(server) as (
    name: string, toolCfg: { annotations?: { readOnlyHint?: boolean } },
    handler: (a: unknown, x: unknown) => Promise<CallToolResult>,
  ) => unknown;
  (server as unknown as { registerTool: unknown }).registerTool = (
    name: string,
    toolCfg: { annotations?: { readOnlyHint?: boolean } },
    handler: (a: unknown, x: unknown) => Promise<CallToolResult>,
  ): unknown => {
    const write = !toolCfg?.annotations?.readOnlyHint;
    const skip = name === "get_current_time";
    const wrapped = async (a: unknown, x: unknown): Promise<CallToolResult> => {
      try {
        const res = await handler(a, x);
        if (!skip) await logAudit({ tool: name, write, ok: !res?.isError, error: res?.isError ? resultError(res) : undefined, args: a, sub: session.sub, iat: session.iat });
        return res;
      } catch (err) {
        if (!skip) await logAudit({ tool: name, write, ok: false, error: (err as Error)?.message || String(err), args: a, sub: session.sub, iat: session.iat });
        throw err;
      }
    };
    return origRegister(name, toolCfg, wrapped);
  };

  // Resolve the date to stamp on a treasury entry. The client (an LLM) has no reliable
  // clock and tends to reuse a stale "today", so the SERVER is the source of truth:
  //  - omitted  -> stamp the server's own current local date (time.date), never the
  //    client's guess. This is the common "log it for today" path.
  //  - provided -> only accepted for BACKDATING a real past entry; a future date (past the
  //    server's today) is rejected as a stale/guessed clock.
  // `time.date` is the owner-local date computed fresh when this connection opened.
  // YYYY-MM-DD compares chronologically as plain strings.
  const resolveEntryDate = (input?: string): { date?: string; error?: string } => {
    if (!input) return { date: time.date };
    if (!/^\d{4}-\d{2}-\d{2}$/.test(input)) return { error: "date must be in YYYY-MM-DD format." };
    if (input > time.date) {
      return { error: `That date (${input}) is in the future - the server's current date is ${time.date}. Omit \`date\` to log it for today, or pass a real past date to backdate.` };
    }
    return { date: input };
  };

  // ---- reads ----
  server.registerTool("get_current_time",
    { title: "Current date & time", description: "The REAL current date/time in the owner's configured timezone - the authoritative clock. Call this FIRST before any action, and AGAIN right before any write that carries a date. Never reuse a value you saw earlier - it goes stale.", inputSchema: {}, annotations: { readOnlyHint: true } },
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
      const meetings = snap.exists ? (snap.data()?.Meetings || {}) : {};
      const cats = await readCategories();
      return ok(Object.entries(meetings).map(([id, m]) => {
        const entry = m as Record<string, unknown>;
        return { id, ...entry, category: categoryName(cats, entry.Category) };
      }));
    });

  server.registerTool("list_categories",
    {
      title: "List meeting categories",
      description:
        "The owner's meeting categories - the buckets a booking can be filed under (a company, a client, a side project), " +
        "plus the built-in \"Personal\" that every uncategorised booking falls into. Read this before setting a category on " +
        "a booking and use an EXACT name from the result. The list is managed in the dashboard (Canary → Options); it cannot " +
        "be added to from here.",
      inputSchema: {},
      annotations: { readOnlyHint: true },
    },
    async () => {
      const cats = await readCategories();
      return ok({
        categories: [
          { id: PERSONAL_CATEGORY_ID, name: PERSONAL_CATEGORY_NAME, builtIn: true, note: "Default - where guest bookings land" },
          ...cats.map((c) => ({ id: c.id, name: c.name, color: c.color, builtIn: false })),
        ],
      });
    });

  server.registerTool("list_messages",
    { title: "List contact messages", description: "Messages submitted through the contact form.", inputSchema: {}, annotations: { readOnlyHint: true } },
    async () => {
      const snap = await db().doc("Settings/Canary").get();
      const emails = snap.exists ? (snap.data()?.Emails || {}) : {};
      return ok(Object.entries(emails).map(([id, e]) => ({ id, ...(e as object) })));
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
      const settingsData = (settings.data() || {}) as TreasurySettings;
      const rates = settingsData.rates || DEFAULT_RATES;
      const income = readEntries<Income>(inc), expenses = readEntries<Expense>(spend);
      const accounts = readEntries<Account>(acc).map((a) => ({ ...a, balance: accountBalance(a, income, expenses, rates) }));
      // payment status is DERIVED from linked income (the app doesn't store it);
      // overwrite the legacy raw paidAmount/paymentStatus with the real figures.
      const projects = readEntries<Project>(proj).map((p) => {
        const received = round2(projectReceived(p, income, rates));
        const paymentStatus = p.monthly ? "monthly" : projectPaymentStatus(p, income, rates);
        // Owed = price + installment surcharge (identical to price when there's no plan).
        const total = round2(projectContractTotal(p));
        const outstanding = p.monthly ? null : round2(Math.max(0, total - received));
        // Spell the plan out so the model can answer "how much per month?" directly
        // instead of re-deriving it (and getting the surcharge wrong).
        const installments = hasInstallments(p)
          ? {
            months: p.installmentMonths,
            percent: p.installmentPercent || 0,
            total,
            perMonth: round2(total / (p.installmentMonths as number)),
          }
          : null;
        return { ...p, paidAmount: received, received, paymentStatus, total, outstanding, installments };
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
      const rates = ((settings.data() || {}) as TreasurySettings).rates || DEFAULT_RATES;
      const income = readEntries<Income>(inc), expenses = readEntries<Expense>(spend);
      return ok(readEntries<Account>(acc).map((a) => ({ id: a.id, name: a.name, type: a.type, currency: a.currency, balance: accountBalance(a, income, expenses, rates), archived: !!a.archived })));
    });

  server.registerTool("get_availability",
    { title: "Get working hours & days", description: "The owner's bookable working days and hours - exactly what the public booking calendar offers.", inputSchema: {}, annotations: { readOnlyHint: true } },
    async () => {
      const a = await readAvailability();
      return ok({
        workingDays: a.workingDays,
        workingDayNames: a.workingDays.map((d) => WEEKDAY_NAMES[d]),
        hours: a.hours,
        slots: a.hours.map(hourLabel),
      });
    });

  if (!cfg.writesEnabled) return; // writes globally disabled in Settings/MCP

  // ---- writes ----

  server.registerTool("update_availability",
    {
      title: "Update working hours & days",
      description:
        "Set the owner's bookable working days and/or hours (drives the public booking calendar). " +
        "Each argument is the FULL new list and REPLACES the old one - read get_availability first, then send the complete list. " +
        "workingDays are weekday numbers (0=Sun … 6=Sat); hours are 24-hour integers (0–23). Pass only the one you want to change.",
      inputSchema: {
        workingDays: z.array(z.number().int().min(0).max(6)).optional().describe("Full list of working weekdays, 0=Sun … 6=Sat"),
        hours: z.array(z.number().int().min(0).max(23)).optional().describe("Full list of bookable hours, 24-hour 0–23"),
      },
      annotations: { destructiveHint: false },
    },
    async (a) => {
      if (!a.workingDays && !a.hours) return fail("Pass workingDays and/or hours (the full new list) to change.");
      const patch: Record<string, unknown> = {};
      if (a.workingDays) patch.workingDays = sortUnique(a.workingDays);
      if (a.hours) patch.hours = sortUnique(a.hours);
      await db().doc("Settings/Availability").set(patch, { merge: true });
      const updated = await readAvailability();
      return ok({ status: "updated", workingDays: updated.workingDays, hours: updated.hours, slots: updated.hours.map(hourLabel) });
    });

  // ---- bookings ----
  server.registerTool("add_booking",
    {
      title: "Add a booking",
      description:
        "Create a meeting/call booking in the dashboard's Canary inbox. TWO modes: " +
        "WITH a meeting link - pass `meetingLink`, an existing Google Meet / Zoom / etc. URL you already have; " +
        "or WITHOUT a link - omit `meetingLink` (an in-person / phone booking, or a link to be added later). " +
        "Never invent a link. ALWAYS call get_current_time first and derive `date` from it - a date before today is rejected unless you pass `allowPast`. " +
        "BACKDATING (logging a meeting that already took place): owner-authorised only. Confirm the exact past date with the owner, get a clear yes, THEN call again with allowPast: true - never set it yourself to clear an error. " +
        "On a backdated booking, omit `email`: a guest address makes the site email them a confirmation for a meeting that is already over. " +
        "`category` files the booking under one of the owner's categories - call list_categories first and pass an EXACT name from it. " +
        "If the owner has not said which category this booking is for, ASK them and wait for an answer before calling: show the list and let them choose, \"Personal\" included. Omitting it silently files the booking as Personal, which is a real choice, not a safe default. " +
        "Pass `date` as YYYY-MM-DD and `time` as 24-hour HH:MM in the owner's timezone. " +
        "This writes the booking directly to Firestore: it marks the slot busy on the public calendar and emails the admin " +
        "(and the guest, if `email` is given), but it does NOT create a Google Calendar event or auto-generate a Meet link.",
      inputSchema: {
        name: z.string().min(1).describe("Guest name"),
        date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).describe("YYYY-MM-DD in the owner's timezone"),
        time: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/).describe("24-hour HH:MM in the owner's timezone"),
        email: z.string().email().optional().describe("Guest email - if given, they get a confirmation email"),
        reason: z.string().optional().describe("What the call is for"),
        meetingLink: z.string().url().optional().describe("Meeting URL (Google Meet / Zoom / etc.). Omit for a booking WITHOUT a link."),
        allowPast: z.boolean().optional().describe("Set true ONLY to record a meeting that already happened, and ONLY after the owner has confirmed that exact past date. Ignored for today/future dates."),
        category: z.string().optional().describe("Category name (exactly as list_categories returns it) or its id. Omit - or pass \"Personal\" - for the built-in default. An unknown name is rejected: the owner adds categories in the dashboard."),
      },
      annotations: { destructiveHint: false },
    },
    async (a) => {
      // A booking date before the server's current local date is usually a stale clock, so it
      // stays refused by default. Deliberately recording a meeting that already happened is a
      // real need though, so it is allowed behind an opt-in the caller may only set once the
      // owner has confirmed the date - which is exactly what the error below asks for.
      // This escape hatch is MCP-only: the public booking form (M-Contact) never offers a past
      // day, so a visitor still cannot book one.
      const backdated = a.date < time.date;
      if (backdated && !a.allowPast) {
        return fail(
          `That booking date (${a.date}) is in the past - the current date is ${time.date}. ` +
          "If you meant an upcoming meeting, call get_current_time and use today or a later date. " +
          "If you really are recording a meeting that already happened, confirm that exact date with the owner first, then call again with allowPast: true.",
        );
      }
      // Resolve the bucket before writing anything: a name the owner never created is
      // a refusal, not a new category (only the dashboard creates those).
      let categoryId: string | null = null;
      let categoryLabel = PERSONAL_CATEGORY_NAME;
      if (a.category) {
        const r = await resolveCategory(a.category);
        if (r.error) return fail(r.error);
        categoryId = r.id ?? null;
        categoryLabel = r.name || PERSONAL_CATEGORY_NAME;
      }

      // Convert to the host-perspective formats the dashboard calendar + the public
      // BookedSlots mirror compare against: Date "DD/MM/YYYY", Time "hh:mm AM/PM".
      const [Y, M, D] = a.date.split("-");
      const storedDate = `${D}/${M}/${Y}`;
      const [hhStr, mm] = a.time.split(":");
      const h24 = parseInt(hhStr, 10);
      const period = h24 >= 12 ? "PM" : "AM";
      const storedTime = `${pad2(h24 % 12 || 12)}:${mm} ${period}`;

      const id = `${now()}_${rand(4)}`;
      const payload = {
        Name: a.name,
        Date: storedDate,
        Time: storedTime,
        ...(a.email ? { Email: a.email } : {}),
        ...(a.reason ? { "What For": a.reason } : {}),
        ...(a.meetingLink ? { MeetingLink: a.meetingLink } : {}),
        // Personal is the absence of the field, so only a real category is written.
        ...(categoryId ? { Category: categoryId } : {}),
        timestamp: now(),
      };
      await db().doc("Settings/Canary").set(
        { Meetings: { [id]: payload }, lastMeetingWrite: SERVER_TIMESTAMP() },
        { merge: true },
      );
      return ok({
        status: "booked", id, date: storedDate, time: storedTime, hasMeetingLink: !!a.meetingLink, category: categoryLabel,
        ...(backdated ? { backdated: true, note: `Recorded on ${storedDate}, which is in the past (today is ${time.date}).` } : {}),
      });
    });

  // Shared by update_booking: turn YYYY-MM-DD / HH:MM into the host-perspective strings the
  // dashboard calendar and the public BookedSlots mirror compare against.
  const toStoredDate = (d: string): string => { const [Y, M, D] = d.split("-"); return `${D}/${M}/${Y}`; };
  const toStoredTime = (t: string): string => {
    const [hhStr, mm] = t.split(":");
    const h24 = parseInt(hhStr, 10);
    return `${pad2(h24 % 12 || 12)}:${mm} ${h24 >= 12 ? "PM" : "AM"}`;
  };

  // ── Google Calendar sync ──────────────────────────────────────────
  // The deployed `syncMeeting` callable enforces App Check, which a server has no way to
  // satisfy - but it is only a proxy that forwards the payload to a Google Apps Script.
  // So we post the SAME payloads straight to that script, giving MCP cancels/reschedules
  // the same calendar behaviour the dashboard has.

  /** Stored "DD/MM/YYYY" + "hh:mm AM/PM" (host wall clock) -> real UTC instant. */
  const storedToUtc = (storedDate: string, storedTime: string, hostOffset: number): Date | null => {
    const dm = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(String(storedDate || ""));
    const tm = /^(\d{1,2}):(\d{2})\s*(AM|PM)$/i.exec(String(storedTime || "").trim());
    if (!dm || !tm) return null;
    const [, D, M, Y] = dm;
    let h = parseInt(tm[1], 10);
    const min = parseInt(tm[2], 10);
    const period = tm[3].toUpperCase();
    if (period === "PM" && h !== 12) h += 12;
    if (period === "AM" && h === 12) h = 0;
    // UTC = host wall clock - host offset.
    return new Date(Date.UTC(+Y, +M - 1, +D, h, min) - hostOffset * 3600000);
  };

  interface CalendarPayload {
    action: "cancel" | "update" | "create";
    eventId?: string; name?: string; email?: string; reason?: string;
    startTime?: string; endTime?: string;
  }

  /** Post to the Apps Script. Best-effort: never throws into a tool call. */
  const syncCalendar = async (payload: CalendarPayload): Promise<{ ok: boolean; id?: string; error?: string }> => {
    const url = (meetingSyncUrl.value() || "").trim();
    if (!url) return { ok: false, error: "MEETING_SYNC_URL is not configured." };
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(20000),
      });
      const data = await res.json().catch(() => ({})) as { status?: string; id?: string; message?: string };
      if (!res.ok || data?.status === "error") {
        return { ok: false, error: data?.message || `calendar sync failed (HTTP ${res.status})` };
      }
      return { ok: true, id: data?.id };
    } catch (err) {
      return { ok: false, error: (err as Error)?.message || "calendar sync failed" };
    }
  };

  /** One hour, matching every existing booking path (dashboard + public form). */
  const MEETING_MS = 3600000;

  server.registerTool("update_booking",
    {
      title: "Update / reschedule a booking",
      description:
        "Change an existing booking by id (get ids from list_bookings). PARTIAL update: only the fields you " +
        "pass change, anything omitted is left as-is. Use it to reschedule (pass `date` and/or `time`), fix the " +
        "guest's name/email, edit the reason, or attach a meeting link you already have. " +
        "ALWAYS call get_current_time first and derive `date` from it - a date before today is rejected unless you pass `allowPast`. " +
        "Moving a booking onto a day that has already passed is owner-authorised only: confirm the exact date with the owner, get a clear yes, THEN call again with allowPast: true. " +
        "`category` refiles the booking - call list_categories first and pass an EXACT name from it, or \"Personal\" to clear it. " +
        "Rescheduling also MOVES the matching Google Calendar event, so the guest's invite follows. " +
        "Check `calendar` in the result: if it did not succeed, tell the owner to fix that event from the dashboard.",
      inputSchema: {
        id: z.string().min(1).describe("booking id (see list_bookings)"),
        date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().describe("new date, YYYY-MM-DD in the owner's timezone"),
        time: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/).optional().describe("new time, 24-hour HH:MM in the owner's timezone"),
        name: z.string().min(1).optional().describe("guest name"),
        email: z.string().email().optional().describe("guest email"),
        reason: z.string().optional().describe("what the call is for"),
        meetingLink: z.string().url().optional().describe("meeting URL you already have - never invent one"),
        allowPast: z.boolean().optional().describe("Set true ONLY to move this booking onto a day that has already passed, and ONLY after the owner has confirmed that exact date. Ignored for today/future dates."),
        category: z.string().optional().describe("Category name (exactly as list_categories returns it) or its id; \"Personal\" clears it back to the default. An unknown name is rejected."),
      },
      annotations: { destructiveHint: false },
    },
    async (a) => {
      const snap = await db().doc("Settings/Canary").get();
      const meetings = (snap.exists ? snap.data()?.Meetings : null) || {};
      const existing = meetings[a.id];
      if (!existing) return fail(`No booking with id ${a.id}. Use list_bookings to find the right id.`);

      // Same rule as add_booking: the past is refused unless the owner confirmed it. Moving a
      // booking backwards drags its Google Calendar event back with it, so it needs the nod too.
      if (a.date && a.date < time.date && !a.allowPast) {
        return fail(
          `That date (${a.date}) is in the past - the current date is ${time.date}. ` +
          "If you meant an upcoming slot, call get_current_time and use today or a later date. " +
          "If you really are moving this booking onto a day that has already passed, confirm that exact date with the owner first, then call again with allowPast: true.",
        );
      }

      // Same resolution rule as add_booking; "Personal" deletes the stored field so
      // there is only ever one representation of "uncategorised".
      let categoryLabel: string | null = null;
      const patch: Record<string, unknown> = {};
      if (a.category) {
        const r = await resolveCategory(a.category);
        if (r.error) return fail(r.error);
        patch.Category = r.id ?? admin.firestore.FieldValue.delete();
        categoryLabel = r.name || PERSONAL_CATEGORY_NAME;
      }
      if (a.date) patch.Date = toStoredDate(a.date);
      if (a.time) patch.Time = toStoredTime(a.time);
      if (a.name) patch.Name = a.name;
      if (a.email) patch.Email = a.email;
      if (a.reason) patch["What For"] = a.reason;
      if (a.meetingLink) patch.MeetingLink = a.meetingLink;
      if (!Object.keys(patch).length) return fail("Nothing to update - pass at least one field to change.");

      // Move the calendar event when the slot (or the guest's details) actually changed.
      const finalDate = String(patch.Date ?? existing.Date);
      const finalTime = String(patch.Time ?? existing.Time);
      const finalEmail = String(patch.Email ?? existing.Email ?? "");
      const finalName = String(patch.Name ?? existing.Name ?? "");
      const slotMoved = !!(patch.Date || patch.Time);
      let calendar = "no calendar event attached to this booking";

      if (existing.GoogleEventId && (slotMoved || patch.Name || patch.Email || patch["What For"])) {
        const start = storedToUtc(finalDate, finalTime, await timezoneOffset());
        if (!start) {
          calendar = "Could not read the booking's stored date/time, so the calendar event was left alone.";
        } else {
          const r = await syncCalendar({
            action: "update",
            eventId: existing.GoogleEventId,
            name: finalName,
            email: finalEmail,
            reason: String(patch["What For"] ?? existing["What For"] ?? ""),
            startTime: start.toISOString(),
            endTime: new Date(start.getTime() + MEETING_MS).toISOString(),
          });
          calendar = r.ok
            ? "Google Calendar event updated - the guest's invite now shows the new details."
            : `Google Calendar event NOT updated (${r.error}). Tell the owner to fix it from the dashboard.`;
        }
      } else if (slotMoved && existing.MeetingLink) {
        // A booking with a link but no stored event id (e.g. added over MCP): nothing to move.
        calendar = "This booking has a meeting link but no Google Calendar event id, so nothing was moved. Tell the owner to check it in the dashboard.";
      }

      await db().doc("Settings/Canary").set(
        { Meetings: { [a.id]: patch }, lastMeetingWrite: SERVER_TIMESTAMP() },
        { merge: true },
      );
      return ok({
        status: "updated",
        id: a.id,
        changed: Object.keys(patch),
        date: finalDate,
        time: finalTime,
        calendar,
        ...(categoryLabel ? { category: categoryLabel } : {}),
        ...(a.date && a.date < time.date ? { backdated: true, note: `Moved to ${finalDate}, which is in the past (today is ${time.date}).` } : {}),
      });
    });

  server.registerTool("cancel_booking",
    {
      title: "Cancel / delete a booking",
      description:
        "Cancel a booking by id (get ids from list_bookings): removes it from the dashboard, frees its slot on the " +
        "public booking calendar, AND cancels the matching Google Calendar event so the guest's invite is withdrawn. " +
        "IRREVERSIBLE - always confirm the exact booking (guest, date, time) with the owner before calling. " +
        "Check `calendar` in the result: if it did not succeed, tell the owner to cancel that event from the dashboard.",
      inputSchema: {
        id: z.string().min(1).describe("booking id (see list_bookings)"),
      },
      annotations: { destructiveHint: true },
    },
    async (a) => {
      const snap = await db().doc("Settings/Canary").get();
      const meetings = (snap.exists ? snap.data()?.Meetings : null) || {};
      const existing = meetings[a.id];
      if (!existing) return fail(`No booking with id ${a.id}. Use list_bookings to find the right id.`);

      // Cancel the calendar event FIRST (same order as the dashboard): if it fails we have
      // not yet destroyed the details needed to find the event again.
      let calendar = "no calendar event attached to this booking";
      if (existing.GoogleEventId || existing.Email) {
        const start = storedToUtc(existing.Date, existing.Time, await timezoneOffset());
        const r = await syncCalendar({
          action: "cancel",
          eventId: existing.GoogleEventId,          // preferred: exact event
          email: existing.Email,                    // fallback: search by guest
          name: existing.Name,                      // fallback: search by name
          ...(start ? { startTime: start.toISOString() } : {}),
        });
        calendar = r.ok
          ? "Google Calendar event cancelled - the guest's invite is withdrawn."
          : `Google Calendar event NOT cancelled (${r.error}). Tell the owner to cancel it from the dashboard.`;
      }

      await db().doc("Settings/Canary").update({
        [`Meetings.${a.id}`]: admin.firestore.FieldValue.delete(),
        lastMeetingWrite: SERVER_TIMESTAMP(),
      });
      return ok({
        status: "cancelled",
        id: a.id,
        // Echo what was removed so the owner sees exactly what went.
        cancelled: { name: existing.Name, date: existing.Date, time: existing.Time, email: existing.Email },
        calendar,
      });
    });

  server.registerTool("create_or_update_project",
    {
      title: "Create or update a project",
      description: "Add a new portfolio project or update an existing one (matched by name). This is a partial update: only the fields you pass are written, and any field you omit is left exactly as it was - so editing one field never wipes the others.",
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
      // Build the write from ONLY the fields the caller actually passed. Firestore
      // set(..., {merge:true}) merges at the key level, so any key we DON'T include
      // is preserved untouched. Previously the four link/description keys were always
      // written with a `?? ""` fallback, so a partial edit (e.g. just description)
      // silently blanked Live/Repository/Download Link. Omitting absent fields - like
      // tags/listing already did - makes every edit a true non-destructive merge.
      const doc: Record<string, unknown> = {};
      if (a.description !== undefined) doc.Description = a.description;
      if (a.liveLink !== undefined) doc["Live Link"] = a.liveLink;
      if (a.repoLink !== undefined) doc["Repository Link"] = a.repoLink;
      if (a.downloadLink !== undefined) doc["Download Link"] = a.downloadLink;
      if (a.tags) {
        const tagsMap: Record<string, string> = {};
        a.tags.forEach((t, i) => { tagsMap[(i + 1).toString()] = t; });
        doc.Tags = tagsMap;
      }
      if (typeof a.listing === "number") doc.Listing = a.listing;

      if (!Object.keys(doc).length) {
        return fail("Nothing to write - pass at least one field besides name (description, liveLink, repoLink, downloadLink, tags, or listing).");
      }

      await db().doc(`Projects/${a.name}`).set(doc, { merge: true });
      return ok({ status: "saved", id: a.name, changed: Object.keys(doc) });
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
      const order = acc.exists ? Object.keys(acc.data()?.entries || {}).length : 0;
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
      const existing = snap.exists ? (snap.data()?.entries || {})[a.id] : null;
      if (!existing) return fail(`No account with id ${a.id}. Use list_accounts to find the right id.`);
      const src = a as Record<string, unknown>;
      const patch: Record<string, unknown> = {};
      for (const k of ["name", "type", "currency", "openingBalance", "notes", "archived"]) {
        if (src[k] !== undefined) patch[k] = src[k];
      }
      if (!Object.keys(patch).length) return fail("Nothing to update - pass at least one field to change.");
      await db().doc("Treasury/accounts").set({ entries: { [a.id]: patch }, lastWrite: SERVER_TIMESTAMP() }, { merge: true });
      return ok({ status: "updated", id: a.id, changed: Object.keys(patch) });
    });

  server.registerTool("add_expense",
    {
      title: "Add a treasury expense",
      description: "Log a spending in the treasury. Pass accountId to deduct it from a specific account (see list_accounts). OMIT `date` to log it for today - the server stamps its own current date; only pass `date` to backdate a real past expense (do not compute 'today' yourself).",
      inputSchema: {
        label: z.string().min(1),
        amount: z.number(),
        currency: z.enum(["USD", "EGP", "EUR"]),
        category: z.string().optional(),
        date: z.string().optional().describe("YYYY-MM-DD - OMIT for today (server-stamped). Pass only to backdate a past entry; a future date is rejected."),
        recurring: z.boolean().optional(),
        projectId: z.string().optional().describe("link to a treasury project id"),
        accountId: z.string().optional().describe("account it was paid FROM (see list_accounts)"),
        clientPaid: z.boolean().optional().describe("the client/customer paid it - recorded only, not counted as spending or pulled from an account"),
        notes: z.string().optional().describe("free-text note (e.g. receipt details), kept off the short label"),
      },
      annotations: { destructiveHint: false },
    },
    async (a) => {
      const d = resolveEntryDate(a.date);
      if (d.error) return fail(d.error);
      const id = `exp_${rand(6)}`;
      const entry = {
        label: a.label, amount: a.amount, currency: a.currency, recurring: !!a.recurring,
        ...(a.category ? { category: a.category } : {}),
        ...(a.projectId ? { projectId: a.projectId } : {}),
        ...(a.accountId && !a.clientPaid ? { accountId: a.accountId } : {}),
        ...(a.clientPaid ? { clientPaid: true } : {}),
        ...(a.notes ? { notes: a.notes } : {}),
        date: d.date, createdAt: now(),
      };
      await db().doc("Treasury/spendings").set({ entries: { [id]: entry }, lastWrite: SERVER_TIMESTAMP() }, { merge: true });
      // Echo the date actually recorded + the server's clock, so a stale-dated call is visible.
      return ok({ status: "added", id, date: d.date, serverDate: time.date });
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
        date: z.string().optional().describe("YYYY-MM-DD - a future date is rejected. Leave out to keep the existing date."),
        recurring: z.boolean().optional(),
        projectId: z.string().optional(),
        accountId: z.string().optional().describe("account it was paid FROM (see list_accounts)"),
        clientPaid: z.boolean().optional().describe("the client/customer paid it - recorded only, not counted as spending or pulled from an account"),
        notes: z.string().optional().describe("free-text note (e.g. receipt details), kept off the short label"),
      },
      annotations: { destructiveHint: false },
    },
    async (a) => {
      const snap = await db().doc("Treasury/spendings").get();
      const existing = snap.exists ? (snap.data()?.entries || {})[a.id] : null;
      if (!existing) return fail(`No expense with id ${a.id}. Use treasury_overview to find the right id.`);
      if (a.date !== undefined) {
        const d = resolveEntryDate(a.date);
        if (d.error) return fail(d.error);
      }
      const src = a as Record<string, unknown>;
      const patch: Record<string, unknown> = {};
      for (const k of ["label", "amount", "currency", "category", "date", "recurring", "projectId", "accountId", "clientPaid", "notes"]) {
        if (src[k] !== undefined) patch[k] = src[k];
      }
      if (!Object.keys(patch).length) return fail("Nothing to update - pass at least one field to change.");
      await db().doc("Treasury/spendings").set({ entries: { [a.id]: patch }, lastWrite: SERVER_TIMESTAMP() }, { merge: true });
      return ok({ status: "updated", id: a.id, changed: Object.keys(patch) });
    });

  server.registerTool("add_treasury_project",
    {
      title: "Add a treasury project",
      description:
        "Create a CLIENT project in the treasury (the money side: client, price, billing). This is NOT a portfolio project - " +
        "use create_or_update_project for the public showcase. Pick ONE billing shape and confirm the numbers with the owner first: " +
        "(a) fixed price - pass price; optionally split it with installmentMonths (2-24). installmentPercent is an OPTIONAL extra " +
        "charge worked out on the WHOLE price, so the client pays price x (1 + percent/100) divided over those months. " +
        "(b) monthly retainer - pass monthly=true, and then `price` is the per-MONTH rate with no fixed total (installments don't apply). " +
        "Money received is never set here: log it with add_income linked to this project's id.",
      inputSchema: {
        name: z.string().min(1),
        client: z.string().optional(),
        clientEmail: z.string().email().optional().describe("customer email - where receipts are sent"),
        price: z.number().describe("contracted price; the per-MONTH rate when monthly=true"),
        currency: z.enum(["USD", "EGP", "EUR"]),
        status: z.enum(["active", "pending", "completed"]).optional().describe("defaults to active"),
        monthly: z.boolean().optional().describe("open-ended retainer: price is charged every month"),
        installmentMonths: z.number().int().min(2).max(24).optional().describe("split the fixed price over this many months"),
        installmentPercent: z.number().min(0).max(100).optional().describe("extra charge as a % of the WHOLE price"),
        startDate: z.string().optional().describe("YYYY-MM-DD"),
        notes: z.string().optional(),
      },
      annotations: { destructiveHint: false },
    },
    async (a) => {
      const monthly = !!a.monthly;
      // A retainer has no fixed total, so it can't also be an installment plan.
      const plan = !monthly && (a.installmentMonths || 0) > 1;
      if (monthly && a.installmentMonths) {
        return fail("A monthly retainer can't also be paid in installments - it has no fixed total. Pass either monthly=true OR installmentMonths.");
      }

      const id = `proj_${rand(6)}`;
      const pdoc = await db().doc("Treasury/projects").get();
      const existing = pdoc.exists ? (pdoc.data()?.entries || {}) : {};

      const entry = {
        name: a.name.trim(),
        ...(a.client ? { client: a.client } : {}),
        ...(a.clientEmail ? { clientEmail: a.clientEmail } : {}),
        status: a.status || "active",
        priceAmount: a.price,
        priceCurrency: a.currency,
        ...(monthly ? { monthly: true } : {}),
        ...(plan ? { installmentMonths: a.installmentMonths } : {}),
        ...(plan && a.installmentPercent ? { installmentPercent: a.installmentPercent } : {}),
        paidAmount: 0,
        paymentStatus: "unpaid",
        ...(a.notes ? { notes: a.notes } : {}),
        startDate: a.startDate || null,
        endDate: null,
        done: false,
        order: Object.keys(existing).length,
        createdAt: now(),
      };
      await db().doc("Treasury/projects").set(
        { entries: { [id]: entry }, lastWrite: SERVER_TIMESTAMP() },
        { merge: true },
      );

      const total = a.price * (1 + (plan ? (a.installmentPercent || 0) : 0) / 100);
      return ok({
        status: "added",
        id,
        billing: monthly ? "monthly retainer" : plan ? "installments" : "fixed price",
        ...(plan
          ? { total, perMonth: total / (a.installmentMonths as number), months: a.installmentMonths }
          : {}),
      });
    });

  server.registerTool("update_treasury_project",
    {
      title: "Update a treasury project",
      description:
        "Change fields on an existing treasury project by id - price, client, status, billing shape, or the installment plan. " +
        "Only the fields you pass change; everything you omit is left as-is. Find ids via treasury_overview. " +
        "Installments: pass installmentMonths (2-24) to put a fixed-price project on a plan, and installmentPercent for an " +
        "OPTIONAL extra charge worked out on the WHOLE price (client pays price x (1 + percent/100) split over the months). " +
        "Pass installmentMonths=0 to clear the plan (back to paying in one go). A monthly retainer has no fixed total, so it " +
        "cannot have installments. Money received is NOT set here - log it with add_income linked to this project.",
      inputSchema: {
        id: z.string().min(1).describe("treasury project id (see treasury_overview)"),
        name: z.string().optional(),
        client: z.string().optional(),
        clientEmail: z.string().email().optional().describe("customer email - where receipts are sent"),
        price: z.number().optional().describe("contracted price; the per-MONTH rate when monthly=true"),
        currency: z.enum(["USD", "EGP", "EUR"]).optional(),
        status: z.enum(["active", "pending", "completed"]).optional(),
        monthly: z.boolean().optional().describe("open-ended retainer"),
        installmentMonths: z.number().int().min(0).max(24).optional().describe("2-24 sets a plan; 0 clears it"),
        installmentPercent: z.number().min(0).max(100).optional().describe("extra charge as a % of the WHOLE price"),
        startDate: z.string().optional().describe("YYYY-MM-DD"),
        notes: z.string().optional(),
        done: z.boolean().optional(),
      },
      annotations: { destructiveHint: false },
    },
    async (a) => {
      const ref = db().doc("Treasury/projects");
      const snap = await ref.get();
      const entries = (snap.exists ? snap.data()?.entries : {}) || {};
      const cur = entries[a.id] as Project | undefined;
      if (!cur) return fail(`No treasury project with id "${a.id}". List them with treasury_overview.`);

      const patch: Record<string, unknown> = {};
      if (a.name !== undefined) patch.name = a.name.trim();
      if (a.client !== undefined) patch.client = a.client;
      if (a.clientEmail !== undefined) patch.clientEmail = a.clientEmail;
      if (a.price !== undefined) patch.priceAmount = a.price;
      if (a.currency !== undefined) patch.priceCurrency = a.currency;
      if (a.status !== undefined) patch.status = a.status;
      if (a.monthly !== undefined) patch.monthly = a.monthly;
      if (a.startDate !== undefined) patch.startDate = a.startDate;
      if (a.notes !== undefined) patch.notes = a.notes;
      if (a.done !== undefined) patch.done = a.done;
      // 0/1 clears the plan. Written as 0 rather than deleted so a merge can express it.
      if (a.installmentMonths !== undefined) {
        const m = a.installmentMonths > 1 ? a.installmentMonths : 0;
        patch.installmentMonths = m;
        if (!m) patch.installmentPercent = 0;
      }
      if (a.installmentPercent !== undefined) patch.installmentPercent = a.installmentPercent;

      if (!Object.keys(patch).length) return fail("Nothing to update - pass at least one field to change.");

      const merged = { ...cur, ...patch } as Project;
      if (merged.monthly && (merged.installmentMonths || 0) > 1) {
        return fail("A monthly retainer can't also be paid in installments - it has no fixed total. Clear one or the other.");
      }

      await ref.set({ entries: { [a.id]: patch }, lastWrite: SERVER_TIMESTAMP() }, { merge: true });

      const total = projectContractTotal(merged);
      return ok({
        status: "updated",
        id: a.id,
        changed: Object.keys(patch),
        billing: merged.monthly ? "monthly retainer" : hasInstallments(merged) ? "installments" : "fixed price",
        ...(hasInstallments(merged)
          ? { total: round2(total), perMonth: round2(total / (merged.installmentMonths as number)), months: merged.installmentMonths }
          : {}),
      });
    });

  server.registerTool("send_treasury_receipt",
    {
      title: "Send a receipt",
      description:
        "Build a Tem Revil receipt for ONE or MORE treasury projects and email it to the customer. " +
        "Pass projectIds (from treasury_overview). The receipt shows each project's price / paid / balance and totals. " +
        "`to` defaults to the FIRST project's saved customer email (set it with add/update_treasury_project's clientEmail); " +
        "pass `to` to override. currency defaults to the first project's currency (others are converted at current rates); " +
        "date defaults to today. ALWAYS confirm the recipient and the amounts with the owner before sending - this sends a real email. " +
        "The owner is bcc'd a copy.",
      inputSchema: {
        projectIds: z.array(z.string().min(1)).min(1).describe("treasury project ids to include (see treasury_overview)"),
        to: z.string().email().optional().describe("recipient email; defaults to the first project's clientEmail"),
        customerName: z.string().optional().describe("defaults to the first project's client"),
        currency: z.enum(["USD", "EGP", "EUR"]).optional().describe("receipt currency; defaults to the first project's currency"),
        date: z.string().optional().describe("issue date YYYY-MM-DD; defaults today"),
        note: z.string().optional().describe("optional note printed on the receipt"),
      },
      annotations: { destructiveHint: false },
    },
    async (a) => {
      const [pdoc, idoc, sdoc] = await Promise.all([
        db().doc("Treasury/projects").get(),
        db().doc("Treasury/income").get(),
        db().doc("Treasury/settings").get(),
      ]);
      const allProjects = readEntries<Project>(pdoc);
      const income = readEntries<Income>(idoc);
      const rates = ((sdoc.data() || {}) as TreasurySettings).rates || DEFAULT_RATES;

      // Keep the order the caller asked for, dropping ids that don't exist.
      const selected = a.projectIds
        .map((id) => allProjects.find((p) => p.id === id))
        .filter((p): p is Project & { id: string } => !!p);
      if (!selected.length) return fail("None of those project ids exist. List them with treasury_overview.");

      const first = selected[0];
      const to = (a.to || first.clientEmail || "").trim();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(to)) {
        return fail("No valid recipient email. Pass `to`, or set the project's clientEmail with update_treasury_project.");
      }
      const cur = a.currency || first.priceCurrency || "USD";

      const lines: ReceiptLine[] = selected.map((p) => {
        const cvt = (n: number) => convert(n, p.priceCurrency, cur, rates);
        const priceNative = p.monthly ? (p.priceAmount || 0) : projectContractTotal(p);
        const paidNative = projectReceived(p, income, rates);
        const balNative = p.monthly ? null : Math.max(0, priceNative - paidNative);
        return {
          name: p.name || "Project",
          note: p.monthly
            ? "Monthly retainer"
            : hasInstallments(p)
              ? `${p.installmentMonths} installments${p.installmentPercent ? ` (+${p.installmentPercent}%)` : ""}`
              : undefined,
          price: round2(cvt(priceNative)),
          paid: round2(cvt(paidNative)),
          balance: balNative === null ? null : round2(cvt(balNative)),
        };
      });
      const totals = lines.reduce(
        (t, l) => ({ price: t.price + l.price, paid: t.paid + l.paid, balance: t.balance + (l.balance || 0) }),
        { price: 0, paid: 0, balance: 0 },
      );

      // Issue date defaults to the server's own current local date (never a client guess).
      const dateStr = a.date || time.date;
      const dateLabel = (() => {
        const dt = new Date(`${dateStr}T00:00:00`);
        return isNaN(dt.getTime()) ? dateStr : dt.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
      })();
      const receiptNo = receiptNumber();

      const html = buildReceiptHtml({
        receiptNo,
        dateLabel,
        customerName: (a.customerName || first.client || undefined),
        customerEmail: to,
        currency: cur,
        lines,
        totals,
        note: a.note,
        converted: selected.some((p) => p.priceCurrency !== cur),
      });

      try {
        const transporter = createTransporter();
        const owner = smtpUser.value();
        await transporter.sendMail({
          from: `"Tem Revil" <${HELLO_EMAIL}>`,
          to,
          bcc: owner && owner.toLowerCase() !== to.toLowerCase() ? owner : undefined,
          replyTo: HELLO_EMAIL,
          subject: `Receipt ${receiptNo} from Tem Revil`,
          html,
        });
      } catch (err) {
        console.error("[mcp] send_treasury_receipt failed:", err);
        return fail("Failed to send the receipt email.");
      }

      // Log it to the sent-receipts history (best-effort - the email already went out).
      try {
        const rid = `rcp_${now().toString(36)}${rand(3)}`;
        await db().doc("Treasury/receipts").set({
          entries: {
            [rid]: {
              receiptNo,
              to,
              sentAt: now(),
              currency: cur,
              total: round2(totals.price),
              balance: round2(totals.balance),
              projectIds: selected.map((p) => p.id),
              projectNames: selected.map((p) => p.name),
              via: "mcp",
            },
          },
          lastWrite: SERVER_TIMESTAMP(),
        }, { merge: true });
      } catch (logErr) {
        console.error("[mcp] receipt sent but history log failed:", logErr);
      }

      return ok({
        status: "sent",
        to,
        receiptNo,
        currency: cur,
        projects: selected.map((p) => p.name),
        totals,
      });
    });

  server.registerTool("send_itemized_receipt",
    {
      title: "Send an itemized receipt",
      description:
        "Send the DARK itemized Revil receipt: free-form line items that each carry their own " +
        "currency, optional dated sub-entries nested under a line (what shipped for that project), " +
        "and one total per currency. For repeated units pass qty + unitPrice and omit amount - the receipt then prints '3 x $50.00' under the label. " +
        "When the receipt mixes currencies it also shows an " +
        "emphasized grand-total row underneath, converting everything into the treasury's base " +
        "currency (EGP) at current rates - override with grandTotalCurrency. Use this instead of " +
        "send_treasury_receipt when the receipt needs custom wording, a work log, or mixed " +
        "currencies. Everything is escaped and rendered server-side. ALWAYS confirm the recipient " +
        "and every amount with the owner before sending - this sends a real email. The owner is bcc'd a copy.",
      inputSchema: {
        to: z.string().email().describe("recipient email"),
        customerName: z.string().optional().describe("name shown under 'Bill to'"),
        customerSubtitle: z.string().optional().describe("second line under the name, e.g. 'RooleTask project'"),
        lines: z.array(z.object({
          label: z.string().min(1),
          caption: z.string().optional().describe("small muted line under the label"),
          qty: z.number().positive().optional().describe("how many units - omit for a single-amount line"),
          unitPrice: z.number().optional().describe("price of ONE unit; required when qty is set"),
          amount: z.number().optional().describe("line total; omit when qty + unitPrice are given (they get multiplied)"),
          currency: z.enum(["USD", "EGP", "EUR"]),
          details: z.array(z.object({
            date: z.string().describe("short date chip, e.g. '2 Jul'"),
            text: z.string(),
          })).optional().describe("dated sub-entries nested under this line item"),
        })).min(1).describe("the receipt's line items, in order"),
        workLogTitle: z.string().optional().describe("heading for a standalone work-log section"),
        workLog: z.array(z.object({ date: z.string(), text: z.string() })).optional()
          .describe("standalone dated entries above the items (use `details` instead to nest them under a line)"),
        subject: z.string().optional().describe("email subject; defaults to 'Receipt from Revil'"),
        date: z.string().optional().describe("issue date YYYY-MM-DD; defaults today"),
        note: z.string().optional().describe("optional note printed above the footer"),
        grandTotalCurrency: z.enum(["USD", "EGP", "EUR"]).optional()
          .describe("if set, append ONE emphasized grand total: every line converted into this currency at current rates (in addition to the per-currency totals)"),
        projectIds: z.array(z.string()).optional().describe("treasury project ids, recorded in the receipt history"),
      },
      annotations: { destructiveHint: false },
    },
    async (a) => {
      const to = a.to.trim();
      // Issue date defaults to the server's own current local date (never a client guess).
      const dateStr = a.date || time.date;
      const dt = new Date(`${dateStr}T00:00:00`);
      const valid = isNaN(dt.getTime()) ? new Date() : dt;
      const dateLabel = valid.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
      const receiptNo = revReceiptNumber(valid);

      // Resolve every line's total ONCE, so the four places that consume it below cannot
      // disagree: a line is either an explicit `amount`, or qty x unitPrice.
      const lines = a.lines.map((l) => ({
        ...l,
        amount: round2(l.amount ?? ((l.qty ?? 1) * (l.unitPrice ?? 0))),
      }));
      const badLine = lines.find((l) => !Number.isFinite(l.amount));
      if (badLine) return fail(`Line "${badLine.label}" needs either an amount, or both qty and unitPrice.`);

      // Grand total: one converted figure shown as an emphasized row UNDER the per-currency
      // totals. Appears automatically whenever the receipt mixes currencies (converted into
      // the treasury's base currency), or is forced/overridden by grandTotalCurrency.
      let grandTotal: { currency: string; amount: number; note?: string } | undefined;
      {
        const sdoc = await db().doc("Treasury/settings").get();
        const settings = (sdoc.data() || {}) as TreasurySettings;
        const rates = settings.rates || DEFAULT_RATES;
        const distinct = [...new Set(lines.map((l) => l.currency))];
        const baseCur = (typeof settings.defaultCurrency === "string" ? settings.defaultCurrency : "EGP");
        const gc = a.grandTotalCurrency || (distinct.length > 1 ? baseCur : undefined);
        if (gc) {
          const amount = round2(lines.reduce((s, l) => s + convert(l.amount || 0, l.currency, gc, rates), 0));
          const others = distinct.filter((c) => c !== gc);
          grandTotal = {
            currency: gc,
            amount,
            note: others.length
              ? `Grand total: ${others.join(", ")} converted to ${gc} at current rates.`
              : `Grand total in ${gc}.`,
          };
        }
      }

      const html = buildItemizedReceiptHtml({
        receiptNo,
        dateLabel,
        customerName: a.customerName,
        customerSubtitle: a.customerSubtitle,
        workLogTitle: a.workLogTitle,
        workLog: a.workLog,
        lines,
        grandTotal,
        note: a.note,
      });

      // Headline figure for the history log: the total of the first currency used.
      const headCur = lines[0].currency;
      const headTotal = round2(lines
        .filter((l) => l.currency === headCur)
        .reduce((s, l) => s + (l.amount || 0), 0));

      try {
        const transporter = createTransporter();
        const owner = smtpUser.value();
        await transporter.sendMail({
          from: `"Tem Revil" <${HELLO_EMAIL}>`,
          to,
          bcc: owner && owner.toLowerCase() !== to.toLowerCase() ? owner : undefined,
          replyTo: HELLO_EMAIL,
          subject: (a.subject || "Receipt from Revil").slice(0, 200),
          html,
        });
      } catch (err) {
        console.error("[mcp] send_itemized_receipt failed:", err);
        return fail("Failed to send the receipt email.");
      }

      try {
        const rid = `rcp_${now().toString(36)}${rand(3)}`;
        await db().doc("Treasury/receipts").set({
          entries: {
            [rid]: {
              receiptNo,
              to,
              sentAt: now(),
              currency: headCur,
              total: headTotal,
              projectIds: a.projectIds || [],
              projectNames: [],
              via: "mcp",
            },
          },
          lastWrite: SERVER_TIMESTAMP(),
        }, { merge: true });
      } catch (logErr) {
        console.error("[mcp] itemized receipt sent but history log failed:", logErr);
      }

      return ok({ status: "sent", to, receiptNo, lines: lines.length, headline: { currency: headCur, total: headTotal } });
    });

  server.registerTool("add_income",
    {
      title: "Add treasury income",
      description: "Log money received. Pass accountId to add it to an account, and monthlyPayment=true if it's a monthly retainer's payment (advances the project's next-due date). OMIT `date` to log it for today - the server stamps its own current date; only pass `date` to backdate a real past payment (do not compute 'today' yourself).",
      inputSchema: {
        amount: z.number(),
        currency: z.enum(["USD", "EGP", "EUR"]),
        date: z.string().optional().describe("YYYY-MM-DD - OMIT for today (server-stamped). Pass only to backdate a past entry; a future date is rejected."),
        note: z.string().optional(),
        projectId: z.string().optional().describe("link to a treasury project id"),
        accountId: z.string().optional().describe("account it landed IN (see list_accounts)"),
        monthlyPayment: z.boolean().optional().describe("true if this IS a monthly retainer's payment"),
      },
      annotations: { destructiveHint: false },
    },
    async (a) => {
      const d = resolveEntryDate(a.date);
      if (d.error) return fail(d.error);
      const id = `inc_${rand(6)}`;
      const date = d.date as string;
      const entry = {
        amount: a.amount, currency: a.currency, date, createdAt: now(),
        ...(a.note ? { note: a.note } : {}),
        ...(a.projectId ? { projectId: a.projectId } : {}),
        ...(a.accountId ? { accountId: a.accountId } : {}),
        ...(a.monthlyPayment ? { monthlyPayment: true } : {}),
      };
      await db().doc("Treasury/income").set({ entries: { [id]: entry }, lastWrite: SERVER_TIMESTAMP() }, { merge: true });

      // A confirmed monthly payment advances the linked retainer's schedule.
      let nextPaymentDate: string | undefined;
      if (a.monthlyPayment && a.projectId) {
        const pdoc = await db().doc("Treasury/projects").get();
        const proj = pdoc.exists ? (pdoc.data()?.entries || {})[a.projectId] : null;
        if (proj && proj.monthly) {
          nextPaymentDate = nextMonthlyDate(proj, date);
          await db().doc("Treasury/projects").set(
            { entries: { [a.projectId]: { nextPaymentDate } }, lastWrite: SERVER_TIMESTAMP() },
            { merge: true },
          );
        }
      }
      return ok({ status: "added", id, date, serverDate: time.date, ...(nextPaymentDate ? { nextPaymentDate } : {}) });
    });

  server.registerTool("update_income",
    {
      title: "Update treasury income",
      description: "Change fields on an existing income entry by id (e.g. link an account, fix the amount/date). Only the fields you pass change. Find ids via treasury_overview.",
      inputSchema: {
        id: z.string().min(1).describe("income id (see treasury_overview)"),
        amount: z.number().optional(),
        currency: z.enum(["USD", "EGP", "EUR"]).optional(),
        date: z.string().optional().describe("YYYY-MM-DD - a future date is rejected. Leave out to keep the existing date."),
        note: z.string().optional(),
        projectId: z.string().optional(),
        accountId: z.string().optional().describe("account it landed IN (see list_accounts)"),
        monthlyPayment: z.boolean().optional(),
      },
      annotations: { destructiveHint: false },
    },
    async (a) => {
      const snap = await db().doc("Treasury/income").get();
      const existing = snap.exists ? (snap.data()?.entries || {})[a.id] : null;
      if (!existing) return fail(`No income with id ${a.id}. Use treasury_overview to find the right id.`);
      if (a.date !== undefined) {
        const d = resolveEntryDate(a.date);
        if (d.error) return fail(d.error);
      }
      const src = a as Record<string, unknown>;
      const patch: Record<string, unknown> = {};
      for (const k of ["amount", "currency", "date", "note", "projectId", "accountId", "monthlyPayment"]) {
        if (src[k] !== undefined) patch[k] = src[k];
      }
      if (!Object.keys(patch).length) return fail("Nothing to update - pass at least one field to change.");
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
async function handleMcp(req: Request, res: Response): Promise<void> {
  const base = baseUrl();
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

  const { McpServer: McpServerCtor } = await import("@modelcontextprotocol/sdk/server/mcp.js");
  const { StreamableHTTPServerTransport } = await import("@modelcontextprotocol/sdk/server/streamableHttp.js");

  // Live clock (in the admin's configured timezone) + prompt rules, handed to the
  // LLM via the MCP `initialize` instructions field on every connect.
  const time = formatLocal(await timezoneOffset());
  const server = new McpServerCtor(
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
  registerTools(server, cfg, time, { sub: tokenInfo.sub, iat: tokenInfo.iat });

  const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
  res.on("close", () => { transport.close(); server.close(); });
  await server.connect(transport);
  await transport.handleRequest(req, res, req.body);
}

// ── Router ─────────────────────────────────────────────────────────
export const mcp = onRequest(
  {
    region: "us-central1",
    cors: false,
    maxInstances: 10,
    secrets: [smtpUser, resendKey, meetingSyncUrl],
  },
  async (req, res) => {
    try {
      const p = req.path || "/";
      if (p.endsWith("/.well-known/oauth-protected-resource")) return protectedResourceMetadata(req, res);
      if (p.endsWith("/.well-known/oauth-authorization-server") || p.endsWith("/.well-known/openid-configuration")) return authServerMetadata(req, res);
      if (p.endsWith("/register")) return register(req, res);
      if (p.endsWith("/authorize")) return authorize(req, res);
      if (p.endsWith("/oauth/firebase/callback")) {
        if (req.method === "OPTIONS") { setCors(req, res); res.status(204).send(""); return; }
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
