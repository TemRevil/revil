import { useEffect, type RefObject } from 'react';

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

/** dragScroll on a ref'd element for as long as it is mounted. */
export function useDragScroll(ref: RefObject<HTMLElement | null>) {
    useEffect(() => {
        const el = ref.current;
        return el ? dragScroll(el) : undefined;
    }, [ref]);
}
