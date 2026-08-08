import { Currency, formatMoney } from './treasury';
import { escapeHtml as esc } from './html';

export interface ReceiptLine {
    name: string;
    /** Small muted note under the name, e.g. "Monthly retainer" or "6 installments". */
    note?: string;
    price: number;
    paid: number;
    /** null renders as a dash (e.g. a retainer has no fixed balance). */
    balance: number | null;
}

export interface ReceiptData {
    receiptNo: string;
    /** Human date, e.g. "16 July 2026". */
    dateLabel: string;
    customerName?: string;
    customerEmail?: string;
    /** The single currency every amount below is expressed in. */
    currency: Currency;
    lines: ReceiptLine[];
    totals: { price: number; paid: number; balance: number };
    /** Optional free-text note printed under the table. */
    note?: string;
    /** true when lines were converted from mixed currencies into `currency`. */
    converted?: boolean;
    /**
     * true when every line bills ONE payment (an installment, or a retainer month) rather
     * than the whole contract. Only swaps the totals labels - "Balance due" would be a lie
     * when the figure is what remains on the plan, not what this receipt asks for. All the
     * arithmetic is unchanged, and omitting it keeps today's wording exactly.
     */
    perPayment?: boolean;
}

/** A stable-ish receipt number: RCP-YYYYMMDD-XXXX. */
export function receiptNumber(d = new Date()): string {
    const ymd = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
    const rand = Math.random().toString(36).slice(2, 6).toUpperCase();
    return `RCP-${ymd}-${rand}`;
}

const ACCENT = '#3395ff';
const INK = '#0f172a';
const MUTE = '#64748b';
const LINE = '#e6e9ef';

// ── Itemized (dark) receipt ───────────────────────────────────────────
// The hand-built style used for issued receipts: a dated work log, free-form
// line items that each carry their own currency, and one total per currency
// (never converted).

export interface ItemizedLine {
    label: string;
    /** Small muted caption under the label, e.g. "RooleTask - July 2026". */
    caption?: string;
    /**
     * How many units. Omit (or 1) for a plain single-amount line - the "n x price"
     * breakdown is only printed when BOTH qty and unitPrice are set.
     */
    qty?: number;
    /** Price of ONE unit, in `currency`. Only meaningful alongside `qty`. */
    unitPrice?: number;
    /**
     * The line total, and the figure that is displayed and summed. Always present, so
     * every existing caller and every total keeps working untouched. When qty/unitPrice
     * are supplied this should equal qty * unitPrice (lineTotal() enforces that).
     */
    amount: number;
    currency: Currency;
    /** Dated sub-entries nested under this item (e.g. what shipped for this project). */
    details?: WorkLogEntry[];
}

/**
 * The authoritative money for a line. Recomputes from qty x unitPrice when both are
 * present so the printed "3 x $50.00" can never disagree with the printed total (or with
 * a stale `amount` passed by a caller); falls back to `amount` otherwise.
 */
export function lineTotal(l: Pick<ItemizedLine, 'qty' | 'unitPrice' | 'amount'>): number {
    return l.qty != null && l.unitPrice != null
        ? Math.round((l.qty * l.unitPrice + Number.EPSILON) * 100) / 100
        : (l.amount || 0);
}

export interface WorkLogEntry {
    /** Short date chip, e.g. "2 Jul". */
    date: string;
    text: string;
}

export interface ItemizedReceiptData {
    receiptNo: string;
    /** Human date, e.g. "13 July 2026". */
    dateLabel: string;
    customerName?: string;
    /** Second line under the customer, e.g. "RooleTask project". */
    customerSubtitle?: string;
    /** Heading for the work log, e.g. "Development fixes - July 2026". */
    workLogTitle?: string;
    workLog?: WorkLogEntry[];
    lines: ItemizedLine[];
    /**
     * Optional single grand total that converts every line into one currency, shown as an
     * emphasized row under the per-currency totals. Use when the customer wants one figure.
     */
    grandTotal?: { currency: string; amount: number; note?: string };
    /** Optional free-text note above the footer. */
    note?: string;
}

/** REV-YYYY-MMDD, matching the numbering used on issued receipts. */
export function revReceiptNumber(d = new Date()): string {
    return `REV-${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
}

// Dark receipt palette. Every text tone is checked against the surface it actually sits
// on (card #141414 / chip #1a1a1a) and clears WCAG AA 4.5:1, because this gets emailed and
// printed - the old ad-hoc greys (#555 at 2.47:1, #666 at 3.21:1, #777 at 4.11:1) rendered
// washed out. Four named tones replace the nine one-off hexes that were here before.
const D_CARD = '#141414';
// Surfaces were nearly invisible against the card (chip #1a1a1a was 1.06:1, hairlines
// #1e1e1e/#222 about 1.13:1), so the total pills read as floating text. Lifted just enough
// to separate without turning into boxes; one token now draws every hairline.
const D_BORDER = '#2b2b2b';
const D_ROW = '#2b2b2b';
const D_CHIP = '#282828';
const D_TEXT = '#ececec';   // 15.6:1 - primary (item names, amounts)
const D_SOFT = '#c8c8c8';   // 11.0:1 - body copy (work log)
const D_MUTED = '#a0a0a0';  //  7.0:1 - values, notes, nested details
const D_FAINT = '#8a8a8a';  //  5.3:1 - labels, captions, footer (was #555/#666/#777)
// Filled grand-total row: white on the brand #3395ff is only 3.05:1, which fails for the
// 13px label, so the fill is one step deeper. White on this is 4.95:1 and still reads blue.
const D_ACCENT_FILL = '#1f6fd0';

/** Quantities print bare: 3 stays "3", 0.5 stays "0.5" (never "3.000"). */
const fmtQty = (n: number): string => String(Math.round(n * 1000) / 1000);

/** Per-currency presentation: $/EUR prefix, everything else suffixed. Always 2dp. */
function itemMoney(amount: number, currency: string): string {
    const n = new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
        .format(Math.round(((amount || 0) + Number.EPSILON) * 100) / 100);
    if (currency === 'USD') return `$${n}`;
    if (currency === 'EUR') return `€${n}`;
    return `${n} ${currency}`;
}

/**
 * Build the dark, itemized receipt as a full HTML document. Table-based with inline
 * styles so it survives Gmail/Outlook. Same string for preview, download and email.
 */
export function buildItemizedReceiptHtml(d: ItemizedReceiptData): string {
    // One total per currency, in the order each currency first appears.
    const order: string[] = [];
    const byCur = new Map<string, number>();
    for (const l of d.lines) {
        if (!byCur.has(l.currency)) { order.push(l.currency); byCur.set(l.currency, 0); }
        byCur.set(l.currency, (byCur.get(l.currency) || 0) + lineTotal(l));
    }

    const workLog = (d.workLog || []).filter(w => w.date.trim() || w.text.trim());
    const workLogHtml = workLog.length ? `
      <tr><td style="padding:24px 32px;border-bottom:1px solid ${D_BORDER}">
        ${d.workLogTitle ? `<div style="font-size:11px;color:${D_FAINT};text-transform:uppercase;letter-spacing:0.5px;margin-bottom:14px">${esc(d.workLogTitle)}</div>` : ''}
        <div style="font-size:14px;line-height:1.7;color:${D_SOFT}">
          ${workLog.map((w, i) => `<div style="${i < workLog.length - 1 ? 'margin-bottom:10px' : ''}"><span style="color:${ACCENT};font-weight:700">${esc(w.date)}</span> &nbsp;${esc(w.text)}</div>`).join('')}
        </div>
      </td></tr>` : '';

    const itemRows = d.lines.map(l => {
        const details = (l.details || []).filter(x => x.date.trim() || x.text.trim());
        return `
          <tr>
            <td style="padding:14px 0;border-top:1px solid ${D_ROW};font-size:14px;color:${D_TEXT}">
              ${esc(l.label)}
              ${l.caption ? `<div style="font-size:12px;color:${D_FAINT};margin-top:3px">${esc(l.caption)}</div>` : ''}
              ${l.qty != null && l.unitPrice != null ? `<div style="font-size:12px;color:${D_MUTED};margin-top:3px">${esc(fmtQty(l.qty))} &times; ${esc(itemMoney(l.unitPrice, l.currency))}</div>` : ''}
              ${details.length ? `<div style="margin-top:9px;padding-left:12px;border-left:2px solid ${D_BORDER}">${details.map(x => `<div style="font-size:12px;line-height:1.65;color:${D_MUTED};margin-top:5px"><span style="color:${ACCENT};font-weight:700">${esc(x.date)}</span> &nbsp;${esc(x.text)}</div>`).join('')}</div>` : ''}
            </td>
            <td style="padding:14px 0;border-top:1px solid ${D_ROW};font-size:14px;color:#fff;font-weight:700;text-align:right;white-space:nowrap;vertical-align:top">${esc(itemMoney(lineTotal(l), l.currency))}</td>
          </tr>`;
    }).join('');

    const totalRows = order.map((cur, i) => `
          ${i > 0 ? '<tr><td style="height:8px" colspan="2"></td></tr>' : ''}
          <tr>
            <td style="padding:10px 16px;background:${D_CHIP};border-radius:10px 0 0 10px;font-size:13px;color:${D_MUTED}">Total (${esc(cur)})</td>
            <td style="padding:10px 16px;background:${D_CHIP};border-radius:0 10px 10px 0;font-size:16px;font-weight:800;color:#fff;text-align:right;white-space:nowrap">${esc(itemMoney(byCur.get(cur) || 0, cur))}</td>
          </tr>`).join('');

    // Optional emphasized grand total (accent-filled) after the per-currency rows.
    const g = d.grandTotal;
    const grandRow = g ? `
          <tr><td style="height:10px" colspan="2"></td></tr>
          <tr>
            <td style="padding:12px 16px;background:${D_ACCENT_FILL};border-radius:10px 0 0 10px;font-size:13px;color:#fff;font-weight:700">Total (${esc(g.currency)})</td>
            <td style="padding:12px 16px;background:${D_ACCENT_FILL};border-radius:0 10px 10px 0;font-size:18px;font-weight:800;color:#fff;text-align:right;white-space:nowrap">${esc(itemMoney(g.amount, g.currency))}</td>
          </tr>` : '';
    const totalsNote = g
        ? `<div style="font-size:11px;color:${D_FAINT};margin-top:14px;text-align:center">${esc(g.note || `Grand total converts all amounts to ${g.currency} at current rates.`)}</div>`
        : (order.length > 1 ? `<div style="font-size:11px;color:${D_FAINT};margin-top:14px;text-align:center">Amounts are itemized per currency and not converted.</div>` : '');

    return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<meta name="color-scheme" content="dark"/>
<title>Receipt from Revil</title>
</head>
<body style="margin:0;padding:0;background:#0a0a0a;color:${D_TEXT};font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif">
  <div style="max-width:640px;margin:0 auto;padding:40px 20px">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${D_CARD};border:1px solid ${D_BORDER};border-radius:16px;border-collapse:separate;overflow:hidden">

      <tr><td style="padding:32px 32px 24px;border-bottom:1px solid ${D_BORDER}">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
          <td style="vertical-align:top">
            <div style="font-size:24px;font-weight:800;color:#fff;letter-spacing:-0.5px">Revil<span style="color:${ACCENT}">.</span></div>
            <div style="font-size:12px;color:${D_FAINT};margin-top:4px">Mohammed Ahmed &middot; temrevil.com</div>
          </td>
          <td style="vertical-align:top;text-align:right">
            <div style="font-size:13px;font-weight:700;color:${ACCENT};text-transform:uppercase;letter-spacing:1px">Receipt</div>
            <div style="font-size:12px;color:${D_MUTED};margin-top:6px">${esc(d.receiptNo)}</div>
            <div style="font-size:12px;color:${D_MUTED}">${esc(d.dateLabel)}</div>
          </td>
        </tr></table>
      </td></tr>

      <tr><td style="padding:24px 32px;border-bottom:1px solid ${D_BORDER}">
        <div style="font-size:11px;color:${D_FAINT};text-transform:uppercase;letter-spacing:0.5px;margin-bottom:6px">Bill to</div>
        <div style="font-size:16px;font-weight:700;color:#fff">${d.customerName ? esc(d.customerName) : '&ndash;'}</div>
        ${d.customerSubtitle ? `<div style="font-size:13px;color:${D_MUTED};margin-top:2px">${esc(d.customerSubtitle)}</div>` : ''}
      </td></tr>
${workLogHtml}
      <tr><td style="padding:24px 32px">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse">
          <tr style="font-size:11px;color:${D_FAINT};text-transform:uppercase;letter-spacing:0.5px">
            <td style="padding:0 0 12px;text-align:left">Item</td>
            <td style="padding:0 0 12px;text-align:right">Amount</td>
          </tr>
${itemRows}
        </table>
      </td></tr>

      <tr><td style="padding:8px 32px 28px">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse">
${totalRows}${grandRow}
        </table>
        ${totalsNote}
        ${d.note ? `<div style="font-size:12px;color:${D_MUTED};margin-top:16px;background:${D_CHIP};border:1px solid ${D_BORDER};border-radius:10px;padding:12px 14px;line-height:1.6">${esc(d.note)}</div>` : ''}
      </td></tr>

      <tr><td style="padding:22px 32px;border-top:1px solid ${D_BORDER};text-align:center">
        <div style="font-size:12px;color:${D_FAINT}">Thank you. &mdash; Revil</div>
        <div style="font-size:12px;color:${ACCENT};margin-top:4px">hello@temrevil.com &middot; temrevil.com</div>
      </td></tr>

    </table>
  </div>
</body>
</html>`;
}

/**
 * Build a self-contained, email-safe receipt as a full HTML document. Table-based layout
 * with inline styles (no flex/grid, no external CSS) so it survives Gmail/Outlook. The
 * SAME string is what the preview shows, what Download saves, and what the send function
 * emails - so there's one source of truth and no drift.
 */
export function buildReceiptHtml(d: ReceiptData): string {
    const cur = d.currency;
    const money = (n: number) => formatMoney(n, cur);

    const rows = d.lines.map((l) => `
        <tr>
          <td style="padding:14px 16px;border-bottom:1px solid ${LINE};vertical-align:top">
            <div style="font-weight:700;color:${INK};font-size:14px">${esc(l.name)}</div>
            ${l.note ? `<div style="color:${MUTE};font-size:12px;margin-top:2px">${esc(l.note)}</div>` : ''}
          </td>
          <td style="padding:14px 16px;border-bottom:1px solid ${LINE};text-align:right;color:${INK};font-size:14px;white-space:nowrap">${money(l.price)}</td>
          <td style="padding:14px 16px;border-bottom:1px solid ${LINE};text-align:right;color:#16a34a;font-size:14px;white-space:nowrap">${money(l.paid)}</td>
          <td style="padding:14px 16px;border-bottom:1px solid ${LINE};text-align:right;color:${l.balance && l.balance > 0 ? '#d97706' : MUTE};font-weight:700;font-size:14px;white-space:nowrap">${l.balance === null ? '&ndash;' : money(l.balance)}</td>
        </tr>`).join('');

    const totalRow = (label: string, value: string, opts: { strong?: boolean; color?: string } = {}) => `
        <tr>
          <td style="padding:6px 16px;text-align:right;color:${MUTE};font-size:13px">${label}</td>
          <td style="padding:6px 16px;text-align:right;color:${opts.color || INK};font-size:${opts.strong ? '18px' : '14px'};font-weight:${opts.strong ? '800' : '600'};white-space:nowrap">${value}</td>
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

        <!-- header -->
        <tr><td style="background:${INK};padding:26px 28px">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
            <td style="color:#fff;font-size:20px;font-weight:800;letter-spacing:.5px">TEM&nbsp;REVIL</td>
            <td style="text-align:right;color:${ACCENT};font-size:12px;font-weight:800;letter-spacing:3px;text-transform:uppercase">Receipt</td>
          </tr></table>
        </td></tr>

        <!-- meta -->
        <tr><td style="padding:24px 28px 8px">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
            <td style="vertical-align:top">
              <div style="color:${MUTE};font-size:11px;text-transform:uppercase;letter-spacing:1px;font-weight:700">Billed to</div>
              <div style="color:${INK};font-size:15px;font-weight:700;margin-top:4px">${d.customerName ? esc(d.customerName) : '&ndash;'}</div>
              ${d.customerEmail ? `<div style="color:${MUTE};font-size:13px;margin-top:2px">${esc(d.customerEmail)}</div>` : ''}
            </td>
            <td style="vertical-align:top;text-align:right">
              <div style="color:${MUTE};font-size:12px">No. <span style="color:${INK};font-weight:700">${esc(d.receiptNo)}</span></div>
              <div style="color:${MUTE};font-size:12px;margin-top:4px">Date <span style="color:${INK};font-weight:700">${esc(d.dateLabel)}</span></div>
            </td>
          </tr></table>
        </td></tr>

        <!-- line items -->
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

        <!-- totals -->
        <tr><td style="padding:14px 28px 4px">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
            ${totalRow(d.perPayment ? 'This receipt' : 'Total price', money(d.totals.price))}
            ${totalRow('Paid', money(d.totals.paid), { color: '#16a34a' })}
            ${totalRow(d.perPayment ? 'Remaining on plan' : 'Balance due', money(d.totals.balance), { strong: true, color: d.totals.balance > 0 ? '#d97706' : '#16a34a' })}
          </table>
        </td></tr>

        ${d.converted ? `<tr><td style="padding:2px 28px 0"><div style="color:${MUTE};font-size:11px;text-align:right">Amounts converted to ${cur} at current rates.</div></td></tr>` : ''}
        ${d.note ? `<tr><td style="padding:16px 28px 0"><div style="background:#f8fafc;border:1px solid ${LINE};border-radius:12px;padding:14px 16px;color:${INK};font-size:13px;line-height:1.55">${esc(d.note)}</div></td></tr>` : ''}

        <!-- footer -->
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
