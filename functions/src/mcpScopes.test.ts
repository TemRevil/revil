import { describe, expect, it } from "vitest";
import { buildInstructions, registerTools } from "./mcp";

// A stand-in MCP server that only records which tools were registered.
function recordingServer() {
  const names: string[] = [];
  const server = {
    registerTool(name: string) { names.push(name); return {}; },
  };
  return { names, server: server as unknown as Parameters<typeof registerTools>[0] };
}

const cfg = { enabled: true, writesEnabled: true, revokedBefore: 0 };
const time = { date: "2026-10-27", time: "10:00", offsetLabel: "UTC+03:00", weekday: "Tuesday", pretty: "Tuesday 27 October 2026, 10:00" };
const WRITE_TOOLS = ["add_booking", "update_booking", "cancel_booking", "delete_project", "send_treasury_receipt", "send_itemized_receipt", "add_income"];

describe("tool scopes", () => {
  it("a read-only grant gets no tool that changes data or sends email", () => {
    const { names, server } = recordingServer();
    registerTools(server, cfg, time, { sub: "owner", iat: 1, scope: "mcp:read" });
    expect(names).toContain("list_bookings");
    for (const t of WRITE_TOOLS) expect(names).not.toContain(t);
  });

  it("a write grant gets the write tools when writes are on in Settings", () => {
    const { names, server } = recordingServer();
    registerTools(server, cfg, time, { sub: "owner", iat: 1, scope: "mcp:read mcp:write" });
    for (const t of WRITE_TOOLS) expect(names).toContain(t);
  });

  it("writes switched off in Settings beat a write grant", () => {
    const { names, server } = recordingServer();
    registerTools(server, { ...cfg, writesEnabled: false }, time, { sub: "owner", iat: 1, scope: "mcp:read mcp:write" });
    for (const t of WRITE_TOOLS) expect(names).not.toContain(t);
  });

  it("the instructions tell a read-only session it cannot write, and mark visitor text untrusted", () => {
    const text = buildInstructions(time, cfg, "mcp:read");
    expect(text).toMatch(/read-only/i);
    expect(text).toMatch(/untrusted/);
  });
});
