import { beforeEach, describe, expect, it } from "vitest";
import type { Firestore } from "firebase-admin/firestore";
import {
  GRANT_MAX_MS, REFRESH_TTL_MS, adminChecker, consumeSecret, expiresAt, isActiveAdmin, isConnectedClient, knownClient,
  lookupAccessToken, redeemAuthCode, redeemRefreshToken, sha256url, storeCode, storeSecret, sweepMcp, takeRateSlot,
  type AdminSubject, type CodeRec, type GrantDeps, type TokenResponse,
} from "./mcpGrants";
import { incomeEntryId, recordIncome, saveMeeting } from "./mcpWrites";

// ── A small in-memory Firestore with optimistic transactions ─────────
// Enough of the Admin SDK surface for the MCP code: doc get/set/delete/update,
// transactions that retry when a document they read changed before commit (as
// Firestore's do), batches and a collection scan. Every read yields to the event
// loop, so two "parallel" calls really interleave.

type Data = Record<string, unknown>;
const tick = () => new Promise<void>((r) => setImmediate(r));
const isPlain = (v: unknown): v is Data => !!v && typeof v === "object" && Object.getPrototypeOf(v) === Object.prototype;

/** Deep copy of plain objects and arrays; class instances (Timestamps) are kept as they are. */
function clone<T>(v: T): T {
  if (Array.isArray(v)) return v.map(clone) as T;
  if (isPlain(v)) return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, clone(x)])) as T;
  return v;
}

function deepMerge(base: Data, patch: Data): Data {
  const out: Data = { ...base };
  for (const [k, v] of Object.entries(patch)) {
    out[k] = isPlain(v) && isPlain(out[k]) ? deepMerge(out[k] as Data, v) : v;
  }
  return out;
}

class FakeSnap {
  constructor(readonly ref: FakeRef, private readonly value: Data | undefined) {}
  get exists() { return this.value !== undefined; }
  get id() { return this.ref.id; }
  data() { return this.value === undefined ? undefined : clone(this.value); }
  get(field: string) { return this.value?.[field]; }
}

class FakeRef {
  constructor(readonly db: FakeDb, readonly path: string) {}
  get id() { return this.path.split("/").pop() as string; }
  async get() { await tick(); return new FakeSnap(this, this.db.read(this.path)); }
  async set(data: Data, opts?: { merge?: boolean }) { await tick(); this.db.write(this.path, data, !!opts?.merge); }
  async update(data: Data) { await tick(); this.db.write(this.path, data, true); }
  async delete() { await tick(); this.db.remove(this.path); }
}

type Op = { kind: "set"; path: string; data: Data; merge: boolean } | { kind: "delete"; path: string };

class FakeTx {
  readonly reads = new Map<string, number>();
  readonly ops: Op[] = [];
  constructor(private readonly db: FakeDb) {}
  async get(ref: FakeRef) {
    await tick();
    this.reads.set(ref.path, this.db.version(ref.path));
    return new FakeSnap(ref, this.db.read(ref.path));
  }
  set(ref: FakeRef, data: Data, opts?: { merge?: boolean }) { this.ops.push({ kind: "set", path: ref.path, data, merge: !!opts?.merge }); return this; }
  update(ref: FakeRef, data: Data) { this.ops.push({ kind: "set", path: ref.path, data, merge: true }); return this; }
  delete(ref: FakeRef) { this.ops.push({ kind: "delete", path: ref.path }); return this; }
}

class FakeDb {
  private readonly docs = new Map<string, Data>();
  private readonly versions = new Map<string, number>();
  doc(path: string) { return new FakeRef(this, path); }
  read(path: string) { const d = this.docs.get(path); return d === undefined ? undefined : clone(d); }
  version(path: string) { return this.versions.get(path) || 0; }
  private bump(path: string) { this.versions.set(path, this.version(path) + 1); }
  write(path: string, data: Data, merge: boolean) {
    const prev = this.docs.get(path);
    this.docs.set(path, merge && prev ? deepMerge(prev, data) : { ...data });
    this.bump(path);
  }
  remove(path: string) { this.docs.delete(path); this.bump(path); }
  paths() { return [...this.docs.keys()]; }
  async runTransaction<T>(fn: (tx: FakeTx) => Promise<T>): Promise<T> {
    for (let attempt = 0; attempt < 5; attempt++) {
      const tx = new FakeTx(this);
      const out = await fn(tx);
      await tick();
      if ([...tx.reads].some(([p, v]) => this.version(p) !== v)) continue; // someone wrote what we read: retry
      for (const op of tx.ops) {
        if (op.kind === "set") this.write(op.path, op.data, op.merge);
        else this.remove(op.path);
      }
      return out;
    }
    throw new Error("transaction contention");
  }
  collection(name: string) {
    const scan = {
      select: () => scan,
      get: async () => {
        await tick();
        const docs = this.paths()
          .filter((p) => p.startsWith(`${name}/`) && p.split("/").length === 2)
          .map((p) => new FakeSnap(this.doc(p), this.read(p)));
        return { docs, size: docs.length, empty: docs.length === 0 };
      },
    };
    return scan;
  }
  batch() {
    const ops: Op[] = [];
    const b = {
      set: (ref: FakeRef, data: Data, opts?: { merge?: boolean }) => { ops.push({ kind: "set", path: ref.path, data, merge: !!opts?.merge }); return b; },
      update: (ref: FakeRef, data: Data) => { ops.push({ kind: "set", path: ref.path, data, merge: true }); return b; },
      delete: (ref: FakeRef) => { ops.push({ kind: "delete", path: ref.path }); return b; },
      commit: async () => {
        await tick();
        for (const op of ops) {
          if (op.kind === "set") this.write(op.path, op.data, op.merge);
          else this.remove(op.path);
        }
      },
    };
    return b;
  }
}

// ── fixtures ─────────────────────────────────────────────────────────
const T0 = Date.UTC(2026, 9, 27, 9, 0);
const CLIENT = "mcp_testclient000000001";
const REDIRECT = "https://client.example/callback";
const VERIFIER = "v".repeat(43);

let fake: FakeDb;
let db: Firestore;
let clock: number;
let admins: Set<string>;
const deps = (): GrantDeps => ({ now: () => clock, stillAdmin: async (sub) => admins.has(sub) });

function codeRec(over: Partial<CodeRec> = {}): CodeRec {
  return {
    clientId: CLIENT, redirectUri: REDIRECT, codeChallenge: sha256url(VERIFIER), resource: "https://mcp.example",
    scope: "mcp:read mcp:write", sub: "owner", authTime: T0, exp: T0 + 5 * 60 * 1000, ...over,
  };
}

async function connect(over: Partial<CodeRec> = {}): Promise<TokenResponse> {
  const code = await storeCode(db, codeRec(over));
  const r = await redeemAuthCode(db, { code, clientId: CLIENT, redirectUri: REDIRECT, codeVerifier: VERIFIER }, deps());
  if (!r.ok) throw new Error(`connect failed: ${r.error}`);
  return r.body;
}

beforeEach(async () => {
  fake = new FakeDb();
  db = fake as unknown as Firestore;
  clock = T0;
  admins = new Set(["owner"]);
  await fake.doc(`MCP/clients_${CLIENT}`).set({ client_id: CLIENT, redirect_uris: [REDIRECT], client_name: "Test client" });
  await fake.doc("Settings/MCP").set({ enabled: true, writesEnabled: true });
});

describe("token storage", () => {
  it("never stores an access or refresh token in the clear", async () => {
    const t = await connect();
    const everything = JSON.stringify(fake.paths().map((p) => [p, fake.read(p)]));
    expect(everything).not.toContain(t.access_token);
    expect(everything).not.toContain(t.refresh_token);
  });

  it("finds an access token by its hash", async () => {
    const t = await connect();
    const rec = await lookupAccessToken(db, t.access_token, clock);
    expect(rec?.sub).toBe("owner");
    expect(rec?.authTime).toBe(T0);
    expect(await lookupAccessToken(db, `${t.access_token}x`, clock)).toBeNull();
  });
});

describe("one-time redemption", () => {
  it("lets an authorization code be redeemed only once, even in parallel", async () => {
    const code = await storeCode(db, codeRec());
    const input = { code, clientId: CLIENT, redirectUri: REDIRECT, codeVerifier: VERIFIER };
    const results = await Promise.all([redeemAuthCode(db, input, deps()), redeemAuthCode(db, input, deps())]);
    expect(results.filter((r) => r.ok)).toHaveLength(1);
  });

  it("lets a refresh token be redeemed only once, even in parallel", async () => {
    const t = await connect();
    const input = { refreshToken: t.refresh_token, clientId: CLIENT };
    const results = await Promise.all([redeemRefreshToken(db, input, deps()), redeemRefreshToken(db, input, deps())]);
    expect(results.filter((r) => r.ok)).toHaveLength(1);
  });

  it("retires the old access token when a refresh token is used", async () => {
    const t = await connect();
    const r = await redeemRefreshToken(db, { refreshToken: t.refresh_token, clientId: CLIENT }, deps());
    expect(r.ok).toBe(true);
    expect(await lookupAccessToken(db, t.access_token, clock)).toBeNull();
  });
});

describe("refresh grant", () => {
  it("is bound to the client it was issued to", async () => {
    const t = await connect();
    const r = await redeemRefreshToken(db, { refreshToken: t.refresh_token, clientId: "mcp_someoneelse00000000" }, deps());
    expect(r.ok).toBe(false);
  });

  it("stops when the subject is no longer an admin", async () => {
    const t = await connect();
    admins.delete("owner");
    const r = await redeemRefreshToken(db, { refreshToken: t.refresh_token, clientId: CLIENT }, deps());
    expect(r.ok).toBe(false);
  });

  it("ends at the grant's absolute lifetime, however often it is refreshed", async () => {
    let t = await connect();
    // Refresh every 20 days: each refresh token alone would live 30 more days.
    for (let day = 20; day < 90; day += 20) {
      clock = T0 + day * 86_400_000;
      const r = await redeemRefreshToken(db, { refreshToken: t.refresh_token, clientId: CLIENT }, deps());
      expect(r.ok).toBe(true);
      if (r.ok) t = r.body;
    }
    // Issued on day 80: the new access token may not outlive the grant.
    const rec = await lookupAccessToken(db, t.access_token, clock);
    expect(rec).not.toBeNull();
    clock = T0 + GRANT_MAX_MS + 1;
    expect(clock - (T0 + 80 * 86_400_000)).toBeLessThan(REFRESH_TTL_MS);
    const late = await redeemRefreshToken(db, { refreshToken: t.refresh_token, clientId: CLIENT }, deps());
    expect(late.ok).toBe(false);
  });
});

describe("revocation boundary", () => {
  it("refuses a code from an authorization that started before the owner revoked", async () => {
    const code = await storeCode(db, codeRec({ authTime: T0 - 60_000 }));
    await fake.doc("Settings/MCP").set({ revokedBefore: T0 - 1000 }, { merge: true });
    const r = await redeemAuthCode(db, { code, clientId: CLIENT, redirectUri: REDIRECT, codeVerifier: VERIFIER }, deps());
    expect(r.ok).toBe(false);
  });

  it("refuses a refresh from a grant authorized before the revocation, even if its tokens are newer", async () => {
    const t = await connect({ authTime: T0 - 60_000 });
    await fake.doc("Settings/MCP").set({ revokedBefore: T0 - 1000 }, { merge: true });
    const r = await redeemRefreshToken(db, { refreshToken: t.refresh_token, clientId: CLIENT }, deps());
    expect(r.ok).toBe(false);
  });

  it("refuses new tokens while MCP is turned off", async () => {
    const code = await storeCode(db, codeRec());
    await fake.doc("Settings/MCP").set({ enabled: false }, { merge: true });
    const r = await redeemAuthCode(db, { code, clientId: CLIENT, redirectUri: REDIRECT, codeVerifier: VERIFIER }, deps());
    expect(r.ok).toBe(false);
  });
});

describe("open endpoints under anonymous load", () => {
  const LIMITS = { perIp: 10, windowMs: 3_600_000 };

  it("limits each caller on its own, so other callers can never use up the owner's slots", async () => {
    // A flood from a thousand addresses, each up to its own limit.
    for (let i = 0; i < 1000; i++) {
      for (let j = 0; j < LIMITS.perIp; j++) expect((await takeRateSlot(db, "register", `attacker${i}`, LIMITS, clock)).ok).toBe(true);
    }
    expect((await takeRateSlot(db, "register", "attacker0", LIMITS, clock)).ok).toBe(false);
    expect((await takeRateSlot(db, "register", "owner-ip", LIMITS, clock)).ok).toBe(true);
    // A caller's slots come back when its window has passed, and its record expires with it.
    clock += LIMITS.windowMs;
    expect((await takeRateSlot(db, "register", "attacker0", LIMITS, clock)).ok).toBe(true);
  });

  it("marks a client as known once the owner has connected it, and hands it back on re-registration", async () => {
    expect(await knownClient(db, [REDIRECT], "Test client", clock)).toBeNull();
    expect(isConnectedClient(fake.read(`MCP/clients_${CLIENT}`), clock)).toBe(false);
    await connect();
    expect(isConnectedClient(fake.read(`MCP/clients_${CLIENT}`), clock)).toBe(true);
    expect((await knownClient(db, [REDIRECT], "Test client", clock))?.client_id).toBe(CLIENT);
    // Different metadata is a different client, and goes through the normal limits.
    expect(await knownClient(db, [REDIRECT], "Another client", clock)).toBeNull();
    expect(await knownClient(db, ["https://evil.example/cb"], "Test client", clock)).toBeNull();
  });

  it("stops treating a client as known once its registration has expired", async () => {
    await connect();
    clock += 181 * 24 * 60 * 60 * 1000;
    expect(await knownClient(db, [REDIRECT], "Test client", clock)).toBeNull();
  });
});

describe("one-time secrets", () => {
  it("hands a login or approval to only one of two racing callers", async () => {
    const s = await storeSecret(db, "approval", { exp: T0 + 60_000 });
    const got = await Promise.all([consumeSecret(db, "approval", s), consumeSecret(db, "approval", s)]);
    expect(got.filter(Boolean)).toHaveLength(1);
  });
});

describe("admin check", () => {
  const admin: AdminSubject = { customClaims: { admin: true } };

  it("needs the admin claim, an enabled account and no later session revoke", () => {
    expect(isActiveAdmin(admin, T0)).toBe(true);
    expect(isActiveAdmin(null, T0)).toBe(false);                                 // deleted
    expect(isActiveAdmin({ ...admin, disabled: true }, T0)).toBe(false);         // disabled
    expect(isActiveAdmin({ customClaims: {} }, T0)).toBe(false);                 // claim removed
    expect(isActiveAdmin({ ...admin, tokensValidAfterTime: new Date(T0 + 5000).toUTCString() }, T0)).toBe(false);
    expect(isActiveAdmin({ ...admin, tokensValidAfterTime: new Date(T0 - 5000).toUTCString() }, T0)).toBe(true);
  });

  it("caches for a few minutes, then asks again", async () => {
    let now = T0;
    let user: AdminSubject | null = admin;
    let lookups = 0;
    const check = adminChecker(async () => { lookups++; return user; }, 5 * 60_000, () => now);
    expect(await check.cached("owner", T0)).toBe(true);
    user = null; // account deleted
    now += 60_000;
    expect(await check.cached("owner", T0)).toBe(true); // still inside the cache window
    now += 5 * 60_000;
    expect(await check.cached("owner", T0)).toBe(false);
    expect(await check.fresh("owner", T0)).toBe(false);
    expect(lookups).toBe(3);
  });
});

describe("cleanup", () => {
  it("deletes expired and pre-expiry records, keeps live ones, gives old clients a grace period", async () => {
    await fake.doc("MCP/tokens_live").set({ expiresAt: expiresAt(T0 + 1000) });
    await fake.doc("MCP/tokens_dead").set({ expiresAt: expiresAt(T0 - 1000) });
    await fake.doc("MCP/tokens_oldformat").set({ sub: "owner", exp: T0 + 1000 });
    await fake.doc("MCP/clients_mcp_old").set({ client_id: "mcp_old" });
    const r = await sweepMcp(db, T0);
    const left = fake.paths().filter((p) => p.startsWith("MCP/"));
    expect(left).toContain("MCP/tokens_live");
    expect(left).not.toContain("MCP/tokens_dead");
    expect(left).not.toContain("MCP/tokens_oldformat");
    expect(left).toContain("MCP/clients_mcp_old");
    expect(r.stamped).toBe(2); // the old client and the fixture client, both without expiresAt
    expect(fake.read("MCP/clients_mcp_old")?.expiresAt).toBeDefined();
  });
});

describe("bookings", () => {
  const HOST = 2; // UTC+02:00
  // 10:00 owner time on 2026-11-02 = 08:00 UTC
  const TEN = Date.UTC(2026, 10, 2, 8, 0);
  const meeting = { Name: "Guest", Date: "02/11/2026", Time: "10:00 AM" };

  it("refuses a second meeting in a taken slot, even when both are added at once", async () => {
    const add = (id: string) => saveMeeting(db, { id, patch: meeting, startMs: TEN, hostOffset: HOST, isNew: true, stamp: 1 });
    const results = await Promise.all([add("a"), add("b")]);
    expect(results.sort()).toEqual(["clash", "saved"]);
  });

  it("lets a booking be rescheduled onto its own slot, and refuses a missing one", async () => {
    await saveMeeting(db, { id: "a", patch: meeting, startMs: TEN, hostOffset: HOST, isNew: true, stamp: 1 });
    expect(await saveMeeting(db, { id: "a", patch: { Name: "Renamed" }, startMs: TEN, hostOffset: HOST, isNew: false, stamp: 2 })).toBe("saved");
    expect(await saveMeeting(db, { id: "zzz", patch: { Name: "x" }, startMs: null, hostOffset: HOST, isNew: false, stamp: 2 })).toBe("missing");
  });
});

describe("monthly payments", () => {
  beforeEach(async () => {
    await fake.doc("Treasury/projects").set({ entries: { p1: { name: "Retainer", monthly: true, nextPaymentDate: "2026-11-05" } } });
  });
  const pay = (key: string) => recordIncome(db, {
    id: incomeEntryId(key), entry: { amount: 100, currency: "USD", date: "2026-11-04", projectId: "p1", monthlyPayment: true },
    monthlyProjectId: "p1", stamp: 1,
  });

  it("records a retried payment once and advances the due date once", async () => {
    const first = await pay("req-1");
    const retry = await pay("req-1");
    expect(first).toEqual({ duplicate: false, nextPaymentDate: "2026-12-05" });
    expect(retry.duplicate).toBe(true);
    expect(Object.keys((fake.read("Treasury/income")?.entries || {}) as object)).toHaveLength(1);
    expect((fake.read("Treasury/projects")?.entries as Record<string, { nextPaymentDate: string }>).p1.nextPaymentDate).toBe("2026-12-05");
  });

  it("advances once per payment when two different payments land together", async () => {
    await Promise.all([pay("req-1"), pay("req-2")]);
    expect(Object.keys((fake.read("Treasury/income")?.entries || {}) as object)).toHaveLength(2);
    expect((fake.read("Treasury/projects")?.entries as Record<string, { nextPaymentDate: string }>).p1.nextPaymentDate).toBe("2027-01-05");
  });
});
