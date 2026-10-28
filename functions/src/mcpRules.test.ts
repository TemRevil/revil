import { describe, expect, it } from "vitest";
import { isValidYmd, receiptRecipient } from "./mcpRules";

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
