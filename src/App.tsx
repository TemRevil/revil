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

type Section = 'home' | 'stack' | 'projects' | 'secret' | 'dashboard';

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
  }, [isDataReady, isWindowReady]);

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
      default:
        return <Hero isReady={!appLoading} />;
    }
  };

  // Setup touch coordinates for swipe detection
  const touchStartX = useRef(0);
  const touchEndX = useRef(0);

  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartX.current = e.targetTouches[0].clientX;
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    touchEndX.current = e.targetTouches[0].clientX;
  };

  const handleTouchEnd = () => {
    // Prevent swipe navigation when modal is open
    if (isContactModalOpen || document.body.style.overflow === 'hidden') {
      touchStartX.current = 0;
      touchEndX.current = 0;
      return;
    }

    const SWIPE_THRESHOLD = 100;
    // Calculate distance
    const distance = touchEndX.current - touchStartX.current;

    // Swipe Right (distance positive)
    if (distance > SWIPE_THRESHOLD) {
      // If we are on home or anywhere, navigate to secret?
      // Or maybe strictly if not already on secret.
      if (currentSection !== 'secret') {
        navigateTo('secret');
      }
    }

    // Reset
    touchStartX.current = 0;
    touchEndX.current = 0;
  };

  const lastNavigationTime = useRef(0);
  const scrollAccumulator = useRef(0);
  const lastScrollEventTime = useRef(0);

  useEffect(() => {
    const handleWheel = (e: WheelEvent) => {
      // When any modal is open (indicated by hidden overflow), completely disable navigation scrolling
      if (isContactModalOpen || document.body.style.overflow === 'hidden') {
        // Don't prevent the event - let it bubble to modal content
        // Just skip all navigation logic
        return;
      }

      if (isTransitioning) return;

      const now = Date.now();

      // Reset accumulator if there's a pause in scrolling (stale intent)
      if (now - lastScrollEventTime.current > 200) {
        scrollAccumulator.current = 0;
      }
      lastScrollEventTime.current = now;

      // Navigation Cooldown
      if (now - lastNavigationTime.current < 1500) return;

      const isScrollDown = e.deltaY > 0;
      const isScrollUp = e.deltaY < 0;

      // Check boundaries - 1px tolerance
      const scrolledToBottom = Math.ceil(window.innerHeight + window.scrollY) >= document.documentElement.scrollHeight - 1;
      const scrolledToTop = window.scrollY <= 0;

      // THRESHOLD: How much "effort" (pixels of intended scroll) to break through to next section
      const THRESHOLD = 100;

      if (isScrollDown && scrolledToBottom) {
        // Accumulate "downward pressure"
        scrollAccumulator.current += e.deltaY;

        if (scrollAccumulator.current > THRESHOLD) {
          if (currentSection === 'home') navigateTo('stack');
          else if (currentSection === 'stack') navigateTo('projects');

          // Reset after navigation triggered
          scrollAccumulator.current = 0;
          lastNavigationTime.current = now;
        }
      } else if (isScrollUp && scrolledToTop) {
        // Accumulate "upward pressure" (deltaY is negative)
        scrollAccumulator.current += e.deltaY;

        if (scrollAccumulator.current < -THRESHOLD) {
          if (currentSection === 'projects') navigateTo('stack');
          else if (currentSection === 'stack') navigateTo('home');

          // Reset after navigation triggered
          scrollAccumulator.current = 0;
          lastNavigationTime.current = now;
        }
      } else {
        // Not pushing against a boundary, reset intent
        scrollAccumulator.current = 0;
      }
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      // Prevent keyboard navigation when any modal is open (indicated by hidden overflow)
      if (isContactModalOpen || document.body.style.overflow === 'hidden') {
        // Allow Escape key to close modal
        if (e.key === 'Escape') {
          closeContactModal();
        }

        // IMPORTANT: Don't prevent default if we're typing in an input/textarea
        const activeTag = document.activeElement?.tagName;
        if (activeTag === 'INPUT' || activeTag === 'TEXTAREA') return;

        // Prevent other navigation keys that would trigger page transitions
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

  return (
    <main
      className="relative"
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
    >
      <Loader isOpen={appLoading} isFullScreen={true} />
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
        {currentSection !== 'dashboard' && (
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
