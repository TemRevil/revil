import { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { ProjectData as Project, TagData as Tag } from '../../types';
import { isVideoFile, stillFrame } from '../../lib/projectUtils';
import { isLite } from '../../lib/device';

const CardVideo = ({ src, isActive }: { src: string; isActive: boolean }) => {
    const videoRef = useRef<HTMLVideoElement>(null);
    // A lite page (lib/device.ts) shows the first frame and never plays or seeks: that
    // fetched megabytes of video a phone, with no hover, never showed.
    const lite = isLite();

    useEffect(() => {
        const video = videoRef.current;
        if (!video || lite) return;

        if (isActive) {
            // Jump to random time when becoming active to show "random frames"
            if (video.duration) {
                video.currentTime = Math.random() * video.duration;
            }
            video.play().catch(() => { });
        } else {
            video.pause();
        }
    }, [isActive, lite]);

    // YouTube-style "pick a random starting point" 
    useEffect(() => {
        const video = videoRef.current;
        if (!video || lite) return;

        const setRandomTime = () => {
            if (video.duration) {
                video.currentTime = Math.random() * video.duration;
            }
        };

        if (video.readyState >= 1) {
            setRandomTime();
        } else {
            video.addEventListener('loadedmetadata', setRandomTime);
            return () => video.removeEventListener('loadedmetadata', setRandomTime);
        }
    }, [lite]);

    return (
        <video
            ref={videoRef}
            src={lite ? stillFrame(src) : src}
            preload={lite ? 'metadata' : undefined}
            muted
            loop
            playsInline
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
        />
    );
};

// shimmer-fast keyframes are now in globals.css

// A skeleton's shimmer only moves while it is on screen. The cards' images load lazily, so
// dozens of skeletons below the fold (and on the hidden slides) animated for nothing, and
// every frame they cost was a frame a slow phone could not spend opening a modal.
const shimmerWatch = new Map<Element, (on: boolean) => void>();
let shimmerIO: IntersectionObserver | null = null;
const watchShimmer = (el: Element, set: (on: boolean) => void) => {
    shimmerIO ??= new IntersectionObserver(entries => entries.forEach(e => shimmerWatch.get(e.target)?.(e.isIntersecting)));
    shimmerWatch.set(el, set);
    shimmerIO.observe(el);
    return () => { shimmerWatch.delete(el); shimmerIO?.unobserve(el); };
};

const CardImage = ({ src, alt }: { src: string; alt: string }) => {
    const [isImageLoaded, setIsImageLoaded] = useState(false);
    // The skeleton box, not the light: the light starts outside the box's clip.
    const skeletonRef = useRef<HTMLDivElement>(null);
    const [shimmerOn, setShimmerOn] = useState(false);
    useEffect(() => {
        const el = skeletonRef.current;
        return el && !isImageLoaded ? watchShimmer(el, setShimmerOn) : undefined;
    }, [isImageLoaded]);
    // On a prerendered page (/projects) a picture can finish before React is listening, and
    // its load event is gone: it would stay behind the skeleton.
    const imageRef = useRef<HTMLImageElement>(null);
    useEffect(() => {
        const img = imageRef.current;
        if (img?.complete && img.naturalWidth > 0) setIsImageLoaded(true);
    }, []);
    return (
        <>
            {/* shimmer-fast keyframes are in globals.css */}
            {/* Skeleton Loader Container */}
            <div 
                ref={skeletonRef}
                className={`absolute inset-0 z-10 bg-white/5 overflow-hidden transition-opacity duration-1000 ease-out ${isImageLoaded ? 'opacity-0 pointer-events-none' : 'opacity-100'}`}
            >
                {/* Moving Light effect - only rendered when loading to stop the animation when complete */}
                {!isImageLoaded && (
                    <div 
                        className="absolute inset-0 w-full h-full bg-gradient-to-r from-transparent via-white/20 to-transparent"
                        style={{ animation: 'shimmer-fast 1.2s infinite ease-in-out', animationPlayState: shimmerOn ? 'running' : 'paused' }}
                    />
                )}
            </div>
            <img
                ref={imageRef}
                src={src}
                alt={alt}
                loading="lazy"
                decoding="async"
                onLoad={() => setIsImageLoaded(true)}
                className={`w-full h-full object-cover group-hover:scale-105 transition-all duration-[1500ms] ease-out ${!isImageLoaded ? 'scale-105' : ''}`}
                style={{
                    filter: isImageLoaded ? 'blur(0px)' : 'blur(20px)',
                    opacity: isImageLoaded ? 1 : 0
                }}
            />
        </>
    );
};

/**
 * A project in the grid. With `onOpen` (the homepage) a click opens the project's window;
 * without it (/projects) the whole card is the link to the project's page.
 */
const ProjectCard = ({ project, href, onOpen, active }: { project: Project; href: string; onOpen?: () => void; active: boolean }) => {
    const [currentImageIndex, setCurrentImageIndex] = useState(0);
    const [isHovered, setIsHovered] = useState(false);
    const [showContributors, setShowContributors] = useState(false);

    // Slideshow logic (Card Hover)
    useEffect(() => {
        let interval: ReturnType<typeof setInterval> | undefined;
        if (isHovered && project.images.length > 1) {
            interval = setInterval(() => {
                setCurrentImageIndex((prev) => (prev + 1) % project.images.length);
            }, 2000);
        }
        return () => clearInterval(interval);
    }, [isHovered, project.images.length]);

    // Cycle between Stack and Contributors, only while the section is shown
    useEffect(() => {
        if (!active) return;
        const interval = setInterval(() => {
            setShowContributors(prev => !prev);
        }, 3000);
        return () => clearInterval(interval);
    }, [active]);

    return (
        <motion.div
            onMouseEnter={() => setIsHovered(true)}
            onMouseLeave={() => {
                setIsHovered(false);
                setCurrentImageIndex(0);
            }}
            onClick={onOpen}
            // Coming and going is the grid's (Reflow); the card only lifts on hover.
            initial={false}
            animate={{ y: isHovered ? -8 : 0 }}
            transition={{ duration: 0.2 }}
            className={`
                group relative flex flex-col h-full glass-panel cursor-pointer overflow-hidden
                border border-[var(--section-border)] transition-shadow duration-300
                ${isHovered ? 'shadow-xl' : 'shadow-md'}
            `}
            style={{ willChange: 'transform, opacity' }}
        >
            <div className="relative h-[200px] overflow-hidden rounded-t-[20px] will-change-transform">
                {/* Slideshow Overlay */}
                <div
                    className="absolute inset-0"
                    style={{ pointerEvents: 'none' }}
                >
                    <div
                        className="flex h-full transition-transform duration-500 ease-in-out"
                        style={{
                            width: `${project.images.length * 100}%`,
                            transform: `translateX(-${(currentImageIndex * 100) / project.images.length}%)`,
                        }}
                    >
                        {project.images.map((img, i) => {
                            const isVideo = isVideoFile(img);
                            return (
                                <div key={i} style={{ width: `${100 / project.images.length}%` }} className="h-full relative overflow-hidden">
                                    {isVideo ? (
                                        <CardVideo src={img} isActive={isHovered && currentImageIndex === i} />
                                    ) : (
                                        <CardImage src={img} alt={project.title || 'Project'} />
                                    )}
                                    <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent opacity-60"></div>
                                </div>
                            );
                        })}
                    </div>
                </div>

                {/* Overlays: Tags / Contributors Slideshow */}
                <div className="absolute top-4 left-4 z-10">
                    <AnimatePresence mode="wait">
                        {!showContributors ? (
                            <motion.div
                                key="tags"
                                initial={{ opacity: 0, y: -10 }}
                                animate={{ opacity: 1, y: 0 }}
                                exit={{ opacity: 0, y: 10 }}
                                transition={{ duration: 0.3 }}
                                className="flex gap-1.5 flex-wrap"
                            >
                                {(project.tags || []).slice(0, 2).map((tag: Tag, i) => (
                                    <div
                                        key={i}
                                        className="px-2.5 py-1 rounded-full bg-white/40 backdrop-blur-md text-xs font-semibold text-gray-800 shadow-sm flex items-center gap-1"
                                    >
                                        <div className="w-1.5 h-1.5 rounded-full" style={{ background: tag.color || '#3b82f6' }} />
                                        {tag.name}
                                    </div>
                                ))}
                                {(project.tags || []).length > 2 && (
                                    <div className="px-2.5 py-1 rounded-full bg-black/40 backdrop-blur-md text-xs font-semibold text-white shadow-sm">
                                        +{(project.tags || []).length - 2} More
                                    </div>
                                )}
                            </motion.div>
                        ) : (
                            <motion.div
                                key="contributors"
                                initial={{ opacity: 0, y: -10 }}
                                animate={{ opacity: 1, y: 0 }}
                                exit={{ opacity: 0, y: 10 }}
                                transition={{ duration: 0.3 }}
                                className="flex items-center"
                            >
                                <div className="flex pl-1">
                                    {(project.contributors || []).slice(0, 3).map((c, i) => (
                                        <div
                                            key={i}
                                            className="w-8 h-8 rounded-full border-2 border-white -ml-2 overflow-hidden bg-gray-100 shadow-sm"
                                            title={c.name}
                                        >
                                            {c.image && typeof c.image === 'string' ? (
                                                <img src={c.image} alt={c.name} className="w-full h-full object-cover" />
                                            ) : (
                                                <div className="w-full h-full flex items-center justify-center bg-gray-200 text-gray-500 text-[10px] font-bold">
                                                    {c.name ? c.name.charAt(0) : '?'}
                                                </div>
                                            )}
                                        </div>
                                    ))}
                                    {(project.contributors || []).length > 3 && (
                                        <div className="w-8 h-8 rounded-full border-2 border-white -ml-2 bg-blue-500 text-white flex items-center justify-center text-[0.7rem] font-bold shadow-sm">
                                            +{(project.contributors || []).length - 3}
                                        </div>
                                    )}
                                </div>
                            </motion.div>
                        )}
                    </AnimatePresence>
                </div>
            </div>

            <div className="p-6 flex flex-col flex-1">
                <h3 className="heading-md mb-2.5 text-primary">
                    {/* A real address for the project's own page, so search engines can
                        list it. With a window to open, a plain click stays here and opens it
                        (the card's onClick) and ctrl/cmd/middle-click opens the page in a new
                        tab. Without one, the link stretches over the whole card. */}
                    <a
                        href={href}
                        className={`text-inherit no-underline ${onOpen ? '' : 'after:absolute after:inset-0 after:z-20 after:rounded-[24px] focus-visible:outline-none focus-visible:after:outline-2 focus-visible:after:-outline-offset-2 focus-visible:after:outline-accent'}`}
                        onClick={onOpen ? (e) => { if (!e.metaKey && !e.ctrlKey && !e.shiftKey && e.button === 0) e.preventDefault(); } : undefined}
                    >
                        {project.title}
                    </a>
                </h3>
                <p
                    className="text-body text-sec overflow-hidden"
                    style={{
                        display: '-webkit-box',
                        WebkitLineClamp: 3,
                        WebkitBoxOrient: 'vertical',
                        overflow: 'hidden',
                        // Explicit line-height + maxHeight hard-caps at 3 lines even if the
                        // -webkit-box clamp is defeated (e.g. by flex-grow). 3 × 1.6 = 4.8em.
                        lineHeight: 1.6,
                        maxHeight: '4.8em',
                    }}
                >
                    {project.description}
                </p>
            </div>
        </motion.div >
    );
};

export default ProjectCard;
