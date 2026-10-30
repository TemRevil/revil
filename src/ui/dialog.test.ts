// @vitest-environment jsdom
import { act, createElement, useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { trapTarget, useDialog } from './dialog';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

function Modal({ onClose, title = 'Contact' }: { onClose: () => void; title?: string }) {
    const { dialogProps } = useDialog({ onClose, labelledBy: `${title}-title` });
    return createElement('div', { ...dialogProps, 'data-testid': title },
        createElement('h2', { id: `${title}-title` }, title),
        createElement('button', { id: `${title}-a` }, 'A'),
        createElement('input', { id: `${title}-b` }),
        createElement('button', { id: `${title}-c` }, 'C'),
    );
}

function Page({ onClose }: { onClose: () => void }) {
    const [open, setOpen] = useState(false);
    return createElement('div', null,
        createElement('button', { id: 'opener', onClick: () => setOpen(true) }, 'Open'),
        createElement('button', { id: 'shut', onClick: () => setOpen(false) }, 'Shut'),
        open && createElement(Modal, { onClose }),
    );
}

const key = (k: string, shift = false) => {
    const e = new KeyboardEvent('keydown', { key: k, shiftKey: shift, bubbles: true, cancelable: true });
    (document.activeElement ?? document.body).dispatchEvent(e);
    return e;
};

let root: Root | null = null;
afterEach(() => { act(() => root?.unmount()); root = null; document.body.innerHTML = ''; });
function mount(el: ReturnType<typeof createElement>) {
    const host = document.createElement('div');
    document.body.appendChild(host);
    root = createRoot(host);
    act(() => root!.render(el));
}
const $ = (id: string) => document.getElementById(id) as HTMLElement;

describe('trapTarget', () => {
    it('wraps at both ends and pulls focus back in from outside', () => {
        expect(trapTarget(['a', 'b', 'c'], 'c', false, false)).toBe('a');
        expect(trapTarget(['a', 'b', 'c'], 'a', true, false)).toBe('c');
        expect(trapTarget(['a', 'b', 'c'], 'b', false, false)).toBeNull();
        expect(trapTarget(['a', 'b', 'c'], null, false, true)).toBe('a');
        expect(trapTarget([], null, false, true)).toBe('self');
    });
});

describe('useDialog', () => {
    it('is a labelled modal dialog that takes focus and gives it back on close', () => {
        mount(createElement(Page, { onClose: () => { } }));
        $('opener').focus();
        act(() => $('opener').click());
        const dialog = document.querySelector('[role="dialog"]') as HTMLElement;
        expect(dialog.getAttribute('aria-modal')).toBe('true');
        expect(dialog.getAttribute('aria-labelledby')).toBe('Contact-title');
        expect(document.getElementById('Contact-title')?.textContent).toBe('Contact');
        expect(document.activeElement).toBe(dialog);
        act(() => $('shut').click());
        expect(document.activeElement).toBe($('opener'));
    });

    it('keeps Tab and Shift+Tab inside', () => {
        mount(createElement(Modal, { onClose: () => { } }));
        // From the dialog itself, Tab goes to the first control, Shift+Tab to the last.
        expect(key('Tab').defaultPrevented).toBe(true);
        expect(document.activeElement).toBe($('Contact-a'));
        $('Contact-c').focus();
        key('Tab');
        expect(document.activeElement).toBe($('Contact-a'));
        key('Tab', true);
        expect(document.activeElement).toBe($('Contact-c'));
        // In the middle the browser moves focus itself.
        $('Contact-b').focus();
        expect(key('Tab').defaultPrevented).toBe(false);
    });

    it('closes on Escape, the top dialog only, and leaves a handled Escape alone', () => {
        const under = vi.fn(), over = vi.fn();
        mount(createElement('div', null,
            createElement(Modal, { onClose: under, title: 'Under' }),
            createElement(Modal, { onClose: over, title: 'Over' })));
        key('Escape');
        expect(over).toHaveBeenCalledTimes(1);
        expect(under).not.toHaveBeenCalled();

        const listbox = (e: KeyboardEvent) => e.preventDefault();
        document.addEventListener('keydown', listbox, { capture: true });
        key('Escape');
        document.removeEventListener('keydown', listbox, { capture: true });
        expect(over).toHaveBeenCalledTimes(1);
    });
});
