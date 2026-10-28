import { describe, expect, it } from "vitest";
import { hashKey, holdActive, holdIds, nextHits, quota, recentHits } from "./limits.js";

const HOUR = 3_600_000;

describe("rate limits", () => {
  it("allows up to the limit inside the window, then refuses", () => {
    const q = { limit: 3, windowMs: HOUR };
    let hits: number[] | null = [];
    for (let i = 0; i < 3; i++) {
      hits = nextHits(hits, 1000 + i, q);
      expect(hits).not.toBeNull();
    }
    expect(nextHits(hits, 2000, q)).toBeNull();
  });

  it("forgets hits once the window has passed", () => {
    const q = { limit: 1, windowMs: HOUR };
    expect(nextHits([0], HOUR - 1, q)).toBeNull();
    expect(nextHits([0], HOUR, q)).toEqual([HOUR]);
  });

  it("is per key: one actor's hits never block another", () => {
    const a = quota("contact_ip", "1.2.3.4", 3, HOUR, "x");
    const b = quota("contact_ip", "5.6.7.8", 3, HOUR, "x");
    expect(a.id).not.toBe(b.id);
    expect(a.id.startsWith("contact_ip_")).toBe(true);
  });

  it("hashes keys so no raw IP or address is stored, ignoring case", () => {
    expect(hashKey("Sam@Example.com")).toBe(hashKey("sam@example.com "));
    expect(hashKey("1.2.3.4")).not.toContain("1.2.3.4");
  });

  it("drops junk and future-dated hits", () => {
    expect(recentHits(["x", null, 5, 10_000_000], 10, HOUR)).toEqual([5]);
    expect(recentHits("nope", 10, HOUR)).toEqual([]);
  });
});

describe("booking holds", () => {
  const Q = 15 * 60_000;
  it("covers every grid start a one-hour meeting would overlap, and no other", () => {
    const s = 1_800_000_000_000 - (1_800_000_000_000 % Q);
    expect(holdIds(s, HOUR, Q)).toEqual([-3, -2, -1, 0, 1, 2, 3].map((k) => `hold_${s + k * Q}`));
  });

  it("is in force only until it expires", () => {
    expect(holdActive({ expiresAt: new Date(2000) }, 1000)).toBe(true);
    expect(holdActive({ expiresAt: { toMillis: () => 500 } }, 1000)).toBe(false);
    expect(holdActive(undefined, 1000)).toBe(false);
  });
});