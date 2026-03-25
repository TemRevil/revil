import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { RefreshCcw, Copy, Check, MoreVertical, Edit2, Trash2, Activity, Users, Plus, Clock, Briefcase, MousePointer2, Eye, Globe, ChevronLeft, ChevronRight } from 'lucide-react';
import anime from 'animejs';
import { motion, AnimatePresence } from 'motion/react';
import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip, CartesianGrid, TooltipProps } from 'recharts';
import { doc, onSnapshot, updateDoc, collection, getDocs, setDoc, deleteDoc } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import Loader from '../reactbits/Loader';
import Alert from '../Alert';
import useSafeAlert from '../../hooks/useSafeAlert';
import MConfirmModal, { ConfirmType } from './M-ConfirmModal';

interface AnalyticsData {
    "Total Reach"?: string | number;
    "Reach (Per Device)"?: string | number;
    "Today's Viewers"?: string | number;
    [key: string]: string | number | undefined;
}

interface GeneratedLink {
    id: string;
    name: string;
    forField: string;
    code: string;
    fullLink: string;
    viewed: boolean;
    counts: number;
    createdAt: Date;
    recCLI: string;
    interviewer: boolean;
}

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



const ActivityModal = ({ isOpen, onClose, onReset, data, linkName }: { isOpen: boolean; onClose: () => void; onReset: () => void; data: string; linkName: string }) => {
    if (!isOpen) return null;

    const parseData = (raw: string) => {
        if (!raw) return null;
        try {
            const getVal = (regex: RegExp) => {
                const match = raw.match(regex);
                return match ? match[1] : null;
            };

            const total = getVal(/Session:\s*([^,\]]+)/) || getVal(/T:\s*([^,\]]+)/) || '0m 0s';
            const stack = getVal(/Stack:\s*([^,\]]+)/) || getVal(/S:\s*([^,\]]+)/) || '0m 0s';
            const contact = getVal(/Contact:(\d+)/) || getVal(/C:(\d+)/) || '0';

            const projectsPart = raw.match(/Projects:\[(.*?)\]/)?.[1] || raw.match(/P:\[(.*?)\]/)?.[1] || '';
            const projects = projectsPart ? projectsPart.split('|').map(p => {
                const parts = p.match(/^(.*?):([^()x:]+)(?:\((\d+)x\)|:(\d+)v)?$/);
                if (parts) {
                    const [, id, time, verboseViews, conciseViews] = parts;
                    return {
                        id: id.trim(),
                        time: time.trim(),
                        views: (verboseViews || conciseViews || '0')
                    };
                }
                return { id: '?', time: '0m 0s', views: '0' };
            }).filter(p => p.id !== '?') : [];

            // Socials Parsing
            const socialsPart = raw.match(/Socials:\[(.*?)\]/)?.[1] || '';
            const socials = socialsPart ? socialsPart.split('|').map(s => {
                const parts = s.match(/^(.*?):([^()x:]+)(?:\((\d+)x\)|:(\d+)v)?$/);
                if (parts) {
                    const [, id, time, verboseViews, conciseViews] = parts;
                    return {
                        id: id.trim(),
                        time: time.trim(),
                        views: (verboseViews || conciseViews || '0')
                    };
                }
                return { id: '?', time: '0m 0s', views: '0' };
            }).filter(s => s.id !== '?') : [];

            return { total, stack, contact, projects, socials };
        } catch (e) {
            console.error("Parse error", e);
            return null;
        }
    };

    const stats = parseData(data);

    return createPortal(
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in" onClick={onClose}>
            <div className="glass-panel w-full max-w-[500px] flex flex-col animate-scale-in relative overflow-hidden max-h-[90vh]" onClick={e => e.stopPropagation()}>
                <div className="p-6 border-b border-white/10 flex justify-between items-center">
                    <h2 className="heading-sm m-0 flex-1 truncate pr-4">{linkName} Analytics</h2>
                    <div className="flex items-center gap-2 shrink-0">
                        <button onClick={onReset} className="px-3 py-1.5 bg-red-500/10 text-red-500 hover:bg-red-500/20 text-xs font-bold uppercase tracking-wider rounded-lg transition-colors flex items-center gap-1.5 border border-red-500/20">
                            <RefreshCcw size={14} />
                            <span>Reset</span>
                        </button>
                        <button onClick={onClose} className="p-2 hover:bg-white/10 rounded-lg transition-colors">
                            <Plus size={20} className="rotate-45" />
                        </button>
                    </div>
                </div>

                <div className="p-6 overflow-y-auto flex flex-col gap-6">
                    {!stats ? (
                        <div className="text-center py-12 text-muted italic">No session data available...</div>
                    ) : (
                        <>
                            <div className="grid grid-cols-3 gap-3">
                                <div className="p-4 bg-white/5 rounded-xl border border-white/5 flex flex-col items-center text-center gap-1.5">
                                    <Clock size={16} className="text-info opacity-70" />
                                    <div className="text-[10px] font-bold text-muted uppercase tracking-wider">Session</div>
                                    <div className="text-lg font-bold">{stats.total}</div>
                                </div>
                                <div className="p-4 bg-white/5 rounded-xl border border-white/5 flex flex-col items-center text-center gap-1.5">
                                    <Briefcase size={16} className="text-secondary opacity-70" />
                                    <div className="text-[10px] font-bold text-muted uppercase tracking-wider">Stack</div>
                                    <div className="text-lg font-bold">{stats.stack}</div>
                                </div>
                                <div className="p-4 bg-white/5 rounded-xl border border-white/5 flex flex-col items-center text-center gap-1.5">
                                    <MousePointer2 size={16} className="text-success opacity-70" />
                                    <div className="text-[10px] font-bold text-muted uppercase tracking-wider">Contact</div>
                                    <div className="text-lg font-bold">{stats.contact}</div>
                                </div>
                            </div>

                            <div className="flex flex-col gap-3">
                                <div className="text-xs font-bold text-muted uppercase tracking-widest pl-1">Project Engagement</div>
                                {stats.projects.length === 0 ? (
                                    <div className="text-center py-6 text-muted text-xs italic">No interactions recorded.</div>
                                ) : (
                                    stats.projects.map((p, i) => (
                                        <div key={i} className="flex justify-between items-center p-3 bg-white/5 border border-white/5 rounded-xl hover:bg-white/10 transition-colors">
                                            <div className="flex items-center gap-3">
                                                <div className="p-2 bg-info/10 rounded-lg text-info">
                                                    <Eye size={14} />
                                                </div>
                                                <div className="flex flex-col">
                                                    <span className="font-bold text-sm tracking-tight">{p.id}</span>
                                                    <span className="text-[10px] text-muted">{p.views} views</span>
                                                </div>
                                            </div>
                                            <span className="text-xs font-bold text-info bg-info/5 px-2.5 py-1 rounded-md">{p.time}</span>
                                        </div>
                                    ))
                                )}
                            </div>

                            <div className="flex flex-col gap-3">
                                <div className="text-xs font-bold text-muted uppercase tracking-widest pl-1">Social Engagement</div>
                                {stats.socials.length === 0 ? (
                                    <div className="text-center py-6 text-muted text-xs italic">No interactions recorded.</div>
                                ) : (
                                    stats.socials.map((s, i) => (
                                        <div key={i} className="flex justify-between items-center p-3 bg-white/5 border border-white/5 rounded-xl hover:bg-white/10 transition-colors">
                                            <div className="flex items-center gap-3">
                                                <div className="p-2 bg-secondary/10 rounded-lg text-secondary">
                                                    <Globe size={14} />
                                                </div>
                                                <div className="flex flex-col">
                                                    <span className="font-bold text-sm tracking-tight">{s.id}</span>
                                                    <span className="text-[10px] text-muted">{s.views} clicks</span>
                                                </div>
                                            </div>
                                            <span className="text-xs font-bold text-secondary bg-secondary/5 px-2.5 py-1 rounded-md">{s.time}</span>
                                        </div>
                                    ))
                                )}
                            </div>
                        </>
                    )}
                </div>
            </div>
        </div>,
        document.body
    );
};

const CustomTooltip = ({ active, payload, isDark }: TooltipProps<number, string> & { isDark?: boolean }) => {
    if (active && payload && payload.length) {
        const item = payload[0].payload as ChartDataPoint;
        const d = new Date(item.fullDate);

        let headerText = '';
        let subLabel = 'Views';

        if (item.type === 'weekly') {
            const end = new Date(d);
            end.setDate(end.getDate() + 6);
            headerText = `${d.getDate()}/${d.getMonth() + 1} — ${end.getDate()}/${end.getMonth() + 1}`;
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
    mainStat: string | number;
    subStat: string | number;
    analytics: AnalyticsData | null;
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

    // Touch gestures — use native listeners for { passive: false } support
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

    // Trackpad horizontal scroll — native listener with { passive: false }
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

            {/* Row 2: Nav — arrows flanking the date, dots after */}
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

const DLinks = () => {
    const [windowWidth, setWindowWidth] = useState(typeof window !== 'undefined' ? window.innerWidth : 1200);
    useEffect(() => {
        const handleResize = () => setWindowWidth(window.innerWidth);
        window.addEventListener('resize', handleResize);
        return () => window.removeEventListener('resize', handleResize);
    }, []);

    const [isLoading, setIsLoading] = useState(false);
    const [isDark, setIsDark] = useState(false);
    const [analytics, setAnalytics] = useState<AnalyticsData | null>(null);
    const [dailyMap, setDailyMap] = useState<Record<string, number | { total: number; projectViews?: number; socialClicks?: number }> | null>(null);

    // Convert dailyMap to sorted numeric series (ascending by date key)
    const dailySeries = useMemo(() => {
        if (!dailyMap) return [] as { date: string; value: number; projectViews: number; socialClicks: number }[];
        try {
            const entries = Object.entries(dailyMap)
                .filter(([k]) => k && k !== 'next')
                .map(([k, v]) => {
                    const isObj = v && typeof v === 'object';
                    const obj = isObj ? (v as { total?: number; projectViews?: number; socialClicks?: number }) : null;
                    const val = typeof v === 'number' ? v : (obj ? obj.total || 0 : 0);
                    const pViews = obj ? obj.projectViews || 0 : 0;
                    const sClicks = obj ? obj.socialClicks || 0 : 0;
                    return {
                        date: k,
                        value: Number(val) || 0,
                        projectViews: Number(pViews) || 0,
                        socialClicks: Number(sClicks) || 0
                    };
                });
            entries.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
            return entries;
        } catch {
            return [] as { date: string; value: number; projectViews: number; socialClicks: number }[];
        }
    }, [dailyMap]);

    const [chartFilter, setChartFilter] = useState<'daily' | 'weekly' | 'monthly'>('daily');

    const chartData = useMemo(() => {
        if (!dailySeries || dailySeries.length === 0) return [];

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
                    type: 'daily' as const
                };
            });
        } else if (chartFilter === 'weekly') {
            const weeks: Record<string, { total: number; p: number; s: number }> = {};
            dailySeries.forEach(s => {
                const d = new Date(s.date);
                const day = d.getDay();
                const diff = d.getDate() - day + (day === 0 ? -6 : 1);
                const monday = new Date(new Date(s.date).setDate(diff));
                const weekKey = monday.toISOString().split('T')[0];
                if (!weeks[weekKey]) weeks[weekKey] = { total: 0, p: 0, s: 0 };
                weeks[weekKey].total += s.value;
                weeks[weekKey].p += s.projectViews;
                weeks[weekKey].s += s.socialClicks;
            });

            aggregated = Object.entries(weeks).map(([date, vals]) => {
                const d = new Date(date);
                return {
                    label: `${d.getDate()}/${d.getMonth() + 1}`,
                    dateNum: d.getMonth() + 1,
                    value: vals.total,
                    projectViews: vals.p,
                    socialClicks: vals.s,
                    fullDate: date,
                    type: 'weekly' as const
                };
            }).sort((a, b) => new Date(a.fullDate).getTime() - new Date(b.fullDate).getTime());
        } else if (chartFilter === 'monthly') {
            const months: Record<string, { total: number; p: number; s: number }> = {};
            dailySeries.forEach(s => {
                const d = new Date(s.date);
                const monthKey = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
                if (!months[monthKey]) months[monthKey] = { total: 0, p: 0, s: 0 };
                months[monthKey].total += s.value;
                months[monthKey].p += s.projectViews;
                months[monthKey].s += s.socialClicks;
            });
            aggregated = Object.entries(months).map(([key, vals]) => {
                const [year, month] = key.split('-');
                const date = new Date(parseInt(year), parseInt(month) - 1, 1);
                return {
                    label: date.toLocaleDateString('en-US', { month: 'short' }).toUpperCase(),
                    dateNum: parseInt(year),
                    value: vals.total,
                    projectViews: vals.p,
                    socialClicks: vals.s,
                    fullDate: key,
                    type: 'monthly' as const
                };
            }).sort((a, b) => new Date(a.fullDate).getTime() - new Date(b.fullDate).getTime());
        }

        // Comparison with previous period (e.g. last year same date)
        return aggregated.map(item => {
            const d = new Date(item.fullDate);
            d.setFullYear(d.getFullYear() - 1);
            const prevDateStr = d.toISOString().split('T')[0];
            const prevData = dailyMap?.[prevDateStr];
            const prevValue = prevData ? (typeof prevData === 'number' ? prevData : (prevData as { total: number }).total || 0) : 0;
            return { ...item, prevValue };
        });
    }, [dailySeries, chartFilter, dailyMap, windowWidth]);

    const [name, setName] = useState('');
    const [forField, setForField] = useState('');
    const [generatedLinks, setGeneratedLinks] = useState<GeneratedLink[]>([]);
    const [copied, setCopied] = useState<string | null>(null);
    const [activeMenu, setActiveMenu] = useState<string | null>(null);
    const [menuPos, setMenuPos] = useState({ top: 0, right: 0 });
    const [editingLink, setEditingLink] = useState<GeneratedLink | null>(null);
    const [editName, setEditName] = useState('');
    const [editFor, setEditFor] = useState('');
    const [activityLink, setActivityLink] = useState<GeneratedLink | null>(null);
    const { alert, showAlert, hideAlert } = useSafeAlert(4000);
    // Confirmation Modal State
    const [confirmConfig, setConfirmConfig] = useState<{
        isOpen: boolean;
        title: string;
        message: string;
        onConfirm: () => void;
        type?: ConfirmType;
    }>({
        isOpen: false,
        title: '',
        message: '',
        onConfirm: () => { }
    });
    // hover state removed — using recharts tooltip instead
    const [activeSection, setActiveSection] = useState<'analysis' | 'campaigns'>('analysis');
    const [isTransitioning, setIsTransitioning] = useState(false);
    const directionRef = useRef<number>(1);
    const hasAnimatedRef = useRef<string | null>(null);
    const [revealedSections, setRevealedSections] = useState<Record<string, boolean>>({
        analysis: false,
        campaigns: false
    });



    const isExtraSmall = windowWidth < 400;

    const tabPadding = isExtraSmall ? '8px 12px' : '10px 16px';
    const tabFontSize = isExtraSmall ? '13px' : '15px';
    const iconSize = isExtraSmall ? 16 : 18;

    useEffect(() => {
        const checkTheme = () => setIsDark(document.documentElement.classList.contains('dark'));
        checkTheme();
        const observer = new MutationObserver(checkTheme);
        observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
        return () => {
            observer.disconnect();
        };
    }, []);

    const handleSectionChange = (newSection: 'analysis' | 'campaigns') => {
        if (newSection === activeSection || isTransitioning) return;

        hasAnimatedRef.current = null;
        setRevealedSections(prev => ({ ...prev, [newSection]: false }));

        const indices: Record<string, number> = { analysis: 0, campaigns: 1 };
        const direction = indices[newSection] > indices[activeSection] ? 1 : -1;
        directionRef.current = direction;
        setIsTransitioning(true);

        anime({
            targets: '.links-tab-content',
            translateX: [0, -direction * 30],
            opacity: [1, 0],
            duration: 150,
            easing: 'easeInQuad',
            complete: () => {
                setActiveSection(newSection);
            }
        });
    };

    useEffect(() => {
        const runAnimation = () => {
            const targets = document.querySelectorAll('.links-tab-content');
            if (targets.length === 0) return;
            if (hasAnimatedRef.current === activeSection) return;

            hasAnimatedRef.current = activeSection;

            const timeline = anime.timeline({
                easing: 'easeOutExpo',
                complete: () => {
                    setRevealedSections(prev => ({ ...prev, [activeSection]: true }));
                    setIsTransitioning(false);
                }
            });

            timeline.add({
                targets: '.links-tab-content',
                opacity: [0, 1],
                translateX: [directionRef.current * 40, 0],
                duration: 300
            }, 0);
        };

        runAnimation();
        const tid = setTimeout(runAnimation, 30);
        return () => clearTimeout(tid);
    }, [activeSection]);

    useEffect(() => {
        // Subscribe to Links sub-collection
        const linksUnsub = onSnapshot(collection(db, 'Settings', 'Views', 'Links'), (snapshot) => {
            const linksArray: GeneratedLink[] = [];
            snapshot.forEach(docSnap => {
                const item = docSnap.data() as {
                    Name?: string;
                    For?: string;
                    Code?: string;
                    Rec_CLI?: string;
                    Views?: number;
                    Interviewer?: boolean;
                };
                linksArray.push({
                    id: docSnap.id,
                    name: item.Name || '',
                    forField: item.For || '',
                    code: item.Code || item.Rec_CLI || '',
                    fullLink: `${window.location.origin}${import.meta.env.BASE_URL}${item.Code || item.Rec_CLI || ''}`,
                    viewed: (item.Views || 0) > 0,
                    counts: item.Views || 0,
                    createdAt: new Date(),
                    recCLI: item.Rec_CLI || '',
                    interviewer: !!item.Interviewer
                });
            });
            linksArray.sort((a, b) => parseInt(b.id) - parseInt(a.id));
            setGeneratedLinks(linksArray);
        });

        // Subscribe to Analysis/Main document
        const analysisUnsub = onSnapshot(doc(db, 'Settings', 'Views', 'Analysis', 'Main'), (docSnap) => {
            if (docSnap.exists()) {
                setAnalytics(docSnap.data() as AnalyticsData);
            } else {
                setAnalytics(null);
            }
        });

        // Subscribe to Analysis/Daily document (map of dates -> {total, unique})
        const dailyUnsub = onSnapshot(doc(db, 'Settings', 'Views', 'Analysis', 'Daily'), (docSnap) => {
            if (docSnap.exists()) {
                setDailyMap(docSnap.data() as Record<string, number | { total: number }>);
            } else {
                setDailyMap(null);
            }
        });

        return () => {
            linksUnsub();
            analysisUnsub();
            dailyUnsub();
        };
    }, []);

    const toggleInterviewerMode = async (linkId: string, currentState: boolean) => {
        try {
            const nextState = !currentState;
            const docRef = doc(db, 'Settings', 'Views', 'Links', linkId);
            await updateDoc(docRef, { Interviewer: nextState });
            showAlert({ type: 'success', message: `Interviewer Mode ${nextState ? 'Activated' : 'Deactivated'} for link.` });
        } catch {
            showAlert({ type: 'error', message: 'Failed to toggle Interviewer Mode' });
        }
    };

    useEffect(() => {
        if (generatedLinks.length > 0) {
            anime({
                targets: '.links-row',
                opacity: [0, 1],
                translateX: [10, 0],
                delay: anime.stagger(20),
                duration: 300,
                easing: 'easeOutExpo'
            });
        }
    }, [generatedLinks.length]);

    useEffect(() => {
        anime({
            targets: '.links-section-container',
            opacity: [0, 1],
            translateY: [15, 0],
            duration: 500,
            easing: 'easeOutExpo'
        });
    }, []);

    const generateCode = async () => {
        if (!name.trim() || !forField.trim()) return;
        setIsLoading(true);
        const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
        let code = '';
        for (let i = 0; i < 8; i++) code += chars.charAt(Math.floor(Math.random() * chars.length));

        try {
            // Get all link IDs to find next ID
            const linksSnap = await getDocs(collection(db, 'Settings', 'Views', 'Links'));
            let nextId = "1";
            if (linksSnap.size > 0) {
                const ids = linksSnap.docs.map(d => parseInt(d.id)).filter(id => !isNaN(id));
                if (ids.length > 0) nextId = (Math.max(...ids) + 1).toString();
            }
            const payload = { Code: code, For: forField.trim(), Name: name.trim(), "Rec_CLI": "", Views: 0 };
            await setDoc(doc(db, 'Settings', 'Views', 'Links', nextId), payload);
            setName('');
            setForField('');
            showAlert({ type: 'success', message: 'Campaign link generated successfully!' });
        } catch {
            showAlert({ type: 'error', message: 'Failed to generate link. Check your connection.' });
        } finally {
            setIsLoading(false);
        }
    };

    const copyToClipboard = async (link: string, id: string) => {
        try {
            await navigator.clipboard.writeText(link);
            setCopied(id);
            setTimeout(() => setCopied(null), 2000);
        } catch {
            showAlert({ type: 'error', message: 'Failed to copy to clipboard.' });
        }
    };

    const handleDeleteLink = async (id: string) => {
        if (!id) return;
        setActiveMenu(null);
        try {
            const docRef = doc(db, 'Settings', 'Views', 'Links', id);
            await deleteDoc(docRef);
            showAlert({ type: 'success', message: 'Portal link removed successfully.' });
        } catch {
            showAlert({ type: 'error', message: 'Failed to delete link.' });
        }
    };

    const handleResetLinkAnalysis = async (id: string) => {
        if (!id) return;
        setActiveMenu(null);
        try {
            const docRef = doc(db, 'Settings', 'Views', 'Links', id);
            await updateDoc(docRef, { Views: 0, Rec_CLI: '' });
            setActivityLink(null);
            showAlert({ type: 'success', message: 'Portal analytics reset successfully.' });
        } catch {
            showAlert({ type: 'error', message: 'Failed to reset analytics.' });
        }
    };

    const handleEditClick = (link: GeneratedLink) => {
        setEditingLink(link);
        setEditName(link.name);
        setEditFor(link.forField);
        setActiveMenu(null);
    };

    const handleSaveEdit = async () => {
        if (!editingLink || !editName.trim() || !editFor.trim()) return;
        try {
            const docRef = doc(db, 'Settings', 'Views', 'Links', editingLink.id);
            await updateDoc(docRef, {
                Name: editName.trim(),
                For: editFor.trim()
            });
            setEditingLink(null);
            setEditName('');
            setEditFor('');
        } catch {
            showAlert({ type: 'error', message: 'Failed to update link details.' });
        }
    };

    const handleMenuClick = (e: React.MouseEvent<HTMLButtonElement>, linkId: string) => {
        e.stopPropagation();
        const rect = e.currentTarget.getBoundingClientRect();
        setMenuPos({ top: rect.bottom + 2, right: document.documentElement.clientWidth - rect.right });
        setActiveMenu(activeMenu === linkId ? null : linkId);

        if (activeMenu !== linkId) {
            setTimeout(() => {
                anime({
                    targets: '.links-options-menu',
                    opacity: [0, 1],
                    scale: [0.98, 1],
                    translateX: [10, 0],
                    duration: 200,
                    easing: 'easeOutExpo'
                });
            }, 0);
        }
    };

    return (
        <div className="links-section-container flex flex-col gap-8 h-full opacity-0 overflow-y-auto lg:overflow-hidden p-1 sm:p-0">
            <Loader isOpen={isLoading} isFullScreen={true} />


            {/* Section Tabs */}
            <div className="flex overflow-x-auto" style={{
                gap: isExtraSmall ? '4px' : '8px',
                backgroundColor: isDark ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.03)',
                padding: isExtraSmall ? '4px' : '6px',
                borderRadius: isExtraSmall ? '12px' : '14px',
                width: isExtraSmall ? '100%' : 'fit-content'
            }}>
                <button
                    onClick={() => handleSectionChange('analysis')}
                    className="flex items-center whitespace-nowrap cursor-pointer transition-all font-semibold"
                    style={{
                        gap: isExtraSmall ? '6px' : '8px',
                        padding: tabPadding,
                        borderRadius: isExtraSmall ? '8px' : '10px',
                        backgroundColor: activeSection === 'analysis'
                            ? (isDark ? 'rgba(59, 130, 246, 0.2)' : 'rgba(59, 130, 246, 0.1)')
                            : 'transparent',
                        color: activeSection === 'analysis' ? 'rgb(59, 130, 246)' : 'var(--text-secondary)',
                        fontSize: tabFontSize,
                        flex: isExtraSmall ? 1 : 'none'
                    }}
                >
                    <Activity size={iconSize} />
                    {isExtraSmall ? 'Analysis' : 'Site Analysis'}
                </button>
                <button
                    onClick={() => handleSectionChange('campaigns')}
                    className="flex items-center whitespace-nowrap cursor-pointer transition-all font-semibold"
                    style={{
                        gap: isExtraSmall ? '6px' : '8px',
                        padding: tabPadding,
                        borderRadius: isExtraSmall ? '8px' : '10px',
                        backgroundColor: activeSection === 'campaigns'
                            ? (isDark ? 'rgba(168, 85, 247, 0.2)' : 'rgba(168, 85, 247, 0.1)')
                            : 'transparent',
                        color: activeSection === 'campaigns' ? 'rgb(168, 85, 247)' : 'var(--text-secondary)',
                        fontSize: tabFontSize,
                        flex: isExtraSmall ? 1 : 'none'
                    }}
                >
                    <Plus size={iconSize} />
                    {isExtraSmall ? generatedLinks.length : `Portals(${generatedLinks.length})`}
                </button>
            </div>

            <div className="flex-1 relative overflow-hidden">
                <div className="links-tab-content h-full overflow-y-auto custom-scrollbar pr-1"
                    style={{ opacity: revealedSections[activeSection] ? 1 : 0 }}>

                    {activeSection === 'analysis' ? (
                        <div className="flex flex-col gap-8 pb-12 w-full">
                            <div className="flex flex-col gap-1 w-full">
                                <h1 className="heading-lg m-0 text-2xl sm:text-3xl">Overview</h1>
                                <p className="text-muted text-sm">Real-time data visualization</p>
                            </div>

                            {/* Main Chart */}
                            <AnalyticsChart
                                data={chartData}
                                filter={chartFilter}
                                setFilter={setChartFilter}
                                mainStat={analytics?.["Total Reach"] || '0'}
                                subStat={analytics?.["Reach (Per Device)"] || '0'}
                                analytics={analytics}
                                isDark={isDark}
                                windowWidth={windowWidth}
                            />


                        </div>

                    ) : (
                        <div className="flex flex-col gap-8 pb-12 lg:pr-4">
                            <div className="flex flex-col gap-1">
                                <h1 className="heading-lg m-0 text-2xl sm:text-3xl">Portal HQ</h1>
                                <p className="text-muted text-sm">Configure and monitor entrance campaigns</p>
                            </div>

                            <div className="grid grid-cols-1 xl:grid-cols-12 gap-8 items-start">
                                <div className="xl:col-span-4">
                                    <div className="glass-panel p-8">
                                        <h3 className="heading-sm mb-6">Create Portal</h3>
                                        <div className="flex flex-col gap-5">
                                            <div className="flex flex-col gap-2">
                                                <label className="text-[10px] font-bold uppercase text-muted">Recipient Name</label>
                                                <input
                                                    type="text"
                                                    className="input-field"
                                                    value={name}
                                                    onChange={(e) => setName(e.target.value)}
                                                    placeholder="e.g. Google"
                                                />
                                            </div>
                                            <div className="flex flex-col gap-2">
                                                <label className="text-[10px] font-bold uppercase text-muted">Portal Context</label>
                                                <input
                                                    type="text"
                                                    className="input-field"
                                                    value={forField}
                                                    onChange={(e) => setForField(e.target.value)}
                                                    placeholder="e.g. Design Role"
                                                />
                                            </div>
                                            <button
                                                onClick={generateCode}
                                                disabled={!name.trim() || !forField.trim()}
                                                className="btn btn-primary w-full py-4 mt-2"
                                            >
                                                Generate Portal
                                            </button>
                                        </div>
                                    </div>
                                </div>

                                {/* Link Explorer */}
                                <div className="xl:col-span-8 flex flex-col gap-6">
                                    <div className="flex items-center justify-between px-1">
                                        <span className="text-[10px] font-black opacity-30 uppercase tracking-[0.2em]">Active Portals ({generatedLinks.length})</span>
                                    </div>
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                        {generatedLinks.length === 0 ? (
                                            <div className="col-span-full p-12 text-center text-sec glass-surface rounded-3xl border-dashed">
                                                Empty portal list.
                                            </div>
                                        ) : (
                                            generatedLinks.map((link) => (
                                                <motion.div
                                                    key={link.id}
                                                    layout
                                                    className="glass-panel p-6 flex flex-col gap-4 relative"
                                                    onClick={() => setActivityLink(link)}
                                                    style={{ cursor: 'pointer' }}
                                                >
                                                    <div className="flex justify-between items-start">
                                                        <div className="flex flex-col">
                                                            <h3 className="font-bold text-lg leading-tight">{link.name}</h3>
                                                            <p className="text-xs text-muted mt-0.5">{link.forField}</p>
                                                        </div>
                                                        <div className="flex items-center gap-2">
                                                            <div className="flex items-center gap-1.5 px-2 py-1 bg-white/5 rounded-lg border border-white/5" title="Total Clicks">
                                                                <MousePointer2 size={12} className="text-muted" />
                                                                <span className="text-[10px] font-bold text-muted">{link.counts}</span>
                                                            </div>
                                                            <button
                                                                onClick={(e) => { e.stopPropagation(); handleMenuClick(e, link.id); }}
                                                                className="p-1 text-muted hover:text-primary transition-colors"
                                                            >
                                                                <MoreVertical size={20} />
                                                            </button>
                                                        </div>
                                                    </div>

                                                    <div className="flex items-center gap-3 p-3 bg-black/10 rounded-xl border border-white/5">
                                                        <code className="text-[10px] font-mono text-muted flex-1 truncate">{link.fullLink}</code>
                                                        <button
                                                            onClick={(e) => { e.stopPropagation(); copyToClipboard(link.fullLink, link.id); }}
                                                            className="text-muted hover:text-primary transition-colors"
                                                        >
                                                            {copied === link.id ? <Check size={16} className="text-success" /> : <Copy size={16} />}
                                                        </button>
                                                    </div>

                                                    <div className="flex items-center justify-between mt-2">
                                                        <button
                                                            onClick={(e) => { e.stopPropagation(); toggleInterviewerMode(link.id, link.interviewer); }}
                                                            className={`btn !py-2 !px-2 sm:!px-4 !text-[10px] flex items-center gap-2 transition-all ${link.interviewer
                                                                ? 'bg-secondary/10 text-secondary border border-secondary/20 hover:bg-secondary/20'
                                                                : 'bg-white/5 text-muted border border-white/10 hover:bg-white/10'
                                                                }`}
                                                            title={link.interviewer ? 'Interviewer On' : 'Interviewer Off'}
                                                        >
                                                            <Users size={14} />
                                                            <span className="hidden sm:inline">{link.interviewer ? 'Interviewer On' : 'Interviewer Off'}</span>
                                                        </button>

                                                        <button
                                                            className="btn btn-primary !py-2 !px-3 sm:!px-6 !text-[10px] flex items-center gap-2"
                                                            title="Analyze"
                                                        >
                                                            <Activity size={14} />
                                                            <span className="hidden sm:inline">Analyze</span>
                                                        </button>
                                                    </div>
                                                </motion.div>
                                            ))
                                        )}
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            </div>

            {/* Options Menu */}
            {activeMenu && createPortal(
                <>
                    <div className="fixed inset-0 z-[999]" onClick={() => setActiveMenu(null)} />
                    <div className="fixed z-[1000] glass-panel min-w-[170px] p-2 animate-pop flex flex-col gap-2 shadow-2xl border border-white/10"
                        style={{ top: `${menuPos.top}px`, right: `${menuPos.right}px`, borderRadius: '16px' }}>
                        <button onClick={(e) => {
                            e.stopPropagation();
                            const link = generatedLinks.find(l => l.id === activeMenu);
                            if (link) setActivityLink(link);
                            setActiveMenu(null);
                        }}
                            className="w-full text-left flex items-center gap-2 bg-transparent border-none cursor-pointer rounded-lg text-sm p-2.5 transition-colors"
                            style={{ color: 'var(--text-primary)', fontFamily: "'Inter', sans-serif" }}
                            onMouseEnter={(e) => e.currentTarget.style.backgroundColor = isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.05)'}
                            onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}>
                            <Activity size={16} /> Analysis
                        </button>
                        <button onClick={(e) => {
                            e.stopPropagation();
                            const link = generatedLinks.find(l => l.id === activeMenu);
                            if (link) handleEditClick(link);
                        }}
                            className="w-full text-left flex items-center gap-2 bg-transparent border-none cursor-pointer rounded-lg text-sm p-2.5 transition-colors"
                            style={{ color: 'var(--text-primary)', fontFamily: "'Inter', sans-serif" }}
                            onMouseEnter={(e) => e.currentTarget.style.backgroundColor = isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.05)'}
                            onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}>
                            <Edit2 size={16} /> Edit
                        </button>
                        <div className="mx-2 my-1 h-[1px]" style={{ backgroundColor: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)' }} />
                        <button onClick={(e) => {
                            e.stopPropagation();
                            setConfirmConfig({
                                isOpen: true,
                                title: 'Reset Analytics',
                                message: 'Are you sure you want to completely reset this link\'s analytics? This cannot be undone.',
                                type: 'warning',
                                onConfirm: () => handleResetLinkAnalysis(activeMenu)
                            });
                        }}
                            className="w-full text-left flex items-center gap-2 bg-transparent border-none cursor-pointer rounded-lg text-sm p-2.5 transition-colors"
                            style={{ color: 'rgb(249, 115, 22)', fontFamily: "'Inter', sans-serif" }}
                            onMouseEnter={(e) => e.currentTarget.style.backgroundColor = isDark ? 'rgba(249, 115, 22, 0.1)' : 'rgba(249, 115, 22, 0.05)'}
                            onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}>
                            <RefreshCcw size={16} /> Reset Analytics
                        </button>
                        <div className="mx-2 my-1 h-[1px]" style={{ backgroundColor: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)' }} />
                        <button onClick={(e) => {
                            e.stopPropagation();
                            setConfirmConfig({
                                isOpen: true,
                                title: 'Remove Portal Link',
                                message: 'Are you sure you want to remove this portal? This will permanently delete it.',
                                type: 'danger',
                                onConfirm: () => handleDeleteLink(activeMenu)
                            });
                        }}
                            className="w-full text-left flex items-center gap-2 bg-transparent border-none cursor-pointer rounded-lg text-sm p-2.5 transition-colors"
                            style={{ color: 'rgb(239, 68, 68)', fontFamily: "'Inter', sans-serif" }}
                            onMouseEnter={(e) => e.currentTarget.style.backgroundColor = isDark ? 'rgba(239, 68, 68, 0.1)' : 'rgba(239, 68, 68, 0.05)'}
                            onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}>
                            <Trash2 size={16} /> Remove
                        </button>
                    </div>
                </>,
                document.body
            )}

            {/* Edit Modal */}
            {editingLink && createPortal(
                <div className="fixed inset-0 z-[99999] flex items-center justify-center p-4 bg-black/40 backdrop-blur-md animate-fade-in"
                    onClick={() => setEditingLink(null)}>
                    <div className="glass-panel w-full max-w-[500px] overflow-hidden animate-scale-in shadow-2xl"
                        onClick={e => e.stopPropagation()}>
                        <div className="p-8 border-b border-[var(--card-border)] flex justify-between items-center">
                            <h2 className="heading-sm m-0">Edit Link Details</h2>
                        </div>
                        <div className="p-8 flex flex-col gap-6">
                            <div className="flex flex-col gap-2">
                                <label className="input-label m-0">Name</label>
                                <input type="text" className="input-field" value={editName}
                                    onChange={(e) => setEditName(e.target.value)} />
                            </div>
                            <div className="flex flex-col gap-2">
                                <label className="input-label m-0">For</label>
                                <input type="text" className="input-field" value={editFor}
                                    onChange={(e) => setEditFor(e.target.value)} />
                            </div>
                            <div className="flex justify-end gap-3 pt-4">
                                <button onClick={() => setEditingLink(null)} className="btn btn-secondary !px-6 !py-3">Cancel</button>
                                <button onClick={handleSaveEdit} disabled={!editName.trim() || !editFor.trim()}
                                    className="btn btn-primary !px-8 !py-3">Save Changes</button>
                            </div>
                        </div>
                    </div>
                </div>,
                document.body
            )}

            <ActivityModal
                isOpen={!!activityLink}
                onClose={() => setActivityLink(null)}
                onReset={() => {
                    if (activityLink) {
                        setConfirmConfig({
                            isOpen: true,
                            title: 'Reset link Analytics',
                            message: 'Are you sure you want to completely reset this link\'s analytics? This cannot be undone.',
                            type: 'warning',
                            onConfirm: () => handleResetLinkAnalysis(activityLink.id)
                        });
                    }
                }}
                data={activityLink?.recCLI || ''}
                linkName={activityLink?.name || 'Analytics'}
            />

            {alert?.show && (
                <Alert
                    type={alert.type}
                    message={alert.message}
                    onClose={() => hideAlert()}
                    duration={alert.duration ?? 4000}
                />
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

export default DLinks;
