import { prefersReducedMotion } from './device';

/** How long the pen takes to cross one em of ink (ms): calm, a little slower than a quick hand. */
export const MS_PER_EM = 300;
/** The pen lifted between two words (ms). */
export const LIFT = 110;
/** Even the thinnest letter takes this long (ms). */
const MIN_STROKE = 70;

/**
 * When each letter starts and how long its ink takes: one after another at a steady pen
 * speed, so a wide letter takes longer than a narrow one, and a space is the pen lifting.
 */
export function penTimes(widths: number[], spaces: boolean[], em: number, start = 0) {
    let at = start;
    return widths.map((w, i) => {
        const duration = spaces[i] ? LIFT : Math.max(MIN_STROKE, (w / em) * MS_PER_EM);
        const time = { delay: at, duration };
        at += duration;
        return time;
    });
}

// The ink: solid behind the pen, a soft edge where it is still wet, nothing ahead of it.
const INK = 'linear-gradient(90deg, #000 45%, transparent 55%)';
const frame = (position: string): Keyframe => ({
    maskImage: INK, WebkitMaskImage: INK,
    maskSize: '250% 100%', WebkitMaskSize: '250% 100%',
    maskRepeat: 'no-repeat', WebkitMaskRepeat: 'no-repeat',
    maskPosition: position, WebkitMaskPosition: position,
} as Keyframe);

/**
 * Writes the handwritten text in `root` (its letters are `.ch` spans, see Chars) as a pen
 * would: each letter's ink appears left to right, letter after letter. With reduced
 * motion the text is just there. `show` lifts an `opacity: 0` the label waited behind.
 * Returns the animations, to cancel on cleanup.
 */
export function handwrite(root: HTMLElement | null | undefined, { delay = 0, show = false } = {}): Animation[] {
    if (!root) return [];
    if (show) root.style.opacity = '1';
    if (prefersReducedMotion()) return [];
    const letters = [...root.querySelectorAll<HTMLElement>('.ch')];
    // Measured together, untouched by the rotation the labels carry. The padding that keeps
    // a letter's tails inside its mask is not ink.
    const pad = letters.length ? parseFloat(getComputedStyle(letters[0]).paddingLeft) * 2 : 0;
    const widths = letters.map(l => l.offsetWidth - pad);
    const em = parseFloat(getComputedStyle(root).fontSize) || 16;
    const times = penTimes(widths, letters.map(l => !l.textContent?.trim()), em, delay);
    return letters.map((l, i) => l.animate([frame('100% 0'), frame('0 0')],
        { duration: times[i].duration, delay: times[i].delay, easing: 'linear', fill: 'backwards' }));
}
