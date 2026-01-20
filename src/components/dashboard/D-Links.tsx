import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Copy, Check, RefreshCw, ExternalLink, MoreVertical, Edit2, Trash2, Activity, Clock, MousePointer2, Briefcase } from 'lucide-react';
import anime from 'animejs';
import { doc, onSnapshot, getDoc, updateDoc, deleteField } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import Loader from '../reactbits/Loader';
import Alert, { AlertType } from '../Alert';

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
    const [windowWidth, setWindowWidth] = useState(window.innerWidth);

    // Responsive sizing matching D-Projects
    const isExtraSmall = windowWidth < 400;
    const isSmall = windowWidth < 640;
    const tableColumns = isExtraSmall
        ? 'minmax(180px, 1.5fr) 120px 200px 70px 56px'
        : isSmall
            ? 'minmax(200px, 1.8fr) 150px 250px 80px 56px'
            : 'minmax(220px, 2fr) 180px 320px 100px 60px';
    const tableMinWidth = isExtraSmall ? '650px' : isSmall ? '750px' : '900px';
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
        const handleResize = () => setWindowWidth(window.innerWidth);
        checkTheme();
        window.addEventListener('resize', handleResize);
        const observer = new MutationObserver(checkTheme);
        observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
        return () => {
            window.removeEventListener('resize', handleResize);
            observer.disconnect();
        };
    }, []);

    useEffect(() => {
        const unsubscribe = onSnapshot(doc(db, 'Settings', 'Views'), (docSnap) => {
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
        return () => unsubscribe();
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
        <div className="links-section-container flex flex-col gap-8 h-full opacity-0">
            <Loader isOpen={isLoading} isFullScreen={true} />

            {/* Link Generator Section */}
            <div className="glass-panel p-6 sm:p-10">
                <div className="flex flex-col sm:flex-row gap-6 mb-8">
                    <div className="flex-1 min-w-[200px] flex flex-col gap-2.5">
                        <label className="input-label m-0">Name</label>
                        <input
                            type="text"
                            className="input-field"
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            placeholder="Enter link name..."
                        />
                    </div>
                    <div className="flex-1 min-w-[200px] flex flex-col gap-2.5">
                        <label className="input-label m-0">For</label>
                        <input
                            type="text"
                            className="input-field"
                            value={forField}
                            onChange={(e) => setForField(e.target.value)}
                            placeholder="What is this link for..."
                        />
                    </div>
                </div>

                <button
                    onClick={generateCode}
                    disabled={!name.trim() || !forField.trim()}
                    className="btn btn-primary w-full px-8 py-4 rounded-xl shadow-md"
                >
                    <RefreshCw size={18} />
                    Generate Link
                </button>
            </div>

            {/* Generated Links Table */}
            <div className="glass-panel flex-1 flex flex-col overflow-hidden">
                <div className="flex-1 overflow-auto custom-scrollbar">
                    <div className="min-w-[800px]">
                        {/* Table Header */}
                        <div className="grid p-4 border-b text-sec font-semibold text-sm" style={{
                            gridTemplateColumns: tableColumns,
                            borderColor: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.05)',
                            minWidth: tableMinWidth
                        }}>
                            <div>NAME</div>
                            <div>FOR</div>
                            <div>LINK</div>
                            <div className="text-center">COUNTS</div>
                            <div style={{ textAlign: 'right' }}>ACTIONS</div>
                        </div>

                        {/* Table Body */}
                        <div className="min-w-0">
                            {generatedLinks.length === 0 ? (
                                <div className="p-12 text-center text-sec">
                                    No links generated yet. Fill in the name and purpose above to create one.
                                </div>
                            ) : (
                                generatedLinks.map((link) => (
                                    <div key={link.id} className="grid p-4 border-b items-center transition-colors cursor-pointer"
                                        style={{
                                            gridTemplateColumns: tableColumns,
                                            borderColor: isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)',
                                            minWidth: tableMinWidth
                                        }}
                                        onClick={() => setActivityLink(link)}
                                        onMouseEnter={(e) => e.currentTarget.style.backgroundColor = isDark ? 'rgba(255,255,255,0.02)' : 'rgba(0,0,0,0.02)'}
                                        onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                                    >
                                        {/* Name & Icon Col */}
                                        <div className="flex items-center gap-4">
                                            <div className="w-10 h-10 rounded-lg overflow-hidden flex items-center justify-center flex-shrink-0"
                                                style={{ backgroundColor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)' }}>
                                                <ExternalLink size={18} className="text-sec opacity-40" />
                                            </div>
                                            <div className="font-semibold text-primary truncate pr-2">{link.name}</div>
                                        </div>

                                        <div className="text-sm text-sec opacity-70 truncate pr-4">{link.forField}</div>
                                        <div className="flex items-center gap-3 overflow-hidden">
                                            <code className="flex-1 p-2 px-4 bg-[var(--input-bg)] rounded-lg text-xs font-mono truncate text-primary border border-[var(--input-border)]">
                                                {link.fullLink}
                                            </code>
                                            <div className="flex items-center gap-1.5 flex-shrink-0">
                                                <button onClick={(e) => { e.stopPropagation(); copyToClipboard(link.fullLink, link.id); }}
                                                    className="btn-icon !p-1.5 rounded-lg"
                                                    style={copied === link.id ? { backgroundColor: 'var(--success)', color: 'white' } : {}}>
                                                    {copied === link.id ? <Check size={14} /> : <Copy size={14} />}
                                                </button>
                                                <a href={link.fullLink} target="_blank" rel="noopener noreferrer"
                                                    onClick={(e) => e.stopPropagation()}
                                                    className="btn-icon !p-1.5 rounded-lg">
                                                    <ExternalLink size={14} />
                                                </a>
                                            </div>
                                        </div>
                                        <div className="text-center font-bold text-primary">{link.counts}</div>
                                        <div className="text-right">
                                            <button onClick={(e) => { e.stopPropagation(); handleMenuClick(e, link.id); }}
                                                className={`p-2 rounded-lg border-none bg-transparent cursor-pointer transition-all ${activeMenu === link.id ? 'text-blue-500 bg-blue-500/10' : 'text-sec hover:bg-black/5 dark:hover:bg-white/5'}`}>
                                                <MoreVertical size={20} />
                                            </button>
                                        </div>
                                    </div>
                                ))
                            )}
                        </div>
                    </div>
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
                            <Activity size={16} /> Info
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
