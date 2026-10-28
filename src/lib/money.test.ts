import { describe, expect, it } from 'vitest';
import * as money from './money';
import { computeTotals, nextMonthlyPaymentDate, projectReceived, type MoneyProject, type Rates } from './money';

const rates: Rates = { USD: 1, EGP: 50, EUR: 1 };

describe('money', () => {
    it('loads', () => {
        expect(Object.keys(money).length).toBeGreaterThan(0);
    });
});

describe('legacy paid amounts', () => {
    const totalsFor = (projects: MoneyProject[]) => computeTotals({
        config: { displayCurrency: 'USD', rates }, projects, income: [], expenses: [], accounts: [],
    });

    it('caps a one-off project at what it owes, surcharge included, in every view', () => {
        const p: MoneyProject = { id: 'a', priceAmount: 100, priceCurrency: 'USD', installmentMonths: 2, installmentPercent: 10, paidAmount: 110 };
        expect(projectReceived(p, [], rates)).toBe(110);
        expect(totalsFor([p]).earned).toBe(110);
    });

    it('never reports more received than owed on a one-off project', () => {
        const p: MoneyProject = { id: 'a', priceAmount: 100, priceCurrency: 'USD', paidAmount: 500 };
        expect(projectReceived(p, [], rates)).toBe(100);
        expect(totalsFor([p]).earned).toBe(100);
    });

    it('leaves a retainer and an unpriced project uncapped', () => {
        const retainer: MoneyProject = { id: 'r', priceAmount: 100, priceCurrency: 'USD', monthly: true, paidAmount: 300 };
        const unpriced: MoneyProject = { id: 'u', priceCurrency: 'USD', paidAmount: 40 };
        expect(projectReceived(retainer, [], rates)).toBe(300);
        expect(projectReceived(unpriced, [], rates)).toBe(40);
        expect(totalsFor([retainer, unpriced]).earned).toBe(340);
    });
});

describe('nextMonthlyPaymentDate', () => {
    it('keeps a 31st billing day after a short month', () => {
        expect(nextMonthlyPaymentDate({ startDate: '2026-01-31', nextPaymentDate: '2026-02-28' }, '2026-02-28')).toBe('2026-03-31');
        expect(nextMonthlyPaymentDate({ startDate: '2026-01-31', nextPaymentDate: '2026-03-31' }, '2026-03-31')).toBe('2026-04-30');
        expect(nextMonthlyPaymentDate({ startDate: '2026-01-30', nextPaymentDate: '2026-02-28' }, '2026-02-28')).toBe('2026-03-30');
    });

    it('keeps a billing day that only looks clamped', () => {
        expect(nextMonthlyPaymentDate({ startDate: '2026-01-28', nextPaymentDate: '2026-02-28' }, '2026-02-28')).toBe('2026-03-28');
    });

    it('clamps into a short month and seeds from the start date', () => {
        expect(nextMonthlyPaymentDate({ nextPaymentDate: '2026-01-31' }, '2026-01-31')).toBe('2026-02-28');
        expect(nextMonthlyPaymentDate({ startDate: '2026-05-15' }, '2026-05-20')).toBe('2026-06-15');
    });
});
