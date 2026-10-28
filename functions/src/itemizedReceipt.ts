/**
 * Itemized (dark) receipt - used ONLY by the MCP send_itemized_receipt tool, so unlike
 * receipt.ts (generated from the dashboard's builder) it lives here and nowhere else.
 *
 * The hand-built style used for issued receipts: a dated work log, free-form line items
 * that each carry their own currency, and one total per currency (never converted).
 */

import { escapeHtml as esc } from "./html";
import { emailShell } from "./emailShell";

const ACCENT = "#3395ff";

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
    currency: string;
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
        ? round2(l.qty * l.unitPrice)
        : round2(l.amount || 0);
}

const round2 = (n: number): number => Math.round((n + Number.EPSILON) * 100) / 100;

/** A line as a caller describes it: an amount, or qty x unitPrice (qty defaults to 1). */
export type ItemizedLineInput = Omit<ItemizedLine, 'amount'> & { amount?: number };

/**
 * Settle every line's money ONCE, by the same rule the renderer prints with
 * (lineTotal), so the lines, the per-currency totals, a converted grand total and the
 * receipt-history figure all agree. A line that gives an amount AND a qty x unitPrice
 * that disagree is refused rather than guessed at, and a line with no price at all is
 * refused rather than billed at 0.
 */
export function resolveItemizedLines<T extends ItemizedLineInput>(lines: T[]): { lines: Array<T & { amount: number }> } | { error: string } {
    const out: Array<T & { amount: number }> = [];
    for (const l of lines) {
        if (l.amount === undefined && l.unitPrice === undefined) {
            return { error: `Line "${l.label}" needs either an amount, or a unitPrice (qty defaults to 1).` };
        }
        if (l.amount !== undefined && l.unitPrice !== undefined) {
            const product = round2((l.qty ?? 1) * l.unitPrice);
            if (Math.abs(round2(l.amount) - product) > 0.005) {
                return { error: `Line "${l.label}": amount ${l.amount} does not equal qty x unitPrice (${product}). Pass one or the other.` };
            }
        }
        const amount = l.qty != null && l.unitPrice != null
            ? lineTotal(l as Pick<ItemizedLine, 'qty' | 'unitPrice' | 'amount'>)
            : round2(l.amount ?? (l.unitPrice as number));
        out.push({ ...l, amount });
    }
    return { lines: out };
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

/**
 * REV-YYYY-MMDD-XXXX, matching the numbering used on issued receipts.
 *
 * The four random characters are the point: without them every receipt issued on
 * the same day carried the SAME number, so two clients billed on one afternoon both
 * held "REV-2026-0920" and any reference to a receipt by number was ambiguous - in
 * the receipt history as well as in the customer's own records. `receiptNumber()`
 * in receipt.ts has always appended a suffix for exactly this reason.
 */
export function revReceiptNumber(d = new Date()): string {
    const ymd = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
    const r = Math.random().toString(36).slice(2, 6).toUpperCase();
    return `REV-${ymd}-${r}`;
}

// Dark receipt palette. Every text tone is checked against the surface it actually sits
// on (card #141414 / chip #1a1a1a) and clears WCAG AA 4.5:1, because this gets emailed and
// printed - the old ad-hoc greys (#555 at 2.47:1, #666 at 3.21:1, #777 at 4.11:1) rendered
// washed out. Four named tones replace the nine one-off hexes that were here before.
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
      <tr><td style="padding:24px 0;border-bottom:1px solid ${D_BORDER}">
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

    // Framed by the one shared email shell (./emailShell); this is only the receipt's
    // own content.
    return emailShell({
        title: `Receipt ${d.receiptNo}`,
        preheader: `Receipt ${d.receiptNo} from Revil`,
        kicker: 'Receipt',
        footerHtml: `<div style="color:${D_FAINT}">Thank you - Revil</div>
        <div style="color:${ACCENT};margin-top:4px">Mohammed Ahmed &middot; hello@temrevil.com &middot; temrevil.com</div>`,
        bodyHtml: `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:separate">

      <tr><td style="padding:0 0 24px;border-bottom:1px solid ${D_BORDER}">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
          <td style="vertical-align:top">
            <div style="font-size:11px;color:${D_FAINT};text-transform:uppercase;letter-spacing:0.5px;margin-bottom:6px">Bill to</div>
            <div style="font-size:16px;font-weight:700;color:#fff">${d.customerName ? esc(d.customerName) : '&ndash;'}</div>
            ${d.customerSubtitle ? `<div style="font-size:13px;color:${D_MUTED};margin-top:2px">${esc(d.customerSubtitle)}</div>` : ''}
          </td>
          <td style="vertical-align:top;text-align:right">
            <div style="font-size:12px;color:${D_MUTED}">${esc(d.receiptNo)}</div>
            <div style="font-size:12px;color:${D_MUTED}">${esc(d.dateLabel)}</div>
          </td>
        </tr></table>
      </td></tr>
${workLogHtml}
      <tr><td style="padding:24px 0">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse">
          <tr style="font-size:11px;color:${D_FAINT};text-transform:uppercase;letter-spacing:0.5px">
            <td style="padding:0 0 12px;text-align:left">Item</td>
            <td style="padding:0 0 12px;text-align:right">Amount</td>
          </tr>
${itemRows}
        </table>
      </td></tr>

      <tr><td style="padding:8px 0 0">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse">
${totalRows}${grandRow}
        </table>
        ${totalsNote}
        ${d.note ? `<div style="font-size:12px;color:${D_MUTED};margin-top:16px;background:${D_CHIP};border:1px solid ${D_BORDER};border-radius:10px;padding:12px 14px;line-height:1.6">${esc(d.note)}</div>` : ''}
      </td></tr>

    </table>`,
    });
}
