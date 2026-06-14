import { useState, useCallback, useEffect, useRef, lazy, Suspense } from 'react';
import { LayoutGroup, AnimatePresence, motion } from 'motion/react';
import Hero from './components/Hero';
import Navbar from './components/Navbar';
import PageTransition from './components/PageTransition';
import { ChevronRight } from 'lucide-react';
import Loader from './components/reactbits/Loader';
import { Algorithm } from './components/Algorithm';
import type { ProjectsHubHandle } from './components/ProjectsHub';
import type { Contributor as ContributorViewData } from './components/M-ContributorView';
import { ProjectData as Project, ContributorData as Contributor } from './types';
import { SettingsProvider } from './contexts/SettingsContext';
import ErrorBoundary from './components/ErrorBoundary';

// Code-split everything that isn't part of the first paint (home = Hero + Navbar).
// Each chunk loads on demand: section views load on navigation (hidden behind the
// page-transition curtain), modals load when first opened, and SecretPage/Dashboard
// load after explicit navigation. This keeps the eager bundle small for fast TBT.
// SecretPage pulls firebase/auth + firebase/functions; Dashboard pulls recharts +
// react-easy-crop + anime.js — none of which belong in the first-paint bundle.
const Stack = lazy(() => import('./components/Stack'));
const ProjectsHub = lazy(() => import('./components/ProjectsHub'));
const MContact = lazy(() => import('./components/M-Contact'));
const MCV = lazy(() => import('./components/M-CV'));
const MProjectView = lazy(() => import('./components/M-ProjectView'));
const MContributorView = lazy(() => import('./components/M-ContributorView'));
const SecretPage = lazy(() => import('./components/SecretPage'));
const Dashboard = lazy(() => import('./components/Dashboard'));

// Fallback for the section-level error boundary. A failed lazy-chunk fetch (e.g.
// a returning user on a stale index.html after a redeploy) would otherwise blank
// the whole SPA; this keeps it recoverable with a one-tap reload.
const sectionErrorFallback = (
  <div style={{
    position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column',
    alignItems: 'center', justifyContent: 'center', gap: 16, padding: 24, textAlign: 'center',
    color: 'var(--text-primary)', zIndex: 1,
  }}>
    <p style={{ margin: 0, fontWeight: 600 }}>Something went wrong loading this section.</p>
    <button
      onClick={() => window.location.reload()}
      style={{
        padding: '10px 20px', borderRadius: 12, border: '1px solid var(--section-border)',
        background: 'var(--card-bg)', color: 'var(--text-primary)', cursor: 'pointer', fontWeight: 600,
      }}
    >
      Reload
    </button>
  </div>
);

// Fallback for the modal-level error boundaries. The modal chunks are lazy-loaded
// the first time each modal opens; on a tab left open across a redeploy the old
// hashed chunk is gone (the release swap deletes it) and the import() rejects.
// Without a boundary that throw unmounts the entire SPA — so each modal Suspense
// gets this recoverable reload prompt instead.
const modalErrorFallback = (
  <div style={{
    position: 'fixed', inset: 0, zIndex: 1400, display: 'flex',
    alignItems: 'center', justifyContent: 'center', padding: 24,
    background: 'rgba(0,0,0,0.3)', backdropFilter: 'blur(8px)', WebkitBackdropFilter: 'blur(8px)',
  }}>
    <div style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16,
      padding: 28, borderRadius: 20, textAlign: 'center', maxWidth: 360,
      background: 'var(--card-bg)', border: '1px solid var(--section-border)', color: 'var(--text-primary)',
    }}>
      <p style={{ margin: 0, fontWeight: 600 }}>Couldn&apos;t open this — the app was just updated.</p>
      <button
        onClick={() => window.location.reload()}
        style={{
          padding: '10px 20px', borderRadius: 12, border: '1px solid var(--section-border)',
          background: 'var(--card-bg)', color: 'var(--text-primary)', cursor: 'pointer', fontWeight: 600,
        }}
      >
        Reload
      </button>
    </div>
  </div>
);

type Section = 'home' | 'stack' | 'projects' | 'secret' | 'dashboard' | 'view_link';

function App() {
  const [currentSection, setCurrentSection] = useState<Section>(() => {
    if (typeof window === 'undefined') return 'home';
    // Persisted return: if the admin was on the dashboard, a refresh keeps them
    // there (dashboard is reached via in-app nav, not the URL, so it'd otherwise
    // reset to home). Only 'dashboard' is restored — public sections follow the URL.
    try {
      if (localStorage.getItem('revil_section') === 'dashboard') return 'dashboard';
    } catch { /* ignore */ }
    const path = window.location.pathname;
    const base = "";
    const normPath = path.replace(/\/$/, '');
    const normBase = base.replace(/\/$/, '');
    if (normPath !== normBase && normPath !== '') {
      return 'view_link';
    }
    return 'home';
  });
  const [previousSection, setPreviousSection] = useState<Section>('home');
  const [isTransitioning, setIsTransitioning] = useState(false);
  const [nextSection, setNextSection] = useState<Section>('home');

  // Always-current section, read inside delayed callbacks (e.g. hero anim complete)
  // to avoid stale-closure races where the user navigated away before the timer fired.
  const currentSectionRef = useRef<Section>(currentSection);
  useEffect(() => {
    currentSectionRef.current = currentSection;
    // Remember the dashboard across refreshes; clear it for any public section so
    // leaving the dashboard doesn't strand the user there on next load.
    try {
      if (currentSection === 'dashboard') localStorage.setItem('revil_section', 'dashboard');
      else localStorage.removeItem('revil_section');
    } catch { /* ignore */ }
  }, [currentSection]);
  const [isContactModalOpen, setIsContactModalOpen] = useState(false);
  const [forceHideLoading, setForceHideLoading] = useState(false);
  const [isDataReady, setIsDataReady] = useState(false);
  const [isWindowReady, setIsWindowReady] = useState(false);
  const [isCVModalOpen, setIsCVModalOpen] = useState(false);
  const [selectedProject, setSelectedProject] = useState<Project | null>(null);
  const [showProjectModal, setShowProjectModal] = useState(false);
  const [selectedContributor, setSelectedContributor] = useState<ContributorViewData | null>(null);
  const [showContributorModal, setShowContributorModal] = useState(false);
  const [hasAutoOpenedCV, setHasAutoOpenedCV] = useState(false);

  // Version Control & Forced Cache Invalidation
  // Update APP_VERSION whenever you want to force all return users to clear their app caches.
  // We preserve user preferences (theme) and visitor-analytics dedupe keys so the user's
  // setting doesn't reset and we don't double-count returning visitors on every version bump.
  useEffect(() => {
    const APP_VERSION = 'v1.0.1'; // Change this to force a wipe
    if (typeof window === 'undefined' || typeof localStorage === 'undefined') return;
    const currentVersion = localStorage.getItem('revil_app_version');
    if (currentVersion === APP_VERSION) return;

    // First visit (no stored version): there is nothing to purge — record the version
    // silently and bail. This avoids a console warning + full page reload on every
    // fresh visitor (Lighthouse/PSI always run with empty localStorage, which would
    // otherwise trip the "no browser errors logged" audit and double the initial load).
    if (currentVersion === null) {
      localStorage.setItem('revil_app_version', APP_VERSION);
      return;
    }

    if (process.env.NODE_ENV !== 'production') {
      console.warn('[Version Control] Mismatch detected. Purging app caches (keeping user prefs)...');
    }

    // Keys we want to KEEP through a version wipe
    const PRESERVE_PREFIXES = ['theme', 'revil_visitor_', 'revil_app_version'];
    const preserved: Record<string, string> = {};
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (!key) continue;
      if (PRESERVE_PREFIXES.some(p => key.startsWith(p) || key === p)) {
        const v = localStorage.getItem(key);
        if (v !== null) preserved[key] = v;
      }
    }

    localStorage.clear();
    sessionStorage.clear();
    for (const [k, v] of Object.entries(preserved)) {
      localStorage.setItem(k, v);
    }
    localStorage.setItem('revil_app_version', APP_VERSION);
    window.location.reload();
  }, []);

  useEffect(() => {
    const handleLoad = () => setIsWindowReady(true);
    if (document.readyState === 'complete' || document.readyState === 'interactive') {
      setTimeout(() => setIsWindowReady(true), 0);
    } else {
      window.addEventListener('DOMContentLoaded', handleLoad);
      return () => window.removeEventListener('DOMContentLoaded', handleLoad);
    }
  }, []);

  // Safety timer to hide loader if data never arrives
  useEffect(() => {
    const safety = setTimeout(() => {
      setForceHideLoading(true);
    }, 4000);
    return () => clearTimeout(safety);
  }, []);

  // Derived loading state (avoid setting state synchronously inside effects)
  const appLoading = forceHideLoading ? false : !(isDataReady && isWindowReady);

  // Warm the on-demand public chunks once the first paint is done, so the first
  // navigation/modal-open doesn't pay a network roundtrip behind a blank Suspense
  // fallback. Runs in idle time → keeps the eager bundle as small as today.
  // SecretPage/Dashboard are intentionally left cold (admin-only).
  useEffect(() => {
    if (appLoading) return;
    let cancelled = false;
    const warm = () => {
      if (cancelled) return;
      import('./components/Stack');
      import('./components/ProjectsHub');
      import('./components/M-Contact');
      import('./components/M-CV');
    };
    const hasRIC = typeof window.requestIdleCallback === 'function';
    const handle = hasRIC ? window.requestIdleCallback(warm) : window.setTimeout(warm, 2000);
    return () => {
      cancelled = true;
      if (hasRIC) window.cancelIdleCallback(handle); else clearTimeout(handle);
    };
  }, [appLoading]);



  const handleHeroAnimationComplete = useCallback(() => {
    const isInterviewerMode = typeof sessionStorage !== 'undefined' ? sessionStorage.getItem('revil_interviewer_mode') === 'true' : false;
    // Read the section from a ref at fire-time — the user may have navigated away
    // during the ~3s hero entrance, and we must not pop the CV modal over another page.
    const section = currentSectionRef.current;
    if (isInterviewerMode && !hasAutoOpenedCV && (section === 'home' || section === 'view_link')) {
      setHasAutoOpenedCV(true);
      setIsCVModalOpen(true);
    }
  }, [hasAutoOpenedCV]);

  const [direction, setDirection] = useState(0);

  // Helper to get the current scrollable container by ID
  const getScrollContainer = (sectionName: Section) => {
    return document.getElementById(`section-${sectionName}`) as HTMLDivElement | null;
  };

  const navigateTo = useCallback((section: Section) => {
    if (section !== currentSection && !isTransitioning) {
      const order: Section[] = ['home', 'stack', 'projects'];
      const currIdx = order.indexOf(currentSection);
      const nextIdx = order.indexOf(section);

      let dir = 0;
      if (section === 'secret') {
        dir = 2;
      } else if (currentSection === 'secret') {
        dir = -2;
      } else if (currIdx !== -1 && nextIdx !== -1) {
        dir = nextIdx > currIdx ? 1 : -1;
      }

      if (section === 'secret') {
        setPreviousSection(currentSection);
      }

      setDirection(dir);
      setNextSection(section);
      setCurrentSection(section);

      setIsTransitioning(true);
    }
  }, [currentSection, isTransitioning]);

  const handleCurtainCovered = useCallback(() => { }, []);

  const handleTransitionComplete = useCallback(() => {
    setIsTransitioning(false);
  }, []);

  const openContactModal = useCallback(() => setIsContactModalOpen(true), []);
  const closeContactModal = useCallback(() => setIsContactModalOpen(false), []);

  const openCVModal = useCallback(() => setIsCVModalOpen(true), []);
  const closeCVModal = useCallback(() => setIsCVModalOpen(false), []);

  const handleProjectClick = useCallback((project: Project) => {
    setSelectedProject(project);
    setShowProjectModal(true);
  }, []);

  const handleContributorClick = useCallback((contributor: Contributor) => {
    setSelectedContributor(contributor as unknown as ContributorViewData);
    setShowContributorModal(true);
  }, []);

  const renderSection = () => {
    switch (currentSection) {
      case 'home':
        return <Hero onLoaded={() => setIsDataReady(true)} onAnimationComplete={handleHeroAnimationComplete} isReady={!appLoading} onOpenContact={openContactModal} />;
      case 'stack':
        return <Suspense fallback={null}><Stack /></Suspense>;
      case 'projects':
        return <Suspense fallback={null}><ProjectsHub ref={hubRef} isTransitioning={isTransitioning} /></Suspense>;
      case 'secret':
        return <Suspense fallback={null}><SecretPage onNavigate={navigateTo} /></Suspense>;
      case 'dashboard':
        return <Suspense fallback={null}><Dashboard onNavigate={navigateTo} /></Suspense>;
      case 'view_link':
        return <Hero onLoaded={() => setIsDataReady(true)} onAnimationComplete={handleHeroAnimationComplete} isReady={!appLoading} onOpenContact={openContactModal} />;
      default:
        return <Hero onAnimationComplete={handleHeroAnimationComplete} isReady={!appLoading} />;
    }
  };

  const hubRef = useRef<ProjectsHubHandle>(null);

  // --- Touch Logic (Mobile) ---
  const touchStartX = useRef(0);
  const touchEndX = useRef(0);
  const touchStartY = useRef(0);
  const touchEndY = useRef(0);

  const handleTouchStart = (e: React.TouchEvent) => {
    if (currentSection === 'dashboard') return;
    touchStartX.current = e.targetTouches[0].clientX;
    touchStartY.current = e.targetTouches[0].clientY;
    touchEndX.current = e.targetTouches[0].clientX;
    touchEndY.current = e.targetTouches[0].clientY;
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (currentSection === 'dashboard') return;
    touchEndX.current = e.targetTouches[0].clientX;
    touchEndY.current = e.targetTouches[0].clientY;
  };

  const handleTouchEnd = () => {
    if (isContactModalOpen || currentSection === 'dashboard' || document.body.style.overflow === 'hidden') {
      touchStartX.current = 0; touchEndX.current = 0; touchStartY.current = 0; touchEndY.current = 0;
      return;
    }

    const SWIPE_THRESHOLD = 120; // High sensitivity to avoid accidental swipes
    const deltaX = touchStartX.current - touchEndX.current;
    const deltaY = touchStartY.current - touchEndY.current;

    // VERY IMPORTANT: Reset values immediately so a rapid double-tap doesn't use old cached end values
    touchStartX.current = 0; touchEndX.current = 0; touchStartY.current = 0; touchEndY.current = 0;

    // If there was basically no movement (like a single tap or tiny jitter), ignore it
    if (Math.abs(deltaX) < SWIPE_THRESHOLD && Math.abs(deltaY) < SWIPE_THRESHOLD) {
      return;
    }

    const container = getScrollContainer(currentSection);
    if (!container) return;

    // Use a small buffer (5px)
    const scrolledToBottom = Math.ceil(container.clientHeight + container.scrollTop) >= container.scrollHeight - 5;
    const scrolledToTop = container.scrollTop <= 5;

    if (Math.abs(deltaX) > Math.abs(deltaY)) {
      if (deltaX > SWIPE_THRESHOLD) {
        // Right swipe: cycle through sub-tabs first, then secret
        if (currentSection === 'projects') {
          if (!hubRef.current?.trySwipeRight()) {
            navigateTo('secret');
          }
        } else if (currentSection !== 'secret') {
          navigateTo('secret');
        }
      } else if (deltaX < -SWIPE_THRESHOLD) {
        // Left swipe: from secret go back, on projects cycle sub-tabs
        if (currentSection === 'secret') {
          navigateTo(previousSection);
        } else if (currentSection === 'projects') {
          hubRef.current?.trySwipeLeft();
        }
      }
    } else {
      if (deltaY > SWIPE_THRESHOLD && scrolledToBottom) {
        if (currentSection === 'home' || currentSection === 'view_link') navigateTo('stack');
        else if (currentSection === 'stack') navigateTo('projects');
      }
      else if (deltaY < -SWIPE_THRESHOLD && scrolledToTop) {
        if (currentSection === 'projects') navigateTo('stack');
        else if (currentSection === 'stack') navigateTo('home');
      }
    }
  };


  // --- Wheel/Scroll Logic (Desktop) ---
  const scrollAccumulator = useRef(0);
  const lastWheelTime = useRef(0);
  const navigationCooldownUntil = useRef(0);

  useEffect(() => {
    const handleWheel = (e: WheelEvent) => {
      const now = Date.now();

      // HARD LOCK: After navigating, ignore ALL wheel events for 1.5s.
      // No exceptions. No debounce. No acceleration detection.
      // This is the only reliable way to beat trackpad momentum.
      if (now < navigationCooldownUntil.current) return;

      if (isContactModalOpen || currentSection === 'dashboard' || document.body.style.overflow === 'hidden') return;
      if (isTransitioning) return;

      const container = getScrollContainer(currentSection);
      if (!container) return;

      // Reset accumulator if user paused scrolling for 200ms (new gesture)
      if (now - lastWheelTime.current > 200) {
        scrollAccumulator.current = 0;
      }
      lastWheelTime.current = now;

      const isScrollDown = e.deltaY > 0;
      const isScrollUp = e.deltaY < 0;

      // Check if at edges (5px buffer)
      const scrolledToBottom = Math.ceil(container.clientHeight + container.scrollTop) >= container.scrollHeight - 5;
      const scrolledToTop = container.scrollTop <= 5;

      const THRESHOLD = 50;

      if (isScrollDown && scrolledToBottom) {
        scrollAccumulator.current += e.deltaY;

        if (scrollAccumulator.current > THRESHOLD) {
          scrollAccumulator.current = 0;
          navigationCooldownUntil.current = now + 1500; // Lock for 1.5s

          if (currentSection === 'home' || currentSection === 'view_link') navigateTo('stack');
          else if (currentSection === 'stack') navigateTo('projects');
        }
      } else if (isScrollUp && scrolledToTop) {
        scrollAccumulator.current += e.deltaY;

        if (scrollAccumulator.current < -THRESHOLD) {
          scrollAccumulator.current = 0;
          navigationCooldownUntil.current = now + 1500; // Lock for 1.5s

          if (currentSection === 'projects') navigateTo('stack');
          else if (currentSection === 'stack') navigateTo('home');
        }
      } else {
        scrollAccumulator.current = 0;
      }
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (isContactModalOpen || document.body.style.overflow === 'hidden') {
        if (e.key === 'Escape') closeContactModal();
        const activeTag = document.activeElement?.tagName;
        if (activeTag === 'INPUT' || activeTag === 'TEXTAREA') return;
        if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', ' ', 'PageUp', 'PageDown', 'Home', 'End'].includes(e.key)) {
          e.preventDefault();
        }
        return;
      }
    };

    window.addEventListener('wheel', handleWheel, { passive: false });
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('wheel', handleWheel);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [currentSection, isTransitioning, navigateTo, isContactModalOpen, closeContactModal]);

  const mainRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const mainContainer = mainRef.current;
    if (!mainContainer) return;

    const preventPullToRefresh = (e: TouchEvent) => {
      const container = getScrollContainer(currentSection);
      if (!container) return;
      const pullDelta = e.touches[0].clientY - touchStartY.current;
      const isPullingDown = pullDelta > 10; // 10px threshold
      const scrolledToTop = container.scrollTop <= 2;

      if (scrolledToTop && isPullingDown && !isContactModalOpen && currentSection !== 'dashboard') {
        if (e.cancelable) e.preventDefault();
      }
    };

    mainContainer.addEventListener('touchmove', preventPullToRefresh, { passive: false });
    return () => mainContainer.removeEventListener('touchmove', preventPullToRefresh);
  }, [currentSection, isContactModalOpen]);

  // Fixes #4: Prevent unintended yellow page UI rotation on transitions
  const variants = {
    enter: (direction: number) => {
      if (Math.abs(direction) === 2) {
        return { x: direction === 2 ? '100%' : '-100%', y: 0, opacity: 1, scale: 1 };
      }
      return { y: direction > 0 ? '100vh' : '-100vh', x: 0, opacity: 1, scale: 0.95 };
    },
    center: { x: 0, y: 0, opacity: 1, scale: 1 },
    exit: (direction: number) => {
      if (Math.abs(direction) === 2) {
        return { x: direction === 2 ? '-100%' : '100%', y: 0, opacity: 1, scale: 1 };
      }
      return { y: direction < 0 ? '100vh' : '-100vh', x: 0, opacity: 1, scale: 0.95 };
    }
  };

  return (
    <SettingsProvider>
    <main
      ref={mainRef}
      className="relative w-full h-screen overflow-hidden"
      style={{ touchAction: 'pan-y' }}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
    >
      <Loader isOpen={appLoading} isFullScreen={true} />
      <Algorithm currentSection={currentSection} isContactOpen={isContactModalOpen} onNavigate={navigateTo} />

      {(currentSection === 'home' || currentSection === 'view_link' || currentSection === 'dashboard' || currentSection === 'secret') && (
        <div className="blob-container" style={{ zIndex: 0 }}>
          <div className="blob blob-1"></div>
          <div className="blob blob-2"></div>
          <div className="blob blob-3"></div>
          <div className="blob blob-4"></div>
          <div className="blob blob-5"></div>
          <div className="blob blob-6"></div>
        </div>
      )}

      <AnimatePresence initial={false} custom={direction} mode="popLayout">
        <motion.div
          key={currentSection}
          id={`section-${currentSection}`}
          custom={direction}
          variants={variants}
          initial="enter"
          animate="center"
          exit="exit"
          transition={{
            x: { type: "spring", stiffness: 300, damping: 30 },
            y: { type: "spring", stiffness: 300, damping: 30 },
            opacity: { duration: 0.2 },
            scale: { duration: 0.3 }
          }}
          // No explicit z-index: the page content must sit BELOW the chrome
          // (navbar z-50, secret button z-40, PageTransition curtain z-50) and
          // below the body-portaled tooltips (z-60) + modals (z-1400+).
          // framer-motion's transform already creates a stacking context here,
          // so the section's internal z-indexes (e.g. Hero's z-[5000]) stay
          // trapped within this layer and don't leak above the chrome.
          className="absolute inset-0 w-full h-full overflow-y-auto custom-scrollbar"
        >
          <ErrorBoundary fallback={sectionErrorFallback}>
            {renderSection()}
          </ErrorBoundary>
        </motion.div>
      </AnimatePresence>
      {currentSection !== 'secret' && (
        <button
          onClick={() => navigateTo('secret')}
          style={{
            position: 'fixed',
            right: 0,
            top: '50%',
            transform: 'translateY(-50%)',
            backgroundColor: 'rgba(255, 255, 255, 0.1)',
            backdropFilter: 'blur(8px)',
            WebkitBackdropFilter: 'blur(8px)',
            border: '1px solid rgba(255, 255, 255, 0.2)',
            borderRight: 'none',
            borderTopLeftRadius: '12px',
            borderBottomLeftRadius: '12px',
            padding: '14px 8px',
            minWidth: 44,
            minHeight: 44,
            zIndex: 40,
            color: 'var(--text-muted)',
            transition: 'all 0.2s ease',
            boxShadow: '0 4px 12px rgba(0, 0, 0, 0.1)'
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.2)';
            e.currentTarget.style.paddingRight = '8px';
            e.currentTarget.style.color = 'var(--text-primary)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.1)';
            e.currentTarget.style.paddingRight = '4px';
            e.currentTarget.style.color = 'var(--text-muted)';
          }}
          aria-label="Go to Secret Page"
        >
          <ChevronRight size={20} />
        </button>
      )}
      <LayoutGroup>
        {(currentSection !== 'dashboard') && (
          <Navbar
            onNavigate={navigateTo}
            currentSection={currentSection}
            onOpenContact={openContactModal}
            isContactOpen={isContactModalOpen}
            onOpenCV={openCVModal}
            isCVOpen={isCVModalOpen}
          />
        )}
        <ErrorBoundary fallback={modalErrorFallback}>
          <Suspense fallback={null}>
            <AnimatePresence>
              {isContactModalOpen && (
                <MContact onClose={closeContactModal} />
              )}
            </AnimatePresence>
          </Suspense>
        </ErrorBoundary>
        <ErrorBoundary fallback={modalErrorFallback}>
          <Suspense fallback={null}>
            <AnimatePresence>
              {isCVModalOpen && (
                <MCV onClose={closeCVModal} onProjectClick={handleProjectClick} />
              )}
            </AnimatePresence>
          </Suspense>
        </ErrorBoundary>

        <ErrorBoundary fallback={modalErrorFallback}>
          <Suspense fallback={null}>
            <AnimatePresence>
              {showProjectModal && selectedProject && (
                <MProjectView
                  project={selectedProject}
                  onClose={() => setShowProjectModal(false)}
                  onContributorClick={handleContributorClick}
                />
              )}
            </AnimatePresence>
          </Suspense>
        </ErrorBoundary>

        <ErrorBoundary fallback={modalErrorFallback}>
          <Suspense fallback={null}>
            <AnimatePresence>
              {showContributorModal && selectedContributor && (
                <MContributorView
                  contributor={selectedContributor}
                  onClose={() => setShowContributorModal(false)}
                />
              )}
            </AnimatePresence>
          </Suspense>
        </ErrorBoundary>
      </LayoutGroup>
      <PageTransition
        isTransitioning={isTransitioning}
        onCurtainCovered={handleCurtainCovered}
        onTransitionComplete={handleTransitionComplete}
        nextSectionName={nextSection}
        direction={direction}
      />
    </main>
    </SettingsProvider>
  );
}

export default App;
