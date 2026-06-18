import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { X, Trash2, Briefcase, Receipt, Banknote } from 'lucide-react';
import { motion } from 'motion/react';
import {
    CURRENCIES, CURRENCY_SYMBOL, Currency, ProjectStatus,
    TreasuryProject, TreasuryExpense, TreasuryIncome, TreasuryConfig, uid, derivePaymentStatus,
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
    projects?: { id: string; name: string }[]; // for the income → project picker
    nextOrder: number;
    onSaveProject?: (p: TreasuryProject) => void;
    onSaveExpense?: (e: TreasuryExpense) => void;
    onSaveIncome?: (i: TreasuryIncome) => void;
    onDelete?: () => void;
    onClose: () => void;
}

const today = () => new Date().toISOString().slice(0, 10);
const NO_PROJECT = '- No project -';

const MTreasuryEntry = ({ mode, config, project, expense, income, projects, nextOrder, onSaveProject, onSaveExpense, onSaveIncome, onDelete, onClose }: Props) => {
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
    const [expProjectName, setExpProjectName] = useState(() => expense?.projectId ? (projects?.find(p => p.id === expense.projectId)?.name ?? NO_PROJECT) : NO_PROJECT);

    // Income fields
    const [incAmount, setIncAmount] = useState(income?.amount ? String(income.amount) : '');
    const [incCurrency, setIncCurrency] = useState<Currency>(income?.currency ?? config.defaultCurrency);
    const [incDate, setIncDate] = useState(income?.date ?? today());
    const [incProjectName, setIncProjectName] = useState(() => {
        if (income?.projectId) return projects?.find(p => p.id === income.projectId)?.name ?? NO_PROJECT;
        return NO_PROJECT;
    });

    // Shared notes
    const [notes, setNotes] = useState((mode === 'project' ? project?.notes : mode === 'expense' ? expense?.notes : income?.note) ?? '');

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
                id: expense?.id ?? uid('exp'),
                label: label.trim(),
                amount: parseFloat(expAmount) || 0,
                currency: expCurrency,
                category: category.trim() || undefined,
                date: expDate || today(),
                recurring,
                projectId: expProjectName === NO_PROJECT ? undefined : projects?.find(p => p.name === expProjectName)?.id,
                notes: notes.trim() || undefined,
                createdAt: expense?.createdAt ?? Date.now(),
            };
            onSaveExpense?.(e);
        } else {
            const amount = parseFloat(incAmount) || 0;
            if (!amount) return;
            const projectId = incProjectName === NO_PROJECT ? undefined : projects?.find(p => p.name === incProjectName)?.id;
            const i: TreasuryIncome = {
                id: income?.id ?? uid('inc'),
                amount,
                currency: incCurrency,
                date: incDate || today(),
                projectId,
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
                            <div>
                                <label className={labelCls}>What was it for?</label>
                                <input className={inputCls} value={label} onChange={e => setLabel(e.target.value)} placeholder="e.g. Figma subscription" autoFocus />
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
                            <div>
                                <label className={labelCls}>Category</label>
                                <input className={inputCls} value={category} onChange={e => setCategory(e.target.value)} placeholder="Optional - tools, ads, hosting…" />
                            </div>
                            <div>
                                <label className={labelCls}>For project (optional)</label>
                                <ScrollMenu value={expProjectName} options={[NO_PROJECT, ...(projects || []).map(p => p.name)]} onChange={setExpProjectName} isDark={isDark} placeholder="Link to a project" />
                            </div>
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
                                <ScrollMenu value={incProjectName} options={[NO_PROJECT, ...(projects || []).map(p => p.name)]} onChange={setIncProjectName} isDark={isDark} placeholder="Link to a project" />
                                <p className="text-[11px] text-sec mt-1.5">Linking counts this toward that project&apos;s received amount.</p>
                            </div>
                        </>
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
                    <button onClick={save} className={`px-6 py-2.5 rounded-xl font-bold text-sm text-white shadow-lg transition-all active:scale-95 ${mode === 'project' ? 'bg-blue-500 hover:bg-blue-600 shadow-blue-500/20' : kind === 'income' ? 'bg-emerald-500 hover:bg-emerald-600 shadow-emerald-500/20' : 'bg-rose-500 hover:bg-rose-600 shadow-rose-500/20'}`}>
                        {isEdit ? 'Save' : 'Add'}
                    </button>
                </div>
            </motion.div>
        </motion.div>,
        document.body
    );
};

export default MTreasuryEntry;
