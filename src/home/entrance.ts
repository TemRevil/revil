import { animate, type AnimationPlaybackControls } from 'motion/react';
import { prefersReducedMotion } from '../lib/device';

/** anime.js's easeOutExpo and easeOutQuad as cubic beziers, so the entrances keep their feel. */
export const EASE_OUT_EXPO = [0.16, 1, 0.3, 1] as const;
export const EASE_OUT_QUAD = [0.5, 1, 0.89, 1] as const;

export interface Travel {
    /** Start this far off along x / y (px) and settle at 0. */
    x?: number;
    y?: number;
    /** Start blurred by this much (px) and sharpen. */
    blur?: number;
}

/**
 * A section entrance: fades the element in from opacity 0 while it travels or sharpens
 * into place. With reduced motion only the fade is left. Returns the playback controls
 * (stop() on cleanup), or null when there is no element.
 */
export function enter(
    el: Element | null | undefined,
    travel: Travel,
    { duration, delay = 0, ease = EASE_OUT_EXPO }: { duration: number; delay?: number; ease?: readonly [number, number, number, number] },
): AnimationPlaybackControls | null {
    if (!el) return null;
    const frames: Record<string, [number | string, number | string]> = { opacity: [0, 1] };
    if (!prefersReducedMotion()) {
        if (travel.x) frames.x = [travel.x, 0];
        if (travel.y) frames.y = [travel.y, 0];
        if (travel.blur) frames.filter = [`blur(${travel.blur}px)`, 'blur(0px)'];
    }
    return animate(el, frames, { duration: duration / 1000, delay: delay / 1000, ease: [...ease] });
}
