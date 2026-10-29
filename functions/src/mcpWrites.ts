/**
 * The MCP writes that must be all-or-nothing, as transactions: a booking is checked
 * against the stored meetings and written in one step, and a payment is recorded and
 * its retainer's next-due date advanced in one step, at most once per request.
 */
import type { Firestore } from "firebase-admin/firestore";
import { nextMonthlyPaymentDate } from "./money";
import { sha256url } from "./mcpGrants";
import { MEETING_MS, isTaken, isoInstant, type BookedSlot } from "./booking";
import { COLLECTIONS } from "./collections";

/**
 * Write (or patch) one meeting document, refusing it when its start collides with
 * another stored meeting. `startMs` is null when the slot is not changing, so a name
 * or link edit never trips over an old overlap. `isNew` false means the meeting must
 * already exist.
 *
 * The overlap check reads every meeting starting within one meeting length either
 * side of the new start, inside the transaction: a booking written into that range
 * by anyone else before this commits makes the transaction retry and see it.
 */
export async function saveMeeting(
  db: Firestore,
  m: { id: string; patch: Record<string, unknown>; startMs: number | null; isNew: boolean },
): Promise<"saved" | "clash" | "missing"> {
  const col = db.collection(COLLECTIONS.meetings);
  const ref = col.doc(m.id);
  return db.runTransaction(async (tx) => {
    const [cur, near] = await Promise.all([
      tx.get(ref),
      m.startMs === null
        ? Promise.resolve(null)
        : tx.get(col.where("start", ">", isoInstant(m.startMs - MEETING_MS)).where("start", "<", isoInstant(m.startMs + MEETING_MS))),
    ]);
    if (!m.isNew && !cur.exists) return "missing";
    if (m.startMs !== null && near) {
      const others = near.docs.filter((d) => d.id !== m.id).map((d) => d.data() as BookedSlot);
      if (isTaken(m.startMs, others)) return "clash";
    }
    tx.set(ref, m.patch, { merge: true });
    return "saved";
  });
}

/**
 * The income entry id for one payment request. The same key always gives the same
 * id, which is what makes a retried add_income land on the entry it already wrote.
 */
export const incomeEntryId = (key: string): string => `inc_${sha256url(key).slice(0, 22)}`;

/**
 * Record a payment and, when it is a monthly retainer's payment, advance that
 * project's next-due date from the value read in the same transaction. If an entry
 * with this id already exists nothing is written and the call reports a duplicate,
 * so a retry neither records the money twice nor skips a month.
 */
export async function recordIncome(
  db: Firestore,
  r: { id: string; entry: Record<string, unknown> & { date: string }; monthlyProjectId?: string },
): Promise<{ duplicate: boolean; nextPaymentDate?: string }> {
  const incomeRef = db.collection(COLLECTIONS.treasuryIncome).doc(r.id);
  const projectRef = r.monthlyProjectId ? db.collection(COLLECTIONS.treasuryProjects).doc(r.monthlyProjectId) : null;
  return db.runTransaction(async (tx) => {
    const [inc, project] = await Promise.all([
      tx.get(incomeRef),
      projectRef ? tx.get(projectRef) : Promise.resolve(null),
    ]);
    if (inc.exists) return { duplicate: true };
    tx.create(incomeRef, r.entry);
    const proj = project?.exists ? project.data() : null;
    if (!projectRef || !proj || !proj.monthly) return { duplicate: false };
    const nextPaymentDate = nextMonthlyPaymentDate(proj, r.entry.date);
    tx.update(projectRef, { nextPaymentDate });
    return { duplicate: false, nextPaymentDate };
  });
}
