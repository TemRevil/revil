import { useState, useCallback, useEffect, useImperativeHandle, useRef, forwardRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { createPortal } from 'react-dom';
import { useHydrated } from '../../hooks/useHydrated';
import { FolderKanban, GitBranch } from 'lucide-react';
import Projects from './Projects';
import Developer from '../developer/Developer';
import { cachedDoc } from '../../lib/dataCache';
import { prefetchGithub } from '../../lib/githubData';

type SubTab = 'projects' | 'developer';

// Ordered list of sub-tabs - extend this array to add more pages
const SUB_TABS: { key: SubTab; label: string; icon: typeof FolderKanban }[] = [
    { key: 'projects', label: 'Projects', icon: FolderKanban },
    { key: 'developer', label: 'Developer', icon: GitBranch },
];

export interface ProjectsHubHandle {
    /** Try to swipe to the next sub-tab (right). Returns true if handled. */
    trySwipeRight: () => boolean;
    /** Try to swipe to the previous sub-tab (left). Returns true if handled. */
    trySwipeLeft: () => boolean;
}

interface ProjectsHubProps {
    isTransitioning?: boolean;
    /** Rendered inside the mobile single-scroll page: the sub-nav sticks within this
     *  section instead of floating over the whole viewport. */
    embedded?: boolean;
    /** False while built off screen (see Stack): the sub-nav stays away and the entrances wait. */
    active?: boolean;
}

// The phone page and the desktop switcher are different trees, so crossing the
// breakpoint remounts this and would otherwise snap a reader reading Developer back
// to Projects. Module-level, not storage: it outlives the remount and nothing else,
// so a fresh load still opens on Projects.
let lastTab: SubTab = 'projects';

const ProjectsHub = forwardRef<ProjectsHubHandle, ProjectsHubProps>(({ isTransitioning = false, embedded = false, active = true }, ref) => {
    const [activeTab, setActiveTab] = useState<SubTab>(() => lastTab);
    const [direction, setDirection] = useState(0);
    const [isAnimating, setIsAnimating] = useState(false);
    const [showSubnav, setShowSubnav] = useState(false);
    const [withinSection, setWithinSection] = useState(false);
    const subnavRef = useRef<HTMLDivElement>(null);
    const hydrated = useHydrated();

    const activeIndex = SUB_TABS.findIndex(t => t.key === activeTab);

    const switchTo = useCallback((index: number) => {
        if (index < 0 || index >= SUB_TABS.length || isAnimating) return false;
        const next = SUB_TABS[index];
        if (next.key === activeTab) return false;
        setIsAnimating(true);
        setDirection(index > activeIndex ? 1 : -1);
        setActiveTab(next.key);
        lastTab = next.key;
        return true;
    }, [activeTab, activeIndex, isAnimating]);

    const switchTab = useCallback((tab: SubTab) => {
        const idx = SUB_TABS.findIndex(t => t.key === tab);
        switchTo(idx);
    }, [switchTo]);

    // Expose imperative swipe methods to App.tsx
    useImperativeHandle(ref, () => ({
        trySwipeRight: () => {
            if (activeIndex < SUB_TABS.length - 1) {
                return switchTo(activeIndex + 1);
            }
            return false; // Already on last tab - let App navigate to secret
        },
        trySwipeLeft: () => {
            if (activeIndex > 0) {
                return switchTo(activeIndex - 1);
            }
            return false; // Already on first tab - let App handle
        },
    }), [activeIndex, switchTo]);

    // Show sub-nav only after the page transition finishes, and take it away when the
    // section leaves (it stays mounted off screen on desktop).
    const settled = active && !isTransitioning;
    useEffect(() => {
        if (!settled) return;
        const timer = setTimeout(() => setShowSubnav(true), 120);
        return () => {
            clearTimeout(timer);
            setShowSubnav(false);
        };
    }, [settled]);

    // The Developer tab's GitHub numbers are read once this section is reached, so the tab
    // opens on them, without every visit to the site spending GitHub's 60 reads an hour
    // per visitor. On the phone's scroll page that is when it nears the screen.
    const contentRef = useRef<HTMLDivElement>(null);
    useEffect(() => {
        if (!active) return;
        const read = () => prefetchGithub(((cachedDoc(['Settings', 'Developer'])?.featuredRepos ?? []) as string[]).filter(Boolean));
        const el = contentRef.current;
        if (!embedded || !el || typeof IntersectionObserver === 'undefined') { read(); return; }
        const io = new IntersectionObserver((entries) => {
            if (entries.some(e => e.isIntersecting)) { io.disconnect(); read(); }
        }, { rootMargin: '50% 0px' });
        io.observe(el);
        return () => io.disconnect();
    }, [active, embedded]);

    // Bottom-sticky gets pushed down by its section boundary as it enters, behind
    // the dock. Reserve a fixed slot and show it only inside the projects section.
    useEffect(() => {
        const content = contentRef.current;
        const subnav = subnavRef.current;
        if (!embedded || !showSubnav || !hydrated || !content || !subnav) return;
        const scroller = content.closest('#mobile-scroll');
        let frame = 0;
        const update = () => {
            frame = 0;
            const dock = document.querySelector('[data-main-dock]');
            if (!dock) { setWithinSection(false); return; }
            const slotBottom = dock.getBoundingClientRect().top - 10;
            const slotTop = slotBottom - subnav.getBoundingClientRect().height;
            const bounds = content.getBoundingClientRect();
            setWithinSection(bounds.top <= slotTop && bounds.bottom >= slotBottom);
        };
        const schedule = () => { if (!frame) frame = requestAnimationFrame(update); };
        const observer = new ResizeObserver(schedule);
        observer.observe(content);
        observer.observe(subnav);
        scroller?.addEventListener('scroll', schedule, { passive: true });
        window.addEventListener('resize', schedule);
        window.addEventListener('revil:dock-resize', schedule);
        window.visualViewport?.addEventListener('resize', schedule);
        schedule();
        return () => {
            cancelAnimationFrame(frame);
            observer.disconnect();
            scroller?.removeEventListener('scroll', schedule);
            window.removeEventListener('resize', schedule);
            window.removeEventListener('revil:dock-resize', schedule);
            window.visualViewport?.removeEventListener('resize', schedule);
        };
    }, [embedded, showSubnav, hydrated]);

    // Dispatch custom event when hovering sub-nav so Navbar can suppress tooltips
    const handleSubnavEnter = useCallback(() => {
        window.dispatchEvent(new CustomEvent('revil:subnav_hover', { detail: true }));
    }, []);
    const handleSubnavLeave = useCallback(() => {
        window.dispatchEvent(new CustomEvent('revil:subnav_hover', { detail: false }));
    }, []);

    const variants = {
        enter: (d: number) => ({ x: d > 0 ? '40%' : '-40%', opacity: 0 }),
        center: { x: 0, opacity: 1 },
        exit: (d: number) => ({ x: d > 0 ? '-40%' : '40%', opacity: 0 }),
    };

    const subnav = (
            <AnimatePresence>
                {showSubnav && (
                    <div
                        ref={subnavRef}
                        data-project-subnav
                        aria-hidden={embedded && !withinSection}
                        className="fixed left-1/2 -translate-x-1/2 z-40 w-max max-w-[95%]"
                        style={{
                            bottom: 'var(--bottom-nav-clearance, 106px)',
                            visibility: embedded && !withinSection ? 'hidden' : undefined,
                        }}
                        onMouseEnter={handleSubnavEnter}
                        onMouseLeave={handleSubnavLeave}
                    >
                        <motion.div
                            initial={{ opacity: 0, y: 10, scale: 0.92 }}
                            animate={{ opacity: 1, y: 0, scale: 1 }}
                            exit={{ opacity: 0, y: 6, scale: 0.96 }}
                            transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
                            className="glass-bar flex items-center gap-1 p-1.5 rounded-2xl md:gap-1.5 md:p-2 md:rounded-3xl backdrop-blur-xl
                                       shadow-[0_4px_20px_rgba(0,0,0,0.08)] dark:shadow-[0_4px_20px_rgba(0,0,0,0.3)]"
                            style={{
                                backgroundColor: 'var(--subnav-bg, rgba(255,255,255,0.25))',
                                border: '1px solid var(--section-border)',
                            }}
                        >
                            {SUB_TABS.map((tab) => {
                                const isActive = activeTab === tab.key;
                                const Icon = tab.icon;
                                return (
                                    <button
                                        key={tab.key}
                                        onClick={() => switchTab(tab.key)}
                                        className="relative flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold
                                                   md:gap-2.5 md:px-5 md:py-2.5 md:rounded-2xl md:text-sm
                                                   transition-colors duration-200 cursor-pointer"
                                        style={{
                                            color: isActive ? 'var(--accent)' : 'var(--text-muted)',
                                            background: 'transparent',
                                            border: 'none',
                                        }}
                                    >
                                        {isActive && (
                                            <motion.div
                                                layoutId="subnav-pill"
                                                className="absolute inset-0 rounded-xl md:rounded-2xl"
                                                style={{
                                                    background: 'rgba(51, 149, 255, 0.12)',
                                                    border: '1px solid rgba(51, 149, 255, 0.25)',
                                                }}
                                                transition={{ type: 'spring', damping: 28, stiffness: 380 }}
                                            />
                                        )}
                                        <Icon strokeWidth={2.2} className="relative z-10 w-[15px] h-[15px] md:w-[18px] md:h-[18px]" />
                                        <span className="relative z-10">{tab.label}</span>
                                    </button>
                                );
                            })}
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>
    );

    return (
        <>
            {/* Content area - overflow-x hidden kills horizontal scrollbar during slide transitions */}
            <div ref={contentRef} style={{ overflowX: 'hidden', minHeight: '100vh' }}>
                <AnimatePresence
                    mode="wait"
                    custom={direction}
                    initial={false}
                    onExitComplete={() => setIsAnimating(false)}
                >
                    <motion.div
                        key={activeTab}
                        custom={direction}
                        variants={variants}
                        initial="enter"
                        animate="center"
                        exit="exit"
                        transition={{ duration: 0.3, ease: [0.4, 0, 0.2, 1] }}
                        className="min-h-screen"
                    >
                        {activeTab === 'projects' ? <Projects active={active} /> : <Developer active={active} />}
                    </motion.div>
                </AnimatePresence>
            </div>

            {embedded ? hydrated && createPortal(subnav, document.body) : subnav}
        </>
    );
});

ProjectsHub.displayName = 'ProjectsHub';

export default ProjectsHub;
