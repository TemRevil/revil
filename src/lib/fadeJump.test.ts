// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { fadeJump } from './fadeJump';

type Step = { frames: Keyframe[]; resolve: () => void; cancelled: boolean };

// jsdom has no Web Animations: a stand-in whose `finished` the test resolves by hand.
function animatable() {
    const el = document.createElement('div');
    const steps: Step[] = [];
    el.animate = ((frames: Keyframe[]) => {
        let resolve = () => { };
        let reject = (_: unknown) => { };
        const finished = new Promise<void>((res, rej) => { resolve = res; reject = rej; });
        finished.catch(() => { });
        const step: Step = { frames, resolve, cancelled: false };
        steps.push(step);
        return { finished, cancel: () => { step.cancelled = true; reject(new Error('cancelled')); } } as unknown as Animation;
    }) as typeof el.animate;
    return { el, steps };
}

// jsdom has no matchMedia either.
const motion = (reduce: boolean) =>
    vi.stubGlobal('matchMedia', () => ({ matches: reduce }) as MediaQueryList);

const settle = () => new Promise(r => setTimeout(r, 0));

describe('fadeJump', () => {
    afterEach(() => vi.unstubAllGlobals());

    it('fades out, jumps, then fades back in', async () => {
        motion(false);
        const { el, steps } = animatable();
        const jump = vi.fn();
        fadeJump(el, jump);
        expect(steps[0].frames).toEqual([{ opacity: 1 }, { opacity: 0 }]);
        expect(jump).not.toHaveBeenCalled();
        steps[0].resolve();
        await settle();
        expect(jump).toHaveBeenCalledOnce();
        expect(steps[1].frames).toEqual([{ opacity: 0 }, { opacity: 1 }]);
    });

    it('only jumps with reduced motion', () => {
        motion(true);
        const { el, steps } = animatable();
        const jump = vi.fn();
        fadeJump(el, jump);
        expect(jump).toHaveBeenCalledOnce();
        expect(steps).toHaveLength(0);
    });

    it('only jumps without Web Animations', () => {
        motion(false);
        const jump = vi.fn();
        fadeJump(document.createElement('div'), jump);
        expect(jump).toHaveBeenCalledOnce();
    });

    it('a second move drops the first, which never jumps', async () => {
        motion(false);
        const { el, steps } = animatable();
        const first = vi.fn();
        const second = vi.fn();
        fadeJump(el, first);
        fadeJump(el, second);
        expect(steps[0].cancelled).toBe(true);
        steps[0].resolve();
        steps[1].resolve();
        await settle();
        expect(first).not.toHaveBeenCalled();
        expect(second).toHaveBeenCalledOnce();
    });
});
