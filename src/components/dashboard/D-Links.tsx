import { useState, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { Copy, Check, RefreshCw, ExternalLink, MoreVertical, Edit2, Trash2, Activity, Clock, MousePointer2, Briefcase, TrendingUp, Users, Eye, Calendar } from 'lucide-react';
import anime from 'animejs';
import { motion } from 'motion/react';
import { doc, onSnapshot, getDoc, updateDoc, deleteField } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import Loader from '../reactbits/Loader';
import Alert, { AlertType } from '../Alert';

interface AnalyticsData {
    TotalViews: number;
    UniqueViews: number;
    Daily: Record<string, { total: number; unique: number }>;
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
}

// Sparkline/Analysis Chart Component
const VisitorChart = ({ dailyData, isDark }: { dailyData: Record<string, { total: number; unique: number }>, isDark: boolean }) => {
    const dataPoints = useMemo(() => {
        const sortedDates = Object.keys(dailyData).sort();
        // Get last 14 days or all if less
        const slice = sortedDates.slice(-14);
        return slice.map(date => ({
            date: date.split('-').slice(1).join('/'), // MM/DD
            total: dailyData[date].total,
            unique: dailyData[date].unique
        }));
    }, [dailyData]);

    if (dataPoints.length < 2) {
        return (
            <div className="h-full flex flex-col items-center justify-center opacity-40">
                <TrendingUp size={32} className="mb-2" />
                <span className="text-sm font-bold uppercase tracking-widest">Collecting Traffic Data...</span>
            </div>
        );
    }

    const maxVal = Math.max(...dataPoints.map(d => d.total), 10);
    const width = 1000;
    const height = 250;
    const padding = 40;

    const getX = (i: number) => (i / (dataPoints.length - 1)) * (width - padding * 2) + padding;
    const getY = (v: number) => height - ((v / maxVal) * (height - padding * 2) + padding);

    // Path for Total Views
    const totalPath = dataPoints.map((d, i) => `${i === 0 ? 'M' : 'L'} ${getX(i)} ${getY(d.total)}`).join(' ');
    const totalArea = `${totalPath} L ${getX(dataPoints.length - 1)} ${height} L ${getX(0)} ${height} Z`;

    // Path for Unique Views
    const uniquePath = dataPoints.map((d, i) => `${i === 0 ? 'M' : 'L'} ${getX(i)} ${getY(d.unique)}`).join(' ');

    return (
        <div className="relative w-full h-[300px] mt-4">
            <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-full overflow-visible">
                <defs>
                    <linearGradient id="totalGradient" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="rgba(59, 130, 246, 0.3)" />
                        <stop offset="100%" stopColor="rgba(59, 130, 246, 0.0)" />
                    </linearGradient>
                </defs>

                {/* Grid Lines */}
                {[0, 0.25, 0.5, 0.75, 1].map((p, i) => (
                    <line
                        key={i}
                        x1={padding}
                        y1={getY(maxVal * p)}
                        x2={width - padding}
                        y2={getY(maxVal * p)}
                        stroke={isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)'}
                        strokeDasharray="4 4"
                    />
                ))}

                {/* Areas */}
                <motion.path
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ duration: 1 }}
                    d={totalArea}
                    fill="url(#totalGradient)"
                />

                {/* Lines */}
                <motion.path
                    initial={{ pathLength: 0, opacity: 0 }}
                    animate={{ pathLength: 1, opacity: 1 }}
                    transition={{ duration: 1.5, ease: "easeInOut" }}
                    d={totalPath}
                    fill="none"
                    stroke="rgb(59, 130, 246)"
                    strokeWidth="4"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                />

                <motion.path
                    initial={{ pathLength: 0, opacity: 0 }}
                    animate={{ pathLength: 1, opacity: 0.6 }}
                    transition={{ duration: 2, ease: "easeInOut", delay: 0.5 }}
                    d={uniquePath}
                    fill="none"
                    stroke="#8b5cf6"
                    strokeWidth="3"
                    strokeDasharray="8 6"
                    strokeLinecap="round"
                />

                {/* Points */}
                {dataPoints.map((d, i) => (
                    <g key={i} className="group/point">
                        <circle
                            cx={getX(i)}
                            cy={getY(d.total)}
                            r="6"
                            fill={isDark ? "#121212" : "#fff"}
                            stroke="rgb(59, 130, 246)"
                            strokeWidth="3"
                            className="transition-all duration-300 group-hover/point:r-8"
                        />
                        <text
                            x={getX(i)}
                            y={height - 5}
                            textAnchor="middle"
                            className="text-[14px] fill-current opacity-40 font-bold"
                            style={{ fill: isDark ? '#fff' : '#000' }}
                        >
                            {d.date}
                        </text>
                    </g>
                ))}
            </svg>
        </div>
    );
};

const ActivityModal = ({ isOpen, onClose, data, linkName }: { isOpen: boolean; onClose: () => void; data: string; isDark: boolean; linkName: string }) => {
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
                        views: (verboseViews || conciseViews || '0') + ' views'
                    };
                }
                return { id: '?', time: '0m 0s', views: '0 views' };
            }).filter(p => p.id !== '?') : [];

            return { total, stack, contact, projects };
        } catch (e) {
            console.error("Parse error", e);
            return null;
        }
    };

    const stats = parseData(data);

    return createPortal(
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
            style={{ backgroundColor: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(12px)' }}
            onClick={onClose}>
            <div className="glass-panel-deep w-full max-w-[500px] p-8 flex flex-col gap-8 animate-scale-in relative overflow-hidden max-h-[90vh]"
                onClick={e => e.stopPropagation()}>

                <div className="flex justify-between items-start">
                    <div className="flex flex-col gap-1.5 flex-1 min-w-0">
                        <h2 className="heading-lg m-0 truncate" style={{ letterSpacing: '-0.03em' }}>{linkName}</h2>
                        <p className="text-muted opacity-80 text-sm m-0">Live visitor session analytics</p>
                    </div>
                </div>

                {!stats ? (
                    <div className="text-center py-12 text-muted opacity-60">
                        No session data detected yet.
                    </div>
                ) : (
                    <div className="overflow-y-auto flex flex-col gap-10 pr-1 custom-scrollbar">
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                            <div className="glass-surface p-5 text-center flex flex-col items-center gap-2.5">
                                <Clock size={20} style={{ color: 'var(--info)' }} />
                                <div className="heading-md m-0">{stats.total}</div>
                                <div className="text-muted text-xs uppercase font-bold tracking-widest" style={{ fontSize: '0.65rem' }}>Total Time</div>
                            </div>
                            <div className="glass-surface p-5 text-center flex flex-col items-center gap-2.5">
                                <Briefcase size={20} style={{ color: '#8b5cf6' }} />
                                <div className="heading-md m-0">{stats.stack}</div>
                                <div className="text-muted text-xs uppercase font-bold tracking-widest" style={{ fontSize: '0.65rem' }}>Stack Time</div>
                            </div>
                            <div className="glass-surface p-5 text-center flex flex-col items-center gap-2.5">
                                <MousePointer2 size={20} style={{ color: 'var(--success)' }} />
                                <div className="heading-md m-0">{stats.contact}</div>
                                <div className="text-muted text-xs uppercase font-bold tracking-widest" style={{ fontSize: '0.65rem' }}>Contacts</div>
                            </div>
                        </div>

                        <div className="flex flex-col gap-5">
                            <h3 className="heading-sm flex items-center gap-3 m-0">
                                <Activity size={18} style={{ color: 'var(--warning)' }} /> Project Engagement
                            </h3>
                            <div className="flex flex-col gap-2.5 max-h-[250px] overflow-y-auto custom-scrollbar pr-1">
                                {stats.projects.length === 0 ? (
                                    <div className="glass-surface p-6 text-center border-dashed opacity-60 italic text-sm">
                                        No project interactions recorded.
                                    </div>
                                ) : (
                                    stats.projects.map((p, i) => (
                                        <div key={i} className="glass-surface flex justify-between items-center p-4 px-6 transition-all hover:translate-x-1">
                                            <div className="flex flex-col gap-1">
                                                <span className="font-bold text-sm text-primary">{p.id}</span>
                                                <span className="text-muted text-xs opacity-80">{p.views}</span>
                                            </div>
                                            <span className="font-bold text-xs p-2.5 px-4 rounded-xl"
                                                style={{ color: 'var(--info)', backgroundColor: 'rgba(59, 130, 246, 0.1)' }}>
                                                {p.time}
                                            </span>
                                        </div>
                                    ))
                                )}
                            </div>
                        </div>
                    </div>
                )}

                <button onClick={onClose} className="btn btn-primary w-full mt-2 py-4 rounded-2xl shadow-lg">
                    Close Analytics
                </button>
            </div>
        </div>,
        document.body
    );
};

const DLinks = () => {
    const [isLoading, setIsLoading] = useState(false);
    const [isDark, setIsDark] = useState(false);
    const [analytics, setAnalytics] = useState<AnalyticsData | null>(null);

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
    const [alert, setAlert] = useState<{ show: boolean; type: AlertType; message: string }>({
        show: false,
        type: 'success',
        message: ''
    });

    useEffect(() => {
        const checkTheme = () => setIsDark(document.documentElement.classList.contains('dark'));
        checkTheme();
        const observer = new MutationObserver(checkTheme);
        observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
        return () => {
            observer.disconnect();
        };
    }, []);

    useEffect(() => {
        const unsubLinks = onSnapshot(doc(db, 'Settings', 'Views'), (docSnap) => {
            if (docSnap.exists()) {
                const data = docSnap.data();
                const linksArray: GeneratedLink[] = [];
                Object.keys(data).forEach(key => {
                    if (!isNaN(parseInt(key))) {
                        const item = data[key];
                        linksArray.push({
                            id: key,
                            name: item.Name,
                            forField: item.For,
                            code: item.Code || item.Rec_CLI,
                            fullLink: `${window.location.origin}${import.meta.env.BASE_URL}${item.Code || item.Rec_CLI || ''}`,
                            viewed: item.Views > 0,
                            counts: item.Views || 0,
                            createdAt: new Date(),
                            recCLI: item.Rec_CLI || ''
                        });
                    }
                });
                linksArray.sort((a, b) => parseInt(b.id) - parseInt(a.id));
                setGeneratedLinks(linksArray);
            }
        });

        const unsubAnalytics = onSnapshot(doc(db, 'Settings', 'Analytics'), (docSnap) => {
            if (docSnap.exists()) {
                setAnalytics(docSnap.data() as AnalyticsData);
            }
        });

        return () => {
            unsubLinks();
            unsubAnalytics();
        };
    }, []);

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
            const docRef = doc(db, 'Settings', 'Views');
            const docSnap = await getDoc(docRef);
            let nextId = "1";
            if (docSnap.exists()) {
                const data = docSnap.data();
                const keys = Object.keys(data).map(k => parseInt(k)).filter(k => !isNaN(k));
                if (keys.length > 0) nextId = (Math.max(...keys) + 1).toString();
            }
            const payload = { Code: code, For: forField.trim(), Name: name.trim(), "Rec_CLI": "", Views: 0 };
            await updateDoc(docRef, { [nextId]: payload });
            setName('');
            setForField('');
            setAlert({ show: true, type: 'success', message: 'Campaign link generated successfully!' });
        } catch (error) {
            setAlert({ show: true, type: 'error', message: 'Failed to generate link. Check your connection.' });
        } finally {
            setIsLoading(false);
        }
    };

    const copyToClipboard = async (link: string, id: string) => {
        try {
            await navigator.clipboard.writeText(link);
            setCopied(id);
            setTimeout(() => setCopied(null), 2000);
        } catch (err) {
            setAlert({ show: true, type: 'error', message: 'Failed to copy to clipboard.' });
        }
    };

    const handleDeleteLink = async (id: string) => {
        if (!id) return;
        setActiveMenu(null);
        try {
            const docRef = doc(db, 'Settings', 'Views');
            await updateDoc(docRef, { [id]: deleteField() });
        } catch (error) {
            setAlert({ show: true, type: 'error', message: 'Failed to delete link.' });
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
            const docRef = doc(db, 'Settings', 'Views');
            await updateDoc(docRef, {
                [`${editingLink.id}.Name`]: editName.trim(),
                [`${editingLink.id}.For`]: editFor.trim()
            });
            setEditingLink(null);
            setEditName('');
            setEditFor('');
        } catch (error) {
            setAlert({ show: true, type: 'error', message: 'Failed to update link details.' });
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
        <div className="links-section-container flex flex-row gap-8 h-full opacity-0 overflow-hidden">
            <Loader isOpen={isLoading} isFullScreen={true} />

            {/* Left Column: Analysis Magic Place */}
            <div className="flex-[1.4] flex flex-col gap-8 overflow-y-auto custom-scrollbar pr-2 pb-12">

                {/* Site Pulse Header */}
                <div className="flex items-center justify-between">
                    <div>
                        <h1 className="heading-lg m-0 flex items-center gap-3">
                            <Activity className="text-blue-500 animate-pulse" size={32} />
                            Site Analysis
                        </h1>
                        <p className="text-muted mt-1">Real-time visitor patterns and engagement</p>
                    </div>
                </div>

                {/* Counter Cards */}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-2 xl:grid-cols-3 gap-6">
                    <div className="glass-panel p-8 relative overflow-hidden group">
                        <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
                            <Eye size={48} />
                        </div>
                        <div className="flex flex-col gap-2">
                            <span className="text-xs uppercase font-black tracking-widest text-blue-500">Total Reach</span>
                            <span className="text-4xl font-black text-primary">{analytics?.TotalViews?.toLocaleString() || '0'}</span>
                            <div className="flex items-center gap-2 mt-4 text-xs font-bold text-muted">
                                <span className="bg-blue-500/10 text-blue-500 px-2 py-1 rounded">GLOBAL VIEWS</span>
                                <span>Impressions on site</span>
                            </div>
                        </div>
                    </div>

                    <div className="glass-panel p-8 relative overflow-hidden group">
                        <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
                            <Users size={48} />
                        </div>
                        <div className="flex flex-col gap-2">
                            <span className="text-xs uppercase font-black tracking-widest text-purple-500">Unique Souls</span>
                            <span className="text-4xl font-black text-primary">{analytics?.UniqueViews?.toLocaleString() || '0'}</span>
                            <div className="flex items-center gap-2 mt-4 text-xs font-bold text-muted">
                                <span className="bg-purple-500/10 text-purple-500 px-2 py-1 rounded">IDENTITY TRACKED</span>
                                <span>Unique device count</span>
                            </div>
                        </div>
                    </div>

                    <div className="glass-panel p-8 relative overflow-hidden group lg:hidden xl:flex">
                        <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
                            <Calendar size={48} />
                        </div>
                        <div className="flex flex-col gap-2">
                            <span className="text-xs uppercase font-black tracking-widest text-emerald-500">Today's Pulse</span>
                            <span className="text-4xl font-black text-primary">{analytics?.Daily?.[new Date().toISOString().split('T')[0]]?.total || '0'}</span>
                            <div className="flex items-center gap-2 mt-4 text-xs font-bold text-muted">
                                <span className="bg-emerald-500/10 text-emerald-500 px-2 py-1 rounded">LIVE TRAFFIC</span>
                                <span>Views in 24h</span>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Analysis Chart */}
                <div className="glass-panel p-10 flex flex-col gap-4">
                    <div className="flex items-center justify-between mb-2">
                        <div>
                            <h3 className="heading-sm m-0">Traffic Trends</h3>
                            <p className="text-xs text-muted opacity-60">Visualizing view patterns over the last 14 days</p>
                        </div>
                        <div className="flex gap-4">
                            <div className="flex items-center gap-2 text-xs font-bold text-blue-500">
                                <div className="w-3 h-3 rounded-full bg-blue-500" /> Total
                            </div>
                            <div className="flex items-center gap-2 text-xs font-bold text-purple-500">
                                <div className="w-3 h-3 rounded-full bg-purple-500" /> Unique
                            </div>
                        </div>
                    </div>
                    <VisitorChart dailyData={analytics?.Daily || {}} isDark={isDark} />
                </div>

                {/* Link Generator Area - Re-styled */}
                <div className="glass-panel p-10 border-dashed border-2">
                    <div className="flex flex-col gap-1 mb-6">
                        <h3 className="heading-sm m-0">Campaign Architect</h3>
                        <p className="text-xs text-muted">Craft new entrance points for analysis</p>
                    </div>
                    <div className="flex flex-col sm:flex-row gap-6 mb-8">
                        <div className="flex-1 min-w-[200px] flex flex-col gap-2.5">
                            <label className="input-label m-0">Target Name</label>
                            <input
                                type="text"
                                className="input-field"
                                value={name}
                                onChange={(e) => setName(e.target.value)}
                                placeholder="Client or Source Name"
                            />
                        </div>
                        <div className="flex-1 min-w-[200px] flex flex-col gap-2.5">
                            <label className="input-label m-0">Campaign Context</label>
                            <input
                                type="text"
                                className="input-field"
                                value={forField}
                                onChange={(e) => setForField(e.target.value)}
                                placeholder="e.g. Portfolio Review, Job Req"
                            />
                        </div>
                    </div>

                    <button
                        onClick={generateCode}
                        disabled={!name.trim() || !forField.trim()}
                        className="btn btn-primary w-full px-8 py-5 rounded-2xl shadow-xl shadow-blue-500/10 group transition-all"
                    >
                        <RefreshCw size={20} className="group-active:rotate-180 transition-transform duration-500" />
                        Initialize Campaign
                    </button>
                </div>
            </div>

            {/* Right Column: Mini Link Browser */}
            <div className="flex-1 flex flex-col gap-6 overflow-hidden">
                <div className="flex items-center justify-between">
                    <h3 className="heading-sm m-0">Active Portals</h3>
                    <span className="text-xs font-mono opacity-40">{generatedLinks.length} TOTAL</span>
                </div>

                <div className="flex-1 overflow-y-auto custom-scrollbar pr-2 flex flex-col gap-3">
                    {generatedLinks.length === 0 ? (
                        <div className="p-12 text-center text-sec glass-surface rounded-3xl border-dashed">
                            Empty portal list.
                        </div>
                    ) : (
                        generatedLinks.map((link) => (
                            <div key={link.id}
                                onClick={() => setActivityLink(link)}
                                className="glass-panel p-4 flex flex-col gap-4 group cursor-pointer hover:border-blue-500/30 transition-all border border-transparent"
                            >
                                <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-3">
                                        <div className="w-8 h-8 rounded-lg bg-blue-500/10 flex items-center justify-center">
                                            <ExternalLink size={14} className="text-blue-500" />
                                        </div>
                                        <div className="flex flex-col">
                                            <span className="font-bold text-sm truncate max-w-[150px]">{link.name}</span>
                                            <span className="text-[10px] opacity-40 uppercase tracking-tighter">{link.forField}</span>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-3">
                                        <div className="flex flex-col items-end">
                                            <span className="font-black text-blue-500 text-lg">{link.counts}</span>
                                            <span className="text-[8px] font-bold opacity-30 mt-[-4px]">HITS</span>
                                        </div>
                                        <button onClick={(e) => { e.stopPropagation(); handleMenuClick(e, link.id); }}
                                            className="p-1.5 opacity-0 group-hover:opacity-100 hover:bg-white/10 rounded-lg transition-all">
                                            <MoreVertical size={16} />
                                        </button>
                                    </div>
                                </div>
                                <div className="flex items-center gap-2">
                                    <code className="flex-1 p-2 bg-black/10 dark:bg-black/40 rounded-lg text-[10px] font-mono truncate">
                                        {link.fullLink}
                                    </code>
                                    <button onClick={(e) => { e.stopPropagation(); copyToClipboard(link.fullLink, link.id); }}
                                        className="p-2 hover:bg-blue-500/10 text-blue-500 rounded-lg transition-all">
                                        {copied === link.id ? <Check size={14} /> : <Copy size={14} />}
                                    </button>
                                </div>
                            </div>
                        ))
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
                isDark={isDark}
                linkName={activityLink?.name || 'Analytics'}
            />

            {alert.show && (
                <Alert
                    type={alert.type}
                    message={alert.message}
                    onClose={() => setAlert(prev => ({ ...prev, show: false }))}
                />
            )}
        </div>
    );
};

export default DLinks;
