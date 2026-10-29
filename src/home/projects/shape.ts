import type { Data, Row } from '../../lib/dataCache';
import type { ProjectData as Project, TagData as Tag } from '../../types';
import type { Contributor } from './ContributorView';
import { getStackIcon, getTechColor } from '../../lib/projectUtils';
import { bestDistance, SEARCH_MAX_DISTANCE } from '../../lib/fuzzy';

/**
 * The projects as the homepage section and the /projects page show them: Firestore's
 * documents turned into cards, and the search and tag filter over them. Pure, so the
 * section (live data) and the page (the build's snapshot) read the same.
 */

export interface RawContributorData {
    Name?: string;
    Role?: string;
    Image?: string;
    "Social Accounts"?: Record<string, string>;
}

export interface RawTagData {
    Name?: string;
    Color?: string;
    Icon?: string;
}

interface ProjectContributorData {
    "Contributor Name"?: string;
    "Role at Project"?: string;
}

export interface FirestoreProject {
    id: string;
    Title?: string;
    Description?: string;
    "Project Images"?: string[];
    Stack?: (string | RawTagData)[] | Record<string, string | RawTagData>;
    Tags?: Record<string, string | RawTagData>;
    Contributors?: Record<string, ProjectContributorData>;
    "Repository Link"?: string;
    "Live Link"?: string;
    "Download Link"?: string;
    Views?: {
        Project?: number;
        Github?: number;
        Live?: number;
        Download?: number;
    };
    Listing?: number | string;
    listing?: number | string;
}

/** Tags/Contributors' named entries. */
export const contributorsOf = (doc: Data | null | undefined): Contributor[] =>
    Object.entries((doc || {}) as Record<string, RawContributorData>)
        .filter(([, val]) => val && typeof val === 'object' && val.Name)
        .map(([id, val]): Contributor => ({
            id,
            name: val.Name || '',
            role: val.Role || '',
            jobTitle: val.Role || '',
            image: val.Image || '',
            links: val["Social Accounts"] || {}
        }));

/** Tags/Contributors/Profiles' documents. */
export const profilesOf = (docs: Row[] | undefined): Contributor[] =>
    (docs || []).map(val => ({
        id: val.id,
        name: val.Name || val.name || '',
        role: val.Role || val.role || '',
        jobTitle: val.Role || val.role || '',
        image: val.Image || val.image || '',
        links: val["Social Accounts"] || val.links || val.socials || {}
    } as Contributor));

/** Every known contributor: a profile overrides the Tags/Contributors entry with its id. */
export const allContributors = (doc: Contributor[], profiles: Contributor[]) =>
    [...doc.filter(c => !profiles.some(p => p.id === c.id)), ...profiles];

/** Tags/Tags' entries, for the icons and colours of the tags. */
export const tagsOf = (doc: Data | null | undefined): Tag[] =>
    Object.entries((doc || {}) as Record<string, RawTagData>).map(([id, val]): Tag => ({
        id,
        name: val.Name || 'Untitled',
        color: val.Color || '#60a5fa',
        iconSvg: val.Icon || ''
    }));

/** A project's tag with its colour and icon: its own, else the Tags/Tags entry's, else a guess from the name. */
export const resolveTag = (t: string | RawTagData, known: Tag[]): Tag => {
    const name = typeof t === 'string' ? t : (t.Name || 'Unix');
    const globalTag = known.find(gt => gt.name.toLowerCase() === name.toLowerCase());
    return {
        name,
        color: (typeof t === 'object' && t.Color) ? t.Color : (globalTag?.color || getTechColor(name)),
        iconSvg: (typeof t === 'object' && t.Icon) ? t.Icon : (globalTag?.iconSvg || getStackIcon(name) || '')
    };
};

/** A Firestore project as a card: its stack (or else its tags) resolved, its contributors matched to their profiles. */
export const shapeProject = (data: FirestoreProject, contributors: Contributor[], tags: Tag[]): Project => {
    const v = data.Views || {};

    const projectContributors = data.Contributors ? Object.values(data.Contributors).map((c): Contributor => {
        const name = c["Contributor Name"] || '';
        const projectRole = c["Role at Project"];

        const fullContrib = contributors.find(cont => {
            const cName = (cont.name || '').trim().toLowerCase();
            const pName = name.trim().toLowerCase();
            return cName === pName && cName !== '';
        });

        return {
            name,
            role: projectRole || (fullContrib ? (fullContrib.role || fullContrib.jobTitle || 'Contributor') : 'Contributor'),
            jobTitle: fullContrib ? (fullContrib.role || fullContrib.jobTitle || 'Contributor') : 'Contributor',
            image: fullContrib?.image || '',
            links: fullContrib?.links || {}
        };
    }) : [];

    const rawStack = data.Stack || [];
    const normalizedStack = (Array.isArray(rawStack) ? rawStack : Object.values(rawStack))
        .map(t => resolveTag(t, tags))
        .filter(t => t.name !== 'Unix');

    const rawTags = data.Tags ? Object.values(data.Tags) : [];
    const normalizedTags = rawTags.map(t => resolveTag(t, tags)).filter(t => t.name !== 'Unix');

    return {
        id: data.id,
        title: data.Title || data.id,
        name: data.id,
        description: data.Description || '',
        fullDescription: data.Description || '',
        images: data["Project Images"] || [],
        stack: normalizedStack.map(t => t.name),
        tags: normalizedStack.length > 0 ? normalizedStack : normalizedTags,
        repoLink: data["Repository Link"] || '',
        liveLink: data["Live Link"] || '',
        downloadLink: data["Download Link"] || '',
        views: Number(v.Project || 0) || 0,
        githubViews: Number(v.Github || 0) || 0,
        liveViews: Number(v.Live || 0) || 0,
        downloadViews: Number(v.Download || 0) || 0,
        contributors: projectContributors,
        listing: Number(data.Listing ?? data.listing ?? 0) || 0
    };
};

/** Whether a project carries every one of these tags, in its stack or its own tags. */
export const hasTags = (project: { stack?: string[]; tags?: Tag[] }, tags: string[]) => {
    const own = [...(project.stack || []), ...(project.tags || []).map(t => t.name)].map(s => s.toLowerCase());
    return tags.every(tag => own.includes(tag.toLowerCase()));
};

/**
 * The projects that carry every picked tag. Without a search: pinned ones first, in the
 * order they were pinned, then the owner's own listing order. A search ignores pinning
 * (it is a question about the whole grid) and ranks by how close each project came.
 */
export const filterProjects = (
    projects: Project[],
    { tags, query, pinned = [] }: { tags: string[]; query: string; pinned?: string[] },
): Project[] => {
    const results = tags.length > 0 ? projects.filter(project => hasTags(project, tags)) : projects;
    if (query.length < 2) {
        const rank = (id: string | number | undefined) => {
            const at = pinned.indexOf(String(id ?? ''));
            return at === -1 ? Infinity : at;
        };
        return [...results].sort((a, b) => {
            const aPin = rank(a.id);
            const bPin = rank(b.id);
            if (aPin !== bPin) return aPin - bPin;
            const aVal = a.listing && a.listing > 0 ? a.listing : 999999;
            const bVal = b.listing && b.listing > 0 ? b.listing : 999999;
            if (aVal !== bVal) return aVal - bVal;
            return (a.title || '').localeCompare(b.title || '');
        });
    }

    const lower = query.toLowerCase();
    return results
        .map(project => ({
            project,
            minDistance: bestDistance(lower, [
                project.title || '',
                ...(project.tags || []).map(tag => typeof tag === 'string' ? tag : tag.name),
                ...(project.stack || []),
                ...project.contributors.map(c => c.name || ''),
            ]),
        }))
        .filter(item => item.minDistance <= SEARCH_MAX_DISTANCE)
        .sort((a, b) => a.minDistance - b.minDistance)
        .map(item => item.project);
};

/** Tags that would leave the grid empty: no project carries them together with the ones picked. */
export const deadTagsOf = (tags: Tag[], projects: Project[], picked: string[]) =>
    new Set(projects.length === 0 ? [] : tags
        .filter(tag => !picked.includes(tag.name)
            && !projects.some(p => hasTags(p, [...picked, tag.name])))
        .map(tag => tag.name));
