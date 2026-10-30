import { prefersReducedMotion } from './device';

/** How long the pen takes to travel one em of ink (ms). */
export const MS_PER_EM = 55;
/** The pen lifted and set down again between two strokes (ms). */
export const LIFT = 35;
/** The pause between two words (ms). */
export const WORD = 150;
/** Even a dot takes this long (ms). */
const MIN_STROKE = 60;
/** A character the pen can't write (see lib/pen) fades in for this long (ms). */
const TEXT = 180;

export type PenStep = { kind: 'stroke'; length: number } | { kind: 'text' } | { kind: 'space' };

/**
 * When each step starts and how long it takes: strokes one after another at a steady pen
 * speed, so a long stroke takes longer than a short one, with the pen lifting between
 * strokes and pausing between words. `pace` 2 writes twice as fast.
 */
export function penTimes(steps: PenStep[], start = 0, pace = 1) {
    let at = start;
    return steps.map((step, i) => {
        if (step.kind === 'space') { at += WORD / pace; return { delay: at, duration: 0 }; }
        if (i > 0 && steps[i - 1].kind !== 'space') at += LIFT / pace;
        const duration = (step.kind === 'text' ? TEXT : Math.max(MIN_STROKE, step.length * MS_PER_EM)) / pace;
        const time = { delay: at, duration };
        at += duration;
        return time;
    });
}

/**
 * Writes the handwriting in `root` (ui/Handwriting) in by pen, stroke after stroke, in
 * the order a hand makes them. With reduced motion the words are just there. `show`
 * lifts an `opacity: 0` the label waited behind; `pace` 2 writes twice as fast. Returns
 * the animations, to cancel on cleanup.
 */
export function handwrite(root: Element | null | undefined, { delay = 0, show = false, pace = 1 } = {}): Animation[] {
    if (!root) return [];
    if (show) (root as HTMLElement).style.opacity = '1';
    if (prefersReducedMotion()) return [];
    const nodes = [...root.querySelectorAll<SVGElement>('[data-pen], [data-pen-text], [data-pen-space]')];
    const steps: PenStep[] = nodes.map(n => n.hasAttribute('data-pen')
        ? { kind: 'stroke', length: Number(n.getAttribute('data-pen')) }
        : n.hasAttribute('data-pen-text') ? { kind: 'text' } : { kind: 'space' });
    const times = penTimes(steps, delay, pace);
    return nodes.flatMap((n, i) => {
        const { delay: at, duration } = times[i];
        if (steps[i].kind === 'space') return [];
        if (steps[i].kind === 'text') return [n.animate([{ opacity: 0 }, { opacity: 1 }], { duration, delay: at, fill: 'backwards' })];
        // pathLength is 1: the dash is the whole stroke, pulled out from where the pen starts.
        return [n.animate(
            [{ strokeDasharray: '1 2', strokeDashoffset: 1.02 }, { strokeDasharray: '1 2', strokeDashoffset: 0 }],
            { duration, delay: at, easing: 'cubic-bezier(.4,0,.4,1)', fill: 'backwards' },
        )];
    });
}
