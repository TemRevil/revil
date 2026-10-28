/**
 * Treasury writes that touch only what they change.
 *
 * Each Treasury document keeps its rows in one `entries` map. The dashboard used to
 * rebuild that whole map from its own copy and write it back, so a row the MCP or Spark
 * added after this tab loaded - or an edit an offline-queued write carried - was wiped
 * by the next save here. Every write below names its exact field paths instead
 * (set with `mergeFields`): the row being saved is replaced whole, a removed row is
 * deleted with deleteField(), and every other row is left exactly as stored.
 */
import { FieldPath, deleteField, serverTimestamp } from 'firebase/firestore';
import { nextMonthlyPaymentDate } from '../../../lib/money';
import type { TreasuryIncome, TreasuryProject } from '../../../lib/treasury';

/** Arguments for set(ref, data, { mergeFields }), in a write or a transaction. */
export interface MapWrite {
    data: Record<string, unknown>;
    mergeFields: (string | FieldPath)[];
}

// FieldPath, not a dotted string: an id holding a dot would otherwise be read as a path.
const entryPath = (id: string, field?: string) => (field ? new FieldPath('entries', id, field) : new FieldPath('entries', id));

/** Write one row, replacing it whole (so a field the edit cleared really goes). */
export function putEntry(id: string, entry: object): MapWrite {
    return {
        data: { entries: { [id]: entry }, lastWrite: serverTimestamp() },
        mergeFields: [entryPath(id), 'lastWrite'],
    };
}

/** Remove one row. */
export function removeEntry(id: string): MapWrite {
    return {
        data: { entries: { [id]: deleteField() }, lastWrite: serverTimestamp() },
        mergeFields: [entryPath(id), 'lastWrite'],
    };
}

/**
 * New `order` values for a reorder, as single fields, for rows that still exist in the
 * stored map and whose position changed. A row deleted elsewhere is skipped rather than
 * recreated as a bare { order } stub. Null when nothing moved.
 */
export function orderWrite(stored: Record<string, { order?: unknown } | undefined>, orderedIds: string[]): MapWrite | null {
    const entries: Record<string, { order: number }> = {};
    const mergeFields: (string | FieldPath)[] = [];
    let pos = 0;
    for (const id of orderedIds) {
        if (!stored[id]) continue;
        if (stored[id]!.order !== pos) {
            entries[id] = { order: pos };
            mergeFields.push(entryPath(id, 'order'));
        }
        pos++;
    }
    if (!mergeFields.length) return null;
    return { data: { entries, lastWrite: serverTimestamp() }, mergeFields: [...mergeFields, 'lastWrite'] };
}

type StoredProject = Partial<Pick<TreasuryProject, 'monthly' | 'nextPaymentDate' | 'startDate'>>;

/**
 * Saving a payment. A NEW monthly-retainer payment also moves its project's next due
 * date one cycle on, computed from the project as stored (read inside the same
 * transaction by the caller), and written as that one field - so the payment and the
 * advance land together or not at all, and two payments logged at once advance twice.
 */
export function planIncomeSave(income: TreasuryIncome, isNew: boolean, storedProject: StoredProject | undefined): {
    income: MapWrite;
    project?: MapWrite;
    nextDate?: string;
} {
    const { id, ...rest } = income;
    const plan: { income: MapWrite; project?: MapWrite; nextDate?: string } = { income: putEntry(id, rest) };
    if (isNew && income.monthlyPayment && income.projectId && storedProject?.monthly) {
        const nextDate = nextMonthlyPaymentDate(storedProject, income.date);
        plan.nextDate = nextDate;
        plan.project = {
            data: { entries: { [income.projectId]: { nextPaymentDate: nextDate } }, lastWrite: serverTimestamp() },
            mergeFields: [entryPath(income.projectId, 'nextPaymentDate'), 'lastWrite'],
        };
    }
    return plan;
}
