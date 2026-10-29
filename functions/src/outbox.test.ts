import { describe, expect, it } from "vitest";
import { backoffMs, claimable, jobId, retryReset, safeError } from "./outbox.js";

describe("mail outbox", () => {
  it("lets a due pending job, or an expired claim, be taken - nothing else", () => {
    expect(claimable({ status: "pending", nextAttemptAt: 10 }, 10)).toBe(true);
    expect(claimable({ status: "pending", nextAttemptAt: 11 }, 10)).toBe(false);
    expect(claimable({ status: "sending", nextAttemptAt: 5 }, 10)).toBe(true);
    expect(claimable({ status: "sending", nextAttemptAt: 50 }, 10)).toBe(false);
    expect(claimable({ status: "sent" }, 10)).toBe(false);
    expect(claimable({ status: "failed" }, 10)).toBe(false);
    expect(claimable(undefined, 10)).toBe(false);
  });

  it("backs off further after each failure, and caps", () => {
    const waits = [1, 2, 3, 4, 5, 9].map(backoffMs);
    expect(waits).toEqual([...waits].sort((a, b) => a - b));
    expect(waits[5]).toBe(waits[4]);
  });

  it("keeps failure reasons short, one line and free of addresses", () => {
    const e = Object.assign(new Error("550 mailbox someone@example.com unavailable\nmore"), { responseCode: 550 });
    expect(safeError(e)).toBe("550: 550 mailbox [address] unavailable");
    expect(safeError(undefined)).toBe("send failed");
  });

  it("builds ids that are safe as document ids and Message-IDs", () => {
    expect(jobId("contact-owner", "1700_ab/c")).toBe("contact-owner_1700_ab-c");
  });

  it("puts only a failed job, with its message still kept, back in the queue", () => {
    expect(retryReset({ status: "failed", attempts: 6, html: "<p>x</p>" }, 50)).toEqual({ status: "pending", attempts: 0, nextAttemptAt: 50 });
    expect(retryReset({ status: "failed", attempts: 6 }, 50)).toBeNull();
    for (const status of ["pending", "sending", "sent"] as const) {
      expect(retryReset({ status, html: "<p>x</p>" }, 50)).toBeNull();
    }
    expect(retryReset(undefined, 50)).toBeNull();
  });
});