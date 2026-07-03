import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { X, Trash2, Wallet, Landmark, Banknote, CreditCard, Coins, Archive, TrendingUp } from 'lucide-react';
import { motion } from 'motion/react';
import {
    CURRENCIES, CURRENCY_SYMBOL, Currency, AccountType, ACCOUNT_TYPES,
    TreasuryAccount, TreasuryConfig, uid,
} from '../../lib/treasury';

interface Props {
    config: TreasuryConfig;
    account?: TreasuryAccount | null;
    nextOrder: number;
    onSave: (a: TreasuryAccount) => void;
    onDelete?: () => void;
    onClose: () => void;
}

// Lucide glyph per account type - keeps the icon language consistent with the panel.
export const ACCOUNT_ICON: Record<AccountType, typeof Wallet> = {
    cash: Banknote, bank: Landmark, card: CreditCard, wallet: Wallet, other: Coins,
};

// A distinct accent per account type, so each is recognisable at a glance.
export const ACCOUNT_COLOR: Record<AccountType, string> = {
    cash: '#10b981',    // emerald
    bank: '#3b82f6',    // blue
    card: '#8b5cf6',    // violet
    wallet: '#f59e0b',  // amber
    other: '#ec4899',   // pink
};

const MAccount = ({ config, account, nextOrder, onSave, onDelete, onClose }: Props) => {
    const [isDark, setIsDark] = useState(false);
    const [name, setName] = useState(account?.name ?? '');
    const [type, setType] = useState<AccountType>(account?.type ?? 'bank');
    const [currency, setCurrency] = useState<Currency>(account?.currency ?? config.defaultCurrency);
    const [opening, setOpening] = useState(account?.openingBalance ? String(account.openingBalance) : '');
    const [notes, setNotes] = useState(account?.notes ?? '');
    const [archived, setArchived] = useState(account?.archived ?? false);
    const [countsTowardNetProfit, setCountsTowardNetProfit] = useState(!account?.excludeFromNetProfit);

    const isEdit = !!account;

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
        if (!name.trim()) return;
        const a: TreasuryAccount = {
            id: account?.id || uid('acct'),
            name: name.trim(),
            type,
            currency,
            openingBalance: parseFloat(opening) || 0,
            notes: notes.trim() || undefined,
            archived: archived || undefined,
            excludeFromNetProfit: countsTowardNetProfit ? undefined : true,
            order: account?.order ?? nextOrder,
            createdAt: account?.createdAt ?? Date.now(),
        };
        onSave(a);
        onClose();
    };

    const fieldBg = isDark ? 'bg-white/5 border-white/10' : 'bg-black/[0.03] border-black/10';
    const inputCls = `w-full px-3.5 py-2.5 rounded-xl border ${fieldBg} text-primary text-sm outline-none focus:border-blue-400/50 transition-colors`;
    const labelCls = 'text-xs font-semibold text-sec uppercase tracking-wider mb-3 block';

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
                className={`te-content w-full max-w-md max-h-[92vh] overflow-y-auto custom-scrollbar rounded-3xl border shadow-2xl ${isDark ? 'bg-[#0f0f14] border-white/10' : 'bg-white border-black/5'}`}
            >
                {/* Header */}
                <div className="flex items-center justify-between p-5 border-b border-[var(--section-border)] sticky top-0 z-10 backdrop-blur-xl" style={{ background: isDark ? 'rgba(15,15,20,0.85)' : 'rgba(255,255,255,0.85)' }}>
                    <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-xl flex items-center justify-center bg-blue-500/10 text-blue-500">
                            <Wallet size={18} />
                        </div>
                        <h3 className="text-lg font-bold text-primary font-inter m-0">{isEdit ? 'Edit' : 'New'} account</h3>
                    </div>
                    <button onClick={onClose} className="p-2 rounded-lg text-sec hover:text-primary hover:bg-black/5 dark:hover:bg-white/10 transition-all"><X size={18} /></button>
                </div>

                {/* Body */}
                <div className="p-5 flex flex-col gap-4">
                    <div>
                        <label className={labelCls}>Account name</label>
                        <input className={inputCls} value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Main bank, Cash, PayPal" autoFocus />
                    </div>

                    <div>
                        <label className={labelCls}>Type</label>
                        <div className={`grid grid-cols-5 rounded-xl border ${fieldBg} p-1 gap-1`}>
                            {ACCOUNT_TYPES.map(t => {
                                const Icon = ACCOUNT_ICON[t];
                                const on = type === t;
                                return (
                                    <button key={t} type="button" onClick={() => setType(t)} title={t}
                                        className={`relative flex flex-col items-center gap-1 py-2 rounded-lg text-[10px] font-bold capitalize transition-colors ${on ? 'text-white' : 'text-sec hover:text-primary'}`}>
                                        {on && (
                                            <motion.span
                                                layoutId="account-type-pill"
                                                transition={{ type: 'spring', stiffness: 500, damping: 34 }}
                                                className="absolute inset-0 rounded-lg"
                                                style={{ background: ACCOUNT_COLOR[t], boxShadow: `0 4px 14px ${ACCOUNT_COLOR[t]}40` }}
                                            />
                                        )}
                                        <Icon size={15} className="relative z-10" />
                                        <span className="relative z-10">{t}</span>
                                    </button>
                                );
                            })}
                        </div>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                        <div>
                            <label className={labelCls}>Opening balance ({CURRENCY_SYMBOL[currency]} {currency})</label>
                            <input className={inputCls} type="number" inputMode="decimal" value={opening} onChange={e => setOpening(e.target.value)} placeholder="0" />
                        </div>
                        <div>
                            <label className={labelCls}>Currency</label>
                            <div className={`flex rounded-xl border ${fieldBg} p-1 gap-1`}>
                                {CURRENCIES.map(c => (
                                    <button key={c} type="button" onClick={() => setCurrency(c)}
                                        className={`flex-1 py-1.5 rounded-lg text-xs font-bold transition-all ${currency === c ? 'bg-blue-500 text-white shadow' : 'text-sec hover:text-primary'}`}>
                                        {CURRENCY_SYMBOL[c]}
                                    </button>
                                ))}
                            </div>
                        </div>
                    </div>
                    <p className="text-[11px] text-sec -mt-1">The balance updates as you log income into and expenses from this account.</p>

                    <div>
                        <label className={labelCls}>Notes</label>
                        <textarea className={`${inputCls} resize-none`} rows={2} value={notes} onChange={e => setNotes(e.target.value)} placeholder="Optional - account number, holder…" />
                    </div>

                    <div>
                        <label className="flex items-center gap-3 cursor-pointer select-none">
                            <input type="checkbox" checked={countsTowardNetProfit} onChange={e => setCountsTowardNetProfit(e.target.checked)} className="w-4 h-4 accent-emerald-500" />
                            <span className="text-sm text-primary font-medium flex items-center gap-1.5"><TrendingUp size={14} /> Counts toward net profit</span>
                        </label>
                        <p className="text-[11px] text-sec mt-1.5 ml-7">Turn off for money that isn't real business P&amp;L (e.g. savings, a client's escrow) - income/expenses here still update this account's balance, just not Net profit or the earnings chart.</p>
                    </div>

                    {isEdit && (
                        <label className="flex items-center gap-3 cursor-pointer select-none">
                            <input type="checkbox" checked={archived} onChange={e => setArchived(e.target.checked)} className="w-4 h-4 accent-amber-500" />
                            <span className="text-sm text-primary font-medium flex items-center gap-1.5"><Archive size={14} /> Archive (hide from pickers, keep history)</span>
                        </label>
                    )}
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
                    <button onClick={save} className="px-6 py-2.5 rounded-xl font-bold text-sm text-white shadow-lg transition-all active:scale-95 bg-blue-500 hover:bg-blue-600 shadow-blue-500/20">
                        {isEdit ? 'Save' : 'Add'}
                    </button>
                </div>
            </motion.div>
        </motion.div>,
        document.body
    );
};

export default MAccount;
