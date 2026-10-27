/**
 * How a project save lands in Firestore, kept apart from the screen so it can be tested.
 *
 * A project document is keyed by its name, so a rename is a move. It happens in one
 * transaction: the new name must be free, the old document must still exist, and the
 * new one is written with everything the old one held (view counts included) before the
 * old one is deleted. Nothing is lost if any step fails, and an existing project is never
 * overwritten by a rename or a create that reuses its name.
 *
 * View counts belong to the public site, which bumps them on every visit; the form only
 * shows a copy loaded when it opened. An edit therefore writes the form's own fields and
 * leaves Views (and Listing, which the drag-to-reorder owns) as stored.
 */

/** The fields the project form owns. */
export const FORM_FIELDS = [
    'Description', 'Case Study', 'Live Link', 'Download Link', 'Project Icon',
    'Repository Link', 'Contributors', 'Tags', 'Project Images',
] as const;

export type ProjectFields = Record<(typeof FORM_FIELDS)[number], unknown>;

export const ZERO_VIEWS = { Github: 0, Live: 0, Download: 0, Project: 0 };

export type SaveMode = 'create' | 'edit' | 'rename';

export class ProjectNameTaken extends Error {
    constructor(name: string) { super(`A project named "${name}" already exists.`); }
}
export class ProjectGone extends Error {
    constructor(name: string) { super(`"${name}" no longer exists - it may have been deleted or renamed elsewhere.`); }
}

/** The slice of a Firestore transaction this needs (a fake one in tests). */
export interface DocTx<R> {
    get(ref: R): Promise<{ exists(): boolean; data(): Record<string, unknown> | undefined }>;
    set(ref: R, data: Record<string, unknown>, options?: { mergeFields: string[] }): unknown;
    delete(ref: R): unknown;
}

/**
 * Write one project save inside a transaction. `target` is the document under the saved
 * name; `source` is the old one for a rename. `listing` is used only for a new project.
 */
export async function writeProject<R>(tx: DocTx<R>, opts: {
    mode: SaveMode;
    target: R;
    source?: R;
    name: string;
    oldName?: string;
    fields: ProjectFields;
    listing?: number;
}): Promise<void> {
    const { mode, target, source, name, oldName, fields } = opts;
    const current = await tx.get(target);

    if (mode === 'edit') {
        if (!current.exists()) throw new ProjectGone(name);
        tx.set(target, { ...fields }, { mergeFields: [...FORM_FIELDS] });
        return;
    }

    if (current.exists()) throw new ProjectNameTaken(name);

    if (mode === 'create') {
        tx.set(target, { ...fields, Views: { ...ZERO_VIEWS }, Listing: opts.listing || 0 });
        return;
    }

    if (!source) throw new Error('A rename needs the old document.');
    const old = await tx.get(source);
    if (!old.exists()) throw new ProjectGone(oldName ?? name);
    tx.set(target, { ...(old.data() || {}), ...fields });
    tx.delete(source);
}

/** The Storage path inside a Firebase download URL (".../o/<encoded path>?alt=media&token=..."), or null. */
export function storagePathFromUrl(url: string): string | null {
    const m = /\/o\/([^?#]+)/.exec(url);
    if (!m) return null;
    try { return decodeURIComponent(m[1]); } catch { return null; }
}

interface Listed { id?: string | number; listing?: number }

/**
 * The full list in its new order after a drag. `all` is every project in display order;
 * `visible` is the subset the table showed, in the order the drag left it. The visible
 * projects are put back into the slots they held in the full list, so projects hidden by
 * a filter keep their places and no two end up sharing an index.
 */
export function placeReordered<T extends Listed>(all: T[], visible: T[]): T[] {
    const shown = new Set(visible.map(p => p.id));
    const queue = [...visible];
    return all
        .map(p => (shown.has(p.id) ? queue.shift()! : p))
        .map((p, i) => ({ ...p, listing: i + 1 }));
}

/** The Listing writes a reorder needs: only projects whose index differs from the stored one. */
export function changedListings(list: Listed[], stored: Map<string, number>): { id: string; listing: number }[] {
    const out: { id: string; listing: number }[] = [];
    for (const p of list) {
        if (p.id == null || p.listing == null) continue;
        const id = String(p.id);
        if (stored.get(id) !== p.listing) out.push({ id, listing: p.listing });
    }
    return out;
}
