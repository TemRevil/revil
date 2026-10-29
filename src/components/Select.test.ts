// @vitest-environment jsdom
import { act, createElement, useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import Select from './Select';
import { useDialog } from './dialog';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
// jsdom has no layout, so no element scrolling; the list's centring is a no-op here.
if (!Element.prototype.scrollTo) Element.prototype.scrollTo = () => { };

const OPTIONS = [
    { value: 'am', label: 'AM' },
    { value: 'noon', label: 'Noon', disabled: true },
    { value: 'pm', label: 'PM' },
];

function Modal({ onClose }: { onClose: () => void }) {
    const [v, setV] = useState('am');
    const { dialogProps } = useDialog({ onClose, labelledBy: 'm-title' });
    return createElement('div', dialogProps,
        createElement('h2', { id: 'm-title' }, 'Pick'),
        createElement(Select, { value: v, onChange: setV, options: OPTIONS, isDark: false, 'aria-label': 'Period' }),
        createElement('output', { id: 'out' }, v),
    );
}

let root: Root | null = null;
afterEach(() => { act(() => root?.unmount()); root = null; document.body.innerHTML = ''; });

const press = (el: Element, key: string, init: KeyboardEventInit = {}) => {
    const e = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...init });
    act(() => { el.dispatchEvent(e); });
    return e;
};

describe('Select inside a dialog', () => {
    it('is a keyboard listbox whose Escape closes only the list', () => {
        const onClose = vi.fn();
        const host = document.createElement('div');
        document.body.appendChild(host);
        root = createRoot(host);
        act(() => root!.render(createElement(Modal, { onClose })));

        const trigger = document.querySelector('[role="combobox"]') as HTMLButtonElement;
        trigger.focus();
        expect(trigger.getAttribute('aria-expanded')).toBe('false');

        press(trigger, 'ArrowDown');
        expect(trigger.getAttribute('aria-expanded')).toBe('true');
        const listbox = document.getElementById(trigger.getAttribute('aria-controls')!)!;
        expect(listbox.getAttribute('role')).toBe('listbox');
        const activeId = () => trigger.getAttribute('aria-activedescendant');
        expect(document.getElementById(activeId()!)?.textContent).toBe('AM');

        // The disabled "Noon" is stepped over.
        press(trigger, 'ArrowDown');
        expect(document.getElementById(activeId()!)?.textContent).toBe('PM');

        // Escape closes the list; the dialog around it stays open.
        const esc = press(trigger, 'Escape');
        expect(esc.defaultPrevented).toBe(true);
        expect(trigger.getAttribute('aria-expanded')).toBe('false');
        expect(onClose).not.toHaveBeenCalled();
        expect(document.activeElement).toBe(trigger);

        // Enter opens, End jumps, Enter chooses and keeps focus on the trigger.
        press(trigger, 'Enter');
        press(trigger, 'End');
        press(trigger, 'Enter');
        expect(document.getElementById('out')?.textContent).toBe('pm');
        expect(trigger.getAttribute('aria-expanded')).toBe('false');
        expect(document.activeElement).toBe(trigger);

        // With the list closed, Escape belongs to the dialog again.
        press(trigger, 'Escape');
        expect(onClose).toHaveBeenCalledTimes(1);
    });
});
