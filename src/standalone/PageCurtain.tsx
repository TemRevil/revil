'use client';

import { useEffect, useRef, useState } from 'react';
import { whenFramesFlow } from '../lib/idle';
import { isLite, prefersReducedMotion } from '../lib/device';
import { handwrite } from '../lib/handwrite';
import Handwriting from '../ui/Handwriting';
import { UNITS, penLine } from '../lib/pen/pen';
import { EASE_IN_OUT, FADE, FAR, HOLD, PACE, SWEEP, past, type Side } from '../home/PageTransition';

/** sessionStorage key: the side the curtain came in from, set as the page is left under it. */
export const CURTAIN_KEY = 'pj-curtain';

/** The standalone pages, in the top bar's order: the projects (list and each project), then privacy. */
const rank = (path: string) => {
    const p = path.replace(/\/+$/, '') || '/';
    if (p === '/projects') return { at: 1, depth: 0 };
    if (/^\/projects\/[^/]+$/.test(p)) return { at: 1, depth: 1 };
    if (p === '/privacy') return { at: 2, depth: 0 };
    return null;
};

/**
 * The side the curtain sweeps in from when going from one standalone page to another, as
 * the homepage's sections do: along the bar's order it comes in from the side being moved
 * toward (right going forward, left going back), and into a project from below (back out
 * from above). Null when `to` is not a standalone page, or is the page already open.
 */
export function curtainSide(from: string, to: string): Side | null {
    const a = rank(from), b = rank(to);
    if (!a || !b || (from.replace(/\/+$/, '') || '/') === (to.replace(/\/+$/, '') || '/')) return null;
    if (a.at !== b.at) return b.at > a.at ? 'right' : 'left';
    return b.depth >= a.depth ? 'bottom' : 'top';
}

/**
 * The homepage's curtain, between the standalone pages (/projects, each project, /privacy).
 * A link to another of them sweeps the curtain over this page, then the next page opens
 * under it: an inline script in the layout's <head> marks the page covered before its
 * first paint (and skips the browser's own page transition), the page's name is written
 * once it is running, and the curtain lifts by the far side. On phones (lite: nothing is
 * blurred, the curtain would be see-through) the plain cross-page fade stays.
 */
export default function PageCurtain({ title }: { title: string }) {
    const curtainRef = useRef<HTMLDivElement>(null);
    const nameRef = useRef<HTMLDivElement>(null);
    const [fontSize, setFontSize] = useState(100);
    const nameWidth = penLine(title).width / UNITS;

    useEffect(() => {
        const fit = () => setFontSize(Math.min(Math.max(40, Math.min(window.innerWidth / 6, 100)), window.innerWidth * 0.9 / nameWidth));
        fit();
        window.addEventListener('resize', fit);
        return () => window.removeEventListener('resize', fit);
    }, [nameWidth]);

    // Arriving under the curtain: write this page's name, hold, lift by the far side.
    useEffect(() => {
        const root = document.documentElement;
        const curtain = curtainRef.current;
        const from = root.getAttribute('data-pj-curtain') as Side | null;
        try { sessionStorage.removeItem(CURTAIN_KEY); } catch { /* storage blocked */ }
        if (!from || !curtain) return;

        const still = prefersReducedMotion();
        const anims: Animation[] = [];
        let live = true, stopWaiting = () => { };
        const name = nameRef.current;
        const finish = () => {
            root.removeAttribute('data-pj-curtain');
            if (name) name.style.visibility = 'hidden';
            anims.forEach(a => a.cancel());
        };
        new Promise<void>(r => { stopWaiting = whenFramesFlow(r); })
            .then(() => {
                if (!live || !name) return;
                const ink = handwrite(name, { pace: PACE });
                name.style.visibility = 'visible';
                anims.push(...ink);
                return Promise.all(ink.map(a => a.finished));
            })
            .then(() => live ? new Promise(r => setTimeout(r, HOLD)) : undefined)
            .then(() => {
                if (!live) return;
                const lift = curtain.animate(
                    still ? [{ opacity: 1 }, { opacity: 0 }] : [{ transform: 'none' }, { transform: past(FAR[from]) }],
                    { duration: still ? FADE : SWEEP, easing: EASE_IN_OUT, fill: 'forwards' },
                );
                anims.push(lift);
                return lift.finished;
            })
            .then(() => { if (live) finish(); })
            .catch(() => { /* cancelled */ });
        // Not finish(): in development React runs this effect twice, and the second run
        // still needs the page marked covered.
        return () => { live = false; stopWaiting(); anims.forEach(a => a.cancel()); };
    }, []);

    // Leaving: a link to another standalone page sweeps the curtain over this one first.
    useEffect(() => {
        const curtain = curtainRef.current;
        let leaving = false;
        const onClick = (e: MouseEvent) => {
            if (leaving || e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || isLite()) return;
            const link = (e.target as Element | null)?.closest?.('a[href]') as HTMLAnchorElement | null;
            if (!link || (link.target && link.target !== '_self') || link.hasAttribute('download')) return;
            const url = new URL(link.href, location.href);
            if (url.origin !== location.origin) return;
            const side = curtainSide(location.pathname, url.pathname);
            if (!side || !curtain) return;
            e.preventDefault();
            leaving = true;
            try { sessionStorage.setItem(CURTAIN_KEY, side); } catch { /* the next page just opens */ }
            const still = prefersReducedMotion();
            curtain.style.display = 'flex';
            const cover = curtain.animate(
                still ? [{ opacity: 0 }, { opacity: 1 }] : [{ transform: past(side) }, { transform: 'none' }],
                { duration: still ? FADE : SWEEP, easing: EASE_IN_OUT, fill: 'forwards' },
            );
            void cover.finished.then(() => location.assign(url.href)).catch(() => { leaving = false; });
        };
        // Back to this page from the history cache: it was left covered, so uncover it.
        const onShow = (e: PageTransitionEvent) => {
            if (!e.persisted || !curtain) return;
            leaving = false;
            curtain.getAnimations().forEach(a => a.cancel());
            curtain.style.display = '';
        };
        document.addEventListener('click', onClick);
        window.addEventListener('pageshow', onShow);
        return () => {
            document.removeEventListener('click', onClick);
            window.removeEventListener('pageshow', onShow);
        };
    }, []);

    return (
        <div ref={curtainRef} className="pj-curtain" aria-hidden="true">
            <div ref={nameRef} className="pj-curtain-name" style={{ fontSize }}>
                <Handwriting text={title} />
            </div>
        </div>
    );
}
