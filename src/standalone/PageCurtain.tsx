'use client';

import { useEffect, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import { whenFramesFlow } from '../lib/idle';
import { isLite, prefersReducedMotion } from '../lib/device';
import { handwrite } from '../lib/handwrite';
import Handwriting from '../ui/Handwriting';
import { UNITS, penLine } from '../lib/pen/pen';
import { EASE_IN_OUT, FADE, FAR, HOLD, PACE, SWEEP, past, type Side } from '../home/PageTransition';

/** sessionStorage key: the side the curtain came in from, set as the page is left under it. */
export const CURTAIN_KEY = 'pj-curtain';

const trim = (path: string) => path.replace(/\/+$/, '') || '/';

/** The standalone pages, in the top bar's order: the projects (list and each project), then privacy. */
const rank = (path: string) => {
    const p = trim(path);
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
    if (!a || !b || trim(from) === trim(to)) return null;
    if (a.at !== b.at) return b.at > a.at ? 'right' : 'left';
    return b.depth >= a.depth ? 'bottom' : 'top';
}

/**
 * The name of the page a link opens, written on the curtain before it goes: the two
 * fixed pages by their address, a project by the link's `data-page-title` or its text
 * (the project cards' title links).
 */
export function nextTitle(path: string, link: { dataset: DOMStringMap; textContent: string | null }) {
    const p = trim(path);
    if (p === '/projects') return 'Projects';
    if (p === '/privacy') return 'Privacy & terms';
    return (link.dataset.pageTitle || link.textContent || '').trim();
}

/** The written name's size: as on the homepage's curtain, smaller for a long name, to fit across the window. */
const nameSize = (text: string) => {
    const width = Math.max(penLine(text).width / UNITS, 0.01);
    return `min(clamp(40px, 16.667vw, 100px), calc(90vw / ${width.toFixed(3)}))`;
};

/**
 * The homepage's curtain, between the standalone pages (/projects, each project, /privacy).
 * A link to another of them sweeps the curtain over this page and writes the next page's
 * name on it, so the reader sees where they are going. The next page then opens under
 * the same curtain with its name already there (an inline script in the layout's <head>
 * marks it covered before its first paint and skips the browser's own page transition),
 * and the curtain lifts by the far side. On phones (lite: nothing is blurred, the curtain
 * would be see-through) the plain cross-page fade stays.
 */
export default function PageCurtain({ title }: { title: string }) {
    const curtainRef = useRef<HTMLDivElement>(null);
    const nameRef = useRef<HTMLDivElement>(null);
    /** The name on the curtain: this page's own, or the next one's while leaving. */
    const [shown, setShown] = useState(title);

    // Arriving under the curtain, its name already written: hold, then lift by the far side.
    useEffect(() => {
        const root = document.documentElement;
        const curtain = curtainRef.current;
        const from = root.getAttribute('data-pj-curtain') as Side | null;
        try { sessionStorage.removeItem(CURTAIN_KEY); } catch { /* storage blocked */ }
        if (!from || !curtain) return;

        const still = prefersReducedMotion();
        let live = true, stopWaiting = () => { }, lift: Animation | undefined;
        new Promise<void>(r => { stopWaiting = whenFramesFlow(r); })
            .then(() => live ? new Promise(r => setTimeout(r, HOLD)) : undefined)
            .then(() => {
                if (!live) return;
                lift = curtain.animate(
                    still ? [{ opacity: 1 }, { opacity: 0 }] : [{ transform: 'none' }, { transform: past(FAR[from]) }],
                    { duration: still ? FADE : SWEEP, easing: EASE_IN_OUT, fill: 'forwards' },
                );
                return lift.finished;
            })
            .then(() => {
                if (!live) return;
                root.removeAttribute('data-pj-curtain');
                lift?.cancel();
            })
            .catch(() => { /* cancelled */ });
        // Not removing the mark here: in development React runs this effect twice, and the
        // second run still needs the page covered.
        return () => { live = false; stopWaiting(); lift?.cancel(); };
    }, []);

    // Leaving: a link to another standalone page sweeps the curtain over this one and
    // writes where it goes, then opens it.
    useEffect(() => {
        const curtain = curtainRef.current;
        const name = nameRef.current;
        let leaving = false;
        const anims: Animation[] = [];
        const onClick = (e: MouseEvent) => {
            if (leaving || e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || isLite()) return;
            const link = (e.target as Element | null)?.closest?.('a[href]') as HTMLAnchorElement | null;
            if (!link || (link.target && link.target !== '_self') || link.hasAttribute('download')) return;
            const url = new URL(link.href, location.href);
            if (url.origin !== location.origin) return;
            const side = curtainSide(location.pathname, url.pathname);
            if (!side || !curtain || !name) return;
            e.preventDefault();
            leaving = true;
            try { sessionStorage.setItem(CURTAIN_KEY, side); } catch { /* the next page just opens */ }
            // Ask for the next page now, so it is ready once its name is written.
            const ahead = document.createElement('link');
            ahead.rel = 'prefetch';
            ahead.href = url.href;
            document.head.appendChild(ahead);

            flushSync(() => setShown(nextTitle(url.pathname, link)));
            const still = prefersReducedMotion();
            name.style.visibility = 'hidden';
            curtain.style.display = 'flex';
            const cover = curtain.animate(
                still ? [{ opacity: 0 }, { opacity: 1 }] : [{ transform: past(side) }, { transform: 'none' }],
                { duration: still ? FADE : SWEEP, easing: EASE_IN_OUT, fill: 'forwards' },
            );
            anims.push(cover);
            void cover.finished
                .then(() => {
                    const ink = handwrite(name, { pace: PACE });
                    name.style.visibility = 'visible';
                    anims.push(...ink);
                    return Promise.all(ink.map(a => a.finished));
                })
                .then(() => location.assign(url.href))
                .catch(() => { leaving = false; });
        };
        // Back to this page from the history cache: it was left covered, so uncover it.
        const onShow = (e: PageTransitionEvent) => {
            if (!e.persisted || !curtain || !name) return;
            leaving = false;
            anims.forEach(a => a.cancel());
            anims.length = 0;
            curtain.style.display = '';
            name.style.visibility = '';
            setShown(title);
        };
        document.addEventListener('click', onClick);
        window.addEventListener('pageshow', onShow);
        return () => {
            document.removeEventListener('click', onClick);
            window.removeEventListener('pageshow', onShow);
        };
    }, [title]);

    return (
        <div ref={curtainRef} className="pj-curtain" aria-hidden="true">
            <div ref={nameRef} className="pj-curtain-name" style={{ fontSize: nameSize(shown) }}>
                <Handwriting text={shown} />
            </div>
        </div>
    );
}
