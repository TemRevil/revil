import { useState, useCallback, useEffect, useRef } from 'react';
import { LayoutGroup, AnimatePresence } from 'framer-motion';
import Hero from './components/Hero';
import Navbar from './components/Navbar';
import Stack from './components/Stack';
import PageTransition from './components/PageTransition';
import Projects from './components/Projects';
import MContact from './components/M-Contact';
import SecretPage from './components/SecretPage';
import Dashboard from './components/Dashboard';
import { ChevronRight } from 'lucide-react';
import Loader from './components/reactbits/Loader';
import { Algorithm } from './components/Algorithm';

// Redirection/Link checking logic moved to Algorithm component to avoid Bloat in App.tsx


// Redirection and analytics logic moved to Algorithm.tsx


type Section = 'home' | 'stack' | 'projects' | 'secret' | 'dashboard' | 'view_link';

function App() {
  const [currentSection, setCurrentSection] = useState<Section>('home');
  const [isTransitioning, setIsTransitioning] = useState(false);
  const [nextSection, setNextSection] = useState<Section>('home');
  const [isContactModalOpen, setIsContactModalOpen] = useState(false);
  const [appLoading, setAppLoading] = useState(true);
  const [isDataReady, setIsDataReady] = useState(false);
  const [isWindowReady, setIsWindowReady] = useState(false);

  useEffect(() => {
    // Phase 1: Window/Assets Load
    const handleLoad = () => setIsWindowReady(true);

    if (document.readyState === 'complete') {
      setIsWindowReady(true);
    } else {
      window.addEventListener('load', handleLoad);
      return () => window.removeEventListener('load', handleLoad);
    }
  }, []);

  useEffect(() => {
    // Phase 2: Orchestration - Hide loader when both are ready
    if (isDataReady && isWindowReady) {
      setAppLoading(false);
    } else {
      setAppLoading(true);
    }

    // Safety timeout: don't stay infinite if something hangs (e.g. broken script/data)
    const safety = setTimeout(() => {
      setAppLoading(false);
    }, 8000);

    return () => clearTimeout(safety);
    return () => clearTimeout(safety);
  }, [isDataReady, isWindowReady]);

  useEffect(() => {
    // Check if there is a path other than the base path
    const path = window.location.pathname;
    const base = import.meta.env.BASE_URL;

    // Normalize paths by removing trailing slashes for comparison
    const normPath = path.replace(/\/$/, '');
    const normBase = base.replace(/\/$/, '');

    if (normPath !== normBase && normPath !== '') {
      // Assume it's a link code
      setCurrentSection('view_link');
    }
  }, []);

  const navigateTo = useCallback((section: Section) => {
    if (section !== currentSection && !isTransitioning) {
      setNextSection(section);
      setIsTransitioning(true);
    }
  }, [currentSection, isTransitioning]);

  // Called when curtain fully covers the screen - change section now
  const handleCurtainCovered = useCallback(() => {
    setCurrentSection(nextSection);
    window.scrollTo(0, 0);
  }, [nextSection]);

  // Called when transition animation is completely done
  const handleTransitionComplete = useCallback(() => {
    setIsTransitioning(false);
  }, []);

  const openContactModal = useCallback(() => {
    setIsContactModalOpen(true);
  }, []);

  const closeContactModal = useCallback(() => {
    setIsContactModalOpen(false);
  }, []);

  const renderSection = () => {
    switch (currentSection) {
      case 'home':
        return <Hero onLoaded={() => setIsDataReady(true)} isReady={!appLoading} />;
      case 'stack':
        return <Stack />;
      case 'projects':
        return <Projects />;
      case 'secret':
        return <SecretPage onNavigate={navigateTo} />;
      case 'dashboard':
        return <Dashboard onNavigate={navigateTo} />;

      case 'view_link':
        // Show Hero while Algorithm processes the link in background
        return <Hero onLoaded={() => setIsDataReady(true)} isReady={!appLoading} />;
      default:
        return <Hero isReady={!appLoading} />;
    }
  };

  // Setup touch coordinates for swipe detection
  const touchStartX = useRef(0);
  const touchEndX = useRef(0);
  const touchStartY = useRef(0);
  const touchEndY = useRef(0);

  const handleTouchStart = (e: React.TouchEvent) => {
    if (currentSection === 'dashboard') return;
    touchStartX.current = e.targetTouches[0].clientX;
    touchStartY.current = e.targetTouches[0].clientY;
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (currentSection === 'dashboard') return;
    touchEndX.current = e.targetTouches[0].clientX;
    touchEndY.current = e.targetTouches[0].clientY;

    // Optional: add visual feedback logic here if wanted later
  };

  const handleTouchEnd = () => {
    // Prevent swipe navigation when modal is open or in dashboard
    if (isContactModalOpen || currentSection === 'dashboard' || document.body.style.overflow === 'hidden') {
      touchStartX.current = 0;
      touchEndX.current = 0;
      touchStartY.current = 0;
      touchEndY.current = 0;
      return;
    }

    const SWIPE_THRESHOLD = 70;
    const deltaX = touchStartX.current - touchEndX.current;
    const deltaY = touchStartY.current - touchEndY.current;

    // Detect intent by comparing magnitude of X vs Y
    if (Math.abs(deltaX) > Math.abs(deltaY)) {
      // Horizontal Swipe
      // Right to Left (deltaX positive) -> Secret
      if (deltaX > SWIPE_THRESHOLD && currentSection !== 'secret') {
        navigateTo('secret');
      }
    } else {
      // Vertical Swipe
      const scrolledToBottom = Math.ceil(window.innerHeight + window.scrollY) >= document.documentElement.scrollHeight - 5;
      const scrolledToTop = window.scrollY <= 5;

      // Down to Up (deltaY positive) -> Next Page (if at bottom)
      if (deltaY > SWIPE_THRESHOLD && scrolledToBottom) {
        if (currentSection === 'home' || currentSection === 'view_link') navigateTo('stack');
        else if (currentSection === 'stack') navigateTo('projects');
      }
      // Up to Down (deltaY negative) -> Previous Page (if at top)
      else if (deltaY < -SWIPE_THRESHOLD && scrolledToTop) {
        if (currentSection === 'projects') navigateTo('stack');
        else if (currentSection === 'stack') navigateTo('home');
      }
    }

    // Reset
    touchStartX.current = 0;
    touchEndX.current = 0;
    touchStartY.current = 0;
    touchEndY.current = 0;
  };

  const lastNavigationTime = useRef(0);
  const scrollAccumulator = useRef(0);
  const lastScrollEventTime = useRef(0);

  useEffect(() => {
    const handleWheel = (e: WheelEvent) => {
      if (isContactModalOpen || currentSection === 'dashboard' || document.body.style.overflow === 'hidden') return;
      if (isTransitioning) return;

      const now = Date.now();
      if (now - lastScrollEventTime.current > 200) scrollAccumulator.current = 0;
      lastScrollEventTime.current = now;

      if (now - lastNavigationTime.current < 1500) return;

      const isScrollDown = e.deltaY > 0;
      const isScrollUp = e.deltaY < 0;
      const scrolledToBottom = Math.ceil(window.innerHeight + window.scrollY) >= document.documentElement.scrollHeight - 5;
      const scrolledToTop = window.scrollY <= 5;
      const THRESHOLD = 100;

      if (isScrollDown && scrolledToBottom) {
        scrollAccumulator.current += e.deltaY;
        if (scrollAccumulator.current > THRESHOLD) {
          if (currentSection === 'home' || currentSection === 'view_link') navigateTo('stack');
          else if (currentSection === 'stack') navigateTo('projects');
          scrollAccumulator.current = 0;
          lastNavigationTime.current = now;
        }
      } else if (isScrollUp && scrolledToTop) {
        scrollAccumulator.current += e.deltaY;
        if (scrollAccumulator.current < -THRESHOLD) {
          if (currentSection === 'projects') navigateTo('stack');
          else if (currentSection === 'stack') navigateTo('home');
          scrollAccumulator.current = 0;
          lastNavigationTime.current = now;
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

  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const preventPullToRefresh = (e: TouchEvent) => {
      const isPullingDown = e.touches[0].clientY > touchStartY.current;
      const scrolledToTop = window.scrollY <= 5;
      if (scrolledToTop && isPullingDown && !isContactModalOpen && currentSection !== 'dashboard') {
        if (e.cancelable) e.preventDefault();
      }
    };

    container.addEventListener('touchmove', preventPullToRefresh, { passive: false });
    return () => container.removeEventListener('touchmove', preventPullToRefresh);
  }, [currentSection, isContactModalOpen]);

  return (
    <main
      ref={containerRef}
      className="relative"
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
    >
      <Loader isOpen={appLoading} isFullScreen={true} />
      <Algorithm currentSection={currentSection} isContactOpen={isContactModalOpen} onNavigate={navigateTo} />
      {renderSection()}
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
            padding: '12px 4px',
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
          <Navbar onNavigate={navigateTo} currentSection={currentSection} onOpenContact={openContactModal} isContactOpen={isContactModalOpen} />
        )}
        <AnimatePresence>
          {isContactModalOpen && (
            <MContact onClose={closeContactModal} />
          )}
        </AnimatePresence>
      </LayoutGroup>
      <PageTransition
        isTransitioning={isTransitioning}
        onCurtainCovered={handleCurtainCovered}
        onTransitionComplete={handleTransitionComplete}
        nextSectionName={nextSection}
      />
    </main>
  );
}

export default App;
