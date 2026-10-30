/**
 * Settings "Apply Changes" bookkeeping, kept apart from the screen so it can be tested.
 *
 * Apply saves several sections at once. Each save reports what happened to it, and the
 * owner is told exactly that: what was saved and what was not. A section that failed
 * stays staged (its changes are still on screen and Apply stays available), so nothing
 * typed is dropped by a save that only partly went through.
 */
import { storagePathFromUrl } from '../storagePath';

export type SaveOutcome = 'saved' | 'skipped' | 'failed';

export interface ApplySummary {
    /** True when every section that had something to save saved it. */
    ok: boolean;
    saved: string[];
    failed: string[];
    message: string;
}

/** `results` maps each section's label to how its save went, in the order they show. */
export function summarizeApply(results: [label: string, outcome: SaveOutcome][]): ApplySummary {
    const saved = results.filter(([, o]) => o === 'saved').map(([l]) => l);
    const failed = results.filter(([, o]) => o === 'failed').map(([l]) => l);
    const list = (xs: string[]) => xs.join(', ');
    let message: string;
    if (failed.length) {
        message = `Not saved: ${list(failed)}. ${saved.length ? `Saved: ${list(saved)}. ` : ''}Your other changes are still staged - try Apply again.`;
    } else if (saved.length) {
        message = `Saved: ${list(saved)}.`;
    } else {
        message = 'Nothing needed saving.';
    }
    return { ok: failed.length === 0, saved, failed, message };
}

/**
 * The hero image file a new upload leaves behind, or null. Hero images are stored as
 * `Hero.image.<ext>` (and `Hero.image.dark.<ext>`), so a .jpg replacing a .png lands at
 * a new path; the old file is deleted once the new URL is saved. Only a file of the same
 * variant and naming is ever returned, never an unrelated upload.
 */
export function staleHeroPath(oldUrl: string | null | undefined, newUrl: string | null, variant: 'light' | 'dark'): string | null {
    const oldPath = oldUrl ? storagePathFromUrl(oldUrl) : null;
    if (!oldPath) return null;
    const own = variant === 'dark'
        ? /^src\/imgs\/Settings\/Hero\.image\.dark\.[^./]+$/
        : /^src\/imgs\/Settings\/Hero\.image\.(?!dark\.)[^./]+$/;
    if (!own.test(oldPath)) return null;
    const newPath = newUrl ? storagePathFromUrl(newUrl) : null;
    return oldPath === newPath ? null : oldPath;
}
