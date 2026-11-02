// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

// The curtain itself is the homepage's (WAAPI, which jsdom lacks); here it only reports what it was asked.
type CurtainProps = { isTransitioning: boolean; onCurtainMoving: () => void; onTransitionComplete: () => void; nextSectionName?: string; direction?: number };
let curtain: CurtainProps | null = null;
vi.mock('../home/PageTransition', () => ({ default: (p: CurtainProps) => { curtain = p; return null; } }));

const { default: Contents } = await import('./Contents');

const ITEMS = [{ id: 'one', title: 'First part' }, { id: 'two', title: 'Second part' }];
let root: Root | null = null;
const scrollTo = vi.fn();

beforeEach(() => {
    curtain = null;
    scrollTo.mockReset();
    vi.stubGlobal('scrollTo', scrollTo);
    vi.stubGlobal('matchMedia', () => ({ matches: false }));
    document.body.innerHTML = '<h2 id="one" tabindex="-1">First part</h2><h2 id="two" tabindex="-1">Second part</h2><div id="host"></div>';
    // The second section sits 600px down the window.
    document.getElementById('two')!.getBoundingClientRect = () => ({ top: 600 }) as DOMRect;
    root = createRoot(document.getElementById('host')!);
    act(() => root!.render(createElement(Contents, { items: ITEMS })));
});
afterEach(() => {
    act(() => root?.unmount());
    root = null;
    document.documentElement.removeAttribute('data-lite');
    vi.unstubAllGlobals();
});

const click = (title: string) => act(() => {
    const link = [...document.querySelectorAll('a')].find(a => a.textContent === title)!;
    link.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, button: 0 }));
});

describe('Contents jumps', () => {
    it('jumps to the section only under the curtain, which writes its name', () => {
        click('Second part');
        expect(scrollTo).not.toHaveBeenCalled();
        expect(curtain).toMatchObject({ isTransitioning: true, nextSectionName: 'Second part', direction: 1 });

        act(() => curtain!.onCurtainMoving());
        expect(scrollTo).toHaveBeenCalledWith({ top: 600 - 88, behavior: 'instant' });
        expect(document.activeElement?.id).toBe('two');

        act(() => curtain!.onTransitionComplete());
        expect(curtain!.isTransitioning).toBe(false);
    });

    it('ignores another link while the curtain is down', () => {
        click('Second part');
        click('First part');
        expect(curtain!.nextSectionName).toBe('Second part');
    });

    it('glides there on phones (lite), with no curtain', () => {
        document.documentElement.setAttribute('data-lite', '');
        click('Second part');
        expect(curtain!.isTransitioning).toBe(false);
        expect(scrollTo).toHaveBeenCalledWith({ top: 600 - 88, behavior: 'smooth' });
        expect(document.activeElement?.id).toBe('two');
    });
});
