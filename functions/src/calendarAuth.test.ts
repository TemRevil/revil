import { describe, expect, it } from "vitest";
import { randomBytes } from "node:crypto";
import { CALENDAR_SCOPES, authUrl, openToken, readGrant, sealToken, stateUsable } from "./calendarAuth";

const KEY = randomBytes(32).toString("base64");

/** An id_token as Google's token endpoint returns it (only the payload is read). */
const idToken = (claims: Record<string, unknown>) =>
  ["e30", Buffer.from(JSON.stringify(claims)).toString("base64url"), "sig"].join(".");

describe("sealToken / openToken", () => {
  it("round-trips, and never stores the token in the clear", () => {
    const sealed = sealToken("1//refresh-token", KEY);
    expect(sealed).not.toContain("refresh-token");
    expect(openToken(sealed, KEY)).toBe("1//refresh-token");
    expect(sealToken("1//refresh-token", KEY)).not.toBe(sealed);
  });

  it("refuses a tampered value or the wrong key", () => {
    const sealed = sealToken("1//refresh-token", KEY);
    const flipped = sealed.slice(0, -4) + (sealed.endsWith("AAAA") ? "BBBB" : "AAAA");
    expect(() => openToken(flipped, KEY)).toThrow();
    expect(() => openToken(sealed, randomBytes(32).toString("base64"))).toThrow();
  });

  it("refuses a key that isn't 32 bytes", () => {
    expect(() => sealToken("x", Buffer.from("short").toString("base64"))).toThrow();
  });
});

describe("authUrl", () => {
  it("asks for offline access to events and busy times only, with state and PKCE", () => {
    const u = new URL(authUrl({ clientId: "cid", redirectUri: "https://x.test/cb", state: "st", challenge: "ch" }));
    expect(u.origin + u.pathname).toBe("https://accounts.google.com/o/oauth2/v2/auth");
    const p = Object.fromEntries(u.searchParams);
    expect(p).toMatchObject({
      client_id: "cid", redirect_uri: "https://x.test/cb", response_type: "code", state: "st",
      access_type: "offline", prompt: "consent", code_challenge: "ch", code_challenge_method: "S256",
    });
    expect(p.scope.split(" ").sort()).toEqual([...CALENDAR_SCOPES].sort());
    expect(p.scope).not.toMatch(/auth\/calendar(\s|$)/);
  });
});

describe("stateUsable", () => {
  const now = 1_000_000;
  it("takes only an unexpired state started by an admin", () => {
    expect(stateUsable({ uid: "u1", expiresAt: now + 1, verifier: "v" }, now)).toBe(true);
    expect(stateUsable({ uid: "u1", expiresAt: now, verifier: "v" }, now)).toBe(false);
    expect(stateUsable({ expiresAt: now + 1, verifier: "v" }, now)).toBe(false);
    expect(stateUsable({ uid: "u1", expiresAt: now + 1 }, now)).toBe(false);
    expect(stateUsable(undefined, now)).toBe(false);
  });
});

describe("readGrant", () => {
  const scope = CALENDAR_SCOPES.join(" ");
  const good = { refresh_token: "1//r", access_token: "a", expires_in: 3599, scope, id_token: idToken({ email: "o@example.com", email_verified: true }) };

  it("keeps the refresh token and the verified account it belongs to", () => {
    expect(readGrant(good)).toEqual({ refreshToken: "1//r", account: "o@example.com" });
  });

  it("refuses a grant without the calendar permissions (unticked on the consent screen)", () => {
    expect(() => readGrant({ ...good, scope: "openid email" })).toThrow(/permission/i);
  });

  it("refuses a grant with no refresh token, or an unverified account", () => {
    expect(() => readGrant({ ...good, refresh_token: undefined })).toThrow();
    expect(() => readGrant({ ...good, id_token: idToken({ email: "o@example.com", email_verified: false }) })).toThrow();
  });
});
