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

/** A short, fixed tag for one id (FNV-1a, base 36), to tell apart names that slug alike. */
const tagOf = (id: string, length: number) => {
    let h = 0x811c9dc5;
    for (const ch of id) h = Math.imul(h ^ ch.codePointAt(0)!, 0x01000193) >>> 0;
    return h.toString(36).padStart(7, '0').slice(-length);
};

/**
 * Every project's page address, by project id. The build (projectPages) and the homepage
 * links both use this, so a link always reaches the page built for that project.
 *
 * An address depends only on the ids, never on the listing order: when two names slug
 * alike, the one that sorts first by id keeps the plain slug and every other gets a tag
 * made from its own id, so reordering the portfolio never moves a page. Every address
 * is checked against all the others, so none is handed out twice.
 */
export function projectSlugs(ids: string[]): Map<string, string> {
    const unique = [...new Set(ids)].sort();
    const byBase = new Map<string, string[]>();
    for (const id of unique) {
        const base = slugOf(id);
        byBase.set(base, [...(byBase.get(base) || []), id]);
    }
    const taken = new Set(byBase.keys());
    const out = new Map<string, string>();
    for (const [base, group] of byBase) {
        group.forEach((id, i) => {
            if (i === 0) { out.set(id, base); return; }
            let length = 4, slug = `${base}-${tagOf(id, length)}`;
            while (taken.has(slug)) slug = length < 7 ? `${base}-${tagOf(id, ++length)}` : `${slug}-${i}`;
            taken.add(slug);
            out.set(id, slug);
        });
    }
    return out;
}
