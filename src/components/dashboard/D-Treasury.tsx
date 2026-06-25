import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { doc, onSnapshot, setDoc, serverTimestamp } from 'firebase/firestore';
import { Reorder, motion, AnimatePresence } from 'motion/react';
import anime from 'animejs';
import {
    Plus, Download, CheckCircle2, Pencil, Receipt, Briefcase, LayoutDashboard,
    TrendingUp, TrendingDown, Wallet, Sparkles, Clock, Lightbulb, SlidersHorizontal,
    ChevronLeft, ChevronRight, RefreshCcw, Percent, Repeat, Hourglass, Tag, Banknote,
    GripVertical, Landmark, Wallet2, Paperclip,
} from 'lucide-react';
import {
    ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip, CartesianGrid, TooltipProps,
} from 'recharts';
import { onAuthStateChanged } from 'firebase/auth';
import { ref, listAll, deleteObject, getStorage } from 'firebase/storage';
import app, { db } from '../../lib/firebase';
import { appAuth } from '../../lib/appAuth';
// Lazy Dashboard chunk - keeps firebase/storage out of the eager bundle.
const storage = getStorage(app);
import {
    Currency, CURRENCIES, CURRENCY_SYMBOL, TreasuryData, TreasuryProject, TreasuryExpense,
    DEFAULT_CONFIG, computeTotals, buildDailySeries, buildInsights, formatMoney, projectBalance,
    projectReceived, projectPaymentStatus, buildHtmlReport, fetchLiveRates, InsightIcon, InsightTone, TreasuryIncome, convert,
    nextMonthlyPaymentDate, projectNextPaymentDate, TreasuryAccount, accountBalance, accountActivityCount, accountsTotal, accountOptions,
} from '../../lib/treasury';
import MTreasuryEntry from './M-TreasuryEntry';
import MAccount, { ACCOUNT_ICON, ACCOUNT_COLOR } from './M-Account';
import DatePicker from './DatePicker';
import ScrollMenu from './ScrollMenu';
import SaveBar from './SaveBar';
import Alert, { AlertType } from '../Alert';
import useSafeAlert from '../../hooks/useSafeAlert';

// Treasury is its own admin-only collection, sorted into one document per
// concern: the projects I handle, spendings (expenses), and settings (currency
// + FX). The homepage's sanitized name/status list is mirrored to the PUBLIC
// Settings/HandledProjects doc (prices/earnings never leave Treasury).
const PROJECTS_DOC = doc(db, 'Treasury', 'projects');
const SPENDINGS_DOC = doc(db, 'Treasury', 'spendings');
const INCOME_DOC = doc(db, 'Treasury', 'income');
const ACCOUNTS_DOC = doc(db, 'Treasury', 'accounts');
const SETTINGS_DOC = doc(db, 'Treasury', 'settings');
const HANDLED_PUBLIC_DOC = doc(db, 'Settings', 'HandledProjects');

type Tab = 'overview' | 'projects' | 'money' | 'accounts' | 'settings';
type ChartFilter = 'daily' | 'weekly' | 'monthly';
interface ChartPoint { label: string; fullDate: string; earned: number; spent: number; type: ChartFilter; }

// Per-insight Lucide icon + severity colour (icon + label carry meaning beyond
// colour alone, for accessibility).
const INSIGHT_ICONS: Record<InsightIcon, typeof Wallet> = {
    outstanding: Clock, invoice: Receipt, ratio: Percent, profit: TrendingUp,
    loss: TrendingDown, noprice: Tag, running: Hourglass, recurring: Repeat, empty: Lightbulb,
};
const TONE_COLOR: Record<InsightTone, string> = { warn: '#f59e0b', good: '#22c55e', info: '#3b82f6' };

// ── D-Views-style frosted tooltip ──────────────────────────────────────────
const ChartTooltip = ({ active, payload, isDark, cur }: TooltipProps<number, string> & { isDark?: boolean; cur: Currency }) => {
    if (!active || !payload || !payload.length) return null;
    const p = payload[0].payload as ChartPoint;
    const d = new Date(p.fullDate);
    let header = p.label;
    if (p.type === 'weekly' && !isNaN(d.getTime())) { const e = new Date(d); e.setDate(e.getDate() + 6); header = `${d.getDate()}/${d.getMonth() + 1} - ${e.getDate()}/${e.getMonth() + 1}`; }
    else if (p.type === 'monthly' && !isNaN(d.getTime())) header = d.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
    else if (!isNaN(d.getTime())) header = `${d.toLocaleDateString('en-US', { weekday: 'short' })}, ${d.getDate()}/${d.getMonth() + 1}`;
    const net = (p.earned || 0) - (p.spent || 0);
    const rows = [
        { c: '#10B981', label: 'Earned', v: p.earned || 0 },
        { c: '#F43F5E', label: 'Spent', v: p.spent || 0 },
        { c: '#3B82F6', label: 'Net', v: net },
    ];
    return (
        <div className={`p-4 rounded-3xl border shadow-2xl backdrop-blur-3xl ${isDark ? 'bg-black/80 border-white/10' : 'bg-white/70 border-black/5 shadow-[0_20px_40px_rgba(0,0,0,0.1)]'}`}>
            <div className={`text-[10px] font-bold uppercase tracking-widest mb-2 ${isDark ? 'text-white/40' : 'text-slate-500'}`}>{header}</div>
            <div className="flex flex-col gap-2">
                {rows.map(r => (
                    <div key={r.label} className="flex items-center gap-2">
                        <div className="w-1.5 h-1.5 rounded-full" style={{ background: r.c, boxShadow: `0 0 10px ${r.c}` }} />
                        <span className={`text-sm font-bold ${isDark ? 'text-white' : 'text-slate-900'}`}>
                            {formatMoney(r.v, cur)}
                            <span className={`font-normal text-[10px] uppercase tracking-tight ml-1.5 ${isDark ? 'text-white/40' : 'text-slate-400'}`}>{r.label}</span>
                        </span>
                    </div>
                ))}
            </div>
        </div>
    );
};

// ── Paginated day/week/month chart (mirrors D-Views/D-Links) ───────────────
const TreasuryChart = ({ data, filter, setFilter, isDark, cur }: {
    data: ChartPoint[]; filter: ChartFilter; setFilter: (f: ChartFilter) => void; isDark: boolean; cur: Currency;
}) => {
    const [pageIndex, setPageIndex] = useState(0);
    const [direction, setDirection] = useState(0);
    const chartRef = useRef<HTMLDivElement>(null);
    const containerRef = useRef<HTMLDivElement>(null);
    const touchStartRef = useRef<{ x: number; y: number; time: number } | null>(null);
    const isSwipingRef = useRef(false);
    const wheelCooldownRef = useRef(false);
    const [cw, setCw] = useState(800);

    useEffect(() => {
        const el = containerRef.current;
        if (!el) return;
        const ro = new ResizeObserver(entries => { const w = entries[0]?.contentRect.width; if (w) setCw(w); });
        ro.observe(el);
        return () => ro.disconnect();
    }, []);

    const pointsPerPage = useMemo(() => {
        if (filter === 'daily') { if (cw < 380) return 7; if (cw < 560) return 10; if (cw < 760) return 14; if (cw < 1000) return 18; return 24; }
        if (filter === 'weekly') return cw < 480 ? 5 : cw < 800 ? 8 : 12;
        return 999;
    }, [filter, cw]);

    const pages = useMemo(() => {
        if (data.length === 0) return [[]];
        if (filter === 'monthly') return [data];
        const chunks: ChartPoint[][] = [];
        for (let i = 0; i < data.length; i += pointsPerPage) chunks.push(data.slice(i, i + pointsPerPage));
        return chunks.length ? chunks : [[]];
    }, [data, filter, pointsPerPage]);

    const totalPages = pages.length;
    const safePageIndex = Math.min(pageIndex, totalPages - 1);
    const currentPageData = useMemo(() => pages[safePageIndex] || [], [pages, safePageIndex]);

    const pageEarned = useMemo(() => currentPageData.reduce((s, d) => s + (d.earned || 0), 0), [currentPageData]);
    const pageSpent = useMemo(() => currentPageData.reduce((s, d) => s + (d.spent || 0), 0), [currentPageData]);

    // Land on the latest page whenever the filter (and thus paging) changes.
    useEffect(() => {
        const target = Math.max(0, totalPages - 1);
        if (pageIndex !== target) {
            // eslint-disable-next-line react-hooks/set-state-in-effect
            setPageIndex(target);
            setDirection(0);
        }
    }, [totalPages, filter]); // eslint-disable-line react-hooks/exhaustive-deps

    const changePage = useCallback((next: number) => {
        if (next >= 0 && next < totalPages && next !== safePageIndex) { setDirection(next > safePageIndex ? 1 : -1); setPageIndex(next); }
    }, [totalPages, safePageIndex]);

    // Touch + trackpad paging (native listeners for passive:false)
    useEffect(() => {
        const el = chartRef.current;
        if (!el || totalPages <= 1) return;
        const onStart = (e: TouchEvent) => { const t = e.touches[0]; touchStartRef.current = { x: t.clientX, y: t.clientY, time: Date.now() }; isSwipingRef.current = false; };
        const onMove = (e: TouchEvent) => { if (!touchStartRef.current) return; const t = e.touches[0]; const dx = t.clientX - touchStartRef.current.x, dy = t.clientY - touchStartRef.current.y; if (Math.abs(dx) > Math.abs(dy) && Math.abs(dx) > 10) { isSwipingRef.current = true; e.preventDefault(); } };
        const onEnd = (e: TouchEvent) => { if (!touchStartRef.current || !isSwipingRef.current) { touchStartRef.current = null; return; } const dx = e.changedTouches[0].clientX - touchStartRef.current.x; if (Math.abs(dx) > 30) changePage(dx < 0 ? safePageIndex + 1 : safePageIndex - 1); touchStartRef.current = null; isSwipingRef.current = false; };
        const onWheel = (e: WheelEvent) => { if (wheelCooldownRef.current) return; const d = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : 0; if (Math.abs(d) < 20) return; e.preventDefault(); wheelCooldownRef.current = true; changePage(d > 0 ? safePageIndex + 1 : safePageIndex - 1); setTimeout(() => { wheelCooldownRef.current = false; }, 300); };
        el.addEventListener('touchstart', onStart, { passive: true });
        el.addEventListener('touchmove', onMove, { passive: false });
        el.addEventListener('touchend', onEnd, { passive: true });
        el.addEventListener('wheel', onWheel, { passive: false });
        return () => { el.removeEventListener('touchstart', onStart); el.removeEventListener('touchmove', onMove); el.removeEventListener('touchend', onEnd); el.removeEventListener('wheel', onWheel); };
    }, [totalPages, safePageIndex, changePage]);

    const pageTitle = useMemo(() => {
        if (!currentPageData.length) return '';
        const first = new Date(currentPageData[0].fullDate), last = new Date(currentPageData[currentPageData.length - 1].fullDate);
        if (filter === 'monthly') return 'All time';
        if (first.getMonth() === last.getMonth() && first.getFullYear() === last.getFullYear()) return first.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
        return `${first.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} – ${last.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`;
    }, [currentPageData, filter]);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const pageVariants: any = {
        enter: (dir: number) => ({ x: dir > 0 ? '80%' : '-80%', opacity: 0 }),
        center: { x: 0, opacity: 1, transition: { duration: 0.3, ease: [0.16, 1, 0.3, 1] } },
        exit: (dir: number) => ({ x: dir > 0 ? '-30%' : '30%', opacity: 0, transition: { duration: 0.2 } }),
    };

    return (
        <div ref={containerRef} className="glass-panel p-5 sm:p-6 relative overflow-hidden">
            {/* Row 1: stats + filter */}
            <div className="flex flex-wrap items-end justify-between gap-4 mb-5">
                <div className="flex items-end gap-6 sm:gap-10">
                    <div>
                        <p className="text-sec text-[9px] font-bold uppercase tracking-[0.25em] mb-1.5">Earned · {cur}</p>
                        <h3 className="text-3xl sm:text-4xl font-black tracking-[-0.03em] leading-none tnum" style={{ color: '#10B981' }}>{formatMoney(pageEarned, cur)}</h3>
                    </div>
                    <div>
                        <p className="text-sec text-[9px] font-bold uppercase tracking-[0.25em] mb-1.5">Spent</p>
                        <h3 className="text-3xl sm:text-4xl font-black tracking-[-0.03em] leading-none tnum" style={{ color: '#F43F5E' }}>{formatMoney(pageSpent, cur)}</h3>
                    </div>
                </div>
                <div className={`flex p-0.5 rounded-xl border ${isDark ? 'bg-white/[0.03] border-white/[0.06]' : 'bg-slate-100 border-black/5'}`}>
                    {(['daily', 'weekly', 'monthly'] as ChartFilter[]).map(f => (
                        <button key={f} onClick={() => setFilter(f)}
                            className={`px-4 sm:px-5 py-2 rounded-[10px] text-[10px] font-bold uppercase tracking-[0.15em] transition-all ${filter === f ? 'bg-blue-600 text-white shadow-lg shadow-blue-600/25' : isDark ? 'text-[#666] hover:text-[#999]' : 'text-slate-400 hover:text-slate-700'}`}>
                            {f === 'daily' ? 'Day' : f === 'weekly' ? 'Week' : 'Month'}
                        </button>
                    ))}
                </div>
            </div>

            {/* Row 2: period label (always shown) + pager (only when multiple pages) */}
            <div className="flex items-center gap-2 mb-4">
                {totalPages > 1 && (
                    <button onClick={() => changePage(safePageIndex - 1)} disabled={safePageIndex === 0} className={`p-1 rounded-md transition-colors ${isDark ? 'text-white/30 hover:text-white disabled:opacity-15' : 'text-slate-300 hover:text-slate-800 disabled:opacity-15'} disabled:cursor-not-allowed`}><ChevronLeft size={16} /></button>
                )}
                <span className={`text-sm font-bold tracking-tight select-none ${isDark ? 'text-white/80' : 'text-slate-700'}`}>{pageTitle || '-'}</span>
                {totalPages > 1 && (
                    <>
                        <button onClick={() => changePage(safePageIndex + 1)} disabled={safePageIndex === totalPages - 1} className={`p-1 rounded-md transition-colors ${isDark ? 'text-white/30 hover:text-white disabled:opacity-15' : 'text-slate-300 hover:text-slate-800 disabled:opacity-15'} disabled:cursor-not-allowed`}><ChevronRight size={16} /></button>
                        <div className="flex items-center gap-1 ml-1">
                            {pages.map((_, i) => (
                                <button key={i} onClick={() => changePage(i)} className={`rounded-full transition-all duration-300 ${i === safePageIndex ? 'w-4 h-1.5 bg-blue-500' : `w-1.5 h-1.5 ${isDark ? 'bg-white/15 hover:bg-white/30' : 'bg-black/10 hover:bg-black/20'}`}`} />
                            ))}
                        </div>
                    </>
                )}
            </div>

            {/* Chart */}
            <div ref={chartRef} className="relative h-[240px] sm:h-[300px]" style={{ touchAction: totalPages > 1 ? 'pan-y' : 'auto' }}>
                <AnimatePresence initial={false} custom={direction}>
                    <motion.div key={`${filter}-${safePageIndex}`} custom={direction} variants={pageVariants} initial={direction === 0 ? false : 'enter'} animate="center" exit="exit" className="absolute inset-0 w-full h-full">
                        <ResponsiveContainer width="100%" height="100%">
                            <AreaChart data={currentPageData} margin={{ top: 10, right: 16, left: -8, bottom: 0 }}>
                                <defs>
                                    <filter id="treasuryGlow" x="-20%" y="-20%" width="140%" height="140%">
                                        <feGaussianBlur stdDeviation="4" result="blur" />
                                        <feComposite in="SourceGraphic" in2="blur" operator="over" />
                                    </filter>
                                    <linearGradient id="earnedFill" x1="0" y1="0" x2="0" y2="1">
                                        <stop offset="0%" stopColor="#10B981" stopOpacity={isDark ? 0.25 : 0.35} />
                                        <stop offset="100%" stopColor="#10B981" stopOpacity={0} />
                                    </linearGradient>
                                    <linearGradient id="spentFill" x1="0" y1="0" x2="0" y2="1">
                                        <stop offset="0%" stopColor="#F43F5E" stopOpacity={isDark ? 0.18 : 0.25} />
                                        <stop offset="100%" stopColor="#F43F5E" stopOpacity={0} />
                                    </linearGradient>
                                </defs>
                                <CartesianGrid strokeDasharray="0 0" vertical={false} stroke={isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.05)'} />
                                <XAxis
                                    dataKey="label"
                                    axisLine={false}
                                    tickLine={false}
                                    interval="preserveStartEnd"
                                    minTickGap={cw < 480 ? 22 : 30}
                                    padding={{ left: 16, right: 16 }}
                                    tickMargin={10}
                                    height={26}
                                    tick={{ fontSize: cw < 480 ? 10 : 11, fontWeight: 700, fill: isDark ? '#6b7280' : '#94a3b8' }}
                                />
                                <YAxis hide domain={[0, 'auto']} />
                                <Tooltip content={<ChartTooltip isDark={isDark} cur={cur} />} cursor={{ stroke: isDark ? 'rgba(59,130,246,0.15)' : 'rgba(59,130,246,0.12)', strokeWidth: 1, strokeDasharray: '4 4' }} />
                                <Area type="monotone" dataKey="spent" stroke="#F43F5E" fill="url(#spentFill)" fillOpacity={1} strokeWidth={2} dot={false} activeDot={{ r: 4, fill: '#F43F5E', strokeWidth: 2, stroke: isDark ? '#0C0C0C' : '#fff' }} animationDuration={500} />
                                <Area type="monotone" dataKey="earned" stroke="#10B981" fill="url(#earnedFill)" fillOpacity={1} strokeWidth={3} filter="url(#treasuryGlow)" dot={{ r: 2.5, fill: isDark ? '#0C0C0C' : '#fff', strokeWidth: 2, stroke: '#10B981' }} activeDot={{ r: 6, fill: '#10B981', strokeWidth: 2, stroke: isDark ? '#0C0C0C' : '#fff' }} animationDuration={400} />
                            </AreaChart>
                        </ResponsiveContainer>
                    </motion.div>
                </AnimatePresence>
            </div>
            <div className="flex items-center gap-5 mt-3 pl-1">
                <span className="flex items-center gap-2 text-xs text-sec font-semibold"><span className="w-2.5 h-2.5 rounded-full bg-emerald-500" /> Earned</span>
                <span className="flex items-center gap-2 text-xs text-sec font-semibold"><span className="w-2.5 h-2.5 rounded-full bg-rose-500" /> Spent</span>
            </div>
        </div>
    );
};

const DTreasury = () => {
    const [windowWidth, setWindowWidth] = useState(typeof window !== 'undefined' ? window.innerWidth : 1024);
    const [isDark, setIsDark] = useState(false);
    const [loading, setLoading] = useState(true);
    const [settingsLoaded, setSettingsLoaded] = useState(false);
    const [data, setData] = useState<TreasuryData>({ config: { ...DEFAULT_CONFIG }, projects: [], expenses: [], income: [], accounts: [] });
    const [focusedProjectId, setFocusedProjectId] = useState<string | null>(null);
    const [archiveOpen, setArchiveOpen] = useState(false);
    const [tab, setTab] = useState<Tab>('overview');
    const [chartFilter, setChartFilter] = useState<ChartFilter>('daily');
    const [moneyView, setMoneyView] = useState<'all' | 'day'>('all');
    const [moneyType, setMoneyType] = useState<'all' | 'income' | 'expense'>('all');
    const [selectedDay, setSelectedDay] = useState(''); // '' = no day filter
    const [modal, setModal] = useState<{ mode: 'project' | 'expense' | 'income'; project?: TreasuryProject | null; expense?: TreasuryExpense | null; income?: TreasuryIncome | null } | null>(null);
    const [accountModal, setAccountModal] = useState<{ account: TreasuryAccount | null } | null>(null);
    const [ratesLoading, setRatesLoading] = useState(false);
    const ratesChecked = useRef(false);
    const { alert, showAlert, hideAlert } = useSafeAlert();

    // Settings are STAGED in a draft and committed via Save / Discard (like
    // D-Settings) - currency choices + FX rates don't persist until you save.
    const [draft, setDraft] = useState<TreasuryData['config']>({ ...DEFAULT_CONFIG });
    const [settingsDirty, setSettingsDirty] = useState(false);

    const isExtraSmall = windowWidth < 400;

    useEffect(() => {
        const onResize = () => setWindowWidth(window.innerWidth);
        const checkTheme = () => setIsDark(document.documentElement.classList.contains('dark'));
        checkTheme();
        window.addEventListener('resize', onResize);
        const obs = new MutationObserver(checkTheme);
        obs.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
        return () => { window.removeEventListener('resize', onResize); obs.disconnect(); };
    }, []);

    useEffect(() => {
        anime({ targets: '.treasury-section', opacity: [0, 1], translateY: [14, 0], duration: 450, easing: 'easeOutQuint' });
    }, [tab]);

    useEffect(() => {
        // Treasury docs are admin-only - attach the listeners ONLY once a user is
        // signed in, so we never fire an unauthenticated read (which Firestore
        // rejects with permission-denied). onAuthStateChanged also re-attaches if
        // the session restores after this mounts (e.g. dashboard kept on refresh).
        let unsubs: Array<() => void> = [];
        const detach = () => { unsubs.forEach(u => u()); unsubs = []; };
        // Caught error handler → never an "uncaught snapshot listener" console error.
        const onErr = (e: { code?: string }) => { if (e?.code !== 'permission-denied') console.warn('[Treasury] listener error', e); setLoading(false); };

        const attach = () => {
            unsubs.push(onSnapshot(PROJECTS_DOC, snap => {
                const entries = (snap.data()?.entries || {}) as Record<string, Omit<TreasuryProject, 'id'>>;
                const projects = Object.entries(entries)
                    .map(([id, p], i) => ({ id, ...p, order: p.order ?? i } as TreasuryProject))
                    .sort((a, b) => a.order - b.order);
                setData(prev => ({ ...prev, projects }));
                setLoading(false);
            }, onErr));
            unsubs.push(onSnapshot(SPENDINGS_DOC, snap => {
                const entries = (snap.data()?.entries || {}) as Record<string, Omit<TreasuryExpense, 'id'>>;
                const expenses = Object.entries(entries)
                    .map(([id, e]) => ({ id, ...e } as TreasuryExpense))
                    .sort((a, b) => (b.date || '').localeCompare(a.date || ''));
                setData(prev => ({ ...prev, expenses }));
            }, onErr));
            unsubs.push(onSnapshot(INCOME_DOC, snap => {
                const entries = (snap.data()?.entries || {}) as Record<string, Omit<TreasuryIncome, 'id'>>;
                const income = Object.entries(entries)
                    .map(([id, i]) => ({ id, ...i } as TreasuryIncome))
                    .sort((a, b) => (b.date || '').localeCompare(a.date || ''));
                setData(prev => ({ ...prev, income }));
            }, onErr));
            unsubs.push(onSnapshot(ACCOUNTS_DOC, snap => {
                const entries = (snap.data()?.entries || {}) as Record<string, Omit<TreasuryAccount, 'id'>>;
                const accounts = Object.entries(entries)
                    .map(([id, a], i) => ({ id, ...a, order: a.order ?? i } as TreasuryAccount))
                    .sort((a, b) => a.order - b.order);
                setData(prev => ({ ...prev, accounts }));
            }, onErr));
            unsubs.push(onSnapshot(SETTINGS_DOC, snap => {
                const c = (snap.exists() ? snap.data() : {}) as Partial<TreasuryData['config']>;
                const config: TreasuryData['config'] = {
                    defaultCurrency: c.defaultCurrency ?? DEFAULT_CONFIG.defaultCurrency,
                    displayCurrency: c.displayCurrency ?? DEFAULT_CONFIG.displayCurrency,
                    rates: { ...DEFAULT_CONFIG.rates, ...(c.rates || {}) },
                    ratesUpdatedAt: c.ratesUpdatedAt,
                };
                setData(prev => ({ ...prev, config }));
                setSettingsLoaded(true);
            }, e => { onErr(e); setSettingsLoaded(true); }));
        };

        const offAuth = onAuthStateChanged(appAuth(), user => {
            detach();
            if (user) attach(); else { setLoading(false); setSettingsLoaded(true); }
        });
        return () => { offAuth(); detach(); };
    }, []);

    const showToast = useCallback((text: string, tone: 'good' | 'warn' | 'info') => {
        const type: AlertType = tone === 'good' ? 'success' : tone === 'warn' ? 'warning' : 'info';
        showAlert({ type, message: text });
    }, [showAlert]);

    // Mirror only the public subset (name/status/notes/order) of the still-handled
    // projects to the PUBLIC Settings/HandledProjects doc the homepage Hero reads.
    // Prices/earnings stay in the admin-only Treasury collection.
    const mirrorPublic = useCallback((projects: TreasuryProject[]) => {
        const handled = projects.filter(p => !p.done).sort((a, b) => a.order - b.order);
        const map: Record<string, { name: string; status: string; description: string; order: number }> = {};
        handled.forEach((p, i) => { map[p.id] = { name: p.name, status: p.status, description: p.notes || '', order: i }; });
        setDoc(HANDLED_PUBLIC_DOC, { projects: map, lastWrite: serverTimestamp() }).catch(() => { });
    }, []);

    const writeProjects = useCallback((projects: TreasuryProject[]) => {
        setData(prev => ({ ...prev, projects }));
        const entries: Record<string, Omit<TreasuryProject, 'id'>> = {};
        projects.forEach(p => { const { id, ...rest } = p; entries[id] = rest; });
        setDoc(PROJECTS_DOC, { entries, lastWrite: serverTimestamp() })
            .catch(err => { console.warn('[Treasury] projects save failed', err); showToast('Save failed - check connection', 'warn'); });
        mirrorPublic(projects);
    }, [mirrorPublic, showToast]);

    const writeExpenses = useCallback((expenses: TreasuryExpense[]) => {
        setData(prev => ({ ...prev, expenses }));
        const entries: Record<string, Omit<TreasuryExpense, 'id'>> = {};
        expenses.forEach(e => { const { id, ...rest } = e; entries[id] = rest; });
        setDoc(SPENDINGS_DOC, { entries, lastWrite: serverTimestamp() })
            .catch(err => { console.warn('[Treasury] spendings save failed', err); showToast('Save failed - check connection', 'warn'); });
    }, [showToast]);

    const writeConfig = useCallback((config: TreasuryData['config']) => {
        setData(prev => ({ ...prev, config }));
        return setDoc(SETTINGS_DOC, { ...config, lastWrite: serverTimestamp() }, { merge: true });
    }, []);

    // Always-current snapshot of the committed config, so the async silent rate
    // refresh never writes against a stale closure (which used to clobber the
    // saved currency back to USD when it fired before the settings doc loaded).
    const configRef = useRef(data.config);
    useEffect(() => { configRef.current = data.config; }, [data.config]);

    const saveProject = (p: TreasuryProject) => {
        const exists = data.projects.some(x => x.id === p.id);
        writeProjects(exists ? data.projects.map(x => x.id === p.id ? p : x) : [...data.projects, p]);
    };
    const deleteProject = (id: string) => writeProjects(data.projects.filter(p => p.id !== id));
    const saveExpense = (e: TreasuryExpense) => {
        const exists = data.expenses.some(x => x.id === e.id);
        writeExpenses(exists ? data.expenses.map(x => x.id === e.id ? e : x) : [...data.expenses, e]);
    };
    // Best-effort: drop any uploaded receipt images for an entry when it's deleted.
    const purgeAttachments = (id: string) => {
        listAll(ref(storage, `treasury/${id}`))
            .then(res => Promise.all(res.items.map(it => deleteObject(it).catch(() => { }))))
            .catch(() => { /* nothing to clean / offline */ });
    };

    const deleteExpense = (id: string) => { purgeAttachments(id); writeExpenses(data.expenses.filter(e => e.id !== id)); };

    const writeIncome = useCallback((income: TreasuryIncome[]) => {
        setData(prev => ({ ...prev, income }));
        const entries: Record<string, Omit<TreasuryIncome, 'id'>> = {};
        income.forEach(i => { const { id, ...rest } = i; entries[id] = rest; });
        setDoc(INCOME_DOC, { entries, lastWrite: serverTimestamp() })
            .catch(err => { console.warn('[Treasury] income save failed', err); showToast('Save failed - check connection', 'warn'); });
    }, [showToast]);

    const saveIncome = (i: TreasuryIncome) => {
        const exists = data.income.some(x => x.id === i.id);
        writeIncome(exists ? data.income.map(x => x.id === i.id ? i : x) : [...data.income, i]);
        // A newly-logged monthly retainer payment advances that project's schedule
        // to the next due date (even if the money arrived early or late).
        if (!exists && i.monthlyPayment && i.projectId) {
            const proj = data.projects.find(p => p.id === i.projectId);
            if (proj?.monthly) {
                const next = nextMonthlyPaymentDate(proj, i.date);
                saveProject({ ...proj, nextPaymentDate: next });
                const pretty = new Date(`${next}T00:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
                showToast(`Logged ${proj.name}'s monthly payment - next due ${pretty}`, 'good');
            }
        }
    };
    const deleteIncome = (id: string) => { purgeAttachments(id); writeIncome(data.income.filter(i => i.id !== id)); };

    const writeAccounts = useCallback((accounts: TreasuryAccount[]) => {
        setData(prev => ({ ...prev, accounts }));
        const entries: Record<string, Omit<TreasuryAccount, 'id'>> = {};
        accounts.forEach(a => { const { id, ...rest } = a; entries[id] = rest; });
        setDoc(ACCOUNTS_DOC, { entries, lastWrite: serverTimestamp() })
            .catch(err => { console.warn('[Treasury] accounts save failed', err); showToast('Save failed - check connection', 'warn'); });
    }, [showToast]);

    const saveAccount = (a: TreasuryAccount) => {
        const exists = data.accounts.some(x => x.id === a.id);
        writeAccounts(exists ? data.accounts.map(x => x.id === a.id ? a : x) : [...data.accounts, a]);
    };
    const deleteAccount = (id: string) => writeAccounts(data.accounts.filter(a => a.id !== id));

    const markDone = (p: TreasuryProject) => {
        const today = new Date().toISOString().slice(0, 10);
        saveProject({ ...p, done: !p.done, status: (!p.done ? 'completed' : p.status) as TreasuryProject['status'], endDate: !p.done ? (p.endDate || today) : p.endDate });
        showToast(!p.done ? `"${p.name}" marked done` : `"${p.name}" reopened`, !p.done ? 'good' : 'info');
    };

    // -- staged settings (Save / Discard) -------------------------------------
    // Keep the draft in sync with the committed config UNLESS the user is editing.
    useEffect(() => {
        if (!settingsDirty) setDraft(data.config);
    }, [data.config, settingsDirty]);

    const stageConfig = (patch: Partial<TreasuryData['config']>) => { setDraft(d => ({ ...d, ...patch })); setSettingsDirty(true); };
    const saveSettings = async () => {
        try {
            await writeConfig(draft);
            setSettingsDirty(false);
            showToast('Settings saved', 'good');
        } catch (e) {
            console.warn('[Treasury] settings save failed', e);
            showToast("Couldn't save - make sure you're signed in as admin.", 'warn');
        }
    };
    const discardSettings = () => { setDraft(data.config); setSettingsDirty(false); };

    // -- live exchange rates --------------------------------------------------
    const refreshRates = useCallback(async (silent = false) => {
        if (!silent) setRatesLoading(true);
        const r = await fetchLiveRates();
        if (!silent) setRatesLoading(false);
        if (r) {
            if (silent) {
                // Read the latest committed config (NOT a captured closure) so we only
                // touch the rate fields and never overwrite the saved currency.
                writeConfig({ ...configRef.current, rates: r.rates, ratesUpdatedAt: r.updatedAt }).catch(() => { });
            } else {
                setDraft(d => ({ ...d, rates: r.rates, ratesUpdatedAt: r.updatedAt }));
                setSettingsDirty(true);
                showToast('Rates fetched - Save to apply', 'info');
            }
        } else if (!silent) {
            showToast("Couldn't reach FX source - kept current rates", 'warn');
        }
    }, [writeConfig, showToast]);

    // Auto-refresh once per session if rates are missing or older than 6h. MUST wait
    // for the settings doc to load first - otherwise it would compute "age" from the
    // default config and write defaults (USD) over the real saved currency.
    useEffect(() => {
        if (loading || !settingsLoaded || ratesChecked.current) return;
        ratesChecked.current = true;
        const age = Date.now() - (configRef.current.ratesUpdatedAt || 0);
        if (age > 6 * 3600 * 1000) refreshRates(true);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [loading, settingsLoaded]);

    const handleReorderActive = (newActive: TreasuryProject[]) => {
        const completed = data.projects.filter(p => p.done);
        const merged = [...newActive, ...completed].map((p, idx) => ({ ...p, order: idx }));
        setData(d => ({ ...d, projects: merged }));
    };
    const persistOrder = () => writeProjects(data.projects.map((p, i) => ({ ...p, order: i })));

    const exportHtml = () => {
        const html = buildHtmlReport(data, new Date());
        const blob = new Blob([html], { type: 'text/html' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url; a.download = `treasury-${new Date().toISOString().slice(0, 10)}.html`;
        document.body.appendChild(a); a.click(); a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
        showToast('Report downloaded', 'good');
    };

    // -- derived --------------------------------------------------------------
    const totals = useMemo(() => computeTotals(data), [data]);
    const insights = useMemo(() => buildInsights(data), [data]);
    const cur = data.config.displayCurrency;
    const dailySeries = useMemo(() => buildDailySeries(data), [data]);

    const activeProjects = useMemo(() => data.projects.filter(p => !p.done), [data.projects]);
    const completedProjects = useMemo(() => data.projects.filter(p => p.done), [data.projects]);

    const liveAccounts = useMemo(() => accountOptions(data.accounts), [data.accounts]);
    const archivedAccounts = useMemo(() => data.accounts.filter(a => a.archived), [data.accounts]);
    const liquidTotal = useMemo(() => accountsTotal(data), [data]);

    const focusedProject = useMemo(() => {
        if (focusedProjectId) {
            const found = data.projects.find(p => p.id === focusedProjectId);
            if (found) return found;
        }
        return activeProjects[0] || null;
    }, [data.projects, focusedProjectId, activeProjects]);

    // Unified money ledger (income + expenses), newest first, for the Money tab.
    const moneyRows = useMemo(() => [
        ...data.income.map(i => ({ t: 'income' as const, date: i.date, raw: i })),
        ...data.expenses.map(e => ({ t: 'expense' as const, date: e.date, raw: e })),
    ].sort((a, b) => (b.date || '').localeCompare(a.date || '')), [data.income, data.expenses]);

    // Apply the income/expense type filter (the "All / Income / Expense" toggle).
    const visibleRows = useMemo(() => moneyType === 'all' ? moneyRows : moneyRows.filter(r => r.t === moneyType), [moneyRows, moneyType]);

    // Same rows grouped by day (newest day first) for the "By day" view.
    const moneyByDay = useMemo(() => {
        const map = new Map<string, typeof moneyRows>();
        for (const r of visibleRows) { const k = r.date || '-'; (map.get(k) ?? map.set(k, []).get(k)!).push(r); }
        return Array.from(map.entries());
    }, [visibleRows]);

    // Aggregate the continuous daily series for the active filter (D-Views style).
    const chartData = useMemo<ChartPoint[]>(() => {
        if (!dailySeries.length) return [];
        if (chartFilter === 'daily') {
            return dailySeries.map(s => { const d = new Date(`${s.date}T00:00:00`); return { label: `${d.getDate()}/${d.getMonth() + 1}`, fullDate: s.date, earned: s.earned, spent: s.spent, type: 'daily' as const }; });
        }
        if (chartFilter === 'weekly') {
            const weeks: Record<string, { e: number; s: number }> = {};
            dailySeries.forEach(s => {
                const d = new Date(`${s.date}T00:00:00`);
                const day = d.getDay();
                const monday = new Date(d); monday.setDate(d.getDate() - day + (day === 0 ? -6 : 1));
                const key = `${monday.getFullYear()}-${String(monday.getMonth() + 1).padStart(2, '0')}-${String(monday.getDate()).padStart(2, '0')}`;
                (weeks[key] ||= { e: 0, s: 0 }); weeks[key].e += s.earned; weeks[key].s += s.spent;
            });
            return Object.entries(weeks).sort((a, b) => a[0].localeCompare(b[0])).map(([key, v]) => { const d = new Date(`${key}T00:00:00`); return { label: `${d.getDate()}/${d.getMonth() + 1}`, fullDate: key, earned: v.e, spent: v.s, type: 'weekly' as const }; });
        }
        const months: Record<string, { e: number; s: number }> = {};
        dailySeries.forEach(s => { const key = s.date.slice(0, 7); (months[key] ||= { e: 0, s: 0 }); months[key].e += s.earned; months[key].s += s.spent; });
        return Object.entries(months).sort((a, b) => a[0].localeCompare(b[0])).map(([key, v]) => { const d = new Date(`${key}-01T00:00:00`); return { label: d.toLocaleDateString('en-US', { month: 'short' }).toUpperCase(), fullDate: `${key}-01`, earned: v.e, spent: v.s, type: 'monthly' as const }; });
    }, [dailySeries, chartFilter]);

    const cards = [
        { label: 'Received', value: totals.earned, icon: TrendingUp, color: '#22c55e' },
        { label: 'Outstanding', value: totals.outstanding, icon: Clock, color: '#f59e0b' },
        { label: 'Spent', value: totals.spent, icon: TrendingDown, color: '#f43f5e' },
        { label: 'Net profit', value: totals.net, icon: Wallet, color: totals.net >= 0 ? '#22c55e' : '#f43f5e' },
    ];

    const statusColor = (s: string) => s === 'completed' ? '#22c55e' : s === 'pending' ? '#f59e0b' : '#3b82f6';
    const payColor: Record<string, string> = { paid: '#22c55e', partial: '#f59e0b', unpaid: '#f43f5e' };

    const TABS: { id: Tab; label: string; icon: typeof Wallet }[] = [
        { id: 'overview', label: 'Overview', icon: LayoutDashboard },
        { id: 'projects', label: 'Projects', icon: Briefcase },
        { id: 'money', label: 'Money', icon: Wallet },
        { id: 'accounts', label: 'Accounts', icon: Landmark },
        { id: 'settings', label: 'Settings', icon: SlidersHorizontal },
    ];

    if (loading || !settingsLoaded) {
        return <div className="w-full h-full flex items-center justify-center text-sec"><Sparkles className="animate-pulse mr-2" size={20} /> Loading treasury…</div>;
    }

    const sectionTitle = (icon: React.ReactNode, text: string, action?: React.ReactNode) => (
        <div className="flex items-center justify-between mb-3 gap-2 flex-wrap">
            <div className="flex items-center gap-2">{icon}<span className="text-sm font-bold text-primary">{text}</span></div>
            {action}
        </div>
    );

    // One money-ledger row (income or expense), tappable to edit.
    const renderMoneyRow = (r: typeof moneyRows[number]) => {
        if (r.t === 'income') {
            const i = r.raw;
            const proj = i.projectId ? data.projects.find(p => p.id === i.projectId) : null;
            const acct = i.accountId ? data.accounts.find(a => a.id === i.accountId) : null;
            return (
                <div key={`i-${i.id}`} onClick={() => setModal({ mode: 'income', income: i })} role="button" tabIndex={0} className="flex items-center gap-3 p-3.5 cursor-pointer hover:bg-black/[0.03] dark:hover:bg-white/[0.03] transition-colors group">
                    <div className="w-9 h-9 rounded-xl flex items-center justify-center bg-emerald-500/10 text-emerald-500 flex-shrink-0"><Banknote size={16} /></div>
                    <div className="min-w-0 flex-1">
                        <span className="text-sm font-semibold text-primary truncate block">{proj ? proj.name : (i.note || 'Payment')}</span>
                        <span className="text-xs text-sec truncate block">{i.date}{proj && i.note ? ` · ${i.note}` : ''}{acct ? ` · → ${acct.name}` : ''}</span>
                    </div>
                    {i.attachments?.length ? <span className="flex items-center gap-0.5 text-[11px] text-sec font-semibold flex-shrink-0" title={`${i.attachments.length} attachment${i.attachments.length === 1 ? '' : 's'}`}><Paperclip size={12} />{i.attachments.length}</span> : null}
                    <span className="text-sm font-bold text-emerald-500 tnum flex-shrink-0">+{formatMoney(i.amount, i.currency)}</span>
                    <Pencil size={14} className="text-sec opacity-40 group-hover:opacity-100 transition-opacity flex-shrink-0" />
                </div>
            );
        }
        const e = r.raw;
        const eproj = e.projectId ? data.projects.find(p => p.id === e.projectId) : null;
        const eacct = e.accountId ? data.accounts.find(a => a.id === e.accountId) : null;
        return (
            <div key={`e-${e.id}`} onClick={() => setModal({ mode: 'expense', expense: e })} role="button" tabIndex={0} className="flex items-center gap-3 p-3.5 cursor-pointer hover:bg-black/[0.03] dark:hover:bg-white/[0.03] transition-colors group">
                <div className="w-9 h-9 rounded-xl flex items-center justify-center bg-rose-500/10 text-rose-400 flex-shrink-0"><Receipt size={16} /></div>
                <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                        <span className="text-sm font-semibold text-primary truncate">{e.label}</span>
                        {e.recurring && <span className="text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-full bg-blue-500/15 text-blue-400">monthly</span>}
                    </div>
                    <span className="text-xs text-sec truncate block">{e.category ? `${e.category} · ` : ''}{eproj ? `${eproj.name} · ` : ''}{e.date}{eacct ? ` · ← ${eacct.name}` : ''}</span>
                </div>
                {e.attachments?.length ? <span className="flex items-center gap-0.5 text-[11px] text-sec font-semibold flex-shrink-0" title={`${e.attachments.length} attachment${e.attachments.length === 1 ? '' : 's'}`}><Paperclip size={12} />{e.attachments.length}</span> : null}
                <span className="text-sm font-bold text-rose-500 tnum flex-shrink-0">−{formatMoney(e.amount, e.currency)}</span>
                <Pencil size={14} className="text-sec opacity-40 group-hover:opacity-100 transition-opacity flex-shrink-0" />
            </div>
        );
    };

    // Net of a day's rows in the display currency, + a friendly header label.
    const dayNet = (rows: typeof moneyRows) => rows.reduce((s, r) => s + (r.t === 'income' ? 1 : -1) * convert(r.raw.amount || 0, r.raw.currency, cur, data.config.rates), 0);
    const fmtDayHeader = (day: string) => {
        if (day === '-') return 'Undated';
        const d = new Date(`${day}T00:00:00`);
        if (Number.isNaN(d.getTime())) return day;
        const today = new Date(); today.setHours(0, 0, 0, 0);
        const diff = Math.round((today.getTime() - d.getTime()) / 86400000);
        if (diff === 0) return 'Today';
        if (diff === 1) return 'Yesterday';
        return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: d.getFullYear() === today.getFullYear() ? undefined : 'numeric' });
    };
    // Move the day filter by ±1 day (starts from today when none is set).
    const stepDay = (delta: number) => {
        const base = selectedDay ? new Date(`${selectedDay}T00:00:00`) : new Date();
        base.setDate(base.getDate() + delta);
        setSelectedDay(`${base.getFullYear()}-${String(base.getMonth() + 1).padStart(2, '0')}-${String(base.getDate()).padStart(2, '0')}`);
    };
    const dayRows = selectedDay ? visibleRows.filter(r => r.date === selectedDay) : [];

    const kpiCards = (
        <div className={`grid gap-3 ${isExtraSmall ? 'grid-cols-2' : 'grid-cols-2 lg:grid-cols-4'}`}>
            {cards.map(c => {
                const Icon = c.icon;
                return (
                    <div key={c.label} className="glass-panel p-4 flex flex-col gap-2">
                        <div className="flex items-center justify-between">
                            <span className="text-[11px] font-semibold text-sec uppercase tracking-wider">{c.label}</span>
                            <Icon size={16} style={{ color: c.color }} />
                        </div>
                        <span className="text-2xl font-extrabold font-inter tnum" style={{ color: c.color }}>{formatMoney(c.value, cur)}</span>
                    </div>
                );
            })}
        </div>
    );

    return (
        <div className="h-[85vh] flex flex-col gap-5 relative">
            {/* Navbar */}
            <div className="glass-surface p-1.5 rounded-xl flex gap-2 overflow-x-auto shrink-0">
                {TABS.map(t => {
                    const Icon = t.icon;
                    const active = tab === t.id;
                    return (
                        <button key={t.id} onClick={() => setTab(t.id)}
                            className={`flex items-center gap-2 px-5 py-3 rounded-lg border-none cursor-pointer font-sans font-semibold text-sm whitespace-nowrap transition-all
                                ${active ? 'bg-blue-500/15 text-blue-500' : 'bg-transparent text-gray-500 hover:bg-blue-500/10 hover:text-blue-500 dark:text-gray-400 dark:hover:text-blue-400'}`}>
                            <Icon size={18} />
                            <span className={isExtraSmall ? 'hidden' : ''}>{t.label}</span>
                        </button>
                    );
                })}
            </div>

            <div className="flex-1 overflow-y-auto overflow-x-hidden custom-scrollbar pr-1 pb-6">
                <div key={tab} className="treasury-section flex flex-col gap-5">

                    {tab === 'overview' && (
                        <>
                            {kpiCards}
                            <div className="glass-panel p-4 sm:p-5">
                                <div className="flex items-center justify-between mb-3.5">
                                    <div className="flex items-center gap-2">
                                        <span className="w-7 h-7 rounded-lg flex items-center justify-center bg-amber-400/15 text-amber-500"><Lightbulb size={15} /></span>
                                        <span className="text-sm font-bold text-primary">Suggestions</span>
                                    </div>
                                    <span className="text-[11px] font-bold text-sec tnum px-2 py-0.5 rounded-full bg-black/[0.05] dark:bg-white/[0.07]">{insights.length}</span>
                                </div>
                                <div className="flex flex-col gap-1 tnum">
                                    {insights.map((ins, i) => {
                                        const Icon = INSIGHT_ICONS[ins.icon] || Lightbulb;
                                        const c = TONE_COLOR[ins.tone];
                                        return (
                                            <div key={i} className="group flex items-center gap-3 p-2.5 rounded-2xl transition-colors duration-200 hover:bg-black/[0.025] dark:hover:bg-white/[0.04]">
                                                <span className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: `${c}24`, color: c }}><Icon size={17} /></span>
                                                <div className="min-w-0">
                                                    <div className="text-[10.5px] font-bold uppercase tracking-[0.08em] leading-tight" style={{ color: c }}>{ins.label}</div>
                                                    <p className={`text-sm leading-snug ${ins.tone === 'warn' ? 'text-primary font-medium' : 'text-sec'}`}>{ins.text}</p>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                            {chartData.length === 0 ? (
                                <div className="glass-panel p-8 text-center text-sec text-sm">No dated activity yet - add a project payment or an expense and the graph fills in from that day.</div>
                            ) : (
                                <TreasuryChart data={chartData} filter={chartFilter} setFilter={setChartFilter} isDark={isDark} cur={cur} />
                            )}
                        </>
                    )}

                    {tab === 'projects' && (
                        <div className="flex flex-col gap-6">
                            {/* Dual-Pane active workspace */}
                            <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
                                {/* Left Column: Active Projects slider (col-span-2) */}
                                <div className="lg:col-span-2 glass-panel p-5 flex flex-col gap-4">
                                    {sectionTitle(
                                        <Briefcase size={16} className="text-blue-400" />,
                                        'Active projects',
                                        <button onClick={() => setModal({ mode: 'project', project: null })} className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-sm font-bold text-white bg-blue-500 hover:bg-blue-600 shadow-lg shadow-blue-500/20 transition-all active:scale-95"><Plus size={16} /> Project</button>
                                    )}
                                    <p className="text-xs text-sec -mt-2">Drag cards to reorder - active & pending projects. Click a card to focus details.</p>
                                    
                                    {activeProjects.length === 0 ? (
                                        <div className="border-2 border-dashed border-input-border rounded-2xl p-8 text-center text-sec text-sm">No active projects. Click "+ Project" to add one.</div>
                                    ) : (
                                        <Reorder.Group as="div" layoutScroll axis="x" values={activeProjects} onReorder={handleReorderActive} className="flex gap-3 overflow-x-auto pb-3 custom-scrollbar">
                                            {activeProjects.map(p => {
                                                const pay = projectPaymentStatus(p, data.income, data.config.rates);
                                                const bal = projectBalance(p, data.income, data.config.rates);
                                                const received = projectReceived(p, data.income, data.config.rates);
                                                const isFocused = focusedProject?.id === p.id;
                                                return (
                                                    <Reorder.Item as="div" key={p.id} value={p} onDragEnd={persistOrder}
                                                        onClick={() => setFocusedProjectId(p.id)}
                                                        className={`group flex-shrink-0 w-[240px] p-4 flex flex-col gap-3 cursor-grab active:cursor-grabbing relative border rounded-2xl backdrop-blur-md shadow-sm hover:shadow-md transition-[border-color,box-shadow,background-color] duration-200 select-none
                                                            ${isFocused 
                                                                ? 'bg-white border-blue-500/50 dark:border-blue-400/50 ring-1 ring-blue-500/30 dark:bg-[#1c1c24]' 
                                                                : 'bg-slate-50 dark:bg-[#13131a] border-slate-200/80 dark:border-white/5'}`}
                                                    >
                                                        <div className="absolute top-0 left-4 right-4 h-0.5 rounded-full" style={{ background: statusColor(p.status) }} />
                                                        
                                                        <div className="min-w-0 pr-14">
                                                            <h4 className="text-[15px] font-bold text-primary truncate" title={p.name}>{p.name}</h4>
                                                            {p.client && <p className="text-xs text-sec truncate">{p.client}</p>}
                                                        </div>

                                                        <div className="absolute top-4 right-4 flex items-center gap-1 opacity-100 md:opacity-0 md:group-hover:opacity-100 transition-opacity duration-200">
                                                            <div className="p-1.5 rounded-lg text-sec/45 hover:text-primary cursor-grab active:cursor-grabbing hover:bg-black/5 dark:hover:bg-white/10 transition-colors">
                                                                <GripVertical size={14} />
                                                            </div>
                                                            <button onClick={(e) => { e.stopPropagation(); setModal({ mode: 'project', project: p }); }} className="p-1.5 rounded-lg text-sec hover:text-primary hover:bg-black/5 dark:hover:bg-white/10 transition-colors"><Pencil size={14} /></button>
                                                        </div>
                                                        <div className="flex items-center gap-1.5 flex-wrap">
                                                            <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full" style={{ background: `${statusColor(p.status)}22`, color: statusColor(p.status) }}>{p.status}</span>
                                                            {p.monthly
                                                                ? <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full" style={{ background: '#10b98122', color: '#10b981' }}>monthly</span>
                                                                : <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full" style={{ background: `${payColor[pay]}22`, color: payColor[pay] }}>{pay}</span>}
                                                        </div>
                                                        <div>
                                                            <span className="text-base font-extrabold text-primary tnum">{p.priceAmount ? formatMoney(p.priceAmount, p.priceCurrency) : '-'}{p.monthly ? <span className="text-xs font-bold text-sec">/mo</span> : ''}</span>
                                                            {received > 0 && <p className="text-[10.5px] text-emerald-500 font-semibold leading-tight mt-0.5">{formatMoney(received, p.priceCurrency)} received</p>}
                                                            {!p.monthly && bal > 0 && <p className="text-[10.5px] text-amber-500 font-semibold leading-tight mt-0.5">{formatMoney(bal, p.priceCurrency)} to collect</p>}
                                                            {p.monthly && (() => { const np = projectNextPaymentDate(p, data.income); return np ? <p className="text-[10.5px] text-sec font-semibold leading-tight mt-0.5">next {new Date(`${np}T00:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</p> : null; })()}
                                                        </div>
                                                        <div className="text-[10.5px] text-sec flex items-center gap-1 mt-auto pt-2"><Clock size={11} /><span>{p.startDate || '-'}{p.endDate ? ` → ${p.endDate}` : p.done ? '' : ' → ongoing'}</span></div>
                                                    </Reorder.Item>
                                                );
                                            })}
                                        </Reorder.Group>
                                    )}
                                </div>

                                {/* Right Column: Focus Detail Panel (col-span-1) */}
                                <div className="glass-panel p-5 flex flex-col gap-4 h-full min-h-[300px]">
                                    {focusedProject ? (
                                        <div className="flex flex-col gap-4 h-full justify-between">
                                            {/* Header details */}
                                            <div className="flex flex-col gap-3">
                                                <div className="flex items-start justify-between gap-3">
                                                    <div className="min-w-0">
                                                        <span className="text-[10px] font-bold uppercase tracking-[0.15em] text-blue-500 font-inter">Project Focus</span>
                                                        <h3 className="text-lg font-black text-primary truncate mt-0.5" title={focusedProject.name}>{focusedProject.name}</h3>
                                                        {focusedProject.client && <p className="text-xs text-sec truncate">{focusedProject.client}</p>}
                                                    </div>
                                                    <span className="text-[10px] font-bold uppercase tracking-wider px-2.5 py-0.5 rounded-full" style={{ background: `${statusColor(focusedProject.status)}22`, color: statusColor(focusedProject.status) }}>{focusedProject.status}</span>
                                                </div>

                                                {/* Progress Tracker */}
                                                {!focusedProject.monthly && focusedProject.priceAmount > 0 && (() => {
                                                    const received = projectReceived(focusedProject, data.income, data.config.rates);
                                                    const pct = Math.min(100, Math.round((received / focusedProject.priceAmount) * 100));
                                                    return (
                                                        <div className="flex flex-col gap-2 p-3.5 rounded-2xl bg-black/[0.02] dark:bg-white/[0.02] border border-black/5 dark:border-white/5">
                                                            <div className="flex items-center justify-between text-xs font-bold text-sec">
                                                                <span>Payment progress</span>
                                                                <span className="tnum text-emerald-500">{pct}% paid</span>
                                                            </div>
                                                            <div className="w-full h-2 rounded-full bg-black/10 dark:bg-white/10 overflow-hidden relative">
                                                                <motion.div initial={{ width: 0 }} animate={{ width: `${pct}%` }} transition={{ duration: 0.4, ease: "easeOut" }} className="h-full bg-emerald-500 rounded-full" />
                                                            </div>
                                                            <div className="flex flex-wrap items-center justify-between text-[11px] text-sec gap-2 mt-0.5">
                                                                <span className="font-semibold text-emerald-500 tnum">{formatMoney(received, focusedProject.priceCurrency)} received</span>
                                                                <span className="font-semibold text-amber-500 tnum">{formatMoney(projectBalance(focusedProject, data.income, data.config.rates), focusedProject.priceCurrency)} left</span>
                                                            </div>
                                                        </div>
                                                    );
                                                })()}

                                                {/* Monthly retainer: rate + next due date */}
                                                {focusedProject.monthly && (
                                                    <div className="flex items-center justify-between gap-3 p-3.5 rounded-2xl bg-emerald-500/[0.04] border border-emerald-500/15">
                                                        <div className="flex items-center gap-2 min-w-0">
                                                            <Repeat size={15} className="text-emerald-500 shrink-0" />
                                                            <div className="min-w-0">
                                                                <div className="text-[10px] font-bold uppercase tracking-wider text-emerald-500">Monthly retainer</div>
                                                                <div className="text-xs text-sec truncate">{focusedProject.priceAmount ? `${formatMoney(focusedProject.priceAmount, focusedProject.priceCurrency)}/mo` : 'No rate set'}</div>
                                                            </div>
                                                        </div>
                                                        <div className="text-right shrink-0">
                                                            <div className="text-[10px] font-bold uppercase tracking-wider text-sec">Next payment</div>
                                                            <div className="text-xs font-bold text-primary tnum">
                                                                {(() => { const np = projectNextPaymentDate(focusedProject, data.income); return np ? new Date(`${np}T00:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : 'Log a payment'; })()}
                                                            </div>
                                                        </div>
                                                    </div>
                                                )}

                                                {/* Sub-Ledger: Linked Transactions */}
                                                <div className="flex flex-col gap-2">
                                                    <span className="text-[10px] font-bold uppercase tracking-wider text-sec font-inter">Linked ledger</span>
                                                    <div className="max-h-[140px] overflow-y-auto pr-1 flex flex-col gap-1.5 custom-scrollbar min-h-[60px]">
                                                        {(() => {
                                                            const linkedInc = data.income.filter(i => i.projectId === focusedProject.id);
                                                            const linkedExp = data.expenses.filter(e => e.projectId === focusedProject.id);
                                                            if (linkedInc.length === 0 && linkedExp.length === 0) {
                                                                return <div className="text-[11px] text-sec italic text-center py-4 bg-black/[0.01] dark:bg-white/[0.01] rounded-xl border border-dashed border-black/5 dark:border-white/5">No payments or expenses linked.</div>;
                                                            }
                                                            return (
                                                                <>
                                                                    {linkedInc.map(i => (
                                                                        <div key={`li-${i.id}`} onClick={() => setModal({ mode: 'income', income: i })} role="button" tabIndex={0} title="Edit this payment"
                                                                            className="group flex items-center justify-between gap-2 p-2 rounded-xl bg-emerald-500/[0.03] dark:bg-emerald-500/[0.05] border border-emerald-500/10 text-xs cursor-pointer hover:border-emerald-500/40 hover:bg-emerald-500/[0.08] transition-colors">
                                                                            <span className="text-sec truncate max-w-[120px] flex items-center gap-1.5">{i.note || 'Payment'}<Pencil size={11} className="text-sec opacity-0 group-hover:opacity-70 transition-opacity shrink-0" /></span>
                                                                            <span className="font-bold text-emerald-500 tnum">+{formatMoney(i.amount, i.currency)}</span>
                                                                        </div>
                                                                    ))}
                                                                    {linkedExp.map(e => (
                                                                        <div key={`le-${e.id}`} onClick={() => setModal({ mode: 'expense', expense: e })} role="button" tabIndex={0} title="Edit this expense"
                                                                            className="group flex items-center justify-between gap-2 p-2 rounded-xl bg-rose-500/[0.03] dark:bg-rose-500/[0.05] border border-rose-500/10 text-xs cursor-pointer hover:border-rose-500/40 hover:bg-rose-500/[0.08] transition-colors">
                                                                            <span className="text-sec truncate max-w-[120px] flex items-center gap-1.5">{e.label}<Pencil size={11} className="text-sec opacity-0 group-hover:opacity-70 transition-opacity shrink-0" /></span>
                                                                            <span className="font-bold text-rose-500 tnum">-{formatMoney(e.amount, e.currency)}</span>
                                                                        </div>
                                                                    ))}
                                                                </>
                                                            );
                                                        })()}
                                                    </div>
                                                </div>
                                            </div>

                                            {/* Quick Actions Panel */}
                                            <div className="flex flex-col gap-2 mt-auto pt-4 border-t border-[var(--section-border)]">
                                                <div className="grid grid-cols-2 gap-2">
                                                    <button onClick={() => setModal({ mode: 'income', income: { projectId: focusedProject.id, date: new Date().toISOString().slice(0, 10), amount: 0, currency: focusedProject.priceCurrency, createdAt: Date.now(), id: '' } })} className="flex items-center justify-center gap-1.5 py-2.5 rounded-xl text-xs font-bold text-emerald-600 dark:text-emerald-500 bg-emerald-500/10 hover:bg-emerald-500/15 transition-all"><Plus size={14} /> Log income</button>
                                                    <button onClick={() => setModal({ mode: 'expense', expense: { projectId: focusedProject.id, date: new Date().toISOString().slice(0, 10), amount: 0, currency: focusedProject.priceCurrency, createdAt: Date.now(), id: '', label: '' } })} className="flex items-center justify-center gap-1.5 py-2.5 rounded-xl text-xs font-bold text-rose-500 bg-rose-500/10 hover:bg-rose-500/15 transition-all"><Plus size={14} /> Log expense</button>
                                                </div>
                                                <button onClick={() => markDone(focusedProject)} className={`flex items-center justify-center gap-1.5 py-2.5 rounded-xl text-xs font-bold transition-all ${focusedProject.done ? 'bg-green-500/15 text-green-500' : 'bg-blue-500/10 text-blue-500 hover:bg-blue-500/15'}`}><CheckCircle2 size={14} /> {focusedProject.done ? 'Reopen Project' : 'Mark Project Done'}</button>
                                            </div>
                                        </div>
                                    ) : (
                                        <div className="h-full flex items-center justify-center text-center text-sec text-xs italic">Select an active project card to view detail actions.</div>
                                    )}
                                </div>
                            </div>

                            {/* Completed Projects Archive Section */}
                            <div className="glass-panel p-5 flex flex-col gap-3">
                                <button onClick={() => setArchiveOpen(!archiveOpen)} className="flex items-center justify-between w-full border-none bg-transparent p-0 cursor-pointer text-sec hover:text-primary transition-colors">
                                    <div className="flex items-center gap-2">
                                        <CheckCircle2 size={16} className="text-emerald-500" />
                                        <span className="text-sm font-bold text-primary">Completed projects archive</span>
                                        <span className="text-[11px] font-bold tnum px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-500">{completedProjects.length}</span>
                                    </div>
                                    <motion.div animate={{ rotate: archiveOpen ? -90 : 0 }} transition={{ duration: 0.2 }}><ChevronLeft size={16} /></motion.div>
                                </button>
                                
                                <AnimatePresence initial={false}>
                                    {archiveOpen && (
                                        <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.25, ease: "easeInOut" }} className="overflow-hidden">
                                            {completedProjects.length === 0 ? (
                                                <div className="text-xs text-sec italic py-6 text-center">No completed projects archived yet.</div>
                                            ) : (
                                                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4 pt-3">
                                                    {completedProjects.map(p => {
                                                        const received = projectReceived(p, data.income, data.config.rates);
                                                        return (
                                                            <div key={p.id} onClick={() => setFocusedProjectId(p.id)} 
                                                                className={`p-4 rounded-2xl border flex flex-col gap-2 relative shadow-sm hover:shadow-md transition-[border-color,box-shadow,background-color] duration-200 cursor-pointer backdrop-blur-sm
                                                                    ${focusedProject?.id === p.id 
                                                                        ? 'bg-white border-blue-500/30 ring-1 ring-blue-500/30 dark:bg-[#1c1c24]' 
                                                                        : 'bg-slate-50 dark:bg-[#13131a] border-slate-200/80 dark:border-white/5'}`}
                                                            >
                                                                <div className="absolute top-0 left-4 right-4 h-0.5 rounded-full bg-emerald-500" />
                                                                <div className="min-w-0 pr-10">
                                                                    <h4 className="text-sm font-bold text-primary truncate" title={p.name}>{p.name}</h4>
                                                                    {p.client && <p className="text-[11px] text-sec truncate">{p.client}</p>}
                                                                </div>
                                                                <div className="absolute top-4 right-4 flex gap-1">
                                                                    <button onClick={(e) => { e.stopPropagation(); setModal({ mode: 'project', project: p }); }} className="p-1 rounded-lg text-sec hover:text-primary hover:bg-black/5 dark:hover:bg-white/10 transition-colors"><Pencil size={12} /></button>
                                                                </div>
                                                                <div className="flex items-center justify-between text-xs border-t border-black/[0.03] dark:border-white/[0.03] pt-2 mt-1 gap-2 flex-wrap">
                                                                    <span className="font-bold text-primary tnum">{p.priceAmount ? formatMoney(p.priceAmount, p.priceCurrency) : '-'}</span>
                                                                    {received > 0 && <span className="text-[10px] text-emerald-500 font-semibold tnum">paid</span>}
                                                                </div>
                                                                <div className="text-[10px] text-sec flex items-center gap-1 mt-1"><Clock size={11} /><span>Completed {p.endDate || '-'}</span></div>
                                                                <button onClick={(e) => { e.stopPropagation(); markDone(p); }} className="mt-2 py-1.5 rounded-lg text-[10px] font-bold bg-blue-500/10 text-blue-500 hover:bg-blue-500/15 transition-all w-fit px-3">Reopen</button>
                                                            </div>
                                                        );
                                                    })}
                                                </div>
                                            )}
                                        </motion.div>
                                    )}
                                </AnimatePresence>
                            </div>
                        </div>
                    )}

                    {tab === 'money' && (
                        <div className="glass-panel overflow-hidden">
                            {/* Sticky header */}
                            <div className="sticky top-0 z-10 px-5 pt-5 pb-3 border-b border-[var(--section-border)]" style={{ background: isDark ? 'rgba(15,15,20,0.92)' : 'rgba(255,255,255,0.92)', backdropFilter: 'blur(14px)', WebkitBackdropFilter: 'blur(14px)' }}>
                                {sectionTitle(
                                    <Wallet size={16} className="text-blue-400" />,
                                    'Money',
                                    <div className="flex items-center gap-2 flex-wrap">
                                        <div className="w-[152px]">
                                            <ScrollMenu
                                                value={moneyType === 'income' ? 'Income only' : moneyType === 'expense' ? 'Expenses only' : 'Income & expenses'}
                                                options={['Income & expenses', 'Income only', 'Expenses only']}
                                                onChange={(v) => setMoneyType(v === 'Income only' ? 'income' : v === 'Expenses only' ? 'expense' : 'all')}
                                                isDark={isDark}
                                                searchable={false}
                                            />
                                        </div>
                                        <div className="w-[136px]">
                                            <ScrollMenu
                                                value={moneyView === 'day' ? 'Grouped by day' : 'Flat list'}
                                                options={['Flat list', 'Grouped by day']}
                                                onChange={(v) => setMoneyView(v === 'Grouped by day' ? 'day' : 'all')}
                                                isDark={isDark}
                                                searchable={false}
                                            />
                                        </div>
                                        <button onClick={() => setModal({ mode: 'income', income: null })} className="flex items-center gap-1.5 px-3.5 py-2.5 rounded-xl text-sm font-bold text-white bg-blue-500 hover:bg-blue-600 shadow-lg shadow-blue-500/20 transition-all active:scale-95"><Plus size={16} /> Add money</button>
                                    </div>
                                )}
                                {/* Day navigator: ‹  date  › */}
                                <div className="flex items-center gap-2">
                                    <button onClick={() => stepDay(-1)} title="Previous day" className="p-2 rounded-xl text-sec hover:text-primary border border-[var(--input-border)] hover:bg-black/5 dark:hover:bg-white/10 transition-all flex-shrink-0"><ChevronLeft size={16} /></button>
                                    <div className="w-44"><DatePicker value={selectedDay} onChange={setSelectedDay} isDark={isDark} placeholder="Jump to a day" allowClear /></div>
                                    <button onClick={() => stepDay(1)} title="Next day" className="p-2 rounded-xl text-sec hover:text-primary border border-[var(--input-border)] hover:bg-black/5 dark:hover:bg-white/10 transition-all flex-shrink-0"><ChevronRight size={16} /></button>
                                    {selectedDay && <button onClick={() => setSelectedDay('')} className="text-xs font-semibold text-blue-500 hover:text-blue-600 px-1">Clear</button>}
                                </div>
                            </div>

                            {/* Body */}
                            <div className="p-5">
                                {moneyRows.length === 0 ? (
                                    <div className="glass-surface p-6 text-center text-sec text-sm">Nothing yet. Click "+ Add money" to log income or an expense.</div>
                                ) : !selectedDay && visibleRows.length === 0 ? (
                                    <div className="glass-surface p-6 text-center text-sec text-sm">No {moneyType} entries yet.</div>
                                ) : selectedDay ? (
                                    <div className="glass-surface overflow-hidden">
                                        <div className={`flex items-center justify-between px-3.5 py-2 ${isDark ? 'bg-white/[0.04]' : 'bg-black/[0.03]'}`}>
                                            <span className="text-[11px] font-bold text-sec uppercase tracking-wider">{fmtDayHeader(selectedDay)}</span>
                                            {dayRows.length > 0 && (() => { const net = dayNet(dayRows); return <span className="text-xs font-bold tnum" style={{ color: net >= 0 ? '#10b981' : '#f43f5e' }}>{net >= 0 ? '+' : '−'}{formatMoney(Math.abs(net), cur)}</span>; })()}
                                        </div>
                                        {dayRows.length > 0
                                            ? <div className="divide-y divide-[var(--input-border)]">{dayRows.map(renderMoneyRow)}</div>
                                            : <div className="p-6 text-center text-sec text-sm">No entries on this day.</div>}
                                    </div>
                                ) : moneyView === 'all' ? (
                                    <div className="glass-surface divide-y divide-[var(--input-border)] overflow-hidden">
                                        {visibleRows.map(renderMoneyRow)}
                                    </div>
                                ) : (
                                    <div className="flex flex-col gap-3">
                                        {moneyByDay.map(([day, rows]) => {
                                            const net = dayNet(rows);
                                            return (
                                                <div key={day} className="glass-surface overflow-hidden">
                                                    <div className={`flex items-center justify-between px-3.5 py-2 ${isDark ? 'bg-white/[0.04]' : 'bg-black/[0.03]'}`}>
                                                        <span className="text-[11px] font-bold text-sec uppercase tracking-wider">{fmtDayHeader(day)}</span>
                                                        <span className="text-xs font-bold tnum" style={{ color: net >= 0 ? '#10b981' : '#f43f5e' }}>{net >= 0 ? '+' : '−'}{formatMoney(Math.abs(net), cur)}</span>
                                                    </div>
                                                    <div className="divide-y divide-[var(--input-border)]">
                                                        {rows.map(renderMoneyRow)}
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                )}
                            </div>
                        </div>
                    )}

                    {tab === 'accounts' && (
                        <div className="flex flex-col gap-5">
                            {/* Liquid total + add */}
                            <div className="glass-panel p-5 flex items-center justify-between gap-4 flex-wrap">
                                <div className="flex items-center gap-3 min-w-0">
                                    <span className="w-11 h-11 rounded-2xl flex items-center justify-center bg-blue-500/12 text-blue-500 shrink-0"><Wallet2 size={22} /></span>
                                    <div className="min-w-0">
                                        <div className="text-[11px] font-bold uppercase tracking-wider text-sec">Total balance · {cur}</div>
                                        <div className="text-2xl sm:text-3xl font-black tnum text-primary leading-tight" style={{ color: liquidTotal >= 0 ? undefined : '#f43f5e' }}>{formatMoney(liquidTotal, cur)}</div>
                                        <div className="text-[11px] text-sec">{liveAccounts.length} active account{liveAccounts.length === 1 ? '' : 's'}</div>
                                    </div>
                                </div>
                                <button onClick={() => setAccountModal({ account: null })} className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-sm font-bold text-white bg-blue-500 hover:bg-blue-600 shadow-lg shadow-blue-500/20 transition-all active:scale-95"><Plus size={16} /> Account</button>
                            </div>

                            {data.accounts.length === 0 ? (
                                <div className="glass-panel p-10 text-center flex flex-col items-center gap-3">
                                    <span className="w-14 h-14 rounded-2xl flex items-center justify-center bg-blue-500/10 text-blue-500"><Landmark size={26} /></span>
                                    <p className="text-sm text-sec max-w-sm">No accounts yet. Add a bank, cash or wallet, then pick it when logging income or an expense to track each balance.</p>
                                    <button onClick={() => setAccountModal({ account: null })} className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-sm font-bold text-white bg-blue-500 hover:bg-blue-600 shadow-lg shadow-blue-500/20 transition-all active:scale-95"><Plus size={16} /> Add your first account</button>
                                </div>
                            ) : (
                                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                                    {liveAccounts.map(a => {
                                        const bal = accountBalance(a, data.income, data.expenses, data.config.rates);
                                        const moves = accountActivityCount(a.id, data.income, data.expenses);
                                        const Icon = ACCOUNT_ICON[a.type];
                                        const tColor = ACCOUNT_COLOR[a.type];
                                        return (
                                            <div key={a.id} onClick={() => setAccountModal({ account: a })} role="button" tabIndex={0}
                                                className="group glass-panel p-4 flex flex-col gap-3 cursor-pointer hover:shadow-md transition-shadow relative">
                                                <div className="flex items-center justify-between gap-2">
                                                    <div className="flex items-center gap-2.5 min-w-0">
                                                        <span className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0" style={{ background: `${tColor}1f`, color: tColor }}><Icon size={18} /></span>
                                                        <div className="min-w-0">
                                                            <div className="text-sm font-bold text-primary truncate" title={a.name}>{a.name}</div>
                                                            <div className="text-[10px] font-bold uppercase tracking-wider text-sec">{a.type} · {a.currency}</div>
                                                        </div>
                                                    </div>
                                                    <Pencil size={14} className="text-sec opacity-40 group-hover:opacity-100 transition-opacity shrink-0" />
                                                </div>
                                                <div>
                                                    <div className="text-[10px] font-bold uppercase tracking-wider text-sec">Balance</div>
                                                    <div className="text-xl font-extrabold tnum" style={{ color: bal >= 0 ? '#10b981' : '#f43f5e' }}>{formatMoney(bal, a.currency)}</div>
                                                </div>
                                                <div className="text-[11px] text-sec flex items-center justify-between gap-2 pt-1 border-t border-[var(--section-border)]">
                                                    <span>{moves} movement{moves === 1 ? '' : 's'}</span>
                                                    <span className="tnum">opening {formatMoney(a.openingBalance || 0, a.currency)}</span>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            )}

                            {archivedAccounts.length > 0 && (
                                <div className="glass-panel p-5 flex flex-col gap-3">
                                    <span className="text-sm font-bold text-primary flex items-center gap-2"><Landmark size={15} className="text-sec" /> Archived accounts</span>
                                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                                        {archivedAccounts.map(a => {
                                            const bal = accountBalance(a, data.income, data.expenses, data.config.rates);
                                            const Icon = ACCOUNT_ICON[a.type];
                                            return (
                                                <div key={a.id} onClick={() => setAccountModal({ account: a })} role="button" tabIndex={0}
                                                    className="glass-surface p-3.5 flex items-center justify-between gap-2 cursor-pointer opacity-70 hover:opacity-100 transition-opacity">
                                                    <div className="flex items-center gap-2.5 min-w-0">
                                                        <span className="w-9 h-9 rounded-xl flex items-center justify-center bg-black/5 dark:bg-white/5 text-sec shrink-0"><Icon size={16} /></span>
                                                        <div className="min-w-0">
                                                            <div className="text-sm font-semibold text-primary truncate">{a.name}</div>
                                                            <div className="text-[10px] font-bold uppercase tracking-wider text-sec">{a.currency}</div>
                                                        </div>
                                                    </div>
                                                    <span className="text-sm font-bold tnum text-sec">{formatMoney(bal, a.currency)}</span>
                                                </div>
                                            );
                                        })}
                                    </div>
                                </div>
                            )}
                        </div>
                    )}

                    {tab === 'settings' && (
                        <>
                            <div className="glass-panel p-5 flex flex-col gap-5">
                                <h3 className="heading-sm m-0">Currency</h3>
                                <div className="flex flex-col gap-2">
                                    <label className="text-xs font-semibold text-sec uppercase tracking-wider">Show totals in</label>
                                    <div className={`flex rounded-xl border ${isDark ? 'border-white/10 bg-white/5' : 'border-black/10 bg-black/[0.03]'} p-1 gap-1 w-fit`}>
                                        {CURRENCIES.map(c => (
                                            <button key={c} onClick={() => stageConfig({ displayCurrency: c })} className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-all ${draft.displayCurrency === c ? 'bg-blue-500 text-white shadow' : 'text-sec hover:text-primary'}`}>{CURRENCY_SYMBOL[c]} {c}</button>
                                        ))}
                                    </div>
                                </div>
                                <div className="flex flex-col gap-2">
                                    <label className="text-xs font-semibold text-sec uppercase tracking-wider">Default for new entries</label>
                                    <p className="text-xs text-sec -mt-1">Used when you don't name a currency - e.g. "add 100" vs "add 100$". New projects & expenses are added in this currency.</p>
                                    <div className={`flex rounded-xl border ${isDark ? 'border-white/10 bg-white/5' : 'border-black/10 bg-black/[0.03]'} p-1 gap-1 w-fit`}>
                                        {CURRENCIES.map(c => (
                                            <button key={c} onClick={() => stageConfig({ defaultCurrency: c })} className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-all ${draft.defaultCurrency === c ? 'bg-emerald-500 text-white shadow' : 'text-sec hover:text-primary'}`}>{c}</button>
                                        ))}
                                    </div>
                                </div>
                            </div>

                            <div className="glass-panel p-5 flex flex-col gap-4">
                                <div className="flex items-start justify-between gap-3 flex-wrap">
                                    <div>
                                        <h3 className="heading-sm m-0">Exchange rates</h3>
                                        <p className="text-xs text-sec mt-1">
                                            Live mid-market rates (units per $1), pulled from the internet.
                                            {draft.ratesUpdatedAt ? ` Updated ${new Date(draft.ratesUpdatedAt).toLocaleString()}.` : ' Not fetched yet.'}
                                        </p>
                                    </div>
                                    <button onClick={() => refreshRates(false)} disabled={ratesLoading} className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold text-blue-500 border border-blue-500/20 bg-blue-500/5 hover:bg-blue-500/10 transition-all disabled:opacity-50">
                                        <RefreshCcw size={15} className={ratesLoading ? 'animate-spin' : ''} /> {ratesLoading ? 'Updating…' : 'Update now'}
                                    </button>
                                </div>
                                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                                    {CURRENCIES.map(c => (
                                        <div key={c} className="glass-surface p-4 flex flex-col gap-1">
                                            <span className="text-xs font-semibold text-sec uppercase tracking-wider">{CURRENCY_SYMBOL[c]} {c} per $1</span>
                                            <span className="text-2xl font-extrabold text-primary tnum">{c === 'USD' ? '1.00' : (draft.rates[c] || 0).toLocaleString(undefined, { maximumFractionDigits: 4 })}</span>
                                        </div>
                                    ))}
                                </div>
                            </div>

                            <div className="glass-panel p-5 flex items-center justify-between gap-4 flex-wrap">
                                <div>
                                    <h3 className="heading-sm m-0">Export</h3>
                                    <p className="text-xs text-sec mt-1">Download a styled, self-contained HTML report of all projects & spendings.</p>
                                </div>
                                <button onClick={exportHtml} className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-bold text-white bg-blue-500 hover:bg-blue-600 shadow-lg shadow-blue-500/20 transition-all active:scale-95"><Download size={16} /> Export report</button>
                            </div>
                        </>
                    )}
                </div>
            </div>

            {/* Staged-settings bar (shared component) */}
            <SaveBar show={tab === 'settings' && settingsDirty} onApply={saveSettings} onCancel={discardSettings} isDark={isDark} />

            {/* Alerts (shared app component) */}
            {alert?.show && <Alert type={alert.type} message={alert.message} onClose={hideAlert} duration={alert.duration} />}

            <AnimatePresence>
                {modal && (
                    <MTreasuryEntry
                        mode={modal.mode}
                        config={data.config}
                        project={modal.project}
                        expense={modal.expense}
                        income={modal.income}
                        projects={data.projects}
                        accounts={data.accounts}
                        expenseList={data.expenses}
                        incomeList={data.income}
                        rates={data.config.rates}
                        nextOrder={data.projects.length}
                        onSaveProject={saveProject}
                        onSaveExpense={saveExpense}
                        onSaveIncome={saveIncome}
                        onDelete={modal.project ? () => deleteProject(modal.project!.id) : modal.expense ? () => deleteExpense(modal.expense!.id) : modal.income ? () => deleteIncome(modal.income!.id) : undefined}
                        onClose={() => setModal(null)}
                    />
                )}
            </AnimatePresence>

            <AnimatePresence>
                {accountModal && (
                    <MAccount
                        config={data.config}
                        account={accountModal.account}
                        nextOrder={data.accounts.length}
                        onSave={saveAccount}
                        onDelete={accountModal.account ? () => deleteAccount(accountModal.account!.id) : undefined}
                        onClose={() => setAccountModal(null)}
                    />
                )}
            </AnimatePresence>
        </div>
    );
};

export default DTreasury;
