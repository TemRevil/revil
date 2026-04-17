import { Home, Layers, FolderKanban, Mail, Moon, Sun, FileText } from 'lucide-react';
import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';

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

const Tooltip = ({ text, show, isDark }: { text: string; show: boolean; isDark: boolean }) => (
    <div className={`nav-tooltip ${show ? 'show' : ''}`}>
        <div className="nav-tooltip-inner">
            {text}
        </div>
        <div
            className="nav-tooltip-arrow"
            style={{
                marginLeft: '-6px',
                bottom: '-6px',
                zIndex: -1,
                // Using exact colors from inner to ensure merge
                backgroundColor: isDark ? 'rgba(10, 10, 12, 0.4)' : 'rgba(255, 255, 255, 0.25)',
                borderBottom: isDark ? '1px solid rgba(255, 255, 255, 0.12)' : '1px solid rgba(255, 255, 255, 0.5)',
                borderRight: isDark ? '1px solid rgba(255, 255, 255, 0.12)' : '1px solid rgba(255, 255, 255, 0.5)',
                backdropFilter: 'blur(32px) saturate(200%)',
                WebkitBackdropFilter: 'blur(32px) saturate(200%)',
            }}
        />
    </div>
);

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

    // Auto-show tooltips logic: Projects (3s) -> Contact (3s) -> 10s wait
    useEffect(() => {
        let cycleTimeout: NodeJS.Timeout;

        const runCycle = () => {
            if (isHoveringNav) {
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
                    if (isHoveringNav) { runCycle(); return; }

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
    }, [currentSection, isContactOpen, isHoveringNav]);

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
                            className={getButtonClass('home')}
                            onClick={() => onNavigate?.('home')}
                            onMouseEnter={() => setHoveredTab('home')}
                            onMouseLeave={() => setHoveredTab(null)}
                        >
                            <Home size={iconSize} strokeWidth={2} />
                        </button>
                        <Tooltip text="🏠 Home" show={hoveredTab === 'home'} isDark={isDark} />
                    </div>

                    <div className="relative">
                        <button
                            className={getButtonClass('stack')}
                            onClick={() => onNavigate?.('stack')}
                            onMouseEnter={() => setHoveredTab('stack')}
                            onMouseLeave={() => setHoveredTab(null)}
                        >
                            <Layers size={iconSize} strokeWidth={2} />
                        </button>
                        <Tooltip text="⚡ Stack" show={hoveredTab === 'stack'} isDark={isDark} />
                    </div>

                    <div className="relative">
                        <button
                            className={getButtonClass('projects')}
                            onClick={() => onNavigate?.('projects')}
                            onMouseEnter={() => setHoveredTab('projects')}
                            onMouseLeave={() => setHoveredTab(null)}
                        >
                            <FolderKanban size={iconSize} strokeWidth={2} />
                        </button>
                        <Tooltip text="🚀 Projects" show={hoveredTab === 'projects' || autoTooltip === 'projects'} isDark={isDark} />
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
                            onMouseEnter={() => setHoveredTab('cv')}
                            onMouseLeave={() => setHoveredTab(null)}
                        >
                            <motion.div layoutId="cv-icon" className="flex items-center justify-center" transition={{ type: 'spring', damping: 30, stiffness: 350, mass: 1 }}>
                                <FileText size={20} strokeWidth={2.5} />
                            </motion.div>
                        </motion.button>
                        <Tooltip text="📄 Digital CV" show={hoveredTab === 'cv'} isDark={isDark} />

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

                {/* Divider */}
                <div
                    className={`
                        w-[1px] h-6 
                        bg-[rgba(0,0,0,0.1)] dark:bg-[rgba(255,255,255,0.15)]
                        transition-colors duration-300
                        ${isMobile ? 'mx-1' : 'mx-1.5'}
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
                            onMouseEnter={() => setHoveredTab('mail')}
                            onMouseLeave={() => setHoveredTab(null)}
                        >
                            <motion.div layoutId="contact-icon" className="flex items-center justify-center" transition={{ type: 'spring', damping: 30, stiffness: 350, mass: 1 }}>
                                <Mail size={24} strokeWidth={2} />
                            </motion.div>
                        </motion.button>
                        <Tooltip text="📩 Contact" show={hoveredTab === 'mail' || (autoTooltip === 'mail' && !isContactOpen)} isDark={isDark} />

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
