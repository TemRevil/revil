/**
 * The MCP writes that must be all-or-nothing, as transactions: a booking is checked
 * against the stored meetings and written in one step, and a payment is recorded and
 * its retainer's next-due date advanced in one step, at most once per request.
 */
import type { Firestore } from "firebase-admin/firestore";
import { nextMonthlyPaymentDate } from "./money";
import { bookingClash } from "./mcpRules";
import { sha256url } from "./mcpGrants";
import type { BookedSlot } from "./booking";

/**
 * Write (or patch) one meeting in Settings/Canary, refusing it when its start collides
 * with another stored meeting. `startMs` is null when the slot is not changing, so a
 * name or link edit never trips over an old overlap. `isNew` false means the meeting
 * must already exist.
 */
export async function saveMeeting(
  db: Firestore,
  m: { id: string; patch: Record<string, unknown>; startMs: number | null; hostOffset: number; isNew: boolean; stamp: unknown },
): Promise<"saved" | "clash" | "missing"> {
  const ref = db.doc("Settings/Canary");
  return db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const meetings = ((snap.data() || {}).Meetings || {}) as Record<string, BookedSlot>;
    if (!m.isNew && !meetings[m.id]) return "missing";
    if (m.startMs !== null && bookingClash(m.startMs, m.hostOffset, meetings, m.id)) return "clash";
    tx.set(ref, { Meetings: { [m.id]: m.patch }, lastMeetingWrite: m.stamp }, { merge: true });
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
  r: { id: string; entry: Record<string, unknown> & { date: string }; monthlyProjectId?: string; stamp: unknown },
): Promise<{ duplicate: boolean; nextPaymentDate?: string }> {
  const incomeRef = db.doc("Treasury/income");
  const projectsRef = db.doc("Treasury/projects");
  return db.runTransaction(async (tx) => {
    const [inc, projects] = await Promise.all([
      tx.get(incomeRef),
      r.monthlyProjectId ? tx.get(projectsRef) : Promise.resolve(null),
    ]);
    if ((inc.data()?.entries || {})[r.id]) return { duplicate: true };
    tx.set(incomeRef, { entries: { [r.id]: r.entry }, lastWrite: r.stamp }, { merge: true });
    const proj = r.monthlyProjectId ? (projects?.data()?.entries || {})[r.monthlyProjectId] : null;
    if (!proj || !proj.monthly) return { duplicate: false };
    const nextPaymentDate = nextMonthlyPaymentDate(proj, r.entry.date);
    tx.set(projectsRef, { entries: { [r.monthlyProjectId as string]: { nextPaymentDate } }, lastWrite: r.stamp }, { merge: true });
    return { duplicate: false, nextPaymentDate };
  });
}
