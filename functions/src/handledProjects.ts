// GENERATED from src/lib/handledProjects.ts by scripts/sync-shared.mjs - edit that file.

/**
 * The public "projects I handle" list - the ONE definition of what of the private
 * TreasuryProjects collection may be published to Settings/HandledProjects.
 *
 * Only name, status and position leave Treasury. Prices, earnings, clients and notes
 * never do, and neither does work that stopped (paused, closed) or ended (completed):
 * a client should never read "paused" or "closed" next to their own project.
 *
 * A Cloud Function trigger (mirrorTreasuryProjects) keeps the mirror in step with
 * every writer of TreasuryProjects (the dashboard, Spark and the MCP tools). The functions build copies this file to
 * functions/src/handledProjects.ts (functions/scripts/sync-shared.mjs): edit it here.
 * It must stay dependency-free. The status list matches PROJECT_STATUSES in
 * ./treasury, which should import it from here.
 */

export type ProjectStatus = 'pending' | 'active' | 'paused' | 'live' | 'completed' | 'closed';

/** Whether each status may be named publicly, and whether it means the work ended. */
export const STATUS_FLAGS: Record<ProjectStatus, { publicly: boolean; finished: boolean }> = {
    pending: { publicly: true, finished: false },
    active: { publicly: true, finished: false },
    paused: { publicly: false, finished: false },
    live: { publicly: true, finished: false },
    completed: { publicly: false, finished: true },
    closed: { publicly: false, finished: true },
};

const isStatus = (v: unknown): v is ProjectStatus =>
    typeof v === 'string' && Object.prototype.hasOwnProperty.call(STATUS_FLAGS, v);

/**
 * A stored project's status. Rows written before the statuses were unified carry a
 * `done` boolean, which wins when it says the work is over; a missing or unknown status
 * reads as active.
 */
export function storedStatus(raw: Record<string, unknown>): ProjectStatus {
    const stored = isStatus(raw.status) ? raw.status : null;
    if (raw.done === true && (!stored || !STATUS_FLAGS[stored].finished)) return 'completed';
    return stored ?? 'active';
}

export interface HandledProject { name: string; status: string; order: number }

/** The public mirror of the treasury projects, given as `{ [projectId]: project }`. */
export function handledProjectsMirror(entries: unknown): Record<string, HandledProject> {
    const rows = entries && typeof entries === 'object' ? Object.entries(entries as Record<string, unknown>) : [];
    const handled = rows
        .map(([id, raw], index) => ({ id, raw, index }))
        .filter((r): r is { id: string; raw: Record<string, unknown>; index: number } =>
            !!r.raw && typeof r.raw === 'object' && !Array.isArray(r.raw))
        .map(({ id, raw, index }) => ({
            id,
            name: typeof raw.name === 'string' ? raw.name : '',
            status: storedStatus(raw),
            order: typeof raw.order === 'number' ? raw.order : index,
        }))
        .filter((p) => STATUS_FLAGS[p.status].publicly)
        .sort((a, b) => a.order - b.order);
    const out: Record<string, HandledProject> = {};
    handled.forEach((p, i) => { out[p.id] = { name: p.name, status: p.status, order: i }; });
    return out;
}

/** Whether two mirrors say the same thing, whatever order their keys are in. */
export function sameMirror(a: Record<string, HandledProject>, b: Record<string, HandledProject>): boolean {
    const ka = Object.keys(a), kb = Object.keys(b);
    if (ka.length !== kb.length) return false;
    return ka.every((k) => {
        const x = a[k], y = b[k];
        return !!y && x.name === y.name && x.status === y.status && x.order === y.order;
    });
}
