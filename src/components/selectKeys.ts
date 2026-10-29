/**
 * Keyboard rules for <Select>, kept apart from the component so they can be tested on
 * their own. It follows the ARIA "select-only combobox" pattern: focus stays on the
 * trigger (or the filter box), the list shows which option is active, and keys move that
 * active option. Disabled options are skipped but stay in the list.
 */

export interface KeyOption {
    label: string;
    disabled?: boolean;
}

/** How far PageUp / PageDown jump. */
export const PAGE = 10;

/** The next enabled option from `from` going `step` (clamped, never wraps), or `from` when there is none. */
export function stepEnabled(opts: KeyOption[], from: number, step: number): number {
    const dir = step < 0 ? -1 : 1;
    let best = from;
    let i = from;
    for (let left = Math.abs(step); ;) {
        i += dir;
        if (i < 0 || i >= opts.length) break;
        if (opts[i].disabled) continue;
        best = i;
        if (--left <= 0) break;
    }
    return best;
}

export const firstEnabled = (opts: KeyOption[]) => opts.findIndex(o => !o.disabled);

export function lastEnabled(opts: KeyOption[]): number {
    for (let i = opts.length - 1; i >= 0; i--) if (!opts[i].disabled) return i;
    return -1;
}

/**
 * Type-to-find: the first enabled option after `from` whose label starts with `text`,
 * searching round the list. Typing one letter again and again cycles through the
 * options starting with it.
 */
export function typeahead(opts: KeyOption[], from: number, text: string): number {
    if (!text || !opts.length) return -1;
    const needle = text.toLowerCase();
    const same = [...needle].every(ch => ch === needle[0]);
    // Repeating one letter cycles; a longer word keeps the current option if it still fits.
    const search = same && needle.length > 1 ? needle[0] : needle;
    const startAt = same ? from + 1 : Math.max(from, 0);
    for (let k = 0; k < opts.length; k++) {
        const i = (startAt + k + opts.length) % opts.length;
        if (!opts[i].disabled && opts[i].label.toLowerCase().startsWith(search)) return i;
    }
    return -1;
}

export type KeyAction =
    /** Open the list with this option active. */
    | { kind: 'open'; active: number }
    /** Make this option active (the list is already open). */
    | { kind: 'move'; active: number }
    /** Choose this option (or nothing, when -1) and close; focus stays on the trigger. */
    | { kind: 'choose'; index: number }
    /** Close without choosing. */
    | { kind: 'close' }
    /** Choose the active option (if any) and close, letting Tab move focus on as usual. */
    | { kind: 'tab'; index: number }
    /** A printable character for type-to-find. */
    | { kind: 'find'; char: string };

export interface KeyInput {
    key: string;
    altKey?: boolean;
    ctrlKey?: boolean;
    metaKey?: boolean;
}

/**
 * What a key does. `typing` is true when focus is in the filter box, where Space, Home,
 * End and letters belong to the text. Returns null for keys Select leaves alone.
 */
export function keyAction(
    e: KeyInput,
    state: { open: boolean; active: number; selected: number; typing: boolean },
    opts: KeyOption[],
): KeyAction | null {
    const { open, active, selected, typing } = state;
    const start = selected >= 0 && !opts[selected]?.disabled ? selected : firstEnabled(opts);
    const printable = e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey;

    if (!open) {
        if (e.key === 'ArrowDown' || e.key === 'ArrowUp' || e.key === 'Enter' || e.key === ' ') {
            return { kind: 'open', active: start };
        }
        if (e.key === 'Home') return { kind: 'open', active: firstEnabled(opts) };
        if (e.key === 'End') return { kind: 'open', active: lastEnabled(opts) };
        if (printable && !typing) return { kind: 'find', char: e.key };
        return null;
    }

    switch (e.key) {
        case 'ArrowDown':
            return { kind: 'move', active: active < 0 ? firstEnabled(opts) : stepEnabled(opts, active, 1) };
        case 'ArrowUp':
            if (e.altKey) return { kind: 'choose', index: active };
            return { kind: 'move', active: active < 0 ? lastEnabled(opts) : stepEnabled(opts, active, -1) };
        case 'PageDown':
            return { kind: 'move', active: stepEnabled(opts, active < 0 ? -1 : active, PAGE) };
        case 'PageUp':
            return { kind: 'move', active: stepEnabled(opts, active < 0 ? opts.length : active, -PAGE) };
        case 'Home':
            return typing ? null : { kind: 'move', active: firstEnabled(opts) };
        case 'End':
            return typing ? null : { kind: 'move', active: lastEnabled(opts) };
        case 'Enter':
            return { kind: 'choose', index: active };
        case ' ':
            return typing ? null : { kind: 'choose', index: active };
        case 'Escape':
            return { kind: 'close' };
        case 'Tab':
            return { kind: 'tab', index: active };
        default:
            return printable && !typing ? { kind: 'find', char: e.key } : null;
    }
}
