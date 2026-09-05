import { Home, Layers, FolderKanban, Mail, Moon, Sun, FileText, Zap, Rocket } from 'lucide-react';
import { useState, useEffect, useRef, useLayoutEffect } from 'react';
import { createPortal } from 'react-dom';
import { motion } from 'motion/react';

type NavigateSection = 'home' | 'stack' | 'projects' | 'secret' | 'dashboard' | 'view_link';

type NavigateFn = (section: NavigateSection) => void;

interface NavbarProps {
    onNavigate?: NavigateFn;
    currentSection?: NavigateSection;
    onOpenContact?: () => void;
    isContactOpen?: boolean;
    onOpenCV?: () => void;
    isCVOpen?: boolean;
}

interface TooltipProps {
    text: string;
    icon?: React.ReactNode;
    show: boolean;
    isDark: boolean;
}

/**
 * Portaled navbar tooltip - renders into document.body so it escapes the
 * `<nav>`'s `-translate-x-1/2` transform (which would otherwise nuke
 * backdrop-filter blur on any descendant).
 *
 * Auto-positions against its parent element (the button it's a sibling of).
 * Drop-in API-compatible with the previous Tooltip: same props, same call sites.
 */
const Tooltip = ({ text, icon, show, isDark }: TooltipProps) => {
    // Invisible anchor - lets us find the parent button without prop-drilling refs
    const anchorRef = useRef<HTMLSpanElement>(null);
    const tooltipRef = useRef<HTMLDivElement>(null);
    const [pos, setPos] = useState<{ centerX: number; topY: number } | null>(null);
    const [tooltipWidth, setTooltipWidth] = useState(0);

    // Measure parent button position whenever shown / on scroll/resize
    useLayoutEffect(() => {
        if (!show) return;
        const update = () => {
            const parent = anchorRef.current?.parentElement;
            if (!parent) return;
            const rect = parent.getBoundingClientRect();
            setPos({
                centerX: rect.left + rect.width / 2,
                topY: rect.top, // tooltip will sit above the button
            });
        };
        update();
        window.addEventListener('scroll', update, true);
        window.addEventListener('resize', update);
        return () => {
            window.removeEventListener('scroll', update, true);
            window.removeEventListener('resize', update);
        };
    }, [show]);

    // Measure tooltip width AFTER paint so we can offset `left` for centering
    // without using a `transform` (which would break backdrop-filter)
    useLayoutEffect(() => {
        if (!show || !tooltipRef.current) return;
        const w = tooltipRef.current.offsetWidth;
        if (w !== tooltipWidth) setTooltipWidth(w);
    }, [show, text, tooltipWidth]);

    if (typeof document === 'undefined') return null;

    // Position using fixed + left + bottom (NO transform anywhere - backdrop-filter
    // would break on the inner element otherwise). Center horizontally by computing
    // `left` from the measured tooltip width.
    const leftPx = pos ? pos.centerX - tooltipWidth / 2 : -9999;
    const bottomPx = pos && typeof window !== 'undefined' ? window.innerHeight - pos.topY + 8 : -9999;

    // Portal into document.body so the tooltip escapes the page-content stacking
    // context entirely. At body level, z-60 sits ABOVE the whole #root subtree
    // (page content, navbar z-50, sub-nav) yet BELOW modals (body-portaled at
    // z-1400+). body has no transform ancestor, so backdrop-filter still works.
    const portalTarget = document.body;

    return (
        <>
            {/* Hidden anchor used only to find parent rect (kept in original DOM tree) */}
            <span ref={anchorRef} aria-hidden style={{ display: 'none' }} />

            {createPortal(
                <div
                    ref={tooltipRef}
                    className={`nav-tooltip ${show ? 'show' : ''}`}
                    style={{
                        position: 'fixed',
                        left: leftPx,
                        bottom: bottomPx,
                    }}
                >
                    <div className="nav-tooltip-inner flex items-center gap-1.5">
                        {icon && <span className="flex items-center shrink-0 opacity-90">{icon}</span>}
                        <span>{text}</span>
                    </div>
                    <div
                        className="nav-tooltip-arrow"
                        style={{
                            marginLeft: '-6px',
                            bottom: '-6px',
                            zIndex: -1,
                            // Match the tooltip body bg + blur exactly so the arrow reads
                            // as a seamless extension. No borders - tooltip body covers
                            // the top half of the arrow, only the bottom diamond tip shows.
                            backgroundColor: isDark ? 'rgba(0, 0, 0, 0.6)' : 'rgba(255, 255, 255, 0.4)',
                            backdropFilter: 'blur(32px) saturate(2)',
                            WebkitBackdropFilter: 'blur(32px) saturate(2)',
                        }}
                    />
                </div>,
                portalTarget,
            )}
        </>
    );
};

const Navbar = ({ onNavigate, currentSection = 'home', onOpenContact, isContactOpen = false, onOpenCV, isCVOpen = false }: NavbarProps) => {
    const [isMobile, setIsMobile] = useState(typeof window !== 'undefined' ? window.innerWidth < 768 : false);

    // Initialize theme
    const [isDark, setIsDark] = useState(() => {
        if (typeof window === 'undefined') return true;
        const savedTheme = localStorage.getItem('theme');
        if (savedTheme) {
            return savedTheme === 'dark';
        }
        return window.matchMedia('(prefers-color-scheme: dark)').matches;
    });

    const [hoveredTab, setHoveredTab] = useState<string | null>(null);
    const [autoTooltip, setAutoTooltip] = useState<string | null>(null);
    const [isHoveringNav, setIsHoveringNav] = useState(false);
    const [isSubnavHovered, setIsSubnavHovered] = useState(false);

    // 0 = Projects, 1 = Mail
    // cycleStepRef is currently not used but kept as a comment for logic reference if needed later
    // const cycleStepRef = useRef(0);

    const toggleTheme = () => {
        const newTheme = !isDark;
        setIsDark(newTheme);
        if (newTheme) {
            document.documentElement.classList.add('dark');
            localStorage.setItem('theme', 'dark');
        } else {
            document.documentElement.classList.remove('dark');
            localStorage.setItem('theme', 'light');
        }
    };

    useEffect(() => {
        if (isDark) {
            document.documentElement.classList.add('dark');
        } else {
            document.documentElement.classList.remove('dark');
        }
    }, [isDark]);

    useEffect(() => {
        const handleResize = () => setIsMobile(window.innerWidth < 768);
        window.addEventListener('resize', handleResize);
        return () => window.removeEventListener('resize', handleResize);
    }, []);

    // Suppress tooltips when sub-nav is hovered (custom event from ProjectsHub)
    useEffect(() => {
        const handler = (e: Event) => {
            setIsSubnavHovered((e as CustomEvent).detail as boolean);
        };
        window.addEventListener('revil:subnav_hover', handler);
        return () => window.removeEventListener('revil:subnav_hover', handler);
    }, []);

    // A tooltip floats directly above the navbar, which on a phone is exactly where the
    // projects sub-navbar sits - so it covered the thing the reader was reaching for. A
    // touch screen has no hover to explain an icon by anyway, so below the breakpoint
    // there are simply no tooltips: this gates every one of them, and the auto-cycle
    // below never starts.
    const tip = (visible: boolean) => visible && !isMobile;

    // Auto-show tooltips logic: Projects (3s) -> Contact (3s) -> 10s wait
    useEffect(() => {
        if (isMobile) return;
        let cycleTimeout: NodeJS.Timeout;

        const runCycle = () => {
            if (isHoveringNav || isSubnavHovered) {
                setAutoTooltip(null);
                // If hovering, check again in 2s to see if we can resume
                cycleTimeout = setTimeout(runCycle, 2000);
                return;
            }

            // Step 1: Show Projects (3s)
            if (currentSection !== 'projects') {
                setAutoTooltip('projects');
            }

            cycleTimeout = setTimeout(() => {
                setAutoTooltip(null);

                // Gap between tooltips
                cycleTimeout = setTimeout(() => {
                    if (isHoveringNav || isSubnavHovered) { runCycle(); return; }

                    // Step 2: Show Contact (3s)
                    if (!isContactOpen) {
                        setAutoTooltip('mail');
                    }

                    cycleTimeout = setTimeout(() => {
                        setAutoTooltip(null);

                        // Step 3: Wait 10s before restart
                        cycleTimeout = setTimeout(runCycle, 10000);
                    }, 3000);
                }, 400); // Tiny gap for smooth transition
            }, 3000);
        };

        // Start immediately
        runCycle();

        return () => {
            clearTimeout(cycleTimeout);
        };
    }, [currentSection, isContactOpen, isHoveringNav, isSubnavHovered, isMobile]);

    // Helper to get button class string based on state
    const getButtonClass = (tabName: string) => {
        const isActive = currentSection === tabName || (tabName === 'home' && currentSection === 'view_link');

        let classes = "btn-icon flex items-center justify-center transition-all duration-200";
        classes += isMobile ? " p-2 rounded-xl" : " p-3 rounded-2xl";

        if (isActive) {
            classes += " bg-[rgba(59,130,246,0.15)] text-[#3b82f6] border border-[rgba(59,130,246,0.3)]";
        } else {
            classes += " hover:scale-110 border border-transparent text-muted hover:text-primary";
        }
        return classes;
    };

    const iconSize = isMobile ? 18 : 22;

    return (
        <nav className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 w-max max-w-[95%]">
            <div
                className={`
                    flex items-center 
                    ${isMobile ? 'gap-1.5 p-2.5 px-4 rounded-2xl' : 'gap-3 p-3 px-6 rounded-3xl'} 
                    backdrop-blur-xl transition-all duration-300
                    shadow-[0_8px_32px_rgba(0,0,0,0.1)] dark:shadow-[0_8px_32px_rgba(0,0,0,0.4)]
                `}
                style={{
                    backgroundColor: isDark ? 'rgba(0, 0, 0, 0.6)' : 'rgba(255, 255, 255, 0.4)',
                }}
                onMouseEnter={() => {
                    setIsHoveringNav(true);
                    setAutoTooltip(null);
                }}
                onMouseLeave={() => setIsHoveringNav(false)}
            >
                {/* Left Section - Navigation Icons */}
                <div className={`flex items-center ${isMobile ? 'gap-1' : 'gap-1.5'}`}>
                    <div className="relative">
                        <button
                            aria-label="Home"
                            className={getButtonClass('home')}
                            onClick={() => onNavigate?.('home')}
                            onMouseEnter={() => setHoveredTab('home')}
                            onMouseLeave={() => setHoveredTab(null)}
                        >
                            <Home size={iconSize} strokeWidth={2} />
                        </button>
                        <Tooltip text="Home" icon={<Home size={14} strokeWidth={2} />} show={tip(hoveredTab === 'home' && !isSubnavHovered)} isDark={isDark} />
                    </div>

                    <div className="relative">
                        <button
                            aria-label="Tech stack"
                            className={getButtonClass('stack')}
                            onClick={() => onNavigate?.('stack')}
                            onMouseEnter={() => setHoveredTab('stack')}
                            onMouseLeave={() => setHoveredTab(null)}
                        >
                            <Layers size={iconSize} strokeWidth={2} />
                        </button>
                        <Tooltip text="Stack" icon={<Zap size={14} strokeWidth={2} />} show={tip(hoveredTab === 'stack' && !isSubnavHovered)} isDark={isDark} />
                    </div>

                    <div className="relative">
                        <button
                            aria-label="Projects"
                            className={getButtonClass('projects')}
                            onClick={() => onNavigate?.('projects')}
                            onMouseEnter={() => setHoveredTab('projects')}
                            onMouseLeave={() => setHoveredTab(null)}
                        >
                            <FolderKanban size={iconSize} strokeWidth={2} />
                        </button>
                        <Tooltip text="Projects" icon={<Rocket size={14} strokeWidth={2} />} show={tip((hoveredTab === 'projects' || autoTooltip === 'projects') && !isSubnavHovered)} isDark={isDark} />
                    </div>

                    <div
                        className="relative"
                        style={{ width: isMobile ? '36px' : '48px', height: isMobile ? '36px' : '48px' }}
                    >
                        <motion.button
                            className={`
                                btn-icon absolute inset-0 flex items-center justify-center
                                ${isMobile ? 'p-2 rounded-xl' : 'p-3 rounded-2xl'}
                                text-muted hover:text-primary hover:bg-[rgba(0,0,0,0.04)] dark:hover:bg-[rgba(255,255,255,0.1)]
                                hover:scale-110 transition-all duration-200
                            `}
                            style={{
                                zIndex: isCVOpen ? 0 : 1,
                                opacity: isCVOpen ? 0 : 1,
                                pointerEvents: isCVOpen ? 'none' : 'auto',
                            }}
                            onClick={onOpenCV}
                            aria-label="Open digital CV"
                            onMouseEnter={() => setHoveredTab('cv')}
                            onMouseLeave={() => setHoveredTab(null)}
                        >
                            {!isCVOpen && (
                                <motion.div layoutId="cv-icon" className="flex items-center justify-center" transition={{ type: 'spring', damping: 30, stiffness: 350, mass: 1 }}>
                                    <FileText size={20} strokeWidth={2.5} />
                                </motion.div>
                            )}
                        </motion.button>
                        <Tooltip text="Digital CV" icon={<FileText size={14} strokeWidth={2} />} show={tip(hoveredTab === 'cv' && !isSubnavHovered)} isDark={isDark} />

                        {isCVOpen && (
                            <div className={`
                                flex items-center justify-center opacity-20 pointer-events-none
                                ${isMobile ? 'p-2' : 'p-3'}
                            `}>
                                <FileText size={iconSize} strokeWidth={2} className="opacity-0" />
                            </div>
                        )}
                    </div>
                </div>

                {/* Divider - shorter on mobile to match the smaller icon buttons */}
                <div
                    className={`
                        w-[1px]
                        bg-[rgba(0,0,0,0.1)] dark:bg-[rgba(255,255,255,0.15)]
                        transition-colors duration-300
                        ${isMobile ? 'h-5 mx-0.5' : 'h-6 mx-1.5'}
                    `}
                />

                {/* Right Section - Mail & Theme */}
                <div className={`flex items-center ${isMobile ? 'gap-1' : 'gap-1.5'}`}>
                    <div
                        className="relative"
                        style={{ width: isMobile ? '36px' : '48px', height: isMobile ? '36px' : '48px' }}
                    >
                        <motion.button
                            className={`
                                btn-icon absolute inset-0 flex items-center justify-center
                                ${isMobile ? 'p-2 rounded-xl' : 'p-3 rounded-2xl'}
                                text-muted hover:text-primary hover:bg-[rgba(0,0,0,0.04)] dark:hover:bg-[rgba(255,255,255,0.1)]
                                hover:scale-110 transition-all duration-200
                            `}
                            style={{
                                zIndex: isContactOpen ? 0 : 1,
                                opacity: isContactOpen ? 0 : 1,
                                pointerEvents: isContactOpen ? 'none' : 'auto',
                            }}
                            onClick={onOpenContact}
                            aria-label="Open contact form"
                            onMouseEnter={() => setHoveredTab('mail')}
                            onMouseLeave={() => setHoveredTab(null)}
                        >
                            {!isContactOpen && (
                                <motion.div layoutId="contact-icon" className="flex items-center justify-center" transition={{ type: 'spring', damping: 30, stiffness: 350, mass: 1 }}>
                                    <Mail size={24} strokeWidth={2} />
                                </motion.div>
                            )}
                        </motion.button>
                        <Tooltip text="Contact" icon={<Mail size={14} strokeWidth={2} />} show={tip((hoveredTab === 'mail' || (autoTooltip === 'mail' && !isContactOpen)) && !isSubnavHovered)} isDark={isDark} />

                        {isContactOpen && (
                            <div className={`
                                flex items-center justify-center opacity-20 pointer-events-none
                                ${isMobile ? 'p-2' : 'p-3'}
                            `}>
                                <Mail size={iconSize} strokeWidth={2} className="opacity-0" />
                            </div>
                        )}
                    </div>

                    <button
                        onClick={toggleTheme}
                        aria-label={isDark ? 'Switch to light theme' : 'Switch to dark theme'}
                        aria-pressed={isDark}
                        onMouseEnter={() => setHoveredTab('theme')}
                        onMouseLeave={() => setHoveredTab(null)}
                        className={`
                            btn-icon flex items-center justify-center
                            ${isMobile ? 'p-2 rounded-xl' : 'p-3 rounded-2xl'}
                            text-muted hover:text-primary hover:bg-[rgba(0,0,0,0.04)] dark:hover:bg-[rgba(255,255,255,0.1)]
                            hover:scale-110 transition-all duration-200
                        `}
                    >
                        {isDark ? (
                            <Sun size={iconSize} strokeWidth={2} />
                        ) : (
                            <Moon size={iconSize} strokeWidth={2} />
                        )}
                    </button>
                </div>
            </div>
        </nav>
    );
};

export default Navbar;
