import { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Copy, Check, RefreshCw, MoreVertical, Edit2, Trash2, Activity, Clock, MousePointer2, Briefcase, TrendingUp, Users, Eye, Calendar, Plus } from 'lucide-react';
import anime from 'animejs';
import { motion } from 'motion/react';
import { doc, onSnapshot, getDoc, updateDoc, deleteField } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import Loader from '../reactbits/Loader';
import Alert from '../Alert';
import useSafeAlert from '../../hooks/useSafeAlert';

interface AnalyticsData {
    Main?: {
        "Total Reach": string;
        "Reach (Per Device)": string;
        "Today's Viewers": string;
    };
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
    interviewer: boolean;
}



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
    const { alert, showAlert, hideAlert } = useSafeAlert(4000);
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
        const unsub = onSnapshot(doc(db, 'Settings', 'Views'), (docSnap) => {
            if (docSnap.exists()) {
                const data = docSnap.data();

                // Process Links
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
                            recCLI: item.Rec_CLI || '',
                            interviewer: !!item.Interviewer
                        });
                    }
                });
                linksArray.sort((a, b) => parseInt(b.id) - parseInt(a.id));
                setGeneratedLinks(linksArray);

                // Process Analytics
                setAnalytics(data as AnalyticsData);
            }
        });

        return () => unsub();
    }, []);

    const toggleInterviewerMode = async (linkId: string, currentState: boolean) => {
        try {
            const nextState = !currentState;
            const docRef = doc(db, 'Settings', 'Views');
            await updateDoc(docRef, { [`${linkId}.Interviewer`]: nextState });
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
            const docRef = doc(db, 'Settings', 'Views');
            await updateDoc(docRef, { [id]: deleteField() });
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
            const docRef = doc(db, 'Settings', 'Views');
            await updateDoc(docRef, {
                [`${editingLink.id}.Name`]: editName.trim(),
                [`${editingLink.id}.For`]: editFor.trim()
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
                    {isExtraSmall ? generatedLinks.length : `Portals (${generatedLinks.length})`}
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
                            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
                                <div className="glass-panel p-6 sm:p-8 relative overflow-hidden group">
                                    <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
                                        <Eye className="w-10 h-10 sm:w-12 sm:h-12" />
                                    </div>
                                    <div className="flex flex-col gap-1 sm:gap-2">
                                        <span className="text-[10px] sm:text-xs uppercase font-black tracking-widest text-blue-500">Total Reach</span>
                                        <div className="flex items-baseline gap-2">
                                            <span className="text-2xl sm:text-4xl font-black text-primary">{analytics?.Main?.["Total Reach"] || '0'}</span>
                                            {/* Simulated Trend */}
                                            <span className="text-[10px] font-bold text-emerald-500 flex items-center bg-emerald-500/10 px-1.5 py-0.5 rounded">
                                                <TrendingUp size={10} className="mr-1" /> +12%
                                            </span>
                                        </div>
                                        <div className="flex items-center gap-2 mt-4 text-[10px] sm:text-xs font-bold text-muted">
                                            <span className="bg-blue-500/10 text-blue-500 px-2 py-1 rounded">GLOBAL VIEWS</span>
                                            <span className="hidden sm:inline">Impressions on site</span>
                                        </div>
                                    </div>
                                </div>

                                <div className="glass-panel p-6 sm:p-8 relative overflow-hidden group">
                                    <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
                                        <Users className="w-10 h-10 sm:w-12 sm:h-12" />
                                    </div>
                                    <div className="flex flex-col gap-1 sm:gap-2">
                                        <span className="text-[10px] sm:text-xs uppercase font-black tracking-widest text-purple-500">Reach (Per Device)</span>
                                        <span className="text-2xl sm:text-4xl font-black text-primary">{analytics?.Main?.["Reach (Per Device)"] || '0'}</span>
                                        <div className="flex items-center gap-2 mt-4 text-[10px] sm:text-xs font-bold text-muted">
                                            <span className="bg-purple-500/10 text-purple-500 px-2 py-1 rounded">IDENTITY TRACKED</span>
                                            <span className="hidden sm:inline">Unique device count</span>
                                        </div>
                                    </div>
                                </div>

                                <div className="glass-panel p-6 sm:p-8 relative overflow-hidden group sm:col-span-2 lg:col-span-1">
                                    <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
                                        <Calendar size={48} className="w-10 h-10 sm:w-12 sm:h-12" />
                                    </div>
                                    <div className="flex flex-col gap-1 sm:gap-2">
                                        <span className="text-[10px] sm:text-xs uppercase font-black tracking-widest text-emerald-500">Today's Viewers</span>
                                        <span className="text-2xl sm:text-4xl font-black text-primary">{analytics?.Main?.["Today's Viewers"] || '0'}</span>
                                        <div className="flex items-center gap-2 mt-4 text-[10px] sm:text-xs font-bold text-muted">
                                            <span className="bg-emerald-500/10 text-emerald-500 px-2 py-1 rounded">LIVE TRAFFIC</span>
                                            <span className="hidden sm:inline">Views in 24h</span>
                                        </div>
                                    </div>
                                </div>
                            </div>



                        </div>

                    ) : (
                        <div className="flex flex-col gap-8 pb-12 lg:pr-4">
                            <div className="flex flex-col gap-1">
                                <h1 className="heading-lg m-0 text-2xl sm:text-3xl">Portal HQ</h1>
                                <p className="text-muted text-sm">Configure and monitor entrance campaigns</p>
                            </div>

                            <div className="grid grid-cols-1 xl:grid-cols-12 gap-8 items-start">
                                {/* Generator Sidebar */}
                                <div className="xl:col-span-4 flex flex-col gap-6">
                                    <div className="glass-panel p-8 border-dashed border-2 relative overflow-hidden group">
                                        <div className="absolute -top-10 -right-10 w-40 h-40 bg-blue-500/5 blur-3xl rounded-full" />

                                        <div className="flex flex-col gap-1 mb-6 relative z-10">
                                            <h3 className="heading-sm m-0 flex items-center gap-2">
                                                <Plus size={18} className="text-blue-500" />
                                                Campaign Architect
                                            </h3>
                                            <p className="text-[11px] text-muted font-medium">Generate a new secure tracking link</p>
                                        </div>

                                        <div className="flex flex-col gap-5 mb-6 relative z-10">
                                            <div className="flex flex-col gap-2">
                                                <label className="text-[10px] font-black uppercase tracking-widest text-muted opacity-60">Target Identifier</label>
                                                <input
                                                    type="text"
                                                    className="input-field !py-3 !text-sm"
                                                    value={name}
                                                    onChange={(e) => setName(e.target.value)}
                                                    placeholder="e.g. Google HR"
                                                />
                                            </div>
                                            <div className="flex flex-col gap-2">
                                                <label className="text-[10px] font-black uppercase tracking-widest text-muted opacity-60">Portal Context</label>
                                                <input
                                                    type="text"
                                                    className="input-field !py-3 !text-sm"
                                                    value={forField}
                                                    onChange={(e) => setForField(e.target.value)}
                                                    placeholder="e.g. Senior Role Application"
                                                />
                                            </div>
                                        </div>

                                        <button
                                            onClick={generateCode}
                                            disabled={!name.trim() || !forField.trim()}
                                            className="btn btn-primary w-full py-4 rounded-xl shadow-lg shadow-blue-500/10 group transition-all relative z-10 overflow-hidden"
                                        >
                                            <RefreshCw size={18} className="group-active:rotate-180 transition-transform duration-500" />
                                            Deploy Portal
                                        </button>
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
                                                    initial={{ opacity: 0, y: 10 }}
                                                    animate={{ opacity: 1, y: 0 }}
                                                    onClick={() => setActivityLink(link)}
                                                    className="glass-panel p-5 flex flex-col gap-5 group cursor-pointer hover:border-blue-500/30 transition-all border border-transparent relative overflow-hidden h-fit"
                                                >
                                                    <div className="absolute top-0 right-0 w-32 h-32 bg-blue-500/10 blur-[60px] opacity-0 group-hover:opacity-100 transition-opacity" />

                                                    <div className="flex items-start justify-between relative z-10">
                                                        <div className="flex items-center gap-4 flex-1 min-w-0">
                                                            <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-blue-500/10 to-blue-600/5 border border-blue-500/10 flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform duration-500">
                                                                <Activity size={22} className="text-blue-500" />
                                                            </div>
                                                            <div className="flex flex-col min-w-0">
                                                                <div className="flex items-center gap-2">
                                                                    <span className="font-black text-sm tracking-tight text-primary truncate">{link.name}</span>
                                                                    <span className="text-[8px] font-black px-2 py-0.5 rounded-full bg-blue-500/10 text-blue-500 border border-blue-500/10 uppercase tracking-widest shrink-0">Active</span>
                                                                </div>
                                                                <span className="text-[11px] text-muted opacity-50 font-medium truncate mt-0.5">{link.forField}</span>
                                                            </div>
                                                        </div>

                                                        <div className="flex items-center gap-4 shrink-0">
                                                            <div className="flex flex-col items-end">
                                                                <div className="flex items-baseline gap-1">
                                                                    <span className="text-2xl font-black text-primary leading-none group-hover:text-blue-500 transition-colors">{link.counts}</span>
                                                                    <span className="text-[9px] font-bold text-muted uppercase tracking-tighter">Hits</span>
                                                                </div>
                                                                <div className="w-12 h-1 bg-white/5 rounded-full mt-2 overflow-hidden">
                                                                    <motion.div
                                                                        className="h-full bg-blue-500"
                                                                        initial={{ width: 0 }}
                                                                        animate={{ width: `${Math.min(link.counts * 2, 100)}%` }}
                                                                        transition={{ duration: 1, delay: 0.2 }}
                                                                    />
                                                                </div>
                                                            </div>
                                                            <button onClick={(e) => { e.stopPropagation(); handleMenuClick(e, link.id); }}
                                                                className="p-2 hover:bg-white/10 rounded-xl transition-all text-muted opacity-0 group-hover:opacity-100">
                                                                <MoreVertical size={18} />
                                                            </button>
                                                        </div>
                                                    </div>

                                                    <div className="flex items-center gap-3 relative z-10">
                                                        <div className="flex-1 relative group/link">
                                                            <div className="relative flex items-center gap-3 px-4 py-3 bg-[var(--bg-secondary)] border border-[var(--card-border)] rounded-2xl group-hover:border-blue-500/30 transition-all overflow-hidden shadow-sm">
                                                                <div className="w-2 h-2 rounded-full bg-blue-500 animate-pulse shrink-0 shadow-[0_0_10px_rgba(59,130,246,0.5)]" />
                                                                <code className="flex-1 text-[11px] font-mono text-[var(--text-primary)] truncate tracking-tight font-semibold">
                                                                    {link.fullLink}
                                                                </code>
                                                            </div>
                                                        </div>
                                                        <div className="flex items-center gap-2 shrink-0">
                                                            <button
                                                                onClick={(e) => { e.stopPropagation(); toggleInterviewerMode(link.id, link.interviewer); }}
                                                                className={`w-11 h-11 flex items-center justify-center rounded-2xl border transition-all shadow-lg shrink-0 ${link.interviewer
                                                                    ? 'bg-blue-500/20 text-blue-500 border-blue-500/30'
                                                                    : 'bg-white/5 text-muted border-white/10 hover:bg-white/10'
                                                                    }`}
                                                                title="Interviewer Mode"
                                                            >
                                                                <Users size={18} className={link.interviewer ? 'animate-pulse' : ''} />
                                                            </button>
                                                            <button
                                                                onClick={(e) => { e.stopPropagation(); copyToClipboard(link.fullLink, link.id); }}
                                                                className="w-11 h-11 flex items-center justify-center bg-blue-500/10 hover:bg-blue-500/20 text-blue-500 rounded-2xl border border-blue-500/20 transition-all shadow-lg shadow-blue-500/5 shrink-0"
                                                                title="Copy Link"
                                                            >
                                                                {copied === link.id ? <Check size={18} /> : <Copy size={18} />}
                                                            </button>
                                                        </div>
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
                isDark={isDark}
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
