import { describe, expect, it } from "vitest";
import { isValidYmd, ownerInstant, ownerYmdHm, receiptRecipient } from "./mcpRules";

describe("isValidYmd", () => {
  it("accepts real calendar days", () => {
    expect(isValidYmd("2026-10-27")).toBe(true);
    expect(isValidYmd("2028-02-29")).toBe(true); // leap year
    expect(isValidYmd("2026-12-31")).toBe(true);
  });

  it("refuses days that do not exist", () => {
    expect(isValidYmd("2026-02-31")).toBe(false);
    expect(isValidYmd("2027-02-29")).toBe(false); // not a leap year
    expect(isValidYmd("2026-04-31")).toBe(false);
    expect(isValidYmd("2026-13-01")).toBe(false);
    expect(isValidYmd("2026-00-10")).toBe(false);
    expect(isValidYmd("2026-01-00")).toBe(false);
  });

  it("refuses anything that is not exactly YYYY-MM-DD", () => {
    expect(isValidYmd("2026-1-05")).toBe(false);
    expect(isValidYmd("2026-01-05T00:00")).toBe(false);
    expect(isValidYmd("")).toBe(false);
    expect(isValidYmd(undefined)).toBe(false);
    expect(isValidYmd(20261027)).toBe(false);
  });
});

describe("receiptRecipient", () => {
  const acme = { name: "Site", clientEmail: "Pay@Acme.com" };
  const acme2 = { name: "App", clientEmail: "pay@acme.com" };
  const other = { name: "Other", clientEmail: "boss@other.com" };
  const noEmail = { name: "Draft" };

  it("defaults to the first project's saved address", () => {
    expect(receiptRecipient(undefined, [acme])).toEqual({ to: "Pay@Acme.com" });
  });

  it("allows an address saved on every project, ignoring case", () => {
    expect(receiptRecipient("pay@acme.com", [acme, acme2])).toEqual({ to: "pay@acme.com" });
  });

  it("refuses an address that is not saved in Treasury", () => {
    expect(receiptRecipient("attacker@evil.test", [acme])).toHaveProperty("error");
  });

  it("refuses an address saved on only some of the projects", () => {
    // Otherwise a receipt for a stranger's project could ride along with one of theirs.
    expect(receiptRecipient("boss@other.com", [acme, other])).toHaveProperty("error");
    expect(receiptRecipient(undefined, [other, acme])).toHaveProperty("error");
  });

  it("refuses when a project has no saved address", () => {
    expect(receiptRecipient(undefined, [noEmail])).toHaveProperty("error");
    expect(receiptRecipient("pay@acme.com", [acme, noEmail])).toHaveProperty("error");
  });
});

describe("booking times on the owner's clock", () => {
  it("reads a date and 24-hour time in the owner's zone as a UTC instant", () => {
    expect(new Date(ownerInstant("2026-11-02", "10:00", 2)).toISOString()).toBe("2026-11-02T08:00:00.000Z");
    expect(new Date(ownerInstant("2026-11-02", "00:30", -5)).toISOString()).toBe("2026-11-02T05:30:00.000Z");
  });

  it("follows daylight saving in a named zone", () => {
    // Berlin: UTC+2 in summer, UTC+1 from 25/10/2026.
    expect(new Date(ownerInstant("2026-10-24", "15:00", "Europe/Berlin")).toISOString()).toBe("2026-10-24T13:00:00.000Z");
    expect(new Date(ownerInstant("2026-10-26", "15:00", "Europe/Berlin")).toISOString()).toBe("2026-10-26T14:00:00.000Z");
  });

  it("gives an instant back as the date and time it was read from", () => {
    for (const [d, t, z] of [["2026-11-02", "10:00", 2], ["2026-12-31", "23:45", "Asia/Tokyo"], ["2026-03-29", "09:15", "Europe/Berlin"]] as const) {
      expect(ownerYmdHm(ownerInstant(d, t, z), z)).toEqual({ date: d, time: t });
    }
  });
});
