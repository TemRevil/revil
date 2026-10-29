import { useCallback, useEffect, useState, type RefObject } from 'react';
import { prefersReducedMotion } from '../lib/device';

/**
 * A row of items that scrolls sideways (the projects' filter tags on a narrow screen):
 * mouse drag and wheel, which edges still hide items, a one-time hint that it moves,
 * and paging. Everything is a no-op while the row fits.
 */

/** How far the mouse has to move before a press becomes a drag rather than a click. */
const DRAG_PX = 5;

/**
 * Lets a mouse scroll a sideways rail: drag it with the button held, or turn the wheel.
 * Touch and pen already scroll it natively and are left alone. Nothing happens while the
 * rail fits (no overflow), and a drag never ends in a click on the item under the cursor.
 * Returns the cleanup.
 */
export function dragScroll(el: HTMLElement): () => void {
    const overflows = () => el.scrollWidth > el.clientWidth + 1;
    let startX = 0, startLeft = 0, pressed = false, dragging = false, swallowClick = false;

    const down = (e: PointerEvent) => {
        if (e.pointerType !== 'mouse' || e.button !== 0 || !overflows()) return;
        pressed = true; dragging = false;
        startX = e.clientX; startLeft = el.scrollLeft;
    };
    const move = (e: PointerEvent) => {
        if (!pressed) return;
        const dx = e.clientX - startX;
        if (!dragging) {
            if (Math.abs(dx) < DRAG_PX) return;
            dragging = true;
            el.setPointerCapture?.(e.pointerId);
            // Snapping fights the drag, and smooth scrolling makes it lag behind the cursor.
            el.style.scrollSnapType = 'none';
            el.style.scrollBehavior = 'auto';
            el.style.cursor = 'grabbing';
        }
        el.scrollLeft = startLeft - dx;
    };
    const up = (e: PointerEvent) => {
        if (!pressed) return;
        pressed = false;
        if (!dragging) return;
        dragging = false;
        swallowClick = true;
        el.releasePointerCapture?.(e.pointerId);
        el.style.scrollSnapType = '';
        el.style.scrollBehavior = '';
        el.style.cursor = '';
    };
    // The release after a drag still fires a click on whatever is under the cursor.
    const click = (e: MouseEvent) => {
        if (!swallowClick) return;
        swallowClick = false;
        e.preventDefault();
        e.stopPropagation();
    };
    // A plain wheel turn scrolls the rail sideways while it can still move that way; at
    // either end the page scrolls as usual.
    const wheel = (e: WheelEvent) => {
        if (!overflows() || Math.abs(e.deltaX) >= Math.abs(e.deltaY)) return;
        const max = el.scrollWidth - el.clientWidth;
        if ((e.deltaY < 0 && el.scrollLeft <= 0) || (e.deltaY > 0 && el.scrollLeft >= max - 1)) return;
        e.preventDefault();
        el.scrollLeft += e.deltaY;
    };

    el.addEventListener('pointerdown', down);
    el.addEventListener('pointermove', move);
    el.addEventListener('pointerup', up);
    el.addEventListener('pointercancel', up);
    el.addEventListener('click', click, true);
    el.addEventListener('wheel', wheel, { passive: false });
    return () => {
        el.removeEventListener('pointerdown', down);
        el.removeEventListener('pointermove', move);
        el.removeEventListener('pointerup', up);
        el.removeEventListener('pointercancel', up);
        el.removeEventListener('click', click, true);
        el.removeEventListener('wheel', wheel);
    };
}

export interface RailEdges {
    /** Items are hidden past the left edge. */
    before: boolean;
    /** Items are hidden past the right edge. */
    after: boolean;
}

/**
 * Reports which edges of the rail still hide items, now and whenever that changes: on
 * scroll, on resize, and when items are added, removed or reordered.
 */
export function railEdges(el: HTMLElement, onChange: (edges: RailEdges) => void): () => void {
    let last = '';
    const check = () => {
        const max = el.scrollWidth - el.clientWidth;
        const edges = { before: max > 1 && el.scrollLeft > 1, after: max > 1 && el.scrollLeft < max - 1 };
        const key = `${edges.before}${edges.after}`;
        if (key === last) return;
        last = key;
        onChange(edges);
    };
    check();
    el.addEventListener('scroll', check, { passive: true });
    const resize = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(check);
    resize?.observe(el);
    const items = typeof MutationObserver === 'undefined' ? null : new MutationObserver(check);
    items?.observe(el, { childList: true, subtree: true });
    return () => {
        el.removeEventListener('scroll', check);
        resize?.disconnect();
        items?.disconnect();
    };
}

/** How far the one-time hint slides the rail, and how long each way takes. */
const NUDGE_PX = 64, NUDGE_MS = 650;

/**
 * The first time the rail is mostly on screen, it slides a little to the left and back,
 * once, so it reads as something that moves. Not when the visitor prefers less motion,
 * has already touched it, or it fits.
 */
export function nudgeOnce(el: HTMLElement): () => void {
    if (typeof IntersectionObserver === 'undefined' || prefersReducedMotion()) return () => {};
    let visible = false, done = false, touched = false;
    const timers: number[] = [];
    const stop = () => {
        done = true;
        seen.disconnect();
        items?.disconnect();
    };
    const touch = () => { touched = true; stop(); };
    // The rail is often on screen before its tags arrive, so this is tried again whenever
    // it comes into view or its items change, until it has run or the visitor touched it.
    const tryNudge = () => {
        if (done || !visible || el.scrollLeft > 0 || el.scrollWidth <= el.clientWidth + 1) return;
        stop();
        // Snapping would hold the rail on the first tag instead of letting it slide.
        el.style.scrollSnapType = 'none';
        el.scrollTo({ left: NUDGE_PX, behavior: 'smooth' });
        timers.push(window.setTimeout(() => {
            if (!touched) el.scrollTo({ left: 0, behavior: 'smooth' });
            timers.push(window.setTimeout(() => { el.style.scrollSnapType = ''; }, NUDGE_MS));
        }, NUDGE_MS));
    };
    const seen = new IntersectionObserver(([entry]) => {
        visible = !!entry?.isIntersecting;
        tryNudge();
    }, { threshold: 0.75 });
    seen.observe(el);
    const items = typeof MutationObserver === 'undefined' ? null : new MutationObserver(tryNudge);
    items?.observe(el, { childList: true });
    el.addEventListener('pointerdown', touch);
    el.addEventListener('wheel', touch, { passive: true });
    return () => {
        stop();
        timers.forEach(clearTimeout);
        el.removeEventListener('pointerdown', touch);
        el.removeEventListener('wheel', touch);
    };
}

/**
 * Everything above on a ref'd rail for as long as it is mounted. Returns which edges hide
 * items, `page` to move one screen's worth either way, and `toStart` to go back to the
 * first item.
 */
export function useScrollRail(ref: RefObject<HTMLElement | null>) {
    const [edges, setEdges] = useState<RailEdges>({ before: false, after: false });
    useEffect(() => {
        const el = ref.current;
        if (!el) return;
        const stops = [dragScroll(el), railEdges(el, setEdges), nudgeOnce(el)];
        return () => stops.forEach(stop => stop());
    }, [ref]);
    const page = useCallback((dir: 1 | -1) => {
        const el = ref.current;
        el?.scrollBy({ left: dir * el.clientWidth * 0.75, behavior: 'smooth' });
    }, [ref]);
    const toStart = useCallback(() => ref.current?.scrollTo({ left: 0, behavior: 'smooth' }), [ref]);
    return { ...edges, page, toStart };
}
