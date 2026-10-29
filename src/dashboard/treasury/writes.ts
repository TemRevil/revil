/**
 * Treasury writes that touch only what they change.
 *
 * Every project, payment, expense and account is its own document (TreasuryProjects,
 * TreasuryIncome, TreasurySpendings, TreasuryAccounts; see lib/collections). A save
 * replaces that one document whole, so a field the edit cleared really goes, and no
 * write ever carries a row this tab did not mean to change: a row the MCP or Spark
 * added after the tab loaded is never touched.
 */
import { nextMonthlyPaymentDate } from '../../lib/money';
import type { TreasuryIncome, TreasuryProject } from '../../lib/treasury';

/** One entry as its document: the id is the document's own id, not a field. */
export function entryDoc<T extends { id: string }>(entry: T): { id: string; data: Omit<T, 'id'> } {
    const { id, ...data } = entry;
    return { id, data };
}

/**
 * New `order` values for a reorder, for rows that still exist as stored and whose
 * position changed. A row deleted elsewhere is skipped rather than recreated as a bare
 * { order } stub. Empty when nothing moved.
 */
export function orderUpdates(stored: Record<string, { order?: unknown } | undefined>, orderedIds: string[]): Array<{ id: string; order: number }> {
    const out: Array<{ id: string; order: number }> = [];
    let pos = 0;
    for (const id of orderedIds) {
        if (!stored[id]) continue;
        if (stored[id]!.order !== pos) out.push({ id, order: pos });
        pos++;
    }
    return out;
}

type StoredProject = Partial<Pick<TreasuryProject, 'monthly' | 'nextPaymentDate' | 'startDate'>>;

/**
 * Saving a payment. A NEW monthly-retainer payment also moves its project's next due
 * date one cycle on, computed from the project as stored (read inside the same
 * transaction by the caller) and written as that one field of the project document -
 * so the payment and the advance land together or not at all, and two payments logged
 * at once advance twice.
 */
export function planIncomeSave(income: TreasuryIncome, isNew: boolean, storedProject: StoredProject | undefined): {
    income: { id: string; data: Omit<TreasuryIncome, 'id'> };
    project?: { id: string; data: { nextPaymentDate: string } };
    nextDate?: string;
} {
    const plan: ReturnType<typeof planIncomeSave> = { income: entryDoc(income) };
    if (isNew && income.monthlyPayment && income.projectId && storedProject?.monthly) {
        const nextDate = nextMonthlyPaymentDate(storedProject, income.date);
        plan.nextDate = nextDate;
        plan.project = { id: income.projectId, data: { nextPaymentDate: nextDate } };
    }
    return plan;
}
