import { useState, useEffect, useRef } from 'react';
import anime from 'animejs';
import { Layout, Eye, Settings, Bird, LogOut, Tag, User } from 'lucide-react';
import DProjects from './dashboard/D-Projects';
import DTags from './dashboard/D-Tags';
import DLinks from './dashboard/D-Links';
import DSettings from './dashboard/D-Settings';
import DCanary from './dashboard/D-Canary';
// import userImg from '../assets/imgs/user.jpg';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from '../lib/firebase';

interface DashboardProps {
    onNavigate?: (section: any) => void;
}

const Dashboard = ({ onNavigate }: DashboardProps) => {
    const [isDark, setIsDark] = useState(false);
    const [windowWidth, setWindowWidth] = useState(window.innerWidth);
    const [activeTab, setActiveTab] = useState('projects');
    const [profileImage, setProfileImage] = useState<string>('');

    // Touch state for swipe navigation (using refs for performance)
    const touchStartRef = useRef<{ x: number, y: number } | null>(null);
    const touchEndRef = useRef<{ x: number, y: number } | null>(null);

    // Responsive breakpoints
    const isExtraSmall = windowWidth < 400;  // 320px - 399px
    const isSmall = windowWidth < 640;        // 400px - 639px
    const isMobile = windowWidth < 768;       // 640px - 767px

    useEffect(() => {
        const unsub = onSnapshot(doc(db, 'Settings', 'Account'), (docSnap) => {
            if (docSnap.exists()) {
                const data = docSnap.data();
                if (data.imageUrl) setProfileImage(data.imageUrl);
            }
        });
        return () => unsub();
    }, []);

    useEffect(() => {
        const checkTheme = () => {
            setIsDark(document.documentElement.classList.contains('dark'));
        };
        const handleResize = () => setWindowWidth(window.innerWidth);

        checkTheme();
        window.addEventListener('resize', handleResize);
        const observer = new MutationObserver(checkTheme);
        observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });

        // Staggered Sidebar Entrance Animation
        anime({
            targets: '.sidebar-item',
            translateX: [-50, 0],
            opacity: [0, 1],
            delay: anime.stagger(100, { start: 300 }),
            easing: 'easeOutQuint',
            duration: 800
        });

        // Logo Entrance
        anime({
            targets: '.dashboard-logo',
            scale: [0.5, 1],
            opacity: [0, 1],
            duration: 1000,
            easing: 'easeOutElastic(1, .8)'
        });

        return () => {
            window.removeEventListener('resize', handleResize);
            observer.disconnect();
        };
    }, []);

    // Tab Switch Animation
    useEffect(() => {
        anime({
            targets: '.dashboard-content-area',
            translateY: [20, 0],
            opacity: [0, 1],
            scale: [0.98, 1],
            duration: 600,
            easing: 'easeOutQuint'
        });

        // Active indicator pulse
        anime({
            targets: '.active-sidebar-pill',
            scale: [0.9, 1.1, 1],
            duration: 400,
            easing: 'easeOutQuad'
        });
    }, [activeTab]);

    const menuItems = [
        { id: 'projects', label: 'Projects', icon: Layout },
        { id: 'tags', label: 'Tags', icon: Tag },
        { id: 'views', label: 'Views', icon: Eye },
        { id: 'settings', label: 'Settings', icon: Settings },
        { id: 'canary', label: 'Canary', icon: Bird },
    ];

    // Dynamic sizing based on screen width
    const sidebarWidth = isExtraSmall ? '56px' : (isMobile ? '72px' : '260px');
    const sidebarPadding = isExtraSmall ? '12px 8px' : (isMobile ? '16px 12px' : '24px 16px');
    const mainPadding = isExtraSmall ? '12px' : (isSmall ? '16px' : '32px');
    const headerFontSize = isExtraSmall ? '1.25rem' : (isSmall ? '1.5rem' : '2rem');
    const headerMarginBottom = isExtraSmall ? '16px' : (isSmall ? '20px' : '32px');
    const iconSize = isExtraSmall ? 18 : 20;
    const buttonPadding = isExtraSmall ? '10px' : '12px';
    const avatarSize = isExtraSmall ? '28px' : '32px';
    const logoMarginBottom = isExtraSmall ? '20px' : '32px';

    // Touch handlers
    const minSwipeDistance = 50;

    const onTouchStart = (e: React.TouchEvent) => {
        touchEndRef.current = null;
        touchStartRef.current = {
            x: e.targetTouches[0].clientX,
            y: e.targetTouches[0].clientY
        };
    };

    const onTouchMove = (e: React.TouchEvent) => {
        touchEndRef.current = {
            x: e.targetTouches[0].clientX,
            y: e.targetTouches[0].clientY
        };
    };

    const onTouchEnd = () => {
        if (!touchStartRef.current || !touchEndRef.current) return;

        const xDistance = touchStartRef.current.x - touchEndRef.current.x;
        const yDistance = touchStartRef.current.y - touchEndRef.current.y;

        const isHorizontal = Math.abs(xDistance) > Math.abs(yDistance);

        const currentIndex = menuItems.findIndex(item => item.id === activeTab);
        let nextIndex = currentIndex;

        if (isHorizontal) {
            // Horizontal Swipe
            if (xDistance > minSwipeDistance) {
                // Swipe Left (R->L) -> Next Tab (Standard)
                nextIndex = (currentIndex + 1) % menuItems.length;
            } else if (xDistance < -minSwipeDistance) {
                // Swipe Right (L->R) -> Previous Tab (Standard)
                nextIndex = (currentIndex - 1 + menuItems.length) % menuItems.length;
            }
        } else {
            // Vertical Swipe
            if (yDistance > minSwipeDistance) {
                // Swipe Up (Bottom->Top) -> Next Tab
                nextIndex = (currentIndex + 1) % menuItems.length;
            } else if (yDistance < -minSwipeDistance) {
                // Swipe Down (Top->Bottom) -> Previous Tab
                nextIndex = (currentIndex - 1 + menuItems.length) % menuItems.length;
            }
        }

        if (nextIndex !== currentIndex) {
            setActiveTab(menuItems[nextIndex].id);
        }
    };

    return (
        <div
            onTouchStart={onTouchStart}
            onTouchMove={onTouchMove}
            onTouchEnd={onTouchEnd}
            style={{
                width: '100%',
                height: '100vh',
                display: 'flex',
                backgroundColor: isDark ? '#0a0a0a' : '#f3f4f6',
                position: 'relative',
                overflow: 'hidden',
                touchAction: 'none' // Prevent browser scrolling to allow full touch control
            }}>
            {/* Decorative Background Blobs */}
            <div className="blob-container">
                <div className="blob blob-1"></div>
                <div className="blob blob-2"></div>
                <div className="blob blob-3"></div>
                <div className="blob blob-4"></div>
                <div className="blob blob-5"></div>
                <div className="blob blob-6"></div>
            </div>

            {/* Sidebar */}
            <aside style={{
                width: sidebarWidth,
                minWidth: sidebarWidth,
                height: '100%',
                backgroundColor: isDark ? '#00000040' : '#ffffff59',
                backdropFilter: 'blur(12px)',
                WebkitBackdropFilter: 'blur(12px)',
                borderRight: `1px solid ${isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.05)'}`,
                display: 'flex',
                flexDirection: 'column',
                padding: sidebarPadding,
                gap: isExtraSmall ? '4px' : '8px',
                transition: 'width 0.3s ease',
                zIndex: 10
            }}>
                <div className="dashboard-logo" style={{
                    marginBottom: logoMarginBottom,
                    padding: isExtraSmall ? '0 4px' : '0 12px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: isMobile ? 'center' : 'flex-start',
                    gap: '12px',
                    opacity: 0 // Initial state for animation
                }}>
                    <div style={{
                        width: avatarSize,
                        height: avatarSize,
                        minWidth: avatarSize,
                        borderRadius: '8px',
                        overflow: 'hidden',
                        backgroundColor: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center'
                    }}>
                        {profileImage ? (
                            <img
                                src={profileImage}
                                alt="User Avatar"
                                style={{
                                    width: '100%',
                                    height: '100%',
                                    objectFit: 'cover'
                                }}
                            />
                        ) : (
                            <User className="text-zinc-500/50" />
                        )}
                    </div>
                    {!isMobile && (
                        <span style={{
                            fontSize: '1.25rem',
                            fontWeight: 700,
                            color: 'var(--text-primary)',
                            fontFamily: "'Inter', sans-serif"
                        }}>
                            Revil
                        </span>
                    )}
                </div>

                {menuItems.map((item) => {
                    const Icon = item.icon;
                    const isActive = activeTab === item.id;
                    return (
                        <button
                            key={item.id}
                            onClick={() => setActiveTab(item.id)}
                            className="sidebar-item"
                            style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: '12px',
                                padding: buttonPadding,
                                borderRadius: isExtraSmall ? '10px' : '12px',
                                border: 'none',
                                backgroundColor: isActive
                                    ? (isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.05)')
                                    : 'transparent',
                                color: isActive
                                    ? 'var(--text-primary)'
                                    : 'var(--text-secondary)',
                                cursor: 'pointer',
                                transition: 'all 0.2s ease',
                                width: '100%',
                                justifyContent: isMobile ? 'center' : 'flex-start',
                                position: 'relative',
                                opacity: 0 // Initial state for animation
                            }}
                            onMouseEnter={(e) => {
                                if (!isActive) {
                                    e.currentTarget.style.backgroundColor = isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.02)';
                                    e.currentTarget.style.color = 'var(--text-primary)';
                                    anime({
                                        targets: e.currentTarget.querySelector('svg'),
                                        scale: 1.2,
                                        duration: 200,
                                        easing: 'easeOutQuad'
                                    });
                                }
                            }}
                            onMouseLeave={(e) => {
                                if (!isActive) {
                                    e.currentTarget.style.backgroundColor = 'transparent';
                                    e.currentTarget.style.color = 'var(--text-secondary)';
                                    anime({
                                        targets: e.currentTarget.querySelector('svg'),
                                        scale: 1,
                                        duration: 200,
                                        easing: 'easeOutQuad'
                                    });
                                }
                            }}
                        >
                            {isActive && (
                                <div className="active-sidebar-pill" style={{
                                    position: 'absolute',
                                    left: 0,
                                    width: '4px',
                                    height: '60%',
                                    backgroundColor: 'var(--accent)',
                                    borderRadius: '0 4px 4px 0'
                                }} />
                            )}
                            <Icon size={iconSize} />
                            {!isMobile && (
                                <span style={{
                                    fontSize: '0.95rem',
                                    fontWeight: 500,
                                    fontFamily: "'Inter', sans-serif"
                                }}>
                                    {item.label}
                                </span>
                            )}
                        </button>
                    );
                })}

                <div style={{ marginTop: 'auto' }}>
                    <button
                        onClick={() => onNavigate && onNavigate('home')}
                        style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '12px',
                            padding: buttonPadding,
                            borderRadius: isExtraSmall ? '10px' : '12px',
                            border: 'none',
                            backgroundColor: 'transparent',
                            color: 'var(--text-secondary)',
                            cursor: 'pointer',
                            transition: 'all 0.2s ease',
                            width: '100%',
                            justifyContent: isMobile ? 'center' : 'flex-start'
                        }}
                        onMouseEnter={(e) => {
                            e.currentTarget.style.backgroundColor = isDark ? 'rgba(239, 68, 68, 0.1)' : 'rgba(239, 68, 68, 0.05)';
                            e.currentTarget.style.color = 'rgb(239, 68, 68)';
                        }}
                        onMouseLeave={(e) => {
                            e.currentTarget.style.backgroundColor = 'transparent';
                            e.currentTarget.style.color = 'var(--text-secondary)';
                        }}
                    >
                        <LogOut size={iconSize} />
                        {!isMobile && (
                            <span style={{
                                fontSize: '0.95rem',
                                fontWeight: 500,
                                fontFamily: "'Inter', sans-serif"
                            }}>
                                Logout
                            </span>
                        )}
                    </button>
                </div>
            </aside>

            {/* Main Content */}
            <main style={{
                flex: 1,
                height: '100%',
                overflowY: 'auto',
                overflowX: 'hidden',
                padding: mainPadding,
                position: 'relative',
                minWidth: 0 // Important for flex children to shrink properly
            }}>
                <div style={{
                    maxWidth: '1200px',
                    margin: '0 auto',
                    height: '100%'
                }}>
                    {/* Header / Top bar area */}
                    <div style={{
                        marginBottom: headerMarginBottom,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between'
                    }}>
                        <h1 style={{
                            fontSize: headerFontSize,
                            fontWeight: 800,
                            color: 'var(--text-primary)',
                            fontFamily: "'Inter', sans-serif",
                            margin: 0
                        }}>
                            {menuItems.find(i => i.id === activeTab)?.label}
                        </h1>
                    </div>

                    {/* Content Area */}
                    <div className="dashboard-content-area" style={{ height: '100%' }}>
                        {activeTab === 'projects' ? (
                            <DProjects />
                        ) : activeTab === 'tags' ? (
                            <DTags />
                        ) : activeTab === 'views' ? (
                            <DLinks />
                        ) : activeTab === 'settings' ? (
                            <DSettings />
                        ) : activeTab === 'canary' ? (
                            <DCanary />
                        ) : (
                            <div style={{
                                width: '100%',
                                height: '90%',
                                borderRadius: isExtraSmall ? '16px' : '24px',
                                border: `2px dashed ${isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)'}`,
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                color: 'var(--text-secondary)',
                                fontFamily: "'Inter', sans-serif",
                                fontSize: isExtraSmall ? '0.85rem' : '1rem',
                                padding: '16px',
                                textAlign: 'center'
                            }}>
                                <span>Content for {menuItems.find(i => i.id === activeTab)?.label} will go here</span>
                            </div>
                        )}
                    </div>
                </div>
            </main>
        </div >
    );
};

export default Dashboard;
