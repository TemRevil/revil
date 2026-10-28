/**
 * Per-actor rate limits for the public endpoints.
 *
 * Each limit is one small document, RateLimits/{kind}_{hash}, holding the times of the
 * recent hits from one visitor IP or one email address. There is no site-wide lock any
 * more: the old shared cooldown let one script sending a request every 30 seconds keep
 * every real visitor on "another message just came in". Keys are hashed, so no raw IP
 * or address is stored, and every document carries `expiresAt` so the daily cleanup
 * (or a Firestore TTL policy on that field) clears it once its window has passed.
 */
import { createHash } from "node:crypto";
import type { Firestore, Transaction, DocumentSnapshot } from "firebase-admin/firestore";

export interface Quota {
  /** The document id: `${kind}_${hash}`. */
  id: string;
  /** Hits allowed inside the window. */
  limit: number;
  windowMs: number;
  /** What the caller is told when the quota is used up. */
  message: string;
}

export const RATE_LIMITS = "RateLimits";

/** A short, stable, non-reversible key for an IP or an email address. */
export function hashKey(value: string): string {
  return createHash("sha256").update(value.trim().toLowerCase()).digest("hex").slice(0, 20);
}

export function quota(kind: string, value: string, limit: number, windowMs: number, message: string): Quota {
  return { id: `${kind}_${hashKey(value)}`, limit, windowMs, message };
}

/** The hits still inside the window, oldest first. Anything malformed is dropped. */
export function recentHits(hits: unknown, now: number, windowMs: number): number[] {
  return (Array.isArray(hits) ? hits : [])
    .filter((t): t is number => typeof t === "number" && Number.isFinite(t) && now - t < windowMs && t <= now)
    .sort((a, b) => a - b);
}

/** The hit list with `now` added, or null when the quota is already used up. */
export function nextHits(hits: unknown, now: number, q: Pick<Quota, "limit" | "windowMs">): number[] | null {
  const kept = recentHits(hits, now, q.windowMs);
  return kept.length >= q.limit ? null : [...kept, now];
}

/** Read every quota's document inside a transaction (all reads must come before writes). */
export function readQuotas(tx: Transaction, db: Firestore, quotas: Quota[]): Promise<DocumentSnapshot[]> {
  return Promise.all(quotas.map((q) => tx.get(db.collection(RATE_LIMITS).doc(q.id))));
}

/**
 * Take one hit from every quota, or none: returns the first quota that is used up
 * (nothing is written then), or null after queueing the writes on the transaction.
 */
export function takeQuotas(tx: Transaction, db: Firestore, quotas: Quota[], snaps: DocumentSnapshot[], now: number): Quota | null {
  const next: number[][] = [];
  for (let i = 0; i < quotas.length; i++) {
    const hits = nextHits(snaps[i]?.data()?.hits, now, quotas[i]);
    if (!hits) return quotas[i];
    next.push(hits);
  }
  quotas.forEach((q, i) => {
    tx.set(db.collection(RATE_LIMITS).doc(q.id), { hits: next[i], expiresAt: new Date(now + q.windowMs) });
  });
  return null;
}

/** Give a hit back (a booking that did not happen), leaving any later hits alone. */
export async function refundQuotas(db: Firestore, quotas: Quota[], stamp: number): Promise<void> {
  if (!quotas.length) return;
  try {
    await db.runTransaction(async (tx) => {
      const snaps = await readQuotas(tx, db, quotas);
      for (const snap of snaps) {
        const stored = snap.data()?.hits;
        const hits: unknown[] = Array.isArray(stored) ? stored : [];
        const left = hits.filter((t) => t !== stamp);
        if (left.length !== hits.length) tx.set(snap.ref, { hits: left }, { merge: true });
      }
    });
  } catch (err) {
    console.error("Failed to refund a rate-limit hit:", (err as Error)?.message);
  }
}

/**
 * A booking in flight holds its start time while the Calendar call runs, so two
 * visitors can't both book overlapping times in the seconds before either is recorded
 * (there is no site-wide lock to serialise them any more). Bookings start on a fixed
 * grid, so the starts a one-hour meeting at `startMs` would overlap are the grid
 * points strictly less than an hour either side: these are the hold ids to check.
 */
export const HOLD_MS = 2 * 60_000;

export function holdIds(startMs: number, spanMs: number, gridMs: number): string[] {
  const ids: string[] = [];
  const first = startMs - Math.ceil(spanMs / gridMs - 1) * gridMs;
  for (let t = first; t < startMs + spanMs; t += gridMs) ids.push(`hold_${t}`);
  return ids;
}

/** Whether a hold document is still in force. */
export function holdActive(data: { expiresAt?: { toMillis?: () => number } | Date } | undefined, now: number): boolean {
  const at = data?.expiresAt;
  const ms = at instanceof Date ? at.getTime() : typeof at?.toMillis === "function" ? at.toMillis() : NaN;
  return Number.isFinite(ms) && ms > now;
}