import React, { useState, useEffect, useRef } from 'react';
import { useDialog } from '../../ui/dialog';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'motion/react';
import { X, ExternalLink, ChevronLeft, ChevronRight, Download, User, Play, Pause, Volume2, VolumeX, Maximize } from 'lucide-react';
import { Github } from '../../ui/BrandIcons';
import Handwriting from '../../ui/Handwriting';
import { handwrite } from '../../lib/handwrite';
import { watchDoc } from '../../lib/liveDoc';
import { cachedDoc } from '../../lib/dataCache';
import { tagsOf } from './shape';
import { sanitizeSvg } from '../../lib/sanitize';
import { isVideoFile, getStackIcon, getTechColor, stillFrame } from '../../lib/projectUtils';
import { isLite, prefersReducedMotion } from '../../lib/device';
import { ProjectData as Project, ContributorData as Contributor, TagData as TagItem } from '../../types';
import { useBoilHold } from '../../book/paintKit';

interface MProjectViewProps {
    project: Project;
    onClose: () => void;
    onContributorClick: (contributor: Contributor) => void;
}

const INK = '#e9eaee';
const SOFT = 'rgba(233, 234, 238, 0.8)';
const MUTED = 'rgba(233, 234, 238, 0.55)';
const LINE = '1px solid rgba(255, 255, 255, 0.07)';
/** How much of the details shows under the pictures before any scroll (desktop, px). */
const PEEK = 130;
/** The room under the pictures that "the story" is written in (px). */
const STORY_GAP = { desktop: 96, mobile: 70 };
/** The notebook's margin, where the pen writes, and the space after it (desktop, px). */
const MARGIN = 200;
const GUTTER = 40;
const NAV: React.CSSProperties = {
    position: 'absolute', top: '50%', transform: 'translateY(-50%)', borderRadius: '50%',
    background: 'rgba(0,0,0,0.35)', backdropFilter: 'blur(10px)', border: '1px solid rgba(255,255,255,0.18)',
    color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', zIndex: 8
};

type BoxRef = React.RefObject<HTMLDivElement | null>;

/** Handwriting (ui/Handwriting) that the pen writes in once it scrolls into the popup's view. */
const InkOnView = ({ root, style, children }: React.PropsWithChildren<{ root: BoxRef; style?: React.CSSProperties }>) => {
    const ref = useRef<HTMLDivElement>(null);
    useEffect(() => {
        const el = ref.current;
        if (!el) return;
        let ink: Animation[] = [];
        const seen = new IntersectionObserver(([e]) => {
            if (!e.isIntersecting) return;
            seen.disconnect();
            ink = handwrite(el, { show: true });
        }, { root: root.current, threshold: 0.5 });
        seen.observe(el);
        return () => { seen.disconnect(); ink.forEach(a => a.cancel()); };
    }, [root]);
    return <div ref={ref} aria-hidden="true" style={{ opacity: 0, ...style }}>{children}</div>;
};

/** One line of the notebook: the pen's note in the margin, what it's about beside it. */
const NoteRow = ({ label, isMobile, root, children }: React.PropsWithChildren<{ label: string; isMobile: boolean; root: BoxRef }>) => (
    <section style={isMobile
        ? { padding: '26px 0', borderTop: LINE }
        : { display: 'grid', gridTemplateColumns: `${MARGIN}px 1fr`, gap: `${GUTTER}px`, padding: '34px 0', borderTop: LINE }}>
        <h2 className="sr-only">{label[0].toUpperCase() + label.slice(1)}</h2>
        <InkOnView root={root} style={{
            color: 'var(--accent)', fontSize: isMobile ? '24px' : '28px', lineHeight: 1,
            transform: 'rotate(-2deg)', transformOrigin: 'left', paddingTop: isMobile ? 0 : '2px', marginBottom: isMobile ? '14px' : 0
        }}>
            <Handwriting text={label} />
        </InkOnView>
        <div>{children}</div>
    </section>
);

const TagIcon = ({ icon, color }: { icon?: string | null; color: string }) => {
    const box: React.CSSProperties = { width: '18px', height: '18px', flexShrink: 0, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' };
    if (icon && (icon.startsWith('http') || icon.includes('/o/'))) return <img src={icon} alt="" style={{ ...box, objectFit: 'contain' }} />;
    if (icon && icon.startsWith('<svg')) return <span style={{ ...box, color }} dangerouslySetInnerHTML={{ __html: sanitizeSvg(icon) }} />;
    return <span style={box}><span style={{ width: '8px', height: '8px', borderRadius: '50%', background: color }} /></span>;
};

const VideoPlayer = React.memo(({ src, isActive, isMobile, style }: { src: string, isActive: boolean, isMobile: boolean, style?: React.CSSProperties }) => {
    const videoRef = useRef<HTMLVideoElement>(null);
    const containerRef = useRef<HTMLDivElement>(null);
    // A lite page (lib/device.ts) shows the first frame until the play button is tapped,
    // rather than streaming a muted preview loop on a phone's data.
    const lite = isLite();
    const [playing, setPlaying] = useState(!lite);
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
                    if (video.paused && !lite) await video.play();
                    if (isCancelled) video.pause();
                } else {
                    video.pause();
                    video.currentTime = 0;
                    setUserInteracted(false);
                    setMuted(true);
                    setPlaying(!lite);
                }
            } catch {
                // Ignore AbortError
            }
        };

        handlePlay();

        return () => {
            isCancelled = true;
        };
    }, [isActive, lite]);

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

    const handleScrub = (e: React.MouseEvent | React.TouchEvent) => {
        if (!containerRef.current || !videoRef.current) return;

        // Find the progress section element
        const progressContainer = e.currentTarget.closest('[data-testid="progress-container"]');
        if (!progressContainer) return;

        const rect = progressContainer.getBoundingClientRect();
        const clientX = ('touches' in e) ? (e as unknown as React.TouchEvent).touches[0].clientX : (e as React.MouseEvent).clientX;
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
                } else if ('webkitRequestFullscreen' in containerRef.current) {
                    (containerRef.current as { webkitRequestFullscreen: () => void }).webkitRequestFullscreen();
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
                src={lite ? stillFrame(src) : src}
                preload={lite ? 'metadata' : undefined}
                loop={userInteracted} // Only full loop if user interacts
                muted={muted}
                playsInline
                autoPlay={!lite} // Try to autoplay muted preview loop
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
                                        <button onClick={togglePlay} aria-label={(userInteracted && playing) ? 'Pause video' : 'Play video'} style={{ width: '100%', height: '100%', background: 'none', border: 'none', color: 'white', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
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
                                        <button onClick={togglePlay} aria-label={(userInteracted && playing) ? 'Pause video' : 'Play video'} style={{ height: '100%', padding: '0 12px', background: 'none', border: 'none', color: 'white', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                            {(userInteracted && playing) ? <Pause size={16} fill="white" style={{ pointerEvents: 'none' }} /> : <Play size={16} fill="white" style={{ pointerEvents: 'none' }} />}
                                        </button>
                                    )}
                                    <div style={{ display: 'flex', alignItems: 'center', height: '100%' }}>
                                        <button onClick={toggleMute} aria-label={muted ? 'Unmute video' : 'Mute video'} style={{ height: '100%', padding: '0 12px', background: 'none', border: 'none', color: 'white', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                            {muted ? <VolumeX size={16} style={{ pointerEvents: 'none' }} /> : <Volume2 size={16} style={{ pointerEvents: 'none' }} />}
                                        </button>
                                        <button onClick={toggleFullscreen} aria-label="Toggle fullscreen" style={{ height: '100%', padding: '0 12px', background: 'none', border: 'none', color: 'white', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
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

// shimmer-fast keyframes are now in globals.css

const ProjectMediaImage = ({ src }: { src: string }) => {
    const [isImageLoaded, setIsImageLoaded] = useState(false);
    return (
        <div style={{ position: 'absolute', inset: 0 }}>
            {/* shimmer-fast keyframes are in globals.css */}
            {/* Skeleton Loader Container */}
            <div 
                style={{
                    position: 'absolute',
                    inset: 0,
                    zIndex: 1,
                    backgroundColor: 'rgba(255, 255, 255, 0.05)',
                    opacity: isImageLoaded ? 0 : 1,
                    pointerEvents: 'none',
                    transition: 'opacity 1s ease-out',
                    overflow: 'hidden'
                }}
            >
                {/* Moving Light effect - stopped when loaded */}
                {!isImageLoaded && (
                    <div 
                        style={{
                            position: 'absolute',
                            inset: 0,
                            width: '100%',
                            height: '100%',
                            background: 'linear-gradient(90deg, transparent 0%, rgba(255, 255, 255, 0.2) 50%, transparent 100%)',
                            animation: 'shimmer-fast 0.6s infinite ease-in-out'
                        }}
                    />
                )}
            </div>
            <img 
                src={src} 
                onLoad={() => setIsImageLoaded(true)}
                style={{ 
                    width: '100%', 
                    height: '100%', 
                    objectFit: 'cover', 
                    position: 'absolute', 
                    inset: 0, 
                    zIndex: 1,
                    filter: isImageLoaded ? 'blur(0px)' : 'blur(20px)',
                    opacity: isImageLoaded ? 1 : 0,
                    transform: isImageLoaded ? 'scale(1)' : 'scale(1.05)',
                    transition: 'all 0.2s ease-out'
                }} 
                alt="" 
            />
            <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to top, rgba(0,0,0,0.6) 0%, transparent 40%)', zIndex: 2 }} />
        </div>
    );
};

const MProjectView = ({ project: initialProject, onClose, onContributorClick }: MProjectViewProps) => {
    useBoilHold();
    const [project, setProject] = useState<Project>(initialProject);
    // Re-sync local project state when a different project is passed in. Adjusting during
    // render (React's documented pattern) instead of in an effect avoids the extra render
    // pass where the modal would briefly show the OLD project's data.
    const [syncedFrom, setSyncedFrom] = useState<Project>(initialProject);
    if (syncedFrom !== initialProject) {
        setSyncedFrom(initialProject);
        setProject(initialProject);
    }
    const [currentImageIndex, setCurrentImageIndex] = useState(0);
    const [isHovered, setIsHovered] = useState(false);
    const boxRef = useRef<HTMLDivElement>(null);
    const detailsRef = useRef<HTMLDivElement>(null);
    const storyRef = useRef<HTMLButtonElement>(null);
    const storyInkRef = useRef<HTMLSpanElement>(null);
    // "the story" points at the details until the reader scrolls, then never again.
    const [storyGone, setStoryGone] = useState(false);
    const [isMobile, setIsMobile] = useState(false);
    const [windowWidth, setWindowWidth] = useState(typeof window !== 'undefined' ? window.innerWidth : 1024);
    // The cached copy (lib/dataCache) first, so the tags draw with their icons at once.
    const [availableTags, setAvailableTags] = useState<TagItem[]>(() => tagsOf(cachedDoc(['Tags', 'Tags'])));

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

    // Role, title, focus, Tab and Escape (see dialog.ts).
    const { dialogProps } = useDialog({ onClose, labelledBy: 'project-modal-title' });
    const handleClose = () => {
        onClose();
    };

    // Outbound clicks are announced, not written. The visit recorder puts them on
    // the session timeline and the Cloud Function rolls the totals into
    // Projects/{id}.Views - the counts shown below still come from that same map,
    // but a visitor's browser can no longer write to it.
    const outbound = (kind: 'live' | 'github' | 'download') => {
        if (!project.id) return;
        window.dispatchEvent(new CustomEvent('revil:project_outbound', {
            detail: { id: project.id.toString(), kind },
        }));
    };

    const handleGithubClick = () => {
        if (!project.repoLink || !project.id) return;
        outbound('github');
    };

    const handleLiveClick = () => {
        if ((!project.liveLink && !project.demoLink) || !project.id) return;
        outbound('live');
    };

    const handleDownloadClick = () => {
        if (!project.downloadLink || !project.id) return;
        outbound('download');
    };


    const displayTitle = project.title || project.name || 'Untitled project';
    const displayFullDescription = project.fullDescription || project.description || 'No description available.';

    // The first link is the main one, drawn solid.
    const liveHref = project.liveLink || project.demoLink;
    const links = [
        liveHref && { href: liveHref, label: 'Open the live site', icon: <ExternalLink size={18} />, onClick: handleLiveClick },
        project.downloadLink && { href: project.downloadLink, label: 'Download the app', icon: <Download size={18} />, onClick: handleDownloadClick },
        project.repoLink && { href: project.repoLink, label: 'Source on GitHub', icon: <Github size={18} />, onClick: handleGithubClick },
    ].filter(Boolean) as { href: string; label: string; icon: React.ReactNode; onClick: () => void }[];

    // How often it was opened and followed, only the counts that aren't zero.
    const tally = ([
        [project.views, 'view'],
        [project.downloadViews, 'download'],
        [project.liveViews, 'live site visit'],
        [project.githubViews, 'GitHub visit'],
    ] as [number | undefined, string][])
        .filter(([n]) => typeof n === 'number' && n > 0)
        .map(([n, word]) => `${n} ${word}${n === 1 ? '' : 's'}`)
        .join(', ');

    const toStory = () => {
        const box = boxRef.current, details = detailsRef.current;
        if (!box || !details) return;
        const top = box.scrollTop + details.getBoundingClientRect().top - box.getBoundingClientRect().top - 24;
        box.scrollTo({ top, behavior: prefersReducedMotion() ? 'auto' : 'smooth' });
    };

    // Write "the story" in once the pictures have settled, unless everything already fits.
    useEffect(() => {
        const box = boxRef.current;
        if (box && box.scrollHeight - box.clientHeight < 40) {
            if (storyRef.current) storyRef.current.style.display = 'none';
            return;
        }
        const ink = handwrite(storyInkRef.current, { show: true, delay: 1100 });
        return () => ink.forEach(a => a.cancel());
    }, []);

    const displayTags = (project.tags && project.tags.length > 0)
        ? project.tags.map(t => {
            const tagName = typeof t === 'string' ? t : t.name;
            const globalTag = availableTags.find(gt => gt.name.toLowerCase() === tagName.toLowerCase());
            return {
                name: tagName,
                color: (typeof t === 'object' ? t.color : null) || globalTag?.color || getTechColor(tagName),
                icon: (typeof t === 'object' ? t.iconSvg : null) || globalTag?.iconSvg || getStackIcon(tagName)
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
            })
        ];

    // Fetch Global Tags for Icons/Colors
    useEffect(() => watchDoc(['Tags', 'Tags'], (doc) => { if (doc) setAvailableTags(tagsOf(doc)); }), []);

    // Ref to track latest availableTags without causing effect re-runs
    const availableTagsRef = useRef<TagItem[]>(availableTags);
    useEffect(() => {
        availableTagsRef.current = availableTags;
    }, [availableTags]);

    // Sync with Firestore for real-time views
    useEffect(() => {
        if (!project.id) return;

        const resolveTag = (t: string | { name?: string; Name?: string; color?: string; Color?: string; iconSvg?: string; Icon?: string } | null | undefined) => {
            if (!t) return { name: 'Unknown', color: '#60a5fa', iconSvg: '' };
            const name = typeof t === 'string' ? t : (t.name || t.Name || 'Unix');
            // Use ref to get latest tags without causing re-subscription
            const globalTag = availableTagsRef.current.find(gt => gt.name.toLowerCase() === name.toLowerCase());

            return {
                name,
                color: (t && typeof t === 'object' && ('color' in t || 'Color' in t)) ? (t as { color?: string; Color?: string }).color || (t as { color?: string; Color?: string }).Color || (globalTag?.color || getTechColor(name)) : (globalTag?.color || getTechColor(name)),
                iconSvg: (t && typeof t === 'object' && ('iconSvg' in t || 'Icon' in t)) ? (t as { iconSvg?: string; Icon?: string }).iconSvg || (t as { iconSvg?: string; Icon?: string }).Icon || (globalTag?.iconSvg || getStackIcon(name) || '') : (globalTag?.iconSvg || getStackIcon(name) || '')
            };
        };

        // Fresh views AND project details, read when the project opens
        const unsub = watchDoc(['Projects', String(project.id)], (doc) => {
            if (doc) {
                const data = doc as {
                    Views?: Record<string, number>;
                    Stack?: string[] | Record<string, unknown>;
                    Tags?: Record<string, string | { Name?: string; Color?: string; Icon?: string }>;
                    Description?: string;
                    'Download Link'?: string;
                };

                // Also update contributors if they've changed in the background
                setProject(prev => {
                    const statusV = data.Views || {};
                    const rawStack = data.Stack || [];
                    const normalizedStack = (Array.isArray(rawStack) ? rawStack : Object.values(rawStack))
                        .map(t => resolveTag(t as string | { name?: string; Name?: string; color?: string; Color?: string; iconSvg?: string; Icon?: string }))
                        .filter(t => t.name !== 'Unix');

                    const rawTags = data.Tags ? Object.values(data.Tags) : [];
                    const normalizedTags = rawTags
                        .map(t => resolveTag(t as string | { name?: string; Name?: string; color?: string; Color?: string; iconSvg?: string; Icon?: string }))
                        .filter(t => t.name !== 'Unix');

                    const updated = {
                        ...prev,
                        views: Number(statusV.Project || 0) || 0,
                        githubViews: Number(statusV.Github || 0) || 0,
                        liveViews: Number(statusV.Live || 0) || 0,
                        downloadViews: Number(statusV.Download || 0) || 0,
                        stack: normalizedStack.map(t => t.name),
                        tags: normalizedStack.length > 0 ? normalizedStack : normalizedTags,
                        downloadLink: data['Download Link'] || ''
                    };

                    // If we have contributor data in the snapshot, keep the core details synced
                    if (data.Description) updated.description = data.Description;
                    return updated;
                });
            }
        });

        // The open itself is counted by the visit recorder: Projects.tsx dispatches
        // revil:project_open as this modal is mounted, and the Cloud Function raises
        // Views.Project from the session. Nothing to write from here.

        return () => unsub();
    }, [project.id, project.name, project.title]);


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
            {...dialogProps}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.25 }}
            style={{
                position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh',
                // Solid, so the page behind never shows through the text.
                backgroundColor: 'rgb(9, 10, 13)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                zIndex: 2100,
                overflow: 'hidden',
                fontFamily: "'Inter', sans-serif",
                color: INK,
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
            <button onClick={handleClose} aria-label="Close project view" style={{
                position: 'absolute', top: isMobile ? '20px' : '40px', right: isMobile ? '20px' : '40px', zIndex: 2200,
                width: isMobile ? '44px' : '56px', height: isMobile ? '44px' : '56px', borderRadius: '50%',
                background: 'rgba(255, 255, 255, 0.1)', border: '1px solid rgba(255, 255, 255, 0.15)',
                color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center',
                cursor: 'pointer', backdropFilter: 'blur(10px)', transition: 'all 0.3s'
            }} onMouseEnter={e => { e.currentTarget.style.background = '#ef4444'; e.currentTarget.style.transform = 'scale(1.1) rotate(90deg)'; }} onMouseLeave={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.1)'; e.currentTarget.style.transform = 'scale(1) rotate(0deg)'; }}>
                <X size={isMobile ? 20 : 24} />
            </button>

            <motion.div
                ref={boxRef}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.3, ease: "easeOut" }}
                onClick={e => e.stopPropagation()}
                onScroll={e => { if (!storyGone && e.currentTarget.scrollTop > 40) setStoryGone(true); }}
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
                    {/* The pictures. Sized so the details below always show at the bottom of
                        the screen (PEEK on desktop), which tells the eye there is more. */}
                    <div style={{
                        position: 'relative', width: '100%',
                        display: 'flex', justifyContent: 'center',
                        padding: isMobile ? `84px 20px ${STORY_GAP.mobile}px` : `40px 20px ${STORY_GAP.desktop}px`
                    }}>
                        <div style={{
                            position: 'relative',
                            width: isMobile
                                ? `min(100%, calc((100vh - ${84 + STORY_GAP.mobile}px) * 16 / 9))`
                                : `min(85%, calc((90vh - ${40 + STORY_GAP.desktop + PEEK}px) * 16 / 9))`,
                            maxWidth: '1200px',
                            zIndex: 1
                        }}>
                            <motion.div
                                className="pv-frame"
                                onMouseEnter={() => setIsHovered(true)}
                                onMouseLeave={() => setIsHovered(false)}
                                initial={{ opacity: 0, scale: 0.95 }}
                                animate={{ opacity: 1, scale: 1 }}
                                transition={{ duration: 0.4, ease: "easeOut" }}
                                style={{
                                    position: 'relative',
                                    width: '100%',
                                    aspectRatio: '16/9',
                                    borderRadius: isMobile ? '16px' : '32px',
                                    overflow: 'hidden',
                                    background: '#000',
                                    boxShadow: '0 50px 100px rgba(0,0,0,0.5)',
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
                                                <ProjectMediaImage src={media} />
                                            )}
                                        </div>
                                    ))}
                                </div>

                                {/* Previous and next: shown on hover (globals.css .pv-nav), so they
                                    don't sit on the screenshot's own buttons the rest of the time. */}
                                {sortedMedia.length > 1 && (
                                    <>
                                        <button className="pv-nav" onClick={handlePrev} aria-label="Previous image" style={{ ...NAV, left: isMobile ? '6px' : '20px', width: isMobile ? '32px' : '44px', height: isMobile ? '32px' : '44px' }}>
                                            <ChevronLeft size={isMobile ? 16 : 22} />
                                        </button>
                                        <button className="pv-nav" onClick={handleNext} aria-label="Next image" style={{ ...NAV, right: isMobile ? '6px' : '20px', width: isMobile ? '32px' : '44px', height: isMobile ? '32px' : '44px' }}>
                                            <ChevronRight size={isMobile ? 16 : 22} />
                                        </button>
                                    </>
                                )}
                            </motion.div>

                            {/* Which picture: under the frame, not on it (hidden on phones to save space) */}
                            {!isMobile && sortedMedia.length > 1 && (
                                <div style={{ position: 'absolute', top: 'calc(100% + 20px)', left: 0, right: 0, display: 'flex', justifyContent: 'center', gap: '10px' }}>
                                    {sortedMedia.map((_, i) => (
                                        <button key={i} onClick={() => setCurrentImageIndex(i)} aria-label={`Show image ${i + 1}`} style={{
                                            width: i === currentImageIndex ? '28px' : '8px', height: '8px', borderRadius: '4px', padding: 0, border: 'none',
                                            background: 'white', opacity: i === currentImageIndex ? 0.9 : 0.25,
                                            cursor: 'pointer', transition: 'all 0.4s'
                                        }} />
                                    ))}
                                </div>
                            )}

                            {/* "the story", written in by pen, pointing at the details. It leaves
                                for good on the first scroll; a tap takes the reader there. */}
                            <button ref={storyRef} onClick={toStory} aria-label="Read about the project" style={{
                                position: 'absolute', top: '100%', left: isMobile ? '8px' : '40px', marginTop: isMobile ? '6px' : '14px',
                                background: 'none', border: 'none', padding: 0, cursor: 'pointer',
                                color: 'var(--accent)', fontSize: isMobile ? '24px' : '30px', lineHeight: 1,
                                transform: 'rotate(-3deg)',
                                opacity: storyGone ? 0 : 1, pointerEvents: storyGone ? 'none' : 'auto',
                                transition: 'opacity 0.8s ease'
                            }}>
                                <span ref={storyInkRef} style={{ display: 'flex', alignItems: 'flex-start', gap: '4px', opacity: 0 }}>
                                    <span style={{ marginTop: '0.2em' }}><Handwriting text="the story" /></span>
                                    <svg width="1.47em" height="1.93em" viewBox="0 0 44 58" aria-hidden="true" style={{ overflow: 'visible', display: 'block' }}>
                                        <g fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round">
                                            <path d="M 4 4 C 26 6, 38 24, 30 52" pathLength={1} data-pen={1.4} />
                                            <path d="M 21 42 C 25 46, 28 49, 30 52 C 33 47, 36 44, 40 41" pathLength={1} data-pen={0.5} />
                                        </g>
                                    </svg>
                                </span>
                            </button>
                        </div>
                    </div>

                    {/* The details, a notebook page: the pen writes each note in the margin
                        as it comes into view, the text beside it. */}
                    <div ref={detailsRef} style={{
                        position: 'relative', zIndex: 2,
                        maxWidth: '1040px', width: '100%', margin: '0 auto',
                        padding: isMobile ? '0 24px 80px' : '0 8px 120px'
                    }}>
                        <div style={{ paddingLeft: isMobile ? 0 : `${MARGIN + GUTTER}px`, paddingBottom: '30px' }}>
                            <h1 id="project-modal-title" style={{
                                display: 'inline-block', margin: 0,
                                fontSize: isMobile ? (windowWidth < 480 ? '38px' : '48px') : '68px', fontWeight: 600,
                                letterSpacing: '-0.035em', lineHeight: 1.05, color: INK,
                                paddingRight: isMobile ? '48px' : 0
                            }}>{displayTitle}</h1>
                            <InkOnView root={boxRef} style={{ color: 'var(--accent)', marginTop: '10px' }}>
                                <svg width={isMobile ? 170 : 270} height="14" viewBox="0 0 270 14" style={{ display: 'block', overflow: 'visible' }}>
                                    <path d="M3 9 C 60 3, 130 4, 200 7 S 255 10, 267 5" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" pathLength={1} data-pen={6} />
                                </svg>
                            </InkOnView>
                        </div>

                        <NoteRow label="what it does" isMobile={isMobile} root={boxRef}>
                            <p style={{ margin: 0, fontSize: isMobile ? '17px' : '19px', lineHeight: 1.75, color: SOFT, maxWidth: '62ch', userSelect: 'text' }}>{displayFullDescription}</p>
                        </NoteRow>

                        {displayTags.length > 0 && (
                            <NoteRow label="built with" isMobile={isMobile} root={boxRef}>
                                <ul style={{ display: 'flex', flexWrap: 'wrap', gap: '12px 28px', margin: 0, padding: 0, listStyle: 'none' }}>
                                    {displayTags.map((tag, i) => (
                                        <li key={i} style={{ display: 'inline-flex', alignItems: 'center', gap: '10px', fontSize: '16px' }}>
                                            <TagIcon icon={tag.icon} color={tag.color} />
                                            {tag.name}
                                        </li>
                                    ))}
                                </ul>
                            </NoteRow>
                        )}

                        {project.contributors.length > 0 && (
                            <NoteRow label="made by" isMobile={isMobile} root={boxRef}>
                                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px 24px', margin: '-8px' }}>
                                    {project.contributors.map((c, i) => (
                                        <button key={i} onClick={() => onContributorClick(c)} style={{
                                            display: 'flex', alignItems: 'center', gap: '14px', padding: '8px 14px 8px 8px',
                                            background: 'transparent', border: 'none', borderRadius: '16px', color: INK,
                                            cursor: 'pointer', textAlign: 'left', transition: 'background 0.4s ease'
                                        }} onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.05)'; }} onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}>
                                            {c.image ? (
                                                <img src={typeof c.image === 'string' ? c.image : undefined} alt="" style={{ width: '44px', height: '44px', borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }} />
                                            ) : (
                                                <span style={{ width: '44px', height: '44px', borderRadius: '50%', background: 'rgba(255,255,255,0.06)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                                                    <User size={20} color={MUTED} />
                                                </span>
                                            )}
                                            <span>
                                                <span style={{ display: 'block', fontSize: '16px', fontWeight: 500 }}>{c.name}</span>
                                                {c.role && <span style={{ display: 'block', fontSize: '14px', color: MUTED, marginTop: '2px' }}>{c.role}</span>}
                                            </span>
                                        </button>
                                    ))}
                                </div>
                            </NoteRow>
                        )}

                        {links.length > 0 && (
                            <NoteRow label="try it" isMobile={isMobile} root={boxRef}>
                                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '14px' }}>
                                    {links.map((l, i) => (
                                        <a key={l.label} href={l.href} onClick={l.onClick} target="_blank" rel="noopener noreferrer" style={{
                                            display: 'inline-flex', alignItems: 'center', gap: '10px', height: '50px', padding: '0 22px',
                                            borderRadius: '12px', fontSize: '15px', fontWeight: 500, textDecoration: 'none',
                                            transition: 'background 0.4s ease, border-color 0.4s ease',
                                            ...(i === 0
                                                ? { background: '#f3f3f1', color: '#0b0c0f', border: '1px solid #f3f3f1' }
                                                : { background: 'transparent', color: INK, border: '1px solid rgba(255,255,255,0.14)' })
                                        }} onMouseEnter={e => { if (i === 0) e.currentTarget.style.background = '#ffffff'; else e.currentTarget.style.borderColor = 'rgba(255,255,255,0.32)'; }} onMouseLeave={e => { if (i === 0) e.currentTarget.style.background = '#f3f3f1'; else e.currentTarget.style.borderColor = 'rgba(255,255,255,0.14)'; }}>
                                            {l.icon}
                                            {l.label}
                                        </a>
                                    ))}
                                </div>
                                {tally && <p style={{ margin: '18px 0 0', fontSize: '14px', color: MUTED }}>{tally}</p>}
                            </NoteRow>
                        )}
                    </div>
                </motion.div>
            </motion.div>
        </motion.div>,
        document.body
    );
};

export default MProjectView;
