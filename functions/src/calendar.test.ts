import { describe, expect, it } from "vitest";
import { readCreateReply, replySucceeded } from "./calendar.js";

describe("readCreateReply", () => {
  it("accepts an explicit success with an event id and a Meet link", () => {
    expect(readCreateReply({ httpStatus: 200, body: { status: "success", id: "abc123", link: "https://meet.google.com/abc-defg-hij" } }))
      .toEqual({ kind: "created", id: "abc123", link: "https://meet.google.com/abc-defg-hij" });
    expect(readCreateReply({ httpStatus: 200, body: { status: "success", id: "abc123" } }))
      .toEqual({ kind: "created", id: "abc123", link: "" });
  });

  it("treats a 200 that proves nothing as unknown, never as a booking", () => {
    for (const body of [null, {}, { status: "ok" }, { status: "success" }, { status: "success", id: "" },
      { status: "success", id: "a b" }, { status: "success", id: "x", link: "https://evil.example/meet" },
      { status: "success", id: "x", link: 5 }, "<html>quota</html>"]) {
      expect(readCreateReply({ httpStatus: 200, body })).toEqual({ kind: "unknown" });
    }
  });

  it("treats a timeout or a server error as unknown", () => {
    expect(readCreateReply({ httpStatus: 0, body: null })).toEqual({ kind: "unknown" });
    expect(readCreateReply({ httpStatus: 500, body: { status: "success", id: "x" } })).toEqual({ kind: "unknown" });
  });

  it("reads an explicit refusal, and spots a bad attendee address", () => {
    expect(readCreateReply({ httpStatus: 200, body: { status: "error", message: "Invalid attendee email" } }))
      .toEqual({ kind: "refused", invalidEmail: true });
    expect(readCreateReply({ httpStatus: 500, body: { status: "error", message: "Quota at script.google.com/x" } }))
      .toEqual({ kind: "refused", invalidEmail: false });
  });
});

describe("replySucceeded", () => {
  it("needs a 2xx JSON object that is not an error", () => {
    expect(replySucceeded({ httpStatus: 200, body: { status: "success" } })).toBe(true);
    expect(replySucceeded({ httpStatus: 200, body: { status: "error" } })).toBe(false);
    expect(replySucceeded({ httpStatus: 200, body: null })).toBe(false);
    expect(replySucceeded({ httpStatus: 0, body: null })).toBe(false);
  });
});
