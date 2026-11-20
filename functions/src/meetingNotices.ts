/**
 * Who hears about a meeting that was taken off the calendar. A deleted meeting is a
 * cancelled call only while it is still ahead: deleting one that already happened (or
 * was logged after the fact) is the owner tidying up, and nobody is told. The guest is
 * told only at an address that looks real, and not when their booking was already past
 * the acknowledgement limit (Ack false), which keeps the site from being used to send
 * mail to a stranger.
 */

/** An address worth sending a guest mail to. */
export const GUEST_EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export interface GoneMeeting {
  Name?: unknown;
  Email?: unknown;
  Ack?: boolean;
  /** When it would have started, or null when the stored time can't be read. */
  startMs: number | null;
}

export function cancelNotices(m: GoneMeeting, nowMs: number): { owner: boolean; guest: string | null } {
  const ahead = !!m.Name && m.startMs !== null && m.startMs > nowMs;
  if (!ahead) return { owner: false, guest: null };
  const email = typeof m.Email === "string" ? m.Email.trim() : "";
  return { owner: true, guest: m.Ack !== false && GUEST_EMAIL_RE.test(email) ? email : null };
}
