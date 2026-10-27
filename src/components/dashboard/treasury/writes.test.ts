import { describe, it, expect } from 'vitest';
import { FieldPath, deleteField } from 'firebase/firestore';
import { putEntry, removeEntry, orderWrite, planIncomeSave, type MapWrite } from './writes';

type Doc = Record<string, unknown>;
const DELETE = deleteField();

/**
 * What Firestore does with set(ref, data, { mergeFields }): each listed path is replaced
 * whole by its value in `data` (or removed for deleteField()); every other path is left
 * exactly as stored. lastWrite is a server timestamp and not compared here.
 */
function apply(stored: Doc, w: MapWrite): Doc {
    const out: Doc = structuredClone(stored);
    for (const f of w.mergeFields) {
        const segs = f instanceof FieldPath ? (f as unknown as { _internalPath: { segments: string[] } })._internalPath.segments : String(f).split('.');
        if (segs[0] === 'lastWrite') continue;
        let src: unknown = w.data;
        for (const s of segs) src = (src as Doc)?.[s];
        let dst = out;
        for (const s of segs.slice(0, -1)) dst = (dst[s] ??= {}) as Doc;
        const last = segs[segs.length - 1];
        if (src && typeof src === 'object' && 'isEqual' in src && (src as { isEqual: (o: unknown) => boolean }).isEqual(DELETE)) delete dst[last];
        else dst[last] = structuredClone(src);
    }
    return out;
}

const stored = () => ({
    entries: {
        a: { name: 'Alpha', order: 0, notes: 'old note' },
        // Added by the MCP or Spark after this tab loaded: the tab has never seen it.
        b: { name: 'Beta', order: 1 },
    },
});

describe('putEntry', () => {
    it('replaces only the edited entry and keeps one the tab never saw', () => {
        const next = apply(stored(), putEntry('a', { name: 'Alpha 2', order: 0 }));
        expect(next.entries).toEqual({ a: { name: 'Alpha 2', order: 0 }, b: { name: 'Beta', order: 1 } });
    });

    it('drops a field the edit cleared instead of keeping its stale value', () => {
        const next = apply(stored(), putEntry('a', { name: 'Alpha', order: 0 }));
        expect((next.entries as Doc).a).not.toHaveProperty('notes');
    });

    it('treats an id with dots or slashes as one key, not a path', () => {
        const next = apply({ entries: {} }, putEntry('x.y', { name: 'Dot' }));
        expect(next.entries).toEqual({ 'x.y': { name: 'Dot' } });
    });
});

describe('removeEntry', () => {
    it('removes just that key with deleteField', () => {
        const next = apply(stored(), removeEntry('a'));
        expect(next.entries).toEqual({ b: { name: 'Beta', order: 1 } });
    });
});

describe('orderWrite', () => {
    it('writes only the order fields that changed, for entries that still exist', () => {
        const s = { entries: { a: { name: 'A', order: 0 }, b: { name: 'B', order: 1 }, c: { name: 'C', order: 2 } } };
        // "gone" was deleted elsewhere since the tab loaded; it must not come back as a stub.
        const w = orderWrite(s.entries, ['b', 'gone', 'a', 'c'])!;
        const next = apply(s, w);
        expect(next.entries).toEqual({ a: { name: 'A', order: 1 }, b: { name: 'B', order: 0 }, c: { name: 'C', order: 2 } });
        expect(w.mergeFields.length).toBe(3); // a.order, b.order, lastWrite
    });

    it('writes nothing when the order is unchanged', () => {
        expect(orderWrite({ a: { order: 0 }, b: { order: 1 } }, ['a', 'b'])).toBeNull();
    });
});

describe('planIncomeSave', () => {
    const income = { id: 'i1', amount: 100, currency: 'USD' as const, date: '2026-03-10', projectId: 'p', monthlyPayment: true, createdAt: 1 };

    it('advances the next due date from the STORED project, as one field', () => {
        const plan = planIncomeSave(income, true, { monthly: true, nextPaymentDate: '2026-03-15', startDate: '2026-01-15' });
        expect(plan.nextDate).toBe('2026-04-15');
        const proj = apply({ entries: { p: { name: 'P', monthly: true, nextPaymentDate: '2026-03-15' } } }, plan.project!);
        expect(proj.entries).toEqual({ p: { name: 'P', monthly: true, nextPaymentDate: '2026-04-15' } });
        const inc = apply({ entries: {} }, plan.income);
        expect(inc.entries).toEqual({ i1: { amount: 100, currency: 'USD', date: '2026-03-10', projectId: 'p', monthlyPayment: true, createdAt: 1 } });
    });

    it('leaves the schedule alone for an edit, a non-retainer or a missing project', () => {
        expect(planIncomeSave(income, false, { monthly: true, nextPaymentDate: '2026-03-15' }).project).toBeUndefined();
        expect(planIncomeSave(income, true, { monthly: false }).project).toBeUndefined();
        expect(planIncomeSave(income, true, undefined).project).toBeUndefined();
    });
});
