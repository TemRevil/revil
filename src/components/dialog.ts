import { useEffect, useRef, type RefObject } from 'react';

/**
 * The one way a modal behaves, for every modal on the site:
 *  - it is announced as a modal dialog, named by its title (`labelledBy`);
 *  - focus moves into it when it opens, and Tab / Shift+Tab stay inside it;
 *  - Escape closes it (only the top one, when one opens over another);
 *  - focus goes back to what had it (usually the button that opened it) when it closes.
 *
 * Spread `dialogProps` on the dialog's own panel. A control inside that handles Escape
 * or Tab itself (an open listbox, the time picker) calls preventDefault and is left to it.
 */

const FOCUSABLE = [
    'a[href]', 'area[href]', 'button:not([disabled])', 'input:not([disabled]):not([type="hidden"])',
    'select:not([disabled])', 'textarea:not([disabled])', 'iframe', 'audio[controls]', 'video[controls]',
    '[contenteditable]:not([contenteditable="false"])', '[tabindex]:not([tabindex="-1"])',
].join(',');

/** The elements Tab can reach inside `root`, in order. */
export function focusablesIn(root: HTMLElement): HTMLElement[] {
    return [...root.querySelectorAll<HTMLElement>(FOCUSABLE)].filter((el) => {
        if (el.closest('[inert]') || el.getAttribute('aria-hidden') === 'true') return false;
        // Not drawn (display:none, or inside a hidden part) means not reachable.
        return typeof el.checkVisibility === 'function' ? el.checkVisibility() : true;
    });
}

/**
 * Where Tab should go to stay inside the dialog, or null to let the browser move
 * focus as usual (it is somewhere in the middle).
 */
export function trapTarget<T>(focusables: T[], active: T | null, backwards: boolean, outside: boolean): T | 'self' | null {
    if (!focusables.length) return 'self';
    const first = focusables[0], last = focusables[focusables.length - 1];
    if (outside) return backwards ? last : first;
    if (backwards && active === first) return last;
    if (!backwards && active === last) return first;
    return null;
}

/** Open dialogs, oldest first: only the last one answers Escape and keeps Tab. */
const stack: symbol[] = [];

export function useDialog<T extends HTMLElement = HTMLDivElement>({ onClose, labelledBy, active = true }: {
    onClose: () => void;
    /** The id of the dialog's visible title. */
    labelledBy: string;
    /** False while the dialog is only drawn hidden (a warm-up): it then takes no focus or keys. */
    active?: boolean;
}): { ref: RefObject<T | null>; dialogProps: { ref: RefObject<T | null>; role: 'dialog'; 'aria-modal': true; 'aria-labelledby': string; tabIndex: -1 } } {
    const ref = useRef<T | null>(null);
    const close = useRef(onClose);
    useEffect(() => { close.current = onClose; }, [onClose]);

    useEffect(() => {
        if (!active) return;
        const id = Symbol('dialog');
        stack.push(id);
        const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;

        // Into the dialog: what asks for it ([data-autofocus]), else the dialog itself, so a
        // phone's keyboard doesn't jump up over a form the reader hasn't reached yet.
        const root = ref.current;
        const wanted = root?.querySelector<HTMLElement>('[data-autofocus]');
        (wanted ?? root)?.focus({ preventScroll: true });

        const onKey = (e: KeyboardEvent) => {
            if (stack[stack.length - 1] !== id || e.defaultPrevented) return;
            const box = ref.current;
            if (!box) return;
            if (e.key === 'Escape') {
                e.preventDefault();
                close.current();
                return;
            }
            if (e.key !== 'Tab') return;
            const list = focusablesIn(box);
            const now = document.activeElement as HTMLElement | null;
            const outside = !now || !box.contains(now) || now === box;
            const to = trapTarget(list, now, e.shiftKey, outside);
            if (to === null) return;
            e.preventDefault();
            (to === 'self' ? box : to).focus();
        };
        document.addEventListener('keydown', onKey);

        return () => {
            document.removeEventListener('keydown', onKey);
            const at = stack.indexOf(id);
            if (at >= 0) stack.splice(at, 1);
            // Back where the reader was, if that is still on the page.
            if (opener && opener.isConnected) opener.focus({ preventScroll: true });
        };
    }, [active]);

    return { ref, dialogProps: { ref, role: 'dialog', 'aria-modal': true, 'aria-labelledby': labelledBy, tabIndex: -1 } };
}
