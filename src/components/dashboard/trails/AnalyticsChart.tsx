/** Trails' traffic chart: daily, weekly or monthly visits with project views and social clicks. */
import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { Briefcase, MousePointer2, ChevronLeft, ChevronRight } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip, CartesianGrid, TooltipProps } from 'recharts';

export interface ChartDataPoint {
    label: string;
    dateNum: string | number;
    value: number;
    projectViews: number;
    socialClicks: number;
    fullDate: string;
    prevValue?: number;
    type?: 'daily' | 'weekly' | 'monthly';
}

export const CustomTooltip = ({ active, payload, isDark }: TooltipProps<number, string> & { isDark?: boolean }) => {
    if (active && payload && payload.length) {
        const item = payload[0].payload as ChartDataPoint;
        const d = new Date(item.fullDate);

        let headerText = '';
        let subLabel = 'Views';

        if (item.type === 'weekly') {
            const end = new Date(d);
            end.setDate(end.getDate() + 6);
            headerText = `${d.getDate()}/${d.getMonth() + 1} - ${end.getDate()}/${end.getMonth() + 1}`;
            subLabel = 'Weekly Total';
        } else if (item.type === 'monthly') {
            headerText = d.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
            subLabel = 'Monthly Total';
        } else {
            const dayName = d.toLocaleDateString('en-US', { weekday: 'short' });
            headerText = `${dayName}, ${d.getDate()}/${d.getMonth() + 1}`;
        }

        return (
            <div className={`p-4 rounded-[2.5rem] border shadow-2xl backdrop-blur-3xl transition-all duration-300 ${isDark
                ? 'bg-black/80 border-white/10'
                : 'bg-white/60 border-black/5 shadow-[0_20px_40px_rgba(0,0,0,0.1)]'
                }`}>
                <div className={`text-[10px] font-bold uppercase tracking-widest mb-2 ${isDark ? 'text-white/40' : 'text-slate-500'
                    }`}>
                    {headerText}
                </div>
                <div className="flex flex-col gap-2.5">
                    <div className="flex items-center gap-2">
                        <div className="w-1.5 h-1.5 rounded-full bg-blue-500 shadow-[0_0_10px_#3B82F6]" />
                        <span className={`text-sm font-bold ${isDark ? 'text-white' : 'text-slate-900'}`}>
                            {(item.value || 0).toLocaleString()}
                            <span className={`font-normal text-[10px] uppercase tracking-tight ml-1.5 ${isDark ? 'text-white/40' : 'text-slate-400'
                                }`}>{subLabel}</span>
                        </span>
                    </div>
                    <div className="flex items-center gap-2">
                        <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 shadow-[0_0_10px_#10B981]" />
                        <span className={`text-sm font-bold ${isDark ? 'text-white' : 'text-slate-900'}`}>
                            {(item.projectViews || 0).toLocaleString()}
                            <span className={`font-normal text-[10px] uppercase tracking-tight ml-1.5 ${isDark ? 'text-white/40' : 'text-slate-400'
                                }`}>Project Views</span>
                        </span>
                    </div>
                    <div className="flex items-center gap-2">
                        <div className="w-1.5 h-1.5 rounded-full bg-purple-500 shadow-[0_0_10px_#8B5CF6]" />
                        <span className={`text-sm font-bold ${isDark ? 'text-white' : 'text-slate-900'}`}>
                            {(item.socialClicks || 0).toLocaleString()}
                            <span className={`font-normal text-[10px] uppercase tracking-tight ml-1.5 ${isDark ? 'text-white/40' : 'text-slate-400'
                                }`}>Social Clicks</span>
                        </span>
                    </div>
                </div>
            </div>
        );
    }
    return null;
};

export interface CustomTickProps {
    x: number;
    y: number;
    payload: { value: string };
    index: number;
    data: ChartDataPoint[];
}

export const CustomTick = ({ x, y, payload, index, data, isDark }: CustomTickProps & { isDark?: boolean }) => {
    const item = data[index];
    if (!item) return null;
    return (
        <g transform={`translate(${x},${y})`}>
            <text x={0} y={15} textAnchor="middle" className={`${isDark ? 'fill-gray-500' : 'fill-slate-400'} !text-[11px] font-bold uppercase tracking-widest`}>{payload.value}</text>
        </g>
    );
};

export const AnalyticsChart = ({ data, filter, setFilter, isDark, windowWidth }: {
    data: ChartDataPoint[];
    filter: 'daily' | 'weekly' | 'monthly';
    setFilter: (f: 'daily' | 'weekly' | 'monthly') => void;
    isDark: boolean;
    windowWidth: number;
}) => {
    const [pageIndex, setPageIndex] = useState(0);
    const [direction, setDirection] = useState(0);
    const chartRef = useRef<HTMLDivElement>(null);
    const containerRef = useRef<HTMLDivElement>(null);
    const touchStartRef = useRef<{ x: number; y: number; time: number } | null>(null);
    const isSwipingRef = useRef(false);
    const wheelCooldownRef = useRef(false);
    const [containerWidth, setContainerWidth] = useState(windowWidth);

    // Measure actual container width with ResizeObserver
    useEffect(() => {
        const el = containerRef.current;
        if (!el) return;
        const ro = new ResizeObserver((entries) => {
            const w = entries[0]?.contentRect.width;
            if (w && w > 0) setContainerWidth(w);
        });
        ro.observe(el);
        return () => ro.disconnect();
    }, []);

    // Responsive points-per-page based on CONTAINER width (not window)
    const cw = containerWidth;
    const pointsPerPage = useMemo(() => {
        if (filter === 'daily') {
            if (cw < 350) return 5;
            if (cw < 480) return 7;
            if (cw < 640) return 10;
            if (cw < 900) return 14;
            return 31;
        }
        if (filter === 'weekly') {
            if (cw < 480) return 3;
            return 4;
        }
        return 999;
    }, [filter, cw]);

    // Group data into pages
    const pages = useMemo(() => {
        if (data.length === 0) return [[]];
        if (filter === 'daily') {
            if (pointsPerPage >= 31) {
                // Desktop: page by calendar month
                const monthGroups: ChartDataPoint[][] = [];
                let batch: ChartDataPoint[] = [];
                let lastMonth = -1;
                data.forEach((d) => {
                    const m = new Date(d.fullDate).getMonth();
                    if (lastMonth !== -1 && m !== lastMonth) { monthGroups.push(batch); batch = []; }
                    lastMonth = m;
                    batch.push(d);
                });
                if (batch.length > 0) monthGroups.push(batch);
                return monthGroups.length > 0 ? monthGroups : [[]];
            }
            // Mobile/tablet: fixed chunk size
            const chunks: ChartDataPoint[][] = [];
            for (let i = 0; i < data.length; i += pointsPerPage) {
                chunks.push(data.slice(i, i + pointsPerPage));
            }
            return chunks.length > 0 ? chunks : [[]];
        }
        if (filter === 'weekly') {
            if (data.length <= pointsPerPage) return [data];
            const wp: ChartDataPoint[][] = [];
            for (let i = 0; i < data.length; i += pointsPerPage) wp.push(data.slice(i, i + pointsPerPage));
            return wp;
        }
        return [data];
    }, [data, filter, pointsPerPage]);

    const totalPages = pages.length;
    // Clamp pageIndex inline so it's never out of bounds on the render that follows a filter change
    const safePageIndex = Math.min(pageIndex, totalPages - 1);
    const currentPageData = useMemo(() => pages[safePageIndex] || [], [pages, safePageIndex]);

    // Dynamic stats from the current page
    const pageTotal = useMemo(() => currentPageData.reduce((sum, d) => sum + (d.value || 0), 0), [currentPageData]);
    const pageProjects = useMemo(() => currentPageData.reduce((sum, d) => sum + (d.projectViews || 0), 0), [currentPageData]);
    const pageSocials = useMemo(() => currentPageData.reduce((sum, d) => sum + (d.socialClicks || 0), 0), [currentPageData]);

    const todayStr = new Date().toISOString().split('T')[0];
    const todayViews = useMemo(() => {
        const todayPoint = data.find(d => d.fullDate === todayStr);
        return todayPoint?.value || 0;
    }, [data, todayStr]);

    useEffect(() => {
        const target = Math.max(0, totalPages - 1);
        if (pageIndex !== target) {
            // eslint-disable-next-line react-hooks/set-state-in-effect
            setPageIndex(target);
             
            setDirection(0);
        }
    }, [totalPages, filter]); // eslint-disable-line react-hooks/exhaustive-deps

    const changePageRef = useRef<(newIndex: number) => void>(() => { });
    useEffect(() => {
        changePageRef.current = (newIndex: number) => {
            if (newIndex >= 0 && newIndex < totalPages && newIndex !== safePageIndex) {
                setDirection(newIndex > safePageIndex ? 1 : -1);
                setPageIndex(newIndex);
            }
        };
    }, [totalPages, safePageIndex]);
    const changePage = useCallback((newIndex: number) => changePageRef.current(newIndex), []);

    // Touch gestures - use native listeners for { passive: false } support
    const handleTouchStart = useCallback((e: TouchEvent) => {
        const t = e.touches[0];
        touchStartRef.current = { x: t.clientX, y: t.clientY, time: Date.now() };
        isSwipingRef.current = false;
    }, []);

    const handleTouchMove = useCallback((e: TouchEvent) => {
        if (!touchStartRef.current) return;
        const t = e.touches[0];
        const dx = t.clientX - touchStartRef.current.x;
        const dy = t.clientY - touchStartRef.current.y;
        if (Math.abs(dx) > Math.abs(dy) && Math.abs(dx) > 10) {
            isSwipingRef.current = true;
            e.preventDefault(); // safe: native listener with passive:false
        }
    }, []);

    const handleTouchEnd = useCallback((e: TouchEvent) => {
        if (!touchStartRef.current || !isSwipingRef.current) { touchStartRef.current = null; return; }
        const dx = e.changedTouches[0].clientX - touchStartRef.current.x;
        const vel = Math.abs(dx) / (Date.now() - touchStartRef.current.time);
        if (Math.abs(dx) > 30 || vel > 0.2) {
            changePageRef.current(dx < 0 ? safePageIndex + 1 : safePageIndex - 1);
        }
        touchStartRef.current = null;
        isSwipingRef.current = false;
    }, [safePageIndex]);

    // Trackpad horizontal scroll - native listener with { passive: false }
    const handleWheel = useCallback((e: WheelEvent) => {
        if (wheelCooldownRef.current) return;
        const delta = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : 0;
        if (Math.abs(delta) < 20) return;
        e.preventDefault(); // safe: native listener with passive:false
        wheelCooldownRef.current = true;
        changePageRef.current(delta > 0 ? safePageIndex + 1 : safePageIndex - 1);
        setTimeout(() => { wheelCooldownRef.current = false; }, 300);
    }, [safePageIndex]);

    // Attach native event listeners with { passive: false }
    useEffect(() => {
        const el = chartRef.current;
        if (!el || totalPages <= 1) return;
        el.addEventListener('touchstart', handleTouchStart, { passive: true });
        el.addEventListener('touchmove', handleTouchMove, { passive: false });
        el.addEventListener('touchend', handleTouchEnd, { passive: true });
        el.addEventListener('wheel', handleWheel, { passive: false });
        return () => {
            el.removeEventListener('touchstart', handleTouchStart);
            el.removeEventListener('touchmove', handleTouchMove);
            el.removeEventListener('touchend', handleTouchEnd);
            el.removeEventListener('wheel', handleWheel);
        };
    }, [totalPages, handleTouchStart, handleTouchMove, handleTouchEnd, handleWheel]);

    const getPageTitle = () => {
        if (!currentPageData.length) return '';
        const first = new Date(currentPageData[0].fullDate);
        const last = new Date(currentPageData[currentPageData.length - 1].fullDate);
        if (filter === 'daily') {
            // If all data is same month (desktop calendar view), show "Mar 2026"
            if (first.getMonth() === last.getMonth() && first.getFullYear() === last.getFullYear()) {
                return first.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
            }
            // Mobile chunked view spans months: show "28/2 – 7/3"
            return `${first.getDate()}/${first.getMonth() + 1} – ${last.getDate()}/${last.getMonth() + 1}`;
        }
        if (filter === 'weekly') {
            return `${first.toLocaleDateString('en-US', { month: 'short' })} – ${last.toLocaleDateString('en-US', { month: 'short', year: 'numeric' })}`;
        }
        return 'All Time';
    };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const pageVariants: any = {
        enter: (dir: number) => ({ x: dir > 0 ? '80%' : '-80%', opacity: 0 }),
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        center: { x: 0, opacity: 1, transition: { duration: 0.3, ease: [0.16, 1, 0.3, 1] as any } },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        exit: (dir: number) => ({ x: dir > 0 ? '-30%' : '30%', opacity: 0, transition: { duration: 0.2, ease: [0.4, 0, 1, 1] as any } })
    };

    return (
        <div ref={containerRef} className={`w-full ${isDark ? 'bg-[#0C0C0C] border-white/[0.06]' : 'bg-white border-black/[0.06] shadow-sm'} rounded-[28px] p-5 sm:p-8 md:p-10 relative overflow-hidden border transition-all duration-300`}>

            {/* Row 1: Stats + Filter */}
            <div className="flex flex-wrap items-end justify-between gap-4 mb-6">
                <div className="flex items-end gap-6 sm:gap-10">
                    <div>
                        <p className={`${isDark ? 'text-[#555]' : 'text-slate-400'} text-[9px] font-bold uppercase tracking-[0.25em] mb-1.5`}>
                            {filter === 'daily' ? 'Month Views' : filter === 'weekly' ? 'Period Views' : 'Total Views'}
                        </p>
                        <h3 className={`${isDark ? 'text-white' : 'text-slate-900'} text-4xl sm:text-5xl font-black tracking-[-0.03em] leading-none tabular-nums`}>
                            {pageTotal.toLocaleString()}
                        </h3>
                    </div>
                    <div>
                        <p className={`${isDark ? 'text-[#555]' : 'text-slate-400'} text-[9px] font-bold uppercase tracking-[0.25em] mb-1.5`}>Today</p>
                        <div className="flex items-center gap-2">
                            <h3 className={`${isDark ? 'text-white' : 'text-slate-900'} text-4xl sm:text-5xl font-black tracking-[-0.03em] leading-none tabular-nums`}>
                                {todayViews}
                            </h3>
                            <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                        </div>
                    </div>
                </div>
                <div className={`flex p-0.5 rounded-xl border ${isDark ? 'bg-white/[0.03] border-white/[0.06]' : 'bg-slate-100 border-black/5'}`}>
                    {(['daily', 'weekly', 'monthly'] as const).map(f => (
                        <button
                            key={f}
                            onClick={(e) => { e.stopPropagation(); setFilter(f); }}
                            className={`px-4 sm:px-5 py-2 rounded-[10px] text-[10px] font-bold uppercase tracking-[0.15em] transition-all cursor-pointer ${filter === f
                                ? 'bg-blue-600 text-white shadow-lg shadow-blue-600/25'
                                : `${isDark ? 'text-[#666] hover:text-[#999]' : 'text-slate-400 hover:text-slate-700'}`
                                }`}
                        >
                            {f === 'daily' ? 'Day' : f === 'weekly' ? 'Week' : 'Month'}
                        </button>
                    ))}
                </div>
            </div>

            {/* Row 2: Nav - arrows flanking the date, dots after */}
            {totalPages > 1 && (
                <div className="flex items-center gap-2 mb-4">
                    <button
                        onClick={() => changePage(safePageIndex - 1)}
                        disabled={safePageIndex === 0}
                        className={`p-1 rounded-md transition-colors cursor-pointer ${isDark ? 'text-white/30 hover:text-white disabled:opacity-15' : 'text-slate-300 hover:text-slate-800 disabled:opacity-15'} disabled:cursor-not-allowed`}
                    >
                        <ChevronLeft size={16} />
                    </button>
                    <span className={`text-sm font-semibold tracking-tight select-none ${isDark ? 'text-white/70' : 'text-slate-600'}`}>
                        {getPageTitle()}
                    </span>
                    <button
                        onClick={() => changePage(safePageIndex + 1)}
                        disabled={safePageIndex === totalPages - 1}
                        className={`p-1 rounded-md transition-colors cursor-pointer ${isDark ? 'text-white/30 hover:text-white disabled:opacity-15' : 'text-slate-300 hover:text-slate-800 disabled:opacity-15'} disabled:cursor-not-allowed`}
                    >
                        <ChevronRight size={16} />
                    </button>
                    <div className="flex items-center gap-1 ml-1">
                        {pages.map((_, i) => (
                            <button
                                key={i}
                                onClick={() => changePage(i)}
                                className={`rounded-full transition-all duration-300 cursor-pointer ${i === safePageIndex
                                    ? 'w-4 h-1.5 bg-blue-500'
                                    : `w-1.5 h-1.5 ${isDark ? 'bg-white/15 hover:bg-white/30' : 'bg-black/10 hover:bg-black/20'}`
                                    }`}
                            />
                        ))}
                    </div>
                </div>
            )}

            {/* Chart */}
            <div
                ref={chartRef}
                className="relative h-[260px] sm:h-[300px] md:h-[360px]"
                style={{ touchAction: totalPages > 1 ? 'pan-y' : 'auto' }}
            >
                <AnimatePresence initial={false} custom={direction}>
                    <motion.div
                        key={`${filter}-${safePageIndex}`}
                        custom={direction}
                        variants={pageVariants}
                        initial={direction === 0 ? false : 'enter'}
                        animate="center"
                        exit="exit"
                        className="absolute inset-0 w-full h-full"
                    >
                        <ResponsiveContainer width="100%" height="100%">
                            <AreaChart data={currentPageData} margin={{ top: 10, right: 10, left: -25, bottom: 0 }}>
                                <defs>
                                    <filter id="lineGlow" x="-20%" y="-20%" width="140%" height="140%">
                                        <feGaussianBlur stdDeviation="4" result="blur" />
                                        <feComposite in="SourceGraphic" in2="blur" operator="over" />
                                    </filter>
                                    <linearGradient id={`areaFill-${isDark ? 'd' : 'l'}`} x1="0" y1="0" x2="0" y2="1">
                                        <stop offset="0%" stopColor="#3B82F6" stopOpacity={isDark ? 0.15 : 0.3} />
                                        <stop offset="100%" stopColor="#3B82F6" stopOpacity={0} />
                                    </linearGradient>
                                    <linearGradient id="projectFill" x1="0" y1="0" x2="0" y2="1">
                                        <stop offset="0%" stopColor="#10B981" stopOpacity={isDark ? 0.1 : 0.2} />
                                        <stop offset="100%" stopColor="#10B981" stopOpacity={0} />
                                    </linearGradient>
                                    <linearGradient id="socialFill" x1="0" y1="0" x2="0" y2="1">
                                        <stop offset="0%" stopColor="#8B5CF6" stopOpacity={isDark ? 0.1 : 0.2} />
                                        <stop offset="100%" stopColor="#8B5CF6" stopOpacity={0} />
                                    </linearGradient>
                                </defs>
                                <CartesianGrid strokeDasharray="0 0" vertical={false} stroke={isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.04)'} />
                                <XAxis
                                    dataKey="label"
                                    axisLine={false}
                                    tickLine={false}
                                    dy={8}
                                    interval={0}
                                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                                    tick={(props: any) => <CustomTick {...props} data={currentPageData} isDark={isDark} />}
                                />
                                <YAxis hide domain={['auto', 'auto']} />
                                <Tooltip
                                    content={<CustomTooltip isDark={isDark} />}
                                    cursor={{ stroke: isDark ? 'rgba(59,130,246,0.15)' : 'rgba(59,130,246,0.1)', strokeWidth: 1, strokeDasharray: '4 4' }}
                                />
                                <Area
                                    type="monotone"
                                    dataKey="socialClicks"
                                    stroke="#8B5CF6"
                                    fillOpacity={1}
                                    fill="url(#socialFill)"
                                    strokeWidth={cw < 500 ? 1.5 : 2}
                                    dot={false}
                                    activeDot={{ r: 4, fill: '#8B5CF6', strokeWidth: 2, stroke: isDark ? '#0C0C0C' : '#fff' }}
                                    animationDuration={600}
                                />
                                <Area
                                    type="monotone"
                                    dataKey="projectViews"
                                    stroke="#10B981"
                                    fillOpacity={1}
                                    fill="url(#projectFill)"
                                    strokeWidth={cw < 500 ? 1.5 : 2}
                                    dot={false}
                                    activeDot={{ r: 4, fill: '#10B981', strokeWidth: 2, stroke: isDark ? '#0C0C0C' : '#fff' }}
                                    animationDuration={500}
                                />
                                <Area
                                    type="monotone"
                                    dataKey="value"
                                    stroke="#3B82F6"
                                    fillOpacity={1}
                                    fill={`url(#areaFill-${isDark ? 'd' : 'l'})`}
                                    strokeWidth={cw < 500 ? 2 : 3}
                                    filter="url(#lineGlow)"
                                    dot={{ r: cw < 500 ? 2.5 : 3.5, fill: isDark ? '#0C0C0C' : '#fff', strokeWidth: cw < 500 ? 1.5 : 2, stroke: '#3B82F6', opacity: 1, strokeOpacity: 1 }}
                                    activeDot={{ r: cw < 500 ? 4.5 : 6, fill: '#3B82F6', strokeWidth: 2, stroke: isDark ? '#0C0C0C' : '#fff' }}
                                    animationDuration={400}
                                    animationEasing="ease-out"
                                />
                            </AreaChart>
                        </ResponsiveContainer>
                    </motion.div>
                </AnimatePresence>
            </div>

            {/* Bottom Widgets Integrated */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-8">
                <div className={`${isDark ? 'bg-white/[0.02] border-white/[0.06]' : 'bg-slate-50 border-black/[0.04]'} border rounded-[24px] p-6 relative overflow-hidden group`}>
                    <div className="absolute inset-0 bg-radial-at-tl from-purple-500/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
                    <div className="flex justify-between items-start relative z-10 mb-4">
                        <div className={`${isDark ? 'bg-purple-500/10 text-purple-400' : 'bg-purple-100 text-purple-600'} w-10 h-10 flex items-center justify-center rounded-xl`}>
                            <MousePointer2 size={20} />
                        </div>
                    </div>
                    <div className="relative z-10">
                        <h4 className={`${isDark ? 'text-white' : 'text-slate-900'} text-3xl font-black tracking-tight tabular-nums`}>
                            {pageSocials.toLocaleString()}
                        </h4>
                        <p className={`${isDark ? 'text-white/30' : 'text-slate-400'} text-[9px] font-bold uppercase tracking-[0.2em] mt-1`}>Social Clicks</p>
                    </div>
                </div>

                <div className={`${isDark ? 'bg-white/[0.02] border-white/[0.06]' : 'bg-slate-50 border-black/[0.04]'} border rounded-[24px] p-6 relative overflow-hidden group`}>
                    <div className="absolute inset-0 bg-radial-at-tl from-emerald-500/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
                    <div className="flex justify-between items-start relative z-10 mb-4">
                        <div className={`${isDark ? 'bg-emerald-500/10 text-emerald-400' : 'bg-emerald-100 text-emerald-600'} w-10 h-10 flex items-center justify-center rounded-xl`}>
                            <Briefcase size={20} />
                        </div>
                    </div>
                    <div className="relative z-10">
                        <h4 className={`${isDark ? 'text-white' : 'text-slate-900'} text-3xl font-black tracking-tight tabular-nums`}>
                            {pageProjects.toLocaleString()}
                        </h4>
                        <p className={`${isDark ? 'text-white/30' : 'text-slate-400'} text-[9px] font-bold uppercase tracking-[0.2em] mt-1`}>Project Views</p>
                    </div>
                </div>
            </div>
        </div>
    );
};
