// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';

const animate = vi.fn((..._args: unknown[]) => ({ stop: vi.fn() }));
vi.mock('motion/react', () => ({ animate: (...args: unknown[]) => animate(...args) }));

const { enter, EASE_OUT_EXPO, EASE_OUT_QUAD } = await import('./entrance');

const motionPreference = (reduce: boolean) => {
    window.matchMedia = ((q: string) => ({ matches: reduce && q.includes('reduce'), media: q })) as unknown as typeof window.matchMedia;
};

afterEach(() => animate.mockClear());

describe('enter', () => {
    it('fades and travels in, timed in seconds, easing out', () => {
        motionPreference(false);
        const el = document.createElement('div');
        expect(enter(el, { x: -30 }, { duration: 800, delay: 150 })).not.toBeNull();
        expect(animate).toHaveBeenCalledWith(el, { opacity: [0, 1], x: [-30, 0] }, { duration: 0.8, delay: 0.15, ease: [...EASE_OUT_EXPO] });
        enter(el, { y: 20 }, { duration: 800, ease: EASE_OUT_QUAD });
        expect(animate).toHaveBeenLastCalledWith(el, { opacity: [0, 1], y: [20, 0] }, { duration: 0.8, delay: 0, ease: [...EASE_OUT_QUAD] });
        enter(el, { blur: 20 }, { duration: 1200 });
        expect(animate).toHaveBeenLastCalledWith(el, { opacity: [0, 1], filter: ['blur(20px)', 'blur(0px)'] }, { duration: 1.2, delay: 0, ease: [...EASE_OUT_EXPO] });
    });

    it('only fades with reduced motion, and skips a missing element', () => {
        motionPreference(true);
        const el = document.createElement('div');
        enter(el, { x: -20, blur: 20 }, { duration: 600 });
        expect(animate).toHaveBeenCalledWith(el, { opacity: [0, 1] }, { duration: 0.6, delay: 0, ease: [...EASE_OUT_EXPO] });
        expect(enter(null, { y: 10 }, { duration: 600 })).toBeNull();
        expect(animate).toHaveBeenCalledTimes(1);
    });
});
