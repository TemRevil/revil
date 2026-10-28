import { describe, expect, it } from "vitest";
import { canonicalSocial, classifySource, flushDecision, LOCAL_ORIGIN_RE } from "./analytics.js";

describe("flush dedupe", () => {
  it("counts a new session and a newer flush", () => {
    expect(flushDecision(null, 1, "abc123")).toBe("apply");
    expect(flushDecision({ Seq: 3, Fids: ["aaa111"] }, 4, "bbb222")).toBe("apply");
  });

  it("drops a flush whose id the session already has, whatever its seq", () => {
    expect(flushDecision({ Seq: 3, Fids: ["aaa111", "bbb222"] }, 4, "bbb222")).toBe("duplicate");
    expect(flushDecision({ Seq: 5, Fids: ["bbb222"] }, 4, "bbb222")).toBe("duplicate");
  });

  it("counts an older flush that never landed, without letting its state win", () => {
    expect(flushDecision({ Seq: 6, Fids: ["ccc333"] }, 5, "ddd444")).toBe("late");
  });

  it("keeps the old seq rule for a flush with no id", () => {
    expect(flushDecision({ Seq: 6 }, 6, "")).toBe("duplicate");
    expect(flushDecision({ Seq: 6 }, 7, "")).toBe("apply");
  });
});

describe("counter names from the request", () => {
  it("folds known networks and sends everything else to Other", () => {
    expect(canonicalSocial("github")).toBe("GitHub");
    expect(canonicalSocial("totally-made-up")).toBe("Other");
  });

  it("keeps known sources and real hosts, and files any other word under Other", () => {
    expect(classifySource({ Utm: { source: "chatgpt" } }).Name).toBe("ChatGPT");
    expect(classifySource({ Ref: "blog.example.org" }).Name).toBe("blog.example.org");
    expect(classifySource({ Utm: { source: "buy-cheap-pills-now" } }).Name).toBe("Other");
    expect(classifySource({ Ref: "x".repeat(70) + ".com" }).Name).toBe("Other");
    expect(classifySource({}).Name).toBe("Direct");
  });
});

describe("CORS for local development", () => {
  it("allows only a real local origin", () => {
    for (const ok of ["http://localhost:3000", "https://localhost", "http://127.0.0.1:5173"]) expect(LOCAL_ORIGIN_RE.test(ok)).toBe(true);
    for (const bad of ["https://localhost.evil.example", "https://evil.example/localhost", "http://localhost:3000.evil.example"]) {
      expect(LOCAL_ORIGIN_RE.test(bad)).toBe(false);
    }
  });
});