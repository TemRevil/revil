import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { motion } from 'motion/react';
import { X, Receipt, Send, Download, Loader2, Check } from 'lucide-react';
import app from '../../lib/firebase';
import {
    Currency, CURRENCIES, TreasuryProject, TreasuryIncome, Rates,
    convert, projectReceived, projectContractTotal, hasInstallments, formatMoney,
    installmentMonthlyAmount, installmentTotal, installmentsPaidCount, retainerPaymentsCount,
} from '../../lib/treasury';
import { buildReceiptHtml, receiptNumber, ReceiptData } from '../../lib/receipt';
import Select from '../Select';
import DatePicker from '../DatePicker';

interface Props {
    projects: TreasuryProject[];
    income: TreasuryIncome[];
    rates: Rates;
    displayCurrency: Currency;
    initialProjectId?: string;
    isDark: boolean;
    onClose: () => void;
    onToast?: (msg: string, kind: 'good' | 'warn' | 'info') => void;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const today = () => new Date().toISOString().slice(0, 10);

/**
 * Receipt builder. Deliberately one template and no free-text line items: you pick the
 * projects, and every figure on the receipt (per-installment amounts, retainer months,
 * plan totals, balances) is derived from the treasury. The preview, the download and the
 * emailed body are all the same buildReceiptHtml() string, so nothing can drift.
 */
const MReceipt = ({ projects, income, rates, displayCurrency, initialProjectId, isDark, onClose, onToast }: Props) => {
    const initial = projects.find(p => p.id === initialProjectId);
    const [selected, setSelected] = useState<Set<string>>(new Set(initial ? [initial.id] : []));
    const [receiptCurrency, setReceiptCurrency] = useState<Currency>(initial?.priceCurrency ?? displayCurrency);
    const [customerName, setCustomerName] = useState(initial?.client ?? '');
    const [customerEmail, setCustomerEmail] = useState(initial?.clientEmail ?? '');
    const [issueDate, setIssueDate] = useState(today());
    // Per-project: bill ONE installment / ONE month instead of the whole contract.
    // Keyed by project id, defaulted on below for any project that is on a plan.
    const [perPayment, setPerPayment] = useState<Record<string, boolean>>({});
    const [receiptNo] = useState(() => receiptNumber());
    // 'paid' = confirming money received (thank-you). 'due' = asking for money still owed.
    const [kind, setKind] = useState<'paid' | 'due'>('paid');
    const [paidDate, setPaidDate] = useState(today());
    const [paidTime, setPaidTime] = useState('');
    const [dueDate, setDueDate] = useState('');
    const [note, setNote] = useState('');
    const [sending, setSending] = useState(false);
    const [sentTo, setSentTo] = useState<string | null>(null);

    const toggle = (id: string) => setSelected(prev => {
        const next = new Set(prev);
        if (next.has(id)) next.delete(id); else next.add(id);
        return next;
    });

    const selectedProjects = useMemo(
        () => projects.filter(p => selected.has(p.id)),
        [projects, selected],
    );

    // Auto-fill the customer + currency from the FIRST selected project as you change the
    // selection, so picking a project pulls its client/email/currency in. A field stops
    // auto-filling once you type in it (touched), so manual edits aren't clobbered.
    const primary = selectedProjects[0];
    const touched = useRef({ name: false, email: false, currency: false });
    useEffect(() => {
        if (!primary) return;
        if (!touched.current.name) setCustomerName(primary.client ?? '');
        if (!touched.current.email) setCustomerEmail(primary.clientEmail ?? '');
        if (!touched.current.currency) setReceiptCurrency(primary.priceCurrency);
    }, [primary]);

    const humanDate = (iso: string) => {
        const d = new Date(`${iso}T00:00:00`);
        return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
    };
    const dateLabel = useMemo(() => humanDate(issueDate), [issueDate]);

    // "8 August 2026" or, when a time is given, "8 August 2026, 5:00 PM".
    const paidOnLabel = useMemo(
        () => (paidDate ? `${humanDate(paidDate)}${paidTime.trim() ? `, ${paidTime.trim()}` : ''}` : ''),
        [paidDate, paidTime],
    );

    // Which month a retainer receipt covers, e.g. "August 2026". Defaults to the issue
    // date's month; editable because August's fee is routinely paid in September.
    const monthOf = (iso: string) => {
        const d = new Date(`${iso}T00:00:00`);
        return Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });
    };
    const [periodTouched, setPeriodTouched] = useState(false);
    const [periodLabel, setPeriodLabel] = useState(() => monthOf(today()));
    const derivedPeriod = monthOf(issueDate);
    const [syncedPeriodFrom, setSyncedPeriodFrom] = useState(derivedPeriod);
    if (syncedPeriodFrom !== derivedPeriod) {
        setSyncedPeriodFrom(derivedPeriod);
        if (!periodTouched && derivedPeriod) setPeriodLabel(derivedPeriod);
    }

    // Default any plan/retainer project to per-payment billing the first time it is
    // selected - that is the common case - while leaving a manual choice alone.
    const [scopedIds, setScopedIds] = useState<Set<string>>(() => new Set());
    const unscoped = selectedProjects.filter(p => !scopedIds.has(p.id));
    if (unscoped.length) {
        setScopedIds(prev => { const n = new Set(prev); unscoped.forEach(p => n.add(p.id)); return n; });
        setPerPayment(prev => {
            const n = { ...prev };
            unscoped.forEach(p => { if (hasInstallments(p) || p.monthly) n[p.id] = true; });
            return n;
        });
    }

    /**
     * How ONE project is billed, entirely derived from the treasury - the owner never types
     * an amount. `cvt` maps a native amount into the receipt currency.
     */
    const describeBilling = useCallback((p: TreasuryProject, cvt: (n: number) => number, cur: Currency) => {
        const receivedNative = projectReceived(p, income, rates);
        const single = !!perPayment[p.id] && (hasInstallments(p) || !!p.monthly);
        // A confirmation says this amount HAS been paid; a request must not - it reports
        // only what the treasury has actually recorded, or it would thank them for money
        // that never arrived.
        const settled = (billed: number, recorded: number) => (kind === 'paid' ? billed : recorded);

        // "This payment" mode: the receipt covers ONE installment / ONE month rather than
        // the whole contract, which is what a client actually gets billed month to month.
        if (single && p.monthly) {
            const n = retainerPaymentsCount(p, income);
            return {
                title: `${p.name} - ${periodLabel}`,
                // A retainer is open-ended: no denominator, and no balance to owe.
                subtitle: `Monthly retainer${n ? ` - payment ${n}` : ''}`,
                price: cvt(p.priceAmount || 0),
                paid: cvt(settled(p.priceAmount || 0, Math.min(receivedNative, p.priceAmount || 0))),
                balance: (kind === 'due'
                    ? cvt(Math.max(0, (p.priceAmount || 0) - Math.min(receivedNative, p.priceAmount || 0)))
                    : null) as number | null,
            };
        }
        if (single) {
            const months = p.installmentMonths || 0;
            const nth = Math.min(months, installmentsPaidCount(p, income, rates) || 1);
            const planTotal = installmentTotal(p);
            const surcharge = planTotal - (p.priceAmount || 0);
            return {
                title: `${p.name} - installment ${nth} of ${months}`,
                // Spell the surcharge out in MONEY: "(+6%)" alone doesn't let a client
                // reconcile 6 x 1,413.33 against the 8,000 they agreed to.
                subtitle: surcharge > 0
                    ? `Plan total ${formatMoney(cvt(planTotal), cur)} = ${formatMoney(cvt(p.priceAmount || 0), cur)} + ${p.installmentPercent}% fee ${formatMoney(cvt(surcharge), cur)}, over ${months} months`
                    : `Installment ${nth} of ${months} - plan total ${formatMoney(cvt(planTotal), cur)}`,
                price: cvt(installmentMonthlyAmount(p)),
                paid: cvt(settled(installmentMonthlyAmount(p), Math.min(receivedNative, installmentMonthlyAmount(p)))),
                balance: cvt(Math.max(0, planTotal - receivedNative)) as number | null,
            };
        }

        const priceNative = p.monthly ? (p.priceAmount || 0) : projectContractTotal(p);
        return {
            title: p.name,
            subtitle: p.monthly
                ? 'Monthly retainer'
                : hasInstallments(p)
                    ? `${p.installmentMonths} installments${p.installmentPercent ? ` (+${p.installmentPercent}%)` : ''}`
                    : undefined,
            price: cvt(priceNative),
            // A retainer's lifetime total is not "paid" against one month's rate - showing
            // it made a 6-month retainer read as Price 3,000 / Paid 18,000.
            paid: cvt(p.monthly ? Math.min(receivedNative, priceNative) : receivedNative),
            balance: (p.monthly ? null : cvt(Math.max(0, priceNative - receivedNative))) as number | null,
        };
    }, [income, rates, perPayment, periodLabel, kind]);

    const data: ReceiptData = useMemo(() => {
        const lines = selectedProjects.map(p => {
            const d = describeBilling(p, (n) => convert(n, p.priceCurrency, receiptCurrency, rates), receiptCurrency);
            return { name: d.title, note: d.subtitle, price: d.price, paid: d.paid, balance: d.balance };
        });
        const totals = lines.reduce(
            (a, l) => ({ price: a.price + l.price, paid: a.paid + l.paid, balance: a.balance + (l.balance || 0) }),
            { price: 0, paid: 0, balance: 0 },
        );
        return {
            receiptNo,
            dateLabel,
            customerName: customerName.trim() || undefined,
            customerEmail: customerEmail.trim() || undefined,
            currency: receiptCurrency,
            lines,
            totals,
            note: note.trim() || undefined,
            converted: selectedProjects.some(p => p.priceCurrency !== receiptCurrency),
            // Only relabel the totals when EVERY line is a single payment; a mixed receipt
            // keeps the plain wording so neither label is wrong for half the rows.
            perPayment: selectedProjects.length > 0
                && selectedProjects.every(p => perPayment[p.id] && (hasInstallments(p) || p.monthly)),
            kind,
            paidOnLabel: kind === 'paid' ? paidOnLabel : undefined,
            dueByLabel: kind === 'due' && dueDate ? humanDate(dueDate) : undefined,
        };
    }, [selectedProjects, receiptCurrency, rates, receiptNo, dateLabel, customerName, customerEmail, note, perPayment, describeBilling, kind, paidOnLabel, dueDate]);

    const html = useMemo(() => buildReceiptHtml(data), [data]);

    // Fit-to-frame preview: the receipt is a fixed ~624px-wide document, so instead of
    // scrolling it inside the panel we scale the whole thing down to fit the available box
    // (both axes), showing it whole with no scrollbars. NAT_W is the receipt's natural
    // width (600 card + 12px page padding each side); natH is measured from the iframe.
    const NAT_W = 624;
    const iframeRef = useRef<HTMLIFrameElement>(null);
    const fitRef = useRef<HTMLDivElement>(null);
    const [natH, setNatH] = useState(560);
    const [box, setBox] = useState({ w: 0, h: 0 });

    const remeasure = useCallback(() => {
        const doc = iframeRef.current?.contentDocument;
        if (doc) setNatH(Math.max(200, doc.documentElement.scrollHeight || doc.body.scrollHeight || 560));
    }, []);
    // Re-measure whenever the content changes (a srcDoc change reloads the iframe, but this
    // covers it even if onLoad doesn't refire).
    useEffect(() => {
        const t = setTimeout(remeasure, 60);
        return () => clearTimeout(t);
    }, [html, remeasure]);
    // Track the available box so the scale recomputes on modal/viewport resize.
    useEffect(() => {
        const el = fitRef.current;
        if (!el) return;
        const update = () => setBox({ w: el.clientWidth, h: el.clientHeight });
        update();
        const ro = new ResizeObserver(update);
        ro.observe(el);
        return () => ro.disconnect();
    }, []);
    // A small inset absorbs sub-pixel measurement lag (the iframe height settles a frame
    // after the box), so the receipt always fits fully instead of clipping a few px, and
    // it reads as breathing room.
    const PAD = 6;
    const scale = box.w > 0
        ? Math.max(0.1, Math.min((box.w - PAD) / NAT_W, natH ? (box.h - PAD) / natH : 1))
        : 1;

    const emailValid = EMAIL_RE.test(customerEmail.trim());
    const canSend = emailValid && selectedProjects.length > 0 && !sending;

    const download = () => {
        const blob = new Blob([html], { type: 'text/html' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${receiptNo}.html`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(url);
    };

    const send = async () => {
        if (!selectedProjects.length) { onToast?.('Pick at least one project first.', 'warn'); return; }
        if (!emailValid) { onToast?.('Enter a valid customer email.', 'warn'); return; }
        setSending(true);
        try {
            const { httpsCallable, getFunctions } = await import('firebase/functions');
            const fn = httpsCallable(getFunctions(app, 'us-central1'), 'sendReceipt');
            await fn({
                to: customerEmail.trim(),
                subject: kind === 'due'
                    ? `Payment request ${receiptNo} from Tem Revil`
                    : `Receipt ${receiptNo} from Tem Revil`,
                html,
                // Metadata for the sent-receipts history log (the function stores it).
                meta: {
                    receiptNo,
                    currency: receiptCurrency,
                    total: data.totals.price,
                    balance: data.totals.balance,
                    projectIds: selectedProjects.map(p => p.id),
                    projectNames: selectedProjects.map(p => p.name),
                },
            });
            setSentTo(customerEmail.trim());
            onToast?.(`${kind === 'due' ? 'Payment request' : 'Receipt'} sent to ${customerEmail.trim()}`, 'good');
        } catch (e) {
            onToast?.((e as { message?: string })?.message || 'Failed to send the receipt.', 'warn');
        } finally {
            setSending(false);
        }
    };

    const labelCls = 'block text-[11px] font-bold uppercase tracking-wider text-sec mb-1.5';
    const inputCls = `w-full rounded-xl border px-3.5 py-2.5 text-sm outline-none transition-colors ${isDark ? 'bg-white/5 border-white/10 focus:border-blue-400/60' : 'bg-black/[0.03] border-black/10 focus:border-blue-400/60'} text-primary`;
    const showPeriod = selectedProjects.some(p => p.monthly && perPayment[p.id]);

    return createPortal(
        <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.2 }}
            className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
            onClick={onClose}
        >
            <motion.div
                initial={{ scale: 0.95, opacity: 0, y: 15 }} animate={{ scale: 1, opacity: 1, y: 0 }} exit={{ scale: 0.95, opacity: 0, y: 15 }}
                transition={{ type: 'spring', damping: 25, stiffness: 350 }}
                onClick={e => e.stopPropagation()}
                className={`w-full max-w-5xl max-h-[92vh] flex flex-col rounded-3xl border shadow-2xl overflow-hidden ${isDark ? 'bg-[#0f0f14] border-white/10' : 'bg-white border-black/5'}`}
            >
                {/* Header */}
                <div className="flex items-center justify-between p-5 border-b border-[var(--section-border)]">
                    <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-xl flex items-center justify-center bg-blue-500/10 text-blue-500"><Receipt size={18} /></div>
                        <h3 className="text-lg font-bold text-primary font-inter m-0">New receipt</h3>
                    </div>
                    <button onClick={onClose} className="p-2 rounded-lg text-sec hover:text-primary hover:bg-black/5 dark:hover:bg-white/10 transition-all"><X size={18} /></button>
                </div>

                {/* Body: controls | preview */}
                <div className="flex-1 min-h-0 flex flex-col md:flex-row">
                    {/* Controls. min-w-0 keeps a fixed-width child from pushing this column
                        wider than itself, which the modal's overflow-hidden would then clip. */}
                    <div className="p-5 flex flex-col gap-4 overflow-y-auto overflow-x-hidden custom-scrollbar border-b md:border-b-0 md:border-r border-[var(--section-border)] md:w-[400px] md:shrink-0 min-w-0">
                        {/* Is this confirming money received, or asking for money owed? */}
                        <div>
                            <span className={labelCls}>This is</span>
                            <div className="grid grid-cols-2 gap-1.5 p-1 rounded-xl bg-black/[0.04] dark:bg-white/[0.06]">
                                {([
                                    ['paid', 'Payment received', 'Thank-you receipt'],
                                    ['due', 'Payment request', 'Reminder of what is owed'],
                                ] as const).map(([k, title, hint]) => (
                                    <button
                                        key={k}
                                        type="button"
                                        onClick={() => setKind(k)}
                                        title={hint}
                                        className={`px-2 py-2 rounded-lg text-[11px] font-bold transition-colors min-w-0 truncate ${kind === k ? 'bg-blue-500 text-white shadow-sm' : 'text-sec hover:text-primary'}`}
                                    >
                                        {title}
                                    </button>
                                ))}
                            </div>
                        </div>

                        <div>
                            <span className={labelCls}>Projects on this receipt</span>
                            <div className="flex flex-col gap-1.5 max-h-64 overflow-y-auto custom-scrollbar pr-1">
                                {projects.length === 0 && <p className="text-sm text-sec">No projects yet.</p>}
                                {projects.map(p => {
                                    const on = selected.has(p.id);
                                    const onPlan = hasInstallments(p) || !!p.monthly;
                                    const single = !!perPayment[p.id];
                                    return (
                                        <div key={p.id} className={`rounded-xl border transition-colors ${on ? 'border-blue-400/60 bg-blue-500/[0.06]' : 'border-transparent hover:bg-black/[0.03] dark:hover:bg-white/[0.04]'}`}>
                                            <button
                                                type="button"
                                                onClick={() => toggle(p.id)}
                                                className="w-full flex items-center gap-3 p-2.5 text-left bg-transparent border-none cursor-pointer"
                                            >
                                                <span className={`w-5 h-5 rounded-md flex items-center justify-center shrink-0 ${on ? 'bg-blue-500 text-white' : 'border border-black/20 dark:border-white/20'}`}>
                                                    {on && <Check size={13} strokeWidth={3} />}
                                                </span>
                                                <span className="min-w-0 flex-1">
                                                    <span className="block text-sm font-semibold text-primary truncate">{p.name}</span>
                                                    {p.client && <span className="block text-[11px] text-sec truncate">{p.client}</span>}
                                                </span>
                                                <span className="text-xs font-bold text-sec tnum shrink-0">{p.priceAmount ? formatMoney(p.priceAmount, p.priceCurrency) : '-'}</span>
                                            </button>

                                            {/* Installment plans and retainers get a scope choice: bill the
                                                whole contract, or just this month's payment. */}
                                            {on && onPlan && (
                                                <div className="flex items-center gap-1 px-2.5 pb-2.5 -mt-0.5 min-w-0">
                                                    {([['payment', p.monthly ? 'This month' : 'One installment'], ['full', 'Whole project']] as const).map(([mode, text]) => {
                                                        const active = (mode === 'payment') === single;
                                                        return (
                                                            <button
                                                                key={mode}
                                                                type="button"
                                                                onClick={() => setPerPayment(prev => ({ ...prev, [p.id]: mode === 'payment' }))}
                                                                className={`px-2 py-1 rounded-lg text-[10px] font-bold transition-colors shrink-0 ${active ? 'bg-blue-500 text-white' : 'text-sec hover:text-primary bg-black/[0.04] dark:bg-white/[0.06]'}`}
                                                            >
                                                                {text}
                                                            </button>
                                                        );
                                                    })}
                                                    {single && (
                                                        <span className="text-[10px] text-sec tnum ml-auto shrink-0 truncate">
                                                            {p.monthly
                                                                ? formatMoney(p.priceAmount || 0, p.priceCurrency)
                                                                : `${formatMoney(installmentMonthlyAmount(p), p.priceCurrency)} x ${p.installmentMonths}`}
                                                        </span>
                                                    )}
                                                </div>
                                            )}
                                        </div>
                                    );
                                })}
                            </div>
                        </div>

                        <div className="grid grid-cols-2 gap-3">
                            <div className="min-w-0">
                                <label className={labelCls}>Customer name</label>
                                <input className={inputCls} value={customerName} onChange={e => { touched.current.name = true; setCustomerName(e.target.value); }} placeholder="Person or company" />
                            </div>
                            <div className="min-w-0">
                                <label className={labelCls}>Currency</label>
                                <Select value={receiptCurrency} onChange={v => { touched.current.currency = true; setReceiptCurrency(v as Currency); }} isDark={isDark} options={CURRENCIES.map(c => ({ value: c, label: c }))} aria-label="Receipt currency" />
                            </div>
                        </div>

                        <div>
                            <label className={labelCls}>Customer email {selectedProjects.length > 0 && !emailValid && <span className="text-amber-500 normal-case">- required to send</span>}</label>
                            <input className={inputCls} type="email" value={customerEmail} onChange={e => { touched.current.email = true; setCustomerEmail(e.target.value); setSentTo(null); }} placeholder="name@example.com" />
                        </div>

                        <div className={showPeriod ? 'grid grid-cols-2 gap-3' : ''}>
                            <div className="min-w-0">
                                <label className={labelCls}>Issue date</label>
                                <DatePicker value={issueDate} onChange={setIssueDate} isDark={isDark} />
                            </div>
                            {/* Only meaningful when a retainer is billed for a single month, and
                                editable because August's fee often gets paid in September. */}
                            {showPeriod && (
                                <div className="min-w-0">
                                    <label className={labelCls}>Period covered</label>
                                    <input
                                        className={inputCls}
                                        value={periodLabel}
                                        onChange={e => { setPeriodTouched(true); setPeriodLabel(e.target.value); }}
                                        placeholder="August 2026"
                                    />
                                </div>
                            )}
                        </div>

                        {/* When the money arrived (confirmation) or when it is wanted by
                            (request). Both editable - a payment is often logged days later. */}
                        {kind === 'paid' ? (
                            <div className="grid grid-cols-2 gap-3">
                                <div className="min-w-0">
                                    <label className={labelCls}>Payment date</label>
                                    <DatePicker value={paidDate} onChange={setPaidDate} isDark={isDark} />
                                </div>
                                <div className="min-w-0">
                                    <label className={labelCls}>Time (optional)</label>
                                    <input className={inputCls} value={paidTime} onChange={e => setPaidTime(e.target.value)} placeholder="5:00 PM" />
                                </div>
                            </div>
                        ) : (
                            <div>
                                <label className={labelCls}>Due by (optional)</label>
                                <DatePicker value={dueDate} onChange={setDueDate} isDark={isDark} />
                            </div>
                        )}

                        <div>
                            <label className={labelCls}>Note (optional)</label>
                            <textarea className={`${inputCls} min-h-[60px] resize-y`} value={note} onChange={e => setNote(e.target.value)} placeholder="Thanks for your business, payment terms, etc." />
                        </div>

                        <div className="text-[11px] text-sec">Receipt no. <span className="font-mono text-primary">{receiptNo}</span></div>
                    </div>

                    {/* Preview - scaled to fit the panel, no scrollbars */}
                    <div className="p-5 flex flex-col gap-3 min-h-[360px] md:min-h-0 md:flex-1 min-w-0 bg-black/[0.02] dark:bg-white/[0.02]">
                        <div className="flex items-center justify-between">
                            <span className={labelCls} style={{ margin: 0 }}>Preview</span>
                            {sentTo && <span className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-500"><Check size={12} /> Sent to {sentTo}</span>}
                        </div>
                        <div ref={fitRef} className="flex-1 min-h-0 overflow-hidden flex items-center justify-center">
                            {/* The border wraps the receipt itself (sized to the scaled doc), so the
                                frame IS the receipt and leftover space stays neutral - no empty panel. */}
                            <div className="overflow-hidden rounded-xl border border-[var(--section-border)] bg-white shadow-sm" style={{ width: NAT_W * scale, height: natH * scale }}>
                                <iframe
                                    ref={iframeRef}
                                    title="Receipt preview"
                                    srcDoc={html}
                                    onLoad={remeasure}
                                    scrolling="no"
                                    style={{ width: NAT_W, height: natH, border: 0, display: 'block', transformOrigin: 'top left', transform: `scale(${scale})` }}
                                />
                            </div>
                        </div>
                    </div>
                </div>

                {/* Footer actions */}
                <div className="flex items-center justify-between gap-3 p-4 border-t border-[var(--section-border)]">
                    <button onClick={download} className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold text-primary bg-black/[0.04] dark:bg-white/[0.06] hover:bg-black/[0.07] dark:hover:bg-white/[0.1] transition-colors">
                        <Download size={16} /> Download
                    </button>
                    <button
                        onClick={send}
                        disabled={!canSend}
                        className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-bold text-white bg-blue-500 hover:bg-blue-600 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                        {sending ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
                        {sending ? 'Sending…' : sentTo ? 'Send again' : (kind === 'due' ? 'Send request' : 'Send receipt')}
                    </button>
                </div>
            </motion.div>
        </motion.div>,
        document.body,
    );
};

export default MReceipt;
