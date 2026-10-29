import { describe, expect, it } from 'vitest';
import { firstEnabled, keyAction, lastEnabled, stepEnabled, typeahead, type KeyOption } from './selectKeys';

const opts: KeyOption[] = [
    { label: 'Apple', disabled: true },
    { label: 'Banana' },
    { label: 'Blueberry' },
    { label: 'Cherry', disabled: true },
    { label: 'Date' },
    { label: 'Elderberry', disabled: true },
];
const closed = { open: false, active: -1, selected: 2, typing: false };
const openAt = (active: number, typing = false) => ({ open: true, active, selected: 2, typing });

describe('stepping over disabled options', () => {
    it('skips disabled rows and stops at the ends', () => {
        expect(firstEnabled(opts)).toBe(1);
        expect(lastEnabled(opts)).toBe(4);
        expect(stepEnabled(opts, 2, 1)).toBe(4);
        expect(stepEnabled(opts, 4, 1)).toBe(4);
        expect(stepEnabled(opts, 1, -1)).toBe(1);
        expect(stepEnabled(opts, -1, 10)).toBe(4);
        expect(stepEnabled(opts, opts.length, -10)).toBe(1);
    });
});

describe('typeahead', () => {
    it('finds by prefix, cycles on a repeated letter, and skips disabled rows', () => {
        expect(typeahead(opts, -1, 'b')).toBe(1);
        expect(typeahead(opts, 1, 'b')).toBe(2);
        expect(typeahead(opts, 2, 'bb')).toBe(1);
        expect(typeahead(opts, 1, 'bl')).toBe(2);
        expect(typeahead(opts, 1, 'ba')).toBe(1);
        expect(typeahead(opts, 1, 'c')).toBe(-1);
        expect(typeahead(opts, 1, 'a')).toBe(-1);
    });
});

describe('keyAction', () => {
    it('opens on the chosen option from the closed trigger', () => {
        for (const key of ['ArrowDown', 'ArrowUp', 'Enter', ' ']) {
            expect(keyAction({ key }, closed, opts)).toEqual({ kind: 'open', active: 2 });
        }
        expect(keyAction({ key: 'Home' }, closed, opts)).toEqual({ kind: 'open', active: 1 });
        expect(keyAction({ key: 'End' }, closed, opts)).toEqual({ kind: 'open', active: 4 });
        expect(keyAction({ key: 'd' }, closed, opts)).toEqual({ kind: 'find', char: 'd' });
        expect(keyAction({ key: 'Escape' }, closed, opts)).toBeNull();
        expect(keyAction({ key: 'Tab' }, closed, opts)).toBeNull();
        expect(keyAction({ key: 'c', ctrlKey: true }, closed, opts)).toBeNull();
    });

    it('moves, chooses and closes while open', () => {
        expect(keyAction({ key: 'ArrowDown' }, openAt(2), opts)).toEqual({ kind: 'move', active: 4 });
        expect(keyAction({ key: 'ArrowUp' }, openAt(2), opts)).toEqual({ kind: 'move', active: 1 });
        expect(keyAction({ key: 'Home' }, openAt(4), opts)).toEqual({ kind: 'move', active: 1 });
        expect(keyAction({ key: 'End' }, openAt(1), opts)).toEqual({ kind: 'move', active: 4 });
        expect(keyAction({ key: 'PageDown' }, openAt(1), opts)).toEqual({ kind: 'move', active: 4 });
        expect(keyAction({ key: 'PageUp' }, openAt(4), opts)).toEqual({ kind: 'move', active: 1 });
        expect(keyAction({ key: 'Enter' }, openAt(4), opts)).toEqual({ kind: 'choose', index: 4 });
        expect(keyAction({ key: ' ' }, openAt(4), opts)).toEqual({ kind: 'choose', index: 4 });
        expect(keyAction({ key: 'ArrowUp', altKey: true }, openAt(4), opts)).toEqual({ kind: 'choose', index: 4 });
        expect(keyAction({ key: 'Escape' }, openAt(4), opts)).toEqual({ kind: 'close' });
        expect(keyAction({ key: 'Tab' }, openAt(4), opts)).toEqual({ kind: 'tab', index: 4 });
    });

    it('leaves text keys to the filter box', () => {
        expect(keyAction({ key: ' ' }, openAt(1, true), opts)).toBeNull();
        expect(keyAction({ key: 'Home' }, openAt(1, true), opts)).toBeNull();
        expect(keyAction({ key: 'b' }, openAt(1, true), opts)).toBeNull();
        expect(keyAction({ key: 'ArrowDown' }, openAt(1, true), opts)).toEqual({ kind: 'move', active: 2 });
        expect(keyAction({ key: 'Escape' }, openAt(1, true), opts)).toEqual({ kind: 'close' });
    });
});
