import { describe, it, expect } from 'vitest';
import { entryDoc, orderUpdates, planIncomeSave } from './writes';

describe('entryDoc', () => {
    it('keeps the id as the document id, not as a stored field', () => {
        expect(entryDoc({ id: 'x.y/z', name: 'Dot', order: 0 })).toEqual({ id: 'x.y/z', data: { name: 'Dot', order: 0 } });
    });
});

describe('orderUpdates', () => {
    it('changes only the orders that moved, for entries that still exist', () => {
        const stored = { a: { order: 0 }, b: { order: 1 }, c: { order: 2 } };
        // "gone" was deleted elsewhere since the tab loaded; it must not come back as a stub.
        expect(orderUpdates(stored, ['b', 'gone', 'a', 'c'])).toEqual([{ id: 'b', order: 0 }, { id: 'a', order: 1 }]);
    });

    it('changes nothing when the order is unchanged', () => {
        expect(orderUpdates({ a: { order: 0 }, b: { order: 1 } }, ['a', 'b'])).toEqual([]);
    });
});

describe('planIncomeSave', () => {
    const income = { id: 'i1', amount: 100, currency: 'USD' as const, date: '2026-03-10', projectId: 'p', monthlyPayment: true, createdAt: 1 };

    it('advances the next due date from the STORED project, as one field', () => {
        const plan = planIncomeSave(income, true, { monthly: true, nextPaymentDate: '2026-03-15', startDate: '2026-01-15' });
        expect(plan.nextDate).toBe('2026-04-15');
        expect(plan.project).toEqual({ id: 'p', data: { nextPaymentDate: '2026-04-15' } });
        expect(plan.income).toEqual({ id: 'i1', data: { amount: 100, currency: 'USD', date: '2026-03-10', projectId: 'p', monthlyPayment: true, createdAt: 1 } });
    });

    it('leaves the schedule alone for an edit, a non-retainer or a missing project', () => {
        expect(planIncomeSave(income, false, { monthly: true, nextPaymentDate: '2026-03-15' }).project).toBeUndefined();
        expect(planIncomeSave(income, true, { monthly: false }).project).toBeUndefined();
        expect(planIncomeSave(income, true, undefined).project).toBeUndefined();
    });
});
