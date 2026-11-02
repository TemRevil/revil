'use client';

import { useEffect, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import { isLite, prefersReducedMotion } from '../lib/device';
import { handwrite } from '../lib/handwrite';
import Handwriting, { fitSize } from '../ui/Handwriting';
import { EASE_IN_OUT, FADE, past, type Side } from '../home/PageTransition';

/** The curtain's sweep over the page being left (ms): a little quicker than the homepage's. */
const COVER = 120;
/** The next page's name is written this many times faster than the labels on the page. */
const PACE = 8;

/** sessionStorage key: the side the curtain came in from, set as the page is left under it. */
const CURTAIN_KEY = 'pj-curtain';

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

/**
 * The homepage's curtain, between the standalone pages (/projects, each project, /privacy).
 * A link to another of them sweeps the curtain over this page and writes the next page's
 * name on it, so the reader sees where they are going. The next page then opens under
 * the same curtain with its name already there (an inline script in the layout's <head>
 * marks it covered before its first paint and skips the browser's own page transition),
 * and the curtain lifts by the far side at once. Pointing at such a link already asks
 * for its page, so it is ready by the time its name is written. On phones (lite: nothing is blurred, the curtain
 * would be see-through) the plain cross-page fade stays.
 */
export default function PageCurtain({ title }: { title: string }) {
    const curtainRef = useRef<HTMLDivElement>(null);
    const nameRef = useRef<HTMLDivElement>(null);
    /** The name on the curtain: this page's own, or the next one's while leaving. */
    const [shown, setShown] = useState(title);

    // Arriving: the curtain lifts by itself in CSS (pageTransition.css) from the first
    // paint; once it is gone, the page drops the mark.
    useEffect(() => {
        const root = document.documentElement;
        const curtain = curtainRef.current;
        try { sessionStorage.removeItem(CURTAIN_KEY); } catch { /* storage blocked */ }
        if (!root.hasAttribute('data-pj-curtain') || !curtain) return;
        const done = () => {
            if (curtain.getAnimations().some(a => a.playState === 'running')) return;
            root.removeAttribute('data-pj-curtain');
        };
        curtain.addEventListener('animationend', done);
        done();
        return () => curtain.removeEventListener('animationend', done);
    }, []);

    // Leaving: a link to another standalone page sweeps the curtain over this one and
    // writes where it goes, then opens it.
    useEffect(() => {
        const curtain = curtainRef.current;
        const name = nameRef.current;
        let leaving = false;
        const anims: Animation[] = [];
        const asked = new Set<string>();
        /** Ask for a page ahead of opening it, once. */
        const prefetch = (url: URL) => {
            if (asked.has(url.pathname)) return;
            asked.add(url.pathname);
            const ahead = document.createElement('link');
            ahead.rel = 'prefetch';
            ahead.href = url.href;
            document.head.appendChild(ahead);
        };
        /** The standalone page a link opens, if it is another one. */
        const target = (el: EventTarget | null) => {
            const link = (el as Element | null)?.closest?.('a[href]') as HTMLAnchorElement | null;
            if (!link || (link.target && link.target !== '_self') || link.hasAttribute('download')) return null;
            const url = new URL(link.href, location.href);
            if (url.origin !== location.origin) return null;
            const side = curtainSide(location.pathname, url.pathname);
            return side ? { link, url, side } : null;
        };
        const onPoint = (e: PointerEvent) => { const t = target(e.target); if (t) prefetch(t.url); };
        const onClick = (e: MouseEvent) => {
            if (leaving || e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || isLite()) return;
            const t = target(e.target);
            if (!t || !curtain || !name) return;
            const { link, url, side } = t;
            e.preventDefault();
            leaving = true;
            try { sessionStorage.setItem(CURTAIN_KEY, side); } catch { /* the next page just opens */ }
            prefetch(url);

            flushSync(() => setShown(nextTitle(url.pathname, link)));
            const still = prefersReducedMotion();
            name.style.visibility = 'hidden';
            curtain.style.display = 'flex';
            const cover = curtain.animate(
                still ? [{ opacity: 0 }, { opacity: 1 }] : [{ transform: past(side) }, { transform: 'none' }],
                { duration: still ? FADE : COVER, easing: EASE_IN_OUT, fill: 'forwards' },
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
        document.addEventListener('pointerover', onPoint);
        window.addEventListener('pageshow', onShow);
        return () => {
            document.removeEventListener('click', onClick);
            document.removeEventListener('pointerover', onPoint);
            window.removeEventListener('pageshow', onShow);
        };
    }, [title]);

    return (
        <div ref={curtainRef} className="pj-curtain" aria-hidden="true">
            <div ref={nameRef} className="pj-curtain-name" style={{ fontSize: fitSize(shown) }}>
                <Handwriting text={shown} />
            </div>
        </div>
    );
}
