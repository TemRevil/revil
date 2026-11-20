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
import type { CreateOutcome } from "./googleCalendar";

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
      m.startMs === null ? Promise.resolve(null) : tx.get(nearby(db, m.startMs)),
    ]);
    if (!m.isNew && !cur.exists) return "missing";
    if (m.startMs !== null && near && collides(near.docs, m.id, m.startMs)) return "clash";
    tx.set(ref, m.patch, { merge: true });
    return "saved";
  });
}

/** Every meeting starting within one meeting length either side of `startMs`. */
const nearby = (db: Firestore, startMs: number) =>
  db.collection(COLLECTIONS.meetings)
    .where("start", ">", isoInstant(startMs - MEETING_MS))
    .where("start", "<", isoInstant(startMs + MEETING_MS));

const collides = (docs: { id: string; data(): unknown }[], selfId: string, startMs: number): boolean =>
  isTaken(startMs, docs.filter((d) => d.id !== selfId).map((d) => d.data() as BookedSlot));

/** The Google Calendar side of a booking: make its event (with a Meet link), or cancel one. */
export interface MeetingCalendar {
  create(): Promise<CreateOutcome>;
  /** By event id when there is one; without it, by the request the event was made for. True when confirmed. */
  cancel(eventId?: string): Promise<boolean>;
}

export type CalendarBooking =
  | { status: "saved"; eventId: string; link: string }
  | { status: "clash" }
  | { status: "refused"; invalidEmail: boolean }
  | { status: "unconfirmed"; cancelled: boolean };

/**
 * A new booking with its own Calendar event and Meet link, as the public booking form
 * makes one: the event first, then the booking, with the link and event id in it from
 * the first write (the guest's confirmation mail is sent from that write and carries
 * the link). A slot that is already taken never gets an event; one taken while the
 * event was being made gets its event cancelled. When the calendar refuses or does not
 * confirm, nothing is booked, and an unconfirmed event is cancelled.
 */
export async function bookWithCalendar(
  db: Firestore,
  m: { id: string; patch: Record<string, unknown>; startMs: number },
  calendar: MeetingCalendar,
): Promise<CalendarBooking> {
  const near = await nearby(db, m.startMs).get();
  if (collides(near.docs, m.id, m.startMs)) return { status: "clash" };

  const made = await calendar.create();
  if (made.kind === "refused") return { status: "refused", invalidEmail: made.invalidEmail };
  if (made.kind === "unknown") return { status: "unconfirmed", cancelled: await calendar.cancel() };

  const patch = { ...m.patch, GoogleEventId: made.id, ...(made.link ? { MeetingLink: made.link } : {}) };
  let saved: Awaited<ReturnType<typeof saveMeeting>>;
  try {
    saved = await saveMeeting(db, { id: m.id, patch, startMs: m.startMs, isNew: true });
  } catch (err) {
    await calendar.cancel(made.id);
    throw err;
  }
  if (saved !== "saved") {
    await calendar.cancel(made.id);
    return { status: "clash" };
  }
  return { status: "saved", eventId: made.id, link: made.link };
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
