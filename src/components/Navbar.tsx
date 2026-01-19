import { Home, Layers, FolderKanban, Mail, Moon, Sun } from 'lucide-react';
import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';

interface NavbarProps {
    onNavigate?: (section: 'home' | 'stack' | 'projects' | 'secret' | 'dashboard' | 'view_link') => void;
    currentSection?: 'home' | 'stack' | 'projects' | 'secret' | 'dashboard' | 'view_link';
    onOpenContact?: () => void;
    isContactOpen?: boolean;
}

const Navbar = ({ onNavigate, currentSection = 'home', onOpenContact, isContactOpen = false }: NavbarProps) => {
    const [isMobile, setIsMobile] = useState(window.innerWidth < 768);
    const [isDark, setIsDark] = useState(document.documentElement.classList.contains('dark'));
    const [hoveredTab, setHoveredTab] = useState<string | null>(null);

    const toggleTheme = () => {
        document.documentElement.classList.toggle('dark');
        setIsDark(document.documentElement.classList.contains('dark'));
    };

    useEffect(() => {
        const handleResize = () => setIsMobile(window.innerWidth < 768);
        const updateTheme = () => setIsDark(document.documentElement.classList.contains('dark'));

        window.addEventListener('resize', handleResize);

        // Watch for class changes on html element
        const observer = new MutationObserver(updateTheme);
        observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });

        return () => {
            window.removeEventListener('resize', handleResize);
            observer.disconnect();
        };
    }, []);

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
            }}>
                {/* Left Section - Navigation Icons */}
                <div style={{ display: 'flex', alignItems: 'center', gap: isMobile ? '2px' : '4px' }}>
                    <button
                        style={getButtonStyle('home')}
                        onClick={() => onNavigate?.('home')}
                        onMouseEnter={() => setHoveredTab('home')}
                        onMouseLeave={() => setHoveredTab(null)}
                    >
                        <Home size={isMobile ? 18 : 20} strokeWidth={1.8} />
                    </button>
                    <button
                        style={getButtonStyle('stack')}
                        onClick={() => onNavigate?.('stack')}
                        onMouseEnter={() => setHoveredTab('stack')}
                        onMouseLeave={() => setHoveredTab(null)}
                    >
                        <Layers size={isMobile ? 18 : 20} strokeWidth={1.8} />
                    </button>
                    <button
                        style={getButtonStyle('projects')}
                        onClick={() => onNavigate?.('projects')}
                        onMouseEnter={() => setHoveredTab('projects')}
                        onMouseLeave={() => setHoveredTab(null)}
                    >
                        <FolderKanban size={isMobile ? 18 : 20} strokeWidth={1.8} />
                    </button>
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
