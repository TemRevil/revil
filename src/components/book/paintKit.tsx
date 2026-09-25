/**
 * What /book and the homepage hero share: the SVG filters the brushes use, the letter
 * spans the entrance animates, the owner's live clock, and usePaint, which runs the
 * paint (brushes.ts) on a root element.
 */
import { useEffect, useRef, useState, type RefObject } from 'react';
import { utcOffsetHours } from '../../utils/availability';
import { paintBook, startBoil } from './brushes';

/** Phones paint once with the lighter set and skip the 15fps boil. */
const PHONE_QUERY = '(max-width: 767px)';
const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/** Break a handwritten line at the space nearest its middle, so two short lines stack. */
export function splitSlogan(s: string): string[] {
    if (s.length <= 12 || !s.includes(' ')) return [s];
    const mid = s.length / 2;
    let best = -1;
    for (let i = 0; i < s.length; i++) if (s[i] === ' ' && (best < 0 || Math.abs(i - mid) < Math.abs(best - mid))) best = i;
    return [s.slice(0, best), s.slice(best + 1)];
}

export const Chars = ({ text, className }: { text: string; className: string }) => (
    <>{[...text].map((ch, i) => <span key={i} className={className}>{ch === ' ' ? String.fromCharCode(160) : ch}</span>)}</>
);

/** The owner's local time, from the zone set in Settings/Availability ("Current Time"). */
export const useHostClock = (tz: string) => {
    const offset = utcOffsetHours(tz);
    const fmt = () => new Date(Date.now() + offset * 3600000).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone: 'UTC' });
    const [now, setNow] = useState(fmt);
    useEffect(() => {
        const tick = () => setNow(new Date(Date.now() + offset * 3600000).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone: 'UTC' }));
        tick();
        const id = window.setInterval(tick, 15000);
        return () => window.clearInterval(id);
    }, [offset]);
    return now;
};

/** The brush filters. #bp-rag's turbulence is the one the boil re-seeds. */
export const PaintDefs = ({ boilRef }: { boilRef: RefObject<SVGFETurbulenceElement | null> }) => (
    <svg width="0" height="0" style={{ position: 'absolute' }} aria-hidden="true">
        <defs>
            <filter id="bp-rag" x="-5%" y="-5%" width="110%" height="110%">
                <feTurbulence ref={boilRef} type="fractalNoise" baseFrequency="0.05" numOctaves={2} seed={4} result="w" />
                <feDisplacementMap in="SourceGraphic" in2="w" scale={6} xChannelSelector="R" yChannelSelector="G" />
            </filter>
            <filter id="bp-fabric" x="-10%" y="-10%" width="120%" height="120%">
                <feTurbulence type="fractalNoise" baseFrequency="0.02 0.06" numOctaves={2} seed={9} result="f" />
                <feDisplacementMap in="SourceGraphic" in2="f" scale={6} xChannelSelector="R" yChannelSelector="G" />
            </filter>
            <filter id="bp-soft" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation={10} /></filter>
        </defs>
    </svg>
);

/**
 * Paints `root` once `ready` is true. The first draw animates; later draws (a resize,
 * or a change in `deps` that moves the text) land without animation. Returns the ref
 * for PaintDefs' turbulence and whether the first paint has happened.
 */
export function usePaint(rootRef: RefObject<HTMLElement | null>, ready: boolean, deps: unknown[] = []) {
    const boilRef = useRef<SVGFETurbulenceElement>(null);
    const painted = useRef(false);

    useEffect(() => {
        const root = rootRef.current;
        if (!ready || !root) return;
        paintBook(root, !painted.current && !reducedMotion(), window.matchMedia(PHONE_QUERY).matches);
        painted.current = true;
        // eslint-disable-next-line react-hooks/exhaustive-deps -- deps is the caller's list
    }, [ready, rootRef, ...deps]);

    useEffect(() => {
        const root = rootRef.current;
        if (!root) return;
        let w = root.clientWidth, t = 0;
        const ro = new ResizeObserver(() => {
            // Width only: a phone's URL bar changing the height must not repaint.
            if (!painted.current || Math.abs(root.clientWidth - w) < 40) return;
            w = root.clientWidth;
            window.clearTimeout(t);
            t = window.setTimeout(() => paintBook(root, false, window.matchMedia(PHONE_QUERY).matches), 200);
        });
        ro.observe(root);
        return () => { ro.disconnect(); window.clearTimeout(t); };
    }, [rootRef]);

    useEffect(() => {
        const turb = boilRef.current;
        if (!turb || reducedMotion() || window.matchMedia(PHONE_QUERY).matches) return;
        return startBoil(turb);
    }, []);

    return { boilRef, painted };
}
