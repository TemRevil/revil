/**
 * Receipt HTML builder for the Cloud Functions side (used by the MCP send tool). Kept in
 * sync with src/lib/receipt.ts on the frontend - same layout, so a receipt sent by the AI
 * looks identical to one built in the dashboard. Currency here is a plain string (the
 * functions treasury types use string currencies).
 */

const CURRENCY_SYMBOL: Record<string, string> = { USD: "$", EGP: "E£", EUR: "€" };

/** Matches src/lib/treasury.ts formatMoney. */
function formatMoney(amount: number, currency: string): string {
  const rounded = Math.round((amount + Number.EPSILON) * 100) / 100;
  const hasFraction = Math.abs(rounded % 1) > 0.001;
  const num = new Intl.NumberFormat("en-US", {
    minimumFractionDigits: hasFraction ? 2 : 0,
    maximumFractionDigits: 2,
  }).format(rounded);
  return `${CURRENCY_SYMBOL[currency] || ""}${num}`;
}

export interface ReceiptLine {
  name: string;
  note?: string;
  price: number;
  paid: number;
  balance: number | null;
}

export interface ReceiptData {
  receiptNo: string;
  dateLabel: string;
  customerName?: string;
  customerEmail?: string;
  currency: string;
  lines: ReceiptLine[];
  totals: { price: number; paid: number; balance: number };
  note?: string;
  converted?: boolean;
}

const esc = (s: string): string =>
  String(s ?? "")
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#39;");

export function receiptNumber(d = new Date()): string {
  const ymd = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}`;
  const r = Math.random().toString(36).slice(2, 6).toUpperCase();
  return `RCP-${ymd}-${r}`;
}

const ACCENT = "#3395ff";
const INK = "#0f172a";
const MUTE = "#64748b";
const LINE = "#e6e9ef";

export function buildReceiptHtml(d: ReceiptData): string {
  const cur = d.currency;
  const money = (n: number) => formatMoney(n, cur);

  const rows = d.lines.map((l) => `
        <tr>
          <td style="padding:14px 16px;border-bottom:1px solid ${LINE};vertical-align:top">
            <div style="font-weight:700;color:${INK};font-size:14px">${esc(l.name)}</div>
            ${l.note ? `<div style="color:${MUTE};font-size:12px;margin-top:2px">${esc(l.note)}</div>` : ""}
          </td>
          <td style="padding:14px 16px;border-bottom:1px solid ${LINE};text-align:right;color:${INK};font-size:14px;white-space:nowrap">${money(l.price)}</td>
          <td style="padding:14px 16px;border-bottom:1px solid ${LINE};text-align:right;color:#16a34a;font-size:14px;white-space:nowrap">${money(l.paid)}</td>
          <td style="padding:14px 16px;border-bottom:1px solid ${LINE};text-align:right;color:${l.balance && l.balance > 0 ? "#d97706" : MUTE};font-weight:700;font-size:14px;white-space:nowrap">${l.balance === null ? "&ndash;" : money(l.balance)}</td>
        </tr>`).join("");

  const totalRow = (label: string, value: string, opts: { strong?: boolean; color?: string } = {}) => `
        <tr>
          <td style="padding:6px 16px;text-align:right;color:${MUTE};font-size:13px">${label}</td>
          <td style="padding:6px 16px;text-align:right;color:${opts.color || INK};font-size:${opts.strong ? "18px" : "14px"};font-weight:${opts.strong ? "800" : "600"};white-space:nowrap">${value}</td>
        </tr>`;

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Receipt ${esc(d.receiptNo)}</title>
</head>
<body style="margin:0;padding:0;background:#f1f5f9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;-webkit-font-smoothing:antialiased">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f1f5f9;padding:32px 12px">
    <tr><td align="center">
      <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="width:600px;max-width:100%;background:#ffffff;border-radius:18px;overflow:hidden;box-shadow:0 10px 40px rgba(15,23,42,0.08)">

        <tr><td style="background:${INK};padding:26px 28px">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
            <td style="color:#fff;font-size:20px;font-weight:800;letter-spacing:.5px">TEM&nbsp;REVIL</td>
            <td style="text-align:right;color:${ACCENT};font-size:12px;font-weight:800;letter-spacing:3px;text-transform:uppercase">Receipt</td>
          </tr></table>
        </td></tr>

        <tr><td style="padding:24px 28px 8px">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
            <td style="vertical-align:top">
              <div style="color:${MUTE};font-size:11px;text-transform:uppercase;letter-spacing:1px;font-weight:700">Billed to</div>
              <div style="color:${INK};font-size:15px;font-weight:700;margin-top:4px">${d.customerName ? esc(d.customerName) : "&ndash;"}</div>
              ${d.customerEmail ? `<div style="color:${MUTE};font-size:13px;margin-top:2px">${esc(d.customerEmail)}</div>` : ""}
            </td>
            <td style="vertical-align:top;text-align:right">
              <div style="color:${MUTE};font-size:12px">No. <span style="color:${INK};font-weight:700">${esc(d.receiptNo)}</span></div>
              <div style="color:${MUTE};font-size:12px;margin-top:4px">Date <span style="color:${INK};font-weight:700">${esc(d.dateLabel)}</span></div>
            </td>
          </tr></table>
        </td></tr>

        <tr><td style="padding:16px 28px 0">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid ${LINE};border-radius:12px;overflow:hidden">
            <tr style="background:#f8fafc">
              <td style="padding:10px 16px;color:${MUTE};font-size:11px;text-transform:uppercase;letter-spacing:.5px;font-weight:700">Project</td>
              <td style="padding:10px 16px;text-align:right;color:${MUTE};font-size:11px;text-transform:uppercase;letter-spacing:.5px;font-weight:700">Price</td>
              <td style="padding:10px 16px;text-align:right;color:${MUTE};font-size:11px;text-transform:uppercase;letter-spacing:.5px;font-weight:700">Paid</td>
              <td style="padding:10px 16px;text-align:right;color:${MUTE};font-size:11px;text-transform:uppercase;letter-spacing:.5px;font-weight:700">Balance</td>
            </tr>
            ${rows}
          </table>
        </td></tr>

        <tr><td style="padding:14px 28px 4px">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
            ${totalRow("Total price", money(d.totals.price))}
            ${totalRow("Total paid", money(d.totals.paid), { color: "#16a34a" })}
            ${totalRow("Balance due", money(d.totals.balance), { strong: true, color: d.totals.balance > 0 ? "#d97706" : "#16a34a" })}
          </table>
        </td></tr>

        ${d.converted ? `<tr><td style="padding:2px 28px 0"><div style="color:${MUTE};font-size:11px;text-align:right">Amounts converted to ${cur} at current rates.</div></td></tr>` : ""}
        ${d.note ? `<tr><td style="padding:16px 28px 0"><div style="background:#f8fafc;border:1px solid ${LINE};border-radius:12px;padding:14px 16px;color:${INK};font-size:13px;line-height:1.55">${esc(d.note)}</div></td></tr>` : ""}

        <tr><td style="padding:24px 28px 28px">
          <div style="border-top:1px solid ${LINE};padding-top:18px;color:${MUTE};font-size:12px;line-height:1.6">
            Thank you. Questions about this receipt? Reply to <a href="mailto:hello@temrevil.com" style="color:${ACCENT};text-decoration:none;font-weight:600">hello@temrevil.com</a>.
            <div style="margin-top:6px"><a href="https://temrevil.com" style="color:${MUTE};text-decoration:none">temrevil.com</a> &middot; Tem Revil</div>
          </div>
        </td></tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`;
}
