import projectsSnapshot from '../data/projects.snapshot.json';
import { cleanName, nameNote, slugOf } from './projectSlug';

export { cleanName, nameNote, slugOf };

/**
 * The public project pages (/projects and /projects/<slug>) are built from the
 * committed Firestore snapshot at BUILD time, so every project has real HTML at its
 * own address for search engines to list. Refresh the snapshot after editing
 * projects in the dashboard (`npm run sync:projects`), then push to rebuild.
 *
 * Server-only on purpose: importing this from a client component would ship the
 * whole snapshot to every visitor.
 */

/** A row of src/data/projects.snapshot.json (mirrors the Firestore doc). */
export type SnapshotProject = {
    id: string;
    Description?: string;
    /** The long write-up, only on the project's own page (see app/projects/CaseStudy). */
    'Case Study'?: string;
    Listing?: number;
    'Live Link'?: string;
    'Repository Link'?: string;
    'Download Link'?: string;
    'Project Icon'?: string;
    'Project Images'?: string[];
    Tags?: Record<string, string | { Name?: string }>;
    Contributors?: Record<string, { 'Contributor Name'?: string; 'Role at Project'?: string }>;
};

export const SITE_URL = 'https://temrevil.com';

export const tagNames = (p: SnapshotProject) =>
    Object.values(p.Tags || {})
        .map((t) => (typeof t === 'string' ? t : t?.Name || ''))
        .map((t) => t.trim())
        .filter(Boolean);

export const contributorsOf = (p: SnapshotProject) =>
    Object.values(p.Contributors || {})
        .map((c) => ({ name: (c['Contributor Name'] || '').trim(), role: (c['Role at Project'] || '').trim() }))
        .filter((c) => c.name);

/** Images and videos of a project, told apart by the file name in the URL. */
export const mediaOf = (p: SnapshotProject) =>
    (p['Project Images'] || []).filter(Boolean).map((url) => ({
        url,
        video: /\.(mp4|webm|mov)(\?|$)/i.test(decodeURIComponent(url.split('/o/')[1] || url)),
    }));

/**
 * A description cut to a search-result length so it still reads as a whole sentence:
 * whole sentences first, then the last clause that isn't the middle of a list
 * ("a, b and c" is never split), and a word cut with "…" only when neither fits.
 */
export const shortDescription = (text: string, max = 158) => {
    const flat = text.replace(/\s+/g, ' ').trim();
    if (flat.length <= max) return flat;
    const min = Math.floor(max * 0.45);
    let sentence = -1;
    for (const m of flat.matchAll(/[.!?](?=\s+[A-Z])/g)) {
        if (m.index >= max) break;
        if (m.index + 1 >= min) sentence = m.index + 1;
    }
    if (sentence > 0) return flat.slice(0, sentence);
    const head = flat.slice(0, max - 1);
    for (const sep of [': ', '; ', ' - ', ', ']) {
        for (let i = head.lastIndexOf(sep); i >= min; i = head.lastIndexOf(sep, i - 1)) {
            // A comma only ends a clause before words like these; otherwise it's a list.
            if (sep === ', ' && !/^(with|built|which|where|across|so|but|while)\b/i.test(flat.slice(i + 2))) continue;
            return `${head.slice(0, i)}.`;
        }
    }
    return `${head.slice(0, head.lastIndexOf(' ')).replace(/[,.;:]$/, '')}…`;
};

export interface ProjectPage {
    slug: string;
    name: string;
    note: string;
    project: SnapshotProject;
}

/** Every project with its page address, in the portfolio's own order. Slugs are unique. */
export const projectPages: ProjectPage[] = (() => {
    const seen = new Map<string, number>();
    return [...(projectsSnapshot as unknown as SnapshotProject[])]
        // 0 is what Canary saves for a project never reordered: last, as the homepage grid has it.
        .sort((a, b) => (a.Listing || 999) - (b.Listing || 999))
        .map((project) => {
            const base = slugOf(project.id);
            const n = (seen.get(base) || 0) + 1;
            seen.set(base, n);
            return { slug: n > 1 ? `${base}-${n}` : base, name: cleanName(project.id), note: nameNote(project.id), project };
        });
})();

export const projectPageUrl = (slug: string) => `${SITE_URL}/projects/${slug}`;
