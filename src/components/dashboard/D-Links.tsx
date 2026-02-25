import { useState, useEffect, useRef, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { Copy, Check, MoreVertical, Edit2, Trash2, Activity, Users, Plus, Clock, Briefcase, MousePointer2, Eye, Globe } from 'lucide-react';
import anime from 'animejs';
import { motion } from 'framer-motion';
import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip, CartesianGrid, TooltipProps } from 'recharts';
import { doc, onSnapshot, updateDoc, collection, getDocs, setDoc, deleteDoc } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import Loader from '../reactbits/Loader';
import Alert from '../Alert';
import useSafeAlert from '../../hooks/useSafeAlert';

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
    fullDate: string;
    prevValue?: number;
}



const ActivityModal = ({ isOpen, onClose, data, linkName }: { isOpen: boolean; onClose: () => void; data: string; linkName: string }) => {
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
                    <h2 className="heading-sm m-0">{linkName} Analytics</h2>
                    <button onClick={onClose} className="p-2 hover:bg-white/10 rounded-lg transition-colors">
                        <Plus size={20} className="rotate-45" />
                    </button>
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

const CustomTooltip = ({ active, payload }: TooltipProps<number, string>) => {
    if (active && payload && payload.length) {
        const item = payload[0].payload as ChartDataPoint;
        return (
            <div className="p-4 rounded-2xl border border-white/10 shadow-2xl backdrop-blur-xl bg-black/80">
                <div className="text-[10px] font-bold text-muted uppercase tracking-widest mb-2">{item.fullDate}</div>
                <div className="flex flex-col gap-1.5">
                    <div className="flex items-center gap-2">
                        <div className="w-1.5 h-1.5 rounded-full bg-blue-500" />
                        <span className="text-sm font-bold text-primary">{payload[0].value?.toLocaleString()} <span className="text-muted font-normal text-xs uppercase tracking-tight ml-1">Views</span></span>
                    </div>
                    {payload[1] && (
                        <div className="flex items-center gap-2 opacity-40">
                            <div className="w-1.5 h-1.5 rounded-full bg-white/40" />
                            <span className="text-xs font-bold text-primary">{payload[1].value?.toLocaleString()} <span className="text-muted font-normal uppercase tracking-tight ml-1">Prev</span></span>
                        </div>
                    )}
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

const CustomTick = ({ x, y, payload, index, data }: CustomTickProps) => {
    const item = data[index];
    if (!item) return null;
    return (
        <g transform={`translate(${x},${y})`}>
            <text x={0} y={0} textAnchor="middle" className="fill-muted !text-[9px] font-bold uppercase tracking-widest">{payload.value}</text>
            <text x={0} y={14} textAnchor="middle" className="fill-primary/40 !text-[11px] font-black">{item.dateNum}</text>
        </g>
    );
};

const AnalyticsChart = ({ data, filter, setFilter, mainStat, subStat }: {
    data: ChartDataPoint[];
    filter: 'daily' | 'weekly' | 'monthly';
    setFilter: (f: 'daily' | 'weekly' | 'monthly') => void;
    mainStat: string | number;
    subStat: string | number;
}) => {
    return (
        <div className="glass-panel p-8 flex flex-col gap-10 bg-black/40 border border-white/5 overflow-hidden">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-8">
                <div className="flex gap-12">
                    <div className="flex flex-col">
                        <div className="text-4xl md:text-5xl font-black text-primary tracking-tighter">{mainStat}</div>
                        <div className="text-[10px] font-bold text-muted uppercase tracking-[0.2em] mt-2">Total Reach</div>
                    </div>
                    <div className="flex flex-col">
                        <div className="text-4xl md:text-5xl font-black text-primary tracking-tighter flex items-center gap-3">
                            {subStat}
                            <span className="text-[9px] font-black text-success flex items-center gap-1 bg-success/10 px-2 py-0.5 rounded-full border border-success/20">
                                <Plus size={8} className="text-success" /> 22%
                            </span>
                        </div>
                        <div className="text-[10px] font-bold text-muted uppercase tracking-[0.2em] mt-2">Device Reach</div>
                    </div>
                </div>

                <div className="flex bg-white/5 p-1 rounded-full border border-white/5 self-end sm:self-auto backdrop-blur-md">
                    {(['daily', 'weekly', 'monthly'] as const).map(f => (
                        <button
                            key={f}
                            onClick={(e) => { e.stopPropagation(); setFilter(f); }}
                            className={`px-5 py-2 rounded-full text-[10px] font-black uppercase tracking-widest transition-all cursor-pointer ${filter === f
                                ? 'bg-blue-500 text-white shadow-lg shadow-blue-500/30'
                                : 'text-muted hover:text-primary hover:bg-white/5'
                                }`}
                        >
                            {f}
                        </button>
                    ))}
                </div>
            </div>

            <div className="w-full h-[320px] md:h-[400px] mt-2 -ml-6 -mr-6" style={{ width: 'calc(100% + 1.5rem)' }}>
                <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={data} margin={{ top: 20, right: 30, left: 10, bottom: 0 }}>
                        <defs>
                            <linearGradient id="colorValue" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="5%" stopColor="#3B82F6" stopOpacity={0.3} />
                                <stop offset="95%" stopColor="#3B82F6" stopOpacity={0} />
                            </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="0 0" vertical={false} stroke="rgba(255,255,255,0.03)" />
                        <XAxis
                            dataKey="label"
                            axisLine={false}
                            tickLine={false}
                            dy={15}
                            interval={filter === 'daily' ? 1 : 0}
                            // eslint-disable-next-line @typescript-eslint/no-explicit-any
                            tick={(props: any) => <CustomTick {...props} data={data} />}
                        />
                        <YAxis hide />
                        <Tooltip content={CustomTooltip} cursor={{ stroke: 'rgba(59, 130, 246, 0.2)', strokeWidth: 2 }} />
                        <Area
                            type="monotone"
                            dataKey="prevValue"
                            stroke="#ffffff"
                            fill="transparent"
                            strokeWidth={2}
                            strokeOpacity={0.05}
                            strokeDasharray="4 4"
                            dot={false}
                            activeDot={false}
                        />
                        <Area
                            type="monotone"
                            dataKey="value"
                            stroke="#3B82F6"
                            fillOpacity={1}
                            fill="url(#colorValue)"
                            strokeWidth={4}
                            dot={{ r: 4, fill: '#3B82F6', strokeWidth: 2, stroke: '#000', opacity: 1, strokeOpacity: 1 }}
                            activeDot={{ r: 8, fill: '#3B82F6', strokeWidth: 4, stroke: '#fff' }}
                            animationDuration={1000}
                            animationEasing="ease-in-out"
                        />
                    </AreaChart>
                </ResponsiveContainer>
            </div>
        </div>
    );
};

const DLinks = () => {
    const [isLoading, setIsLoading] = useState(false);
    const [isDark, setIsDark] = useState(false);
    const [analytics, setAnalytics] = useState<AnalyticsData | null>(null);
    const [dailyMap, setDailyMap] = useState<Record<string, number | { total: number }> | null>(null);

    // Convert dailyMap to sorted numeric series (ascending by date key)
    const dailySeries = useMemo(() => {
        if (!dailyMap) return [] as { date: string; value: number }[];
        try {
            const entries = Object.entries(dailyMap)
                .filter(([k]) => k && k !== 'next')
                .map(([k, v]) => {
                    const val = typeof v === 'number' ? v : (v && typeof v === 'object' ? (v as { total: number }).total : 0);
                    return { date: k, value: Number(val) || 0 };
                });
            entries.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
            return entries;
        } catch {
            return [] as { date: string; value: number }[];
        }
    }, [dailyMap]);

    const [chartFilter, setChartFilter] = useState<'daily' | 'weekly' | 'monthly'>('daily');

    const chartData = useMemo(() => {
        if (!dailySeries || dailySeries.length === 0) return [];

        let aggregated: ChartDataPoint[] = [];

        if (chartFilter === 'daily') {
            aggregated = dailySeries.slice(-14).map(s => {
                const d = new Date(s.date);
                return {
                    label: d.toLocaleDateString('en-US', { weekday: 'short' }).toUpperCase(),
                    dateNum: d.getDate(),
                    value: s.value,
                    fullDate: s.date
                };
            });
        } else if (chartFilter === 'weekly') {
            const weeks: Record<string, number> = {};
            dailySeries.forEach(s => {
                const d = new Date(s.date);
                const day = d.getDay();
                const diff = d.getDate() - day + (day === 0 ? -6 : 1);
                const monday = new Date(d.setDate(diff));
                const weekKey = monday.toISOString().split('T')[0];
                weeks[weekKey] = (weeks[weekKey] || 0) + s.value;
            });
            aggregated = Object.entries(weeks).map(([date, value]) => {
                const d = new Date(date);
                return {
                    label: `WK ${d.getDate()}`,
                    dateNum: d.getMonth() + 1,
                    value,
                    fullDate: date
                };
            }).sort((a, b) => new Date(a.fullDate).getTime() - new Date(b.fullDate).getTime()).slice(-10);
        } else if (chartFilter === 'monthly') {
            const months: Record<string, number> = {};
            dailySeries.forEach(s => {
                const d = new Date(s.date);
                const monthKey = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
                months[monthKey] = (months[monthKey] || 0) + s.value;
            });
            aggregated = Object.entries(months).map(([key, value]) => {
                const [year, month] = key.split('-');
                const date = new Date(parseInt(year), parseInt(month) - 1, 1);
                return {
                    label: date.toLocaleDateString('en-US', { month: 'short' }).toUpperCase(),
                    dateNum: parseInt(year),
                    value,
                    fullDate: key
                };
            }).sort((a, b) => new Date(a.fullDate).getTime() - new Date(b.fullDate).getTime());
        }

        // Comparison with previous period (e.g. last year same date)
        return aggregated.map(item => {
            const d = new Date(item.fullDate);
            d.setFullYear(d.getFullYear() - 1);
            const prevDateStr = d.toISOString().split('T')[0];
            const prevData = dailyMap?.[prevDateStr];
            const prevValue = prevData ? (typeof prevData === 'number' ? prevData : prevData.total || 0) : 0;
            return { ...item, prevValue };
        });
    }, [dailySeries, chartFilter, dailyMap]);

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
    // hover state removed — using recharts tooltip instead
    const [activeSection, setActiveSection] = useState<'analysis' | 'campaigns'>('analysis');
    const [isTransitioning, setIsTransitioning] = useState(false);
    const directionRef = useRef<number>(1);
    const hasAnimatedRef = useRef<string | null>(null);
    const [revealedSections, setRevealedSections] = useState<Record<string, boolean>>({
        analysis: false,
        campaigns: false
    });

    const [windowWidth, setWindowWidth] = useState(window.innerWidth);
    useEffect(() => {
        const handleResize = () => setWindowWidth(window.innerWidth);
        window.addEventListener('resize', handleResize);
        return () => window.removeEventListener('resize', handleResize);
    }, []);

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

        // Subscribe to Analysis/Daily document (map of dates -> { total, unique })
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
                        <div className="flex flex-col gap-8 pb-12">
                            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-2">
                                <div className="flex flex-col gap-1">
                                    <h1 className="heading-lg m-0 text-2xl sm:text-3xl">Site Pulse</h1>
                                    <p className="text-muted text-sm">Real-time visitor patterns and engagement</p>
                                </div>
                            </div>

                            {/* Counter Cards */}
                            <AnalyticsChart
                                data={chartData}
                                filter={chartFilter}
                                setFilter={setChartFilter}
                                mainStat={analytics?.["Total Reach"] || '0'}
                                subStat={analytics?.["Reach (Per Device)"] || '0'}
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
                            handleDeleteLink(activeMenu);
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
        </div>
    );
};

export default DLinks;
