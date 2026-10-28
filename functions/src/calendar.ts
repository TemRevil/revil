/**
 * The Google Apps Script that owns the owner's calendar (create, update and cancel an
 * event with its Meet link). Used by the public bookMeeting and the admin syncMeeting.
 *
 * The script's URL is a credential (anyone holding it can edit the calendar), so it is
 * never logged, and neither is a raw transport error, whose details can carry it.
 */

/** The longest a call may take; the Functions default timeout is 60s. */
export const CALENDAR_TIMEOUT_MS = 25_000;

export interface CalendarReply {
  /** The HTTP status, or 0 when no answer came (timeout, network). */
  httpStatus: number;
  /** The parsed JSON body, or null when it was not JSON. */
  body: unknown;
}

/** POST to the script. Never throws: a timeout or network failure is httpStatus 0. */
export async function callCalendar(url: string, payload: Record<string, unknown>, timeoutMs = CALENDAR_TIMEOUT_MS): Promise<CalendarReply> {
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(timeoutMs),
    });
    const text = await res.text().catch(() => "");
    let body: unknown = null;
    try { body = JSON.parse(text); } catch { body = null; }
    return { httpStatus: res.status, body };
  } catch (err) {
    console.error("Calendar script unreachable:", (err as Error)?.name || "error");
    return { httpStatus: 0, body: null };
  }
}

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);

/** A Meet link we are willing to send a guest to. */
export const MEET_LINK_RE = /^https:\/\/meet\.google\.com\/[a-z0-9-]+(\?[^\s"'<>]*)?$/i;
const EVENT_ID_RE = /^[A-Za-z0-9_@.-]{1,1024}$/;

export type CreateOutcome =
  /** The script says it created the event, with an id we can cancel by. */
  | { kind: "created"; id: string; link: string }
  /** The script handled the request and said no; nothing was created. */
  | { kind: "refused"; invalidEmail: boolean }
  /** Anything else: the event may or may not exist. */
  | { kind: "unknown" };

/**
 * What a create call really did. Only an explicit success with a usable event id counts
 * as a booking; a 200 carrying an HTML page, an empty object or a malformed link is not
 * proof of anything, and neither is a timeout (the event may have been made before it).
 */
export function readCreateReply(reply: CalendarReply): CreateOutcome {
  const b = isObj(reply.body) ? reply.body : null;
  if (b && b.status === "error") {
    return { kind: "refused", invalidEmail: /invalid attendee email/i.test(String(b.message || "")) };
  }
  if (reply.httpStatus < 200 || reply.httpStatus > 299 || !b || b.status !== "success") return { kind: "unknown" };
  if (typeof b.id !== "string" || !EVENT_ID_RE.test(b.id)) return { kind: "unknown" };
  const link = b.link === undefined || b.link === null ? "" : b.link;
  if (typeof link !== "string" || (link !== "" && !MEET_LINK_RE.test(link))) return { kind: "unknown" };
  return { kind: "created", id: b.id, link };
}

/** Whether an update/cancel call clearly succeeded. */
export function replySucceeded(reply: CalendarReply): boolean {
  return reply.httpStatus >= 200 && reply.httpStatus <= 299 && isObj(reply.body) && reply.body.status !== "error";
}
