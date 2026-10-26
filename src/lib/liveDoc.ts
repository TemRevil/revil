// How the public pages (the homepage, /book and their modals) read Firestore: over its REST
// API with the App Check token, not through the SDK. The Firestore SDK is ~550KB and
// ~0.3s of a phone's CPU to start, for a handful of public documents; only the sign-in
// page and the admin dashboard load it (lib/firebase). App Check itself (reCAPTCHA) still
// loads, since visit tracking needs its token too, but only once the page has drawn.
// The trade: a public page reads each document when it opens, and again when the tab is
// shown after a while, instead of listening live. Until a read answers, readers get the
// copy lib/dataCache keeps (this page, this device, or the build's snapshot).
import { cachedCollection, cachedDoc, isPublic, PUBLIC_PATHS, readAt, remember, type Data, type Row } from './dataCache';

type FirebaseApp = typeof import('./firebaseApp');

let loading: Promise<FirebaseApp> | null = null;
let held: Promise<unknown> = Promise.resolve();

/**
 * Keeps Firebase from loading until `until` settles. reCAPTCHA alone is ~1s of main-thread
 * work on a phone, and its long tasks stutter the hero's stroke animation (stroke-dashoffset
 * runs on the main thread), so a page holds it until its entrance has played. It also covers
 * a next/dynamic page like /book, whose chunk arrives after the window's load event, so
 * "loaded and idle" can come before anything is drawn.
 */
export function holdFirebase(until: Promise<unknown>): void {
    held = Promise.all([held, until.catch(() => { })]);
}

/** Loads lib/firebaseApp once: after the page has loaded, the main thread has a gap and no hold remains. */
export function loadFirebase(): Promise<FirebaseApp> {
    if (!loading) {
        loading = new Promise<void>((resolve) => {
            const idle = () => {
                if (typeof window.requestIdleCallback === 'function') window.requestIdleCallback(() => resolve(), { timeout: 1500 });
                else setTimeout(resolve, 300);
            };
            if (document.readyState === 'complete') idle();
            else window.addEventListener('load', idle, { once: true });
        }).then(() => held).then(() => import('./firebaseApp'));
    }
    return loading;
}

/** The App Check token for a request's X-Firebase-AppCheck header ('' when there is none). */
export async function appCheckToken(): Promise<string> {
    const [{ appCheck }, { getToken }] = await Promise.all([loadFirebase(), import('firebase/app-check')]);
    if (!appCheck) return '';
    return (await getToken(appCheck, false)).token;
}

type RestValue = Record<string, unknown>;

/** Firestore REST tags every value with its type; unwrap to what the SDK's data() returns (timestamps as ISO strings). */
function decode(v: RestValue): unknown {
    if ('stringValue' in v) return v.stringValue;
    if ('integerValue' in v) return Number(v.integerValue);
    if ('doubleValue' in v) return Number(v.doubleValue);
    if ('booleanValue' in v) return v.booleanValue;
    if ('timestampValue' in v) return v.timestampValue;
    if ('mapValue' in v) return decodeFields((v.mapValue as { fields?: Record<string, RestValue> }).fields);
    if ('arrayValue' in v) return ((v.arrayValue as { values?: RestValue[] }).values || []).map(decode);
    return null;
}

function decodeFields(fields: Record<string, RestValue> = {}): Data {
    const out: Data = {};
    for (const k in fields) out[k] = decode(fields[k]);
    return out;
}

const BASE = `https://firestore.googleapis.com/v1/projects/${process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID}/databases/(default)/documents/`;
const url = (path: string[], query = '') => BASE + path.map(encodeURIComponent).join('/') + query;

async function get(path: string[], query = ''): Promise<Response> {
    const token = await appCheckToken();
    const res = await fetch(url(path, query), token ? { headers: { 'X-Firebase-AppCheck': token } } : undefined);
    if (!res.ok && res.status !== 404) throw new Error(`Firestore ${res.status} on ${path.join('/')}`);
    return res;
}

/** One document's data, or null when it doesn't exist. */
async function readDoc(path: string[]): Promise<Data | null> {
    const res = await get(path);
    if (res.status === 404) return null;
    return decodeFields((await res.json()).fields);
}

/** Every document in a collection, as { id, ...data }. */
async function readCollection(path: string[]): Promise<Row[]> {
    const docs: Row[] = [];
    let page = '';
    do {
        const res = await get(path, `?pageSize=300${page ? `&pageToken=${encodeURIComponent(page)}` : ''}`);
        if (res.status === 404) break;
        const body = await res.json() as { documents?: Array<{ name: string; fields?: Record<string, RestValue> }>; nextPageToken?: string };
        for (const d of body.documents || []) docs.push({ id: d.name.split('/').pop() as string, ...decodeFields(d.fields) });
        page = body.nextPageToken || '';
    } while (page);
    return docs;
}

// A read this recent is reused instead of asked again, and a tab shown again after this
// long reads again, so a page left open catches up.
const STALE_MS = 60_000;

const inFlight = new Map<string, Promise<unknown>>();

/** One read of `path` at a time, however many readers ask; the answer goes to the cache. */
function fetchOnce<T extends Data | null | Row[]>(path: string[], read: () => Promise<T>): Promise<T> {
    const k = path.join('/');
    let pending = inFlight.get(k) as Promise<T> | undefined;
    if (!pending) {
        pending = read()
            .then((data) => { remember(path, data); return data; })
            .finally(() => inFlight.delete(k));
        inFlight.set(k, pending);
    }
    return pending;
}

/**
 * Hands the reader the cached copy at once (lib/dataCache), then reads Firestore unless
 * this page read it under STALE_MS ago (the owner's content only: the booked slots and a
 * project's view counts are read on every open), and again whenever the tab comes back
 * after STALE_MS. A reader is only called when what it would get differs from what it has, and
 * an error only reaches a reader that has nothing to show. Returns the stop function.
 */
function watch<T extends Data | null | Row[]>(
    path: string[],
    peek: () => T | undefined,
    read: () => Promise<T>,
    onData: (data: T) => void,
    onError?: (error: unknown) => void,
): () => void {
    let stopped = false;
    let handed: string | null = null;
    const hand = (data: T) => {
        const json = JSON.stringify(data);
        if (stopped || json === handed) return;
        handed = json;
        onData(data);
    };
    const run = () => {
        if (isPublic(path) && Date.now() - readAt(path) < STALE_MS) {
            const known = peek();
            if (known !== undefined) hand(known);
            return;
        }
        fetchOnce(path, read).then(hand, (error) => { if (!stopped && handed === null) onError?.(error); });
    };
    const onShow = () => { if (document.visibilityState === 'visible' && Date.now() - readAt(path) > STALE_MS) run(); };
    const cached = peek();
    if (cached !== undefined) hand(cached);
    run();
    document.addEventListener('visibilitychange', onShow);
    return () => {
        stopped = true;
        document.removeEventListener('visibilitychange', onShow);
    };
}

/** One document (null when missing): the cached copy at once, then Firestore's. Returns the stop function. */
export function watchDoc(path: string[], onData: (data: Data | null) => void, onError?: (error: unknown) => void): () => void {
    return watch(path, () => cachedDoc(path), () => readDoc(path), onData, onError);
}

/** A collection's documents as { id, ...data }: the cached copy at once, then Firestore's. Returns the stop function. */
export function watchCollection(path: string[], onData: (docs: Row[]) => void, onError?: (error: unknown) => void): () => void {
    return watch(path, () => cachedCollection(path), () => readCollection(path), onData, onError);
}

/**
 * Reads every public path into the cache (lib/dataCache) in the background, so a section
 * or modal opened later finds this visit's copy. Firebase still waits for its holds.
 */
export function prefetchPublicData(): void {
    for (const path of PUBLIC_PATHS.docs) if (!readAt(path)) void fetchOnce(path, () => readDoc(path)).catch(() => { });
    for (const path of PUBLIC_PATHS.collections) if (!readAt(path)) void fetchOnce(path, () => readCollection(path)).catch(() => { });
}
