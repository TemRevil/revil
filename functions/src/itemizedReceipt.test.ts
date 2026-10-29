import { describe, expect, it } from "vitest";
import { buildItemizedReceiptHtml, resolveItemizedLines } from "./itemizedReceipt";

const base = { receiptNo: "REV-TEST", dateLabel: "27 October 2026" };

describe("resolveItemizedLines", () => {
  it("refuses a line whose amount disagrees with qty x unitPrice", () => {
    const r = resolveItemizedLines([{ label: "Fixes", qty: 3, unitPrice: 50, amount: 100, currency: "USD" }]);
    expect(r).toHaveProperty("error");
  });

  it("accepts a line whose amount matches qty x unitPrice", () => {
    const r = resolveItemizedLines([{ label: "Fixes", qty: 3, unitPrice: 50, amount: 150, currency: "USD" }]);
    expect(r).toEqual({ lines: [expect.objectContaining({ amount: 150 })] });
  });

  it("refuses a line with no price at all", () => {
    expect(resolveItemizedLines([{ label: "Free?", qty: 2, currency: "USD" }])).toHaveProperty("error");
  });

  it("produces amounts the rendered receipt totals agree with", () => {
    const r = resolveItemizedLines([
      { label: "Hosting", unitPrice: 12.5, currency: "USD" },
      { label: "Fixes", qty: 3, unitPrice: 50, currency: "USD" },
      { label: "Domain", amount: 600, currency: "EGP" },
    ]);
    if ("error" in r) throw new Error(r.error);
    const usd = r.lines.filter((l) => l.currency === "USD").reduce((s, l) => s + l.amount, 0);
    expect(usd).toBe(162.5);
    const html = buildItemizedReceiptHtml({ ...base, lines: r.lines });
    expect(html).toContain("$162.50");
    expect(html).toContain("600.00 EGP");
  });
});

describe("buildItemizedReceiptHtml", () => {
  it("is framed by the shared email shell, with its number, date and customer inside", () => {
    const html = buildItemizedReceiptHtml({ ...base, customerName: "Acme <Ltd>", lines: [{ label: "Fixes", amount: 150, currency: "USD" }] });
    expect(html).toContain('class="body pad"');
    expect(html).toContain("<title>Receipt REV-TEST</title>");
    expect(html).toContain("REV-TEST");
    expect(html).toContain("27 October 2026");
    expect(html).toContain("Acme &lt;Ltd&gt;");
  });
});