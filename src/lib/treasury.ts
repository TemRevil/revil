/**
 * Treasury - pure logic layer (no React).
 *
 * Holds the data model, multi-currency math, the natural-language command
 * parser that powers the dictate/type "agent" box, the insight generator that
 * surfaces money suggestions, and the standalone-HTML report builder.
 *
 * Storage: a single Firestore doc `Treasury/Main` (admin-only via the catch-all
 * rule, so prices/earnings are never public). The public Hero "Projects Being
 * Handled" list is mirrored a sanitized subset of these projects.
 */

export type Currency = 'USD' | 'EGP' | 'EUR';
export const CURRENCIES: Currency[] = ['USD', 'EGP', 'EUR'];

export const CURRENCY_SYMBOL: Record<Currency, string> = {
    USD: '$',
    EGP: 'E£',
    EUR: '€',
};

export type ProjectStatus = 'active' | 'pending' | 'completed';
export type PaymentStatus = 'unpaid' | 'partial' | 'paid';

export interface TreasuryProject {
    id: string;
    name: string;
    client?: string;
    status: ProjectStatus;
    priceAmount: number;          // contracted price (or, if monthly, the monthly rate), in priceCurrency
    priceCurrency: Currency;
    monthly?: boolean;            // a retainer that pays priceAmount every month
    paymentStatus: PaymentStatus;
    paidAmount: number;           // received so far, in priceCurrency
    notes?: string;
    startDate?: string | null;    // 'YYYY-MM-DD'
    endDate?: string | null;      // 'YYYY-MM-DD' (set when marked done)
    done: boolean;
    order: number;
    createdAt: number;            // ms epoch
}

export interface TreasuryExpense {
    id: string;
    label: string;
    amount: number;
    currency: Currency;
    category?: string;
    date: string;                 // 'YYYY-MM-DD'
    recurring?: boolean;          // a monthly fee
    projectId?: string;           // optional: a fee tied to a specific project
    notes?: string;
    createdAt: number;
}

// A dated payment received. Optionally tied to a project (money earned FROM it),
// logged whenever it actually arrives - not necessarily at the project's start.
export interface TreasuryIncome {
    id: string;
    amount: number;
    currency: Currency;
    date: string;                 // 'YYYY-MM-DD' - when the money came in
    projectId?: string;           // optional link to the project it's from
    note?: string;
    createdAt: number;
}

// Exchange rates expressed as "units of this currency per 1 USD". Editable by
// the admin (live FX would need a paid API; manual keeps the site free + offline).
export type Rates = Record<Currency, number>;

export const DEFAULT_RATES: Rates = { USD: 1, EGP: 48, EUR: 0.92 };

export interface TreasuryConfig {
    defaultCurrency: Currency;    // used when a command omits a currency
    displayCurrency: Currency;    // currency the cards/totals are shown in
    rates: Rates;
    ratesUpdatedAt?: number;      // ms epoch of the last live-FX refresh
}

// Free, keyless, CORS-enabled FX source (includes EGP, unlike ECB-only feeds).
const FX_ENDPOINT = 'https://open.er-api.com/v6/latest/USD';

/** Pull live USD-based rates from the internet. Returns null on any failure. */
export async function fetchLiveRates(): Promise<{ rates: Rates; updatedAt: number } | null> {
    try {
        const res = await fetch(FX_ENDPOINT);
        if (!res.ok) return null;
        const json = await res.json() as { result?: string; rates?: Record<string, number> };
        if (json.result !== 'success' || !json.rates) return null;
        const r = json.rates;
        const rates: Rates = {
            USD: 1,
            EGP: typeof r.EGP === 'number' ? r.EGP : DEFAULT_RATES.EGP,
            EUR: typeof r.EUR === 'number' ? r.EUR : DEFAULT_RATES.EUR,
        };
        return { rates, updatedAt: Date.now() };
    } catch {
        return null;
    }
}

export const DEFAULT_CONFIG: TreasuryConfig = {
    defaultCurrency: 'USD',
    displayCurrency: 'USD',
    rates: { ...DEFAULT_RATES },
};

export interface TreasuryData {
    config: TreasuryConfig;
    projects: TreasuryProject[];
    expenses: TreasuryExpense[];
    income: TreasuryIncome[];
}

// ---------------------------------------------------------------------------
// Ids & money math
// ---------------------------------------------------------------------------

export function uid(prefix = 'p'): string {
    return `${prefix}_${Math.random().toString(36).slice(2, 9)}${Date.now().toString(36).slice(-4)}`;
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
    return `${CURRENCY_SYMBOL[currency]}${num}`;
}

export interface TreasuryTotals {
    earned: number;       // received (paid) money, in display currency
    outstanding: number;  // contracted minus received, in display currency
    contracted: number;   // total contracted price, in display currency
    spent: number;        // total expenses, in display currency
    net: number;          // earned - spent
    currency: Currency;
}

/** Sum of income entries linked to a project, in that project's own currency. */
export function linkedIncome(projectId: string, income: TreasuryIncome[], toCurrency: Currency, rates: Rates): number {
    return (income || [])
        .filter(i => i.projectId === projectId)
        .reduce((s, i) => s + convert(i.amount || 0, i.currency, toCurrency, rates), 0);
}

/**
 * How much a project has received, in its own currency: its (legacy) manual
 * paidAmount PLUS every income entry logged against it. So earnings can be
 * recorded over time, not only when the project is created.
 */
export function projectReceived(p: TreasuryProject, income: TreasuryIncome[], rates: Rates): number {
    return (p.paidAmount || 0) + linkedIncome(p.id, income, p.priceCurrency, rates);
}

export function computeTotals(data: TreasuryData): TreasuryTotals {
    const { displayCurrency: cur, rates } = data.config;
    let earned = 0, outstanding = 0, contracted = 0, spent = 0;

    for (const p of data.projects) {
        // Monthly retainers have no fixed total - priceAmount is a per-month rate,
        // so they don't contribute to contracted/outstanding.
        if (p.monthly) continue;
        const price = convert(p.priceAmount || 0, p.priceCurrency, cur, rates);
        const received = convert(projectReceived(p, data.income, rates), p.priceCurrency, cur, rates);
        contracted += price;
        outstanding += Math.max(0, price - received);
    }
    // Earned = every payment actually received: legacy per-project paidAmount +
    // all logged income (linked or standalone). No double counting - income is
    // never folded into paidAmount.
    for (const p of data.projects) earned += convert(p.monthly ? (p.paidAmount || 0) : Math.min(p.paidAmount || 0, p.priceAmount || p.paidAmount || 0), p.priceCurrency, cur, rates);
    for (const i of (data.income || [])) earned += convert(i.amount || 0, i.currency, cur, rates);

    for (const e of data.expenses) spent += convert(e.amount || 0, e.currency, cur, rates);
    return { earned, outstanding, contracted, spent, net: earned - spent, currency: cur };
}

/** Per-project remaining balance (price − received), in the project's own currency. */
export function projectBalance(p: TreasuryProject, income: TreasuryIncome[], rates: Rates): number {
    return Math.max(0, (p.priceAmount || 0) - projectReceived(p, income, rates));
}

export function derivePaymentStatus(p: Pick<TreasuryProject, 'priceAmount' | 'paidAmount'>): PaymentStatus {
    if (!p.priceAmount) return 'unpaid';
    if (p.paidAmount >= p.priceAmount) return 'paid';
    if (p.paidAmount > 0) return 'partial';
    return 'unpaid';
}

/** Payment status using total received (paidAmount + linked income). */
export function projectPaymentStatus(p: TreasuryProject, income: TreasuryIncome[], rates: Rates): PaymentStatus {
    if (!p.priceAmount) return 'unpaid';
    const received = projectReceived(p, income, rates);
    if (received >= p.priceAmount) return 'paid';
    if (received > 0) return 'partial';
    return 'unpaid';
}

// ---------------------------------------------------------------------------
// Expense templates (repeat suggestions) & money-modal project option lists
// ---------------------------------------------------------------------------

export interface ExpenseTemplate {
    label: string;
    amount: number;
    currency: Currency;
    category?: string;
    recurring?: boolean;
    count: number;       // how many times this label has been logged
    lastUsed: number;    // createdAt (ms) of the most recent occurrence
}

/**
 * Distinct expense "templates" built from past expenses, so a repeated cost can be
 * re-added in one tap instead of retyped. Grouped case-insensitively by label; each
 * template carries the MOST RECENT amount/currency/category/recurring plus a usage
 * count. Sorted by frequency, then recency.
 */
export function expenseTemplates(expenses: TreasuryExpense[]): ExpenseTemplate[] {
    const byLabel = new Map<string, ExpenseTemplate>();
    for (const e of expenses || []) {
        const label = (e.label || '').trim();
        const key = label.toLowerCase();
        if (!key) continue;
        const at = e.createdAt || 0;
        const prev = byLabel.get(key);
        if (!prev) {
            byLabel.set(key, { label, amount: e.amount || 0, currency: e.currency, category: e.category, recurring: e.recurring, count: 1, lastUsed: at });
        } else {
            prev.count += 1;
            if (at >= prev.lastUsed) {
                // Keep the most recent occurrence's details as the template.
                prev.lastUsed = at;
                prev.label = label;
                prev.amount = e.amount || 0;
                prev.currency = e.currency;
                prev.category = e.category;
                prev.recurring = e.recurring;
            }
        }
    }
    return Array.from(byLabel.values()).sort((a, b) => b.count - a.count || b.lastUsed - a.lastUsed);
}

/** Levenshtein edit distance (insertions/deletions/substitutions). Two-row DP. */
export function levenshtein(a: string, b: string): number {
    if (a === b) return 0;
    const m = a.length, n = b.length;
    if (!m) return n;
    if (!n) return m;
    let prev = Array.from({ length: n + 1 }, (_, j) => j);
    for (let i = 1; i <= m; i++) {
        const curr = [i];
        const ai = a.charCodeAt(i - 1);
        for (let j = 1; j <= n; j++) {
            const cost = ai === b.charCodeAt(j - 1) ? 0 : 1;
            curr[j] = Math.min(prev[j] + 1, curr[j - 1] + 1, prev[j - 1] + cost);
        }
        prev = curr;
    }
    return prev[n];
}

/**
 * Templates relevant to what's being typed. Substring matches rank first; the rest
 * fall back to a Levenshtein fuzzy match (vs the whole label and each word) so typos
 * and near-misses still surface. Empty query → nothing (suggestions are type-driven,
 * not shown on focus). An exact, identical label is omitted.
 */
export function matchExpenseTemplates(query: string, expenses: TreasuryExpense[], limit = 6): ExpenseTemplate[] {
    const q = (query || '').trim().toLowerCase();
    if (!q) return [];
    const threshold = Math.max(2, Math.ceil(q.length * 0.45)); // allowed edit distance
    const scored: { t: ExpenseTemplate; rank: number; score: number }[] = [];
    for (const t of expenseTemplates(expenses)) {
        const l = t.label.toLowerCase();
        if (l === q) continue;                                  // already typed in full
        const idx = l.indexOf(q);
        if (idx >= 0) { scored.push({ t, rank: 0, score: idx }); continue; } // substring
        let dist = levenshtein(q, l);
        for (const w of l.split(/\s+/)) dist = Math.min(dist, levenshtein(q, w));
        if (dist <= threshold) scored.push({ t, rank: 1, score: dist });     // fuzzy
    }
    scored.sort((a, b) => a.rank - b.rank || a.score - b.score || b.t.count - a.t.count || b.t.lastUsed - a.t.lastUsed);
    return scored.slice(0, limit).map(s => s.t);
}

/** Distinct expense categories used before, ranked by frequency then recency. */
export function expenseCategories(expenses: TreasuryExpense[]): string[] {
    const counts = new Map<string, { name: string; count: number; lastUsed: number }>();
    for (const e of expenses || []) {
        const name = (e.category || '').trim();
        if (!name) continue;
        const key = name.toLowerCase();
        const at = e.createdAt || 0;
        const prev = counts.get(key);
        if (!prev) counts.set(key, { name, count: 1, lastUsed: at });
        else { prev.count += 1; if (at >= prev.lastUsed) { prev.lastUsed = at; prev.name = name; } }
    }
    return Array.from(counts.values()).sort((a, b) => b.count - a.count || b.lastUsed - a.lastUsed).map(c => c.name);
}

/**
 * Past categories relevant to what's typed. Empty query → the full list (so the
 * menu can be browsed on focus); otherwise substring matches first, then a
 * Levenshtein fuzzy fallback. An exact, identical value is omitted.
 */
export function matchCategories(query: string, categories: string[], limit = 8): string[] {
    const q = (query || '').trim().toLowerCase();
    if (!q) return categories.slice(0, limit);
    const threshold = Math.max(2, Math.ceil(q.length * 0.45));
    const scored: { name: string; rank: number; score: number }[] = [];
    for (const name of categories) {
        const l = name.toLowerCase();
        if (l === q) continue;
        const idx = l.indexOf(q);
        if (idx >= 0) { scored.push({ name, rank: 0, score: idx }); continue; }
        let dist = levenshtein(q, l);
        for (const w of l.split(/\s+/)) dist = Math.min(dist, levenshtein(q, w));
        if (dist <= threshold) scored.push({ name, rank: 1, score: dist });
    }
    scored.sort((a, b) => a.rank - b.rank || a.score - b.score);
    return scored.slice(0, limit).map(s => s.name);
}

/** Projects an EXPENSE can be linked to: exclude finished/completed projects. */
export function expenseProjectOptions(projects: TreasuryProject[]): TreasuryProject[] {
    return (projects || []).filter(p => !p.done && p.status !== 'completed');
}

/**
 * Projects INCOME can be linked to: keep any that still owe money (unpaid or
 * partial) so a late payment can be logged - even if the project is marked done -
 * plus monthly retainers (which keep receiving). Fully-paid one-offs drop off.
 */
export function incomeProjectOptions(projects: TreasuryProject[], income: TreasuryIncome[], rates: Rates): TreasuryProject[] {
    return (projects || []).filter(p => p.monthly || projectPaymentStatus(p, income, rates) !== 'paid');
}

// ---------------------------------------------------------------------------
// Monthly series (for the earnings vs spendings chart)
// ---------------------------------------------------------------------------

export interface MonthPoint {
    month: string;     // 'YYYY-MM'
    label: string;     // 'Mar' or "Mar '26"
    earned: number;
    spent: number;
}

function monthKey(date: string | number): string {
    const d = typeof date === 'number' ? new Date(date) : new Date(`${date}T00:00:00`);
    if (Number.isNaN(d.getTime())) return '';
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** Last `count` months of earnings (by end/created date) vs spendings (by date). */
export function monthlySeries(data: TreasuryData, count = 6): MonthPoint[] {
    const { displayCurrency: cur, rates } = data.config;
    const now = new Date();
    const points: MonthPoint[] = [];
    const index = new Map<string, MonthPoint>();

    for (let i = count - 1; i >= 0; i--) {
        const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
        const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
        const label = i === 0 || d.getMonth() === 0 ? `${MONTHS[d.getMonth()]} '${String(d.getFullYear()).slice(2)}` : MONTHS[d.getMonth()];
        const point: MonthPoint = { month: key, label, earned: 0, spent: 0 };
        points.push(point);
        index.set(key, point);
    }

    for (const p of data.projects) {
        if (!p.paidAmount) continue;
        const key = monthKey(p.endDate || p.startDate || p.createdAt);
        const point = index.get(key);
        if (point) point.earned += convert(Math.min(p.paidAmount, p.priceAmount || p.paidAmount), p.priceCurrency, cur, rates);
    }
    for (const e of data.expenses) {
        const point = index.get(monthKey(e.date || e.createdAt));
        if (point) point.spent += convert(e.amount || 0, e.currency, cur, rates);
    }
    return points;
}

// ---------------------------------------------------------------------------
// Continuous daily series (powers the day/week/month paginated chart)
// ---------------------------------------------------------------------------

export interface DaySeriesPoint { date: string; earned: number; spent: number; }

const dayKey = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const toDay = (s: string | null | undefined, fallbackMs?: number) =>
    s || (fallbackMs ? dayKey(new Date(fallbackMs)) : '');

/**
 * One point per calendar day from the FIRST recorded entry through today
 * (zero-filled on quiet days), in the display currency. Earnings are attributed
 * to a project's end/start date; expenses to their own date.
 */
export function buildDailySeries(data: TreasuryData): DaySeriesPoint[] {
    const { displayCurrency: cur, rates } = data.config;
    const earned: Record<string, number> = {};
    const spent: Record<string, number> = {};

    for (const p of data.projects) {
        if (!p.paidAmount) continue;
        const day = toDay(p.endDate || p.startDate, p.createdAt);
        if (day) earned[day] = (earned[day] || 0) + convert(Math.min(p.paidAmount, p.priceAmount || p.paidAmount), p.priceCurrency, cur, rates);
    }
    for (const i of (data.income || [])) {
        const day = toDay(i.date, i.createdAt);
        if (day) earned[day] = (earned[day] || 0) + convert(i.amount || 0, i.currency, cur, rates);
    }
    for (const e of data.expenses) {
        const day = toDay(e.date, e.createdAt);
        if (day) spent[day] = (spent[day] || 0) + convert(e.amount || 0, e.currency, cur, rates);
    }

    const days = Array.from(new Set([...Object.keys(earned), ...Object.keys(spent)])).filter(Boolean).sort();
    if (!days.length) return [];

    const start = new Date(`${days[0]}T00:00:00`);
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const out: DaySeriesPoint[] = [];
    for (const d = new Date(start); d <= today; d.setDate(d.getDate() + 1)) {
        const key = dayKey(d);
        out.push({ date: key, earned: earned[key] || 0, spent: spent[key] || 0 });
    }
    return out;
}

// ---------------------------------------------------------------------------
// Insights - money suggestions surfaced on the page
// ---------------------------------------------------------------------------

export type InsightTone = 'good' | 'warn' | 'info';
export type InsightIcon = 'outstanding' | 'invoice' | 'ratio' | 'profit' | 'loss' | 'noprice' | 'running' | 'recurring' | 'empty';
export interface Insight { tone: InsightTone; icon: InsightIcon; label: string; text: string; }

function daysBetween(from: string | null | undefined, to: Date): number | null {
    if (!from) return null;
    const d = new Date(`${from}T00:00:00`);
    if (Number.isNaN(d.getTime())) return null;
    return Math.floor((to.getTime() - d.getTime()) / 86400000);
}

export function buildInsights(data: TreasuryData): Insight[] {
    const out: Insight[] = [];
    const t = computeTotals(data);
    const cur = data.config.displayCurrency;
    const rates = data.config.rates;
    const now = new Date();

    // Outstanding receivables
    const owing = data.projects.filter(p => projectBalance(p, data.income, rates) > 0);
    if (t.outstanding > 0) {
        out.push({
            tone: 'warn', icon: 'outstanding', label: 'Outstanding',
            text: `${formatMoney(t.outstanding, cur)} owed across ${owing.length} project${owing.length === 1 ? '' : 's'} - consider following up.`,
        });
    }

    // Done but not fully paid → invoice it
    const doneUnpaid = data.projects.filter(p => p.done && projectPaymentStatus(p, data.income, rates) !== 'paid' && p.priceAmount > 0);
    for (const p of doneUnpaid.slice(0, 2)) {
        out.push({ tone: 'warn', icon: 'invoice', label: 'Invoice due', text: `"${p.name}" is finished but still ${projectPaymentStatus(p, data.income, rates)} - time to invoice the rest.` });
    }

    // Spend ratio
    if (t.earned > 0 && t.spent > 0) {
        const pct = Math.round((t.spent / t.earned) * 100);
        out.push({
            tone: pct > 60 ? 'warn' : 'info', icon: 'ratio', label: 'Spend ratio',
            text: `Spendings are ${pct}% of what you've earned${pct > 60 ? ' - margins are thin.' : '.'}`,
        });
    }
    if (t.net < 0) {
        out.push({ tone: 'warn', icon: 'loss', label: 'Net negative', text: `You're down ${formatMoney(Math.abs(t.net), cur)} - spendings exceed received income.` });
    } else if (t.earned > 0) {
        out.push({ tone: 'good', icon: 'profit', label: 'Net profit', text: `You're up ${formatMoney(t.net, cur)} after spendings.` });
    }

    // Monthly retainer income
    const retainers = data.projects.filter(p => p.monthly && !p.done && p.priceAmount > 0);
    if (retainers.length) {
        const perMonth = retainers.reduce((s, p) => s + convert(p.priceAmount, p.priceCurrency, cur, rates), 0);
        out.push({ tone: 'good', icon: 'profit', label: 'Retainers', text: `${formatMoney(perMonth, cur)}/mo expected from ${retainers.length} monthly project${retainers.length === 1 ? '' : 's'}.` });
    }

    // Missing prices
    const noPrice = data.projects.filter(p => !p.priceAmount);
    if (noPrice.length) {
        out.push({ tone: 'info', icon: 'noprice', label: 'Missing price', text: `${noPrice.length} project${noPrice.length === 1 ? ' has' : 's have'} no price set - add one to track earnings.` });
    }

    // Long-running active projects
    for (const p of data.projects.filter(p => !p.done && p.startDate)) {
        const days = daysBetween(p.startDate, now);
        if (days !== null && days >= 30) {
            out.push({ tone: 'info', icon: 'running', label: 'Long-running', text: `"${p.name}" has been running ${days} days and isn't marked done.` });
            break;
        }
    }

    // Recurring expense burn
    const recurring = data.expenses.filter(e => e.recurring);
    if (recurring.length) {
        const monthly = recurring.reduce((s, e) => s + convert(e.amount, e.currency, cur, data.config.rates), 0);
        out.push({ tone: 'info', icon: 'recurring', label: 'Recurring', text: `Recurring expenses total ${formatMoney(monthly, cur)}/mo across ${recurring.length} item${recurring.length === 1 ? '' : 's'}.` });
    }

    if (!out.length) {
        out.push({ tone: 'info', icon: 'empty', label: 'Get started', text: 'Add a project price or an expense, and tailored suggestions will appear here.' });
    }

    // Severity order: warnings first, then good news, then info.
    const rank: Record<InsightTone, number> = { warn: 0, good: 1, info: 2 };
    return out.sort((a, b) => rank[a.tone] - rank[b.tone]);
}

// ---------------------------------------------------------------------------
// Standalone HTML report export
// ---------------------------------------------------------------------------

const esc = (s: string) =>
    String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c] as string));

export function buildHtmlReport(data: TreasuryData, generatedAt: Date): string {
    const t = computeTotals(data);
    const cur = data.config.displayCurrency;
    const date = generatedAt.toISOString().slice(0, 10);
    const sorted = [...data.projects].sort((a, b) => a.order - b.order);

    const card = (label: string, value: string, accent: string) =>
        `<div class="card"><span class="k">${esc(label)}</span><span class="v" style="color:${accent}">${esc(value)}</span></div>`;

    const rates = data.config.rates;
    const projectRows = sorted.map(p => {
        const received = projectReceived(p, data.income, rates);
        const status = projectPaymentStatus(p, data.income, rates);
        return `
        <tr>
          <td><b>${esc(p.name)}</b>${p.client ? `<div class="sub">${esc(p.client)}</div>` : ''}</td>
          <td><span class="pill ${p.status}">${esc(p.status)}</span></td>
          <td>${p.priceAmount ? formatMoney(p.priceAmount, p.priceCurrency) : '-'}${p.monthly ? '/mo' : ''}</td>
          <td><span class="pay ${status}">${p.monthly ? 'monthly' : status}</span></td>
          <td>${formatMoney(received, p.priceCurrency)}</td>
          <td>${esc(p.startDate || '-')} → ${esc(p.endDate || (p.done ? '-' : 'ongoing'))}</td>
          <td class="notes">${esc(p.notes || '')}</td>
        </tr>`;
    }).join('');

    const projById = new Map(data.projects.map(p => [p.id, p.name]));
    const incomeRows = [...(data.income || [])]
        .sort((a, b) => (b.date || '').localeCompare(a.date || ''))
        .map(i => `
        <tr>
          <td><b>${formatMoney(i.amount, i.currency)}</b></td>
          <td>${esc(i.projectId ? (projById.get(i.projectId) || '-') : '-')}</td>
          <td>${esc(i.date || '-')}</td>
          <td class="notes">${esc(i.note || '')}</td>
        </tr>`).join('');

    const expenseRows = [...data.expenses]
        .sort((a, b) => (b.date || '').localeCompare(a.date || ''))
        .map(e => `
        <tr>
          <td><b>${esc(e.label)}</b>${e.recurring ? ' <span class="pill recurring">recurring</span>' : ''}${e.projectId ? `<div class="sub">${esc(projById.get(e.projectId) || '')}</div>` : ''}</td>
          <td>${esc(e.category || '-')}</td>
          <td>${formatMoney(e.amount, e.currency)}</td>
          <td>${esc(e.date || '-')}</td>
        </tr>`).join('');

    return `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Treasury Report - ${date}</title>
<style>
  :root{--bg:#0b0b0f;--panel:#15151c;--line:#26262f;--text:#e9e9f0;--muted:#9b9bab;--green:#22c55e;--red:#f87171;--amber:#f59e0b;}
  *{box-sizing:border-box} body{margin:0;font:15px/1.5 -apple-system,BlinkMacSystemFont,"Segoe UI",Inter,sans-serif;background:var(--bg);color:var(--text);padding:32px}
  .wrap{max-width:1000px;margin:0 auto}
  h1{font-size:26px;margin:0 0 4px} .meta{color:var(--muted);margin-bottom:28px}
  .cards{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:14px;margin-bottom:32px}
  .card{background:var(--panel);border:1px solid var(--line);border-radius:16px;padding:18px;display:flex;flex-direction:column;gap:6px}
  .card .k{color:var(--muted);font-size:12px;text-transform:uppercase;letter-spacing:.08em}
  .card .v{font-size:24px;font-weight:800}
  h2{font-size:16px;margin:28px 0 12px;color:var(--muted);text-transform:uppercase;letter-spacing:.08em}
  table{width:100%;border-collapse:collapse;background:var(--panel);border:1px solid var(--line);border-radius:16px;overflow:hidden}
  th,td{text-align:left;padding:12px 14px;border-bottom:1px solid var(--line);vertical-align:top}
  th{color:var(--muted);font-size:11px;text-transform:uppercase;letter-spacing:.08em}
  tr:last-child td{border-bottom:none}
  .sub{color:var(--muted);font-size:12px} .notes{color:var(--muted);font-size:13px;max-width:240px}
  .pill,.pay{font-size:11px;font-weight:700;padding:3px 9px;border-radius:999px;text-transform:capitalize}
  .pill.active{background:rgba(59,130,246,.15);color:#60a5fa} .pill.pending{background:rgba(245,158,11,.15);color:var(--amber)}
  .pill.completed{background:rgba(34,197,94,.15);color:var(--green)} .pill.recurring{background:rgba(148,163,184,.18);color:#cbd5e1}
  .pay.paid{background:rgba(34,197,94,.15);color:var(--green)} .pay.partial{background:rgba(245,158,11,.15);color:var(--amber)}
  .pay.unpaid{background:rgba(248,113,113,.15);color:var(--red)}
  footer{margin-top:32px;color:var(--muted);font-size:12px;text-align:center}
</style></head><body><div class="wrap">
  <h1>Treasury Report</h1>
  <div class="meta">Generated ${esc(generatedAt.toLocaleString())} · Totals in ${cur}</div>
  <div class="cards">
    ${card('Received', formatMoney(t.earned, cur), 'var(--green)')}
    ${card('Outstanding', formatMoney(t.outstanding, cur), 'var(--amber)')}
    ${card('Spent', formatMoney(t.spent, cur), 'var(--red)')}
    ${card('Net profit', formatMoney(t.net, cur), t.net >= 0 ? 'var(--green)' : 'var(--red)')}
  </div>
  <h2>Projects (${sorted.length})</h2>
  <table><thead><tr><th>Project</th><th>Status</th><th>Price</th><th>Payment</th><th>Received</th><th>Timeline</th><th>Notes</th></tr></thead>
  <tbody>${projectRows || '<tr><td colspan="7" style="color:var(--muted)">No projects yet.</td></tr>'}</tbody></table>
  <h2>Income (${(data.income || []).length})</h2>
  <table><thead><tr><th>Amount</th><th>Project</th><th>Date</th><th>Note</th></tr></thead>
  <tbody>${incomeRows || '<tr><td colspan="4" style="color:var(--muted)">No income logged yet.</td></tr>'}</tbody></table>
  <h2>Expenses (${data.expenses.length})</h2>
  <table><thead><tr><th>Item</th><th>Category</th><th>Amount</th><th>Date</th></tr></thead>
  <tbody>${expenseRows || '<tr><td colspan="4" style="color:var(--muted)">No expenses yet.</td></tr>'}</tbody></table>
  <footer>The State of Revil - Treasury · ${date}</footer>
</div></body></html>`;
}
