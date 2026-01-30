import { useState, useEffect } from 'react';
import anime from 'animejs';
import { Layout, Eye, Settings, Bird, LogOut, Tag, User } from 'lucide-react';
import DProjects from './dashboard/D-Projects';
import DTags from './dashboard/D-Tags';
import DLinks from './dashboard/D-Links';
import DSettings from './dashboard/D-Settings';
import DCanary from './dashboard/D-Canary';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from '../lib/firebase';

// The parameter name in the function type would trigger `no-unused-vars` in some
// ESLint configurations, so we suppress that rule for the following type alias.
type OnNavigate = (section: 'home' | 'stack' | 'projects' | 'secret' | 'dashboard' | 'view_link') => void;

interface DashboardProps {
    onNavigate?: OnNavigate;
}

const Dashboard = ({ onNavigate }: DashboardProps) => {
    // theme observation removed here; not used directly in this component
    const [windowWidth, setWindowWidth] = useState(typeof window !== 'undefined' ? window.innerWidth : 1024);
    const [activeTab, setActiveTab] = useState('projects');
    const [profileImage, setProfileImage] = useState<string>('');

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
        const handleResize = () => setWindowWidth(window.innerWidth);
        window.addEventListener('resize', handleResize);
        // no theme observer needed here

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

    const sidebarWidth = isExtraSmall ? '56px' : (isMobile ? '72px' : '260px');
    const iconSize = isExtraSmall ? 18 : 20;
    const avatarSize = isExtraSmall ? '28px' : '32px';

    return (
        <div
            onTouchStart={(e) => e.stopPropagation()}
            onTouchMove={(e) => e.stopPropagation()}
            onTouchEnd={(e) => e.stopPropagation()}
            className="w-full h-screen flex bg-primary relative overflow-hidden touch-pan-y"
            style={{ ['--sidebar-width']: sidebarWidth } as unknown as React.CSSProperties}
        >


            {/* Sidebar */}
            <aside
                className={`
                    h-full flex flex-col z-10 transition-all duration-300
                    bg-[var(--navbar-bg)] backdrop-blur-xl border-r border-[var(--navbar-border)]
                    ${isExtraSmall ? 'p-[12px_8px] gap-1' : isMobile ? 'p-[16px_12px] gap-2' : 'p-[24px_16px] gap-2'}
                `}
                style={{
                    width: sidebarWidth,
                    minWidth: sidebarWidth,
                }}
            >
                {/* Logo Area */}
                <div
                    className={`
                        dashboard-logo flex items-center opacity-0
                        ${isMobile ? 'justify-center' : 'justify-start gap-3 px-3'}
                        ${isExtraSmall ? 'mb-5 px-1' : 'mb-8'}
                    `}
                >
                    <div
                        className="rounded-lg overflow-hidden flex items-center justify-center bg-[rgba(0,0,0,0.1)] dark:bg-[rgba(255,255,255,0.1)]"
                        style={{
                            width: avatarSize,
                            height: avatarSize,
                            minWidth: avatarSize,
                        }}
                    >
                        {profileImage ? (
                            <img
                                src={profileImage}
                                alt="User Avatar"
                                className="w-full h-full object-cover"
                            />
                        ) : (
                            <User className="text-muted/50" size={isExtraSmall ? 16 : 20} />
                        )}
                    </div>
                    {!isMobile && (
                        <span className="text-xl font-bold text-primary font-inter">
                            Revil
                        </span>
                    )}
                </div>

                {/* Navigation Items - Scrollable if needed */}
                <nav className={`flex-1 flex flex-col ${isExtraSmall ? 'gap-1' : 'gap-2'} overflow-y-auto`}>
                    {menuItems.map((item) => {
                        const Icon = item.icon;
                        const isActive = activeTab === item.id;
                        return (
                            <button
                                key={item.id}
                                onClick={() => setActiveTab(item.id)}
                                className={`
                                    sidebar-item relative w-full flex items-center transition-all duration-200 border-0 cursor-pointer
                                    ${isMobile ? 'justify-center' : 'justify-start'}
                                    ${isExtraSmall ? 'p-2.5 rounded-[10px]' : 'p-3 rounded-xl gap-3'}
                                    ${isActive ? 'bg-[rgba(0,0,0,0.05)] dark:bg-[rgba(255,255,255,0.1)] text-primary' : 'bg-transparent text-sec hover:bg-[rgba(0,0,0,0.02)] dark:hover:bg-[rgba(255,255,255,0.05)] hover:text-primary'}
                                `}
                                onMouseEnter={(e) => {
                                    if (!isActive) {
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
                                    <div className="active-sidebar-pill absolute left-0 w-1 h-[60%] bg-accent rounded-r" />
                                )}
                                <Icon size={iconSize} />
                                {!isMobile && (
                                    <span className="text-[0.95rem] font-medium font-inter">
                                        {item.label}
                                    </span>
                                )}
                            </button>
                        );
                    })}
                </nav>

                {/* Bottom Actions - Locked at the end */}
                <div className="pt-4 mt-2 border-t border-[var(--navbar-border)]">
                    <button
                        onClick={() => onNavigate && onNavigate('home')}
                        className={`
                            sidebar-item w-full flex items-center transition-all duration-200 border-0 cursor-pointer bg-transparent text-sec
                            hover:bg-red-500/5 dark:hover:bg-red-500/10 hover:text-red-500
                            ${isMobile ? 'justify-center px-0' : 'justify-start px-3 gap-3'}
                            ${isExtraSmall ? 'py-2 rounded-[10px]' : 'py-3 rounded-xl'}
                        `}
                    >
                        <LogOut size={iconSize} />
                        {!isMobile && (
                            <span className="text-[0.95rem] font-medium font-inter">
                                Logout
                            </span>
                        )}
                    </button>
                </div>
            </aside>

            {/* Main Content Area */}
            <main
                className={`
                    flex-1 h-full overflow-y-auto overflow-x-hidden relative min-w-0
                    ${isExtraSmall ? 'p-3' : isSmall ? 'p-4' : 'p-8'}
                `}
            >
                <div className="max-w-[1200px] mx-auto h-full flex flex-col">
                    {/* Header */}
                    <div
                        className={`
                            flex items-center justify-between
                            ${isExtraSmall ? 'mb-4' : isSmall ? 'mb-5' : 'mb-8'}
                        `}
                    >
                        <h1
                            className={`
                                font-extrabold text-primary font-inter m-0
                                ${isExtraSmall ? 'text-xl' : isSmall ? 'text-2xl' : 'text-[2rem]'}
                            `}
                        >
                            {menuItems.find(i => i.id === activeTab)?.label}
                        </h1>
                    </div>

                    {/* Content Viewport */}
                    <div className="dashboard-content-area flex-1">
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
                            <div className={`
                                w-full h-[90%] flex items-center justify-center text-center p-4
                                border-2 border-dashed border-input-border text-sec font-inter
                                ${isExtraSmall ? 'rounded-2xl text-sm' : 'rounded-3xl text-base'}
                            `}>
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