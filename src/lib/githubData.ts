// The Developer tab's GitHub numbers, read through one cache the way lib/dataCache does it
// for Firestore: a reader is handed this device's last copy at once, and a copy older than
// FRESH_MS is asked for again (once, however many readers ask). The public GitHub API
// allows 60 requests an hour per visitor, so a fresh copy is never asked for twice.

export const GITHUB_USERNAME = 'TemRevil';

export const GITHUB_URLS = {
    user: `https://api.github.com/users/${GITHUB_USERNAME}`,
    repos: `https://api.github.com/users/${GITHUB_USERNAME}/repos?per_page=100`,
    repo: (name: string) => `https://api.github.com/repos/${GITHUB_USERNAME}/${name}`,
    contributions: (username: string) => `https://github-contributions-api.jogruber.de/v4/${username}`,
};

const PREFIX = 'revil:gh:';
const FRESH_MS = 30 * 60 * 1000;
const TIMEOUT_MS = 10_000;

interface Stored { data: unknown; at: number }

function stored(url: string): Stored | undefined {
    try {
        const raw = localStorage.getItem(PREFIX + url);
        return raw ? (JSON.parse(raw) as Stored) : undefined;
    } catch { return undefined; }
}

/** This device's last copy of `url`, however old, or undefined. */
export function cachedJson<T>(url: string): T | undefined {
    return stored(url)?.data as T | undefined;
}

const inFlight = new Map<string, Promise<unknown>>();

/**
 * `url`'s JSON: this device's copy when it is under FRESH_MS old, else a new read (stored
 * on the device). Rejects when the read fails; the caller keeps what it already shows.
 */
export function fetchJson<T>(url: string): Promise<T> {
    const copy = stored(url);
    if (copy && Date.now() - copy.at < FRESH_MS) return Promise.resolve(copy.data as T);
    let pending = inFlight.get(url);
    if (!pending) {
        pending = fetch(url, { signal: AbortSignal.timeout(TIMEOUT_MS) })
            .then((res) => {
                if (!res.ok) throw new Error(`GitHub ${res.status} on ${url}`);
                return res.json();
            })
            .then((data) => {
                try { localStorage.setItem(PREFIX + url, JSON.stringify({ data, at: Date.now() })); } catch { /* storage full or blocked */ }
                return data;
            })
            .finally(() => inFlight.delete(url));
        inFlight.set(url, pending);
    }
    return pending as Promise<T>;
}

/** Reads what the Developer tab shows into the cache, so the tab opens on this visit's copy. */
export function prefetchGithub(featured: string[]): void {
    const urls = [GITHUB_URLS.user, GITHUB_URLS.repos, GITHUB_URLS.contributions(GITHUB_USERNAME), ...featured.map(GITHUB_URLS.repo)];
    for (const url of urls) void fetchJson(url).catch(() => { });
}
