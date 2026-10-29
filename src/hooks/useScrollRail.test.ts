// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { dragScroll, nudgeOnce, railEdges } from './useScrollRail';

// jsdom has no layout: give the rail a size, an overflow and a real scrollLeft.
function rail(scrollWidth = 1000, clientWidth = 300) {
    const el = document.createElement('div');
    const button = document.createElement('button');
    el.appendChild(button);
    document.body.appendChild(el);
    Object.defineProperty(el, 'scrollWidth', { value: scrollWidth });
    Object.defineProperty(el, 'clientWidth', { value: clientWidth });
    let left = 0;
    Object.defineProperty(el, 'scrollLeft', { get: () => left, set: (v: number) => { left = Math.max(0, Math.min(v, scrollWidth - clientWidth)); } });
    return { el, button, stop: dragScroll(el) };
}

const pointer = (type: string, clientX: number, pointerType = 'mouse') =>
    Object.assign(new MouseEvent(type, { bubbles: true, clientX, button: 0 }), { pointerType, pointerId: 1 });

afterEach(() => { document.body.innerHTML = ''; });

describe('dragScroll', () => {
    it('scrolls the rail with a mouse drag and swallows the click that ends it', () => {
        const { el, button } = rail();
        const onClick = vi.fn();
        button.addEventListener('click', onClick);
        button.dispatchEvent(pointer('pointerdown', 200));
        button.dispatchEvent(pointer('pointermove', 150));
        button.dispatchEvent(pointer('pointermove', 80));
        button.dispatchEvent(pointer('pointerup', 80));
        button.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        expect(el.scrollLeft).toBe(120);
        expect(onClick).not.toHaveBeenCalled();
        // The next plain click goes through.
        button.dispatchEvent(pointer('pointerdown', 80));
        button.dispatchEvent(pointer('pointerup', 81));
        button.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        expect(onClick).toHaveBeenCalledTimes(1);
    });

    it('leaves touch to the browser', () => {
        const { el } = rail();
        el.dispatchEvent(pointer('pointerdown', 200, 'touch'));
        el.dispatchEvent(pointer('pointermove', 100, 'touch'));
        expect(el.scrollLeft).toBe(0);
    });

    it('turns a vertical wheel into a sideways scroll, and lets the page scroll at the ends', () => {
        const { el } = rail();
        const down = new WheelEvent('wheel', { deltaY: 100, cancelable: true });
        el.dispatchEvent(down);
        expect(el.scrollLeft).toBe(100);
        expect(down.defaultPrevented).toBe(true);
        const up = new WheelEvent('wheel', { deltaY: -300, cancelable: true });
        el.dispatchEvent(up);
        expect(el.scrollLeft).toBe(0);
        const atStart = new WheelEvent('wheel', { deltaY: -100, cancelable: true });
        el.dispatchEvent(atStart);
        expect(atStart.defaultPrevented).toBe(false);
    });

    it('does nothing while the rail fits', () => {
        const { el } = rail(300, 300);
        const wheel = new WheelEvent('wheel', { deltaY: 100, cancelable: true });
        el.dispatchEvent(wheel);
        el.dispatchEvent(pointer('pointerdown', 200));
        el.dispatchEvent(pointer('pointermove', 100));
        expect(wheel.defaultPrevented).toBe(false);
        expect(el.scrollLeft).toBe(0);
    });
});

describe('railEdges', () => {
    it('reports which ends still hide items as the rail scrolls, once per change', () => {
        const { el } = rail();
        const seen: string[] = [];
        railEdges(el, e => seen.push(`${e.before ? '<' : '-'}${e.after ? '>' : '-'}`));
        el.scrollLeft = 300;
        el.dispatchEvent(new Event('scroll'));
        el.scrollLeft = 350;
        el.dispatchEvent(new Event('scroll'));
        el.scrollLeft = 700;
        el.dispatchEvent(new Event('scroll'));
        el.scrollLeft = 0;
        el.dispatchEvent(new Event('scroll'));
        expect(seen).toEqual(['->', '<>', '<-', '->']);
    });

    it('shows no hidden ends while the rail fits', () => {
        const { el } = rail(300, 300);
        const onChange = vi.fn();
        railEdges(el, onChange);
        expect(onChange).toHaveBeenCalledWith({ before: false, after: false });
    });
});

describe('nudgeOnce', () => {
    it('waits for the tags when the rail is on screen before they arrive, then slides once', async () => {
        // jsdom has no IntersectionObserver or matchMedia: report the rail as on screen.
        let fire: (entries: { isIntersecting: boolean }[]) => void = () => {};
        vi.stubGlobal('IntersectionObserver', class { constructor(cb: typeof fire) { fire = cb; } observe() {} disconnect() {} });
        vi.stubGlobal('matchMedia', () => ({ matches: false }));
        const el = document.createElement('div');
        document.body.appendChild(el);
        let width = 300;
        Object.defineProperty(el, 'scrollWidth', { get: () => width });
        Object.defineProperty(el, 'clientWidth', { value: 300 });
        Object.defineProperty(el, 'scrollLeft', { value: 0 });
        const scrollTo = vi.fn();
        el.scrollTo = scrollTo as unknown as typeof el.scrollTo;
        nudgeOnce(el);
        fire([{ isIntersecting: true }]);
        expect(scrollTo).not.toHaveBeenCalled();
        width = 1000;
        el.appendChild(document.createElement('button'));
        await new Promise(r => setTimeout(r, 0));
        expect(scrollTo).toHaveBeenCalledTimes(1);
        el.appendChild(document.createElement('button'));
        await new Promise(r => setTimeout(r, 0));
        expect(scrollTo).toHaveBeenCalledTimes(1);
        vi.unstubAllGlobals();
    });
});
