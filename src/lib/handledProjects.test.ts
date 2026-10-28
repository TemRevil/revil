import { describe, expect, it } from 'vitest';
import { handledProjectsMirror, sameMirror } from './handledProjects';

describe('handledProjectsMirror', () => {
    it('publishes only name, status and order of the work still in hand', () => {
        const mirror = handledProjectsMirror({
            a: { name: 'Shop', status: 'active', order: 2, priceAmount: 900, notes: 'budget is tight', client: 'Acme' },
            b: { name: 'App', status: 'live', order: 0, paidAmount: 100 },
            c: { name: 'Old', status: 'completed', order: 1 },
            d: { name: 'Stalled', status: 'paused', order: 3 },
            e: { name: 'Gone', status: 'closed', order: 4, closedReason: 'never paid' },
            f: { name: 'Next', status: 'pending', order: 5 },
        });
        expect(mirror).toEqual({
            b: { name: 'App', status: 'live', order: 0 },
            a: { name: 'Shop', status: 'active', order: 1 },
            f: { name: 'Next', status: 'pending', order: 2 },
        });
    });

    it('reads legacy rows the way the dashboard does', () => {
        const mirror = handledProjectsMirror({
            x: { name: 'Done long ago', done: true, status: 'active', order: 0 },
            y: { name: 'No status', order: 1 },
            z: { name: 'Odd status', status: 'whatever' },
        });
        // `done` wins over an unfinished status; a missing or unknown status reads as
        // active; a missing order falls back to the row's position.
        expect(mirror).toEqual({
            y: { name: 'No status', status: 'active', order: 0 },
            z: { name: 'Odd status', status: 'active', order: 1 },
        });
    });

    it('survives junk', () => {
        expect(handledProjectsMirror(undefined)).toEqual({});
        expect(handledProjectsMirror({ a: null, b: 'x', c: { status: 'live' } })).toEqual({
            c: { name: '', status: 'live', order: 0 },
        });
    });
});

describe('sameMirror', () => {
    it('compares regardless of key order', () => {
        const a = { p: { name: 'A', status: 'live', order: 0 }, q: { name: 'B', status: 'active', order: 1 } };
        const b = { q: { name: 'B', status: 'active', order: 1 }, p: { name: 'A', status: 'live', order: 0 } };
        expect(sameMirror(a, b)).toBe(true);
        expect(sameMirror(a, { p: a.p })).toBe(false);
        expect(sameMirror(a, { ...a, p: { ...a.p, name: 'C' } })).toBe(false);
    });
});
