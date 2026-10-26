// The public pages' copy of their Firestore data, so a section never waits on the network.
// Three layers, newest first:
//   - this page:   what lib/liveDoc read since the page opened;
//   - this device: the last copy this browser read (localStorage), for a returning visitor;
//   - the build:   a snapshot baked into the page (<script id="public-data">, written by
//                  scripts/sync-data.mjs), for a first visit.
// A reader is handed the newest of these at once (the device's copy and the build's are
// dated, so a newer build beats an old visit), and liveDoc replaces it when Firestore
// answers. Only the paths in data/publicPaths.json are kept on the device or baked in: the
// owner's content and the taken booking times. Anything else (a project's view counts)
// lives in this page's memory only.
import publicPaths from '../data/publicPaths.json';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Data = { [field: string]: any };
export type Row = Data & { id: string };
type Value = Data | null | Row[];

interface Snapshot {
    /** When scripts/sync-data.mjs read Firestore (ms). */
    at: number;
    docs: Record<string, Data | null>;
    collections: Record<string, Row[]>;
}

const KEPT = new Set<string>([...publicPaths.docs, ...publicPaths.collections]);
const DEVICE_PREFIX = 'revil:data:';
const key = (path: string[]) => path.join('/');

/** What this page read, and when (ms). */
const page = new Map<string, { value: Value; at: number }>();

let built: Snapshot | null | undefined;
function buildCopy(): Snapshot | null {
    if (built !== undefined) return built;
    built = null;
    try {
        const text = document.getElementById('public-data')?.textContent;
        if (text) built = JSON.parse(text) as Snapshot;
    } catch { /* a bad snapshot only costs the instant first paint */ }
    return built;
}

function deviceCopy(k: string): { value: Value; at: number } | undefined {
    if (!KEPT.has(k)) return undefined;
    try {
        const raw = localStorage.getItem(DEVICE_PREFIX + k);
        return raw === null ? undefined : (JSON.parse(raw) as { value: Value; at: number });
    } catch { return undefined; }
}

function known(k: string, kind: 'docs' | 'collections'): Value | undefined {
    const mem = page.get(k);
    if (mem) return mem.value;
    const device = deviceCopy(k);
    const snap = buildCopy();
    const fromBuild = snap?.[kind] && k in snap[kind] ? snap[kind][k] : undefined;
    if (device && (fromBuild === undefined || device.at >= (snap?.at ?? 0))) return device.value;
    return fromBuild;
}

/** The newest copy of a document: its data, null when it doesn't exist, undefined when nothing is known yet. */
export function cachedDoc(path: string[]): Data | null | undefined {
    const value = known(key(path), 'docs') as Data | null | undefined;
    if (value !== undefined) return value;
    // A project's own document is also a row of the Projects collection.
    const row = path.length === 2 ? cachedCollection([path[0]])?.find(r => r.id === path[1]) : undefined;
    if (!row) return undefined;
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { id, ...data } = row;
    return data;
}

/** The newest copy of a collection's rows, or undefined when nothing is known yet. */
export function cachedCollection(path: string[]): Row[] | undefined {
    return known(key(path), 'collections') as Row[] | undefined;
}

/** Whether `path` is the owner's public content (kept on the device and baked into the build). */
export function isPublic(path: string[]): boolean {
    return KEPT.has(key(path));
}

/** When this page last read `path` from Firestore (0 = not yet). */
export function readAt(path: string[]): number {
    return page.get(key(path))?.at ?? 0;
}

/** Stores what Firestore just returned for `path`, on the page and (for the owner's content) on the device. */
export function remember(path: string[], value: Value): void {
    const k = key(path);
    const at = Date.now();
    page.set(k, { value, at });
    if (KEPT.has(k)) {
        try { localStorage.setItem(DEVICE_PREFIX + k, JSON.stringify({ value, at })); } catch { /* storage full or blocked */ }
    }
}

/** Every path baked in and kept on the device, split by kind, for the prefetch. */
export const PUBLIC_PATHS = {
    docs: publicPaths.docs.map(p => p.split('/')),
    collections: publicPaths.collections.map(p => p.split('/')),
};
