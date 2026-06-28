import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { X, Trash2, Briefcase, Receipt, Banknote, Repeat, Paperclip, ImagePlus, Loader2 } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { ref, uploadBytes, getDownloadURL, deleteObject, getStorage } from 'firebase/storage';
import app from '../../lib/firebase';
// Lazy Dashboard chunk - keeps firebase/storage out of the eager bundle.
const storage = getStorage(app);
import {
    CURRENCIES, CURRENCY_SYMBOL, Currency, ProjectStatus, Rates, DEFAULT_RATES,
    TreasuryProject, TreasuryExpense, TreasuryIncome, TreasuryAccount, TreasuryConfig, uid, derivePaymentStatus,
    ExpenseTemplate, matchExpenseTemplates, expenseProjectOptions, incomeProjectOptions, formatMoney,
    expenseCategories, matchCategories, nextMonthlyPaymentDate, accountOptions,
} from '../../lib/treasury';
import DatePicker from './DatePicker';
import ScrollMenu from './ScrollMenu';

type Mode = 'project' | 'expense' | 'income';

interface Props {
    mode: Mode;
    config: TreasuryConfig;
    project?: TreasuryProject | null;
    expense?: TreasuryExpense | null;
    income?: TreasuryIncome | null;
    projects?: TreasuryProject[];        // full projects, filtered per money kind
    accounts?: TreasuryAccount[];        // accounts money flows in/out of
    expenseList?: TreasuryExpense[];     // history → repeat-templates
    incomeList?: TreasuryIncome[];       // for income project-option filtering
    rates?: Rates;                       // for payment-status filtering
    nextOrder: number;
    onSaveProject?: (p: TreasuryProject) => void;
    onSaveExpense?: (e: TreasuryExpense) => void;
    onSaveIncome?: (i: TreasuryIncome) => void;
    onDelete?: () => void;
    onClose: () => void;
}

const today = () => new Date().toISOString().slice(0, 10);
const NO_PROJECT = '- No project -';
const NO_ACCOUNT = '- No account -';

const MTreasuryEntry = ({ mode, config, project, expense, income, projects, accounts, expenseList, incomeList, rates, nextOrder, onSaveProject, onSaveExpense, onSaveIncome, onDelete, onClose }: Props) => {
    const [isDark, setIsDark] = useState(false);
    // "Money" = income or expense in ONE modal; the toggle picks which.
    const isMoney = mode !== 'project';
    const [kind, setKind] = useState<'income' | 'expense'>(mode === 'expense' ? 'expense' : 'income');

    // Project fields
    const [name, setName] = useState(project?.name ?? '');
    const [client, setClient] = useState(project?.client ?? '');
    const [status, setStatus] = useState<ProjectStatus>(project?.status ?? 'active');
    const [priceAmount, setPriceAmount] = useState(project?.priceAmount ? String(project.priceAmount) : '');
    const [priceCurrency, setPriceCurrency] = useState<Currency>(project?.priceCurrency ?? config.defaultCurrency);
    const [startDate, setStartDate] = useState(project?.startDate ?? (project ? '' : today()));
    const [endDate, setEndDate] = useState(project?.endDate ?? '');
    const [done, setDone] = useState(project?.done ?? false);
    const [monthly, setMonthly] = useState(project?.monthly ?? false);

    // Expense fields
    const [label, setLabel] = useState(expense?.label ?? '');
    const [expAmount, setExpAmount] = useState(expense?.amount ? String(expense.amount) : '');
    const [expCurrency, setExpCurrency] = useState<Currency>(expense?.currency ?? config.defaultCurrency);
    const [category, setCategory] = useState(expense?.category ?? '');
    const [expDate, setExpDate] = useState(expense?.date ?? today());
    const [recurring, setRecurring] = useState(expense?.recurring ?? false);
    // Who covered this expense: me (deducted from my money/account) or the client
    // (recorded only, never pulled from my balance).
    const [expClientPaid, setExpClientPaid] = useState(expense?.clientPaid ?? false);
    const [expProjectName, setExpProjectName] = useState(() => expense?.projectId ? (projects?.find(p => p.id === expense.projectId)?.name ?? NO_PROJECT) : NO_PROJECT);
    const [expAccountName, setExpAccountName] = useState(() => expense?.accountId ? (accounts?.find(a => a.id === expense.accountId)?.name ?? NO_ACCOUNT) : NO_ACCOUNT);

    // Income fields
    const [incAmount, setIncAmount] = useState(income?.amount ? String(income.amount) : '');
    const [incCurrency, setIncCurrency] = useState<Currency>(income?.currency ?? config.defaultCurrency);
    const [incDate, setIncDate] = useState(income?.date ?? today());
    const [incProjectName, setIncProjectName] = useState(() => {
        if (income?.projectId) return projects?.find(p => p.id === income.projectId)?.name ?? NO_PROJECT;
        return NO_PROJECT;
    });
    const [incAccountName, setIncAccountName] = useState(() => income?.accountId ? (accounts?.find(a => a.id === income.accountId)?.name ?? NO_ACCOUNT) : NO_ACCOUNT);
    // When the linked project is a monthly retainer, ask whether this payment IS
    // its monthly payment (it may arrive early or late). Defaults to yes - the
    // common case - but the admin can mark it as a one-off extra instead.
    // New income on a monthly project defaults to "yes" (the common case). When
    // EDITING an existing entry, reflect exactly what was saved — otherwise a
    // one-off logged as "No" (monthlyPayment undefined) re-opens as "Yes" and
    // silently flips to a monthly payment on the next save.
    const [incIsMonthly, setIncIsMonthly] = useState(income ? !!income.monthlyPayment : true);

    // Shared notes
    const [notes, setNotes] = useState((mode === 'project' ? project?.notes : mode === 'expense' ? expense?.notes : income?.note) ?? '');

    // Optional image attachments (receipts / proof). Uploaded immediately to a
    // stable folder keyed by the entry's id so the saved URLs always resolve.
    const [moneyId] = useState(() => expense?.id || income?.id || uid('m'));
    const [attachments, setAttachments] = useState<string[]>(expense?.attachments || income?.attachments || []);
    const [uploading, setUploading] = useState(0);

    const addFiles = async (files: FileList | null) => {
        if (!files?.length) return;
        const images = Array.from(files).filter(f => f.type.startsWith('image/'));
        if (!images.length) return;
        setUploading(u => u + images.length);
        await Promise.all(images.map(async file => {
            try {
                const safe = file.name.replace(/[^\w.-]+/g, '_');
                const r = ref(storage, `treasury/${moneyId}/${Date.now()}-${safe}`);
                await uploadBytes(r, file);
                const url = await getDownloadURL(r);
                setAttachments(prev => [...prev, url]);
            } catch (err) {
                console.warn('[Treasury] attachment upload failed', err);
            } finally {
                setUploading(u => Math.max(0, u - 1));
            }
        }));
    };

    const removeAttachment = (url: string) => {
        setAttachments(prev => prev.filter(u => u !== url));
        deleteObject(ref(storage, url)).catch(() => { /* best-effort */ });
    };

    // Repeat-templates: suggest past expense labels while typing, one-tap to refill
    // amount/currency/category/recurring so a recurring cost isn't retyped.
    const [showLabelSug, setShowLabelSug] = useState(false);
    const labelSuggestions = useMemo(() => matchExpenseTemplates(label, expenseList || []), [label, expenseList]);
    const applyTemplate = (t: ExpenseTemplate) => {
        setLabel(t.label);
        if (t.amount) setExpAmount(String(t.amount));
        setExpCurrency(t.currency);
        setCategory(t.category ?? '');
        setRecurring(!!t.recurring);
        setShowLabelSug(false);
    };

    // Category combobox: a scroll menu of past categories — browse on focus,
    // filter (fuzzy) as you type, and a brand-new category can still be typed.
    const [showCatSug, setShowCatSug] = useState(false);
    const pastCategories = useMemo(() => expenseCategories(expenseList || []), [expenseList]);
    const categorySuggestions = useMemo(() => matchCategories(category, pastCategories), [category, pastCategories]);

    // Project pickers, filtered per money kind: expenses hide finished projects;
    // income keeps any still owing (unpaid/partial) + monthly retainers.
    const expenseProjs = useMemo(() => expenseProjectOptions(projects || []), [projects]);
    const incomeProjs = useMemo(() => incomeProjectOptions(projects || [], incomeList || [], rates || DEFAULT_RATES), [projects, incomeList, rates]);
    // Keep the currently-linked project selectable on edit even if it's been
    // filtered out of the live options (e.g. an expense tied to a now-done project).
    const expProjectOpts = useMemo(() => {
        const names = expenseProjs.map(p => p.name);
        if (expProjectName !== NO_PROJECT && !names.includes(expProjectName)) names.unshift(expProjectName);
        return [NO_PROJECT, ...names];
    }, [expenseProjs, expProjectName]);
    const incProjectOpts = useMemo(() => {
        const names = incomeProjs.map(p => p.name);
        if (incProjectName !== NO_PROJECT && !names.includes(incProjectName)) names.unshift(incProjectName);
        return [NO_PROJECT, ...names];
    }, [incomeProjs, incProjectName]);

    // Account pickers: live accounts, but keep the linked one selectable on edit
    // even if it's since been archived.
    const liveAccounts = useMemo(() => accountOptions(accounts || []), [accounts]);
    const expAccountOpts = useMemo(() => {
        const names = liveAccounts.map(a => a.name);
        if (expAccountName !== NO_ACCOUNT && !names.includes(expAccountName)) names.unshift(expAccountName);
        return [NO_ACCOUNT, ...names];
    }, [liveAccounts, expAccountName]);
    const incAccountOpts = useMemo(() => {
        const names = liveAccounts.map(a => a.name);
        if (incAccountName !== NO_ACCOUNT && !names.includes(incAccountName)) names.unshift(incAccountName);
        return [NO_ACCOUNT, ...names];
    }, [liveAccounts, incAccountName]);

    // The project the income is linked to, and whether it's a monthly retainer -
    // drives the "is this the monthly payment?" question + next-due preview.
    const selectedIncProject = useMemo(() => projects?.find(p => p.name === incProjectName) ?? null, [projects, incProjectName]);
    const isMonthlyProject = !!selectedIncProject?.monthly;
    const nextDuePreview = useMemo(
        () => (isMonthlyProject && incIsMonthly && selectedIncProject)
            ? nextMonthlyPaymentDate(selectedIncProject, incDate || today())
            : null,
        [isMonthlyProject, incIsMonthly, selectedIncProject, incDate],
    );

    const isEdit = mode === 'project' ? !!project : mode === 'expense' ? !!expense : !!income;
    const titleLabel = mode === 'project' ? 'Project' : isEdit ? (kind === 'expense' ? 'Expense' : 'Income') : 'Money';
    const HeaderIcon = mode === 'project' ? Briefcase : kind === 'expense' ? Receipt : Banknote;

    useEffect(() => {
        const checkTheme = () => setIsDark(document.documentElement.classList.contains('dark'));
        checkTheme();
        const observer = new MutationObserver(checkTheme);
        observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
        return () => observer.disconnect();
    }, []);

    useEffect(() => {
        const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [onClose]);

    const save = () => {
        if (mode === 'project') {
            if (!name.trim()) return;
            const price = parseFloat(priceAmount) || 0;
            // Received is no longer entered here - it's the sum of logged income.
            // Preserve any legacy paidAmount that pre-dates the income log.
            const paid = project?.paidAmount ?? 0;
            const p: TreasuryProject = {
                id: project?.id ?? uid('proj'),
                name: name.trim(),
                client: client.trim() || undefined,
                status,
                priceAmount: price,
                priceCurrency,
                monthly,
                paidAmount: paid,
                paymentStatus: derivePaymentStatus({ priceAmount: price, paidAmount: paid }),
                notes: notes.trim() || undefined,
                startDate: startDate || null,
                endDate: done ? (endDate || today()) : (endDate || null),
                done,
                order: project?.order ?? nextOrder,
                createdAt: project?.createdAt ?? Date.now(),
            };
            onSaveProject?.(p);
        } else if (kind === 'expense') {
            if (!label.trim()) return;
            const e: TreasuryExpense = {
                id: moneyId,
                label: label.trim(),
                amount: parseFloat(expAmount) || 0,
                currency: expCurrency,
                category: category.trim() || undefined,
                date: expDate || today(),
                recurring,
                projectId: expProjectName === NO_PROJECT ? undefined : projects?.find(p => p.name === expProjectName)?.id,
                // Client-paid expenses don't come out of any of my accounts.
                accountId: (expClientPaid || expAccountName === NO_ACCOUNT) ? undefined : accounts?.find(a => a.name === expAccountName)?.id,
                clientPaid: expClientPaid || undefined,
                attachments: attachments.length ? attachments : undefined,
                notes: notes.trim() || undefined,
                createdAt: expense?.createdAt ?? Date.now(),
            };
            onSaveExpense?.(e);
        } else {
            const amount = parseFloat(incAmount) || 0;
            if (!amount) return;
            const linked = incProjectName === NO_PROJECT ? null : projects?.find(p => p.name === incProjectName) ?? null;
            const i: TreasuryIncome = {
                id: moneyId,
                amount,
                currency: incCurrency,
                date: incDate || today(),
                projectId: linked?.id,
                accountId: incAccountName === NO_ACCOUNT ? undefined : accounts?.find(a => a.name === incAccountName)?.id,
                attachments: attachments.length ? attachments : undefined,
                // Only meaningful for monthly retainers; flags this as the month's payment.
                monthlyPayment: linked?.monthly && incIsMonthly ? true : undefined,
                note: notes.trim() || undefined,
                createdAt: income?.createdAt ?? Date.now(),
            };
            onSaveIncome?.(i);
        }
        onClose();
    };

    const fieldBg = isDark ? 'bg-white/5 border-white/10' : 'bg-black/[0.03] border-black/10';
    const inputCls = `w-full px-3.5 py-2.5 rounded-xl border ${fieldBg} text-primary text-sm outline-none focus:border-blue-400/50 transition-colors`;
    const labelCls = 'text-xs font-semibold text-sec uppercase tracking-wider mb-3 block';

    const activeCurrency = mode === 'project' ? priceCurrency : kind === 'expense' ? expCurrency : incCurrency;

    const currencyPicker = (value: Currency, onChange: (c: Currency) => void) => (
        <div className={`flex rounded-xl border ${fieldBg} p-1 gap-1`}>
            {CURRENCIES.map(c => (
                <button key={c} type="button" onClick={() => onChange(c)}
                    className={`flex-1 py-1.5 rounded-lg text-xs font-bold transition-all ${value === c ? 'bg-blue-500 text-white shadow' : 'text-sec hover:text-primary'}`}>
                    {CURRENCY_SYMBOL[c]} {c}
                </button>
            ))}
        </div>
    );

    return createPortal(
        <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="te-overlay fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
            onClick={onClose}
        >
            <motion.div
                initial={{ scale: 0.95, opacity: 0, y: 15 }}
                animate={{ scale: 1, opacity: 1, y: 0 }}
                exit={{ scale: 0.95, opacity: 0, y: 15 }}
                transition={{ type: 'spring', damping: 25, stiffness: 350 }}
                onClick={e => e.stopPropagation()}
                className={`te-content w-full max-w-lg max-h-[92vh] overflow-y-auto custom-scrollbar rounded-3xl border shadow-2xl ${isDark ? 'bg-[#0f0f14] border-white/10' : 'bg-white border-black/5'}`}
            >
                {/* Header */}
                <div className="flex items-center justify-between p-5 border-b border-[var(--section-border)] sticky top-0 z-10 backdrop-blur-xl" style={{ background: isDark ? 'rgba(15,15,20,0.85)' : 'rgba(255,255,255,0.85)' }}>
                    <div className="flex items-center gap-3">
                        <div className={`w-9 h-9 rounded-xl flex items-center justify-center ${mode === 'income' ? 'bg-emerald-500/10 text-emerald-500' : 'bg-blue-500/10 text-blue-500'}`}>
                            <HeaderIcon size={18} />
                        </div>
                        <h3 className="text-lg font-bold text-primary font-inter m-0">{isEdit ? 'Edit' : 'New'} {titleLabel}</h3>
                    </div>
                    <button onClick={onClose} className="p-2 rounded-lg text-sec hover:text-primary hover:bg-black/5 dark:hover:bg-white/10 transition-all"><X size={18} /></button>
                </div>

                {/* Body */}
                <div className="p-5 flex flex-col gap-4">
                    {mode === 'project' && (
                        <>
                            <div>
                                <label className={labelCls}>Project name</label>
                                <input className={inputCls} value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Acme rebrand" autoFocus />
                            </div>
                            <div>
                                <label className={labelCls}>Client</label>
                                <input className={inputCls} value={client} onChange={e => setClient(e.target.value)} placeholder="Optional - company or person" />
                            </div>
                            <div>
                                <label className={labelCls}>Status</label>
                                <div className={`flex rounded-xl border ${fieldBg} p-1 gap-1`}>
                                    {(['active', 'pending', 'completed'] as ProjectStatus[]).map(s => (
                                        <button key={s} type="button" onClick={() => setStatus(s)}
                                            className={`flex-1 py-1.5 rounded-lg text-xs font-bold capitalize transition-all ${status === s ? 'bg-blue-500 text-white shadow' : 'text-sec hover:text-primary'}`}>
                                            {s}
                                        </button>
                                    ))}
                                </div>
                            </div>
            <div className="grid grid-cols-2 gap-3">
                                <div>
                                    <label className={labelCls}>{monthly ? 'Monthly rate' : 'Price'}</label>
                                    <input className={inputCls} type="number" inputMode="decimal" value={priceAmount} onChange={e => setPriceAmount(e.target.value)} placeholder="0" />
                                </div>
                                <div>
                                    <label className={labelCls}>Currency</label>
                                    {currencyPicker(priceCurrency, setPriceCurrency)}
                                </div>
                            </div>
                            <label className="flex items-center gap-3 cursor-pointer select-none">
                                <input type="checkbox" checked={monthly} onChange={e => setMonthly(e.target.checked)} className="w-4 h-4 accent-emerald-500" />
                                <span className="text-sm text-primary font-medium">Pays monthly (retainer) - the amount above is per month</span>
                            </label>
                            <p className="text-[11px] text-sec -mt-1">Money received is logged separately in <span className="font-semibold">Income</span> - so payments can come in over time.</p>
                            <div className="grid grid-cols-2 gap-3">
                                <div>
                                    <label className={labelCls}>Started</label>
                                    <DatePicker value={startDate} onChange={setStartDate} isDark={isDark} placeholder="Start date" />
                                </div>
                                <div>
                                    <label className={labelCls}>Ended</label>
                                    <DatePicker value={endDate} onChange={setEndDate} isDark={isDark} placeholder="Not ended" />
                                </div>
                            </div>
                            <label className="flex items-center gap-3 cursor-pointer select-none">
                                <input type="checkbox" checked={done} onChange={e => setDone(e.target.checked)} className="w-4 h-4 accent-green-500" />
                                <span className="text-sm text-primary font-medium">Mark as done (sets the end date)</span>
                            </label>
                        </>
                    )}

                    {isMoney && (
                        <div>
                            <label className={labelCls}>Type</label>
                            <div className={`flex rounded-xl border ${fieldBg} p-1 gap-1`}>
                                {(['income', 'expense'] as const).map(k => (
                                    <button key={k} type="button" disabled={isEdit} onClick={() => setKind(k)}
                                        className={`flex-1 py-1.5 rounded-lg text-xs font-bold transition-all ${kind === k ? (k === 'income' ? 'bg-emerald-500 text-white shadow' : 'bg-rose-500 text-white shadow') : 'text-sec hover:text-primary'} ${isEdit ? 'opacity-60 cursor-not-allowed' : ''}`}>
                                        {k === 'income' ? 'Income (money in)' : 'Expense (money out)'}
                                    </button>
                                ))}
                            </div>
                        </div>
                    )}

                    {isMoney && kind === 'expense' && (
                        <>
                            <div className="relative">
                                <label className={labelCls}>What was it for?</label>
                                <input
                                    className={inputCls}
                                    value={label}
                                    onChange={e => { setLabel(e.target.value); setShowLabelSug(true); }}
                                    onBlur={() => setTimeout(() => setShowLabelSug(false), 120)}
                                    placeholder="e.g. Figma subscription"
                                    autoComplete="off"
                                    autoFocus
                                />
                                <AnimatePresence>
                                    {showLabelSug && labelSuggestions.length > 0 && (
                                        <motion.div
                                            initial={{ opacity: 0, y: -6, scale: 0.98 }}
                                            animate={{ opacity: 1, y: 0, scale: 1 }}
                                            exit={{ opacity: 0, y: -6, scale: 0.98 }}
                                            transition={{ duration: 0.16, ease: [0.16, 1, 0.3, 1] }}
                                            style={{ transformOrigin: 'top center' }}
                                            className={`absolute left-0 right-0 top-full mt-1.5 z-30 rounded-xl border shadow-2xl overflow-hidden ${isDark ? 'bg-[#15151c] border-white/10' : 'bg-white border-black/10'}`}
                                        >
                                            <div className="px-3 pt-2 pb-1 text-[10px] font-bold uppercase tracking-wider text-sec">Repeat a past expense</div>
                                            {labelSuggestions.map(t => (
                                                <button
                                                    key={t.label}
                                                    type="button"
                                                    onMouseDown={e => { e.preventDefault(); applyTemplate(t); }}
                                                    className="w-full flex items-center justify-between gap-3 px-3.5 py-2.5 text-left hover:bg-black/[0.04] dark:hover:bg-white/[0.06] transition-colors"
                                                >
                                                    <span className="min-w-0">
                                                        <span className="flex items-center gap-1.5 text-sm font-semibold text-primary truncate">
                                                            {t.label}
                                                            {t.recurring && <Repeat size={11} className="text-blue-400 shrink-0" />}
                                                        </span>
                                                        {(t.category || t.count > 1) && (
                                                            <span className="block text-[11px] text-sec truncate">
                                                                {t.category || ''}{t.category && t.count > 1 ? ' · ' : ''}{t.count > 1 ? `used ${t.count}×` : ''}
                                                            </span>
                                                        )}
                                                    </span>
                                                    <span className="text-xs font-bold text-sec whitespace-nowrap">{formatMoney(t.amount, t.currency)}</span>
                                                </button>
                                            ))}
                                        </motion.div>
                                    )}
                                </AnimatePresence>
                            </div>
                            <div className="grid grid-cols-2 gap-3">
                                <div>
                                    <label className={labelCls}>Amount ({CURRENCY_SYMBOL[activeCurrency]} {activeCurrency})</label>
                                    <input className={inputCls} type="number" inputMode="decimal" value={expAmount} onChange={e => setExpAmount(e.target.value)} placeholder="0" />
                                </div>
                                <div>
                                    <label className={labelCls}>Date</label>
                                    <DatePicker value={expDate} onChange={setExpDate} isDark={isDark} placeholder="Pick a date" allowClear={false} />
                                </div>
                            </div>
                            <div>
                                <label className={labelCls}>Currency</label>
                                {currencyPicker(expCurrency, setExpCurrency)}
                            </div>
                            <div className="relative">
                                <label className={labelCls}>Category</label>
                                <input
                                    className={inputCls}
                                    value={category}
                                    onChange={e => { setCategory(e.target.value); setShowCatSug(true); }}
                                    onFocus={() => setShowCatSug(true)}
                                    onBlur={() => setTimeout(() => setShowCatSug(false), 120)}
                                    placeholder="Optional - tools, ads, hosting…"
                                    autoComplete="off"
                                />
                                <AnimatePresence>
                                    {showCatSug && categorySuggestions.length > 0 && (
                                        <motion.div
                                            initial={{ opacity: 0, y: -6, scale: 0.98 }}
                                            animate={{ opacity: 1, y: 0, scale: 1 }}
                                            exit={{ opacity: 0, y: -6, scale: 0.98 }}
                                            transition={{ duration: 0.16, ease: [0.16, 1, 0.3, 1] }}
                                            style={{ transformOrigin: 'top center' }}
                                            className={`absolute left-0 right-0 top-full mt-1.5 z-30 rounded-xl border shadow-2xl overflow-hidden max-h-[220px] overflow-y-auto custom-scrollbar ${isDark ? 'bg-[#15151c] border-white/10' : 'bg-white border-black/10'}`}
                                        >
                                            <div className="px-3 pt-2 pb-1 text-[10px] font-bold uppercase tracking-wider text-sec">Past categories</div>
                                            {categorySuggestions.map(c => (
                                                <button
                                                    key={c}
                                                    type="button"
                                                    onMouseDown={e => { e.preventDefault(); setCategory(c); setShowCatSug(false); }}
                                                    className="w-full px-3.5 py-2.5 text-left text-sm font-medium text-primary hover:bg-black/[0.04] dark:hover:bg-white/[0.06] transition-colors truncate"
                                                >
                                                    {c}
                                                </button>
                                            ))}
                                        </motion.div>
                                    )}
                                </AnimatePresence>
                            </div>
                            <div>
                                <label className={labelCls}>For project (optional)</label>
                                <ScrollMenu value={expProjectName} options={expProjectOpts} onChange={setExpProjectName} isDark={isDark} placeholder="Link to a project" />
                            </div>
                            <div>
                                <label className={labelCls}>Who paid this?</label>
                                <div className={`flex rounded-xl border ${fieldBg} p-1 gap-1`}>
                                    {([['me', 'I paid it'], ['client', 'Client paid it']] as const).map(([val, lbl]) => {
                                        const on = (val === 'client') === expClientPaid;
                                        return (
                                            <button key={val} type="button" onClick={() => setExpClientPaid(val === 'client')}
                                                className={`flex-1 py-1.5 rounded-lg text-xs font-bold transition-all ${on ? 'bg-blue-500 text-white shadow' : 'text-sec hover:text-primary'}`}>
                                                {lbl}
                                            </button>
                                        );
                                    })}
                                </div>
                                {expClientPaid && <p className="text-[11px] text-sec mt-1.5">Recorded for reference only — not counted as your spending or pulled from any account.</p>}
                            </div>
                            {!expClientPaid && (accounts?.length ?? 0) > 0 && (
                                <div>
                                    <label className={labelCls}>Paid from account</label>
                                    <ScrollMenu value={expAccountName} options={expAccountOpts} onChange={setExpAccountName} isDark={isDark} placeholder="Which account?" />
                                    <p className="text-[11px] text-sec mt-1.5">Deducts this from the account&apos;s balance.</p>
                                </div>
                            )}
                            <label className="flex items-center gap-3 cursor-pointer select-none">
                                <input type="checkbox" checked={recurring} onChange={e => setRecurring(e.target.checked)} className="w-4 h-4 accent-blue-500" />
                                <span className="text-sm text-primary font-medium">Monthly fee (recurring)</span>
                            </label>
                        </>
                    )}

                    {isMoney && kind === 'income' && (
                        <>
                            <div className="grid grid-cols-2 gap-3">
                                <div>
                                    <label className={labelCls}>Amount ({CURRENCY_SYMBOL[activeCurrency]} {activeCurrency})</label>
                                    <input className={inputCls} type="number" inputMode="decimal" value={incAmount} onChange={e => setIncAmount(e.target.value)} placeholder="0" autoFocus />
                                </div>
                                <div>
                                    <label className={labelCls}>Date received</label>
                                    <DatePicker value={incDate} onChange={setIncDate} isDark={isDark} placeholder="Pick a date" allowClear={false} />
                                </div>
                            </div>
                            <div>
                                <label className={labelCls}>Currency I got paid with</label>
                                {currencyPicker(incCurrency, setIncCurrency)}
                            </div>
                            <div>
                                <label className={labelCls}>From project (optional)</label>
                                <ScrollMenu value={incProjectName} options={incProjectOpts} onChange={setIncProjectName} isDark={isDark} placeholder="Link to a project" />
                                <p className="text-[11px] text-sec mt-1.5">Linking counts this toward that project&apos;s received amount.</p>
                            </div>

                            {(accounts?.length ?? 0) > 0 && (
                                <div>
                                    <label className={labelCls}>Into account</label>
                                    <ScrollMenu value={incAccountName} options={incAccountOpts} onChange={setIncAccountName} isDark={isDark} placeholder="Which account?" />
                                    <p className="text-[11px] text-sec mt-1.5">Adds this to the account&apos;s balance.</p>
                                </div>
                            )}

                            {/* Monthly retainer: is this THE monthly payment, or a one-off extra? */}
                            {isMonthlyProject && (
                                <div className={`rounded-2xl border p-3.5 flex flex-col gap-3 ${isDark ? 'bg-emerald-500/[0.04] border-emerald-500/20' : 'bg-emerald-500/[0.04] border-emerald-500/20'}`}>
                                    <div className="flex items-start gap-2.5">
                                        <Repeat size={16} className="text-emerald-500 mt-0.5 shrink-0" />
                                        <div className="min-w-0">
                                            <p className="text-sm font-bold text-primary leading-snug">Is this {selectedIncProject?.name}&apos;s monthly payment?</p>
                                            <p className="text-[11px] text-sec leading-snug mt-0.5">Whether it came early or late, marking it as the monthly payment sets the next expected date. Choose &ldquo;No&rdquo; to log it as a normal one-off income.</p>
                                        </div>
                                    </div>
                                    <div className={`flex rounded-xl border ${fieldBg} p-1 gap-1`}>
                                        {([['yes', 'Yes - monthly payment'], ['no', 'No - normal income']] as const).map(([val, lbl]) => {
                                            const on = (val === 'yes') === incIsMonthly;
                                            return (
                                                <button key={val} type="button" onClick={() => setIncIsMonthly(val === 'yes')}
                                                    className={`flex-1 py-1.5 rounded-lg text-xs font-bold transition-all ${on ? 'bg-emerald-500 text-white shadow' : 'text-sec hover:text-primary'}`}>
                                                    {lbl}
                                                </button>
                                            );
                                        })}
                                    </div>
                                    {nextDuePreview && (
                                        <p className="text-[11px] font-semibold text-emerald-600 dark:text-emerald-400 flex items-center gap-1.5">
                                            <Banknote size={12} className="shrink-0" />
                                            Next payment will be expected on {new Date(`${nextDuePreview}T00:00:00`).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}.
                                        </p>
                                    )}
                                </div>
                            )}
                        </>
                    )}

                    {isMoney && (
                        <div>
                            <label className={labelCls}>Attachments (optional)</label>
                            <div className="flex flex-wrap gap-2.5">
                                {attachments.map(url => (
                                    <div key={url} className="relative w-16 h-16 rounded-xl overflow-hidden border border-[var(--input-border)] group/att">
                                        <a href={url} target="_blank" rel="noopener noreferrer" title="Open full size">
                                            <img src={url} alt="Attachment" className="w-full h-full object-cover" />
                                        </a>
                                        <button type="button" onClick={() => removeAttachment(url)} aria-label="Remove attachment"
                                            className="absolute top-0.5 right-0.5 w-5 h-5 rounded-full bg-black/65 text-white flex items-center justify-center opacity-0 group-hover/att:opacity-100 transition-opacity hover:bg-rose-500">
                                            <X size={12} />
                                        </button>
                                    </div>
                                ))}
                                {uploading > 0 && Array.from({ length: uploading }).map((_, i) => (
                                    <div key={`up-${i}`} className={`w-16 h-16 rounded-xl border border-dashed ${fieldBg} flex items-center justify-center`}>
                                        <Loader2 size={18} className="animate-spin text-blue-400" />
                                    </div>
                                ))}
                                <label className={`w-16 h-16 rounded-xl border border-dashed ${fieldBg} flex flex-col items-center justify-center gap-1 cursor-pointer text-sec hover:text-primary hover:border-blue-400/50 transition-colors`}>
                                    <ImagePlus size={18} />
                                    <span className="text-[9px] font-bold uppercase tracking-wide">Add</span>
                                    <input type="file" accept="image/*" multiple className="hidden" onChange={e => { addFiles(e.target.files); e.target.value = ''; }} />
                                </label>
                            </div>
                            <p className="text-[11px] text-sec mt-1.5 flex items-center gap-1"><Paperclip size={11} /> Receipts or proof - images only, private to you.</p>
                        </div>
                    )}

                    <div>
                        <label className={labelCls}>{isMoney && kind === 'income' ? 'Note' : 'Notes'}</label>
                        <textarea className={`${inputCls} resize-none`} rows={3} value={notes} onChange={e => setNotes(e.target.value)} placeholder="Optional notes…" />
                    </div>
                </div>

                {/* Footer */}
                <div className="p-4 flex gap-3 border-t border-[var(--section-border)] sticky bottom-0 backdrop-blur-xl" style={{ background: isDark ? 'rgba(15,15,20,0.85)' : 'rgba(255,255,255,0.85)' }}>
                    {isEdit && onDelete && (
                        <button onClick={() => { onDelete(); onClose(); }} className="px-4 py-2.5 rounded-xl font-semibold text-sm text-red-500 hover:bg-red-500/10 transition-all flex items-center gap-2">
                            <Trash2 size={16} /> Delete
                        </button>
                    )}
                    <div className="flex-1" />
                    <button onClick={onClose} className="px-5 py-2.5 rounded-xl font-semibold text-sm text-sec hover:bg-black/5 dark:hover:bg-white/10 transition-all">Cancel</button>
                    <button onClick={save} disabled={uploading > 0} className={`px-6 py-2.5 rounded-xl font-bold text-sm text-white shadow-lg transition-all active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed inline-flex items-center gap-2 ${mode === 'project' ? 'bg-blue-500 hover:bg-blue-600 shadow-blue-500/20' : kind === 'income' ? 'bg-emerald-500 hover:bg-emerald-600 shadow-emerald-500/20' : 'bg-rose-500 hover:bg-rose-600 shadow-rose-500/20'}`}>
                        {uploading > 0 && <Loader2 size={15} className="animate-spin" />}
                        {uploading > 0 ? 'Uploading…' : isEdit ? 'Save' : 'Add'}
                    </button>
                </div>
            </motion.div>
        </motion.div>,
        document.body
    );
};

export default MTreasuryEntry;
