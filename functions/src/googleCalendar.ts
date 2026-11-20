/**
 * The owner's Google Calendar, through the Calendar API with the owner's own OAuth
 * grant (./calendarAuth): make, move and cancel a booking's event with its Meet link,
 * and read when the owner is busy. Used by the public bookMeeting, the dashboard's
 * syncMeeting and the MCP booking tools.
 *
 * Every booking's event id is derived from the booking id (eventIdFor), so a retry
 * can't make a second event, and an event can always be cancelled by its exact id.
 * The guest is invited (sendUpdates=all) with their name only: a reason may be the
 * owner's own note, so it never goes into an invite.
 *
 * Nothing here throws into a caller except busy(), which must not report a calendar it
 * could not read as free. Event details and tokens are never logged.
 */
import { createHash } from "node:crypto";

/** A Meet link we are willing to send a guest to. */
export const MEET_LINK_RE = /^https:\/\/meet\.google\.com\/[a-z0-9-]+(\?[^\s"'<>]*)?$/i;
/** What the Calendar API accepts as an event id: base32hex, 5 to 1024 characters. */
const EVENT_ID_RE = /^[a-v0-9]{5,1024}$/;

const API = "https://www.googleapis.com/calendar/v3";
/** The longest one request may take; a booking can make a few in a row. */
export const CALENDAR_TIMEOUT_MS = 20_000;

export type CreateOutcome =
  /** The event exists, with an id we can cancel by. */
  | { kind: "created"; id: string; link: string }
  /** Google said no, or we never asked: nothing was created. */
  | { kind: "refused"; invalidEmail: boolean }
  /** No clear answer: the event may or may not exist. */
  | { kind: "unknown" };

/** How a change went: done, refused (nothing changed) or not confirmed either way. */
export type ChangeOutcome = "ok" | "refused" | "unknown";

export type Http = (url: string, init?: RequestInit) => Promise<Response>;

export interface CalendarDeps {
  /** A current access token. Throws when the calendar isn't connected. */
  token(): Promise<string>;
  http?: Http;
  sleep?: (ms: number) => Promise<void>;
}

export interface EventInput { name: string; email: string; startTime: string; endTime: string }

/** The event id for a booking: a hex digest, which is valid base32hex. */
export function eventIdFor(bookingId: string): string {
  return createHash("sha256").update(`revil-booking:${bookingId}`).digest("hex").slice(0, 40);
}

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => !!v && typeof v === "object" && !Array.isArray(v);
/** A value deep in a JSON reply, or undefined when any step of the path is missing. */
const at = (v: unknown, ...path: string[]): unknown => path.reduce<unknown>((o, k) => (isObj(o) ? o[k] : undefined), v);

/** The Meet link on an event, "" when it has none yet, null when it has one we won't send. */
function meetLink(ev: Obj): string | null {
  const points = at(ev, "conferenceData", "entryPoints");
  const video = Array.isArray(points) ? at(points.find((p) => at(p, "entryPointType") === "video"), "uri") : undefined;
  const link = ev.hangoutLink ?? video ?? "";
  if (typeof link !== "string") return null;
  return link === "" || MEET_LINK_RE.test(link) ? link : null;
}

const linkPending = (ev: Obj) => at(ev, "conferenceData", "createRequest", "status", "statusCode") === "pending";

function eventBody(e: EventInput): Record<string, unknown> {
  return {
    summary: `Call with ${e.name}`,
    description: "Booked through temrevil.com.",
    start: { dateTime: e.startTime },
    end: { dateTime: e.endTime },
    attendees: [{ email: e.email }],
  };
}

export function calendarApi(deps: CalendarDeps) {
  const http: Http = deps.http ?? ((url, init) => fetch(url, init));
  const sleep = deps.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));

  /** One API call. null when no answer came, or when there was no token to ask with. */
  async function call(method: string, path: string, body?: unknown): Promise<{ status: number; body: unknown; noToken?: true } | null> {
    let token: string;
    try {
      token = await deps.token();
    } catch {
      return { status: 0, body: null, noToken: true };
    }
    try {
      const res = await http(API + path, {
        method,
        headers: { Authorization: `Bearer ${token}`, ...(body === undefined ? {} : { "Content-Type": "application/json" }) },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
        signal: AbortSignal.timeout(CALENDAR_TIMEOUT_MS),
      });
      const text = await res.text().catch(() => "");
      let parsed: unknown = null;
      try { parsed = text ? JSON.parse(text) : null; } catch { parsed = null; }
      return { status: res.status, body: parsed };
    } catch (err) {
      console.error("Google Calendar unreachable:", (err as Error)?.name || "error");
      return null;
    }
  }

  const eventPath = (id: string, query = "") => `/calendars/primary/events/${encodeURIComponent(id)}${query}`;

  /** The event as Google holds it now, when it has our id and a link we can use. */
  async function settle(id: string, ev: Obj): Promise<CreateOutcome> {
    // Google can answer before the Meet link is made: look again briefly.
    for (let i = 0; i < 4 && !ev.hangoutLink && linkPending(ev); i++) {
      await sleep(800);
      const again = await call("GET", eventPath(id));
      if (!again || again.status !== 200 || !isObj(again.body)) break;
      ev = again.body;
    }
    if (ev.id !== id || ev.status === "cancelled") return { kind: "unknown" };
    const link = meetLink(ev);
    return link === null ? { kind: "unknown" } : { kind: "created", id, link };
  }

  return {
    async createEvent(e: EventInput & { bookingId: string }): Promise<CreateOutcome> {
      const id = eventIdFor(e.bookingId);
      const res = await call("POST", "/calendars/primary/events?conferenceDataVersion=1&sendUpdates=all", {
        id,
        ...eventBody(e),
        conferenceData: { createRequest: { requestId: e.bookingId, conferenceSolutionKey: { type: "hangoutsMeet" } } },
        reminders: { useDefault: true },
      });
      if (!res) return { kind: "unknown" };
      if (res.noToken) return { kind: "refused", invalidEmail: false };
      if (res.status === 409) {
        // The id is taken: an earlier try for this same booking made the event.
        const got = await call("GET", eventPath(id));
        return got && got.status === 200 && isObj(got.body) ? settle(id, got.body) : { kind: "unknown" };
      }
      if (res.status >= 200 && res.status < 300) return isObj(res.body) ? settle(id, res.body) : { kind: "unknown" };
      if (res.status >= 400 && res.status < 500) {
        const message = String(at(res.body, "error", "message") || "");
        return { kind: "refused", invalidEmail: /attendee|email/i.test(message) };
      }
      return { kind: "unknown" };
    },

    async updateEvent(e: EventInput & { eventId: string }): Promise<ChangeOutcome> {
      if (!EVENT_ID_RE.test(e.eventId)) return "refused";
      const res = await call("PATCH", eventPath(e.eventId, "?sendUpdates=all"), eventBody(e));
      if (!res) return "unknown";
      if (res.noToken) return "refused";
      if (res.status >= 200 && res.status < 300) return "ok";
      return res.status >= 400 && res.status < 500 ? "refused" : "unknown";
    },

    async cancelEvent(eventId: string): Promise<ChangeOutcome> {
      if (!EVENT_ID_RE.test(eventId)) return "refused";
      const res = await call("DELETE", eventPath(eventId, "?sendUpdates=all"));
      if (!res) return "unknown";
      if (res.noToken) return "refused";
      // Already deleted, or never there: either way there is no event to withdraw.
      if ((res.status >= 200 && res.status < 300) || res.status === 404 || res.status === 410) return "ok";
      return res.status >= 400 && res.status < 500 ? "refused" : "unknown";
    },

    /** The owner's busy times between two instants. Throws when they can't be read. */
    async busy(fromMs: number, toMs: number): Promise<Array<{ start: string; end: string }>> {
      const res = await call("POST", "/freeBusy", {
        timeMin: new Date(fromMs).toISOString(),
        timeMax: new Date(toMs).toISOString(),
        items: [{ id: "primary" }],
      });
      if (!res || res.noToken || res.status !== 200 || !isObj(res.body)) throw new Error("Busy times unavailable");
      const cal = at(res.body, "calendars", "primary");
      if (!isObj(cal) || (Array.isArray(cal.errors) && cal.errors.length) || !Array.isArray(cal.busy)) {
        throw new Error("Busy times unavailable");
      }
      return cal.busy.flatMap((b) => {
        const start = at(b, "start");
        const end = at(b, "end");
        return typeof start === "string" && typeof end === "string" ? [{ start, end }] : [];
      });
    },
  };
}

export type CalendarApi = ReturnType<typeof calendarApi>;
