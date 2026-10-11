/**
 * Treasury money math - the ONE definition of what a project has received, what it is
 * owed, an account's balance and the treasury totals.
 *
 * The dashboard (src/lib/treasury.ts re-exports all of this) and the AI tools in the
 * Cloud Functions (functions/src/mcp.ts) both read from it, so the assistant can never
 * quote a figure the dashboard would not show. The functions build copies this file to
 * functions/src/money.ts (functions/scripts/sync-shared.mjs): edit it here. It must stay
 * dependency-free.
 */

export type Currency = 'USD' | 'EGP' | 'EUR';
export const CURRENCIES: Currency[] = ['USD', 'EGP', 'EUR'];

export const CURRENCY_SYMBOL: Record<Currency, string> = {
    USD: '$',
    EGP: 'E£',
    EUR: '€',
};

// Exchange rates expressed as "units of this currency per 1 USD". Editable by
// the admin (live FX would need a paid API; manual keeps the site free + offline).
export type Rates = Record<Currency, number>;

export const DEFAULT_RATES: Rates = { USD: 1, EGP: 48, EUR: 0.92 };

export type PaymentStatus = 'unpaid' | 'partial' | 'paid';

/** The fields of a treasury project the money math reads. */
export interface MoneyProject {
    id?: string;
    status?: string;
    priceAmount?: number;         // contracted price (or, if monthly, the monthly rate), in priceCurrency
    priceCurrency: Currency;
    paidAmount?: number;          // legacy manual "received so far", in priceCurrency
    monthly?: boolean;
    installmentMonths?: number;
    installmentPercent?: number;
    nextPaymentDate?: string | null;
    startDate?: string | null;
}

export interface MoneyIncome {
    amount?: number;
    date?: string;                // 'YYYY-MM-DD' - when the money came in
    createdAt?: number;           // ms epoch - when the entry was logged
    currency: Currency;
    projectId?: string;
    accountId?: string;
    monthlyPayment?: boolean;
}

export interface MoneyExpense {
    amount?: number;
    currency: Currency;
    accountId?: string;
    clientPaid?: boolean;
}

export interface MoneyAccount {
    id?: string;
    currency: Currency;
    openingBalance?: number;
    excludeFromNetProfit?: boolean;
}

/** Convert an amount between currencies using units-per-USD rates. */
export function convert(amount: number, from: Currency, to: Currency, rates: Rates): number {
    if (!amount || from === to) return amount || 0;
    const fromRate = rates[from] || DEFAULT_RATES[from];
    const toRate = rates[to] || DEFAULT_RATES[to];
    const usd = amount / fromRate;
    return usd * toRate;
}

/** Pretty money in a given currency, no fractional noise for whole amounts. */
export function formatMoney(amount: number, currency: Currency): string {
    const rounded = Math.round((amount + Number.EPSILON) * 100) / 100;
    const hasFraction = Math.abs(rounded % 1) > 0.001;
    const num = new Intl.NumberFormat('en-US', {
        minimumFractionDigits: hasFraction ? 2 : 0,
        maximumFractionDigits: 2,
    }).format(rounded);
    return `${CURRENCY_SYMBOL[currency] || ''}${num}`;
}

export interface TreasuryTotals {
    earned: number;       // received (paid) money, in display currency
    outstanding: number;  // contracted minus received, in display currency
    contracted: number;   // total contracted price, in display currency
    spent: number;        // total expenses, in display currency
    net: number;          // earned - spent
    currency: Currency;
}

/**
 * How much a project has received, in its own currency: its (legacy) manual
 * paidAmount PLUS the income logged against it. So earnings can be recorded
 * over time, not only when the project is created.
 *
 * For a MONTHLY retainer, "received" means the retainer that's been paid, so it
 * counts ONLY income flagged as the month's payment (monthlyPayment) - one-off
 * or goodwill income linked to the project is real money (it still shows in the
 * ledger and the global earned total) but is not part of the retainer tally.
 * One-off projects have no such flag, so every linked payment counts.
 */
export function projectReceived(p: MoneyProject, income: MoneyIncome[], rates: Rates): number {
    const linked = (income || []).filter(i =>
        p.id !== undefined && i.projectId === p.id && (!p.monthly || i.monthlyPayment)
    );
    const sum = linked.reduce((s, i) => s + convert(i.amount || 0, i.currency, p.priceCurrency, rates), 0);
    return (p.paidAmount || 0) + sum;
}

/**
 * The individual income entries behind a project's received total, oldest first. Uses the
 * SAME filter as projectReceived (a retainer counts only flagged monthly payments), so a
 * listing of payments can never disagree with the Paid figure sitting next to it. The
 * legacy per-project paidAmount carries no date, so it deliberately has no entry here -
 * callers that need the complete total must still use projectReceived.
 */
export function projectPayments<T extends MoneyIncome>(p: MoneyProject, income: T[]): T[] {
    return (income || [])
        .filter(i => p.id !== undefined && i.projectId === p.id && (!p.monthly || i.monthlyPayment))
        .sort((a, b) => (a.date || '').localeCompare(b.date || '') || (a.createdAt || 0) - (b.createdAt || 0));
}

/** Ids of accounts marked to be left out of Net profit and its trend series. */
export function excludedAccountIds(accounts: MoneyAccount[]): Set<string> {
    const ids = new Set<string>();
    for (const a of accounts || []) if (a.excludeFromNetProfit && a.id) ids.add(a.id);
    return ids;
}

/** What computeTotals reads: the display currency, the rates and the four ledgers. */
export interface MoneyLedger {
    config: { displayCurrency: Currency; rates: Rates };
    projects: MoneyProject[];
    income: MoneyIncome[];
    expenses: MoneyExpense[];
    accounts: MoneyAccount[];
}

export function computeTotals(data: MoneyLedger): TreasuryTotals {
    const { displayCurrency: cur, rates } = data.config;
    const excluded = excludedAccountIds(data.accounts);
    let earned = 0, outstanding = 0, contracted = 0, spent = 0;

    for (const p of data.projects) {
        // Monthly retainers have no fixed total - priceAmount is a per-month rate,
        // so they don't contribute to contracted/outstanding.
        if (p.monthly) continue;
        // Owed = price + any installment surcharge (identical to price when there's no plan).
        const price = convert(projectContractTotal(p), p.priceCurrency, cur, rates);
        const received = convert(projectReceived(p, data.income, rates), p.priceCurrency, cur, rates);
        contracted += price;
        // A CLOSED project is one the client walked away from without paying, so
        // its balance is not money still expected - counting it would quietly
        // inflate the receivables figure with debt already written off. It stays
        // in `contracted`, which records what was agreed, not what is coming.
        if (p.status === 'closed') continue;
        outstanding += Math.max(0, price - received);
    }
    // Earned = every payment actually received: legacy per-project paidAmount +
    // all logged income (linked or standalone). No double counting - income is
    // never folded into paidAmount. Income tied to an excluded account is left
    // out (legacy paidAmount has no account, so it always counts).
    for (const p of data.projects) earned += convert(p.monthly ? (p.paidAmount || 0) : Math.min(p.paidAmount || 0, p.priceAmount || p.paidAmount || 0), p.priceCurrency, cur, rates);
    for (const i of (data.income || [])) { if (i.accountId && excluded.has(i.accountId)) continue; earned += convert(i.amount || 0, i.currency, cur, rates); }

    // Client-paid expenses are recorded for reference only - they're not my money.
    // Expenses paid from an excluded account are likewise left out of Net profit.
    for (const e of data.expenses) {
        if (e.clientPaid) continue;
        if (e.accountId && excluded.has(e.accountId)) continue;
        spent += convert(e.amount || 0, e.currency, cur, rates);
    }
    return { earned, outstanding, contracted, spent, net: earned - spent, currency: cur };
}

/* ── Installment plans ─────────────────────────────────────────────────────────
 * A plan splits the contracted price into `installmentMonths` equal payments, with an
 * optional surcharge charged as a % of the WHOLE price. Everything below degrades to
 * the old behaviour when the fields are absent (no percent => x1, no months => no plan),
 * so existing projects keep exactly the same numbers.
 */

/** True when the project is billed as a fixed-total installment plan. */
export function hasInstallments(p: Pick<MoneyProject, 'monthly' | 'installmentMonths'>): boolean {
    return !p.monthly && (p.installmentMonths || 0) > 1;
}

/** Contracted price plus the installment surcharge (% of the whole price). */
export function installmentTotal(p: Pick<MoneyProject, 'priceAmount' | 'installmentPercent'>): number {
    return (p.priceAmount || 0) * (1 + (p.installmentPercent || 0) / 100);
}

/** What the client pays per month under the plan (0 when there's no plan). */
export function installmentMonthlyAmount(
    p: Pick<MoneyProject, 'priceAmount' | 'installmentPercent' | 'installmentMonths' | 'monthly'>
): number {
    if (!hasInstallments(p)) return 0;
    return installmentTotal(p) / (p.installmentMonths || 1);
}

/**
 * The full amount owed on a project: the contracted price plus any installment
 * surcharge. This - not raw priceAmount - is what a client actually owes, so balance,
 * payment status and the treasury totals are all measured against it.
 * Monthly retainers have no fixed total, so they keep using the per-month rate.
 */
export function projectContractTotal(p: Pick<MoneyProject, 'priceAmount' | 'installmentPercent' | 'installmentMonths' | 'monthly'>): number {
    return hasInstallments(p) ? installmentTotal(p) : (p.priceAmount || 0);
}

/** Per-project remaining balance (total owed − received), in the project's own currency. */
export function projectBalance(p: MoneyProject, income: MoneyIncome[], rates: Rates): number {
    return Math.max(0, projectContractTotal(p) - projectReceived(p, income, rates));
}

/** Payment status using total received (paidAmount + linked income). */
export function projectPaymentStatus(p: MoneyProject, income: MoneyIncome[], rates: Rates): PaymentStatus {
    if (!p.priceAmount) return 'unpaid';
    const received = projectReceived(p, income, rates);
    if (received >= projectContractTotal(p)) return 'paid';
    if (received > 0) return 'partial';
    return 'unpaid';
}

/** A Date as 'YYYY-MM-DD' on its own (local) calendar. */
export const ymd = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

/**
 * Advance a 'YYYY-MM-DD' date by one calendar month, clamping the day to the end of
 * the target month's length so e.g. Jan 31 → Feb 28 (not an overflow into March).
 */
export function addOneMonth(dateStr: string): string {
    const d = new Date(`${dateStr}T00:00:00`);
    if (Number.isNaN(d.getTime())) return dateStr;
    const day = d.getDate();
    const lastDayOfNext = new Date(d.getFullYear(), d.getMonth() + 2, 0).getDate();
    return ymd(new Date(d.getFullYear(), d.getMonth() + 1, Math.min(day, lastDayOfNext)));
}

/**
 * The date a monthly retainer's NEXT payment falls due, once the current one is
 * confirmed received. Anchors to the project's existing scheduled date if it has
 * one (so the billing day stays fixed regardless of whether the money arrived
 * early or late); otherwise seeds the first cycle from the project's start date,
 * falling back to the payment date. Always lands one calendar month after the
 * cycle just paid.
 */
export function nextMonthlyPaymentDate(p: Pick<MoneyProject, 'nextPaymentDate' | 'startDate'>, paymentDate: string): string {
    const valid = (s?: string | null) => !!s && !Number.isNaN(new Date(`${s}T00:00:00`).getTime());
    const anchor = valid(p.nextPaymentDate) ? p.nextPaymentDate!
        : valid(p.startDate) ? p.startDate!
        : valid(paymentDate) ? paymentDate
        : ymd(new Date());
    return addOneMonth(anchor);
}

/**
 * Running balance of an account: its opening balance, plus every income logged
 * INTO it, minus every expense paid FROM it - each entry converted into the
 * account's own currency so mixed-currency activity still nets correctly.
 */
export function accountBalance(acc: MoneyAccount, income: MoneyIncome[], expenses: MoneyExpense[], rates: Rates): number {
    let bal = acc.openingBalance || 0;
    if (acc.id === undefined) return bal;
    for (const i of income || []) if (i.accountId === acc.id) bal += convert(i.amount || 0, i.currency, acc.currency, rates);
    for (const e of expenses || []) if (e.accountId === acc.id && !e.clientPaid) bal -= convert(e.amount || 0, e.currency, acc.currency, rates);
    return bal;
}
