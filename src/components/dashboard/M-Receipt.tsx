import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { motion } from 'motion/react';
import { X, Receipt, Send, Download, Loader2, Check, Plus, Trash2 } from 'lucide-react';
import app from '../../lib/firebase';
import {
    Currency, CURRENCIES, TreasuryProject, TreasuryIncome, Rates,
    convert, projectReceived, projectContractTotal, hasInstallments, formatMoney,
} from '../../lib/treasury';
import {
    buildReceiptHtml, receiptNumber, ReceiptData,
    buildItemizedReceiptHtml, revReceiptNumber, ItemizedReceiptData,
} from '../../lib/receipt';
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

/** Which layout the receipt uses. */
type Template = 'projects' | 'itemized';

interface ItemRow { id: string; label: string; caption: string; amount: string; currency: Currency }
interface LogRow { id: string; date: string; text: string }
const rid = () => Math.random().toString(36).slice(2, 9);
const emptyItem = (currency: Currency): ItemRow => ({ id: rid(), label: '', caption: '', amount: '', currency });
const emptyLog = (): LogRow => ({ id: rid(), date: '', text: '' });

/**
 * Receipt builder: pick one or more projects, set the customer + issue date, preview the
 * exact HTML that will be sent, then email it (via the sendReceipt function) or download
 * it. The preview, the download and the emailed body are all the same buildReceiptHtml()
 * string, so there's no drift between what you see and what the customer gets.
 */
const MReceipt = ({ projects, income, rates, displayCurrency, initialProjectId, isDark, onClose, onToast }: Props) => {
    const initial = projects.find(p => p.id === initialProjectId);
    const [selected, setSelected] = useState<Set<string>>(new Set(initial ? [initial.id] : []));
    const [receiptCurrency, setReceiptCurrency] = useState<Currency>(initial?.priceCurrency ?? displayCurrency);
    const [customerName, setCustomerName] = useState(initial?.client ?? '');
    const [customerEmail, setCustomerEmail] = useState(initial?.clientEmail ?? '');
    const [issueDate, setIssueDate] = useState(today());
    const [receiptNo] = useState(() => receiptNumber());
    const [note, setNote] = useState('');
    const [sending, setSending] = useState(false);
    const [sentTo, setSentTo] = useState<string | null>(null);

    // Itemized template: free-form line items, a dated work log, per-currency totals.
    const [template, setTemplate] = useState<Template>('projects');
    const [customerSubtitle, setCustomerSubtitle] = useState(initial ? `${initial.name} project` : '');
    const [workLogTitle, setWorkLogTitle] = useState('');
    const [workLog, setWorkLog] = useState<LogRow[]>([emptyLog()]);
    const [items, setItems] = useState<ItemRow[]>([emptyItem(initial?.priceCurrency ?? displayCurrency)]);
    /** Empty = use the derived subject. */
    const [subject, setSubject] = useState('');

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

    const dateLabel = useMemo(() => {
        const d = new Date(`${issueDate}T00:00:00`);
        return Number.isNaN(d.getTime()) ? issueDate : d.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
    }, [issueDate]);

    const data: ReceiptData = useMemo(() => {
        const lines = selectedProjects.map(p => {
            const cvt = (n: number) => convert(n, p.priceCurrency, receiptCurrency, rates);
            const priceNative = p.monthly ? (p.priceAmount || 0) : projectContractTotal(p);
            const paidNative = projectReceived(p, income, rates);
            const balNative = p.monthly ? null : Math.max(0, priceNative - paidNative);
            return {
                name: p.name,
                note: p.monthly
                    ? 'Monthly retainer'
                    : hasInstallments(p)
                        ? `${p.installmentMonths} installments${p.installmentPercent ? ` (+${p.installmentPercent}%)` : ''}`
                        : undefined,
                price: cvt(priceNative),
                paid: cvt(paidNative),
                balance: balNative === null ? null : cvt(balNative),
            };
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
        };
    }, [selectedProjects, receiptCurrency, income, rates, receiptNo, dateLabel, customerName, customerEmail, note]);

    // Itemized receipts are numbered REV-YYYY-MMDD off the issue date.
    const revNo = useMemo(() => {
        const d = new Date(`${issueDate}T00:00:00`);
        return revReceiptNumber(Number.isNaN(d.getTime()) ? new Date() : d);
    }, [issueDate]);

    const itemizedData: ItemizedReceiptData = useMemo(() => ({
        receiptNo: revNo,
        dateLabel,
        customerName: customerName.trim() || undefined,
        customerSubtitle: customerSubtitle.trim() || undefined,
        workLogTitle: workLogTitle.trim() || undefined,
        workLog: workLog
            .filter(w => w.date.trim() || w.text.trim())
            .map(w => ({ date: w.date.trim(), text: w.text.trim() })),
        lines: items
            .filter(i => i.label.trim() || i.amount.trim())
            .map(i => ({
                label: i.label.trim() || 'Item',
                caption: i.caption.trim() || undefined,
                amount: Number(i.amount) || 0,
                currency: i.currency,
            })),
        note: note.trim() || undefined,
    }), [revNo, dateLabel, customerName, customerSubtitle, workLogTitle, workLog, items, note]);

    const isItemized = template === 'itemized';
    const html = useMemo(
        () => (isItemized ? buildItemizedReceiptHtml(itemizedData) : buildReceiptHtml(data)),
        [isItemized, itemizedData, data],
    );

    // Fit-to-frame preview: the receipt is a fixed ~624px-wide document, so instead of
    // scrolling it inside the panel we scale the whole thing down to fit the available box
    // (both axes), showing it whole with no scrollbars. NAT_W is the receipt's natural
    // width (600 card + 12px page padding each side); natH is measured from the iframe.
    // The itemized doc is wider (640 card + 20px page padding each side).
    const NAT_W = isItemized ? 680 : 624;
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
    const activeNo = isItemized ? revNo : receiptNo;
    const defaultSubject = isItemized
        ? `Receipt from Revil${customerSubtitle.trim() ? ` - ${customerSubtitle.trim()}` : ''}`
        : `Receipt ${receiptNo} from Tem Revil`;
    // Itemized receipts stand on their line items; project ones need a project picked.
    const hasContent = isItemized ? itemizedData.lines.length > 0 : selectedProjects.length > 0;
    const canSend = emailValid && hasContent && !sending;

    // History log needs one headline figure: for a multi-currency itemized receipt that's
    // the total of the first currency used.
    const itemizedHeadline = useMemo(() => {
        const first = itemizedData.lines[0];
        if (!first) return { currency: receiptCurrency as string, total: 0 };
        return {
            currency: first.currency as string,
            total: itemizedData.lines.filter(l => l.currency === first.currency).reduce((s, l) => s + l.amount, 0),
        };
    }, [itemizedData, receiptCurrency]);

    /** Append the currently selected projects as line items (keeps anything already typed). */
    const fillFromProjects = () => {
        const rows: ItemRow[] = selectedProjects.map(p => ({
            id: rid(),
            label: p.name,
            caption: p.client || '',
            amount: String(p.monthly ? (p.priceAmount || 0) : projectContractTotal(p)),
            currency: p.priceCurrency,
        }));
        if (!rows.length) return;
        setItems(prev => [...prev.filter(r => r.label.trim() || r.amount.trim()), ...rows]);
    };

    const download = () => {
        const blob = new Blob([html], { type: 'text/html' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${activeNo}.html`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(url);
    };

    const send = async () => {
        if (!hasContent) {
            onToast?.(isItemized ? 'Add at least one line item first.' : 'Pick at least one project first.', 'warn');
            return;
        }
        if (!emailValid) { onToast?.('Enter a valid customer email.', 'warn'); return; }
        setSending(true);
        try {
            const { httpsCallable, getFunctions } = await import('firebase/functions');
            const fn = httpsCallable(getFunctions(app, 'us-central1'), 'sendReceipt');
            await fn({
                to: customerEmail.trim(),
                subject: subject.trim() || defaultSubject,
                html,
                // Metadata for the sent-receipts history log (the function stores it).
                meta: {
                    receiptNo: activeNo,
                    currency: isItemized ? itemizedHeadline.currency : receiptCurrency,
                    total: isItemized ? itemizedHeadline.total : data.totals.price,
                    balance: isItemized ? 0 : data.totals.balance,
                    projectIds: selectedProjects.map(p => p.id),
                    projectNames: selectedProjects.map(p => p.name),
                },
            });
            setSentTo(customerEmail.trim());
            onToast?.(`Receipt sent to ${customerEmail.trim()}`, 'good');
        } catch (e) {
            onToast?.((e as { message?: string })?.message || 'Failed to send the receipt.', 'warn');
        } finally {
            setSending(false);
        }
    };

    const labelCls = 'block text-[11px] font-bold uppercase tracking-wider text-sec mb-1.5';
    const inputCls = `w-full rounded-xl border px-3.5 py-2.5 text-sm outline-none transition-colors ${isDark ? 'bg-white/5 border-white/10 focus:border-blue-400/60' : 'bg-black/[0.03] border-black/10 focus:border-blue-400/60'} text-primary`;

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
                className={`w-full max-w-5xl max-h-[90vh] flex flex-col rounded-3xl border shadow-2xl overflow-hidden ${isDark ? 'bg-[#0f0f14] border-white/10' : 'bg-white border-black/5'}`}
            >
                {/* Header */}
                <div className="flex items-center justify-between p-5 border-b border-[var(--section-border)]">
                    <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-xl flex items-center justify-center bg-blue-500/10 text-blue-500"><Receipt size={18} /></div>
                        <h3 className="text-lg font-bold text-primary font-inter m-0">New receipt</h3>
                    </div>
                    <button onClick={onClose} className="p-2 rounded-lg text-sec hover:text-primary hover:bg-black/5 dark:hover:bg-white/10 transition-all"><X size={18} /></button>
                </div>

                {/* Body: controls | preview, side by side on desktop, stacked on mobile */}
                <div className="flex-1 min-h-0 flex flex-col md:flex-row">
                    {/* Controls */}
                    <div className="p-5 flex flex-col gap-4 overflow-y-auto custom-scrollbar border-b md:border-b-0 md:border-r border-[var(--section-border)] md:w-[400px] md:shrink-0">
                        <div>
                            <label className={labelCls}>Template</label>
                            <Select
                                value={template}
                                onChange={v => setTemplate(v as Template)}
                                isDark={isDark}
                                options={[
                                    { value: 'projects', label: 'Projects summary (light)' },
                                    { value: 'itemized', label: 'Itemized work log (dark)' },
                                ]}
                                aria-label="Receipt template"
                            />
                        </div>

                        <div>
                            <span className={labelCls}>{isItemized ? 'Projects (optional - autofill & history)' : 'Projects on this receipt'}</span>
                            <div className="flex flex-col gap-1.5 max-h-52 overflow-y-auto custom-scrollbar pr-1">
                                {projects.length === 0 && <p className="text-sm text-sec">No projects yet.</p>}
                                {projects.map(p => {
                                    const on = selected.has(p.id);
                                    return (
                                        <button
                                            key={p.id}
                                            type="button"
                                            onClick={() => toggle(p.id)}
                                            className={`flex items-center gap-3 p-2.5 rounded-xl border text-left transition-colors ${on ? 'border-blue-400/60 bg-blue-500/[0.06]' : 'border-transparent hover:bg-black/[0.03] dark:hover:bg-white/[0.04]'}`}
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
                                    );
                                })}
                            </div>
                        </div>

                        <div className="grid grid-cols-2 gap-3">
                            <div>
                                <label className={labelCls}>Customer name</label>
                                <input className={inputCls} value={customerName} onChange={e => { touched.current.name = true; setCustomerName(e.target.value); }} placeholder="Person or company" />
                            </div>
                            <div>
                                {isItemized ? (
                                    <>
                                        <label className={labelCls}>Under the name</label>
                                        <input className={inputCls} value={customerSubtitle} onChange={e => setCustomerSubtitle(e.target.value)} placeholder="RooleTask project" />
                                    </>
                                ) : (
                                    <>
                                        <label className={labelCls}>Currency</label>
                                        <Select value={receiptCurrency} onChange={v => { touched.current.currency = true; setReceiptCurrency(v as Currency); }} isDark={isDark} options={CURRENCIES.map(c => ({ value: c, label: c }))} aria-label="Receipt currency" />
                                    </>
                                )}
                            </div>
                        </div>

                        <div>
                            <label className={labelCls}>Customer email {selectedProjects.length > 0 && !emailValid && <span className="text-amber-500 normal-case">- required to send</span>}</label>
                            <input className={inputCls} type="email" value={customerEmail} onChange={e => { touched.current.email = true; setCustomerEmail(e.target.value); setSentTo(null); }} placeholder="name@example.com" />
                        </div>

                        <div>
                            <label className={labelCls}>Issue date</label>
                            <DatePicker value={issueDate} onChange={setIssueDate} isDark={isDark} />
                        </div>

                        {isItemized && (
                            <>
                                <div>
                                    <label className={labelCls}>Email subject</label>
                                    <input className={inputCls} value={subject} onChange={e => setSubject(e.target.value)} placeholder={defaultSubject} />
                                </div>

                                {/* Work log - the dated "what I shipped" section */}
                                <div>
                                    <div className="flex items-center justify-between mb-1.5">
                                        <span className={labelCls} style={{ margin: 0 }}>Work log</span>
                                        <button type="button" onClick={() => setWorkLog(w => [...w, emptyLog()])} className="inline-flex items-center gap-1 text-[11px] font-bold text-blue-500 hover:text-blue-400 transition-colors">
                                            <Plus size={12} /> Add
                                        </button>
                                    </div>
                                    <input className={`${inputCls} mb-2`} value={workLogTitle} onChange={e => setWorkLogTitle(e.target.value)} placeholder="Development fixes - July 2026" />
                                    <div className="flex flex-col gap-2">
                                        {workLog.map(w => (
                                            <div key={w.id} className="flex gap-2 items-start">
                                                <input
                                                    className={`${inputCls} w-[76px] shrink-0`}
                                                    value={w.date}
                                                    onChange={e => setWorkLog(rows => rows.map(r => r.id === w.id ? { ...r, date: e.target.value } : r))}
                                                    placeholder="2 Jul"
                                                />
                                                <textarea
                                                    className={`${inputCls} flex-1 min-h-[38px] resize-y`}
                                                    value={w.text}
                                                    onChange={e => setWorkLog(rows => rows.map(r => r.id === w.id ? { ...r, text: e.target.value } : r))}
                                                    placeholder="What you shipped"
                                                />
                                                <button
                                                    type="button"
                                                    onClick={() => setWorkLog(rows => rows.length > 1 ? rows.filter(r => r.id !== w.id) : [emptyLog()])}
                                                    className="p-2 rounded-lg text-sec hover:text-red-500 transition-colors shrink-0"
                                                    aria-label="Remove entry"
                                                ><Trash2 size={14} /></button>
                                            </div>
                                        ))}
                                    </div>
                                </div>

                                {/* Line items - each carries its own currency */}
                                <div>
                                    <div className="flex items-center justify-between mb-1.5">
                                        <span className={labelCls} style={{ margin: 0 }}>Line items</span>
                                        <div className="flex items-center gap-3">
                                            {selectedProjects.length > 0 && (
                                                <button type="button" onClick={fillFromProjects} className="text-[11px] font-bold text-sec hover:text-primary transition-colors">Use selected</button>
                                            )}
                                            <button type="button" onClick={() => setItems(i => [...i, emptyItem(receiptCurrency)])} className="inline-flex items-center gap-1 text-[11px] font-bold text-blue-500 hover:text-blue-400 transition-colors">
                                                <Plus size={12} /> Add
                                            </button>
                                        </div>
                                    </div>
                                    <div className="flex flex-col gap-2.5">
                                        {items.map(it => (
                                            <div key={it.id} className="rounded-xl border border-[var(--section-border)] p-2.5 flex flex-col gap-2">
                                                <div className="flex gap-2 items-center">
                                                    <input
                                                        className={`${inputCls} flex-1`}
                                                        value={it.label}
                                                        onChange={e => setItems(rows => rows.map(r => r.id === it.id ? { ...r, label: e.target.value } : r))}
                                                        placeholder="Development - security fixes"
                                                    />
                                                    <button
                                                        type="button"
                                                        onClick={() => setItems(rows => rows.length > 1 ? rows.filter(r => r.id !== it.id) : [emptyItem(receiptCurrency)])}
                                                        className="p-2 rounded-lg text-sec hover:text-red-500 transition-colors shrink-0"
                                                        aria-label="Remove item"
                                                    ><Trash2 size={14} /></button>
                                                </div>
                                                <input
                                                    className={inputCls}
                                                    value={it.caption}
                                                    onChange={e => setItems(rows => rows.map(r => r.id === it.id ? { ...r, caption: e.target.value } : r))}
                                                    placeholder="RooleTask - July 2026 (optional)"
                                                />
                                                <div className="flex gap-2">
                                                    <input
                                                        className={`${inputCls} flex-1`}
                                                        inputMode="decimal"
                                                        value={it.amount}
                                                        onChange={e => setItems(rows => rows.map(r => r.id === it.id ? { ...r, amount: e.target.value } : r))}
                                                        placeholder="3000"
                                                    />
                                                    <div className="w-[96px] shrink-0">
                                                        <Select
                                                            value={it.currency}
                                                            onChange={v => setItems(rows => rows.map(r => r.id === it.id ? { ...r, currency: v as Currency } : r))}
                                                            isDark={isDark}
                                                            options={CURRENCIES.map(c => ({ value: c, label: c }))}
                                                            aria-label="Item currency"
                                                        />
                                                    </div>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            </>
                        )}

                        <div>
                            <label className={labelCls}>Note (optional)</label>
                            <textarea className={`${inputCls} min-h-[60px] resize-y`} value={note} onChange={e => setNote(e.target.value)} placeholder="Thanks for your business, payment terms, etc." />
                        </div>

                        <div className="text-[11px] text-sec">Receipt no. <span className="font-mono text-primary">{activeNo}</span></div>
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
                            <div className="overflow-hidden rounded-xl border border-[var(--section-border)] shadow-sm" style={{ width: NAT_W * scale, height: natH * scale, background: isItemized ? '#0a0a0a' : '#fff' }}>
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
                        {sending ? 'Sending…' : sentTo ? 'Send again' : 'Send receipt'}
                    </button>
                </div>
            </motion.div>
        </motion.div>,
        document.body,
    );
};

export default MReceipt;
