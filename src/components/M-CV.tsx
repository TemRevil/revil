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
    listing?: number;
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
                    fullData: mappedProject,
                    listing: data.Listing ?? data.listing ?? 0
                };
            }).sort((a, b) => {
                const aVal = a.listing && a.listing > 0 ? a.listing : 999999;
                const bVal = b.listing && b.listing > 0 ? b.listing : 999999;
                if (aVal !== bVal) return aVal - bVal;
                return (a.title || '').localeCompare(b.title || '');
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
                    const links = Object.entries(data['Social Links'])
                        .filter(([name]) => !name.toLowerCase().includes('instagram'))
                        .map(([name, url]) => ({
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
                    initial={{ opacity: 0, scale: 0.3, y: 400 }}
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.3, y: 400 }}
                    transition={{ type: 'spring', damping: 30, stiffness: 350, mass: 1 }}
                    style={{ transformOrigin: 'bottom center' }}
                    onClick={(e) => e.stopPropagation()}
                    className="glass-panel-deep relative w-full max-w-5xl h-full max-h-[85vh] overflow-hidden pointer-events-auto flex flex-col border border-black/5 dark:border-white/10 shadow-[0_30px_60px_rgba(0,0,0,0.1)] dark:shadow-[0_30px_60px_rgba(0,0,0,0.5)]"
                >
                    {/* Header & Title */}
                    <div className="p-6 pb-0 flex flex-col gap-4 relative z-10 shrink-0 font-sans">
                        <div className="flex items-center justify-between mb-6">
                            <div className="flex items-center gap-3">
                                <motion.div
                                    layoutId="cv-icon"
                                    className="flex items-center justify-center"
                                    transition={{ type: 'spring', damping: 30, stiffness: 350, mass: 1 }}
                                >
                                    <FileText size={26} strokeWidth={2} className="text-blue-500" />
                                </motion.div>
                                <h2 className="text-2xl font-bold text-primary m-0 tracking-tight" style={{ fontSize: '1.5rem' }}>
                                    Fast Report
                                </h2>
                            </div>
                            <button
                                onClick={onClose}
                                className="p-3 bg-white/40 dark:bg-black/40 backdrop-blur-xl border border-black/5 dark:border-white/10 hover:bg-red-500/10 dark:hover:bg-red-500/10 hover:border-red-500/20 dark:hover:border-red-500/30 hover:text-red-500 rounded-full transition-all text-sec shadow-sm group"
                            >
                                <X size={20} className="group-hover:rotate-90 transition-transform duration-300" />
                            </button>
                        </div>
                    </div>

                    {/* CV Content */}
                    <div className="flex-1 overflow-y-auto custom-scrollbar px-4 md:px-6 py-2 selection:bg-blue-500/30">
                        <div className="max-w-4xl mx-auto space-y-10">

                            {/* Header Section */}
                            <header className="space-y-5">
                                <div className="space-y-3">
                                    <motion.h1
                                        initial={{ opacity: 0, x: -20 }}
                                        animate={{ opacity: 1, x: 0 }}
                                        className="text-5xl md:text-7xl font-black tracking-tighter text-primary font-sans uppercase leading-none"
                                    >
                                        Mohammed <span className="text-blue-500">Ahmed</span>
                                    </motion.h1>
                                    <p className="text-blue-500/80 dark:text-blue-400/80 font-sans font-bold tracking-[0.2em] text-lg md:text-sm uppercase">Frontend Expert & AI Expert</p>
                                </div>

                                <div className="flex flex-wrap gap-x-8 gap-y-3 text-base text-sec font-sans">
                                    <a href="mailto:temrevil@gmail.com" className="flex items-center gap-2.5 hover:text-primary transition-colors">
                                        <Mail size={16} className="text-blue-500" /> temrevil@gmail.com
                                    </a>
                                    <span className="flex items-center gap-2.5">
                                        <Phone size={16} className="text-blue-500" /> +20 100 130 8280
                                    </span>
                                    <span className="flex items-center gap-2.5">
                                        <MapPin size={16} className="text-blue-500" /> Egypt, MA
                                    </span>
                                </div>
                            </header>

                            <div className="grid md:grid-cols-[1fr_350px] gap-10 pt-10 md:pt-6">
                                <div className="space-y-16">
                                    {/* Summary Section */}
                                    <section className="space-y-4">
                                        <h2 className="text-sm md:text-base lg:text-lg font-black uppercase tracking-[0.3em] text-blue-500">Overview</h2>
                                        <p className="text-lg leading-relaxed text-sec font-medium block">
                                            Frontend Developer with 3+ year building React applications. Specialized in modern JavaScript frameworks, <span className="text-primary">Firebase integration</span>, and <span className="text-primary">AI-powered solutions using tools, once published, with exclusive invitations to experience them firsthand</span>. Seeking remote opportunities and contributing my technical skills.
                                        </p>
                                    </section>

                                    {/* Projects Section (Dynamic) */}
                                    <section className="space-y-8">
                                        <div className="flex items-center justify-between border-b border-black/5 dark:border-white/5 pb-4">
                                            <h2 className="text-sm md:text-base lg:text-lg font-black uppercase tracking-[0.3em] text-blue-500">Projects</h2>
                                        </div>
                                        <div className="space-y-8">
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
                                                    <div className="flex flex-wrap gap-1.5 pt-1">
                                                        {project.stack.map((tech) => (
                                                            <span
                                                                key={tech}
                                                                className="px-2.5 py-1 bg-black/[0.04] dark:bg-white/5 border border-black/5 dark:border-white/5 rounded-full text-[9.5px] font-black text-blue-500/80 uppercase tracking-wider"
                                                            >
                                                                {tech}
                                                            </span>
                                                        ))}
                                                    </div>
                                                </motion.div>
                                            )) : (
                                                <p className="text-muted text-sm italic">Synchronizing cloud assets...</p>
                                            )}
                                        </div>
                                    </section>

                                    {/* Education Section */}
                                    <section className="space-y-8 pt-4">
                                        <h2 className="text-sm md:text-base lg:text-lg font-black uppercase tracking-[0.3em] text-blue-500">Academic Background</h2>
                                        <div className="space-y-8 pt-2">
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

                                <aside className="space-y-12">
                                    {/* Skills Section */}
                                    <section className="space-y-6">
                                        <h2 className="text-sm md:text-base lg:text-lg font-black uppercase tracking-[0.3em] text-blue-500">Stack</h2>
                                        <div className="flex flex-wrap gap-2 pt-2">
                                            {availableStack.length > 0 ? availableStack.map((skill) => (
                                                <motion.div
                                                    key={skill.id}
                                                    whileHover={{ scale: 1.05, y: -2 }}
                                                    className="px-3.5 py-1.5 bg-white/40 dark:bg-black/20 backdrop-blur-md border border-black/[0.03] dark:border-white/[0.05] rounded-2xl shadow-sm cursor-default transition-all hover:bg-white/60 dark:hover:bg-black/40 hover:border-blue-500/20"
                                                >
                                                    <span className="text-[12px] font-bold text-sec whitespace-nowrap">{skill.name}</span>
                                                </motion.div>
                                            )) : (
                                                ["React", "Next.js", "TypeScript", "Firebase", "Node.js"].map(skill => (
                                                    <div
                                                        key={skill}
                                                        className="px-3.5 py-1.5 bg-white/20 dark:bg-black/10 backdrop-blur-sm border border-black/[0.03] dark:border-white/[0.05] rounded-2xl opacity-50"
                                                    >
                                                        <span className="text-[12px] font-bold text-sec">{skill}</span>
                                                    </div>
                                                ))
                                            )}
                                        </div>
                                    </section>

                                    {/* Achievements */}
                                    <section className="space-y-6">
                                        <h2 className="text-sm md:text-base lg:text-lg font-black uppercase tracking-[0.3em] text-blue-500">Impact</h2>
                                        <div className="space-y-4 text-xs leading-relaxed text-sec pt-2">
                                            <p>Built <span className="text-primary font-bold">3 major apps</span> in 1st year.</p>
                                            <p>Native <span className="text-primary font-bold">AI integration</span> specialist.</p>
                                            <p>Cross-platform <span className="text-primary font-bold">Electron</span> expert.</p>
                                        </div>
                                    </section>

                                    {/* Presence */}
                                    <section className="space-y-6">
                                        <h2 className="text-sm md:text-base lg:text-lg font-black uppercase tracking-[0.3em] text-blue-500">Connect</h2>
                                        <div className="flex flex-col gap-3 pt-2">
                                            {socialLinks.filter(link => !link.name.toLowerCase().includes('instagram')).map((link) => (
                                                <a
                                                    key={link.name}
                                                    href={link.url}
                                                    target="_blank"
                                                    rel="noopener noreferrer"
                                                    onClick={() => trackClick(link.name)}
                                                    className="flex items-center gap-3 text-xs md:text-sm font-bold text-sec hover:text-blue-500 transition-all group"
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
                            <footer className="pt-12 border-t border-black/5 dark:border-white/5 flex flex-col items-center gap-4">
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
