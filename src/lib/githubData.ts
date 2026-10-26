// The Developer tab's GitHub numbers, always this visit's: nothing is kept on the device, so
// a number is never older than the page. Each URL is read once per visit (however many
// readers ask), and ProjectsHub asks as soon as its section is reached, so the tab opens
// on numbers already read. The public GitHub API allows 60 requests an hour per visitor.

export const GITHUB_USERNAME = 'TemRevil';

export const GITHUB_URLS = {
    user: `https://api.github.com/users/${GITHUB_USERNAME}`,
    repos: `https://api.github.com/users/${GITHUB_USERNAME}/repos?per_page=100`,
    repo: (name: string) => `https://api.github.com/repos/${GITHUB_USERNAME}/${name}`,
    contributions: (username: string) => `https://github-contributions-api.jogruber.de/v4/${username}`,
};

const TIMEOUT_MS = 10_000;

const read = new Map<string, unknown>();
const inFlight = new Map<string, Promise<unknown>>();

/** `url`'s JSON as read on this visit, or undefined before it lands. */
export function cachedJson<T>(url: string): T | undefined {
    return read.get(url) as T | undefined;
}

/** `url`'s JSON, read once per visit. Rejects when the read fails; the caller keeps what it shows. */
export function fetchJson<T>(url: string): Promise<T> {
    if (read.has(url)) return Promise.resolve(read.get(url) as T);
    let pending = inFlight.get(url);
    if (!pending) {
        pending = fetch(url, { signal: AbortSignal.timeout(TIMEOUT_MS) })
            .then((res) => {
                if (!res.ok) throw new Error(`GitHub ${res.status} on ${url}`);
                return res.json();
            })
            .then((data) => { read.set(url, data); return data; })
            .finally(() => inFlight.delete(url));
        inFlight.set(url, pending);
    }
    return pending as Promise<T>;
}

/** Reads what the Developer tab shows, so the tab opens on numbers already read. */
export function prefetchGithub(featured: string[]): void {
    const urls = [GITHUB_URLS.user, GITHUB_URLS.repos, GITHUB_URLS.contributions(GITHUB_USERNAME), ...featured.map(GITHUB_URLS.repo)];
    for (const url of urls) void fetchJson(url).catch(() => { });
}
