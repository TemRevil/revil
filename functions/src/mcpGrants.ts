/**
 * OAuth state for the MCP server: pending logins, approvals, authorization codes,
 * access and refresh tokens, all under the private `MCP` collection.
 *
 *  - Every secret we hand out is stored under its SHA-256, never in the clear: a
 *    leaked backup or a stray read of the collection yields nothing usable.
 *  - Codes and refresh tokens are redeemed inside a transaction, so one can be spent
 *    exactly once even when two requests race.
 *  - One authorization is a "grant": it keeps the client, the admin it was given to,
 *    the scope and the moment the owner started it (`authTime`) through every step.
 *    `authTime` is what the global revoke boundary is checked against, so nothing
 *    started before a revoke (a pending approval, an unspent code, a fresh token from
 *    an old refresh) survives it. A grant also has an absolute end, `grantExp`,
 *    however often it is refreshed.
 *  - Each refresh rechecks that the subject is still an active admin.
 *  - Every document carries `expiresAt` (a Timestamp), which cleanupMcp sweeps.
 */
import { createHash, randomBytes } from "crypto";
import { Timestamp, type DocumentReference, type Firestore, type Transaction } from "firebase-admin/firestore";

export const ACCESS_TTL_MS = 60 * 60 * 1000;               // 1 hour
export const REFRESH_TTL_MS = 30 * 24 * 60 * 60 * 1000;    // 30 days, renewed by each refresh...
export const GRANT_MAX_MS = 90 * 24 * 60 * 60 * 1000;      // ...but never past 90 days from the owner's approval
export const CODE_TTL_MS = 5 * 60 * 1000;                  // 5 minutes
export const LOGIN_TTL_MS = 10 * 60 * 1000;                // 10 minutes
export const APPROVAL_TTL_MS = 5 * 60 * 1000;              // 5 minutes - the consent step's own window
export const UNUSED_CLIENT_TTL_MS = 24 * 60 * 60 * 1000;   // a registered client that never connects
export const CLIENT_TTL_MS = 180 * 24 * 60 * 60 * 1000;    // a client in use, renewed on every token issued

export const rand = (n = 32): string => randomBytes(n).toString("base64url");
export const sha256url = (s: string): string => createHash("sha256").update(s).digest("base64url");
export const expiresAt = (ms: number): Timestamp => Timestamp.fromMillis(ms);

/** The kinds of secret-keyed documents. */
export type SecretKind = "login" | "approval" | "codes" | "tokens" | "refresh";

/** Where a secret's document lives: keyed by its hash, so the id never reveals it. */
export function secretPath(kind: SecretKind, secret: string): string {
  return `MCP/${kind}_${sha256url(secret)}`;
}

export const clientPath = (clientId: string): string => `MCP/clients_${clientId}`;

// ── Settings/MCP ──────────────────────────────────────────────────────
export interface McpCfg {
  enabled: boolean;
  writesEnabled: boolean;
  revokedBefore: number; // grants authorized before this ms are rejected
}

export function parseMcpConfig(d: Record<string, unknown> | undefined): McpCfg {
  const v = d || {};
  return {
    enabled: v.enabled !== false,
    writesEnabled: v.writesEnabled === true,
    revokedBefore: typeof v.revokedBefore === "number" ? v.revokedBefore : 0,
  };
}

/** Why a grant may not be used now, or null when it may. */
export function grantRefusal(cfg: McpCfg, authTime: number | undefined): string | null {
  if (!cfg.enabled) return "MCP is turned off in Settings.";
  // A record without authTime predates this field; reading it as 0 is the fail-closed choice.
  if ((authTime || 0) < cfg.revokedBefore) return "This authorization was revoked - connect again.";
  return null;
}

// ── records ───────────────────────────────────────────────────────────
/** What every step of one authorization carries along. */
export interface GrantBase {
  clientId: string;
  sub: string;
  scope: string;
  /** When the owner started this authorization (the /authorize request), ms. */
  authTime: number;
}
export interface LoginRec { clientId: string; redirectUri: string; codeChallenge: string; clientState: string; scope: string; resource: string; authTime: number; exp: number }
export interface ApprovalRec extends GrantBase { clientName: string; redirectUri: string; codeChallenge: string; clientState: string; resource: string; exp: number }
export interface CodeRec extends GrantBase { redirectUri: string; codeChallenge: string; resource: string; exp: number }
export interface TokenRec extends GrantBase { exp: number; iat: number; grantExp: number }
export interface RefreshRec extends GrantBase { exp: number; iat: number; grantExp: number; accessKey: string }

// ── one-time secrets ──────────────────────────────────────────────────

/** Mint a secret, store `rec` under its hash until `rec.exp`, and return the secret itself. */
export async function storeSecret(db: Firestore, kind: SecretKind, rec: { exp: number }, bytes = 24): Promise<string> {
  const secret = rand(bytes);
  await db.doc(secretPath(kind, secret)).set({ ...rec, expiresAt: expiresAt(rec.exp) });
  return secret;
}

/** Read and delete a one-time record in one transaction: two callers can never both get it. */
export async function consumeSecret<T>(db: Firestore, kind: SecretKind, secret: string): Promise<T | null> {
  const ref = db.doc(secretPath(kind, secret));
  return db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) return null;
    tx.delete(ref);
    return snap.data() as T;
  });
}

/** Shorthand for the code store, kept for symmetry with redeemAuthCode. */
export const storeCode = (db: Firestore, rec: CodeRec): Promise<string> => storeSecret(db, "codes", rec);

// ── tokens ────────────────────────────────────────────────────────────
export interface TokenResponse { access_token: string; token_type: "Bearer"; expires_in: number; refresh_token: string; scope: string }
export type TokenResult = { ok: true; body: TokenResponse } | { ok: false; error: string; description?: string };

export interface GrantDeps {
  now: () => number;
  /**
   * A FRESH check (no cache) that `sub` is still an enabled admin whose Firebase
   * sessions were not revoked after `authTime`.
   */
  stillAdmin: (sub: string, authTime: number) => Promise<boolean>;
}

const refuse = (description: string): TokenResult => ({ ok: false, error: "invalid_grant", description });

/**
 * Write a fresh access + refresh pair for a grant (inside the caller's transaction)
 * and keep the client registered while it is in use. Neither token outlives the grant.
 */
function writeTokenPair(db: Firestore, tx: Transaction, g: GrantBase, grantExp: number, now: number): TokenResponse {
  const access = rand(32);
  const refresh = rand(32);
  const accessExp = Math.min(now + ACCESS_TTL_MS, grantExp);
  const refreshExp = Math.min(now + REFRESH_TTL_MS, grantExp);
  const base: GrantBase = { clientId: g.clientId, sub: g.sub, scope: g.scope, authTime: g.authTime };
  const tokenRec: TokenRec = { ...base, exp: accessExp, iat: now, grantExp };
  const refreshRec: RefreshRec = { ...base, exp: refreshExp, iat: now, grantExp, accessKey: sha256url(access) };
  tx.set(db.doc(secretPath("tokens", access)), { ...tokenRec, expiresAt: expiresAt(accessExp) });
  tx.set(db.doc(secretPath("refresh", refresh)), { ...refreshRec, expiresAt: expiresAt(refreshExp) });
  tx.set(db.doc(clientPath(g.clientId)), { expiresAt: expiresAt(now + CLIENT_TTL_MS) }, { merge: true });
  return {
    access_token: access,
    token_type: "Bearer",
    expires_in: Math.max(1, Math.floor((accessExp - now) / 1000)),
    refresh_token: refresh,
    scope: g.scope,
  };
}

/**
 * authorization_code grant. The code is spent the moment it is read, whatever happens
 * next: a wrong verifier or client burns it (so it can't be guessed at), and two
 * racing requests get one set of tokens between them.
 */
export async function redeemAuthCode(
  db: Firestore,
  input: { code: string; clientId: string; redirectUri: string; codeVerifier: string },
  deps: GrantDeps,
): Promise<TokenResult> {
  const codeRef = db.doc(secretPath("codes", input.code));
  return db.runTransaction(async (tx) => {
    const snap = await tx.get(codeRef);
    if (!snap.exists) return refuse("unknown or already used code");
    const c = snap.data() as CodeRec;
    const clientRef = db.doc(clientPath(c.clientId));
    const [cfgSnap, clientSnap] = await Promise.all([tx.get(db.doc("Settings/MCP")), tx.get(clientRef)]);
    const now = deps.now();
    const verdict = await (async (): Promise<string | null> => {
      if (c.exp < now) return "code expired";
      if (c.clientId !== input.clientId) return "client mismatch";
      if (c.redirectUri !== input.redirectUri) return "redirect mismatch";
      if (sha256url(input.codeVerifier) !== c.codeChallenge) return "PKCE verification failed";
      if (!clientSnap.exists) return "client is no longer registered";
      const refusal = grantRefusal(parseMcpConfig(cfgSnap.data()), c.authTime);
      if (refusal) return refusal;
      if (!(await deps.stillAdmin(c.sub, c.authTime))) return "this account is no longer the portfolio admin";
      return null;
    })();
    tx.delete(codeRef);
    if (verdict) return refuse(verdict);
    return { ok: true, body: writeTokenPair(db, tx, c, c.authTime + GRANT_MAX_MS, now) };
  });
}

/**
 * refresh_token grant (rotating). The presented token and its paired access token
 * are retired in the same transaction that issues the new pair, so a refresh token
 * works once. It only works for the client it was issued to, only while the grant
 * is inside its absolute lifetime, and only while its subject is still the admin.
 */
export async function redeemRefreshToken(
  db: Firestore,
  input: { refreshToken: string; clientId: string },
  deps: GrantDeps,
): Promise<TokenResult> {
  const refreshRef = db.doc(secretPath("refresh", input.refreshToken));
  return db.runTransaction(async (tx) => {
    const snap = await tx.get(refreshRef);
    if (!snap.exists) return refuse("unknown or already used refresh token");
    const r = snap.data() as RefreshRec;
    const [cfgSnap, clientSnap] = await Promise.all([tx.get(db.doc("Settings/MCP")), tx.get(db.doc(clientPath(r.clientId)))]);
    const now = deps.now();
    const grantExp = typeof r.grantExp === "number" ? r.grantExp : 0;
    const verdict = await (async (): Promise<string | null> => {
      if (r.exp < now || grantExp < now) return "refresh expired - connect again";
      if (r.clientId !== input.clientId) return "client mismatch";
      if (!clientSnap.exists) return "client is no longer registered";
      const refusal = grantRefusal(parseMcpConfig(cfgSnap.data()), r.authTime);
      if (refusal) return refusal;
      if (!(await deps.stillAdmin(r.sub, r.authTime))) return "this account is no longer the portfolio admin";
      return null;
    })();
    tx.delete(refreshRef);
    if (typeof r.accessKey === "string" && r.accessKey) tx.delete(db.doc(`MCP/tokens_${r.accessKey}`));
    if (verdict) return refuse(verdict);
    return { ok: true, body: writeTokenPair(db, tx, r, grantExp, now) };
  });
}

/** The live record behind a bearer token, or null when it is unknown or expired. */
export async function lookupAccessToken(db: Firestore, token: string, now: number): Promise<TokenRec | null> {
  const snap = await db.doc(secretPath("tokens", token)).get();
  if (!snap.exists) return null;
  const t = snap.data() as TokenRec;
  if (!(t.exp >= now) || !(t.grantExp >= now)) return null;
  return t;
}

// ── is the subject still the admin? ───────────────────────────────────

/** The fields of a Firebase Auth user that decide MCP access. */
export interface AdminSubject {
  disabled?: boolean;
  customClaims?: Record<string, unknown>;
  tokensValidAfterTime?: string;
}

/**
 * Whether `user` may still hold a grant authorized at `authTime`: the account exists,
 * is enabled, carries the `admin` custom claim (the one signal every Firestore rule
 * checks), and its Firebase sessions were not revoked after the grant was made.
 */
export function isActiveAdmin(user: AdminSubject | null, authTime: number): boolean {
  if (!user || user.disabled) return false;
  if (user.customClaims?.admin !== true) return false;
  const after = user.tokensValidAfterTime ? Date.parse(user.tokensValidAfterTime) : NaN;
  if (Number.isFinite(after) && authTime < after) return false;
  return true;
}

/**
 * Admin checks with a short per-instance cache. `fresh` always asks Firebase Auth
 * (token issue and refresh); `cached` reuses an answer younger than `ttlMs` (every
 * MCP request), so a removed claim or disabled account stops access within minutes
 * without a lookup on every call.
 */
export function adminChecker(getUser: (uid: string) => Promise<AdminSubject | null>, ttlMs: number, now: () => number = Date.now) {
  const cache = new Map<string, { user: AdminSubject | null; at: number }>();
  const fresh = async (sub: string, authTime: number): Promise<boolean> => {
    const user = await getUser(sub);
    cache.set(sub, { user, at: now() });
    return isActiveAdmin(user, authTime);
  };
  const cached = async (sub: string, authTime: number): Promise<boolean> => {
    const hit = cache.get(sub);
    if (hit && now() - hit.at < ttlMs) return isActiveAdmin(hit.user, authTime);
    return fresh(sub, authTime);
  };
  return { fresh, cached };
}

// ── cleanup ───────────────────────────────────────────────────────────

/** How long a client registered before documents carried an expiry keeps working unused. */
const LEGACY_CLIENT_GRACE_MS = 30 * 24 * 60 * 60 * 1000;

const millisOf = (v: unknown): number | null =>
  v && typeof (v as { toMillis?: unknown }).toMillis === "function" ? (v as Timestamp).toMillis() : null;

/**
 * Delete every MCP document whose `expiresAt` has passed. Documents written before
 * the field existed are handled once: old logins, codes and tokens were keyed by the
 * raw secret and can no longer be looked up, so they go; an old client registration
 * gets an expiry instead, so a client still in use can reconnect and renew it.
 */
export async function sweepMcp(db: Firestore, now: number): Promise<{ deleted: number; stamped: number }> {
  const snap = await db.collection("MCP").select("expiresAt").get();
  let deleted = 0;
  let stamped = 0;
  let batch = db.batch();
  let pending = 0;
  for (const d of snap.docs) {
    const ms = millisOf(d.get("expiresAt"));
    if (ms === null && d.id.startsWith("clients_")) {
      batch.set(d.ref as DocumentReference, { expiresAt: expiresAt(now + LEGACY_CLIENT_GRACE_MS) }, { merge: true });
      stamped++;
    } else if (ms === null || ms <= now) {
      batch.delete(d.ref as DocumentReference);
      deleted++;
    } else {
      continue;
    }
    if (++pending >= 400) { await batch.commit(); batch = db.batch(); pending = 0; }
  }
  if (pending) await batch.commit();
  return { deleted, stamped };
}
