import { describe, expect, it } from "vitest";
import { cancelNotices } from "./meetingNotices";

const NOW = Date.UTC(2026, 10, 20, 15, 0);
const HOUR = 3_600_000;
const meeting = (over: Record<string, unknown> = {}) => ({ Name: "Sam", Email: "sam@example.com", startMs: NOW + 24 * HOUR, ...over });

describe("cancelNotices", () => {
  it("tells the owner and the guest when an upcoming call is cancelled", () => {
    expect(cancelNotices(meeting(), NOW)).toEqual({ owner: true, guest: "sam@example.com" });
  });

  it("tells nobody when a call that already happened is deleted", () => {
    expect(cancelNotices(meeting({ startMs: NOW - HOUR }), NOW)).toEqual({ owner: false, guest: null });
    expect(cancelNotices(meeting({ startMs: NOW }), NOW)).toEqual({ owner: false, guest: null });
  });

  it("tells nobody when the time can't be read or the meeting has no name", () => {
    expect(cancelNotices(meeting({ startMs: null }), NOW)).toEqual({ owner: false, guest: null });
    expect(cancelNotices(meeting({ Name: "" }), NOW)).toEqual({ owner: false, guest: null });
  });

  it("tells only the owner when there is no usable guest address, or the guest was over the mail limit", () => {
    expect(cancelNotices(meeting({ Email: undefined }), NOW)).toEqual({ owner: true, guest: null });
    expect(cancelNotices(meeting({ Email: "not-an-email" }), NOW)).toEqual({ owner: true, guest: null });
    expect(cancelNotices(meeting({ Ack: false }), NOW)).toEqual({ owner: true, guest: null });
  });
});
