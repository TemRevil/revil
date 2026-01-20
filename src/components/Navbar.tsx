import { Home, Layers, FolderKanban, Mail, Moon, Sun } from 'lucide-react';
import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';

interface NavbarProps {
    onNavigate?: (section: 'home' | 'stack' | 'projects' | 'secret' | 'dashboard' | 'view_link') => void;
    currentSection?: 'home' | 'stack' | 'projects' | 'secret' | 'dashboard' | 'view_link';
    onOpenContact?: () => void;
    isContactOpen?: boolean;
}

const Tooltip = ({ text, show }: { text: string, show: boolean }) => (
    <div className={`nav-tooltip ${show ? 'show' : ''}`}>
        <div className="nav-tooltip-inner">
            {text}
            <div className="nav-tooltip-arrow" />
        </div>
    </div>
);

const Navbar = ({ onNavigate, currentSection = 'home', onOpenContact, isContactOpen = false }: NavbarProps) => {
    const [isMobile, setIsMobile] = useState(window.innerWidth < 768);
    // Initialize theme from localStorage or system preference
    const [isDark, setIsDark] = useState(() => {
        const savedTheme = localStorage.getItem('theme');
        if (savedTheme) {
            return savedTheme === 'dark';
        }
        return window.matchMedia('(prefers-color-scheme: dark)').matches;
    });
    const [hoveredTab, setHoveredTab] = useState<string | null>(null);
    const [autoTooltip, setAutoTooltip] = useState<string | null>(null);
    const [isHoveringNav, setIsHoveringNav] = useState(false);

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

    // Apply theme on mount
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

    // Auto-show tooltips logic
    useEffect(() => {
        let step = 0; // 0: Projects, 1: Contact, 2: Off? No, let's do 10s ON, 10s ON rotation

        const runRotation = () => {
            if (isHoveringNav) {
                setAutoTooltip(null);
                return;
            }

            if (step === 0) {
                // Show Projects if not already there
                if (currentSection !== 'projects') {
                    setAutoTooltip('projects');
                } else {
                    setAutoTooltip(null);
                }
                step = 1;
            } else {
                // Show Contact if not already open
                if (!isContactOpen) {
                    setAutoTooltip('mail');
                } else {
                    setAutoTooltip(null);
                }
                step = 0;
            }
        };

        // Start the rotation
        const interval = setInterval(runRotation, 10000);

        // Initial run
        runRotation();

        return () => clearInterval(interval);
    }, [currentSection, isContactOpen, isHoveringNav]);

    const getButtonStyle = (tabName: string) => {
        const isActive = currentSection === tabName || (tabName === 'home' && currentSection === 'view_link');
        const isHovered = hoveredTab === tabName;

        return {
            padding: isMobile ? '8px' : '12px',
            borderRadius: isMobile ? '8px' : '12px',
            background: isActive
                ? (isDark ? 'rgba(59, 130, 246, 0.2)' : 'rgba(59, 130, 246, 0.15)')
                : isHovered
                    ? (isDark ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.04)')
                    : 'transparent',
            border: isActive ? '1px solid rgba(59, 130, 246, 0.3)' : '1px solid transparent',
            cursor: 'pointer',
            color: isActive
                ? '#3b82f6'
                : isHovered
                    ? (isDark ? '#ffffff' : '#1f2937')
                    : (isDark ? '#9ca3af' : '#6b7280'),
            transition: 'all 0.2s ease',
            transform: isHovered ? 'scale(1.1)' : 'scale(1)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center'
        };
    };

    const getActionButtonStyle = (tabName: string) => {
        const isHovered = hoveredTab === tabName;

        return {
            padding: isMobile ? '8px' : '12px',
            borderRadius: isMobile ? '8px' : '12px',
            background: isHovered
                ? (isDark ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.04)')
                : 'transparent',
            border: 'none',
            cursor: 'pointer',
            color: isHovered
                ? (isDark ? '#ffffff' : '#1f2937')
                : (isDark ? '#9ca3af' : '#6b7280'),
            transition: 'all 0.2s ease',
            transform: isHovered ? 'scale(1.1)' : 'scale(1)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center'
        };
    };


    return (
        <nav style={{
            position: 'fixed',
            bottom: '24px',
            left: '50%',
            transform: 'translateX(-50%)',
            zIndex: 50,
            width: 'max-content',
            maxWidth: '90%'
        }}>
            <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: isMobile ? '6px' : '12px',
                padding: isMobile ? '10px 16px' : '14px 24px',
                background: isDark ? '#00000060' : '#ffffff40',
                backdropFilter: 'blur(12px)',
                WebkitBackdropFilter: 'blur(12px)',
                borderRadius: isMobile ? '16px' : '24px',
                boxShadow: isDark ? '0 8px 32px rgba(0, 0, 0, 0.4)' : '0 8px 32px rgba(0, 0, 0, 0.1)',
                border: 'none',
                transition: 'all 0.3s ease'
            }}
                onMouseEnter={() => {
                    setIsHoveringNav(true);
                    setAutoTooltip(null); // Immediately dismiss any auto-tooltip
                }}
                onMouseLeave={() => setIsHoveringNav(false)}
            >
                {/* Left Section - Navigation Icons */}
                <div style={{ display: 'flex', alignItems: 'center', gap: isMobile ? '2px' : '4px' }}>
                    <div style={{ position: 'relative' }}>
                        <button
                            style={getButtonStyle('home')}
                            onClick={() => onNavigate?.('home')}
                            onMouseEnter={() => setHoveredTab('home')}
                            onMouseLeave={() => setHoveredTab(null)}
                        >
                            <Home size={isMobile ? 18 : 20} strokeWidth={1.8} />
                        </button>
                        <Tooltip text="🏠 Home" show={hoveredTab === 'home'} />
                    </div>

                    <div style={{ position: 'relative' }}>
                        <button
                            style={getButtonStyle('stack')}
                            onClick={() => onNavigate?.('stack')}
                            onMouseEnter={() => setHoveredTab('stack')}
                            onMouseLeave={() => setHoveredTab(null)}
                        >
                            <Layers size={isMobile ? 18 : 20} strokeWidth={1.8} />
                        </button>
                        <Tooltip text="⚡ Stack" show={hoveredTab === 'stack'} />
                    </div>

                    <div style={{ position: 'relative' }}>
                        <button
                            style={getButtonStyle('projects')}
                            onClick={() => onNavigate?.('projects')}
                            onMouseEnter={() => setHoveredTab('projects')}
                            onMouseLeave={() => setHoveredTab(null)}
                        >
                            <FolderKanban size={isMobile ? 18 : 20} strokeWidth={1.8} />
                        </button>
                        <Tooltip text="🚀 Projects" show={hoveredTab === 'projects' || autoTooltip === 'projects'} />
                    </div>
                </div>

                {/* Divider */}
                <div style={{
                    width: '1px',
                    height: '24px',
                    background: isDark ? 'rgba(255, 255, 255, 0.15)' : 'rgba(0, 0, 0, 0.1)',
                    margin: isMobile ? '0 2px' : '0 6px',
                    transition: 'background 0.3s ease'
                }}></div>

                {/* Right Section - Mail & Theme */}
                <div style={{ display: 'flex', alignItems: 'center', gap: isMobile ? '2px' : '4px' }}>
                    <div style={{ position: 'relative', width: isMobile ? '34px' : '44px', height: isMobile ? '34px' : '44px' }}>
                        <motion.button
                            layoutId="contact-trigger"
                            style={{
                                ...getActionButtonStyle('mail'),
                                position: 'absolute',
                                inset: 0,
                                zIndex: isContactOpen ? 0 : 1,
                                opacity: isContactOpen ? 0 : 1,
                                pointerEvents: isContactOpen ? 'none' : 'auto',
                            }}
                            onClick={onOpenContact}
                            onMouseEnter={() => setHoveredTab('mail')}
                            onMouseLeave={() => setHoveredTab(null)}
                            transition={{
                                type: 'spring',
                                damping: 30,
                                stiffness: 260,
                                mass: 1
                            }}
                        >
                            <motion.div layoutId="contact-icon" style={{ display: 'flex' }}>
                                <Mail size={isMobile ? 18 : 20} strokeWidth={2} />
                            </motion.div>
                        </motion.button>
                        <Tooltip text="📩 Contact" show={hoveredTab === 'mail' || (autoTooltip === 'mail' && !isContactOpen)} />

                        {/* Placeholder */}
                        {isContactOpen && (
                            <div style={{
                                ...getActionButtonStyle('mail'),
                                opacity: 0.2,
                                pointerEvents: 'none'
                            }}>
                                <Mail size={isMobile ? 18 : 20} strokeWidth={2} opacity={0} />
                            </div>
                        )}
                    </div>
                    <button
                        onClick={toggleTheme}
                        onMouseEnter={() => setHoveredTab('theme')}
                        onMouseLeave={() => setHoveredTab(null)}
                        style={getActionButtonStyle('theme')}
                    >
                        {isDark ? (
                            <Sun size={20} strokeWidth={1.8} />
                        ) : (
                            <Moon size={20} strokeWidth={1.8} />
                        )}
                    </button>
                </div>
            </div>
        </nav>
    );
};

export default Navbar;
