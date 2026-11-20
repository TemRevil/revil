/**
 * The owner's Google Calendar connection, made from the dashboard (Settings > Calendar)
 * with the owner's own Google sign-in, and the access tokens ./googleCalendar uses.
 *
 * Connecting is an OAuth authorization-code flow run by the server:
 *   1. the admin-only `googleCalendar` callable ("connect") starts it: a one-use state,
 *      tied to the admin and expiring in 10 minutes, and a PKCE verifier are stored,
 *      and the browser is sent to Google's consent page in the same tab;
 *   2. Google sends the browser back to `calendarOAuth` with a code; the state is
 *      used up, the code is exchanged (with the client secret and the verifier), the
 *      grant must carry both calendar permissions, and the refresh token is stored
 *      ENCRYPTED (AES-256-GCM, key in Secret Manager) in Integrations/GoogleCalendar,
 *      which no client may read (firestore.rules);
 *   3. the browser lands back on the dashboard.
 * Only the permissions to manage events and read busy times are asked for: never to
 * read event details, other calendars' contents or anything else.
 *
 * When Google stops honouring the token (revoked, password change), the connection is
 * marked broken: bookings that need the calendar stop, and the owner is told (by the
 * scheduled busy-time refresh in index.ts) to reconnect. Tokens are never logged.
 */
import { onCall, onRequest, HttpsError } from "firebase-functions/v2/https";
import { defineSecret } from "firebase-functions/params";
import { getFirestore } from "firebase-admin/firestore";
import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { calendarApi } from "./googleCalendar";
import { SITE_URL } from "./emailShell";

export const googleOAuthSecret = defineSecret("GOOGLE_OAUTH_CLIENT_SECRET");
export const calendarTokenKey = defineSecret("CALENDAR_TOKEN_KEY");
/** Every function that talks to the calendar declares these. */
export const CALENDAR_SECRETS = [googleOAuthSecret, calendarTokenKey];

export const CALENDAR_SCOPES = [
  "openid",
  "email",
  "https://www.googleapis.com/auth/calendar.events",
  "https://www.googleapis.com/auth/calendar.freebusy",
];
const NEEDED = CALENDAR_SCOPES.filter((s) => s.startsWith("https://"));

export const CONNECTION = "Integrations/GoogleCalendar";
const STATES = `${CONNECTION}/States`;
const STATE_TTL_MS = 10 * 60_000;
const TOKEN_URL = "https://oauth2.googleapis.com/token";
const REVOKE_URL = "https://oauth2.googleapis.com/revoke";
const TIMEOUT_MS = 15_000;

const db = () => getFirestore();
const clientId = () => (process.env.GOOGLE_OAUTH_CLIENT_ID || "").trim();
const redirectUri = () => (process.env.CALENDAR_OAUTH_REDIRECT || "").trim();
const b64url = (b: Buffer) => b.toString("base64url");
const sha256 = (s: string) => createHash("sha256").update(s).digest();

// ── Token sealing ────────────────────────────────────────────────────

function keyOf(base64Key: string): Buffer {
  const key = Buffer.from(base64Key.trim(), "base64");
  if (key.length !== 32) throw new Error("CALENDAR_TOKEN_KEY must be 32 bytes, base64");
  return key;
}

/** Encrypt a refresh token for storage: "v1." + base64url(iv | tag | ciphertext). */
export function sealToken(token: string, base64Key: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", keyOf(base64Key), iv);
  const data = Buffer.concat([cipher.update(token, "utf8"), cipher.final()]);
  return "v1." + b64url(Buffer.concat([iv, cipher.getAuthTag(), data]));
}

/** Decrypt a stored token. Throws on a wrong key or any change to the stored value. */
export function openToken(sealed: string, base64Key: string): string {
  if (!sealed.startsWith("v1.")) throw new Error("Unknown token format");
  const raw = Buffer.from(sealed.slice(3), "base64url");
  const decipher = createDecipheriv("aes-256-gcm", keyOf(base64Key), raw.subarray(0, 12));
  decipher.setAuthTag(raw.subarray(12, 28));
  return Buffer.concat([decipher.update(raw.subarray(28)), decipher.final()]).toString("utf8");
}

// ── The consent round trip ───────────────────────────────────────────

export function authUrl(o: { clientId: string; redirectUri: string; state: string; challenge: string }): string {
  const u = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  u.search = new URLSearchParams({
    client_id: o.clientId,
    redirect_uri: o.redirectUri,
    response_type: "code",
    scope: CALENDAR_SCOPES.join(" "),
    access_type: "offline",
    // Always show consent, so Google always returns a refresh token.
    prompt: "consent",
    state: o.state,
    code_challenge: o.challenge,
    code_challenge_method: "S256",
  }).toString();
  return u.toString();
}

/** A stored state that may still finish a connection. */
export function stateUsable(s: Record<string, unknown> | undefined, nowMs: number): boolean {
  return !!s && typeof s.uid === "string" && !!s.uid && typeof s.verifier === "string" && !!s.verifier
    && typeof s.expiresAt === "number" && s.expiresAt > nowMs;
}

/**
 * What a token-endpoint answer grants: the refresh token and the Google account it is
 * for. The id_token came straight from Google over TLS, so its claims are read as is.
 */
export function readGrant(j: Record<string, unknown>): { refreshToken: string; account: string } {
  const granted = new Set(String(j.scope || "").split(/\s+/));
  if (!NEEDED.every((s) => granted.has(s))) {
    throw new Error("Both calendar permissions are needed - tick them on Google's consent screen.");
  }
  if (typeof j.refresh_token !== "string" || !j.refresh_token) throw new Error("Google sent no refresh token.");
  let claims: Record<string, unknown> = {};
  try {
    claims = JSON.parse(Buffer.from(String(j.id_token || "").split(".")[1] || "", "base64url").toString("utf8"));
  } catch { /* checked below */ }
  if (typeof claims.email !== "string" || claims.email_verified !== true) throw new Error("Google sent no verified account.");
  return { refreshToken: j.refresh_token, account: claims.email.toLowerCase() };
}

async function postForm(url: string, form: Record<string, string>): Promise<{ status: number; body: Record<string, unknown> }> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(form).toString(),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  const body = await res.json().catch(() => ({}));
  return { status: res.status, body: body && typeof body === "object" ? body as Record<string, unknown> : {} };
}

async function revoke(token: string): Promise<void> {
  try {
    await postForm(REVOKE_URL, { token });
  } catch {
    console.warn("calendar: revoking the old token did not answer");
  }
}

// ── Access tokens ────────────────────────────────────────────────────

interface Connection {
  refresh?: string;
  account?: string;
  connectedAt?: number;
  brokenAt?: number;
  brokenAlertedAt?: number;
}

/** The access token this instance holds, for the connection it was made from. */
let cached: { token: string; expiresAt: number; connectedAt: number } | null = null;

/** A current access token for the owner's calendar. Throws when it isn't connected. */
export async function calendarToken(): Promise<string> {
  const ref = db().doc(CONNECTION);
  const c = (await ref.get()).data() as Connection | undefined;
  if (!c?.refresh || !c.connectedAt || c.brokenAt) throw new Error("Google Calendar is not connected");
  if (cached && cached.connectedAt === c.connectedAt && cached.expiresAt > Date.now() + 60_000) return cached.token;

  const r = await postForm(TOKEN_URL, {
    client_id: clientId(),
    client_secret: googleOAuthSecret.value().trim(),
    refresh_token: openToken(c.refresh, calendarTokenKey.value()),
    grant_type: "refresh_token",
  });
  if (r.status === 400 && r.body.error === "invalid_grant") {
    // Revoked or expired: only a new consent fixes it, so stop trying and say so.
    cached = null;
    await db().runTransaction(async (tx) => {
      const now = (await tx.get(ref)).data() as Connection | undefined;
      if (now && now.connectedAt === c.connectedAt && !now.brokenAt) tx.update(ref, { brokenAt: Date.now() });
    });
    console.error("calendar: Google no longer accepts the calendar connection");
    throw new Error("Google Calendar needs reconnecting");
  }
  if (r.status !== 200 || typeof r.body.access_token !== "string") {
    throw new Error(`Google Calendar token refresh failed (${r.status})`);
  }
  const ttl = typeof r.body.expires_in === "number" ? r.body.expires_in * 1000 : 3_000_000;
  cached = { token: r.body.access_token, expiresAt: Date.now() + ttl, connectedAt: c.connectedAt };
  return cached.token;
}

/** The owner's calendar, through the stored connection. */
export const ownerCalendar = () => calendarApi({ token: calendarToken });

export interface CalendarStatus {
  connected: boolean;
  account: string | null;
  connectedAt: number | null;
  /** Google stopped honouring the connection: reconnect. */
  broken: boolean;
}

export async function calendarStatus(): Promise<CalendarStatus> {
  const c = (await db().doc(CONNECTION).get()).data() as Connection | undefined;
  const connected = !!c?.refresh && !!c.connectedAt;
  return {
    connected,
    account: connected ? c?.account ?? null : null,
    connectedAt: connected ? c?.connectedAt ?? null : null,
    broken: connected && !!c?.brokenAt,
  };
}

/** Claims the one "reconnect" alert for a broken connection: true the first time only. */
export async function markBrokenAlerted(): Promise<boolean> {
  const ref = db().doc(CONNECTION);
  return db().runTransaction(async (tx) => {
    const c = (await tx.get(ref)).data() as Connection | undefined;
    if (!c?.brokenAt || c.brokenAlertedAt) return false;
    tx.update(ref, { brokenAlertedAt: Date.now() });
    return true;
  });
}

/** Whether bookings can make events right now (connected, and not broken). */
export async function calendarReady(): Promise<boolean> {
  const s = await calendarStatus();
  return s.connected && !s.broken;
}

// ── The dashboard's callable and Google's return address ─────────────

export const googleCalendar = onCall(
  { region: "us-central1", enforceAppCheck: true, secrets: CALENDAR_SECRETS, maxInstances: 5 },
  async (request) => {
    if (!request.auth) throw new HttpsError("unauthenticated", "Sign in required.");
    if (request.auth.token?.admin !== true) throw new HttpsError("permission-denied", "Admin only.");
    const action = (request.data as { action?: unknown } | undefined)?.action;

    if (action === "status") return calendarStatus();

    if (action === "connect") {
      if (!clientId() || !redirectUri()) throw new HttpsError("failed-precondition", "The Google OAuth client is not configured.");
      const state = b64url(randomBytes(32));
      const verifier = b64url(randomBytes(32));
      await db().collection(STATES).doc(b64url(sha256(state))).set({
        uid: request.auth.uid, verifier, expiresAt: Date.now() + STATE_TTL_MS,
      });
      return { url: authUrl({ clientId: clientId(), redirectUri: redirectUri(), state, challenge: b64url(sha256(verifier)) }) };
    }

    if (action === "disconnect") {
      const ref = db().doc(CONNECTION);
      const c = (await ref.get()).data() as Connection | undefined;
      await ref.delete();
      cached = null;
      if (c?.refresh) {
        try { await revoke(openToken(c.refresh, calendarTokenKey.value())); } catch { /* deleted either way */ }
      }
      return calendarStatus();
    }

    throw new HttpsError("invalid-argument", "Unknown calendar action.");
  },
);

/** Where the browser lands after Google: the dashboard, with how it went. */
const backTo = (outcome: string) => `${SITE_URL}/?calendar=${encodeURIComponent(outcome)}`;

export const calendarOAuth = onRequest(
  { region: "us-central1", cors: false, secrets: CALENDAR_SECRETS, maxInstances: 5 },
  async (req, res) => {
    // The code is in this URL: never cache it, never pass it on as a referrer.
    res.set("Cache-Control", "no-store");
    res.set("Referrer-Policy", "no-referrer");
    const finish = (outcome: string) => { res.redirect(303, backTo(outcome)); };
    if (req.method !== "GET") { res.status(405).send("Method not allowed"); return; }

    const state = typeof req.query.state === "string" ? req.query.state : "";
    const code = typeof req.query.code === "string" ? req.query.code : "";
    if (!state || state.length > 200) return finish("expired");

    // Use the state up whatever happens next, so a code can only ever finish once.
    const stateRef = db().collection(STATES).doc(b64url(sha256(state)));
    const saved = await db().runTransaction(async (tx) => {
      const s = (await tx.get(stateRef)).data();
      if (s) tx.delete(stateRef);
      return s;
    });
    if (!stateUsable(saved, Date.now())) return finish("expired");
    if (req.query.error || !code) return finish("denied");

    let grant: { refreshToken: string; account: string };
    try {
      const r = await postForm(TOKEN_URL, {
        code,
        client_id: clientId(),
        client_secret: googleOAuthSecret.value().trim(),
        redirect_uri: redirectUri(),
        grant_type: "authorization_code",
        code_verifier: String(saved!.verifier),
      });
      if (r.status !== 200) {
        console.error("calendar: the code exchange was refused", { status: r.status, error: String(r.body.error || "") });
        return finish("failed");
      }
      grant = readGrant(r.body);
    } catch (err) {
      const scopes = /permission/i.test((err as Error)?.message || "");
      console.error("calendar: connecting failed", { scopes });
      return finish(scopes ? "permissions" : "failed");
    }

    // A whole new record: a broken flag or an old alert never carries over. The old
    // token is NOT revoked: Google revokes the whole grant for this account and client,
    // which would take the token just received down with it.
    await db().doc(CONNECTION).set({
      refresh: sealToken(grant.refreshToken, calendarTokenKey.value()), account: grant.account, connectedAt: Date.now(),
    });
    cached = null;
    console.log("calendar: connected");
    finish("connected");
  },
);
