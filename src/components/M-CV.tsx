import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { motion } from 'framer-motion';
import { X, Mail, Phone, MapPin, Globe, Github, Linkedin, Instagram, ExternalLink, FileText } from 'lucide-react';
import { collection, onSnapshot, doc } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { ProjectData as FullProject } from '../types';
import { useSocialTracker } from '../hooks/useSocialTracker';

interface CVProject {
    id: string;
    title: string;
    stack: string[];
    fullData?: unknown;
}

type StackItem = { id: string; name: string; icon?: string };
type Contributor = { id: string; name?: string; role?: string; image?: string; links?: Record<string, string> };

interface MCVProps {
    isOpen: boolean;
    onClose: () => void;
    onProjectClick: (project: FullProject) => void;
}

const MCV = ({ onClose, onProjectClick }: Omit<MCVProps, 'isOpen'>) => {
    const { trackClick } = useSocialTracker();
    const [projects, setProjects] = useState<CVProject[]>([]);
    const [socialLinks, setSocialLinks] = useState<{ name: string; url: string }[]>([]);
    const [availableStack, setAvailableStack] = useState<StackItem[]>([]);
    const [availableContributors, setAvailableContributors] = useState<Contributor[]>([]);

    // Fetch Contributors
    useEffect(() => {
        const unsubDoc = onSnapshot(doc(db, 'Tags', 'Contributors'), (docSnap) => {
            if (docSnap.exists()) {
                const data = docSnap.data();
                const loaded = Object.entries(data)
                    .filter(([, val]) => val && typeof val === 'object' && ((val as Record<string, unknown>).Name || (val as Record<string, unknown>).name))
                    .map(([id, val]: [string, unknown]) => {
                        const v = val as Record<string, unknown>;
                        const links = v["Social Accounts"] && typeof v["Social Accounts"] === 'object' ? v["Social Accounts"] as Record<string, string> : {};
                        return {
                            id,
                            name: typeof v.Name === 'string' ? v.Name : typeof v.name === 'string' ? v.name : undefined,
                            role: typeof v.Role === 'string' ? v.Role : typeof v.role === 'string' ? v.role : undefined,
                            image: typeof v.Image === 'string' ? v.Image : typeof v.image === 'string' ? v.image : undefined,
                            links
                        };
                    });
                setAvailableContributors(prev => {
                    const filtered = prev.filter(p => !loaded.some(l => l.id === p.id));
                    return [...filtered, ...loaded];
                });
            }
        });

        const unsubCol = onSnapshot(collection(db, 'Tags', 'Contributors', 'Profiles'), (snapshot) => {
            const loaded = snapshot.docs.map(d => {
                const val = d.data();
                return {
                    id: d.id,
                    name: val.Name || val.name,
                    role: val.Role || val.role,
                    image: val.Image || val.image,
                    links: val["Social Accounts"] || val.links || val.socials || {}
                };
            });
            setAvailableContributors(prev => {
                const filtered = prev.filter(p => !loaded.some(l => l.id === p.id));
                return [...filtered, ...loaded];
            });
        });

        return () => {
            unsubDoc();
            unsubCol();
        };
    }, []);

    // Fetch Tech Stack
    useEffect(() => {
        const unsub = onSnapshot(doc(db, 'Settings', 'Tech Stack'), (docSnap) => {
            if (docSnap.exists()) {
                const data = docSnap.data();
                const items = Object.entries(data)
                    .sort(([a], [b]) => Number(a) - Number(b))
                    .map(([id, val]: [string, unknown]) => {
                        const v = val as Record<string, unknown>;
                        return {
                            id,
                            name: typeof v.Name === 'string' ? v.Name : typeof v.name === 'string' ? v.name : '',
                            icon: typeof v.Icon === 'string' ? v.Icon : typeof v.icon === 'string' ? v.icon : undefined
                        };
                    });
                setAvailableStack(items);
            }
        });
        return () => unsub();
    }, []);

    // Fetch Projects from Firestore
    useEffect(() => {
        const unsub = onSnapshot(collection(db, 'Projects'), (snapshot) => {
            const loaded = snapshot.docs.map(doc => {
                const data = doc.data();
                const rawStack = data.Stack || [];
                const normalizedStack = (Array.isArray(rawStack) ? rawStack : Object.values(rawStack))
                    .map((t: unknown) => {
                        if (typeof t === 'string') return t;
                        const u = t as Record<string, unknown>;
                        return typeof u.name === 'string' ? u.name : typeof u.Name === 'string' ? u.Name : '';
                    })
                    .filter(t => t !== '' && t !== 'Unix');

                // Map exactly like Projects.tsx expects
                const projectContributors = data.Contributors ? Object.values(data.Contributors).map((c: unknown) => {
                    const v = c as Record<string, unknown>;
                    const name = typeof v["Contributor Name"] === 'string' ? v["Contributor Name"] : '';
                    const projectRole = typeof v["Role at Project"] === 'string' ? v["Role at Project"] : undefined;

                    const fullContrib = availableContributors.find(cont => {
                        const cName = (cont.name || '').trim().toLowerCase();
                        const pName = name.trim().toLowerCase();
                        return cName === pName && cName !== '';
                    });

                    return {
                        name,
                        role: projectRole || (fullContrib ? (fullContrib.role || (((fullContrib as unknown) as Record<string, unknown>).jobTitle as string) || 'Contributor') : 'Contributor'),
                        jobTitle: fullContrib ? (fullContrib.role || (((fullContrib as unknown) as Record<string, unknown>).jobTitle as string) || 'Contributor') : 'Contributor',
                        image: fullContrib?.image || '',
                        links: fullContrib?.links || {}
                    };
                }) : [];

                const mappedProject = {
                    id: doc.id,
                    title: data.Title || doc.id,
                    name: doc.id,
                    description: data.Description || '',
                    fullDescription: data.Description || '',
                    images: data["Project Images"] || (data.Images ? Object.values(data.Images) : []),
                    stack: normalizedStack,
                    contributors: projectContributors,
                    repoLink: data["Repository Link"],
                    liveLink: data["Live Link"],
                    downloadLink: data["Download Link"] || '',
                    views: Number(data.Views?.Project || 0),
                    githubViews: Number(data.Views?.Github || 0),
                    liveViews: Number(data.Views?.Live || 0),
                    downloadViews: Number(data.Views?.Download || 0)
                };

                return {
                    id: doc.id,
                    title: mappedProject.title,
                    stack: normalizedStack,
                    fullData: mappedProject
                };
            });
            setProjects(loaded);
        });
        return () => unsub();
    }, [availableContributors]); // Re-run when contributors are updated to ensure mapping is correct

    // Fetch Social Links from Firestore
    useEffect(() => {
        const unsub = onSnapshot(doc(db, 'Settings', 'Account'), (docSnap) => {
            if (docSnap.exists()) {
                const data = docSnap.data();
                if (data && data['Social Links']) {
                    const links = Object.entries(data['Social Links']).map(([name, url]) => ({
                        name,
                        url: url as string
                    }));
                    setSocialLinks(links);
                }
            }
        });
        return () => unsub();
    }, []);

    // Close on Escape
    useEffect(() => {
        const handleEscape = (e: KeyboardEvent) => {
            if (e.key === 'Escape') onClose();
        };
        document.addEventListener('keydown', handleEscape);
        document.body.style.overflow = 'hidden';
        return () => {
            document.removeEventListener('keydown', handleEscape);
            document.body.style.overflow = 'unset';
        };
    }, [onClose]);

    const getSocialIcon = (name: string) => {
        const lower = name.toLowerCase();
        if (lower.includes('github')) return <Github size={16} />;
        if (lower.includes('linkedin')) return <Linkedin size={16} />;
        if (lower.includes('instagram')) return <Instagram size={16} />;
        return <Globe size={16} />;
    };

    return createPortal(
        <>
            {/* Overlay */}
            <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                onClick={onClose}
                className="fixed inset-0 z-[1500] bg-black/20 dark:bg-black/40 backdrop-blur-xl"
            />

            {/* Modal Container */}
            <div className="fixed inset-0 z-[1501] flex items-center justify-center p-4 md:p-12 pointer-events-none">
                <motion.div
                    layoutId="cv-trigger"
                    initial={{ opacity: 0, scale: 0.95, y: 30 }}
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.95, y: 30 }}
                    transition={{ type: 'spring', damping: 28, stiffness: 220 }}
                    onClick={(e) => e.stopPropagation()}
                    className="glass-panel-deep relative w-full max-w-5xl h-full max-h-[85vh] overflow-hidden pointer-events-auto flex flex-col border border-black/5 dark:border-white/10 shadow-[0_30px_60px_rgba(0,0,0,0.1)] dark:shadow-[0_30px_60px_rgba(0,0,0,0.5)]"
                    style={{ borderRadius: '32px' }}
                >
                    {/* Premium Top Bar */}
                    <div className="flex items-center justify-between px-8 py-5 border-b border-black/5 dark:border-white/5 bg-black/[0.02] dark:bg-white/5">
                        <div className="flex items-center gap-4">
                            <motion.div layoutId="cv-icon" className="flex">
                                <FileText size={18} className="text-secondary" />
                            </motion.div>
                            <span className="text-[10px] font-black text-sec uppercase tracking-[0.3em] font-sans">Fast Report</span>
                        </div>
                        <div className="flex items-center gap-3">
                            <button
                                onClick={onClose}
                                className="p-2.5 hover:bg-red-500/10 dark:hover:bg-red-500/20 hover:text-red-500 rounded-xl transition-all text-sec"
                            >
                                <X size={20} />
                            </button>
                        </div>
                    </div>

                    {/* CV Content */}
                    <div className="flex-1 overflow-y-auto custom-scrollbar p-10 md:p-16 selection:bg-blue-500/30">
                        <div className="max-w-3xl mx-auto space-y-14">

                            {/* Header Section */}
                            <header className="space-y-6">
                                <div className="space-y-2">
                                    <motion.h1
                                        initial={{ opacity: 0, x: -20 }}
                                        animate={{ opacity: 1, x: 0 }}
                                        className="text-5xl md:text-7xl font-black tracking-tighter text-primary font-sans uppercase leading-none"
                                    >
                                        Mohammed <span className="text-blue-500">Ahmed</span>
                                    </motion.h1>
                                    <p className="text-blue-500/80 dark:text-blue-400/80 font-sans font-bold tracking-[0.2em] text-xs uppercase">Software Architect & Frontend Expert</p>
                                </div>

                                <div className="flex flex-wrap gap-x-8 gap-y-4 text-sm text-sec font-sans border-t border-black/5 dark:border-white/5 pt-6">
                                    <a href="mailto:temrevil@gmail.com" className="flex items-center gap-2 hover:text-primary transition-colors">
                                        <Mail size={14} className="text-blue-500" /> temrevil@gmail.com
                                    </a>
                                    <span className="flex items-center gap-2">
                                        <Phone size={14} className="text-blue-500" /> +20 100 130 8280
                                    </span>
                                    <span className="flex items-center gap-2">
                                        <MapPin size={14} className="text-blue-500" /> Egypt, MA
                                    </span>
                                </div>
                            </header>

                            <div className="grid md:grid-cols-[1fr_250px] gap-16">
                                <div className="space-y-16">
                                    {/* Summary Section */}
                                    <section className="space-y-4">
                                        <h2 className="text-[10px] font-black uppercase tracking-[0.4em] text-blue-500">Overview</h2>
                                        <p className="text-lg leading-relaxed text-sec font-medium">
                                            Frontend Developer with 1+ year building React applications. Specialized in modern JavaScript frameworks, <span className="text-primary">Firebase integration</span>, and <span className="text-primary">AI-powered solutions</span>. Seeking remote frontend opportunities to contribute technical skills while completing university studies.
                                        </p>
                                    </section>

                                    {/* Projects Section (Dynamic) */}
                                    <section className="space-y-8">
                                        <div className="flex items-center justify-between border-b border-black/5 dark:border-white/5 pb-4">
                                            <h2 className="text-[10px] font-black uppercase tracking-[0.4em] text-blue-500">Projects</h2>
                                        </div>
                                        <div className="space-y-10">
                                            {projects.length > 0 ? projects.map((project) => (
                                                <motion.div
                                                    key={project.id}
                                                    whileHover={{ x: 10 }}
                                                    onClick={() => onProjectClick(project.fullData as FullProject)}
                                                    className="group cursor-pointer space-y-3"
                                                >
                                                    <div className="flex items-center justify-between">
                                                        <h3 className="text-2xl font-bold text-primary group-hover:text-blue-500 transition-colors uppercase tracking-tight">{project.title}</h3>
                                                        <ExternalLink size={16} className="text-blue-500/0 group-hover:text-blue-500 transition-all opacity-0 group-hover:opacity-100" />
                                                    </div>
                                                    <div className="flex flex-wrap gap-2">
                                                        {project.stack.map((tech) => (
                                                            <span key={tech} className="text-[10px] font-bold text-muted uppercase tracking-widest">{tech}</span>
                                                        ))}
                                                    </div>
                                                </motion.div>
                                            )) : (
                                                <p className="text-muted text-sm italic">Synchronizing cloud assets...</p>
                                            )}
                                        </div>
                                    </section>

                                    {/* Education Section */}
                                    <section className="space-y-8">
                                        <h2 className="text-[10px] font-black uppercase tracking-[0.4em] text-blue-500">Academic Background</h2>
                                        <div className="space-y-10">
                                            <div className="space-y-4">
                                                <div className="flex justify-between items-start">
                                                    <h3 className="text-xl font-bold text-primary">Systems Information & Comp. Eng.</h3>
                                                    <span className="text-[10px] font-black text-blue-500 bg-blue-500/10 px-2 py-1 rounded">2025 — 2030</span>
                                                </div>
                                                <p className="text-sec text-sm">MISR Engineering & Technology (MET) • First Year</p>
                                            </div>
                                            <div className="space-y-4 opacity-60">
                                                <div className="flex justify-between items-start">
                                                    <h3 className="text-xl font-bold text-primary">Industrial Technology</h3>
                                                    <span className="text-[10px] font-black text-muted border border-black/10 dark:border-white/10 px-2 py-1 rounded">GRAD 2025</span>
                                                </div>
                                                <p className="text-sec text-sm">El Mansoura Industrial School • 5-year program</p>
                                            </div>
                                        </div>
                                    </section>
                                </div>

                                <aside className="space-y-16">
                                    {/* Skills Section */}
                                    <section className="space-y-6">
                                        <h2 className="text-[10px] font-black uppercase tracking-[0.4em] text-blue-500">Toolbox</h2>
                                        <div className="flex flex-wrap gap-2">
                                            {availableStack.length > 0 ? availableStack.map((skill) => (
                                                <div key={skill.id} className="px-3 py-1.5 bg-black/[0.03] dark:bg-white/[0.05] border border-black/5 dark:border-white/5 rounded-lg">
                                                    <span className="text-[11px] font-bold text-sec">{skill.name}</span>
                                                </div>
                                            )) : (
                                                ["React", "Next.js", "TypeScript", "Firebase", "Node.js"].map(skill => (
                                                    <div key={skill} className="px-3 py-1.5 bg-black/[0.03] dark:bg-white/[0.05] border border-black/5 dark:border-white/5 rounded-lg opacity-50">
                                                        <span className="text-[11px] font-bold text-sec">{skill}</span>
                                                    </div>
                                                ))
                                            )}
                                        </div>
                                    </section>

                                    {/* Achievements */}
                                    <section className="space-y-6">
                                        <h2 className="text-[10px] font-black uppercase tracking-[0.4em] text-blue-500">Impact</h2>
                                        <div className="space-y-6 text-xs leading-relaxed text-sec">
                                            <p>Built <span className="text-primary font-bold">3 major apps</span> in 1st year.</p>
                                            <p>Native <span className="text-primary font-bold">AI integration</span> specialist.</p>
                                            <p>Cross-platform <span className="text-primary font-bold">Electron</span> expert.</p>
                                        </div>
                                    </section>

                                    {/* Presence */}
                                    <section className="space-y-6">
                                        <h2 className="text-[10px] font-black uppercase tracking-[0.4em] text-blue-500">Connect</h2>
                                        <div className="flex flex-col gap-3">
                                            {socialLinks.map((link) => (
                                                <a
                                                    key={link.name}
                                                    href={link.url}
                                                    target="_blank"
                                                    rel="noopener noreferrer"
                                                    onClick={() => trackClick(link.name)}
                                                    className="flex items-center gap-3 text-xs font-bold text-sec hover:text-blue-500 transition-all group"
                                                >
                                                    <span className="p-2 bg-black/5 dark:bg-white/5 rounded-lg group-hover:bg-blue-500/10 dark:group-hover:bg-blue-500/20 transition-colors">
                                                        {getSocialIcon(link.name)}
                                                    </span>
                                                    {link.name}
                                                </a>
                                            ))}
                                        </div>
                                    </section>
                                </aside>
                            </div>

                            {/* Footer */}
                            <footer className="pt-20 border-t border-black/5 dark:border-white/5 flex flex-col items-center gap-4">
                                <div className="flex items-center gap-2">
                                    <span className="text-[10px] font-black text-muted uppercase tracking-[0.2em]">English (Prof.)</span>
                                    <div className="w-1 h-1 rounded-full bg-black/10 dark:bg-white/10" />
                                    <span className="text-[10px] font-black text-muted uppercase tracking-[0.2em]">Arabic (Native)</span>
                                </div>
                                <p className="text-[9px] font-bold text-muted uppercase tracking-widest leading-loose text-center">
                                    Engineered with precision using React & Firebase<br />
                                    © {new Date().getFullYear()} Mohammed Ahmed
                                </p>
                            </footer>
                        </div>
                    </div>
                </motion.div>
            </div>
        </>
        ,
        document.body
    );
};

export default MCV;
