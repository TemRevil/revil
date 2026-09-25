/**
 * How a project's name becomes the address of its page (/projects/<slug>). Kept apart
 * from projectPages.ts so client code can link to a page without importing the
 * project snapshot.
 */

/** "Gunter System (currently deactivated)" -> "Gunter System". */
export const cleanName = (id: string) => id.replace(/\s*\([^)]*\)\s*/g, ' ').trim() || id;

/** The bracketed note in a project's name, e.g. "currently deactivated". */
export const nameNote = (id: string) => /\(([^)]+)\)/.exec(id)?.[1]?.trim() || '';

/** "Login-Design Vol.1" -> "login-design-vol-1". */
export const slugOf = (id: string) =>
    cleanName(id).normalize('NFKD').replace(/[̀-ͯ]/g, '')
        .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'project';
