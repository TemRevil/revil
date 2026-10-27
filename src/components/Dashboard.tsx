import { useState, useEffect, useRef, lazy, Suspense, startTransition, type ComponentType } from 'react';
import { Layout, Footprints, Settings, Bird, LogOut, Tag, User, GitBranch, Landmark } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { doc, onSnapshot } from 'firebase/firestore';
import { onAuthStateChanged, signOut } from 'firebase/auth';
import { db } from '../lib/firebase';
import { appAuth } from '../lib/appAuth';
import useMediaQuery from '../hooks/useMediaQuery';
import { EASE } from './dashboard/motion';

// The parameter name in the function type would trigger `no-unused-vars` in some
// ESLint configurations, so we suppress that rule for the following type alias.
type OnNavigate = (section: 'home' | 'stack' | 'projects' | 'secret' | 'dashboard' | 'view_link') => void;

interface DashboardProps {
    onNavigate?: OnNavigate;
}

type TabId = 'projects' | 'tags' | 'trails' | 'developer' | 'treasury' | 'settings' | 'canary';

// Each tab is its own chunk, loaded the first time it opens (or when its nav item is
// hovered), so opening the dashboard no longer downloads and parses every tab's
// libraries - recharts, react-markdown, the cropper - up front.
const tab = (load: () => Promise<{ default: ComponentType }>) => ({ load, Component: lazy(load) });
const TABS: Record<TabId, ReturnType<typeof tab>> = {
    projects: tab(() => import('./dashboard/D-Projects')),
    tags: tab(() => import('./dashboard/D-Tags')),
    trails: tab(() => import('./dashboard/D-Trails')),
    developer: tab(() => import('./dashboard/D-Developer')),
    treasury: tab(() => import('./dashboard/D-Treasury')),
    settings: tab(() => import('./dashboard/D-Settings')),
    canary: tab(() => import('./dashboard/D-Canary')),
};
const Assistant = lazy(() => import('./dashboard/Assistant'));

const MENU_ITEMS: { id: TabId; label: string; icon: typeof Layout }[] = [
    { id: 'projects', label: 'Projects', icon: Layout },
    { id: 'tags', label: 'Tags', icon: Tag },
    { id: 'trails', label: 'Trails', icon: Footprints },
    { id: 'developer', label: 'Developer', icon: GitBranch },
    { id: 'treasury', label: 'Treasury', icon: Landmark },
    { id: 'settings', label: 'Settings', icon: Settings },
    { id: 'canary', label: 'Canary', icon: Bird },
];
const isTabId = (s: string): s is TabId => s in TABS;

const Dashboard = ({ onNavigate }: DashboardProps) => {
    const [activeTab, setActiveTab] = useState<TabId>('projects');
    const [profileImage, setProfileImage] = useState<string>('');
    // In-dashboard AI copilot ("Spark") can be switched off from Settings → MCP.
    // Defaults on; only skips mounting when explicitly disabled in Settings/MCP.
    const [aiEnabled, setAiEnabled] = useState(true);
    // Nothing of the dashboard renders, and nothing reads Firestore, until the admin
    // claim is confirmed - no admin chrome flashing for a stranger, no listeners refused
    // with permission-denied on a restored session that turns out not to be the owner.
    const [authorized, setAuthorized] = useState(false);
    const offAuthRef = useRef<(() => void) | null>(null);

    // Responsive breakpoints, followed with media queries (no resize listener).
    const isExtraSmall = useMediaQuery('(max-width: 399px)');
    const isSmall = useMediaQuery('(max-width: 639px)');
    const isMobile = useMediaQuery('(max-width: 767px)');

    // Auth gate: the dashboard is admin-only. If there's no signed-in user (e.g.
    // it was restored on refresh without a session), bounce home so we never fire
    // admin-only reads/writes that Firestore would reject with permission-denied.
    useEffect(() => {
        const off = onAuthStateChanged(appAuth(), (user) => {
            if (!user) { setAuthorized(false); onNavigate?.('home'); return; }
            // Signed in but not the owner: sign out and leave.
            user.getIdTokenResult().then(r => {
                if (r.claims.admin === true) { setAuthorized(true); return; }
                setAuthorized(false);
                appAuth().signOut().catch(() => {});
                onNavigate?.('home');
            }).catch(() => { setAuthorized(false); onNavigate?.('home'); });
        });
        offAuthRef.current = off;
        return () => { off(); offAuthRef.current = null; };
    }, [onNavigate]);

    useEffect(() => {
        if (!authorized) return;
        const unsub = onSnapshot(doc(db, 'Settings', 'Account'), (docSnap) => {
            if (docSnap.exists()) {
                const data = docSnap.data();
                if (data.imageUrl) setProfileImage(data.imageUrl);
            }
        }, () => { /* the header just keeps the placeholder */ });
        return () => unsub();
    }, [authorized]);

    // Watch the AI assistant toggle (Settings/MCP.assistantEnabled).
    useEffect(() => {
        if (!authorized) return;
        const unsub = onSnapshot(doc(db, 'Settings', 'MCP'), (snap) => {
            const data = snap.exists() ? snap.data() : {};
            setAiEnabled(data.assistantEnabled !== false);
        }, () => { /* admin-only; ignore transient errors */ });
        return () => unsub();
    }, [authorized]);

    // Logout ends the session for real. It used to only navigate home, which left the
    // admin signed in: reopening /dashboard on a shared computer walked straight back in.
    const logout = async () => {
        // Stop listening first, so the sign-out below doesn't also trigger the gate's own
        // "no user, go home" and navigate twice.
        offAuthRef.current?.();
        offAuthRef.current = null;
        setAuthorized(false);
        try { await signOut(appAuth()); } catch (e) { console.warn('[Dashboard] sign-out failed', e); }
        onNavigate?.('home');
    };

    // Tab switches run as a transition: the current tab stays on screen while the next
    // one's chunk loads, then the two cross-fade, instead of blanking in between.
    const openTab = (id: string) => {
        if (!isTabId(id)) return;
        startTransition(() => setActiveTab(id));
    };

    if (!authorized) {
        return <div className="w-full h-screen bg-primary" aria-busy="true" />;
    }

    const sidebarWidth = isExtraSmall ? '56px' : (isMobile ? '72px' : '260px');
    const iconSize = isExtraSmall ? 18 : 20;
    const avatarSize = isExtraSmall ? '28px' : '32px';

    const activeItem = MENU_ITEMS.find(i => i.id === activeTab);
    const ActiveIcon = activeItem?.icon;
    const ActiveTab = TABS[activeTab].Component;
    const headerIconBoxSize = isExtraSmall ? 'w-8 h-8 rounded-lg' : isSmall ? 'w-9 h-9 rounded-xl' : 'w-11 h-11 rounded-2xl';
    const headerIconSize = isExtraSmall ? 16 : isSmall ? 18 : 22;

    // Staggered sidebar entrance: each item slides in from the left in turn.
    const sidebarItem = (i: number) => ({
        initial: { opacity: 0, x: -16 },
        animate: { opacity: 1, x: 0 },
        transition: { duration: 0.35, ease: EASE.outQuint, delay: 0.05 + i * 0.03 },
    });

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
                <motion.div
                    initial={{ opacity: 0, scale: 0.85 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ duration: 0.4, ease: EASE.outQuint }}
                    className={`
                        dashboard-logo flex items-center
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
                </motion.div>

                {/* Navigation Items - Scrollable if needed */}
                <nav aria-label="Dashboard" className={`flex-1 flex flex-col ${isExtraSmall ? 'gap-1' : 'gap-2'} overflow-y-auto`}>
                    {MENU_ITEMS.map((item, i) => {
                        const Icon = item.icon;
                        const isActive = activeTab === item.id;
                        return (
                            <motion.button
                                key={item.id}
                                {...sidebarItem(i)}
                                onClick={() => openTab(item.id)}
                                // Warm the tab's chunk on intent, so the click rarely waits.
                                onMouseEnter={() => { void TABS[item.id].load(); }}
                                onFocus={() => { void TABS[item.id].load(); }}
                                // On narrow screens only the icon shows; this keeps the name.
                                aria-label={item.label}
                                aria-current={isActive ? 'page' : undefined}
                                className={`
                                    sidebar-item group relative w-full flex items-center transition-colors duration-200 border-0 cursor-pointer
                                    ${isMobile ? 'justify-center' : 'justify-start'}
                                    ${isExtraSmall ? 'p-2.5 rounded-[10px]' : 'p-3 rounded-xl gap-3'}
                                    ${isActive ? 'bg-[rgba(0,0,0,0.05)] dark:bg-[rgba(255,255,255,0.1)] text-primary' : 'bg-transparent text-sec hover:bg-[rgba(0,0,0,0.02)] dark:hover:bg-[rgba(255,255,255,0.05)] hover:text-primary'}
                                `}
                            >
                                {isActive && (
                                    <motion.div
                                        layoutId="active-sidebar-pill"
                                        className="active-sidebar-pill absolute left-0 w-1 h-[60%] bg-accent rounded-r"
                                        transition={{ type: 'spring', stiffness: 380, damping: 30 }}
                                    />
                                )}
                                <Icon
                                    size={iconSize}
                                    className={isActive ? undefined : 'transition-transform duration-200 ease-out group-hover:scale-[1.2]'}
                                />
                                {!isMobile && (
                                    <span className="text-[0.95rem] font-medium font-inter">
                                        {item.label}
                                    </span>
                                )}
                            </motion.button>
                        );
                    })}
                </nav>

                {/* Bottom Actions - Locked at the end */}
                <div className="pt-4 mt-2 border-t border-[var(--section-border)]">
                    <motion.button
                        {...sidebarItem(MENU_ITEMS.length)}
                        onClick={logout}
                        aria-label="Log out"
                        className={`
                            sidebar-item w-full flex items-center transition-colors duration-200 border-0 cursor-pointer bg-transparent text-sec
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
                    </motion.button>
                </div>
            </aside>

            {/* Main Content Area */}
            <main
                className={`
                    flex-1 h-full overflow-y-auto overflow-x-hidden relative min-w-0
                    ${isExtraSmall ? 'p-3' : isSmall ? 'p-4' : 'p-8'}
                `}
            >
                {/* Wide screens get a wider page: at 1200px the dashboard left a few hundred
                    pixels of dead margin on either side that no panel could reach. */}
                <div className="max-w-[1200px] xl:max-w-[1440px] 2xl:max-w-[1600px] mx-auto h-full flex flex-col w-full">
                    {/* Header */}
                    <div
                        className={`
                            flex items-center justify-between
                            ${isExtraSmall ? 'mb-4' : isSmall ? 'mb-5' : 'mb-8'}
                        `}
                    >
                        <div className={`flex items-center ${isExtraSmall ? 'gap-2' : 'gap-3'}`}>
                            {ActiveIcon && (
                                <span className={`${headerIconBoxSize} flex items-center justify-center bg-blue-500/10 text-blue-500 shrink-0`}>
                                    <ActiveIcon size={headerIconSize} />
                                </span>
                            )}
                            <h1
                                className={`
                                    font-extrabold text-primary font-inter m-0
                                    ${isExtraSmall ? 'text-xl' : isSmall ? 'text-2xl' : 'text-[2rem]'}
                                `}
                            >
                                {activeItem?.label}
                            </h1>
                        </div>
                    </div>

                    {/* Content Viewport. This fade is the ONE entrance a tab gets: the tabs
                        animate only their own sub-section switches, never their first mount,
                        so nothing paints, hides and fades in a second time. */}
                    <div className="dashboard-content-area flex-1 relative min-h-0">
                        <Suspense fallback={null}>
                            <AnimatePresence mode="wait">
                                <motion.div
                                    key={activeTab}
                                    initial={{ opacity: 0, y: 6 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    exit={{ opacity: 0, y: -6 }}
                                    transition={{ duration: 0.15, ease: 'easeInOut' }}
                                    className="w-full h-full flex flex-col"
                                >
                                    <ActiveTab />
                                </motion.div>
                            </AnimatePresence>
                        </Suspense>
                    </div>
                </div>
            </main>

            {/* AI co-pilot - floating orb, can navigate, click, and read/write data.
                Gated by Settings → MCP → "Dashboard AI assistant". */}
            {aiEnabled && (
                <Suspense fallback={null}>
                    <Assistant onNavigate={openTab} currentPage={activeTab} />
                </Suspense>
            )}
        </div >
    );
};

export default Dashboard;
