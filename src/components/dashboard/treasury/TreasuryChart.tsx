/** Treasury earned-vs-spent chart, by day, week or month, in the display currency. */
import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip, CartesianGrid, TooltipProps } from 'recharts';
import { Currency, formatMoney } from '../../../lib/treasury';
import RollingNumber from '../../RollingNumber';

export type ChartFilter = 'daily' | 'weekly' | 'monthly';

export interface ChartPoint { label: string; fullDate: string; earned: number; spent: number; type: ChartFilter; }

// ── D-Views-style frosted tooltip ──────────────────────────────────────────
export const ChartTooltip = ({ active, payload, isDark, cur }: TooltipProps<number, string> & { isDark?: boolean; cur: Currency }) => {
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
export const TreasuryChart = ({ data, filter, setFilter, isDark, cur }: {
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
                        <h3 className="text-3xl sm:text-4xl font-black tracking-[-0.03em] leading-none tnum" style={{ color: '#10B981' }}>
                            {/* keyed on the value so paging the chart re-rolls the figure */}
                            <RollingNumber key={pageEarned} text={formatMoney(pageEarned, cur)} />
                        </h3>
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
