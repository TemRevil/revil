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

  it("takes the visitor, not Hosting's edge, on the one function behind Firebase Hosting", () => {
    const viaHosting = { "x-forwarded-for": `${VISITOR}, ${HOSTING_EDGE}`, "x-forwarded-host": "mcp.temrevil.com" };
    expect(clientIp(viaHosting, undefined, "mcp.temrevil.com")).toBe(VISITOR);
  });

  it("trusts the Hosting shape nowhere else: a Google-range last hop alone proves nothing", () => {
    // A site function is never behind Hosting, so a Google address last is the caller.
    expect(clientIp({ "x-forwarded-for": `${FAKE}, ${HOSTING_EDGE}`, "x-forwarded-host": "mcp.temrevil.com" })).toBe(HOSTING_EDGE);
    // The MCP function needs both: its own Hosting domain, and Google's edge as the last hop.
    expect(clientIp({ "x-forwarded-for": `${FAKE}, ${HOSTING_EDGE}` }, undefined, "mcp.temrevil.com")).toBe(HOSTING_EDGE);
    expect(clientIp({ "x-forwarded-for": `${FAKE}, ${VISITOR}`, "x-forwarded-host": "mcp.temrevil.com" }, undefined, "mcp.temrevil.com")).toBe(VISITOR);
  });

  it("falls back to the platform's address when there is no header", () => {
    expect(clientIp({}, ` ${VISITOR} `)).toBe(VISITOR);
    expect(clientIp({})).toBe("");
  });
});
