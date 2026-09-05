import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { createPortal } from 'react-dom';
import {
    Copy, Check, MoreVertical, Edit2, Trash2, Activity, Plus, Briefcase,
    MousePointer2, Eye, Globe, ChevronLeft, ChevronRight, Trophy, Github, ExternalLink,
    Download, Footprints, Link2, Radio, Users, Mail, FileText, BellRing, BellOff,
    Search, Filter, ArrowRight,
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip, CartesianGrid, TooltipProps } from 'recharts';
import { doc, onSnapshot, updateDoc, collection, getDocs, setDoc, deleteDoc, query, orderBy, limit as fsLimit, where } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import FileImage from '../FileImage';
import Loader from '../reactbits/Loader';
import Alert from '../Alert';
import Toggle from '../Toggle';
import RollingNumber from '../RollingNumber';
import useSafeAlert from '../../hooks/useSafeAlert';
import MConfirmModal, { ConfirmType } from './M-ConfirmModal';
import MStory, { DeviceIcon, flagOf, isLive } from './M-Story';
import { formatMs, type SessionDoc, type LinkDoc, type TotalsDoc } from '../../lib/analytics/types';
import { STORY_KEY } from '../Algorithm';

/**
 * Trails - what people actually did on the portfolio.
 *
 * Three views over one dataset: every visit as its own story, the shape of
 * traffic over time, and the share links that produced some of it. All of it
 * reads `Analytics/*`, which only the trackSession Cloud Function writes.
 *
 * This replaced a tab that could only ever show one merged blob per link, and
 * nothing at all for a visitor who arrived without one.
 */

interface ChartDataPoint {
    label: string;
    dateNum: string | number;
    value: number;
    projectViews: number;
    socialClicks: number;
    fullDate: string;
    prevValue?: number;
    type?: 'daily' | 'weekly' | 'monthly';
}

/** A share link plus the id it lives under. */
interface LinkRow extends LinkDoc {
    id: string;
    url: string;
}

interface SocialRow {
    name: string;
    Clicks: number;
    AwayMs: number;
}

type StoryFilter = 'all' | 'live' | 'links' | 'contacted';
type TrailsView = 'stories' | 'overview' | 'links';


const CustomTooltip = ({ active, payload, isDark }: TooltipProps<number, string> & { isDark?: boolean }) => {
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

interface CustomTickProps {
    x: number;
    y: number;
    payload: { value: string };
    index: number;
    data: ChartDataPoint[];
}

const CustomTick = ({ x, y, payload, index, data, isDark }: CustomTickProps & { isDark?: boolean }) => {
    const item = data[index];
    if (!item) return null;
    return (
        <g transform={`translate(${x},${y})`}>
            <text x={0} y={15} textAnchor="middle" className={`${isDark ? 'fill-gray-500' : 'fill-slate-400'} !text-[11px] font-bold uppercase tracking-widest`}>{payload.value}</text>
        </g>
    );
};

const AnalyticsChart = ({ data, filter, setFilter, isDark, windowWidth }: {
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

// --- Project ranking ------------------------------------------------------
// Each project tracks four interaction types in Firestore (Views map). They are
// not equal signals: a page view is passive, while opening the demo, repo, or
// hitting download shows progressively stronger intent. We rank by a weighted
// engagement score so high-intent projects rise above merely-seen ones, and
// surface a conversion rate (actions per view) as a quality tie-breaker.
const RANK_WEIGHTS = { view: 1, live: 4, github: 3, download: 6 } as const;

interface RankInput {
    id: string;
    name: string;
    icon: string;
    views: number;
    liveViews: number;
    githubViews: number;
    downloadViews: number;
}

interface RankedProject extends RankInput {
    score: number;
    conversion: number; // actions / views, 0..1
}

const ProjectRankings = ({ projects, isDark }: { projects: RankInput[]; isDark: boolean }) => {
    const ranked = useMemo<RankedProject[]>(() => {
        return projects
            .map(p => {
                const score =
                    p.views * RANK_WEIGHTS.view +
                    p.liveViews * RANK_WEIGHTS.live +
                    p.githubViews * RANK_WEIGHTS.github +
                    p.downloadViews * RANK_WEIGHTS.download;
                const actions = p.liveViews + p.githubViews + p.downloadViews;
                const conversion = p.views > 0 ? actions / p.views : 0;
                return { ...p, score, conversion };
            })
            .filter(p => p.score > 0)
            .sort((a, b) => b.score - a.score || b.views - a.views);
    }, [projects]);

    const topScore = ranked[0]?.score || 1;

    // Medal accents for the podium (gold / silver / bronze), neutral after.
    const medalColor = (i: number): string | null =>
        i === 0 ? '#F59E0B' : i === 1 ? '#94A3B8' : i === 2 ? '#D97706' : null;

    const stat = (icon: React.ReactNode, value: number, color: string, label: string) => (
        <div className="flex items-center gap-1" title={`${label}: ${value.toLocaleString()}`}>
            <span style={{ color }}>{icon}</span>
            <span className={`text-[11px] font-bold tabular-nums ${isDark ? 'text-white/70' : 'text-slate-600'}`}>
                {value.toLocaleString()}
            </span>
        </div>
    );

    return (
        <div className={`w-full ${isDark ? 'bg-[#0C0C0C] border-white/[0.06]' : 'bg-white border-black/[0.06] shadow-sm'} rounded-[28px] p-5 sm:p-8 md:p-10 relative overflow-hidden border transition-all duration-300`}>
            {/* Header */}
            <div className="flex flex-wrap items-start justify-between gap-4 mb-6">
                <div className="flex items-center gap-3">
                    <div className={`${isDark ? 'bg-amber-500/10 text-amber-400' : 'bg-amber-100 text-amber-600'} w-10 h-10 flex items-center justify-center rounded-xl`}>
                        <Trophy size={20} />
                    </div>
                    <div>
                        <h3 className={`${isDark ? 'text-white' : 'text-slate-900'} text-xl sm:text-2xl font-black tracking-[-0.02em] leading-none`}>
                            Project Rankings
                        </h3>
                        <p className={`${isDark ? 'text-[#666]' : 'text-slate-400'} text-[10px] font-bold uppercase tracking-[0.15em] mt-1.5`}>
                            Weighted engagement score
                        </p>
                    </div>
                </div>
                {/* Weight legend */}
                <div className={`hidden sm:flex items-center gap-3 px-3.5 py-2 rounded-xl border text-[10px] font-bold ${isDark ? 'bg-white/[0.03] border-white/[0.06] text-white/40' : 'bg-slate-50 border-black/5 text-slate-400'}`}>
                    <span className="flex items-center gap-1"><Eye size={12} className="text-blue-500" />×{RANK_WEIGHTS.view}</span>
                    <span className="flex items-center gap-1"><ExternalLink size={12} className="text-emerald-500" />×{RANK_WEIGHTS.live}</span>
                    <span className="flex items-center gap-1"><Github size={12} className="text-purple-500" />×{RANK_WEIGHTS.github}</span>
                    <span className="flex items-center gap-1"><Download size={12} className="text-amber-500" />×{RANK_WEIGHTS.download}</span>
                </div>
            </div>

            {/* List */}
            {ranked.length === 0 ? (
                <div className={`text-center py-12 text-sm italic ${isDark ? 'text-white/30' : 'text-slate-400'}`}>
                    No engagement recorded yet.
                </div>
            ) : (
                <div className="flex flex-col gap-2">
                    {ranked.map((p, i) => {
                        const accent = medalColor(i);
                        const barPct = Math.max(4, Math.round((p.score / topScore) * 100));
                        return (
                            <div
                                key={p.id}
                                className={`relative flex items-center gap-4 sm:gap-6 px-4 sm:px-5 py-4 rounded-2xl border transition-colors ${isDark ? 'bg-white/[0.02] border-white/[0.06] hover:bg-white/[0.04]' : 'bg-slate-50 border-black/[0.04] hover:bg-slate-100'}`}
                            >
                                {/* Rank */}
                                <div
                                    className="shrink-0 w-8 h-8 sm:w-9 sm:h-9 rounded-xl flex items-center justify-center font-black text-sm tabular-nums"
                                    style={{
                                        backgroundColor: accent ? `${accent}1f` : (isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)'),
                                        color: accent || (isDark ? 'rgba(255,255,255,0.5)' : '#64748b')
                                    }}
                                >
                                    {i + 1}
                                </div>

                                {/* Icon */}
                                <div className="shrink-0 w-9 h-9 sm:w-10 sm:h-10 rounded-lg overflow-hidden flex items-center justify-center" style={{ backgroundColor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)' }}>
                                    {p.icon ? (
                                        <FileImage src={p.icon} alt={p.name} className="w-full h-full object-cover" />
                                    ) : (
                                        <div className="w-full h-full bg-blue-500 text-white flex items-center justify-center font-bold">{p.name.charAt(0).toUpperCase()}</div>
                                    )}
                                </div>

                                {/* Name + breakdown + bar */}
                                <div className="flex-1 min-w-0">
                                    <div className="flex items-center justify-between gap-3">
                                        <span className={`font-bold text-sm truncate ${isDark ? 'text-white' : 'text-slate-900'}`} title={p.name}>{p.name}</span>
                                        <span className={`shrink-0 text-sm font-black tabular-nums ${isDark ? 'text-white' : 'text-slate-900'}`}>
                                            {p.score.toLocaleString()}
                                            <span className={`font-bold text-[9px] uppercase tracking-wider ml-1 ${isDark ? 'text-white/30' : 'text-slate-400'}`}>pts</span>
                                        </span>
                                    </div>
                                    {/* Relative score bar */}
                                    <div className={`h-1.5 rounded-full mt-3 overflow-hidden ${isDark ? 'bg-white/[0.06]' : 'bg-black/[0.05]'}`}>
                                        <div
                                            className="h-full rounded-full transition-all duration-500"
                                            style={{ width: `${barPct}%`, backgroundColor: accent || '#3B82F6' }}
                                        />
                                    </div>
                                    {/* Breakdown */}
                                    <div className="flex items-center flex-wrap gap-x-4 gap-y-1.5 mt-3">
                                        {stat(<Eye size={12} />, p.views, '#3B82F6', 'Views')}
                                        {stat(<ExternalLink size={12} />, p.liveViews, '#10B981', 'Demo opens')}
                                        {stat(<Github size={12} />, p.githubViews, '#8B5CF6', 'Repo opens')}
                                        {stat(<Download size={12} />, p.downloadViews, '#F59E0B', 'Downloads')}
                                        <span
                                            className={`ml-auto text-[10px] font-bold px-2 py-0.5 rounded-md ${isDark ? 'bg-white/[0.05] text-white/50' : 'bg-black/[0.04] text-slate-500'}`}
                                            title="Conversion - actions per view"
                                        >
                                            {Math.round(p.conversion * 100)}% conv
                                        </span>
                                    </div>
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
};


// ── the tab ──────────────────────────────────────────────────────────────
const VIEWS: Array<{ id: TrailsView; label: string; icon: typeof Footprints; tint: string }> = [
    { id: 'stories', label: 'Stories', icon: Footprints, tint: '59, 130, 246' },
    { id: 'overview', label: 'Overview', icon: Activity, tint: '16, 185, 129' },
    { id: 'links', label: 'Links', icon: Link2, tint: '168, 85, 247' },
];

const STORY_FILTERS: Array<{ id: StoryFilter; label: string }> = [
    { id: 'all', label: 'Everyone' },
    { id: 'live', label: 'Reading now' },
    { id: 'links', label: 'From a link' },
    { id: 'contacted', label: 'Reached contact' },
];

const DTrails = () => {
    const [windowWidth, setWindowWidth] = useState(typeof window !== 'undefined' ? window.innerWidth : 1200);
    const [isDark, setIsDark] = useState(false);
    const [isLoading, setIsLoading] = useState(false);
    const { alert, showAlert, hideAlert } = useSafeAlert(4000);

    const [view, setView] = useState<TrailsView>('stories');
    const [sessions, setSessions] = useState<SessionDoc[]>([]);
    const [dailySeries, setDailySeries] = useState<Array<{ date: string; value: number; projectViews: number; socialClicks: number }>>([]);
    const [totals, setTotals] = useState<TotalsDoc | null>(null);
    const [links, setLinks] = useState<LinkRow[]>([]);
    const [socials, setSocials] = useState<SocialRow[]>([]);
    const [rankProjects, setRankProjects] = useState<RankInput[]>([]);

    const [storyFilter, setStoryFilter] = useState<StoryFilter>('all');
    const [search, setSearch] = useState('');
    const [linkFilter, setLinkFilter] = useState<string | null>(null);
    const [openStoryId, setOpenStoryId] = useState<string | null>(null);
    // A "someone opened your link" email parks the visit id before login. Read it
    // once at mount; the story opens as soon as the visits arrive.
    const [pendingStory, setPendingStory] = useState<string>(() => {
        if (typeof window === 'undefined') return '';
        try { return sessionStorage.getItem(STORY_KEY) || ''; } catch { return ''; }
    });

    const [chartFilter, setChartFilter] = useState<'daily' | 'weekly' | 'monthly'>('daily');

    const [name, setName] = useState('');
    const [forField, setForField] = useState('');
    const [copied, setCopied] = useState<string | null>(null);
    const [activeMenu, setActiveMenu] = useState<string | null>(null);
    const [menuPos, setMenuPos] = useState({ top: 0, right: 0 });
    const [editingLink, setEditingLink] = useState<LinkRow | null>(null);
    const [draft, setDraft] = useState<{ Name: string; For: string; Notify: boolean; AutoCv: boolean; Greeting: string; Pinned: string[] } | null>(null);

    const [confirmConfig, setConfirmConfig] = useState<{
        isOpen: boolean; title: string; message: string; onConfirm: () => void; type?: ConfirmType;
    }>({ isOpen: false, title: '', message: '', onConfirm: () => { } });

    const isExtraSmall = windowWidth < 400;

    useEffect(() => {
        const onResize = () => setWindowWidth(window.innerWidth);
        window.addEventListener('resize', onResize);
        return () => window.removeEventListener('resize', onResize);
    }, []);

    useEffect(() => {
        const checkTheme = () => setIsDark(document.documentElement.classList.contains('dark'));
        checkTheme();
        const observer = new MutationObserver(checkTheme);
        observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
        return () => observer.disconnect();
    }, []);

    // ── data ─────────────────────────────────────────────────────────────
    useEffect(() => {
        // Every listener below reads /Analytics, which the rules open to the admin
        // alone - so they are refused together or not at all. Say it once instead of
        // five times, and say it at all: four of these had no error callback, so a
        // refusal surfaced only as a wall of uncaught "Error in snapshot listener" in
        // the console while the page sat there looking merely empty.
        let told = false;
        const onDenied = () => {
            if (told) return;
            told = true;
            showAlert({ type: 'error', message: 'Could not load visits.' });
        };

        const stories = onSnapshot(
            query(collection(db, 'Analytics', 'Sessions', 'Items'), orderBy('StartedAt', 'desc'), fsLimit(300)),
            snap => setSessions(snap.docs.map(d => ({ ...(d.data() as SessionDoc), Id: d.id }))),
            onDenied,
        );

        const days = onSnapshot(collection(db, 'Analytics', 'Days', 'Items'), snap => {
            const rows = snap.docs
                .filter(d => /^\d{4}-\d{2}-\d{2}$/.test(d.id))
                .map(d => {
                    const v = d.data() as Record<string, number>;
                    return {
                        date: d.id,
                        value: Number(v.Sessions || 0),
                        projectViews: Number(v.Projects || 0),
                        socialClicks: Number(v.Socials || 0),
                    };
                })
                .sort((a, b) => a.date.localeCompare(b.date));
            setDailySeries(rows);
        }, onDenied);

        const totalsUnsub = onSnapshot(doc(db, 'Analytics', 'Totals'), snap => {
            setTotals(snap.exists() ? (snap.data() as TotalsDoc) : null);
        }, onDenied);

        const linksUnsub = onSnapshot(collection(db, 'Analytics', 'Links', 'Items'), snap => {
            const rows: LinkRow[] = snap.docs.map(d => {
                const data = d.data() as LinkDoc;
                return {
                    ...data,
                    id: d.id,
                    Tailor: data.Tailor || { AutoCv: false, Greeting: '', Pinned: [] },
                    url: `${window.location.origin}/revil/${data.Code || ''}`,
                };
            });
            rows.sort((a, b) => (b.LastOpenAt || 0) - (a.LastOpenAt || 0) || Number(b.id) - Number(a.id));
            setLinks(rows);
        }, onDenied);

        const socialsUnsub = onSnapshot(collection(db, 'Analytics', 'Socials', 'Items'), snap => {
            setSocials(snap.docs
                .map(d => ({ name: d.id, ...(d.data() as { Clicks: number; AwayMs: number }) }))
                .sort((a, b) => (b.Clicks || 0) - (a.Clicks || 0)));
        }, onDenied);

        const projectsUnsub = onSnapshot(collection(db, 'Projects'), snap => {
            setRankProjects(snap.docs.map(d => {
                const data = d.data();
                const v = (data.Views || {}) as { Project?: number; Live?: number; Github?: number; Download?: number };
                return {
                    id: d.id,
                    name: d.id,
                    icon: data['Project Icon'] || '',
                    views: Number(v.Project || 0) || 0,
                    liveViews: Number(v.Live || 0) || 0,
                    githubViews: Number(v.Github || 0) || 0,
                    downloadViews: Number(v.Download || 0) || 0,
                };
            }));
        });

        return () => { stories(); days(); totalsUnsub(); linksUnsub(); socialsUnsub(); projectsUnsub(); };
    }, [showAlert]);

    // Claim the parked id so a refresh does not reopen the same story forever.
    useEffect(() => {
        if (!pendingStory) return;
        try { sessionStorage.removeItem(STORY_KEY); } catch { /* nothing to clear */ }
    }, [pendingStory]);

    // Derived rather than stored, so whatever is open stays in step with its live
    // document and the deep link needs no state-copying effect of its own.
    const openStory = useMemo(() => {
        const wanted = openStoryId || pendingStory;
        return wanted ? sessions.find(s => s.Id === wanted) || null : null;
    }, [sessions, openStoryId, pendingStory]);

    // ── derived ──────────────────────────────────────────────────────────
    const visibleStories = useMemo(() => {
        const needle = search.trim().toLowerCase();
        return sessions.filter(s => {
            if (s.Owner) return false;                       // the owner's own browser
            if (linkFilter && s.Link?.Id !== linkFilter) return false;
            if (storyFilter === 'live' && !isLive(s)) return false;
            if (storyFilter === 'links' && !s.Link) return false;
            if (storyFilter === 'contacted' && !(s.Contact?.Opens || s.Contact?.Sent)) return false;
            if (!needle) return true;
            return [
                s.Geo?.Country, s.Geo?.Code, s.Device?.Browser, s.Device?.OS,
                s.Link?.Name, s.Link?.For, s.Entry?.Ref,
            ].some(field => (field || '').toLowerCase().includes(needle));
        });
    }, [sessions, search, storyFilter, linkFilter]);

    const liveCount = useMemo(() => sessions.filter(s => !s.Owner && isLive(s)).length, [sessions]);

    const chartData = useMemo(() => {
        if (!dailySeries.length) return [] as ChartDataPoint[];
        let aggregated: ChartDataPoint[] = [];

        if (chartFilter === 'daily') {
            const sliceCount = windowWidth < 450 ? -30 : windowWidth < 768 ? -60 : -180;
            aggregated = dailySeries.slice(sliceCount).map(s => {
                const d = new Date(s.date);
                return {
                    label: `${d.getDate()}/${d.getMonth() + 1}`,
                    dateNum: d.getDate(),
                    value: s.value,
                    projectViews: s.projectViews,
                    socialClicks: s.socialClicks,
                    fullDate: s.date,
                    type: 'daily' as const,
                };
            });
        } else if (chartFilter === 'weekly') {
            const weeks: Record<string, { total: number; p: number; s: number }> = {};
            dailySeries.forEach(s => {
                // The date keys are UTC, so bucket by the UTC Monday - using local
                // getDay() put anyone west of UTC in the wrong week.
                const d = new Date(s.date);
                const day = d.getUTCDay();
                const monday = new Date(d);
                monday.setUTCDate(d.getUTCDate() - day + (day === 0 ? -6 : 1));
                if (isNaN(monday.getTime())) return;
                const key = monday.toISOString().split('T')[0];
                if (!weeks[key]) weeks[key] = { total: 0, p: 0, s: 0 };
                weeks[key].total += s.value;
                weeks[key].p += s.projectViews;
                weeks[key].s += s.socialClicks;
            });
            aggregated = Object.entries(weeks).map(([date, vals]) => {
                const d = new Date(date);
                return {
                    label: `${d.getDate()}/${d.getMonth() + 1}`,
                    dateNum: d.getMonth() + 1,
                    value: vals.total, projectViews: vals.p, socialClicks: vals.s,
                    fullDate: date, type: 'weekly' as const,
                };
            }).sort((a, b) => a.fullDate.localeCompare(b.fullDate));
        } else {
            const months: Record<string, { total: number; p: number; s: number }> = {};
            dailySeries.forEach(s => {
                const key = s.date.slice(0, 7);
                if (!months[key]) months[key] = { total: 0, p: 0, s: 0 };
                months[key].total += s.value;
                months[key].p += s.projectViews;
                months[key].s += s.socialClicks;
            });
            aggregated = Object.entries(months).map(([key, vals]) => {
                const [year, month] = key.split('-');
                const date = new Date(Number(year), Number(month) - 1, 1);
                return {
                    label: date.toLocaleDateString('en-US', { month: 'short' }).toUpperCase(),
                    dateNum: Number(year),
                    value: vals.total, projectViews: vals.p, socialClicks: vals.s,
                    fullDate: key, type: 'monthly' as const,
                };
            }).sort((a, b) => a.fullDate.localeCompare(b.fullDate));
        }

        // Same date a year earlier, for the ghost comparison line.
        const byDate = new Map(dailySeries.map(s => [s.date, s.value]));
        return aggregated.map(item => {
            const d = new Date(item.fullDate);
            if (isNaN(d.getTime())) return { ...item, prevValue: 0 };
            d.setFullYear(d.getFullYear() - 1);
            return { ...item, prevValue: byDate.get(d.toISOString().split('T')[0]) || 0 };
        });
    }, [dailySeries, chartFilter, windowWidth]);

    // ── link actions ─────────────────────────────────────────────────────
    const createLink = async () => {
        if (!name.trim() || !forField.trim()) return;
        setIsLoading(true);
        const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
        let code = '';
        for (let i = 0; i < 8; i++) code += chars.charAt(Math.floor(Math.random() * chars.length));

        try {
            const existing = await getDocs(collection(db, 'Analytics', 'Links', 'Items'));
            const ids = existing.docs.map(d => parseInt(d.id)).filter(id => !isNaN(id));
            const nextId = (ids.length ? Math.max(...ids) + 1 : 1).toString();

            await setDoc(doc(db, 'Analytics', 'Links', 'Items', nextId), {
                Code: code,
                Name: name.trim(),
                For: forField.trim(),
                Created: Date.now(),
                Opens: 0,
                Sessions: 0,
                LastOpenAt: null,
                Notify: true,
                Tailor: { AutoCv: false, Greeting: '', Pinned: [] },
            } satisfies LinkDoc);
            setName('');
            setForField('');
            showAlert({ type: 'success', message: 'Link ready. It emails you the moment it is opened.' });
        } catch {
            showAlert({ type: 'error', message: 'Could not create that link.' });
        } finally {
            setIsLoading(false);
        }
    };

    const patchLink = useCallback(async (id: string, patch: Record<string, unknown>, message?: string) => {
        try {
            await updateDoc(doc(db, 'Analytics', 'Links', 'Items', id), patch);
            if (message) showAlert({ type: 'success', message });
        } catch {
            showAlert({ type: 'error', message: 'Could not save that change.' });
        }
    }, [showAlert]);

    const saveDraft = async () => {
        if (!editingLink || !draft) return;
        if (!draft.Name.trim() || !draft.For.trim()) return;
        await patchLink(editingLink.id, {
            Name: draft.Name.trim(),
            For: draft.For.trim(),
            Notify: draft.Notify,
            Tailor: { AutoCv: draft.AutoCv, Greeting: draft.Greeting.trim().slice(0, 160), Pinned: draft.Pinned },
        }, 'Link updated.');
        setEditingLink(null);
        setDraft(null);
    };

    const deleteLink = async (id: string) => {
        setActiveMenu(null);
        try {
            await deleteDoc(doc(db, 'Analytics', 'Links', 'Items', id));
            showAlert({ type: 'success', message: 'Link removed. Its visits are still on record.' });
        } catch {
            showAlert({ type: 'error', message: 'Could not remove that link.' });
        }
    };

    /** Throw away every story that came through one link, and zero its counters. */
    const forgetLinkVisits = async (id: string) => {
        setActiveMenu(null);
        setIsLoading(true);
        try {
            const found = await getDocs(query(
                collection(db, 'Analytics', 'Sessions', 'Items'),
                where('Link.Id', '==', id),
            ));
            await Promise.all(found.docs.map(d => deleteDoc(d.ref)));
            await updateDoc(doc(db, 'Analytics', 'Links', 'Items', id), { Opens: 0, Sessions: 0, LastOpenAt: null });
            showAlert({ type: 'success', message: `Forgot ${found.size} visit${found.size === 1 ? '' : 's'}.` });
        } catch {
            showAlert({ type: 'error', message: 'Could not clear those visits.' });
        } finally {
            setIsLoading(false);
        }
    };

    const deleteStory = async (id: string) => {
        try {
            await deleteDoc(doc(db, 'Analytics', 'Sessions', 'Items', id));
            setOpenStoryId(null);
            setPendingStory('');
            showAlert({ type: 'success', message: 'Visit deleted.' });
        } catch {
            showAlert({ type: 'error', message: 'Could not delete that visit.' });
        }
    };

    const copyToClipboard = async (link: string, id: string) => {
        try {
            await navigator.clipboard.writeText(link);
            setCopied(id);
            setTimeout(() => setCopied(null), 2000);
        } catch {
            showAlert({ type: 'error', message: 'Could not copy that.' });
        }
    };

    const openMenu = (e: React.MouseEvent<HTMLButtonElement>, id: string) => {
        e.stopPropagation();
        const rect = e.currentTarget.getBoundingClientRect();
        setMenuPos({ top: rect.bottom + 4, right: document.documentElement.clientWidth - rect.right });
        setActiveMenu(activeMenu === id ? null : id);
    };

    const startEdit = (link: LinkRow) => {
        setEditingLink(link);
        setDraft({
            Name: link.Name || '',
            For: link.For || '',
            Notify: link.Notify !== false,
            AutoCv: link.Tailor?.AutoCv === true,
            Greeting: link.Tailor?.Greeting || '',
            Pinned: link.Tailor?.Pinned || [],
        });
        setActiveMenu(null);
    };

    // ── render ───────────────────────────────────────────────────────────
    const counters = [
        { label: 'Visits', value: totals?.Sessions ?? 0, icon: <Footprints size={18} />, tint: '#3b82f6' },
        { label: 'People', value: totals?.Visitors ?? 0, icon: <Users size={18} />, tint: '#10b981' },
        { label: 'Link opens', value: totals?.LinkOpens ?? 0, icon: <Link2 size={18} />, tint: '#a855f7' },
        { label: 'Reached contact', value: totals?.Contacts ?? 0, icon: <Mail size={18} />, tint: '#ec4899' },
    ];

    return (
        <div className="flex flex-col gap-6 h-full overflow-y-auto lg:overflow-hidden p-1 sm:p-0">
            <Loader isOpen={isLoading} isFullScreen={true} />

            {/* view switcher */}
            <div className="flex items-center gap-3 flex-wrap">
                <div className="flex overflow-x-auto" style={{
                    gap: isExtraSmall ? '4px' : '6px',
                    backgroundColor: isDark ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.03)',
                    padding: isExtraSmall ? '4px' : '5px',
                    borderRadius: '14px',
                    width: isExtraSmall ? '100%' : 'fit-content',
                }}>
                    {VIEWS.map(item => {
                        const Icon = item.icon;
                        const active = view === item.id;
                        return (
                            <button
                                key={item.id}
                                onClick={() => setView(item.id)}
                                className="relative flex items-center whitespace-nowrap cursor-pointer font-semibold transition-colors"
                                style={{
                                    gap: isExtraSmall ? '6px' : '8px',
                                    padding: isExtraSmall ? '8px 12px' : '9px 16px',
                                    borderRadius: '10px',
                                    color: active ? `rgb(${item.tint})` : 'var(--text-secondary)',
                                    fontSize: isExtraSmall ? '13px' : '14px',
                                    flex: isExtraSmall ? 1 : 'none',
                                }}
                            >
                                {active && (
                                    <motion.span
                                        layoutId="trails-view-pill"
                                        className="absolute inset-0 rounded-[10px]"
                                        style={{ background: `rgba(${item.tint}, ${isDark ? 0.18 : 0.1})` }}
                                        transition={{ type: 'spring', stiffness: 380, damping: 30 }}
                                    />
                                )}
                                <Icon size={isExtraSmall ? 15 : 17} className="relative z-10" />
                                <span className="relative z-10">
                                    {item.id === 'links' ? `${item.label} (${links.length})` : item.label}
                                </span>
                            </button>
                        );
                    })}
                </div>

                {liveCount > 0 && (
                    <button
                        onClick={() => { setView('stories'); setStoryFilter('live'); }}
                        className="inline-flex items-center gap-2 px-3 h-9 rounded-full text-xs font-bold cursor-pointer transition-colors"
                        style={{ background: 'rgba(34,197,94,0.14)', color: '#22c55e' }}
                    >
                        <Radio size={13} className="animate-pulse" />
                        {liveCount} reading now
                    </button>
                )}
            </div>

            <div className="flex-1 min-h-0">
                <AnimatePresence mode="wait" initial={false}>
                    <motion.div
                        key={view}
                        initial={{ opacity: 0, y: 8 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -6 }}
                        transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
                        className="h-full min-h-0 flex flex-col"
                    >
                        {view === 'stories' && (
                            <div className="flex flex-col h-full min-h-0">
                                {/* The title, the filters and the search stay put. Only the
                                    rows underneath move, which is the thing you are reading. */}
                                <div className="shrink-0 flex flex-col gap-5 pb-5">
                                    <div className="flex flex-col gap-1">
                                        <h1 className="heading-lg m-0 text-2xl sm:text-3xl">Stories</h1>
                                        <p className="text-muted text-sm">Every visit, in the order it happened</p>
                                    </div>

                                    {/* filters */}
                                    <div className="flex items-center gap-3 flex-wrap">
                                        <div className="flex items-center gap-1.5 flex-wrap">
                                            {STORY_FILTERS.map(f => (
                                                <button
                                                    key={f.id}
                                                    onClick={() => setStoryFilter(f.id)}
                                                    className="px-3 h-9 rounded-xl text-xs font-bold cursor-pointer transition-colors"
                                                    style={{
                                                        background: storyFilter === f.id
                                                            ? (isDark ? 'rgba(59,130,246,0.18)' : 'rgba(59,130,246,0.1)')
                                                            : (isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.03)'),
                                                        color: storyFilter === f.id ? '#3b82f6' : 'var(--text-muted)',
                                                    }}
                                                >
                                                    {f.label}
                                                </button>
                                            ))}
                                        </div>

                                        <div className="relative flex-1 min-w-[180px]">
                                            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" style={{ color: 'var(--text-muted)' }} />
                                            <input
                                                type="text"
                                                value={search}
                                                onChange={e => setSearch(e.target.value)}
                                                placeholder="Country, browser, link…"
                                                aria-label="Search visits"
                                                className="w-full h-9 rounded-xl border pl-9 pr-3 text-xs outline-none transition-colors focus:border-blue-500"
                                                style={{
                                                    backgroundColor: isDark ? 'rgba(255,255,255,0.04)' : '#fff',
                                                    borderColor: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.08)',
                                                    color: isDark ? '#fff' : '#000',
                                                }}
                                            />
                                        </div>

                                        {linkFilter && (
                                            <button
                                                onClick={() => setLinkFilter(null)}
                                                className="inline-flex items-center gap-1.5 px-3 h-9 rounded-xl text-xs font-bold cursor-pointer"
                                                style={{ background: 'rgba(168,85,247,0.14)', color: '#a855f7' }}
                                            >
                                                <Filter size={13} />
                                                {links.find(l => l.id === linkFilter)?.Name || 'Link'}
                                                <Plus size={13} className="rotate-45" />
                                            </button>
                                        )}
                                    </div>
                                </div>

                                {/* the list - the only part that scrolls */}
                                <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar pr-1 pb-12">
                                    {visibleStories.length === 0 ? (
                                        <div className="glass-surface rounded-3xl border-dashed p-12 text-center text-sec">
                                            {sessions.length === 0
                                                ? 'No visits recorded yet. The first one shows up here the moment it happens.'
                                                : 'Nothing matches that filter.'}
                                        </div>
                                    ) : (
                                        <div className="flex flex-col gap-2">
                                            {visibleStories.map(story => {
                                                const live = isLive(story);
                                                const flag = flagOf(story.Geo?.Code);
                                                const when = story.StartedAt
                                                    ? new Date(story.StartedAt).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
                                                    : 'Before the rewrite';
                                                const projectCount = Object.keys(story.Projects || {}).length;
                                                const socialCount = Object.keys(story.Socials || {}).length;
                                                const deepest = Math.round(
                                                    Object.values(story.Scroll || {}).reduce((top, pct) => Math.max(top, pct), 0),
                                                );
                                                // What they actually did. These used to be crammed into the
                                                // subtitle; as chips they fill the middle of the row, which
                                                // was dead space between the name and the duration.
                                                const did: { label: string; tint: string }[] = [];
                                                if (projectCount) did.push({ label: `${projectCount} project${projectCount === 1 ? '' : 's'}`, tint: '16,185,129' });
                                                if (story.Cv?.Opens) did.push({ label: 'CV', tint: '245,158,11' });
                                                if (story.Contact?.Sent) {
                                                    did.push({ label: story.Contact.Sent === 'meeting' ? 'booked a meeting' : 'sent a message', tint: '236,72,153' });
                                                } else if (story.Contact?.Opens) {
                                                    did.push({ label: 'opened contact', tint: '236,72,153' });
                                                }
                                                if (socialCount) did.push({ label: `${socialCount} social${socialCount === 1 ? '' : 's'}`, tint: '139,92,246' });

                                                return (
                                                    <button
                                                        key={story.Id}
                                                        onClick={() => setOpenStoryId(story.Id)}
                                                        className="w-full text-left flex items-center gap-3 sm:gap-4 px-4 py-3.5 rounded-2xl border cursor-pointer transition-colors"
                                                        style={{
                                                            background: isDark ? 'rgba(255,255,255,0.02)' : '#fff',
                                                            borderColor: live ? 'rgba(34,197,94,0.35)' : 'var(--card-border)',
                                                        }}
                                                        onMouseEnter={e => { e.currentTarget.style.background = isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.02)'; }}
                                                        onMouseLeave={e => { e.currentTarget.style.background = isDark ? 'rgba(255,255,255,0.02)' : '#fff'; }}
                                                    >
                                                        <span className="w-9 h-9 rounded-xl grid place-items-center shrink-0 text-base"
                                                            style={{ background: isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.04)', color: 'var(--text-muted)' }}>
                                                            {flag || <DeviceIcon type={story.Device?.Type} size={16} />}
                                                        </span>

                                                        <span className="flex flex-col min-w-0 gap-0.5" style={{ flex: '1 1 200px' }}>
                                                            <span className="flex items-center gap-2 min-w-0">
                                                                <span className="text-sm font-bold truncate" style={{ color: isDark ? '#fff' : '#000' }}>
                                                                    {story.Geo?.Country || 'Somewhere'}
                                                                </span>
                                                                {story.Link && (
                                                                    <span className="px-1.5 py-0.5 rounded-md text-[9px] font-black tracking-wide shrink-0"
                                                                        style={{ background: 'rgba(168,85,247,0.14)', color: '#a855f7' }}>
                                                                        {story.Link.Name.toUpperCase()}
                                                                    </span>
                                                                )}
                                                                {live && (
                                                                    <span className="w-1.5 h-1.5 rounded-full shrink-0 animate-pulse" style={{ background: '#22c55e' }} />
                                                                )}
                                                            </span>
                                                            <span className="text-[11px] truncate" style={{ color: 'var(--text-muted)' }}>
                                                                {when} · {story.Entry?.Ref ? `from ${story.Entry.Ref}` : 'direct'}
                                                            </span>
                                                        </span>

                                                        <span className="hidden xl:flex items-center gap-1.5 min-w-0 overflow-hidden" style={{ flex: '1 1 240px' }}>
                                                            {did.length ? did.map(chip => (
                                                                <span
                                                                    key={chip.label}
                                                                    className="px-2 h-6 inline-flex items-center rounded-md text-[10px] font-bold whitespace-nowrap shrink-0"
                                                                    style={{ background: `rgba(${chip.tint},0.14)`, color: `rgb(${chip.tint})` }}
                                                                >
                                                                    {chip.label}
                                                                </span>
                                                            )) : (
                                                                <span className="text-[11px]" style={{ color: 'var(--text-muted)' }}>just looked around</span>
                                                            )}
                                                        </span>

                                                        {/* how far down the page they actually got */}
                                                        <span className="hidden 2xl:flex items-center gap-2 shrink-0 w-[86px]"
                                                            title={deepest > 0 ? `Read ${deepest}% of the way down` : undefined}>
                                                            {deepest > 0 && (
                                                                <>
                                                                    <span className="h-1.5 flex-1 rounded-full overflow-hidden"
                                                                        style={{ background: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)' }}>
                                                                        <span className="block h-full rounded-full"
                                                                            style={{ width: `${Math.min(100, deepest)}%`, background: '#3b82f6' }} />
                                                                    </span>
                                                                    <span className="text-[10px] font-bold tabular-nums w-7 text-right" style={{ color: 'var(--text-muted)' }}>
                                                                        {deepest}%
                                                                    </span>
                                                                </>
                                                            )}
                                                        </span>

                                                        <span className="hidden sm:flex items-center gap-1.5 text-[11px] font-semibold shrink-0" style={{ color: 'var(--text-muted)' }}>
                                                            <DeviceIcon type={story.Device?.Type} size={13} />
                                                            {story.Device?.Browser || '?'}
                                                        </span>

                                                        <span className="text-xs font-black tabular-nums shrink-0 w-14 text-right"
                                                            style={{ color: story.ActiveMs > 60_000 ? '#22c55e' : 'var(--text-muted)' }}>
                                                            {formatMs(story.ActiveMs || 0)}
                                                        </span>
                                                    </button>
                                                );
                                            })}
                                        </div>
                                    )}
                                </div>
                            </div>
                        )}

                        {view === 'overview' && (
                            <div className="flex flex-col h-full min-h-0 w-full">
                                <div className="shrink-0 flex flex-col gap-1 pb-8">
                                    <h1 className="heading-lg m-0 text-2xl sm:text-3xl">Overview</h1>
                                    <p className="text-muted text-sm">
                                        {dailySeries.length ? `Since ${dailySeries[0].date}` : 'Nothing recorded yet'}
                                    </p>
                                </div>

                                <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar pr-1 pb-12">
                                    <div className="flex flex-col gap-8 w-full">
                                        <div className="grid gap-3" style={{ gridTemplateColumns: `repeat(auto-fit, minmax(${windowWidth < 520 ? 140 : 180}px, 1fr))` }}>
                                            {counters.map(c => (
                                                <div key={c.label} className="rounded-[24px] border p-5 flex flex-col gap-3"
                                                    style={{
                                                        background: isDark ? 'rgba(255,255,255,0.02)' : '#fff',
                                                        borderColor: 'var(--card-border)',
                                                    }}>
                                                    <span className="w-9 h-9 rounded-xl grid place-items-center"
                                                        style={{ background: `${c.tint}1f`, color: c.tint }}>
                                                        {c.icon}
                                                    </span>
                                                    <div className="flex flex-col">
                                                        <RollingNumber
                                                            text={c.value.toLocaleString()}
                                                            className="text-3xl font-black tracking-tight tabular-nums"
                                                            style={{ color: isDark ? '#fff' : '#0f172a' }}
                                                        />
                                                        <span className="text-[9px] font-bold uppercase tracking-[0.2em] mt-1" style={{ color: 'var(--text-muted)' }}>
                                                            {c.label}
                                                        </span>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>

                                        <AnalyticsChart
                                            data={chartData}
                                            filter={chartFilter}
                                            setFilter={setChartFilter}
                                            isDark={isDark}
                                            windowWidth={windowWidth}
                                        />

                                        <ProjectRankings projects={rankProjects} isDark={isDark} />

                                        {socials.length > 0 && (
                                            <div className={`w-full ${isDark ? 'bg-[#0C0C0C] border-white/[0.06]' : 'bg-white border-black/[0.06] shadow-sm'} rounded-[28px] p-5 sm:p-8 border`}>
                                                <div className="flex items-center gap-3 mb-6">
                                                    <div className={`${isDark ? 'bg-purple-500/10 text-purple-400' : 'bg-purple-100 text-purple-600'} w-10 h-10 flex items-center justify-center rounded-xl`}>
                                                        <Globe size={20} />
                                                    </div>
                                                    <div>
                                                        <h3 className={`${isDark ? 'text-white' : 'text-slate-900'} text-xl sm:text-2xl font-black tracking-[-0.02em] leading-none`}>
                                                            Where they went next
                                                        </h3>
                                                        <p className={`${isDark ? 'text-[#666]' : 'text-slate-400'} text-[10px] font-bold uppercase tracking-[0.15em] mt-1.5`}>
                                                            Social links, and how long they stayed away
                                                        </p>
                                                    </div>
                                                </div>
                                                <div className="flex flex-col gap-2">
                                                    {socials.map(s => (
                                                        <div key={s.name} className={`flex items-center justify-between gap-4 px-4 py-3 rounded-2xl border ${isDark ? 'bg-white/[0.02] border-white/[0.06]' : 'bg-slate-50 border-black/[0.04]'}`}>
                                                            <span className={`text-sm font-bold truncate ${isDark ? 'text-white' : 'text-slate-900'}`}>{s.name}</span>
                                                            <span className="flex items-center gap-4 shrink-0 text-[11px] font-bold tabular-nums" style={{ color: 'var(--text-muted)' }}>
                                                                <span>{(s.Clicks || 0).toLocaleString()} clicks</span>
                                                                <span style={{ color: '#8b5cf6' }}>{formatMs(s.AwayMs || 0)} away</span>
                                                            </span>
                                                        </div>
                                                    ))}
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </div>
                        )}

                        {view === 'links' && (
                            <div className="flex flex-col h-full min-h-0">
                                <div className="shrink-0 flex flex-col gap-1 pb-8">
                                    <h1 className="heading-lg m-0 text-2xl sm:text-3xl">Links</h1>
                                    <p className="text-muted text-sm">Private doors into the portfolio, one per person</p>
                                </div>

                                <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar pr-1 pb-12">
                                    <div className="grid gap-6 items-start" style={{
                                        gridTemplateColumns: windowWidth >= 1100 ? 'minmax(0, 320px) minmax(0, 1fr)' : 'minmax(0, 1fr)',
                                    }}>
                                        {/* Pinned once there are two columns: you can keep making links
                                            without scrolling back up past everything you already made. */}
                                        <div className="glass-panel p-6 sm:p-7"
                                            style={windowWidth >= 1100 ? { position: 'sticky', top: 0 } : undefined}>
                                            <h3 className="heading-sm mb-5">New link</h3>
                                            <div className="flex flex-col gap-4">
                                                <div className="flex flex-col gap-2">
                                                    <label className="text-[10px] font-bold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }} htmlFor="trails-link-name">Who it is for</label>
                                                    <input id="trails-link-name" type="text" className="input-field" value={name}
                                                        onChange={e => setName(e.target.value)} placeholder="e.g. Google" />
                                                </div>
                                                <div className="flex flex-col gap-2">
                                                    <label className="text-[10px] font-bold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }} htmlFor="trails-link-for">What it is about</label>
                                                    <input id="trails-link-for" type="text" className="input-field" value={forField}
                                                        onChange={e => setForField(e.target.value)} placeholder="e.g. Frontend role" />
                                                </div>
                                                <button onClick={createLink} disabled={!name.trim() || !forField.trim()}
                                                    className="btn btn-primary w-full py-3.5 mt-1">
                                                    Create link
                                                </button>
                                                <p className="text-[11px] leading-relaxed" style={{ color: 'var(--text-muted)' }}>
                                                    New links email you the moment they are opened, with a button
                                                    straight to that visit.
                                                </p>
                                            </div>
                                        </div>

                                        <div className="grid gap-4" style={{
                                            gridTemplateColumns: windowWidth >= 720 ? 'repeat(auto-fit, minmax(320px, 1fr))' : 'minmax(0, 1fr)',
                                        }}>
                                            {links.length === 0 ? (
                                                <div className="glass-surface rounded-3xl border-dashed p-12 text-center text-sec">
                                                    No links yet.
                                                </div>
                                            ) : links.map(link => (
                                                <motion.div key={link.id} layout className="glass-panel p-5 sm:p-6 flex flex-col gap-4">
                                                    <div className="flex justify-between items-start gap-3">
                                                        <div className="flex flex-col min-w-0">
                                                            <h3 className="font-bold text-lg leading-tight truncate">{link.Name}</h3>
                                                            <p className="text-xs mt-0.5 truncate" style={{ color: 'var(--text-muted)' }}>{link.For}</p>
                                                        </div>
                                                        <button onClick={e => openMenu(e, link.id)} aria-label={`Options for ${link.Name}`}
                                                            className="p-1 shrink-0 cursor-pointer transition-colors hover:text-blue-500" style={{ color: 'var(--text-muted)' }}>
                                                            <MoreVertical size={18} />
                                                        </button>
                                                    </div>

                                                    <div className="flex items-center gap-3 p-3 rounded-xl border"
                                                        style={{ background: isDark ? 'rgba(0,0,0,0.25)' : 'rgba(0,0,0,0.03)', borderColor: 'var(--card-border)' }}>
                                                        <code className="text-[10px] font-mono flex-1 truncate" style={{ color: 'var(--text-muted)' }}>{link.url}</code>
                                                        <button onClick={() => copyToClipboard(link.url, link.id)} aria-label="Copy link"
                                                            className="cursor-pointer transition-colors hover:text-blue-500" style={{ color: 'var(--text-muted)' }}>
                                                            {copied === link.id ? <Check size={15} className="text-green-500" /> : <Copy size={15} />}
                                                        </button>
                                                    </div>

                                                    <div className="flex items-center gap-4 text-[11px] font-bold tabular-nums" style={{ color: 'var(--text-muted)' }}>
                                                        <span className="flex items-center gap-1.5"><Eye size={13} />{link.Opens || 0} opens</span>
                                                        <span className="flex items-center gap-1.5"><Footprints size={13} />{link.Sessions || 0} visits</span>
                                                        {link.LastOpenAt ? (
                                                            <span className="truncate">{new Date(link.LastOpenAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}</span>
                                                        ) : null}
                                                    </div>

                                                    <div className="flex items-center gap-2 flex-wrap">
                                                        <button
                                                            onClick={() => patchLink(link.id, { Notify: link.Notify === false }, link.Notify === false ? 'You will be emailed on every open.' : 'Notifications off for this link.')}
                                                            className="inline-flex items-center gap-1.5 px-2.5 h-8 rounded-lg text-[10px] font-bold cursor-pointer transition-colors"
                                                            style={{
                                                                background: link.Notify !== false ? 'rgba(59,130,246,0.14)' : (isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.04)'),
                                                                color: link.Notify !== false ? '#3b82f6' : 'var(--text-muted)',
                                                            }}
                                                        >
                                                            {link.Notify !== false ? <BellRing size={13} /> : <BellOff size={13} />}
                                                            {link.Notify !== false ? 'Emails on' : 'Emails off'}
                                                        </button>
                                                        {link.Tailor?.AutoCv && (
                                                            <span className="inline-flex items-center gap-1.5 px-2.5 h-8 rounded-lg text-[10px] font-bold"
                                                                style={{ background: 'rgba(245,158,11,0.14)', color: '#f59e0b' }}>
                                                                <FileText size={13} /> CV opens itself
                                                            </span>
                                                        )}
                                                        {(link.Tailor?.Pinned?.length || 0) > 0 && (
                                                            <span className="inline-flex items-center gap-1.5 px-2.5 h-8 rounded-lg text-[10px] font-bold"
                                                                style={{ background: 'rgba(16,185,129,0.14)', color: '#10b981' }}>
                                                                <Briefcase size={13} /> {link.Tailor.Pinned.length} pinned
                                                            </span>
                                                        )}
                                                        <button
                                                            onClick={() => { setLinkFilter(link.id); setStoryFilter('all'); setView('stories'); }}
                                                            disabled={!link.Sessions}
                                                            className="ml-auto inline-flex items-center gap-1.5 px-3 h-8 rounded-lg text-[10px] font-bold cursor-pointer transition-colors disabled:opacity-40 disabled:cursor-default"
                                                            style={{ background: 'rgba(168,85,247,0.14)', color: '#a855f7' }}
                                                        >
                                                            See visits <ArrowRight size={12} />
                                                        </button>
                                                    </div>
                                                </motion.div>
                                            ))}
                                        </div>
                                    </div>
                                </div>
                            </div>
                        )}
                    </motion.div>
                </AnimatePresence>
            </div>

            {/* link options menu */}
            {activeMenu && createPortal(
                <>
                    <div className="fixed inset-0 z-[999]" onClick={() => setActiveMenu(null)} />
                    <div className="fixed z-[1000] glass-panel min-w-[200px] p-2 animate-pop flex flex-col gap-1 shadow-2xl"
                        style={{ top: `${menuPos.top}px`, right: `${menuPos.right}px`, borderRadius: '16px' }}>
                        <button
                            onClick={() => { const l = links.find(x => x.id === activeMenu); if (l) startEdit(l); }}
                            className="w-full text-left flex items-center gap-2.5 bg-transparent border-none cursor-pointer rounded-lg text-sm p-2.5 transition-colors hover:bg-black/5 dark:hover:bg-white/10"
                            style={{ color: 'var(--text-primary)' }}>
                            <Edit2 size={15} /> Edit &amp; tailor
                        </button>
                        <div className="mx-2 my-1 h-px" style={{ background: 'var(--card-border)' }} />
                        <button
                            onClick={() => {
                                const id = activeMenu;
                                setConfirmConfig({
                                    isOpen: true,
                                    title: 'Forget this link’s visits',
                                    message: 'Every story recorded through this link is deleted and its counters go back to zero. The link itself keeps working.',
                                    type: 'warning',
                                    onConfirm: () => forgetLinkVisits(id),
                                });
                            }}
                            className="w-full text-left flex items-center gap-2.5 bg-transparent border-none cursor-pointer rounded-lg text-sm p-2.5 transition-colors hover:bg-orange-500/10"
                            style={{ color: 'rgb(249, 115, 22)' }}>
                            <Trash2 size={15} /> Forget its visits
                        </button>
                        <button
                            onClick={() => {
                                const id = activeMenu;
                                setConfirmConfig({
                                    isOpen: true,
                                    title: 'Remove link',
                                    message: 'The link stops working immediately. Visits already recorded through it stay.',
                                    type: 'danger',
                                    onConfirm: () => deleteLink(id),
                                });
                            }}
                            className="w-full text-left flex items-center gap-2.5 bg-transparent border-none cursor-pointer rounded-lg text-sm p-2.5 transition-colors hover:bg-red-500/10"
                            style={{ color: 'rgb(239, 68, 68)' }}>
                            <Trash2 size={15} /> Remove link
                        </button>
                    </div>
                </>,
                document.body,
            )}

            {/* link editor */}
            {editingLink && draft && createPortal(
                <div className="fixed inset-0 z-[99999] flex items-center justify-center p-4 bg-black/45 backdrop-blur-md animate-fade-in"
                    onClick={() => { setEditingLink(null); setDraft(null); }}>
                    <motion.div
                        initial={{ opacity: 0, scale: 0.97, y: 8 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
                        className="glass-panel w-full max-w-[560px] overflow-hidden shadow-2xl flex flex-col"
                        style={{ maxHeight: '88vh' }}
                        onClick={e => e.stopPropagation()}>
                        <div className="px-7 py-5 border-b flex items-center justify-between gap-3" style={{ borderColor: 'var(--card-border)' }}>
                            <div className="flex flex-col min-w-0">
                                <h2 className="heading-sm m-0 truncate">{editingLink.Name}</h2>
                                <span className="text-[11px]" style={{ color: 'var(--text-muted)' }}>What this link does differently</span>
                            </div>
                        </div>

                        <div className="px-7 py-6 flex flex-col gap-5 overflow-y-auto custom-scrollbar">
                            <div className="grid gap-4" style={{ gridTemplateColumns: windowWidth >= 520 ? '1fr 1fr' : '1fr' }}>
                                <div className="flex flex-col gap-2">
                                    <label className="input-label m-0" htmlFor="trails-edit-name">Who it is for</label>
                                    <input id="trails-edit-name" type="text" className="input-field" value={draft.Name}
                                        onChange={e => setDraft({ ...draft, Name: e.target.value })} />
                                </div>
                                <div className="flex flex-col gap-2">
                                    <label className="input-label m-0" htmlFor="trails-edit-for">What it is about</label>
                                    <input id="trails-edit-for" type="text" className="input-field" value={draft.For}
                                        onChange={e => setDraft({ ...draft, For: e.target.value })} />
                                </div>
                            </div>

                            <div className="flex flex-col gap-2">
                                <label className="input-label m-0" htmlFor="trails-edit-greeting">Greeting on the hero</label>
                                <input id="trails-edit-greeting" type="text" className="input-field" maxLength={160}
                                    placeholder="Leave empty for the usual one"
                                    value={draft.Greeting}
                                    onChange={e => setDraft({ ...draft, Greeting: e.target.value })} />
                            </div>

                            <div className="flex flex-col gap-1">
                                {[
                                    {
                                        key: 'Notify' as const,
                                        title: 'Email me when it is opened',
                                        note: 'With a button that jumps straight to the visit.',
                                        value: draft.Notify,
                                    },
                                    {
                                        key: 'AutoCv' as const,
                                        title: 'Open the CV by itself',
                                        note: 'Pops once the hero finishes, for people here to read it.',
                                        value: draft.AutoCv,
                                    },
                                ].map(row => (
                                    <div key={row.key} className="flex items-center gap-4 py-3" style={{ borderBottom: '1px solid var(--card-border)' }}>
                                        <div className="flex flex-col flex-1 min-w-0">
                                            <span className="text-sm font-semibold" style={{ color: isDark ? '#fff' : '#000' }}>{row.title}</span>
                                            <span className="text-[11px]" style={{ color: 'var(--text-muted)' }}>{row.note}</span>
                                        </div>
                                        <Toggle
                                            checked={row.value}
                                            onChange={next => setDraft({ ...draft, [row.key]: next })}
                                            aria-label={row.title}
                                        />
                                    </div>
                                ))}
                            </div>

                            <div className="flex flex-col gap-2.5">
                                <span className="input-label m-0">Float these projects to the top</span>
                                <div className="flex flex-wrap gap-1.5">
                                    {rankProjects.length === 0 && (
                                        <span className="text-xs" style={{ color: 'var(--text-muted)' }}>No projects yet.</span>
                                    )}
                                    {rankProjects.map(p => {
                                        const on = draft.Pinned.includes(p.id);
                                        return (
                                            <button
                                                key={p.id}
                                                type="button"
                                                onClick={() => setDraft({
                                                    ...draft,
                                                    Pinned: on ? draft.Pinned.filter(x => x !== p.id) : [...draft.Pinned, p.id].slice(0, 12),
                                                })}
                                                className="px-3 h-8 rounded-lg text-[11px] font-bold cursor-pointer transition-colors"
                                                style={{
                                                    background: on ? 'rgba(16,185,129,0.16)' : (isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.04)'),
                                                    color: on ? '#10b981' : 'var(--text-muted)',
                                                }}
                                            >
                                                {p.name}
                                            </button>
                                        );
                                    })}
                                </div>
                            </div>
                        </div>

                        <div className="px-7 py-4 border-t flex items-center justify-end gap-3" style={{ borderColor: 'var(--card-border)' }}>
                            <button onClick={() => { setEditingLink(null); setDraft(null); }} className="btn btn-secondary !px-6 !py-2.5">Cancel</button>
                            <button onClick={saveDraft} disabled={!draft.Name.trim() || !draft.For.trim()} className="btn btn-primary !px-7 !py-2.5">
                                Save
                            </button>
                        </div>
                    </motion.div>
                </div>,
                document.body,
            )}

            <MStory
                story={openStory}
                isDark={isDark}
                windowWidth={windowWidth}
                onClose={() => { setOpenStoryId(null); setPendingStory(''); }}
                onDelete={id => setConfirmConfig({
                    isOpen: true,
                    title: 'Delete this visit',
                    message: 'The story and everything in it goes. The daily totals it already contributed to stay as they are.',
                    type: 'danger',
                    onConfirm: () => deleteStory(id),
                })}
            />

            {alert?.show && (
                <Alert type={alert.type} message={alert.message} onClose={() => hideAlert()} duration={alert.duration ?? 4000} />
            )}

            <MConfirmModal
                isOpen={confirmConfig.isOpen}
                title={confirmConfig.title}
                message={confirmConfig.message}
                type={confirmConfig.type}
                onConfirm={confirmConfig.onConfirm}
                onClose={() => setConfirmConfig(prev => ({ ...prev, isOpen: false }))}
            />
        </div>
    );
};

export default DTrails;
