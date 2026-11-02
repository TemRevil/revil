import { prefersReducedMotion } from './device';

/** Each half of the fade: out, then in (0.4s in all). */
export const FADE_HALF = 200;

let running: (() => void) | null = null;

/**
 * A move to another part of the page as a plain fade: `el` fades out, `jump` puts the page
 * there at once (no smooth scroll), and `el` fades back in. Only opacity moves, so the
 * compositor draws it. With reduced motion, or no Web Animations, it is just the jump. A
 * second move while one runs drops the first one's fade and starts its own.
 */
export function fadeJump(el: HTMLElement | null | undefined, jump: () => void) {
    running?.();
    running = null;
    if (!el || typeof el.animate !== 'function' || prefersReducedMotion()) { jump(); return; }

    let live = true;
    const out = el.animate([{ opacity: 1 }, { opacity: 0 }], { duration: FADE_HALF, easing: 'ease-in', fill: 'forwards' });
    let back: Animation | null = null;
    running = () => { live = false; out.cancel(); back?.cancel(); };
    out.finished.then(() => {
        if (!live) return;
        jump();
        back = el.animate([{ opacity: 0 }, { opacity: 1 }], { duration: FADE_HALF, easing: 'ease-out' });
        out.cancel();
        return back.finished;
    }).then(() => {
        if (live) running = null;
    }).catch(() => { /* replaced by a newer move */ });
}
