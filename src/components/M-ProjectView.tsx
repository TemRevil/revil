import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { motion } from 'framer-motion';
import { X, Github, ExternalLink, ChevronLeft, ChevronRight, Upload, User } from 'lucide-react';

// Import SVG icons
import htmlIcon from '../assets/svgs/html.svg';
import cssIcon from '../assets/svgs/css.svg';
import jsIcon from '../assets/svgs/javascript.svg';
import reactIcon from '../assets/svgs/react.svg';
import nodejsIcon from '../assets/svgs/nodejs.svg';
import firebaseIcon from '../assets/svgs/firebase.svg';

import { doc, onSnapshot, updateDoc, getDoc } from 'firebase/firestore';
import { db } from '../lib/firebase';
import Counter from './reactbits/Counter';

export const getStackIcon = (name: string) => {
    const lowerName = name.toLowerCase();
    if (lowerName.includes('html')) return htmlIcon;
    if (lowerName.includes('css')) return cssIcon;
    if (lowerName.includes('javascript') || lowerName.includes('js')) return jsIcon;
    if (lowerName.includes('react')) return reactIcon;
    if (lowerName.includes('node')) return nodejsIcon;
    if (lowerName.includes('firebase')) return firebaseIcon;
    return null;
};

export const getTechColor = (name: string) => {
    const lower = name.toLowerCase();
    if (lower.includes('react')) return '#61dafb';
    if (lower.includes('html')) return '#e34f26';
    if (lower.includes('css')) return '#1572b6';
    if (lower.includes('js') || lower.includes('javascript')) return '#f7df1e';
    if (lower.includes('node')) return '#339933';
    if (lower.includes('firebase')) return '#ffca28';
    if (lower.includes('typescript') || lower.includes('ts')) return '#3178c6';
    if (lower.includes('tailwind')) return '#06b6d4';
    return '#60a5fa';
};

export interface Project {
    id: number | string;
    title?: string;
    name?: string;
    description: string;
    fullDescription?: string;
    images: string[];
    stack?: string[];
    tags?: any[];
    contributors: any[];
    repoLink?: string;
    demoLink?: string;
    liveLink?: string;
    views?: number;
    githubViews?: number;
    liveViews?: number;
    downloadLink?: string;
    downloadViews?: number;
}

interface MProjectViewProps {
    project: Project;
    onClose: () => void;
    onContributorClick: (contributor: any) => void;
}

const MProjectView = ({ project: initialProject, onClose, onContributorClick }: MProjectViewProps) => {
    const [project, setProject] = useState<Project>(initialProject);
    const [currentImageIndex, setCurrentImageIndex] = useState(0);
    const [isDark, setIsDark] = useState(false);
    const [isHovered, setIsHovered] = useState(false);
    const [isMobile, setIsMobile] = useState(false);
    const [windowWidth, setWindowWidth] = useState(window.innerWidth);
    const [availableTags, setAvailableTags] = useState<any[]>([]);

    // Keep internal project state in sync with incoming props
    useEffect(() => {
        setProject(initialProject);
    }, [initialProject]);

    // Fetch Global Tags for Icons/Colors
    useEffect(() => {
        const unsub = onSnapshot(doc(db, 'Tags', 'Tags'), (docSnap) => {
            if (docSnap.exists()) {
                const data = docSnap.data();
                const loaded = Object.entries(data).map(([id, val]: [string, any]) => ({
                    id,
                    name: val.Name || 'Untitled',
                    color: val.Color || '#60a5fa',
                    iconSvg: val.Icon || ''
                }));
                setAvailableTags(loaded);
            }
        });
        return () => unsub();
    }, []);

    // Sync with Firestore for real-time views
    useEffect(() => {
        if (!project.id) return;

        const projectRef = doc(db, 'Projects', project.name || project.title || String(project.id));

        const resolveTag = (t: any) => {
            const name = typeof t === 'string' ? t : (t.name || t.Name || 'Unix');
            // Try to find in global tags
            const globalTag = availableTags.find(gt => gt.name.toLowerCase() === name.toLowerCase());

            return {
                name,
                color: (typeof t === 'object' && (t.color || t.Color)) ? (t.color || t.Color) : (globalTag?.color || getTechColor(name)),
                iconSvg: (typeof t === 'object' && (t.iconSvg || t.Icon)) ? (t.iconSvg || t.Icon) : (globalTag?.iconSvg || getStackIcon(name) || '')
            };
        };

        // Subscribe to real-time updates for views AND project details
        const unsub = onSnapshot(projectRef, (docSnap) => {
            if (docSnap.exists()) {
                const data = docSnap.data();

                // Also update contributors if they've changed in the background
                setProject(prev => {
                    const statusV = data.Views || {};
                    const rawStack = data.Stack || [];
                    const normalizedStack = (Array.isArray(rawStack) ? rawStack : Object.values(rawStack))
                        .map(resolveTag)
                        .filter(t => t.name !== 'Unix');

                    const rawTags = data.Tags ? Object.values(data.Tags) : [];
                    const normalizedTags = rawTags
                        .map(resolveTag)
                        .filter(t => t.name !== 'Unix');

                    const updated = {
                        ...prev,
                        views: Number(statusV.Project || 0) || 0,
                        githubViews: Number(statusV.Github || 0) || 0,
                        liveViews: Number(statusV.Live || 0) || 0,
                        downloadViews: Number(statusV.Download || 0) || 0,
                        stack: normalizedStack.map(t => t.name),
                        tags: normalizedStack.length > 0 ? normalizedStack : normalizedTags,
                        downloadLink: data["Download Link"] || ''
                    };

                    // If we have contributor data in the snapshot, keep the core details synced
                    if (data.Description) updated.description = data.Description;
                    return updated;
                });
            }
        });

        // Increment project views on mount
        const incrementViews = async () => {
            try {
                const snap = await getDoc(projectRef);
                if (snap.exists()) {
                    const currentViews = snap.data().Views || {};
                    const newVal = (parseInt(currentViews.Project || "0") + 1).toString();
                    await updateDoc(projectRef, {
                        "Views.Project": newVal
                    });
                }
            } catch (err) {
                console.warn("Could not increment views:", err);
            }
        };
        incrementViews();

        return () => unsub();
    }, [project.id, availableTags]);

    useEffect(() => {
        const checkTheme = () => setIsDark(document.documentElement.classList.contains('dark'));
        checkTheme();
        const observer = new MutationObserver(checkTheme);
        observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
        return () => observer.disconnect();
    }, []);

    useEffect(() => {
        const handleResize = () => {
            const width = window.innerWidth;
            setWindowWidth(width);
            setIsMobile(width < 1024);
        };
        handleResize();
        window.addEventListener('resize', handleResize);
        return () => window.removeEventListener('resize', handleResize);
    }, []);
    // Auto-slide Gallery
    useEffect(() => {
        let interval: ReturnType<typeof setInterval> | undefined;
        if (project.images && project.images.length > 1 && !isHovered) {
            interval = setInterval(() => {
                setCurrentImageIndex((prev) => (prev + 1) % project.images.length);
            }, 5000);
        }
        return () => clearInterval(interval);
    }, [project.images, isHovered]);

    const handleNext = (e: React.MouseEvent) => {
        e.stopPropagation();
        setCurrentImageIndex((prev) => (prev + 1) % project.images.length);
    };

    const handlePrev = (e: React.MouseEvent) => {
        e.stopPropagation();
        setCurrentImageIndex((prev) => (prev - 1 + project.images.length) % project.images.length);
    };

    const handleClose = () => {
        onClose();
    };

    const handleGithubClick = async () => {
        if (!project.repoLink) return;
        try {
            const projectRef = doc(db, 'Projects', project.name || project.title || String(project.id));
            const snap = await getDoc(projectRef);
            if (snap.exists()) {
                const currentViews = snap.data().Views || {};
                const newVal = (parseInt(currentViews.Github || "0") + 1).toString();
                await updateDoc(projectRef, {
                    "Views.Github": newVal
                });
            }
        } catch (err) {
            console.warn("Could not increment github views:", err);
        }
    };

    const handleLiveClick = async () => {
        if (!project.liveLink && !project.demoLink) return;
        try {
            const projectRef = doc(db, 'Projects', project.name || project.title || String(project.id));
            const snap = await getDoc(projectRef);
            if (snap.exists()) {
                const currentViews = snap.data().Views || {};
                const newVal = (parseInt(currentViews.Live || "0") + 1).toString();
                await updateDoc(projectRef, {
                    "Views.Live": newVal
                });
            }
        } catch (err) {
            console.warn("Could not increment live views:", err);
        }
    };

    const handleDownloadClick = async () => {
        if (!project.downloadLink) return;
        try {
            const projectRef = doc(db, 'Projects', project.name || project.title || String(project.id));
            const snap = await getDoc(projectRef);
            if (snap.exists()) {
                const currentViews = snap.data().Views || {};
                const newVal = (parseInt(currentViews.Download || "0") + 1).toString();
                await updateDoc(projectRef, {
                    "Views.Download": newVal
                });
            }
        } catch (err) {
            console.warn("Could not increment download views:", err);
        }
    };


    const displayTitle = (project.title || project.name || 'Untitled Project').toUpperCase();
    const displayFullDescription = project.fullDescription || project.description || 'No description available.';

    const displayTags = (project.tags && project.tags.length > 0 && typeof project.tags[0] === 'object')
        ? project.tags.map(t => {
            // Try to find in global tags again for latest icon/color
            const globalTag = availableTags.find(gt => gt.name.toLowerCase() === t.name.toLowerCase());
            return {
                name: t.name,
                color: t.color || globalTag?.color || getTechColor(t.name),
                icon: t.iconSvg || globalTag?.iconSvg || getStackIcon(t.name)
            };
        })
        : [
            ...(project.stack || []).map(tech => {
                const globalTag = availableTags.find(gt => gt.name.toLowerCase() === tech.toLowerCase());
                return {
                    name: tech,
                    color: globalTag?.color || getTechColor(tech),
                    icon: globalTag?.iconSvg || getStackIcon(tech)
                };
            }),
            ...(project.tags || []).map(t => {
                const isString = typeof t === 'string';
                const name = isString ? t : t.name;
                const globalTag = availableTags.find(gt => gt.name.toLowerCase() === name.toLowerCase());
                return {
                    name: name,
                    color: isString ? (globalTag?.color || getTechColor(name)) : (t.color || globalTag?.color || getTechColor(name)),
                    icon: isString ? (globalTag?.iconSvg || getStackIcon(t)) : (t.iconSvg || globalTag?.iconSvg || getStackIcon(t.name))
                };
            })
        ];

    const GlassPanel = ({ children, style, className = "" }: any) => (
        <div className={className} style={{
            background: isDark ? 'rgba(255, 255, 255, 0.03)' : 'rgba(255, 255, 255, 0.15)',
            backdropFilter: 'blur(24px)',
            WebkitBackdropFilter: 'blur(24px)',
            borderRadius: '32px',
            border: `1px solid ${isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.05)'}`,
            padding: '30px',
            ...style
        }}>
            {children}
        </div>
    );

    return createPortal(
        <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.25 }}
            style={{
                position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh',
                backgroundColor: 'rgba(0, 0, 0, 0.85)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                zIndex: 1100,
                overflow: 'hidden',
                fontFamily: "'Inter', sans-serif",
                userSelect: 'none', // Added user-select: none to the modal overlay
            }} onClick={handleClose}>
            {/* Dynamic Background Blur */}
            <div style={{
                position: 'absolute', inset: -50,
                backgroundImage: `url(${project.images[currentImageIndex]})`,
                backgroundSize: 'cover', backgroundPosition: 'center',
                filter: 'blur(80px) brightness(0.35)', opacity: 0.7,
                transition: 'background-image 1.5s cubic-bezier(0.16, 1, 0.3, 1)',
                zIndex: -1
            }} />

            {/* Close Button - Ultra Minimal */}
            <button onClick={handleClose} style={{
                position: 'absolute', top: isMobile ? '20px' : '40px', right: isMobile ? '20px' : '40px', zIndex: 1200,
                width: isMobile ? '44px' : '56px', height: isMobile ? '44px' : '56px', borderRadius: '50%',
                background: 'rgba(255, 255, 255, 0.1)', border: '1px solid rgba(255, 255, 255, 0.15)',
                color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center',
                cursor: 'pointer', backdropFilter: 'blur(10px)', transition: 'all 0.3s'
            }} onMouseEnter={e => { e.currentTarget.style.background = '#ef4444'; e.currentTarget.style.transform = 'scale(1.1) rotate(90deg)'; }} onMouseLeave={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.1)'; e.currentTarget.style.transform = 'scale(1) rotate(0deg)'; }}>
                <X size={isMobile ? 20 : 24} />
            </button>

            <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.3, ease: "easeOut" }}
                onClick={e => e.stopPropagation()}
                style={{
                    width: isMobile ? '100%' : '90vw',
                    height: isMobile ? '100%' : '90vh',
                    maxWidth: '1500px',
                    overflowY: 'auto',
                    scrollbarWidth: 'none',
                    padding: isMobile ? '0' : '0 60px',
                    display: 'flex', flexDirection: 'column', gap: '0',
                    willChange: 'transform',
                    borderRadius: isMobile ? '0' : '24px',
                    backgroundColor: 'transparent'
                }}>
                <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.2 }}
                >
                    {/* Hero Showcase Section */}
                    <div style={{
                        position: 'relative', width: '100%',
                        height: '100vh', minHeight: '100vh',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        padding: '20px'
                    }}>
                        {/* Big Decorative Title */}
                        <div style={{
                            position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)',
                            fontSize: isMobile ? '20vw' : '12vw', fontWeight: 950, color: 'white',
                            opacity: isMobile ? 0.02 : 0.03, whiteSpace: 'nowrap', pointerEvents: 'none',
                            zIndex: 0, userSelect: 'none', letterSpacing: '-0.07em'
                        }}>{displayTitle}</div>
                        {/* Main Image Spotlight - Shared Element */}
                        {/* Box shadow wrapper - not part of layout animation */}
                        <div style={{
                            position: 'relative',
                            width: isMobile ? '100%' : '85%',
                            maxWidth: '1200px',
                            zIndex: 1,
                            borderRadius: isMobile ? '16px' : '32px',
                            boxShadow: '0 50px 100px rgba(0,0,0,0.5)',
                        }}>
                            <motion.div
                                layoutId={`project-image-${project.id}`}
                                onMouseEnter={() => setIsHovered(true)}
                                onMouseLeave={() => setIsHovered(false)}
                                transition={{ duration: 0.3, ease: "easeOut" }}
                                style={{
                                    position: 'relative',
                                    width: '100%',
                                    height: 'auto',
                                    aspectRatio: '16/9',
                                    borderRadius: isMobile ? '16px' : '32px',
                                    overflow: 'hidden',
                                    background: '#0a0a0a',
                                    willChange: 'transform'
                                }}
                            >
                                {project.images.map((img, i) => (
                                    <div key={i} style={{
                                        position: 'absolute', inset: 0,
                                        opacity: i === currentImageIndex ? 1 : 0,
                                        transform: i === currentImageIndex ? 'scale(1)' : 'scale(1.08)',
                                        transition: 'all 1.2s cubic-bezier(0.16, 1, 0.3, 1)',
                                        zIndex: i === currentImageIndex ? 1 : 0
                                    }}>
                                        <img src={img} style={{ width: '100%', height: '100%', objectFit: 'cover' }} alt="" />
                                        <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to top, rgba(0,0,0,0.6) 0%, transparent 40%)' }} />
                                    </div>
                                ))}

                                {/* Manual Nav Controls */}
                                {project.images.length > 1 && (
                                    <>
                                        <button onClick={handlePrev} style={{
                                            position: 'absolute', left: isMobile ? '8px' : '30px', top: '50%', transform: 'translateY(-50%)',
                                            width: isMobile ? '36px' : '60px', height: isMobile ? '36px' : '60px', borderRadius: '50%', background: 'rgba(255,255,255,0.1)',
                                            backdropFilter: 'blur(10px)', border: '1px solid rgba(255,255,255,0.2)', color: 'white',
                                            display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer',
                                            zIndex: 20, transition: 'all 0.3s'
                                        }} onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.2)'; if (!isMobile) e.currentTarget.style.left = '25px'; }} onMouseLeave={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.1)'; if (!isMobile) e.currentTarget.style.left = '30px'; }}>
                                            <ChevronLeft size={isMobile ? 18 : 28} />
                                        </button>
                                        <button onClick={handleNext} style={{
                                            position: 'absolute', right: isMobile ? '8px' : '30px', top: '50%', transform: 'translateY(-50%)',
                                            width: isMobile ? '36px' : '60px', height: isMobile ? '36px' : '60px', borderRadius: '50%', background: 'rgba(255,255,255,0.1)',
                                            backdropFilter: 'blur(10px)', border: '1px solid rgba(255,255,255,0.2)', color: 'white',
                                            display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer',
                                            zIndex: 20, transition: 'all 0.3s'
                                        }} onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.2)'; if (!isMobile) e.currentTarget.style.right = '25px'; }} onMouseLeave={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.1)'; if (!isMobile) e.currentTarget.style.right = '30px'; }}>
                                            <ChevronRight size={isMobile ? 18 : 28} />
                                        </button>
                                    </>
                                )}

                                {/* Indicator Dots */}
                                <div style={{ position: 'absolute', bottom: '30px', left: '0', right: '0', display: 'flex', justifyContent: 'center', gap: '12px', zIndex: 10 }}>
                                    {project.images.map((_, i) => (
                                        <div key={i} onClick={() => setCurrentImageIndex(i)} style={{
                                            width: i === currentImageIndex ? '40px' : '10px', height: '10px', borderRadius: '5px',
                                            background: 'white', opacity: i === currentImageIndex ? 1 : 0.3,
                                            cursor: 'pointer', transition: 'all 0.4s'
                                        }} />
                                    ))}
                                </div>
                            </motion.div>
                        </div>

                        {/* Scroll for More Indicator */}
                        <div style={{
                            position: 'absolute', bottom: isMobile ? '30px' : '40px', left: '50%', transform: 'translateX(-50%)',
                            display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '15px',
                            color: 'rgba(255,255,255,0.5)', zIndex: 10, pointerEvents: 'none',
                            animation: 'fadeIn 1s ease-out 1.5s both'
                        }}>
                            <span style={{ fontSize: '0.65rem', fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.25em' }}>Scroll for more</span>
                            <div style={{
                                width: '24px', height: '42px', borderRadius: '15px', border: '2px solid rgba(255,255,255,0.2)',
                                display: 'flex', justifyContent: 'center', padding: '6px'
                            }}>
                                <div style={{
                                    width: '2px', height: '8px', borderRadius: '2px', background: '#60a5fa',
                                    animation: 'scrollWheel 1.5s ease-in-out infinite',
                                    boxShadow: '0 0 10px #60a5fa'
                                }} />
                            </div>
                        </div>
                    </div>

                    {/* Content Matrix */}
                    <div style={{
                        display: 'grid',
                        gridTemplateColumns: isMobile ? '1fr' : '1.8fr 1fr',
                        gap: '40px',
                        position: 'relative', zIndex: 2,
                        padding: isMobile ? '20px' : '0 0 60px 0',
                        marginTop: isMobile ? '0' : '40px'
                    }}>
                        {/* Primary Info */}
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '40px' }}>
                            <GlassPanel>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '24px' }}>
                                    <div style={{ padding: '6px 14px', background: 'rgba(96,165,250,0.15)', color: '#60a5fa', borderRadius: '50px', fontSize: '0.75rem', fontWeight: 950, textTransform: 'uppercase', letterSpacing: '0.1em' }}>More Details</div>
                                    <div style={{ width: '4px', height: '4px', borderRadius: '50%', background: 'rgba(255,255,255,0.2)' }} />
                                    <div style={{ fontSize: '0.75rem', fontWeight: 800, color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase' }}>Project ID: #{project.id.toString().slice(-6).toUpperCase()}</div>
                                </div>
                                <h1 style={{
                                    margin: 0, fontSize: isMobile ? (windowWidth < 480 ? '2.2rem' : '3.2rem') : '5rem', fontWeight: 950,
                                    color: 'white', letterSpacing: '-0.05em', lineHeight: 1.1, marginBottom: '24px',
                                    textTransform: 'uppercase'
                                }}>{displayTitle}</h1>
                                <p style={{
                                    margin: 0, fontSize: '1.35rem', lineHeight: 1.7, color: 'rgba(255,255,255,0.75)',
                                    fontWeight: 400, borderLeft: '3px solid #60a5fa', paddingLeft: '24px'
                                }}>{displayFullDescription}</p>
                            </GlassPanel>

                            <GlassPanel>
                                <h3 style={{ margin: '0 0 35px 0', fontSize: '0.85rem', fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.25em', color: '#60a5fa' }}>Technological Blueprint</h3>
                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: '16px' }}>
                                    {displayTags.map((tag, i) => (
                                        <div key={i} style={{
                                            display: 'flex', alignItems: 'center', gap: '14px', padding: '16px 20px',
                                            background: `${tag.color}11`, borderRadius: '24px',
                                            border: `1px solid ${tag.color}33`, transition: 'all 0.4s cubic-bezier(0.16, 1, 0.3, 1)',
                                            cursor: 'default'
                                        }} onMouseEnter={e => {
                                            e.currentTarget.style.background = `${tag.color}22`;
                                            e.currentTarget.style.borderColor = tag.color;
                                            e.currentTarget.style.transform = 'translateY(-4px)';
                                            e.currentTarget.style.boxShadow = `0 10px 20px -10px ${tag.color}88`;
                                        }} onMouseLeave={e => {
                                            e.currentTarget.style.background = `${tag.color}11`;
                                            e.currentTarget.style.borderColor = `${tag.color}33`;
                                            e.currentTarget.style.transform = 'translateY(0)';
                                            e.currentTarget.style.boxShadow = 'none';
                                        }}>
                                            <div style={{ width: '28px', height: '28px', color: tag.color }}>
                                                {tag.icon ? (
                                                    typeof tag.icon === 'string' && tag.icon.startsWith('<svg') ?
                                                        <div style={{ width: '100%', height: '100%' }} dangerouslySetInnerHTML={{ __html: tag.icon }} /> :
                                                        <img src={tag.icon} style={{ width: '100%', height: '100%', filter: `drop-shadow(0 0 8px ${tag.color}88)` }} alt="" />
                                                ) : <div style={{ width: '10px', height: '10px', borderRadius: '50%', background: tag.color, boxShadow: `0 0 10px ${tag.color}` }} />}
                                            </div>
                                            <span style={{ fontSize: '0.95rem', fontWeight: 900, color: 'white' }}>{tag.name}</span>
                                        </div>
                                    ))}
                                </div>
                            </GlassPanel>
                        </div>

                        {/* Sidebar / Actions */}
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '32px' }}>
                            {/* Action Link Hub */}
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '16px' }}>
                                {(project.liveLink || project.demoLink) && (
                                    <a href={project.liveLink || project.demoLink} onClick={handleLiveClick} target="_blank" rel="noopener noreferrer" style={{
                                        height: '90px', background: '#ffffff', color: '#000', borderRadius: '28px',
                                        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '8px',
                                        textDecoration: 'none', transition: 'all 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275)',
                                        boxShadow: '0 15px 35px -5px rgba(255, 255, 255, 0.2)',
                                        border: '1px solid rgba(255,255,255,0.8)'
                                    }} onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-6px) scale(1.02)'; e.currentTarget.style.boxShadow = '0 25px 50px -10px rgba(255, 255, 255, 0.3)'; }} onMouseLeave={e => { e.currentTarget.style.transform = 'translateY(0) scale(1)'; e.currentTarget.style.boxShadow = '0 15px 35px -5px rgba(255, 255, 255, 0.2)'; }}>
                                        <ExternalLink size={24} />
                                        <span style={{ fontSize: '0.75rem', fontWeight: 950, textTransform: 'uppercase', letterSpacing: '0.12em' }}>Live View</span>
                                    </a>
                                )}
                                {project.downloadLink && (
                                    <a href={project.downloadLink} onClick={handleDownloadClick} target="_blank" rel="noopener noreferrer" style={{
                                        height: '90px',
                                        background: '#ffffff',
                                        color: '#000', borderRadius: '28px',
                                        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '8px',
                                        textDecoration: 'none', transition: 'all 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275)',
                                        boxShadow: '0 15px 35px -5px rgba(255, 255, 255, 0.2)',
                                        border: '1px solid rgba(255,255,255,0.8)'
                                    }} onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-6px) scale(1.03)'; e.currentTarget.style.boxShadow = '0 25px 50px -10px rgba(255, 255, 255, 0.3)'; }} onMouseLeave={e => { e.currentTarget.style.transform = 'translateY(0) scale(1)'; e.currentTarget.style.boxShadow = '0 15px 35px -5px rgba(255, 255, 255, 0.2)'; }}>
                                        <Upload size={24} />
                                        <span style={{ fontSize: '0.75rem', fontWeight: 950, textTransform: 'uppercase', letterSpacing: '0.15em' }}>Download the App</span>
                                    </a>
                                )}
                                {project.repoLink && (
                                    <a href={project.repoLink} onClick={handleGithubClick} target="_blank" rel="noopener noreferrer" style={{
                                        height: '90px', background: 'rgba(255,255,255,0.03)', color: '#fff', borderRadius: '28px',
                                        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '8px',
                                        textDecoration: 'none', transition: 'all 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275)',
                                        border: '1px solid rgba(255,255,255,0.08)'
                                    }} onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-6px) scale(1.02)'; e.currentTarget.style.background = 'rgba(255,255,255,0.08)'; e.currentTarget.style.borderColor = 'rgba(255,255,255,0.2)'; }} onMouseLeave={e => { e.currentTarget.style.transform = 'translateY(0) scale(1)'; e.currentTarget.style.background = 'rgba(255,255,255,0.03)'; e.currentTarget.style.borderColor = 'rgba(255,255,255,0.08)'; }}>
                                        <Github size={24} />
                                        <span style={{ fontSize: '0.75rem', fontWeight: 950, textTransform: 'uppercase', letterSpacing: '0.12em' }}>GitHub</span>
                                    </a>
                                )}
                            </div>

                            {/* Creative Team Section */}
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '15px', padding: '0 8px' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                                        <div style={{ width: '3px', height: '18px', background: '#60a5fa', borderRadius: '4px' }} />
                                        <h3 style={{ margin: 0, fontSize: '0.8rem', fontWeight: 950, textTransform: 'uppercase', letterSpacing: '0.35em', color: 'white' }}>Project Team</h3>
                                    </div>
                                    <div style={{ fontSize: '0.65rem', fontWeight: 900, color: 'rgba(96,165,250,0.5)', background: 'rgba(96,165,250,0.1)', padding: '2px 8px', borderRadius: '4px', fontFamily: 'monospace' }}>COUNT::{project.contributors.length.toString().padStart(2, '0')}</div>
                                </div>

                                <div style={{ position: 'relative' }}>
                                    <div className="creators-scroll-container" style={{
                                        display: 'flex',
                                        flexDirection: 'column',
                                        gap: '10px',
                                        maxHeight: '340px',
                                        overflowY: 'auto',
                                        padding: '5px 8px 15px 5px',
                                        scrollbarWidth: 'none',
                                        msOverflowStyle: 'none'
                                    }}>
                                        {project.contributors.map((c, i) => (
                                            <div key={i} onClick={() => onContributorClick(c)} style={{
                                                position: 'relative',
                                                background: 'rgba(255,255,255,0.02)',
                                                borderRadius: '24px',
                                                padding: '16px 20px',
                                                cursor: 'pointer',
                                                transition: 'all 0.6s cubic-bezier(0.16, 1, 0.3, 1)',
                                                display: 'flex',
                                                alignItems: 'center',
                                                gap: '18px',
                                                border: '1px solid rgba(255,255,255,0.03)',
                                                overflow: 'hidden'
                                            }} onMouseEnter={e => {
                                                e.currentTarget.style.background = 'rgba(255,255,255,0.06)';
                                                e.currentTarget.style.borderColor = 'rgba(96,165,250,0.3)';
                                                e.currentTarget.style.transform = 'translateY(-4px)';
                                                e.currentTarget.style.boxShadow = '0 20px 40px rgba(0,0,0,0.25)';
                                                const roleBadge = e.currentTarget.querySelector('.role-badge') as HTMLElement;
                                                if (roleBadge) { roleBadge.style.background = 'rgba(96,165,250,0.25)'; roleBadge.style.borderColor = '#60a5fa'; }
                                            }} onMouseLeave={e => {
                                                e.currentTarget.style.background = 'rgba(255,255,255,0.02)';
                                                e.currentTarget.style.borderColor = 'rgba(255,255,255,0.03)';
                                                e.currentTarget.style.transform = 'translateY(0)';
                                                e.currentTarget.style.boxShadow = 'none';
                                                const roleBadge = e.currentTarget.querySelector('.role-badge') as HTMLElement;
                                                if (roleBadge) { roleBadge.style.background = 'rgba(96,165,250,0.1)'; roleBadge.style.borderColor = 'rgba(96,165,250,0.2)'; }
                                            }}>
                                                <div style={{
                                                    position: 'relative', flexShrink: 0,
                                                    width: '50px', height: '50px', borderRadius: '18px', overflow: 'hidden',
                                                    border: '2px solid rgba(255,255,255,0.05)',
                                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                    backgroundColor: 'rgba(255,255,255,0.03)'
                                                }}>
                                                    {c.image ? (
                                                        <img
                                                            src={c.image}
                                                            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                                                            alt={c.name}
                                                        />
                                                    ) : (
                                                        <User size={24} className="text-zinc-500/50" />
                                                    )}
                                                </div>

                                                <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                                    <div style={{ fontWeight: 950, fontSize: '1.05rem', color: 'white', letterSpacing: '-0.02em', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{c.name}</div>

                                                    {/* Specialized Project Role Badge */}
                                                    <div className="role-badge" style={{
                                                        alignSelf: 'flex-start',
                                                        display: 'flex',
                                                        alignItems: 'center',
                                                        gap: '6px',
                                                        fontSize: '0.62rem',
                                                        fontWeight: 900,
                                                        textTransform: 'uppercase',
                                                        letterSpacing: '0.12em',
                                                        color: '#60a5fa',
                                                        background: 'rgba(96,165,250,0.1)',
                                                        padding: '4px 10px',
                                                        borderRadius: '8px',
                                                        border: '1px solid rgba(96,165,250,0.2)',
                                                        transition: 'all 0.4s ease'
                                                    }}>
                                                        <span style={{ fontSize: '0.55rem', opacity: 0.5, fontFamily: 'monospace' }}>ASSIGNMENT //</span>
                                                        {c.role}
                                                    </div>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                    {/* Fog indicated more content if scrollable */}
                                    {project.contributors.length > 3 && (
                                        <div style={{
                                            position: 'absolute', bottom: 0, left: 0, right: 0, height: '60px',
                                            background: 'linear-gradient(to top, rgba(10,10,10,0.95), transparent)',
                                            pointerEvents: 'none', borderRadius: '0 0 24px 24px', zIndex: 10
                                        }} />
                                    )}
                                </div>
                            </div>

                            {/* Analytics Panel */}
                            <div style={{
                                padding: '30px', borderRadius: '32px', background: 'linear-gradient(135deg, rgba(255,255,255,0.05) 0%, rgba(255,255,255,0.02) 100%)',
                                border: '1px solid rgba(255,255,255,0.08)', display: 'flex', flexDirection: 'column', gap: '25px'
                            }}>
                                <h3 style={{ margin: 0, fontSize: '0.75rem', fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.2em', color: 'rgba(255,255,255,0.4)' }}>Engagements</h3>
                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '15px' }}>
                                    <div style={{ textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                                        <div style={{ marginBottom: '8px' }}>
                                            <Counter
                                                value={typeof project.githubViews === 'number' ? project.githubViews : 0}
                                                fontSize={28}
                                                textColor="white"
                                                fontWeight={950}
                                                gradientHeight={0}
                                                gap={2}
                                            />
                                        </div>
                                        <div style={{ fontSize: '0.6rem', fontWeight: 900, color: '#60a5fa', textTransform: 'uppercase', letterSpacing: '0.15em' }}>Github</div>
                                    </div>
                                    <div style={{ textAlign: 'center', borderLeft: '1px solid rgba(255,255,255,0.05)', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                                        <div style={{ marginBottom: '8px' }}>
                                            <Counter
                                                value={typeof project.liveViews === 'number' ? project.liveViews : 0}
                                                fontSize={28}
                                                textColor="white"
                                                fontWeight={950}
                                                gradientHeight={0}
                                                gap={2}
                                            />
                                        </div>
                                        <div style={{ fontSize: '0.6rem', fontWeight: 900, color: '#60a5fa', textTransform: 'uppercase', letterSpacing: '0.15em' }}>Live</div>
                                    </div>
                                    <div style={{ textAlign: 'center', borderLeft: '1px solid rgba(255,255,255,0.05)', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                                        <div style={{ marginBottom: '8px' }}>
                                            <Counter
                                                value={typeof project.downloadViews === 'number' ? project.downloadViews : 0}
                                                fontSize={28}
                                                textColor="white"
                                                fontWeight={950}
                                                gradientHeight={0}
                                                gap={2}
                                            />
                                        </div>
                                        <div style={{ fontSize: '0.6rem', fontWeight: 900, color: '#60a5fa', textTransform: 'uppercase', letterSpacing: '0.15em' }}>Downloads</div>
                                    </div>
                                    <div style={{ textAlign: 'center', borderLeft: '1px solid rgba(255,255,255,0.05)', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                                        <div style={{ marginBottom: '8px' }}>
                                            <Counter
                                                value={typeof project.views === 'number' ? project.views : 0}
                                                fontSize={28}
                                                textColor="white"
                                                fontWeight={950}
                                                gradientHeight={0}
                                                gap={2}
                                            />
                                        </div>
                                        <div style={{ fontSize: '0.6rem', fontWeight: 900, color: '#60a5fa', textTransform: 'uppercase', letterSpacing: '0.15em' }}>Views</div>
                                    </div>
                                </div>
                                <div style={{ height: '4px', width: '100%', background: 'rgba(255,255,255,0.05)', borderRadius: '2px', overflow: 'hidden', marginTop: '5px' }}>
                                    <div style={{ height: '100%', width: '100%', background: 'linear-gradient(to right, #60a5fa, #3b82f6)', borderRadius: '2px', boxShadow: '0 0 15px rgba(96,165,250,0.5)' }} />
                                </div>
                            </div>
                        </div>
                    </div>
                </motion.div>
            </motion.div>

            <style dangerouslySetInnerHTML={{
                __html: `
                @keyframes slideUp { from { opacity: 0; transform: translateY(60px); } to { opacity: 1; transform: translateY(0); } }
                @keyframes slideDown { from { opacity: 1; transform: translateY(0); } to { opacity: 0; transform: translateY(60px); } }
                @keyframes fadeOut { from { opacity: 1; } to { opacity: 0; } }
                @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
                @keyframes scrollWheel { 
                    0% { transform: translateY(0); opacity: 1; } 
                    50% { transform: translateY(15px); opacity: 1; }
                    100% { transform: translateY(15px); opacity: 0; } 
                }
                ::-webkit-scrollbar { display: none; }
                * { scroll-behavior: smooth; }
            ` }} />
        </motion.div >,
        document.body
    );
};

export default MProjectView;
