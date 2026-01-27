import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Github, ExternalLink, ChevronLeft, ChevronRight, Upload, User, Play, Pause, Volume2, VolumeX, Maximize } from 'lucide-react';
import { useRef } from 'react';

// Import SVG icons
import htmlIcon from '../assets/svgs/html.svg';
import cssIcon from '../assets/svgs/css.svg';
import jsIcon from '../assets/svgs/javascript.svg';
import reactIcon from '../assets/svgs/react.svg';
import nodejsIcon from '../assets/svgs/nodejs.svg';
import firebaseIcon from '../assets/svgs/firebase.svg';

import { doc, onSnapshot, updateDoc, getDoc } from 'firebase/firestore';
import { db } from '../lib/firebase';


export const isVideoFile = (url: string) => {
    return url.split('?')[0].toLowerCase().match(/\.(mp4|webm|ogg|mov)$/) || url.includes('/videos/');
};

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

const GlassPanel = ({ children, style, className = "", isDark }: any) => (
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

const VideoPlayer = React.memo(({ src, isActive, isMobile, style }: { src: string, isActive: boolean, isMobile: boolean, style?: React.CSSProperties }) => {
    const videoRef = useRef<HTMLVideoElement>(null);
    const containerRef = useRef<HTMLDivElement>(null);
    const [playing, setPlaying] = useState(true);
    const [muted, setMuted] = useState(true);
    const [progress, setProgress] = useState(0);
    const [userInteracted, setUserInteracted] = useState(false);
    const [isDragging, setIsDragging] = useState(false);

    // Pause when tab/window becomes hidden
    useEffect(() => {
        const handleVisibilityChange = () => {
            if (document.hidden && playing && videoRef.current) {
                videoRef.current.pause();
                setPlaying(false);
            }
        };
        document.addEventListener('visibilitychange', handleVisibilityChange);
        return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
    }, [playing]);


    useEffect(() => {
        let isCancelled = false;
        const video = videoRef.current;
        if (!video) return;

        const handlePlay = async () => {
            try {
                if (isActive) {
                    if (video.paused) await video.play();
                    if (isCancelled) video.pause();
                } else {
                    video.pause();
                    video.currentTime = 0;
                    setUserInteracted(false);
                    setMuted(true);
                    setPlaying(true);
                }
            } catch (err) {
                // Ignore AbortError
            }
        };

        handlePlay();

        return () => {
            isCancelled = true;
        };
    }, [isActive]);

    const togglePlay = (e: React.MouseEvent) => {
        e.stopPropagation();
        const video = videoRef.current;
        if (!video) return;

        if (video.paused) {
            // If first time playing, start from beginning
            if (!userInteracted) {
                video.currentTime = 0;
                setUserInteracted(true);
            }
            video.play().catch(e => console.warn("Play failed", e));
            setPlaying(true);
        } else {
            video.pause();
            setPlaying(false);
        }
    };

    const toggleMute = (e: React.MouseEvent) => {
        e.stopPropagation();
        const video = videoRef.current;
        if (!video) return;

        const newMuted = !muted;
        setMuted(newMuted);

        // Sync with actual video element if needed (though prop should handle it)
        // If un-muting for the first time, trigger full playback from beginning
        if (!newMuted && !userInteracted) {
            video.currentTime = 0;
            setUserInteracted(true);
            video.play().catch(() => { });
            setPlaying(true);
        }
    };

    const handleTimeUpdate = () => {
        if (videoRef.current && !isDragging) {
            const video = videoRef.current;

            // Sync playing state if desynced
            if (!video.paused && !playing) setPlaying(true);
            if (video.paused && playing) setPlaying(false);

            // Preview Loop: until user interacts, play frames around (0-3s)
            if (!userInteracted && video.currentTime >= 3) {
                video.currentTime = 0;
            }

            const p = (video.currentTime / video.duration) * 100;
            setProgress(p);
        }
    };

    const handleScrub = (e: any) => {
        if (!containerRef.current || !videoRef.current) return;

        // Find the progress section element
        const progressContainer = e.currentTarget.closest('[data-testid="progress-container"]');
        if (!progressContainer) return;

        const rect = progressContainer.getBoundingClientRect();
        const clientX = e.type.startsWith('touch') ? e.touches[0].clientX : e.clientX;
        const x = Math.max(0, Math.min(clientX - rect.left, rect.width));
        const ratio = x / rect.width;

        const newTime = ratio * videoRef.current.duration;
        videoRef.current.currentTime = newTime;
        setProgress(ratio * 100);

        if (!userInteracted) setUserInteracted(true);
    };

    // Global listener for dragging
    useEffect(() => {
        if (!isDragging) return;

        const onMouseMove = (e: MouseEvent) => {
            const progressContainer = document.querySelector('[data-testid="progress-container"]');
            if (progressContainer && videoRef.current) {
                const rect = progressContainer.getBoundingClientRect();
                const x = Math.max(0, Math.min(e.clientX - rect.left, rect.width));
                const ratio = x / rect.width;
                videoRef.current.currentTime = ratio * videoRef.current.duration;
                setProgress(ratio * 100);
            }
        };

        const onMouseUp = () => {
            setIsDragging(false);
        };

        window.addEventListener('mousemove', onMouseMove);
        window.addEventListener('mouseup', onMouseUp);
        return () => {
            window.removeEventListener('mousemove', onMouseMove);
            window.removeEventListener('mouseup', onMouseUp);
        };
    }, [isDragging]);

    const toggleFullscreen = (e: React.MouseEvent) => {
        e.stopPropagation();
        if (containerRef.current) {
            if (!document.fullscreenElement) {
                if (containerRef.current.requestFullscreen) {
                    containerRef.current.requestFullscreen();
                } else if ((containerRef.current as any).webkitRequestFullscreen) {
                    (containerRef.current as any).webkitRequestFullscreen();
                }
            } else {
                if (document.exitFullscreen) {
                    document.exitFullscreen();
                }
            }
        }
    };

    return (
        <div ref={containerRef} style={{ width: '100%', height: '100%', position: 'absolute', inset: 0, ...style }}>
            <video
                ref={videoRef}
                src={src}
                loop={userInteracted} // Only full loop if user interacts
                muted={muted}
                playsInline
                autoPlay // Try to autoplay muted preview loop
                onTimeUpdate={handleTimeUpdate}
                onClick={togglePlay}
                style={{
                    width: '100%',
                    height: '100%',
                    objectFit: 'contain',
                    cursor: 'pointer',
                    display: 'block',
                    margin: '0 auto',
                    position: 'relative',
                    zIndex: 1
                }}
            />
            <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to top, rgba(0,0,0,0.6) 0%, transparent 40%)', pointerEvents: 'none', zIndex: 2 }} />

            {/* Custom Blurry Controls - Separated UI */}
            <AnimatePresence>
                {isActive && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        style={{
                            position: 'absolute',
                            inset: 0,
                            pointerEvents: 'none',
                        }}
                    >
                        {/* 1. Large Centered Play/Pause Toggle */}
                        <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', pointerEvents: 'none' }}>
                            <AnimatePresence>
                                {(!userInteracted || !playing) && (
                                    <motion.div
                                        initial={{ scale: 0.8, opacity: 0 }}
                                        animate={{ scale: 1, opacity: 1 }}
                                        exit={{ scale: 0.8, opacity: 0 }}
                                        whileHover={{ scale: 1.1, backgroundColor: 'rgba(255,255,255,0.15)' }}
                                        style={{
                                            width: isMobile ? '54px' : '80px',
                                            height: isMobile ? '54px' : '80px',
                                            background: 'rgba(255,255,255,0.08)',
                                            backdropFilter: 'blur(32px)',
                                            WebkitBackdropFilter: 'blur(32px)',
                                            borderRadius: '50%',
                                            border: '1px solid rgba(255,255,255,0.2)',
                                            color: 'white',
                                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                                            pointerEvents: 'auto',
                                            cursor: 'pointer', zIndex: 6,
                                            boxShadow: '0 20px 40px rgba(0,0,0,0.4)',
                                        }}
                                        onClick={togglePlay}
                                    >
                                        <div style={{ marginLeft: isMobile ? '3px' : '5px' }}>
                                            <Play size={isMobile ? 22 : 32} fill="white" strokeWidth={1.5} />
                                        </div>
                                    </motion.div>
                                )}
                            </AnimatePresence>
                        </div>

                        {/* 2. Bottom Controls Wrapper */}
                        <div
                            style={{
                                position: 'absolute',
                                bottom: isMobile ? '12px' : '20px',
                                left: '0',
                                right: '0',
                                padding: isMobile ? '0 12px' : '0 25px',
                                display: 'flex',
                                flexDirection: 'column',
                                alignItems: 'stretch',
                                gap: isMobile ? '6px' : '8px',
                                pointerEvents: 'none',
                                zIndex: 5,
                                transition: 'all 0.4s cubic-bezier(0.16, 1, 0.3, 1)'
                            }}
                        >
                            {/* Progress Bar (Always Top) */}
                            <div
                                style={{
                                    width: '100%',
                                    background: isMobile ? 'transparent' : 'rgba(255, 255, 255, 0.1)',
                                    backdropFilter: isMobile ? 'none' : 'blur(24px)',
                                    borderRadius: isMobile ? '0' : '16px',
                                    border: isMobile ? 'none' : '1px solid rgba(255, 255, 255, 0.15)',
                                    padding: isMobile ? '0' : '0 20px',
                                    display: 'flex',
                                    alignItems: 'center',
                                    pointerEvents: 'auto',
                                    height: isMobile ? '20px' : '32px',
                                    cursor: 'pointer'
                                }}
                                data-testid="progress-container"
                                onMouseDown={(e) => {
                                    setIsDragging(true);
                                    handleScrub(e);
                                }}
                                onClick={e => e.stopPropagation()}
                            >
                                <div style={{ flex: 1, height: isMobile ? '3px' : '5px', background: isMobile ? 'rgba(255,255,255,0.2)' : 'rgba(255,255,255,0.1)', borderRadius: '4px', position: 'relative', overflow: 'hidden' }}>
                                    <div style={{
                                        position: 'absolute',
                                        left: 0,
                                        top: 0,
                                        height: '100%',
                                        width: `${progress}%`,
                                        background: 'linear-gradient(90deg, #60a5fa 0%, #3b82f6 50%, #2563eb 100%)',
                                        boxShadow: '0 0 15px rgba(96, 165, 250, 0.4)',
                                        transition: isDragging ? 'none' : 'width 0.1s linear',
                                        borderRadius: '4px'
                                    }} />
                                    {/* Thumb Indicator */}
                                    <div style={{
                                        position: 'absolute',
                                        left: `${progress}%`,
                                        top: '50%',
                                        transform: 'translate(-50%, -50%)',
                                        width: '16px',
                                        height: '16px',
                                        background: 'white',
                                        borderRadius: '50%',
                                        boxShadow: '0 0 10px rgba(0,0,0,0.5)',
                                        opacity: isDragging ? 1 : 0,
                                        transition: 'opacity 0.2s'
                                    }} />
                                </div>
                            </div>

                            {/* Hub Row (Buttons under progress) */}
                            <div style={{ display: 'flex', gap: '12px', justifyContent: isMobile ? 'space-between' : 'flex-end', alignItems: 'center' }}>
                                {/* Desktop Play Button Hub */}
                                {!isMobile && (
                                    <div style={{
                                        background: 'rgba(255, 255, 255, 0.1)',
                                        backdropFilter: 'blur(24px)',
                                        borderRadius: '16px',
                                        border: '1px solid rgba(255, 255, 255, 0.15)',
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        pointerEvents: 'auto',
                                        height: '40px',
                                        width: '60px', // Fixed width for consistent hit area
                                        overflow: 'hidden'
                                    }}>
                                        <button onClick={togglePlay} style={{ width: '100%', height: '100%', background: 'none', border: 'none', color: 'white', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                            {(userInteracted && playing) ? <Pause size={18} fill="white" style={{ pointerEvents: 'none' }} /> : <Play size={18} fill="white" style={{ pointerEvents: 'none' }} />}
                                        </button>
                                    </div>
                                )}

                                {/* Action Hub */}
                                <div
                                    style={{
                                        background: 'rgba(255, 255, 255, 0.1)',
                                        backdropFilter: 'blur(24px)',
                                        borderRadius: isMobile ? '12px' : '16px',
                                        border: '1px solid rgba(255, 255, 255, 0.15)',
                                        padding: 0, // Remove padding, buttons fill space
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: 0, // Remove gap, use button padding
                                        pointerEvents: 'auto',
                                        height: isMobile ? '36px' : '40px',
                                        overflow: 'hidden'
                                    }}
                                    onClick={e => e.stopPropagation()}
                                >
                                    {isMobile && (
                                        <button onClick={togglePlay} style={{ height: '100%', padding: '0 12px', background: 'none', border: 'none', color: 'white', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                            {(userInteracted && playing) ? <Pause size={16} fill="white" style={{ pointerEvents: 'none' }} /> : <Play size={16} fill="white" style={{ pointerEvents: 'none' }} />}
                                        </button>
                                    )}
                                    <div style={{ display: 'flex', alignItems: 'center', height: '100%' }}>
                                        <button onClick={toggleMute} style={{ height: '100%', padding: '0 12px', background: 'none', border: 'none', color: 'white', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                            {muted ? <VolumeX size={16} style={{ pointerEvents: 'none' }} /> : <Volume2 size={16} style={{ pointerEvents: 'none' }} />}
                                        </button>
                                        <button onClick={toggleFullscreen} style={{ height: '100%', padding: '0 12px', background: 'none', border: 'none', color: 'white', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                            <Maximize size={16} style={{ pointerEvents: 'none' }} />
                                        </button>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
});

const MProjectView = ({ project: initialProject, onClose, onContributorClick }: MProjectViewProps) => {
    const [project, setProject] = useState<Project>(initialProject);
    const [currentImageIndex, setCurrentImageIndex] = useState(0);
    const [isDark, setIsDark] = useState(false);
    const [isHovered, setIsHovered] = useState(false);
    const [isMobile, setIsMobile] = useState(false);
    const [windowWidth, setWindowWidth] = useState(window.innerWidth);
    const [availableTags, setAvailableTags] = useState<any[]>([]);

    const sortedMedia = React.useMemo(() => {
        return [...(project.images || [])].sort((a, b) => {
            const isVidA = a.split('?')[0].toLowerCase().match(/\.(mp4|webm|ogg|mov)$/) || a.includes('/videos/');
            const isVidB = b.split('?')[0].toLowerCase().match(/\.(mp4|webm|ogg|mov)$/) || b.includes('/videos/');
            if (isVidA && !isVidB) return -1;
            if (!isVidA && isVidB) return 1;
            return 0;
        });
    }, [project.images]);

    // Auto-slide Gallery
    useEffect(() => {
        let interval: ReturnType<typeof setInterval> | undefined;
        const currentMedia = sortedMedia[currentImageIndex];
        const isCurrentVideo = currentMedia && isVideoFile(currentMedia);

        if (sortedMedia && sortedMedia.length > 1 && !isHovered && !isCurrentVideo) {
            interval = setInterval(() => {
                setCurrentImageIndex((prev) => (prev + 1) % sortedMedia.length);
            }, 5000);
        }
        return () => clearInterval(interval);
    }, [sortedMedia, isHovered, currentImageIndex]);

    const handleNext = (e: React.MouseEvent) => {
        e.stopPropagation();
        setCurrentImageIndex((prev) => (prev + 1) % sortedMedia.length);
    };

    const handlePrev = (e: React.MouseEvent) => {
        e.stopPropagation();
        setCurrentImageIndex((prev) => (prev - 1 + sortedMedia.length) % sortedMedia.length);
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
                backgroundImage: `url(${sortedMedia[currentImageIndex]})`,
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
                            maxHeight: '80vh', // Prevent vertical overflow
                            zIndex: 1,
                            borderRadius: isMobile ? '16px' : '32px',
                            boxShadow: '0 50px 100px rgba(0,0,0,0.5)',
                            display: 'flex',
                            flexDirection: 'column'
                        }}>
                            <motion.div
                                onMouseEnter={() => setIsHovered(true)}
                                onMouseLeave={() => setIsHovered(false)}
                                initial={{ opacity: 0, scale: 0.95 }}
                                animate={{ opacity: 1, scale: 1 }}
                                transition={{ duration: 0.4, ease: "easeOut" }}
                                style={{
                                    position: 'relative',
                                    width: '100%',
                                    height: 'auto',
                                    aspectRatio: isMobile ? '16/9' : '16/9',
                                    maxHeight: '80vh',
                                    borderRadius: isMobile ? '16px' : '32px',
                                    overflow: 'hidden',
                                    background: '#000',
                                    willChange: 'transform' // Ensure hardware acceleration
                                }}
                            >
                                <div style={{ position: 'absolute', inset: 0 }}>
                                    {sortedMedia.map((media, i) => (
                                        <div key={i} style={{
                                            position: 'absolute', inset: 0,
                                            opacity: i === currentImageIndex ? 1 : 0,
                                            transform: i === currentImageIndex ? 'scale(1)' : 'scale(1.08)',
                                            transition: 'all 1.2s cubic-bezier(0.16, 1, 0.3, 1)',
                                            pointerEvents: i === currentImageIndex ? 'auto' : 'none',
                                            zIndex: i === currentImageIndex
                                                ? (isVideoFile(media) ? 3 : 1)
                                                : 0
                                        }}>
                                            {isVideoFile(media) ? (
                                                <VideoPlayer src={media} isActive={i === currentImageIndex} isMobile={isMobile} />
                                            ) : (
                                                <div style={{ position: 'absolute', inset: 0 }}>
                                                    <img src={media} style={{ width: '100%', height: '100%', objectFit: 'cover', position: 'absolute', inset: 0, zIndex: 1 }} alt="" />
                                                    <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to top, rgba(0,0,0,0.6) 0%, transparent 40%)', zIndex: 2 }} />
                                                </div>
                                            )}
                                        </div>
                                    ))}
                                </div>

                                {/* Manual Nav Controls */}
                                {sortedMedia.length > 1 && (
                                    <>
                                        <button onClick={handlePrev} style={{
                                            position: 'absolute', left: isMobile ? '4px' : '30px', top: '50%', transform: 'translateY(-50%)',
                                            width: isMobile ? '32px' : '60px', height: isMobile ? '32px' : '60px', borderRadius: '50%', background: 'rgba(255,255,255,0.1)',
                                            backdropFilter: 'blur(10px)', border: '1px solid rgba(255,255,255,0.2)', color: 'white',
                                            display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer',
                                            zIndex: 8, transition: 'all 0.3s'
                                        }}>
                                            <ChevronLeft size={isMobile ? 16 : 28} />
                                        </button>
                                        <button onClick={handleNext} style={{
                                            position: 'absolute', right: isMobile ? '4px' : '30px', top: '50%', transform: 'translateY(-50%)',
                                            width: isMobile ? '32px' : '60px', height: isMobile ? '32px' : '60px', borderRadius: '50%', background: 'rgba(255,255,255,0.1)',
                                            backdropFilter: 'blur(10px)', border: '1px solid rgba(255,255,255,0.2)', color: 'white',
                                            display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer',
                                            zIndex: 8, transition: 'all 0.3s'
                                        }}>
                                            <ChevronRight size={isMobile ? 16 : 28} />
                                        </button>
                                    </>
                                )}

                                {/* Indicator Dots (Hidden on mobile to save space) */}
                                {!isMobile && (
                                    <div style={{ position: 'absolute', bottom: '30px', left: '0', right: '0', display: 'flex', justifyContent: 'center', gap: '12px', zIndex: 2 }}>
                                        {sortedMedia.map((_, i) => (
                                            <div key={i} onClick={() => setCurrentImageIndex(i)} style={{
                                                width: i === currentImageIndex ? '40px' : '10px', height: '10px', borderRadius: '5px',
                                                background: 'white', opacity: i === currentImageIndex ? 1 : 0.3,
                                                cursor: 'pointer', transition: 'all 0.4s'
                                            }} />
                                        ))}
                                    </div>
                                )}
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
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '40px' }}>
                            <GlassPanel isDark={isDark}>
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

                            <GlassPanel isDark={isDark}>
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
                                            <div style={{ width: '28px', height: '28px', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                                {tag.icon ? (
                                                    (typeof tag.icon === 'string' && (tag.icon.startsWith('http') || tag.icon.includes('/o/'))) ?
                                                        <img
                                                            src={tag.icon}
                                                            style={{
                                                                width: '100%',
                                                                height: '100%',
                                                                objectFit: 'contain',
                                                                filter: `drop-shadow(0 0 8px ${tag.color}88)`
                                                            }}
                                                            alt={tag.name}
                                                        />
                                                        : (typeof tag.icon === 'string' && tag.icon.startsWith('<svg')) ?
                                                            <div
                                                                style={{ width: '100%', height: '100%', color: tag.color }}
                                                                dangerouslySetInnerHTML={{ __html: tag.icon }}
                                                            />
                                                            : <div style={{ width: '12px', height: '12px', borderRadius: '50%', background: tag.color, boxShadow: `0 0 10px ${tag.color}` }} />
                                                ) : <div style={{ width: '12px', height: '12px', borderRadius: '50%', background: tag.color, boxShadow: `0 0 10px ${tag.color}` }} />}
                                            </div>
                                            <span style={{ fontSize: windowWidth < 480 ? '0.85rem' : '0.95rem', fontWeight: 900, color: 'white', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{tag.name}</span>
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
                                            <span style={{ fontSize: '30px', fontWeight: 950, color: 'white' }}>
                                                {typeof project.githubViews === 'number' ? project.githubViews : 0}
                                            </span>
                                        </div>
                                        <div style={{ fontSize: '0.6rem', fontWeight: 900, color: '#60a5fa', textTransform: 'uppercase', letterSpacing: '0.15em' }}>Github</div>
                                    </div>
                                    <div style={{ textAlign: 'center', borderLeft: '1px solid rgba(255,255,255,0.05)', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                                        <div style={{ marginBottom: '8px' }}>
                                            <span style={{ fontSize: '30px', fontWeight: 950, color: 'white' }}>
                                                {typeof project.liveViews === 'number' ? project.liveViews : 0}
                                            </span>
                                        </div>
                                        <div style={{ fontSize: '0.6rem', fontWeight: 900, color: '#60a5fa', textTransform: 'uppercase', letterSpacing: '0.15em' }}>Live</div>
                                    </div>
                                    <div style={{ textAlign: 'center', borderLeft: '1px solid rgba(255,255,255,0.05)', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                                        <div style={{ marginBottom: '8px' }}>
                                            <span style={{ fontSize: '30px', fontWeight: 950, color: 'white' }}>
                                                {typeof project.downloadViews === 'number' ? project.downloadViews : 0}
                                            </span>
                                        </div>
                                        <div style={{ fontSize: '0.6rem', fontWeight: 900, color: '#60a5fa', textTransform: 'uppercase', letterSpacing: '0.15em' }}>Downloads</div>
                                    </div>
                                    <div style={{ textAlign: 'center', borderLeft: '1px solid rgba(255,255,255,0.05)', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                                        <div style={{ marginBottom: '8px' }}>
                                            <span style={{ fontSize: '30px', fontWeight: 950, color: 'white' }}>
                                                {typeof project.views === 'number' ? project.views : 0}
                                            </span>
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
                .modal-scroll-container::-webkit-scrollbar { display: none; }
                .creators-scroll-container::-webkit-scrollbar { display: none; }
                * { scroll-behavior: smooth; }
            ` }} />
        </motion.div>,
        document.body
    );
};

export default MProjectView;
