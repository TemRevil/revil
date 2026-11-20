import { describe, expect, it } from "vitest";
import { clientIp } from "./geoip";

// Shapes seen in the live logs (2026-11-20): a direct call carries one hop, the
// caller; Google's front end APPENDS it, so anything the caller sent stays in front.
// Through Firebase Hosting (mcp.temrevil.com) Hosting rewrites the header to
// "<visitor>, <Hosting's own Google address>", whatever the caller sent.
const VISITOR = "198.51.100.7";
const FAKE = "203.0.113.9";
const HOSTING_EDGE = "66.249.81.3";

describe("clientIp", () => {
  it("takes the visitor on a direct call", () => {
    expect(clientIp({ "x-forwarded-for": VISITOR })).toBe(VISITOR);
  });

  it("never takes an address the caller wrote into the header", () => {
    expect(clientIp({ "x-forwarded-for": `${FAKE}, ${VISITOR}` })).toBe(VISITOR);
    expect(clientIp({ "x-forwarded-for": `${FAKE}, 10.0.0.1, ${VISITOR}` })).toBe(VISITOR);
    // A forged Hosting header changes nothing: the last hop is still the caller.
    expect(clientIp({ "x-forwarded-for": `${FAKE}, ${VISITOR}`, "x-forwarded-host": "mcp.temrevil.com" })).toBe(VISITOR);
  });

  it("takes the visitor, not Hosting's edge, through Firebase Hosting", () => {
    expect(clientIp({ "x-forwarded-for": `${VISITOR}, ${HOSTING_EDGE}` })).toBe(VISITOR);
  });

  it("falls back to the platform's address when there is no header", () => {
    expect(clientIp({}, ` ${VISITOR} `)).toBe(VISITOR);
    expect(clientIp({})).toBe("");
  });
});
