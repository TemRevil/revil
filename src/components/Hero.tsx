import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { doc, onSnapshot } from 'firebase/firestore';
import { Plus, Briefcase, Calendar } from 'lucide-react';
import { db } from '../lib/firebase';
import { availabilityStatus } from '../utils/availability';
import { useSettings } from '../contexts/SettingsContext';
import useTheme from '../hooks/useTheme';
import { Chars, PaintDefs, splitSlogan, useHostClock, usePaint } from './book/paintKit';
import './book/book.css';

interface HeroProject {
    name?: string;
    status?: string;
    order?: number;
}

interface AvailabilityData {
    'Current Availability'?: string;
    'Current Time'?: string;
}

// Public sanitized handled-projects mirror (Settings/HandledProjects), written
// by the admin Treasury page. Holds name/status only - never prices, and never
// the project's notes, which are private to the dashboard.
interface HandledData {
    projects?: Record<string, HeroProject>;
}

const statusTone = (s?: string) => {
    const v = (s || '').toLowerCase();
    if (v === 'completed') return { bg: 'rgba(16, 185, 129, 0.15)', fg: '#10b981', border: 'rgba(16, 185, 129, 0.3)' };
    if (v === 'pending') return { bg: 'rgba(245, 158, 11, 0.15)', fg: '#f59e0b', border: 'rgba(245, 158, 11, 0.3)' };
    return { bg: 'rgba(59, 130, 246, 0.15)', fg: '#3b82f6', border: 'rgba(59, 130, 246, 0.3)' };
};

/**
 * The availability pill. Hover (or tap, on a phone) opens the list of projects the owner
 * is handling, in a portal so it escapes the hero's overflow and stacking.
 */
const StatusPill = ({ isDark, label, color, projects }: { isDark: boolean; label: string; color: string; projects: HeroProject[] }) => {
    const triggerRef = useRef<HTMLButtonElement>(null);
    const tooltipRef = useRef<HTMLDivElement>(null);
    const [tooltipVisible, setTooltipVisible] = useState(false);
    const [tooltipMounted, setTooltipMounted] = useState(false);
    const [tooltipPos, setTooltipPos] = useState<{ top: number | 'auto'; bottom: number | 'auto'; left: number; width: number; arrowLeft: number; flipBelow: boolean }>({ top: 0, bottom: 'auto', left: 0, width: 320, arrowLeft: 160, flipBelow: false });
    const hideTimeoutRef = useRef<NodeJS.Timeout | null>(null);
    const unmountTimeoutRef = useRef<NodeJS.Timeout | null>(null);
    const hasList = projects.length > 0;

    const clearTimers = () => {
        if (hideTimeoutRef.current) { clearTimeout(hideTimeoutRef.current); hideTimeoutRef.current = null; }
        if (unmountTimeoutRef.current) { clearTimeout(unmountTimeoutRef.current); unmountTimeoutRef.current = null; }
    };

    const updateTooltipPosition = () => {
        if (!triggerRef.current) return;
        const rect = triggerRef.current.getBoundingClientRect();
        // Max 320px wide, narrower on small phones so it keeps 16px margins.
        const tooltipW = Math.min(320, window.innerWidth - 32);
        const gap = 16;
        const estimatedHeight = tooltipRef.current?.offsetHeight || 260;
        let flipBelow = false;
        let top: number | 'auto' = 'auto';
        let bottom: number | 'auto' = 'auto';
        // Above the pill when it fits (anchored by its bottom so it grows upwards), else below.
        if (rect.top > estimatedHeight + gap + 10) bottom = window.innerHeight - rect.top + gap;
        else { top = rect.bottom + gap; flipBelow = true; }
        const center = rect.left + rect.width / 2;
        const left = Math.max(16, Math.min(center - tooltipW / 2, window.innerWidth - tooltipW - 16));
        // The arrow points at the pill's centre, kept clear of the rounded corners.
        const arrowLeft = Math.max(24, Math.min(center - left, tooltipW - 24));
        setTooltipPos({ top, bottom, left, width: tooltipW, arrowLeft, flipBelow });
    };

    const openTooltip = () => {
        if (!hasList) return;
        clearTimers();
        updateTooltipPosition();
        setTooltipMounted(true);
        // Two frames: let the mount paint, then animate in.
        requestAnimationFrame(() => requestAnimationFrame(() => setTooltipVisible(true)));
    };
    const closeTooltip = () => {
        setTooltipVisible(false);
        unmountTimeoutRef.current = setTimeout(() => setTooltipMounted(false), 350);
    };
    const closeSoon = (ms: number) => { hideTimeoutRef.current = setTimeout(closeTooltip, ms); };

    // Reposition on scroll/resize, and close on a tap anywhere else, while open.
    useEffect(() => {
        if (!tooltipMounted) return;
        const update = () => updateTooltipPosition();
        const outside = (e: PointerEvent) => {
            const t = e.target as Node;
            if (!triggerRef.current?.contains(t) && !tooltipRef.current?.contains(t)) closeTooltip();
        };
        window.addEventListener('scroll', update, true);
        window.addEventListener('resize', update);
        document.addEventListener('pointerdown', outside);
        return () => {
            window.removeEventListener('scroll', update, true);
            window.removeEventListener('resize', update);
            document.removeEventListener('pointerdown', outside);
        };
    }, [tooltipMounted]);

    useEffect(() => clearTimers, []);

    const shown = projects.slice(0, 3);
    const restCount = projects.length - 3;
    const line = isDark ? '1px solid rgba(255,255,255,0.08)' : '1px solid rgba(0,0,0,0.06)';
    const glass = isDark ? 'rgba(0, 0, 0, 0.4)' : 'rgba(255, 255, 255, 0.4)';
    // Slide offset (px) applied via top/bottom, NOT transform: backdrop-filter blur
    // breaks on transformed elements in Chrome.
    const slideOffset = tooltipVisible ? 0 : (tooltipPos.flipBelow ? -10 : 10);

    const tooltip = tooltipMounted && hasList ? createPortal(
        <div
            ref={tooltipRef}
            role="dialog"
            aria-label="Projects I'm handling"
            onMouseEnter={clearTimers}
            onMouseLeave={() => closeSoon(200)}
            style={{
                position: 'fixed',
                top: typeof tooltipPos.top === 'number' ? tooltipPos.top + slideOffset : tooltipPos.top,
                bottom: typeof tooltipPos.bottom === 'number' ? tooltipPos.bottom - slideOffset : tooltipPos.bottom,
                left: tooltipPos.left,
                width: tooltipPos.width,
                // Above the navbar (z-50), below modals (1400+).
                zIndex: 60,
                opacity: tooltipVisible ? 1 : 0,
                // Opacity snaps in (the blur shows from the first frame) and fades out.
                transition: tooltipVisible
                    ? 'opacity 0s, top 0.3s cubic-bezier(0.32, 0.72, 0, 1), bottom 0.3s cubic-bezier(0.32, 0.72, 0, 1)'
                    : 'opacity 0.3s cubic-bezier(0.32, 0.72, 0, 1), top 0.3s cubic-bezier(0.32, 0.72, 0, 1), bottom 0.3s cubic-bezier(0.32, 0.72, 0, 1)',
                pointerEvents: tooltipVisible ? 'auto' : 'none',
                borderRadius: 28,
                padding: window.innerWidth <= 380 ? 16 : 24,
                // The pills' glass (book.css .pill), so the paint shows through blurred.
                background: glass,
                backdropFilter: 'blur(30px) saturate(1.4)',
                WebkitBackdropFilter: 'blur(30px) saturate(1.4)',
                border: isDark ? '1px solid rgba(255, 255, 255, 0.08)' : '1px solid rgba(0, 0, 0, 0.08)',
                boxShadow: isDark ? '0 8px 32px rgba(0, 0, 0, 0.2)' : '0 8px 32px rgba(0, 0, 0, 0.05)',
            }}
        >
            <div
                style={{
                    position: 'absolute',
                    left: tooltipPos.arrowLeft,
                    transform: 'translateX(-50%) rotate(45deg)',
                    width: 14,
                    height: 14,
                    ...(tooltipPos.flipBelow
                        ? { top: -7, borderLeft: line, borderTop: line }
                        : { bottom: -7, borderRight: line, borderBottom: line }),
                    background: glass,
                    backdropFilter: 'blur(30px) saturate(1.4)',
                    WebkitBackdropFilter: 'blur(30px) saturate(1.4)',
                }}
            />
            <div className="flex items-center gap-3 mb-4 pb-3" style={{ borderBottom: line }}>
                <Briefcase size={15} className="text-info" />
                <span className="text-[11px] font-bold uppercase tracking-[0.15em] text-muted">Availability Status</span>
            </div>
            <div className="flex flex-col gap-4">
                {shown.map((p, i) => {
                    const tone = statusTone(p.status);
                    return (
                        <div key={i} className="flex items-center justify-between gap-4">
                            <span className="text-[14px] font-bold text-primary tracking-tight">{p.name || 'Project'}</span>
                            <span className="text-[10px] px-2.5 py-1 rounded-full font-black uppercase tracking-widest border"
                                style={{ backgroundColor: tone.bg, color: tone.fg, borderColor: tone.border }}>
                                {p.status || 'Active'}
                            </span>
                        </div>
                    );
                })}
                {restCount > 0 && (
                    <div className="flex items-center justify-center gap-2 mt-1 pt-3 text-muted" style={{ borderTop: line }}>
                        <Plus size={14} strokeWidth={3} />
                        <span className="text-[12px] font-black">{restCount} rest managed</span>
                    </div>
                )}
            </div>
        </div>,
        document.body
    ) : null;

    return (
        <>
            <button
                ref={triggerRef}
                type="button"
                className="pill"
                aria-haspopup={hasList ? 'dialog' : undefined}
                aria-expanded={hasList ? tooltipVisible : undefined}
                onPointerEnter={(e) => { if (e.pointerType === 'mouse') openTooltip(); }}
                onPointerLeave={(e) => { if (e.pointerType === 'mouse') closeSoon(250); }}
                // Touch and keyboard toggle it; a mouse already opened it on hover.
                onClick={(e) => {
                    if ((e.nativeEvent as PointerEvent).pointerType === 'mouse') return;
                    if (tooltipVisible) closeTooltip(); else openTooltip();
                }}
            >
                <span className="dot" aria-hidden="true" style={{ '--dot': color } as React.CSSProperties}><i /><i /></span>{label}
            </button>
            {tooltip}
        </>
    );
};

/**
 * The homepage hero: the /book hero on its own, full width. Name stacked behind the
 * cut-out, painted brushes around it (a new composition every visit), the handwritten
 * title, and the status, clock and Book a call pills.
 */
const Hero = ({ onLoaded, onAnimationComplete, isReady = true, onOpenContact }: { onLoaded?: () => void; onAnimationComplete?: () => void; isReady?: boolean; onOpenContact?: () => void }) => {
    const rootRef = useRef<HTMLDivElement>(null);
    const isDark = useTheme();
    const hasNotifiedLoaded = useRef(false);

    // Shared Settings/Account listener (single Firestore connection for all components)
    const { account, accountLoading } = useSettings();
    const profileName = (account?.name || 'Tem Revil').trim();
    const profileTitle = account?.title || 'a Front-End';
    const [firstName, ...rest] = profileName.split(/\s+/);
    const nameLines = [firstName, rest.join(' ')].filter(Boolean).map(s => s.toUpperCase());
    const sloganLines = splitSlogan(profileTitle);

    // Availability % + time zone live in Settings/Availability; the handled-projects list
    // comes from the public, sanitized Settings/HandledProjects mirror.
    const [availData, setAvailData] = useState<AvailabilityData | null>(null);
    const [handledData, setHandledData] = useState<HandledData | null>(null);
    useEffect(() => {
        const unsubAvail = onSnapshot(doc(db, 'Settings', 'Availability'), (snap) => { if (snap.exists()) setAvailData(snap.data()); });
        const unsubHandled = onSnapshot(doc(db, 'Settings', 'HandledProjects'), (snap) => { if (snap.exists()) setHandledData(snap.data()); });
        return () => { unsubAvail(); unsubHandled(); };
    }, []);
    const status = availabilityStatus(availData?.['Current Availability']);
    const zone = (availData?.['Current Time'] || 'UTC+02:00').split(' ')[0];
    const clock = useHostClock(zone);
    // The admin's drag-sort order (map order for legacy data).
    const projects = Object.values(handledData?.projects || {}).sort((a, b) => (a.order ?? 0) - (b.order ?? 0));

    // Notify parent that initial data is ready
    useEffect(() => {
        if (!accountLoading && onLoaded && !hasNotifiedLoaded.current) {
            hasNotifiedLoaded.current = true;
            onLoaded();
        }
    }, [accountLoading, onLoaded]);

    // ---- paint: once the loader is gone and the photo, fonts and profile are in.
    const [assetsReady, setAssetsReady] = useState(false);
    useEffect(() => {
        const img = rootRef.current?.querySelector<HTMLImageElement>('.stage img');
        let alive = true;
        const timeout = new Promise(r => setTimeout(r, 1500));
        Promise.all([document.fonts.ready, img?.decode().catch(() => { }), Promise.race([timeout, new Promise<void>(r => { if (!accountLoading) r(); })])])
            .then(() => { if (alive) setAssetsReady(true); });
        return () => { alive = false; };
    }, [accountLoading]);
    // A beat after the loader lifts, so the entrance isn't spent behind its fade.
    const [loaderGone, setLoaderGone] = useState(false);
    useEffect(() => {
        if (!isReady) return;
        const id = window.setTimeout(() => setLoaderGone(true), 500);
        return () => window.clearTimeout(id);
    }, [isReady]);
    const ready = loaderGone && assetsReady;
    const { boilRef, painted } = usePaint(rootRef, ready, [profileName, profileTitle, status.label, !!onOpenContact]);

    // Failsafe: never leave the hero hidden if the photo or fonts hang.
    useEffect(() => {
        if (!isReady) return;
        const root = rootRef.current;
        const id = window.setTimeout(() => { if (root && !painted.current) root.dataset.intro = 'done'; }, 4000);
        return () => window.clearTimeout(id);
    }, [isReady, painted]);

    // Read onAnimationComplete from a ref so its identity changing (it depends on
    // hasAutoOpenedCV in the parent) can't restart the timer.
    const onAnimationCompleteRef = useRef(onAnimationComplete);
    useEffect(() => { onAnimationCompleteRef.current = onAnimationComplete; }, [onAnimationComplete]);
    useEffect(() => {
        if (!ready) return;
        const id = window.setTimeout(() => onAnimationCompleteRef.current?.(), 2600);
        return () => window.clearTimeout(id);
    }, [ready]);

    return (
        <div ref={rootRef} className="bp bp-home">
            <PaintDefs boilRef={boilRef} />
            <div className="wall" aria-hidden="true" />
            <svg className="paint-bg" aria-hidden="true" />
            <div className="layout">
                <section className="hero">
                    <div className="this-is" aria-hidden="true" data-write><Chars text="THIS IS" className="ch" /></div>
                    <h1 className="name">
                        <span className="sr-only">{profileName}{profileTitle ? `, ${profileTitle}` : ''}</span>
                        {nameLines.map(line => <span key={line} aria-hidden="true"><Chars text={line} className="name-char" /></span>)}
                    </h1>
                    <div className="stage stage-back" aria-hidden="true"><svg className="ring-back" /></div>
                    <div className="stage">
                        <img alt={`${profileName} portrait`} src="/book/tem-cutout.webp" width={920} height={1286} fetchPriority="high" decoding="async" />
                        <svg className="shirt" aria-hidden="true" />
                        <svg className="ring-front" aria-hidden="true" />
                    </div>
                    <div className="slogan" aria-hidden="true" data-write>
                        {sloganLines.map((line, i) => <span key={i}>{i > 0 && <br />}<Chars text={line} className="ch" /></span>)}
                    </div>
                    <div className="pills">
                        <StatusPill isDark={isDark} label={status.label} color={status.color} projects={projects} />
                        <span className="pill">{clock}<span className="zone">{zone}</span></span>
                        {onOpenContact && (
                            // A link to /book so the booking page is part of the site's link
                            // graph; a plain click opens the quicker booking window instead.
                            <a
                                href="/book"
                                className="pill book"
                                onClick={(e) => {
                                    if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
                                    e.preventDefault();
                                    onOpenContact();
                                }}
                            >
                                <Calendar size={16} strokeWidth={2.5} aria-hidden="true" />Book a call
                            </a>
                        )}
                    </div>
                </section>
            </div>
        </div>
    );
};

export default Hero;
