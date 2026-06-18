import { useState, useCallback, useEffect, useImperativeHandle, forwardRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { FolderKanban, GitBranch } from 'lucide-react';
import Projects from './Projects';
import Developer from './Developer';

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
}

const ProjectsHub = forwardRef<ProjectsHubHandle, ProjectsHubProps>(({ isTransitioning = false }, ref) => {
    const [activeTab, setActiveTab] = useState<SubTab>('projects');
    const [direction, setDirection] = useState(0);
    const [isAnimating, setIsAnimating] = useState(false);
    const [showSubnav, setShowSubnav] = useState(false);

    const activeIndex = SUB_TABS.findIndex(t => t.key === activeTab);

    const switchTo = useCallback((index: number) => {
        if (index < 0 || index >= SUB_TABS.length || isAnimating) return false;
        const next = SUB_TABS[index];
        if (next.key === activeTab) return false;
        setIsAnimating(true);
        setDirection(index > activeIndex ? 1 : -1);
        setActiveTab(next.key);
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

    // Show sub-nav only after the page transition finishes
    useEffect(() => {
        if (!isTransitioning) {
            const timer = setTimeout(() => setShowSubnav(true), 120);
            return () => clearTimeout(timer);
        }
    }, [isTransitioning]);

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

    return (
        <>
            {/* Content area - overflow-x hidden kills horizontal scrollbar during slide transitions */}
            <div style={{ overflowX: 'hidden', minHeight: '100vh' }}>
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
                        {activeTab === 'projects' ? <Projects /> : <Developer />}
                    </motion.div>
                </AnimatePresence>
            </div>

            {/* Sub-navbar - delayed entrance until page transition settles */}
            <AnimatePresence>
                {showSubnav && (
                    <div
                        /* Sits ~10px above the navbar's top edge at each breakpoint:
                           mobile navbar top ≈ 80px → 90px; desktop top ≈ 96px → 106px.
                           (md: = 768px, matching the navbar's isMobile threshold.) */
                        className="fixed bottom-[90px] md:bottom-[106px] left-1/2 -translate-x-1/2 z-50"
                        onMouseEnter={handleSubnavEnter}
                        onMouseLeave={handleSubnavLeave}
                    >
                        <motion.div
                            initial={{ opacity: 0, y: 10, scale: 0.92 }}
                            animate={{ opacity: 1, y: 0, scale: 1 }}
                            exit={{ opacity: 0, y: 6, scale: 0.96 }}
                            transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
                            className="flex items-center gap-1 p-1.5 rounded-2xl md:gap-1.5 md:p-2 md:rounded-3xl backdrop-blur-xl
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
        </>
    );
});

ProjectsHub.displayName = 'ProjectsHub';

export default ProjectsHub;
