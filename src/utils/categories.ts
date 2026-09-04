/**
 * Meeting categories - the bucket a booking belongs to: a company, a client, a
 * side project. The owner defines the list from the dashboard
 * (D-Canary → Options) and assigns one there or over MCP; guests never see or
 * pick a category, so anything booked through the public form arrives Personal.
 *
 * Stored on the admin-only Settings/Canary doc (under `Categories`) rather than
 * Settings/Availability, which is public-readable - company names stay private.
 */

export interface MeetingCategory {
    id: string;
    name: string;
    /** Hex colour for the badge, calendar dot and filter chip. */
    color: string;
    /** ms epoch, used to keep the list in the order they were added. */
    created?: number;
}

/** Raw stored shape: Settings/Canary → Categories[id]. */
export interface CategoryData {
    Name?: string;
    Color?: string;
    Created?: number;
}

/**
 * The built-in bucket. It is never written anywhere: a booking is Personal
 * exactly when it carries no `Category` field, which is what makes this id
 * impossible to rename, delete or collide with.
 */
export const PERSONAL_CATEGORY: MeetingCategory = {
    id: 'personal',
    name: 'Personal',
    // The blue the dashboard already used for every booking dot, so nothing changes
    // visually until the owner actually adds a category of their own.
    color: '#3b82f6',
};

/** Swatches offered when adding a category - all readable on light and dark. */
export const CATEGORY_COLORS = [
    '#3b82f6', '#8b5cf6', '#ec4899', '#ef4444',
    '#f59e0b', '#10b981', '#14b8a6', '#64748b',
] as const;

export const MAX_CATEGORY_NAME = 24;

/** Case/space-insensitive key for spotting duplicate names. */
export const categoryKey = (name: string): string => name.trim().toLowerCase().replace(/\s+/g, ' ');

/** Read + validate the Categories map off a Settings/Canary snapshot. */
export function parseCategories(raw: unknown): MeetingCategory[] {
    if (!raw || typeof raw !== 'object') return [];
    return Object.entries(raw as Record<string, CategoryData>)
        .map(([id, c]): MeetingCategory | null => {
            const name = typeof c?.Name === 'string' ? c.Name.trim() : '';
            if (!id || id === PERSONAL_CATEGORY.id || !name) return null;
            const color = typeof c?.Color === 'string' && /^#[0-9a-f]{6}$/i.test(c.Color)
                ? c.Color
                : CATEGORY_COLORS[0];
            return { id, name, color, created: typeof c?.Created === 'number' ? c.Created : undefined };
        })
        .filter((c): c is MeetingCategory => c !== null)
        .sort((a, b) => (a.created ?? 0) - (b.created ?? 0) || a.name.localeCompare(b.name));
}

/**
 * Resolve a stored category id. A missing id - or one whose category has since
 * been deleted - reads as Personal, so a booking never renders as a dangling
 * reference.
 */
export function findCategory(categories: MeetingCategory[], id?: string): MeetingCategory {
    if (!id || id === PERSONAL_CATEGORY.id) return PERSONAL_CATEGORY;
    return categories.find(c => c.id === id) ?? PERSONAL_CATEGORY;
}
