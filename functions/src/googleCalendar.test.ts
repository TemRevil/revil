import { describe, expect, it } from "vitest";
import { calendarApi, eventIdFor, type Http } from "./googleCalendar";

const MEET = "https://meet.google.com/abc-defg-hij";
const START = "2026-12-01T10:00:00.000Z";
const END = "2026-12-01T11:00:00.000Z";

interface Call { method: string; url: string; body?: unknown }

/** A fake Calendar API: answers each request with the next queued reply. */
function fake(replies: Array<{ status: number; body?: unknown } | Error>) {
  const calls: Call[] = [];
  const http: Http = async (url, init) => {
    calls.push({ method: init?.method || "GET", url: String(url), body: init?.body ? JSON.parse(String(init.body)) : undefined });
    const next = replies.shift();
    if (!next) throw new Error("no reply queued");
    if (next instanceof Error) throw next;
    return new Response(next.body === undefined ? null : JSON.stringify(next.body), { status: next.status });
  };
  const api = calendarApi({ token: async () => "tok", http, sleep: async () => undefined });
  return { api, calls };
}

const made = (extra: Record<string, unknown> = {}) => ({
  id: eventIdFor("booking-1"), status: "confirmed", hangoutLink: MEET, ...extra,
});

describe("eventIdFor", () => {
  it("is a stable id the Calendar API accepts (base32hex, 5-1024 chars)", () => {
    const id = eventIdFor("booking-1");
    expect(id).toBe(eventIdFor("booking-1"));
    expect(id).not.toBe(eventIdFor("booking-2"));
    expect(id).toMatch(/^[a-v0-9]{5,1024}$/);
  });
});

describe("createEvent", () => {
  const input = { bookingId: "booking-1", name: "Sam", email: "sam@example.com", startTime: START, endTime: END };

  it("creates the event with our id, a Meet request and invites, and returns the link", async () => {
    const { api, calls } = fake([{ status: 200, body: made() }]);
    await expect(api.createEvent(input)).resolves.toEqual({ kind: "created", id: eventIdFor("booking-1"), link: MEET });
    expect(calls).toHaveLength(1);
    expect(calls[0].method).toBe("POST");
    expect(calls[0].url).toContain("/calendars/primary/events?");
    expect(calls[0].url).toContain("conferenceDataVersion=1");
    expect(calls[0].url).toContain("sendUpdates=all");
    const body = calls[0].body as { id: string; attendees: unknown; start: unknown; end: unknown; conferenceData: { createRequest: unknown } };
    expect(body.id).toBe(eventIdFor("booking-1"));
    expect(body.attendees).toEqual([{ email: "sam@example.com" }]);
    expect(body.start).toEqual({ dateTime: START });
    expect(body.end).toEqual({ dateTime: END });
    expect(body.conferenceData.createRequest).toEqual({ requestId: "booking-1", conferenceSolutionKey: { type: "hangoutsMeet" } });
  });

  it("never puts anything but the name in the invite", async () => {
    const { api, calls } = fake([{ status: 200, body: made() }]);
    await api.createEvent(input);
    expect(JSON.stringify(calls[0].body)).not.toMatch(/reason/i);
  });

  it("treats an id that already exists as the same booking made by an earlier try", async () => {
    const { api, calls } = fake([{ status: 409, body: { error: { code: 409 } } }, { status: 200, body: made() }]);
    await expect(api.createEvent(input)).resolves.toEqual({ kind: "created", id: eventIdFor("booking-1"), link: MEET });
    expect(calls[1].method).toBe("GET");
  });

  it("waits briefly for a Meet link that is still being made", async () => {
    const pending = made({ hangoutLink: undefined, conferenceData: { createRequest: { status: { statusCode: "pending" } } } });
    const { api, calls } = fake([{ status: 200, body: pending }, { status: 200, body: pending }, { status: 200, body: made() }]);
    await expect(api.createEvent(input)).resolves.toMatchObject({ kind: "created", link: MEET });
    expect(calls.map((c) => c.method)).toEqual(["POST", "GET", "GET"]);
  });

  it("refuses a bad guest address, and says so", async () => {
    const { api } = fake([{ status: 400, body: { error: { code: 400, message: "Invalid attendee email." } } }]);
    await expect(api.createEvent(input)).resolves.toEqual({ kind: "refused", invalidEmail: true });
  });

  it("calls a 4xx a refusal (nothing was made) and a 5xx or a dropped request unknown", async () => {
    await expect(fake([{ status: 403, body: { error: { code: 403 } } }]).api.createEvent(input)).resolves.toEqual({ kind: "refused", invalidEmail: false });
    await expect(fake([{ status: 503 }]).api.createEvent(input)).resolves.toEqual({ kind: "unknown" });
    await expect(fake([new Error("timeout")]).api.createEvent(input)).resolves.toEqual({ kind: "unknown" });
  });

  it("calls an event that comes back without our id, or with a link that isn't Meet, unknown", async () => {
    await expect(fake([{ status: 200, body: made({ id: "other" }) }]).api.createEvent(input)).resolves.toEqual({ kind: "unknown" });
    await expect(fake([{ status: 200, body: made({ hangoutLink: "https://evil.example/x" }) }]).api.createEvent(input)).resolves.toEqual({ kind: "unknown" });
  });

  it("refuses without calling Google when the calendar isn't connected", async () => {
    const calls: unknown[] = [];
    const api = calendarApi({
      token: async () => { throw new Error("not connected"); },
      http: async () => { calls.push(1); return new Response(null, { status: 200 }); },
      sleep: async () => undefined,
    });
    await expect(api.createEvent(input)).resolves.toEqual({ kind: "refused", invalidEmail: false });
    expect(calls).toHaveLength(0);
  });
});

describe("updateEvent / cancelEvent", () => {
  it("moves the event and re-invites the guest", async () => {
    const { api, calls } = fake([{ status: 200, body: made() }]);
    await expect(api.updateEvent({ eventId: "abc123", name: "Sam", email: "sam@example.com", startTime: START, endTime: END })).resolves.toBe("ok");
    expect(calls[0].method).toBe("PATCH");
    expect(calls[0].url).toContain("/events/abc123?");
    expect(calls[0].url).toContain("sendUpdates=all");
    expect((calls[0].body as Record<string, unknown>).start).toEqual({ dateTime: START });
  });

  it("cancels by the exact id, and counts an event already gone as cancelled", async () => {
    const ok = fake([{ status: 204 }]);
    await expect(ok.api.cancelEvent("abc123")).resolves.toBe("ok");
    expect(ok.calls[0]).toMatchObject({ method: "DELETE" });
    expect(ok.calls[0].url).toContain("/events/abc123?sendUpdates=all");
    await expect(fake([{ status: 410 }]).api.cancelEvent("abc123")).resolves.toBe("ok");
    await expect(fake([{ status: 404 }]).api.cancelEvent("abc123")).resolves.toBe("ok");
    await expect(fake([{ status: 500 }]).api.cancelEvent("abc123")).resolves.toBe("unknown");
  });

  it("refuses an id that isn't a Calendar event id instead of sending it", async () => {
    const { api, calls } = fake([]);
    await expect(api.cancelEvent("../../calendars")).resolves.toBe("refused");
    expect(calls).toHaveLength(0);
  });
});

describe("busy", () => {
  it("returns the primary calendar's busy times", async () => {
    const busy = [{ start: "2026-12-01T09:00:00Z", end: "2026-12-01T10:30:00Z" }];
    const { api, calls } = fake([{ status: 200, body: { calendars: { primary: { busy } } } }]);
    await expect(api.busy(Date.parse(START), Date.parse(END))).resolves.toEqual(busy);
    expect(calls[0].url).toContain("/freeBusy");
    expect(calls[0].body).toMatchObject({ timeMin: START, timeMax: END, items: [{ id: "primary" }] });
  });

  it("throws rather than report a calendar it could not read as free", async () => {
    await expect(fake([{ status: 200, body: { calendars: { primary: { errors: [{ reason: "notFound" }] } } } }]).api.busy(0, 1)).rejects.toThrow();
    await expect(fake([{ status: 500 }]).api.busy(0, 1)).rejects.toThrow();
  });
});
