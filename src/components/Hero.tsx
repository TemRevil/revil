import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import anime from 'animejs';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { Plus, Briefcase, Calendar } from 'lucide-react';
import { useSettings } from '../contexts/SettingsContext';

// 1x1 transparent GIF to prevent empty src errors and allow onLoad to trigger properly
const DEFAULT_HERO_URL = "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7";

// True handwriting animation - letter by letter
const HandwritingText = ({
    text,
    fontSize = 70,
    delay = 0,
    color = '#3b82f6',
    rotate = 0,
    isReady = true
}: {
    text: string;
    fontSize?: number;
    delay?: number;
    color?: string;
    rotate?: number;
    isReady?: boolean;
}) => {
    const svgRef = useRef<SVGSVGElement>(null);

    useEffect(() => {
        if (!svgRef.current || !isReady) return;

        const startDelay = delay + 500;

        const letters = svgRef.current.querySelectorAll('.letter-path');
        anime.remove(letters);

        const tl = anime.timeline({
            easing: 'easeOutSine',
            autoplay: true,
        });

        letters.forEach((letter, index) => {
            const textEl = letter as SVGTextElement;
            const estimatedLength = fontSize * 2;

            // Explicitly reset to transparent outline
            textEl.style.visibility = 'hidden';
            textEl.style.strokeDasharray = `${estimatedLength}`;
            textEl.style.strokeDashoffset = `${estimatedLength}`;
            textEl.style.fill = 'transparent';

            tl.add({
                targets: textEl,
                strokeDashoffset: [estimatedLength, 0],
                opacity: [0, 1],
                duration: 120, // Smooth & Elegant
                delay: index === 0 ? startDelay : 0,
                begin: () => {
                    textEl.style.visibility = 'visible';
                },
                complete: () => {
                    // Immediate solid fill upon stroke completion
                    textEl.style.fill = color;
                    textEl.style.strokeOpacity = '0.4';
                }
            }, index === 0 ? startDelay : '-=60'); // More overlap for smoothness
        });
    }, [text, delay, fontSize, color, isReady]);

    // Calculate letter positions - normal spacing
    const letterSpacing = fontSize * 0.5;
    const spaceWidth = fontSize * 0.3;
    let xPos = 0;
    const positions: number[] = [];

    text.split('').forEach(char => {
        positions.push(xPos);
        xPos += char === ' ' ? spaceWidth : letterSpacing;
    });

    const width = xPos + 20;
    const height = fontSize * 1.4;

    return (
        <div style={{
            transform: `rotate(${rotate}deg)`,
            transformOrigin: 'left center',
            display: 'inline-block'
        }}>
            <svg
                ref={svgRef}
                width={width}
                height={height}
                viewBox={`0 0 ${width} ${height}`}
                style={{ overflow: 'visible' }}
            >
                {text.split('').map((char, index) => {
                    if (char === ' ') return null;

                    return (
                        <text
                            key={index}
                            className="letter-path"
                            x={positions[index]}
                            y={fontSize}
                            fontFamily="var(--font-permanent-marker), cursive"
                            fontSize={fontSize}
                            fill="transparent"
                            stroke={color}
                            strokeWidth="1.5"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            style={{
                                paintOrder: 'stroke fill',
                                visibility: 'hidden'
                            }}
                        >
                            {char}
                        </text>
                    );
                })}
            </svg>
        </div>
    );
};

interface HeroProject {
    name?: string;
    status?: string;
    description?: string;
    order?: number;
}

interface AvailabilityData {
    'Current Availability'?: string;
    'Current Time'?: string;
    'Projects Being Handled'?: Record<string, HeroProject>;
}

// Available Status Badge Component
const AvailableBadge = ({ isDark, entryDelay = 1200, isReady = true, onBook }: { isDark: boolean; entryDelay?: number; isReady?: boolean; onBook?: () => void }) => {
    const badgeRef = useRef<HTMLDivElement>(null);
    const pulseRef = useRef<HTMLDivElement>(null);
    const triggerRef = useRef<HTMLDivElement>(null);
    const tooltipRef = useRef<HTMLDivElement>(null);
    const [availData, setAvailData] = useState<AvailabilityData | null>(null);
    const [tooltipVisible, setTooltipVisible] = useState(false);
    const [tooltipMounted, setTooltipMounted] = useState(false);
    const [tooltipPos, setTooltipPos] = useState<{ top: number | 'auto'; bottom: number | 'auto'; left: number; width: number; arrowLeft: number; flipBelow: boolean }>({ top: 0, bottom: 'auto', left: 0, width: 320, arrowLeft: 160, flipBelow: false });
    const hideTimeoutRef = useRef<NodeJS.Timeout | null>(null);
    const unmountTimeoutRef = useRef<NodeJS.Timeout | null>(null);

    const updateTooltipPosition = () => {
        if (!triggerRef.current) return;

        const rect = triggerRef.current.getBoundingClientRect();
        
        // Responsive width: max 320px, but adapts to small phone screens leaving 16px margins
        const tooltipW = Math.min(320, window.innerWidth - 32); 
        const gap = 16;
        
        // Approximate height just to check if it fits above the badge
        const estimatedHeight = tooltipRef.current?.offsetHeight || 260; 

        let flipBelow = false;
        let top: number | 'auto' = 'auto';
        let bottom: number | 'auto' = 'auto';

        // Check if there is space above the badge
        if (rect.top > estimatedHeight + gap + 10) {
            // Space above exists: anchor to bottom so it grows upwards perfectly
            bottom = window.innerHeight - rect.top + gap;
        } else {
            // Not enough space: anchor to top to grow downwards
            top = rect.bottom + gap;
            flipBelow = true;
        }

        // Center horizontally on badge
        const badgeCenter = rect.left + (rect.width / 2);
        let left = badgeCenter - (tooltipW / 2);
        
        // Clamp to edges min 16px
        left = Math.max(16, Math.min(left, window.innerWidth - tooltipW - 16));

        // Calculate arrow position relative to tooltip to always point at badge center
        // Needs to clamp slightly so arrow doesn't clip out of the rounded corners
        let arrowLeft = badgeCenter - left;
        arrowLeft = Math.max(24, Math.min(arrowLeft, tooltipW - 24));

        setTooltipPos({ top, bottom, left, width: tooltipW, arrowLeft, flipBelow });
    };

    // Show tooltip with animation
    const openTooltip = () => {
        if (hideTimeoutRef.current) { clearTimeout(hideTimeoutRef.current); hideTimeoutRef.current = null; }
        if (unmountTimeoutRef.current) { clearTimeout(unmountTimeoutRef.current); unmountTimeoutRef.current = null; }
        updateTooltipPosition();
        setTooltipMounted(true);
        // RAF to let mount paint, then animate in
        requestAnimationFrame(() => requestAnimationFrame(() => setTooltipVisible(true)));
    };

    // Hide tooltip with exit animation, then unmount
    const closeTooltip = () => {
        setTooltipVisible(false);
        unmountTimeoutRef.current = setTimeout(() => setTooltipMounted(false), 350);
    };

    const handleMouseEnter = () => {
        if (hideTimeoutRef.current) { clearTimeout(hideTimeoutRef.current); hideTimeoutRef.current = null; }
        if (unmountTimeoutRef.current) { clearTimeout(unmountTimeoutRef.current); unmountTimeoutRef.current = null; }
        openTooltip();
    };

    const handleMouseLeave = () => {
        hideTimeoutRef.current = setTimeout(() => closeTooltip(), 250);
    };

    const handleTooltipEnter = () => {
        if (hideTimeoutRef.current) { clearTimeout(hideTimeoutRef.current); hideTimeoutRef.current = null; }
        if (unmountTimeoutRef.current) { clearTimeout(unmountTimeoutRef.current); unmountTimeoutRef.current = null; }
    };

    const handleTooltipLeave = () => {
        hideTimeoutRef.current = setTimeout(() => closeTooltip(), 200);
    };

    useEffect(() => {
        const unsubscribe = onSnapshot(doc(db, 'Settings', 'Availability'), (snap) => {
            if (snap.exists()) {
                setAvailData(snap.data());
            }
        });
        return () => unsubscribe();
    }, []);

    useEffect(() => {
        if (!isReady) return;
        const startDelay = entryDelay + 500;

        const pulse = anime({
            targets: pulseRef.current,
            scale: [1, 1.5],
            opacity: [0.8, 0],
            duration: 1500,
            loop: true,
            easing: 'easeOutQuad'
        });

        anime({
            targets: badgeRef.current,
            opacity: [0, 1],
            translateY: [20, 0],
            duration: 800,
            delay: startDelay,
            easing: 'easeOutExpo'
        });

        return () => pulse.pause();
    }, [entryDelay, isReady]);

    // Reposition on scroll/resize while mounted
    useEffect(() => {
        if (!tooltipMounted) return;
        const update = () => updateTooltipPosition();
        window.addEventListener('scroll', update, true);
        window.addEventListener('resize', update);
        return () => {
            window.removeEventListener('scroll', update, true);
            window.removeEventListener('resize', update);
        };
    }, [tooltipMounted]);

    // Cleanup on unmount
    useEffect(() => () => {
        if (hideTimeoutRef.current) clearTimeout(hideTimeoutRef.current);
        if (unmountTimeoutRef.current) clearTimeout(unmountTimeoutRef.current);
    }, []);

    const availabilityStr = availData?.['Current Availability'] || '100%';
    // Guard against non-numeric / legacy values (e.g. "Available", "%") — parseInt → NaN
    // would otherwise fall through every comparison and falsely render "Busy"/red.
    const parsedAvailability = parseInt(availabilityStr);
    const availabilityPercent = Number.isNaN(parsedAvailability) ? 100 : parsedAvailability;
    const currentTime = availData?.['Current Time'] || 'UTC+02:00';
    const projectsMap = availData?.['Projects Being Handled'] || {};
    // Respect the admin's manual drag-sort order (falls back to map order for legacy data)
    const projects = Object.values(projectsMap).sort((a, b) => (a.order ?? 0) - (b.order ?? 0));

    const displayedProjects = projects.slice(0, 3);
    const restCount = projects.length - 3;

    const getDotColor = (percent: number) => {
        if (percent >= 100) return '#22c55e';
        if (percent >= 75) return '#a3e635';
        if (percent >= 50) return '#facc15';
        if (percent >= 25) return '#fb923c';
        return '#f87171';
    };

    const getAvailText = (percent: number) => {
        if (percent >= 100) return 'Available';
        if (percent > 0) return 'Handled';
        return 'Busy';
    };

    const dotColor = getDotColor(availabilityPercent);

    // Portal tooltip with proper enter/exit animation
    // Slide offset for the show/hide animation (px). Animated via top/bottom inset,
    // NOT transform — backdrop-filter blur breaks on transformed elements in Chrome.
    const slideOffset = tooltipVisible ? 0 : (tooltipPos.flipBelow ? -10 : 10);

    const tooltipElement = tooltipMounted && projects.length > 0
        ? createPortal(
            <div
                ref={tooltipRef}
                onMouseEnter={handleTooltipEnter}
                onMouseLeave={handleTooltipLeave}
                style={{
                    position: 'fixed',
                    // Apply slide offset via top/bottom (no transform → backdrop-filter works)
                    top: typeof tooltipPos.top === 'number' ? tooltipPos.top + slideOffset : tooltipPos.top,
                    bottom: typeof tooltipPos.bottom === 'number' ? tooltipPos.bottom - slideOffset : tooltipPos.bottom,
                    left: tooltipPos.left,
                    width: tooltipPos.width,
                    // Above navbar + sub-nav (both z-50), below modals (1400+)
                    zIndex: 60,
                    opacity: tooltipVisible ? 1 : 0,
                    // On SHOW: opacity snaps to 1 instantly so backdrop blur is fully
                    // visible from the first frame (no perceived "blur fade-in").
                    // On HIDE: keep smooth 0.3s fade. Slide animation via top/bottom
                    // stays smooth in both directions.
                    transition: tooltipVisible
                        ? 'opacity 0s, top 0.3s cubic-bezier(0.32, 0.72, 0, 1), bottom 0.3s cubic-bezier(0.32, 0.72, 0, 1)'
                        : 'opacity 0.3s cubic-bezier(0.32, 0.72, 0, 1), top 0.3s cubic-bezier(0.32, 0.72, 0, 1), bottom 0.3s cubic-bezier(0.32, 0.72, 0, 1)',
                    pointerEvents: tooltipVisible ? 'auto' : 'none',
                    borderRadius: 28,
                    padding: window.innerWidth <= 380 ? 16 : 24,
                    background: isDark
                        ? 'linear-gradient(160deg, rgba(25, 25, 40, 0.7) 0%, rgba(10, 10, 15, 0.88) 100%)'
                        : 'linear-gradient(160deg, rgba(255, 255, 255, 0.72) 0%, rgba(240, 240, 255, 0.9) 100%)',
                    backdropFilter: 'blur(80px) saturate(200%)',
                    WebkitBackdropFilter: 'blur(80px) saturate(200%)',
                    border: isDark ? '1px solid rgba(255, 255, 255, 0.1)' : '1px solid rgba(0, 0, 0, 0.06)',
                    boxShadow: isDark
                        ? '0 32px 80px rgba(0, 0, 0, 0.55), inset 0 0.5px 0 rgba(255, 255, 255, 0.08)'
                        : '0 32px 80px rgba(0, 0, 0, 0.1), inset 0 0.5px 0 rgba(255, 255, 255, 0.65)',
                }}
            >
                {/* Arrow connector */}
                <div
                    style={{
                        position: 'absolute',
                        left: tooltipPos.arrowLeft,
                        transform: 'translateX(-50%) rotate(45deg)',
                        width: 14,
                        height: 14,
                        ...(tooltipPos.flipBelow
                            ? { top: -7, borderLeft: isDark ? '1px solid rgba(255,255,255,0.1)' : '1px solid rgba(0,0,0,0.06)', borderTop: isDark ? '1px solid rgba(255,255,255,0.1)' : '1px solid rgba(0,0,0,0.06)' }
                            : { bottom: -7, borderRight: isDark ? '1px solid rgba(255,255,255,0.1)' : '1px solid rgba(0,0,0,0.06)', borderBottom: isDark ? '1px solid rgba(255,255,255,0.1)' : '1px solid rgba(0,0,0,0.06)' }
                        ),
                        background: isDark ? 'rgba(12, 12, 20, 0.88)' : 'rgba(242, 242, 255, 0.9)',
                        backdropFilter: 'blur(80px)',
                        WebkitBackdropFilter: 'blur(80px)',
                    }}
                />

                {/* Header */}
                <div className="flex items-center gap-3 mb-4 pb-3" style={{ borderBottom: isDark ? '1px solid rgba(255,255,255,0.08)' : '1px solid rgba(0,0,0,0.06)' }}>
                    <Briefcase size={15} className="text-info" />
                    <span className="text-[11px] font-bold uppercase tracking-[0.15em] text-muted">Availability Status</span>
                </div>

                {/* Projects */}
                <div className="flex flex-col gap-4">
                    {displayedProjects.map((p: HeroProject, i: number) => (
                        <div key={i} className="flex flex-col gap-1.5">
                            <div className="flex items-center justify-between gap-4">
                                <span className="text-[14px] font-bold text-primary tracking-tight">{p.name || 'Project'}</span>
                                <span
                                    className="text-[10px] px-2.5 py-1 rounded-full font-black uppercase tracking-widest border"
                                    style={{
                                        backgroundColor: (p.status || '').toLowerCase() === 'completed'
                                            ? 'rgba(16, 185, 129, 0.15)'
                                            : (p.status || '').toLowerCase() === 'pending'
                                                ? 'rgba(245, 158, 11, 0.15)'
                                                : 'rgba(59, 130, 246, 0.15)',
                                        color: (p.status || '').toLowerCase() === 'completed'
                                            ? '#10b981'
                                            : (p.status || '').toLowerCase() === 'pending'
                                                ? '#f59e0b'
                                                : '#3b82f6',
                                        borderColor: (p.status || '').toLowerCase() === 'completed'
                                            ? 'rgba(16, 185, 129, 0.3)'
                                            : (p.status || '').toLowerCase() === 'pending'
                                                ? 'rgba(245, 158, 11, 0.3)'
                                                : 'rgba(59, 130, 246, 0.3)'
                                    }}
                                >
                                    {p.status || 'Active'}
                                </span>
                            </div>
                            {p.description && (
                                <p className="text-[12px] text-muted leading-snug italic font-medium">
                                    {p.description}
                                </p>
                            )}
                        </div>
                    ))}
                    {restCount > 0 && (
                        <div className="flex items-center justify-center gap-2 mt-1 pt-3 text-muted hover:text-sec transition-all" style={{ borderTop: isDark ? '1px solid rgba(255,255,255,0.08)' : '1px solid rgba(0,0,0,0.06)' }}>
                            <Plus size={14} strokeWidth={3} />
                            <span className="text-[12px] font-black">{restCount} rest managed</span>
                        </div>
                    )}
                </div>
            </div>,
            // Portal into document.body so the tooltip escapes the hero/page stacking
            // context (incl. the hero title's z-[5000]). At body level z-60 sits above
            // the whole #root subtree but below modals (z-1400+).
            document.body
        )
        : null;

    return (
        <div ref={badgeRef} className="flex items-center gap-4 opacity-0 flex-wrap justify-center relative">
            <div
                ref={triggerRef}
                onMouseEnter={handleMouseEnter}
                onMouseLeave={handleMouseLeave}
                className="group cursor-default transition-all active:scale-[0.98] flex items-center gap-3 px-7 py-3.5 rounded-full relative z-[100]"
                style={{
                    background: isDark ? 'rgba(0, 0, 0, 0.4)' : 'rgba(255, 255, 255, 0.4)',
                    backdropFilter: 'blur(30px)',
                    WebkitBackdropFilter: 'blur(30px)',
                    border: isDark ? '1px solid rgba(255, 255, 255, 0.08)' : '1px solid rgba(0, 0, 0, 0.08)',
                    boxShadow: isDark ? '0 8px 32px rgba(0, 0, 0, 0.2)' : '0 8px 32px rgba(0, 0, 0, 0.05)'
                }}
            >
                <div className="relative">
                    <div className="size-[12px] rounded-full transition-slow" style={{ backgroundColor: dotColor }}></div>
                    <div ref={pulseRef} className="absolute inset-0 size-[12px] rounded-full transition-slow" style={{ backgroundColor: dotColor }}></div>
                </div>
                <span className="text-[15px] font-bold text-primary tracking-tight">
                    {getAvailText(availabilityPercent)}
                </span>
            </div>

            {/* iOS Time Lockup Style */}
            <div className="px-6 py-3 rounded-full font-semibold text-[15px] shadow-lg transition-all" style={{
                background: isDark ? 'rgba(0, 0, 0, 0.6)' : 'rgba(255, 255, 255, 0.5)',
                backdropFilter: 'blur(20px)',
                WebkitBackdropFilter: 'blur(20px)',
                border: '1px solid var(--section-border)',
                color: 'var(--text-primary)'
            }}>
                {currentTime.split(' ')[0]}
            </div>

            {/* Book a call — primary CTA right next to the time/availability lockup so
                the site's strongest conversion path (the Google Meet booking modal,
                opened on its meeting tab) is visible without hunting the navbar. */}
            {onBook && (
                <button
                    type="button"
                    onClick={onBook}
                    aria-label="Book a call"
                    className="group flex items-center gap-2 px-6 py-3 rounded-full font-bold text-[15px] shadow-lg transition-all active:scale-[0.98] hover:brightness-110"
                    style={{
                        background: 'rgb(59, 130, 246)',
                        color: 'white',
                        border: '1px solid rgba(59, 130, 246, 0.5)',
                        boxShadow: '0 8px 24px rgba(59, 130, 246, 0.35)'
                    }}
                >
                    <Calendar size={16} strokeWidth={2.5} /> Book a call
                </button>
            )}

            {/* Portal tooltip */}
            {tooltipElement}
        </div>
    );
};


const Hero = ({ onLoaded, onAnimationComplete, isReady = true, onOpenContact }: { onLoaded?: () => void; onAnimationComplete?: () => void; isReady?: boolean; onOpenContact?: () => void }) => {
    const titleRef = useRef<HTMLHeadingElement>(null);
    const imageRef = useRef<HTMLDivElement>(null);
    const imageContainerRef = useRef<HTMLDivElement>(null);
    const box1Ref = useRef<HTMLDivElement>(null);
    const box2Ref = useRef<HTMLDivElement>(null);
    const wrapperRef = useRef<HTMLDivElement>(null);
    const [isDark, setIsDark] = useState(false);
    const [windowWidth, setWindowWidth] = useState(typeof window !== 'undefined' ? window.innerWidth : 1200);
    const [isImageLoaded, setIsImageLoaded] = useState(false);
    const [imageError, setImageError] = useState(false);
    const hasNotifiedLoaded = useRef(false);

    // Shared Settings/Account listener (single Firestore connection for all components)
    const { account, accountLoading } = useSettings();
    // Pick hero image based on theme — fall back to the other variant if one isn't set
    const heroImageUrl = (isDark
        ? (account?.heroImageUrlDark || account?.heroImageUrl)
        : (account?.heroImageUrl || account?.heroImageUrlDark)) || null;
    const profileName = account?.name || 'Tem Revil';
    const profileTitle = account?.title || 'a Front-End';

    // Reset the error flag when the hero URL changes (theme swap / live settings update),
    // using the render-phase "adjust state on dependency change" pattern (React-endorsed,
    // avoids set-state-in-effect). Without this, a previously-failed URL leaves
    // imageError=true and the <img> stays stuck on the transparent-GIF fallback.
    // NOTE: isImageLoaded is intentionally NOT reset — keeps the instant theme-swap.
    const [prevHeroUrl, setPrevHeroUrl] = useState(heroImageUrl);
    if (heroImageUrl !== prevHeroUrl) {
        setPrevHeroUrl(heroImageUrl);
        setImageError(false);
    }

    // Notify parent that initial data is ready
    useEffect(() => {
        if (!accountLoading && onLoaded && !hasNotifiedLoaded.current) {
            hasNotifiedLoaded.current = true;
            onLoaded();
        }
    }, [accountLoading, onLoaded]);

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

    // Responsive sizes
    const isMobile = windowWidth < 768;
    const isSmallMobile = windowWidth < 400;

    // Smooth 1.5s Sequential Reveal
    const timing = {
        slogan1: 0,
        name: 400,
        slogan2: 800,
        rest: 1200
    };

    // Split name into two for staggered layout
    const nameParts = profileName.split(' ');
    const firstName = nameParts[0];
    const lastName = nameParts.slice(1).join(' ');

    // Balanced font sizes for a cleaner look
    const topSloganSize = isSmallMobile ? 45 : (isMobile ? 55 : 75);
    const bottomSloganSize = isSmallMobile ? 35 : (isMobile ? 45 : 65);

    // Read onAnimationComplete from a ref so its identity changing (it depends on
    // hasAutoOpenedCV in the parent) can't re-run the entrance effect — replaying it
    // mid-mount would start a SECOND infinite float loop on the same node.
    const onAnimationCompleteRef = useRef(onAnimationComplete);
    useEffect(() => { onAnimationCompleteRef.current = onAnimationComplete; }, [onAnimationComplete]);

    useEffect(() => {
        if (!isReady) return;

        // Small delay to let loader fade out completely
        const startDelay = 500;

        // Capture the animated nodes now so the cleanup removes the SAME elements
        // these instances target (refs may point elsewhere by cleanup time).
        const wrapperEl = wrapperRef.current;
        const imageEl = imageRef.current;

        // Step 2: Animate name (typing effect)
        const nameAnim = anime({
            targets: '.name-char',
            opacity: [0, 1],
            translateY: [20, 0],
            duration: 600,
            delay: anime.stagger(60, { start: timing.name + startDelay }),
            easing: 'easeOutQuart'
        });

        // Step 4: Animate Image entrance
        const imageAnim = anime({
            targets: imageEl,
            opacity: [0, 1],
            scale: [0.98, 1],
            duration: 1200, // Elegant transition
            easing: 'easeOutQuart',
            delay: timing.rest + startDelay
        });

        // Step 4: Floating animation for the entire wrapper (image + boxes).
        // loop:true runs forever — it MUST be paused on unmount or it keeps ticking
        // on a detached node (per-frame style writes + retained subtree) every time
        // the user navigates away from and back to home.
        const floatAnim = anime({
            targets: wrapperEl,
            translateY: [-10, 10],
            rotate: [-1, 1],
            duration: 4000,
            easing: 'easeInOutSine',
            direction: 'alternate',
            loop: true
        });
        // Notify parent when entrance animations are finished
        const revealTimeout = setTimeout(() => {
            onAnimationCompleteRef.current?.();
        }, timing.rest + 1700); // 1200 duration + 500 startDelay

        return () => {
            clearTimeout(revealTimeout);
            nameAnim.pause();
            imageAnim.pause();
            floatAnim.pause();
            anime.remove(wrapperEl);
            anime.remove(imageEl);
            anime.remove('.name-char');
        };
    }, [isReady, timing.name, timing.rest]);

    return (
        <div className="min-h-screen w-full flex items-center justify-center overflow-hidden relative pt-20 pb-32 transition-slow">


            {/* Wall texture - subtle grain pattern */}
            <div className="absolute inset-0 pointer-events-none" style={{
                backgroundImage: `
                    radial-gradient(circle at 25% 25%, rgba(0,0,0,0.02) 1px, transparent 1px),
                    radial-gradient(circle at 75% 75%, rgba(0,0,0,0.02) 1px, transparent 1px),
                    radial-gradient(circle at 50% 50%, rgba(0,0,0,0.01) 2px, transparent 2px)
                `,
                backgroundSize: '20px 20px, 20px 20px, 40px 40px'
            }}></div>

            <div className="page-padding grid md:grid-cols-2 gap-12 items-center relative z-10 w-full mt-10">

                {/* Left Content */}
                <div className="flex flex-col items-center md:items-start text-center md:text-left relative">
                    <div className="md:ml-[-20px] mb-[-15px] md:mb-[-40px] origin-center md:origin-left z-20">
                        <HandwritingText
                            key="slogan-1"
                            text="THIS IS"
                            fontSize={topSloganSize}
                            delay={timing.slogan1}
                            rotate={-6}
                            isReady={isReady}
                        />
                    </div>

                    <h1 ref={titleRef} className="z-10 transition-slow uppercase flex flex-col gap-0 w-full max-w-[500px] m-0" style={{
                        fontWeight: 900,
                        fontFamily: "var(--font-archivo-black), sans-serif",
                        lineHeight: '0.8'
                    }}>
                        <span className="sr-only">{firstName} {lastName}{profileTitle ? ` - ${profileTitle}` : ''}</span>
                        <span aria-hidden="true" className="text-6xl sm:text-7xl md:text-8xl lg:text-[7rem] tracking-tighter self-start ml-[-5px] md:ml-[-15px] flex">
                            {firstName.split('').map((char, i) => (
                                <span key={i} className="name-char opacity-0 inline-block">{char}</span>
                            ))}
                        </span>
                        <span aria-hidden="true" className="text-6xl sm:text-7xl md:text-8xl lg:text-[7rem] tracking-tighter self-end mr-[-5px] md:mr-[-15px] mt-[-25px] sm:mt-[-35px] md:mt-[-50px] flex">
                            {lastName.split('').map((char, i) => (
                                <span key={i} className="name-char opacity-0 inline-block">{char === ' ' ? '\u00A0' : char}</span>
                            ))}
                        </span>
                    </h1>

                    <div className="mt-[-10px] md:mt-[-50px] md:self-end md:mr-[-10px] lg:mr-[-20px] origin-center md:origin-right z-20">
                        <HandwritingText
                            key={`slogan-2-${profileTitle}`}
                            text={profileTitle}
                            fontSize={bottomSloganSize}
                            delay={timing.slogan2}
                            rotate={-3}
                            isReady={isReady}
                        />
                    </div>

                    {/* Decorative Elements - Hide on mobile if too crowded */}
                    <div className="hidden md:grid absolute top-1/2 left-0 -translate-x-8 translate-y-24 grid-cols-3 gap-2">
                        {[...Array(12)].map((_, i) => (
                            <div key={i} className="w-3 h-3 rounded-full border-2 border-info opacity-40"></div>
                        ))}
                    </div>

                    {/* Available Badge */}
                    <div className="mt-12 md:mt-20 md:ml-4 md:pl-4 relative z-[5000]">
                        <AvailableBadge isDark={isDark} entryDelay={timing.rest} isReady={isReady} onBook={onOpenContact} />
                    </div>

                </div>

                {/* Right Content - Image */}
                <div className="relative flex justify-center mt-8 md:mt-0" ref={imageRef} style={{ opacity: 0 }}>
                    <div ref={wrapperRef} className="relative inline-block max-w-full">
                        {/* Decorative Squares - with floating animation */}
                        <div ref={box1Ref} className={`absolute -top-6 -left-6 size-xl bg-white/10 backdrop-blur-md border border-white/20 ${isDark ? 'z-0' : 'z-30'} scale-75 sm:scale-100`}></div>
                        <div ref={box2Ref} className={`absolute -bottom-6 -right-6 size-xl bg-white/10 backdrop-blur-md border border-white/20 ${isDark ? 'z-0' : 'z-30'} scale-75 sm:scale-100`}></div>

                        {/* Image Container - with floating animation */}
                        <div ref={imageContainerRef} className="relative p-4 border border-white/10 z-10 rounded-lg max-w-full glass-panel" style={{ borderRadius: '16px' }}>
                            <div className="relative w-full max-w-[320px] aspect-[4/5] overflow-hidden bg-white/5 rounded-sm">
                                {/* shimmer-fast keyframes are in globals.css */}
                                {/* Skeleton Loader Container */}
                                <div
                                    className={`absolute inset-0 z-10 bg-white/5 overflow-hidden transition-opacity duration-1000 ease-out ${isImageLoaded ? 'opacity-0 pointer-events-none' : 'opacity-100'}`}
                                >
                                    {/* Moving Light effect - only rendered when loading */}
                                    {!isImageLoaded && (
                                        <div
                                            className="absolute inset-0 w-full h-full bg-gradient-to-r from-transparent via-white/20 to-transparent"
                                            style={{ animation: 'shimmer-fast 1.2s infinite ease-in-out' }}
                                        />
                                    )}
                                </div>

                                <img
                                    src={imageError ? DEFAULT_HERO_URL : (heroImageUrl || DEFAULT_HERO_URL)}
                                    alt={`${profileName} portrait`}
                                    onLoad={() => setIsImageLoaded(true)}
                                    onError={() => setImageError(true)}
                                    className="w-full h-full object-cover transition-all duration-[1500ms] ease-out"
                                    style={{
                                        filter: isImageLoaded ? 'blur(0px)' : 'blur(20px)',
                                        opacity: isImageLoaded ? 1 : 0,
                                        transform: isImageLoaded ? 'scale(1)' : 'scale(1.05)'
                                    }}
                                    fetchPriority="high"
                                />
                            </div>

                            {/* Numbers */}
                            <div className="absolute -left-8 top-1/2 -rotate-90 font-bold text-xl hidden sm:block text-sec">4.0</div>
                            <div className="absolute bottom-[-30px] left-1/2 -translate-x-1/2 font-bold text-xl text-sec">5.0</div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default Hero;
