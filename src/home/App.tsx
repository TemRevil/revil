import { useState, useCallback, useEffect, useRef, useSyncExternalStore, lazy, Suspense, startTransition, type ReactNode } from 'react';
import { AnimatePresence, LayoutGroup, MotionConfig, motion, useAnimationControls, useReducedMotion } from 'motion/react';
import Hero from './Hero';
import { preloadable } from '../lib/preloadable';
import { onIdle, onQuiet, whenFramesFlow } from '../lib/idle';
import { isLite, TOUCH_QUERY } from '../lib/device';
import { useHydrated } from '../hooks/useHydrated';
import useMediaQuery from '../hooks/useMediaQuery';
import Navbar from './Navbar';
import PageTransition from './PageTransition';
import { ChevronRight } from 'lucide-react';
import Loader from '../ui/reactbits/Loader';
import { Algorithm } from './Algorithm';
import TailorNote from './TailorNote';
import type { ProjectsHubHandle } from './projects/ProjectsHub';
import type { Contributor as ContributorViewData } from './projects/ContributorView';
import { ProjectData as Project, ContributorData as Contributor } from '../types';
import { SettingsProvider } from './SettingsContext';
import ErrorBoundary from '../ui/ErrorBoundary';
import { prefetchPublicData } from '../lib/liveDoc';

// Code-split everything that isn't part of the first paint (home = Hero + Navbar).
// Each chunk loads on demand: section views load on navigation (hidden behind the
// page-transition curtain), modals load when first opened, and SecretPage/Dashboard
// load after explicit navigation. This keeps the eager bundle small for fast TBT.
// SecretPage pulls firebase/auth + firebase/functions; Dashboard pulls recharts +
// react-easy-crop + anime.js - none of which belong in the first-paint bundle.
const Stack = lazy(() => import('./Stack'));
const ProjectsHub = lazy(() => import('./projects/ProjectsHub'));
const MContact = preloadable(() => import('./contact/Contact'));
const MCV = preloadable(() => import('./CV'));
const noop = () => { };
const MProjectView = lazy(() => import('./projects/ProjectView'));
const MContributorView = lazy(() => import('./projects/ContributorView'));
const SecretPage = lazy(() => import('./SecretPage'));
const Dashboard = lazy(() => import('../dashboard/Dashboard'));

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
// Without a boundary that throw unmounts the entire SPA - so each modal Suspense
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
      <p style={{ margin: 0, fontWeight: 600 }}>Couldn&apos;t open this - the app was just updated.</p>
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

// Sections that live together in the phone single-scroll page (view_link is a home variant).
const PUBLIC_SCROLL_SECTIONS: Section[] = ['home', 'stack', 'projects', 'view_link'];

// 'view_link' is where a share link lands, and it draws the identical hero as 'home' -
// one view under two labels. The switcher keys off this instead of the raw section, so
// moving between them doesn't tear the hero down and build it again.
const viewKey = (s: Section): Section => (s === 'view_link' ? 'home' : s);
const sameView = (a: Section, b: Section): boolean => viewKey(a) === viewKey(b);

// Each public section has its own address: the page's path (the root, or a share link's)
// with #stack or #projects, or no hash for home. Moving between sections adds a history
// entry, so Back returns to the section before and a section can be linked to.
const SECTION_HASH: Partial<Record<Section, string>> = { stack: '#stack', projects: '#projects' };
const isPublic = (s: Section) => PUBLIC_SCROLL_SECTIONS.includes(s);
/** The public section an address points at (its hash, else home or the share link). */
function sectionAt(loc: Location): Section {
  const hash = loc.hash.toLowerCase();
  if (hash === '#stack') return 'stack';
  if (hash === '#projects') return 'projects';
  return loc.pathname.replace(/\/$/, '') !== '' ? 'view_link' : 'home';
}
let started: Section | undefined;
/**
 * Where this visit starts, read once: the dashboard the admin left (remembered on this
 * device; it has no address), else the section in the address, else home - or the share
 * link, which draws the same hero.
 */
function startSection(): Section {
  if (started) return started;
  started = sectionAt(window.location);
  try {
    if (localStorage.getItem('revil_section') === 'dashboard') started = 'dashboard';
  } catch { /* storage blocked: follow the address */ }
  return started;
}
// Read as the app's code loads, before anything can change the storage or the address.
if (typeof window !== 'undefined') startSection();
const noSubscribe = () => () => { };
/** The address of a public section, on this page's path. */
const addressOf = (s: Section) => window.location.pathname + window.location.search + (SECTION_HASH[viewKey(s)] ?? '');
/** Adds (or, for a correction, replaces) the history entry for a public section. */
function showAddress(s: Section, replace = false) {
  const next = addressOf(s);
  if (next === window.location.pathname + window.location.search + window.location.hash) return;
  if (replace) window.history.replaceState(window.history.state, '', next);
  else window.history.pushState(window.history.state, '', next);
}

// How the desktop switcher slides a section in and out: direction ±1 is down/up, ±2 sideways
// (the secret page). Fixes #4: prevents unintended yellow page UI rotation on transitions.
const SECTION_VARIANTS = {
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
  },
};
const SECTION_TRANSITION = {
  x: { type: 'spring', stiffness: 300, damping: 30 },
  y: { type: 'spring', stiffness: 300, damping: 30 },
  opacity: { duration: 0.2 },
  scale: { duration: 0.3 },
} as const;
// Reduced motion: the sections don't travel, they cross-fade.
const SECTION_FADE = {
  enter: () => ({ x: 0, y: 0, opacity: 0, scale: 1 }),
  center: { x: 0, y: 0, opacity: 1, scale: 1 },
  exit: () => ({ x: 0, y: 0, opacity: 0, scale: 1 }),
};
const FADE_TRANSITION = { duration: 0.2, ease: 'easeInOut' } as const;
const useSectionMotion = () => {
  const reduced = useReducedMotion();
  return reduced ? { variants: SECTION_FADE, transition: FADE_TRANSITION } : { variants: SECTION_VARIANTS, transition: SECTION_TRANSITION };
};
// The three that actually stack in the scroll page, in order.
const MOBILE_STACK: Exclude<Section, 'secret' | 'dashboard' | 'view_link'>[] = ['home', 'stack', 'projects'];

// Desktop keeps these three built once they have been (the hero, Stack and Projects), and
// builds Stack and Projects ahead of time, so moving between them never waits on a build,
// a Firestore read or an image. Secret and Dashboard come and go with the switcher.
type KeptSection = (typeof MOBILE_STACK)[number];
const isKept = (s: Section): s is KeptSection => (MOBILE_STACK as Section[]).includes(s);

/**
 * A section slid in and out by hand with the switcher's motion, never torn down: building
 * the hero again replayed the whole brush entrance and rebuilt the boil (~0.3s frozen,
 * then 1-2s at 10-20fps), and building Stack or Projects again read Firestore and loaded
 * every image again. Away, it is parked off screen, inert, and not painted.
 */
function KeptView({ id, shown, direction, instant, jump, children }: {
  id: string;
  shown: boolean;
  direction: number;
  /** Shown at the page's first draw: no slide in. */
  instant: boolean;
  /** The page is opening on another section than the prerendered one: no slide, it is just there. */
  jump: boolean;
  children: ReactNode;
}) {
  const { variants, transition } = useSectionMotion();
  const controls = useAnimationControls();
  const box = useRef<HTMLDivElement>(null);
  const [parked, setParked] = useState(!shown);
  if (shown && parked) setParked(false);
  if (!shown && jump && !parked) setParked(true);
  const first = useRef(true);
  useEffect(() => {
    const isFirst = first.current;
    first.current = false;
    // The slide starts once frames flow again: the switch is a long task, and a slide
    // started with it ran out its clock while no frame was drawn, so the page jumped.
    if (shown) {
      if (isFirst && instant) return;
      if (jump) { controls.set(variants.center); return; }
      if (!isFirst) controls.set(variants.enter(direction));
      return whenFramesFlow(() => void controls.start(variants.center));
    }
    if (isFirst) return;
    if (jump) {
      controls.set(variants.exit(direction));
      if (box.current) box.current.scrollTop = 0;
      return;
    }
    let live = true;
    // Parked back at the top, as a rebuilt section was: the wheel/swipe paging reads the
    // scroll position, and a section left at its bottom would page straight past.
    const stopWaiting = whenFramesFlow(() => void controls.start(variants.exit(direction)).then(() => {
      if (!live) return;
      setParked(true);
      if (box.current) box.current.scrollTop = 0;
    }));
    return () => { live = false; stopWaiting(); };
    // direction is read as it stands when `shown` changes, like the switcher's custom prop.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shown]);
  return (
    <motion.div
      ref={box}
      id={id}
      initial={shown ? (instant ? false : variants.enter(direction)) : variants.exit(1)}
      animate={controls}
      transition={transition}
      aria-hidden={!shown || undefined}
      inert={!shown}
      style={parked ? { visibility: 'hidden' } : undefined}
      className="absolute inset-0 w-full h-full overflow-y-auto custom-scrollbar isolate"
    >
      <ErrorBoundary fallback={sectionErrorFallback}>
        {children}
      </ErrorBoundary>
    </motion.div>
  );
}

function App() {
  // The homepage is prerendered on home, so the render that hydrates it is home too; right
  // after, the page moves to where this visit really starts (startSection). `chosen` is
  // every move after that.
  const booted = useHydrated();
  const start = useSyncExternalStore(noSubscribe, startSection, () => 'home' as Section);
  const [chosen, setChosen] = useState<Section | null>(null);
  const currentSection = chosen ?? start;
  /** Until the first move the section only changes by starting elsewhere: no slide, it is just there. */
  const jump = chosen === null;
  const [previousSection, setPreviousSection] = useState<Section>('home');
  const [isTransitioning, setIsTransitioning] = useState(false);
  const [nextSection, setNextSection] = useState<Section>('home');

  // Touch layout: instead of swapping full-screen sections with a curtain/slide, the
  // public sections (home, stack, projects) live in ONE smooth-scrolling page. That is
  // phones and every touch screen, tablets included: the switcher pages on a wheel and on
  // a long swipe from a section's end, and on an iPad the hero has no end to reach, so a
  // swipe only rubber-banded and the page looked like all there was. A mouse or trackpad
  // keeps the section switcher. `mobileActiveSection` tracks which one is in view so the
  // navbar highlight follows the scroll (a scroll-spy sets it below).
  const scrollLayout = useMediaQuery(TOUCH_QUERY);
  const [mobileActiveSection, setMobileActiveSection] = useState<Section>('home');
  const mobileScrollRef = useRef<HTMLDivElement>(null);
  // True when we should show the single-scroll page instead of the switcher.
  const mobileScroll = scrollLayout && PUBLIC_SCROLL_SECTIONS.includes(currentSection);

  // One scroll pass drives BOTH concerns for the phone page (3 rects per scroll, passive):
  //   1. Lazy-mount - only Hero renders up front; Stack and Projects mount once they come
  //      within MOUNT_AHEAD px of the viewport, then stay mounted. Each <section> keeps a
  //      min-h-screen placeholder, so scroll height is identical mounted or not.
  //   2. Scroll-spy - whichever section straddles the viewport's vertical center is the
  //      "active" one, so the navbar highlight follows the scroll.
  // Deliberately geometry-based rather than IntersectionObserver: one mechanism instead of
  // two, and it stays correct when the page isn't compositing (IO callbacks don't fire then).
  const [mountedSections, setMountedSections] = useState<Set<Section>>(() => new Set<Section>(['home']));
  // Set once the hero's entrance has played (or 10s in, whichever is first). The work that
  // isn't on screen yet - pre-mounting Stack/Projects, warming their chunks - waits for it:
  // those modules import Firebase, and its reCAPTCHA stutters the entrance on a phone.
  const [heroSettled, setHeroSettled] = useState(false);
  useEffect(() => {
    const id = setTimeout(() => setHeroSettled(true), 10000);
    return () => clearTimeout(id);
  }, []);
  useEffect(() => {
    if (!mobileScroll) return;
    const root = mobileScrollRef.current;
    if (!root) return;
    const MOUNT_AHEAD = 600;
    // `scrolled` is false for the first pass: Stack sits one screen down, inside MOUNT_AHEAD,
    // so it would mount (and pull in Firebase) during the hero's entrance.
    // Until the reader scrolls, heroSettled mounts the rest instead.
    const compute = (scrolled: boolean) => {
      const vh = window.innerHeight;
      const mid = vh / 2;
      let active: Section = 'home';
      const reached: Section[] = [];
      for (const id of MOBILE_STACK) {
        const el = document.getElementById(`mobsec-${id}`);
        if (!el) continue;
        const r = el.getBoundingClientRect();
        if (r.top <= mid && r.bottom >= mid) active = id;
        if (scrolled && r.top <= vh + MOUNT_AHEAD && r.bottom >= -MOUNT_AHEAD) reached.push(id);
      }
      setMobileActiveSection(prev => (prev === active ? prev : active));
      setMountedSections(prev => {
        const missing = reached.filter(id => !prev.has(id));
        if (!missing.length) return prev;
        const next = new Set(prev);
        missing.forEach(id => next.add(id));
        return next;
      });
    };
    const onScroll = () => compute(true);
    const onResize = () => compute(false);
    compute(false);
    root.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onResize);
    return () => {
      root.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onResize);
    };
  }, [mobileScroll]);
  // Safety net: once the hero has settled, everything is mounted regardless of scrolling.
  // Lazy-mounting exists to keep the FIRST render cheap, not to gate content forever - so
  // a section can never end up permanently blank if a scroll event is missed. One section
  // per idle period: mounting them all in one render was a ~300ms long task on a phone.
  useEffect(() => {
    if (!heroSettled) return;
    const id = MOBILE_STACK.find(s => !mountedSections.has(s));
    if (!id) return;
    return onIdle(() => setMountedSections(prev => (prev.has(id) ? prev : new Set(prev).add(id))), 1000);
  }, [heroSettled, mountedSections]);
  const isMounted = (id: Section) => mountedSections.has(id);

  // A phone opening on #stack or #projects starts scrolled there; from then on the address
  // follows the section in view (replaced, not added: scrolling is not a history step).
  const startScrolled = useRef(false);
  const startPending = useRef<Section | null>(null);
  useEffect(() => {
    if (!booted || !mobileScroll || startScrolled.current) return;
    startScrolled.current = true;
    const start = viewKey(sectionAt(window.location));
    if (start === 'home') return;
    startPending.current = start;
    document.getElementById(`mobsec-${start}`)?.scrollIntoView({ block: 'start' });
  }, [booted, mobileScroll]);
  useEffect(() => {
    if (!mobileScroll || !startScrolled.current) return;
    if (startPending.current) {
      if (viewKey(mobileActiveSection) !== startPending.current) return;
      startPending.current = null;
    }
    showAddress(mobileActiveSection, true);
  }, [mobileActiveSection, mobileScroll]);

  // Leaving the touch layout (widening past the phone breakpoint) hands the reader back to the section switcher,
  // which only knows `currentSection` - and the phone page leaves that on whatever it
  // started as while the reader scrolls. So resizing mid-page threw them back to the top
  // of home from wherever they had got to. Carry the scroll-spy's answer over as they
  // cross, and only as they cross: `mobileScroll` also drops on its own when the reader
  // opens the dashboard, which must not drag them back to a public section.
  // Adjusted during render rather than in an effect, so the switcher never paints home
  // for a frame before correcting itself.
  const [wasScrollLayout, setWasScrollLayout] = useState(false);
  if (wasScrollLayout !== scrollLayout) {
    setWasScrollLayout(scrollLayout);
    if (wasScrollLayout
      && PUBLIC_SCROLL_SECTIONS.includes(currentSection)
      && !sameView(currentSection, mobileActiveSection)) {
      setChosen(mobileActiveSection);
      setNextSection(mobileActiveSection);
    }
  }

  // Always-current section, read inside delayed callbacks (e.g. hero anim complete)
  // to avoid stale-closure races where the user navigated away before the timer fired.
  const currentSectionRef = useRef<Section>(currentSection);
  useEffect(() => {
    currentSectionRef.current = currentSection;
    // Not while hydrating: that render is the prerendered home, not where the visit is.
    if (!booted) return;
    // Remember the dashboard across refreshes; clear it for any public section so
    // leaving the dashboard doesn't strand the user there on next load.
    try {
      if (currentSection === 'dashboard') localStorage.setItem('revil_section', 'dashboard');
      else localStorage.removeItem('revil_section');
    } catch { /* ignore */ }
  }, [currentSection, booted]);
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

    // First visit (no stored version): there is nothing to purge - record the version
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

  // Modals still to draw once hidden, and the one being drawn (see below).
  const [warmLeft, setWarmLeft] = useState<Array<'contact' | 'cv'>>([]);
  const [warming, setWarming] = useState<'contact' | 'cv' | null>(null);
  // Warm the on-demand public chunks once the first paint is done, so the first
  // navigation/modal-open doesn't pay a network roundtrip behind a blank Suspense
  // fallback. Runs in idle time → keeps the eager bundle as small as today.
  // SecretPage/Dashboard are intentionally left cold (admin-only).
  useEffect(() => {
    if (appLoading || !heroSettled) return;
    let cancelled = false;
    const warm = () => {
      if (cancelled) return;
      // Every section and modal then opens on this visit's copy, not just the cached one.
      prefetchPublicData();
      import('./Stack');
      import('./projects/ProjectsHub');
      Promise.all([MContact.preload(), MCV.preload()]).then(() => { if (!cancelled && !isLite()) setWarmLeft(['contact', 'cv']); });
    };
    const hasRIC = typeof window.requestIdleCallback === 'function';
    const handle = hasRIC ? window.requestIdleCallback(warm) : window.setTimeout(warm, 2000);
    return () => {
      cancelled = true;
      if (hasRIC) window.cancelIdleCallback(handle); else clearTimeout(handle);
    };
  }, [appLoading, heroSettled]);

  // Then each modal is drawn once, hidden and with its effects off (`warm`), and dropped:
  // the first real open finds the browser's layout, text and code caches hot, as a second
  // open does (on a phone slowed 4x, ~0.7s cold against ~0.2s). Each costs ~0.3s of main thread
  // in one piece there, so one at a time, only once the reader has been still a moment, kept
  // two frames so its layout has run, and never one the reader has already opened. Not on a
  // lite page (lib/device.ts): there the hidden draw cost a phone more than it saved.
  const openedModals = useRef({ contact: false, cv: false });
  useEffect(() => { if (isContactModalOpen) openedModals.current.contact = true; }, [isContactModalOpen]);
  useEffect(() => { if (isCVModalOpen) openedModals.current.cv = true; }, [isCVModalOpen]);
  useEffect(() => {
    if (warming) {
      let raf = requestAnimationFrame(() => { raf = requestAnimationFrame(() => setWarming(null)); });
      return () => cancelAnimationFrame(raf);
    }
    if (!warmLeft.length) return;
    return onQuiet(() => {
      const [next, ...rest] = warmLeft;
      setWarmLeft(rest);
      if (!openedModals.current[next]) startTransition(() => setWarming(next));
    });
  }, [warming, warmLeft]);


  const handleHeroAnimationComplete = useCallback(() => {
    setHeroSettled(true);
    const isInterviewerMode = typeof sessionStorage !== 'undefined' ? sessionStorage.getItem('revil_interviewer_mode') === 'true' : false;
    // Read the section from a ref at fire-time - the user may have navigated away
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

  /** Where the running page switch goes, set once its curtain is moving. */
  const pendingSection = useRef<Section | null>(null);
  const navigateTo = useCallback((section: Section) => {
    if (section !== currentSection && !isTransitioning) {
      // A public section gets its own address (a Back or Forward has already moved it).
      if (isPublic(section) && !sameView(section, currentSection)) showAddress(section);
      // The recorder switches 'view_link' -> 'home' once the server resolves the share
      // code. Same hero on screen either way, so that is a relabel, not a journey:
      // running the curtain for it replayed the whole entrance unprompted, as though
      // the visitor had scrolled. Swap the label and stop.
      if (sameView(section, currentSection)) {
        setNextSection(section);
        setChosen(section);
        return;
      }

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
      pendingSection.current = section;
      setIsTransitioning(true);
    }
  }, [currentSection, isTransitioning]);

  // Navbar taps: on the touch scroll page, a public-section tap smooth-scrolls to it
  // (no swap/curtain); everything else (secret, dashboard, or desktop) uses the switcher.
  const handleNavbarNav = useCallback((section: Section) => {
    if (scrollLayout && PUBLIC_SCROLL_SECTIONS.includes(section) && PUBLIC_SCROLL_SECTIONS.includes(currentSectionRef.current)) {
      const target = section === 'view_link' ? 'home' : section;
      showAddress(target);
      document.getElementById(`mobsec-${target}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      setMobileActiveSection(target as Section);
    } else {
      navigateTo(section);
    }
  }, [scrollLayout, navigateTo]);

  // The section changes once the curtain is moving, so the page slides away under it. The
  // curtain runs on the compositor, so the switch's long task doesn't stall it.
  const handleCurtainMoving = useCallback(() => {
    const section = pendingSection.current;
    pendingSection.current = null;
    if (section) setChosen(section);
  }, []);

  const handleTransitionComplete = useCallback(() => {
    setIsTransitioning(false);
  }, []);

  // Back and Forward: the address changed to another section's, so move there. A switch
  // already running finishes first, then the page catches up with the address.
  const followAddress = useRef(() => { });
  const addressWaiting = useRef(false);
  useEffect(() => {
    followAddress.current = () => {
      if (isTransitioning) { addressWaiting.current = true; return; }
      const want = sectionAt(window.location);
      if (scrollLayout && isPublic(currentSection)) {
        document.getElementById(`mobsec-${viewKey(want)}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        return;
      }
      // Only between public sections: the secret page and the dashboard have no address.
      if (isPublic(currentSection) && !sameView(want, currentSection)) navigateTo(want);
    };
    if (!isTransitioning && addressWaiting.current) {
      addressWaiting.current = false;
      const run = followAddress.current;
      const id = requestAnimationFrame(() => run());
      return () => cancelAnimationFrame(id);
    }
  }, [isTransitioning, scrollLayout, currentSection, navigateTo]);
  useEffect(() => {
    const onPop = () => followAddress.current();
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  // A modal opened before its chunk is warm suspends, and outside a transition React holds
  // the reveal back ~300ms (its fallback throttle); a warm one opens at normal priority.
  const openContactModal = useCallback(() => MContact.open(() => setIsContactModalOpen(true)), []);
  const closeContactModal = useCallback(() => {
    setIsContactModalOpen(false);
    // Drop the deep-link hash on close so refreshing doesn't reopen it and the URL stays
    // clean. replaceState doesn't fire hashchange, so this won't loop back into open.
    if (typeof window !== 'undefined' && window.location.hash.toLowerCase() === '#booking') {
      window.history.replaceState(null, '', window.location.pathname + window.location.search);
    }
  }, []);

  // Deep link: temrevil.com/#booking opens the booking modal on arrival, and also if the
  // visitor lands on that hash while the page is already open (e.g. an in-page anchor).
  useEffect(() => {
    const openIfBookingHash = () => {
      if (window.location.hash.toLowerCase() === '#booking') openContactModal();
    };
    openIfBookingHash();
    window.addEventListener('hashchange', openIfBookingHash);
    return () => window.removeEventListener('hashchange', openIfBookingHash);
  }, [openContactModal]);

  const openCVModal = useCallback(() => MCV.open(() => setIsCVModalOpen(true)), []);
  const closeCVModal = useCallback(() => setIsCVModalOpen(false), []);

  const handleProjectClick = useCallback((project: Project) => startTransition(() => {
    setSelectedProject(project);
    setShowProjectModal(true);
  }), []);

  const handleContributorClick = useCallback((contributor: Contributor) => startTransition(() => {
    // A File only ever exists in the dashboard's unsaved drafts; a published one is a URL.
    setSelectedContributor({ ...contributor, image: typeof contributor.image === 'string' ? contributor.image : undefined });
    setShowContributorModal(true);
  }), []);

  // The hero's entrance waits for the page curtain as it waits for the loader: painting it
  // under the curtain's blur spent the frames the curtain needed, and hid half the entrance.
  const heroReady = !appLoading && !isTransitioning;
  // Desktop: the kept sections (see KeptView). One is built when first shown, and once the
  // hero has settled Stack and Projects are built off screen, one per idle period. (Not the
  // hero: built off screen, its entrance would play where nobody sees it.)
  const shownView = viewKey(currentSection);
  const viewAtLoad = viewKey(start);
  const [built, setBuilt] = useState<Set<KeptSection>>(() => new Set(isKept(shownView) ? [shownView] : []));
  if (isKept(shownView) && !built.has(shownView)) setBuilt(new Set(built).add(shownView));
  useEffect(() => {
    if (!heroSettled || mobileScroll) return;
    const id = (['stack', 'projects'] as const).find(s => !built.has(s));
    if (!id) return;
    return onIdle(() => setBuilt(prev => (prev.has(id) ? prev : new Set(prev).add(id))), 1000);
  }, [heroSettled, mobileScroll, built]);
  const keptView = (id: KeptSection, children: ReactNode) => built.has(id) && (
    <KeptView
      key={id}
      id={`section-${shownView === id ? currentSection : id}`}
      shown={shownView === id}
      direction={direction}
      instant={viewAtLoad === id}
      jump={jump}
    >
      {children}
    </KeptView>
  );
  const renderSection = () => {
    switch (currentSection) {
      case 'secret':
        return <Suspense fallback={null}><SecretPage onNavigate={navigateTo} /></Suspense>;
      case 'dashboard':
        return <Suspense fallback={null}><Dashboard onNavigate={navigateTo} /></Suspense>;
      default:
        return null; // the kept views (see KeptView)
    }
  };

  const hubRef = useRef<ProjectsHubHandle>(null);
  const sectionMotion = useSectionMotion();

  // --- Touch Logic (Mobile) ---
  const touchStartX = useRef(0);
  const touchEndX = useRef(0);
  const touchStartY = useRef(0);
  const touchEndY = useRef(0);

  const handleTouchStart = (e: React.TouchEvent) => {
    // On the phone scroll page the browser handles scrolling; no swipe-to-swap.
    if (mobileScroll || currentSection === 'dashboard') return;
    touchStartX.current = e.targetTouches[0].clientX;
    touchStartY.current = e.targetTouches[0].clientY;
    touchEndX.current = e.targetTouches[0].clientX;
    touchEndY.current = e.targetTouches[0].clientY;
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (mobileScroll || currentSection === 'dashboard') return;
    touchEndX.current = e.targetTouches[0].clientX;
    touchEndY.current = e.targetTouches[0].clientY;
  };

  const handleTouchEnd = () => {
    if (mobileScroll || isContactModalOpen || currentSection === 'dashboard' || document.body.style.overflow === 'hidden') {
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

    // Keys inside a modal are the modal's own (dialog.ts): focus is in it, so arrows,
    // Space and Page keys scroll it, and Escape closes it.

    // Passive: it only reads the wheel, never cancels it, so scrolling never waits on it.
    window.addEventListener('wheel', handleWheel, { passive: true });
    return () => window.removeEventListener('wheel', handleWheel);
  }, [currentSection, isTransitioning, navigateTo, isContactModalOpen]);

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

  return (
    // reducedMotion="user": with the system's reduced-motion setting, motion drops every
    // transform animation (opacity still plays), and the sections cross-fade (above).
    <MotionConfig reducedMotion="user">
    <SettingsProvider>
    <main
      ref={mainRef}
      className="relative w-full h-screen overflow-hidden"
      data-switching={isTransitioning || undefined}
      style={{ touchAction: 'pan-y' }}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
    >
      {/* The loader over the whole page. Drawn here rather than portaled to <body> by the
          Loader itself, so it is in the prerendered HTML from the first paint. */}
      <AnimatePresence>
        {appLoading && (
          <motion.div
            key="loader"
            initial={{ opacity: 1 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.4, ease: 'easeInOut' }}
            className="fixed inset-0 flex items-center justify-center z-[999999]"
            style={{ backgroundColor: 'rgba(0, 0, 0, 0.4)', backdropFilter: 'blur(60px)', WebkitBackdropFilter: 'blur(60px)' }}
          >
            <Loader isOpen isFullScreen={false} />
          </motion.div>
        )}
      </AnimatePresence>
      {/* The phone page never changes the current section - it scrolls - so the recorder
          has to be told what the scroll-spy sees, or every phone visit reads as though
          the reader never left home no matter how far down they got. */}
      {booted && <Algorithm currentSection={mobileScroll ? mobileActiveSection : currentSection} isContactOpen={isContactModalOpen} onNavigate={navigateTo} />}
      <TailorNote />

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

      {mobileScroll ? (
        // Phone: Home, Stack and Projects in ONE smooth-scrolling page - no curtain, no
        // slide, no swipe-swap. `isolate` traps each section's internal z-index (e.g. Hero's
        // z-[5000]) below the fixed navbar (z-50), same job the motion transform did above.
        <div
          ref={mobileScrollRef}
          id="mobile-scroll"
          className="absolute inset-0 w-full h-full overflow-y-auto overflow-x-hidden custom-scrollbar isolate"
        >
          <ErrorBoundary fallback={sectionErrorFallback}>
            <section id="mobsec-home" data-mobsec="home" className="relative min-h-screen isolate">
              <Hero onLoaded={() => setIsDataReady(true)} onAnimationComplete={handleHeroAnimationComplete} isReady={!appLoading} onOpenContact={openContactModal} />
            </section>
            <section id="mobsec-stack" data-mobsec="stack" className="relative min-h-screen isolate">
              {isMounted('stack') && <Suspense fallback={null}><Stack /></Suspense>}
            </section>
            <section id="mobsec-projects" data-mobsec="projects" className="relative min-h-screen isolate">
              {isMounted('projects') && (
                <Suspense fallback={null}><ProjectsHub ref={hubRef} isTransitioning={false} embedded /></Suspense>
              )}
            </section>
          </ErrorBoundary>
        </div>
      ) : (
      <>
      {keptView('home', (
        <Hero onLoaded={() => setIsDataReady(true)} onAnimationComplete={handleHeroAnimationComplete} isReady={heroReady} onOpenContact={openContactModal} />
      ))}
      {keptView('stack', <Suspense fallback={null}><Stack active={shownView === 'stack'} /></Suspense>)}
      {keptView('projects', (
        <Suspense fallback={null}><ProjectsHub ref={hubRef} isTransitioning={isTransitioning} active={shownView === 'projects'} /></Suspense>
      ))}
      <AnimatePresence initial={false} custom={direction} mode="popLayout">
        {!isKept(shownView) && <motion.div
          key={viewKey(currentSection)}
          id={`section-${currentSection}`}
          custom={direction}
          variants={sectionMotion.variants}
          initial={jump ? false : 'enter'}
          animate="center"
          exit="exit"
          transition={sectionMotion.transition}
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
        </motion.div>}
      </AnimatePresence>
      </>
      )}
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
            e.currentTarget.style.color = 'var(--text-primary)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.1)';
            e.currentTarget.style.color = 'var(--text-muted)';
          }}
          aria-label="Go to Secret Page"
        >
          <ChevronRight size={20} />
        </button>
      )}
      {/* One layout group, so a modal's header icon and its navbar button's icon are one shared
          element: on desktop the icon flies from the navbar into the modal (DockIcon). */}
      <LayoutGroup>
        {(currentSection !== 'dashboard') && (
          <Navbar
            onNavigate={handleNavbarNav}
            currentSection={mobileScroll ? mobileActiveSection : currentSection}
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
            {warming === 'contact' && !isContactModalOpen && <MContact warm onClose={noop} />}
          </Suspense>
        </ErrorBoundary>
        <ErrorBoundary fallback={modalErrorFallback}>
          <Suspense fallback={null}>
            <AnimatePresence>
              {isCVModalOpen && (
                <MCV onClose={closeCVModal} onProjectClick={handleProjectClick} />
              )}
            </AnimatePresence>
            {warming === 'cv' && !isCVModalOpen && <MCV warm onClose={noop} onProjectClick={noop} />}
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
        onCurtainMoving={handleCurtainMoving}
        onTransitionComplete={handleTransitionComplete}
        nextSectionName={nextSection}
        direction={direction}
      />
    </main>
    </SettingsProvider>
    </MotionConfig>
  );
}

export default App;
