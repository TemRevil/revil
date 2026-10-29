/**
 * Typo-tolerant matching, shared by the public project grid, the dashboard's project
 * list and the treasury's template / project suggestions.
 */

/** Edit distance between two strings (insertions, deletions and substitutions all cost 1). */
export function levenshtein(a: string, b: string): number {
    if (a === b) return 0;
    const m = a.length, n = b.length;
    if (!m) return n;
    if (!n) return m;
    let prev = Array.from({ length: n + 1 }, (_, j) => j);
    for (let i = 1; i <= m; i++) {
        const curr = [i];
        const ai = a.charCodeAt(i - 1);
        for (let j = 1; j <= n; j++) {
            const cost = ai === b.charCodeAt(j - 1) ? 0 : 1;
            curr[j] = Math.min(prev[j] + 1, curr[j - 1] + 1, prev[j - 1] + cost);
        }
        prev = curr;
    }
    return prev[n];
}

/** How far the search grid lets a typo stray before a project drops out. */
export const SEARCH_MAX_DISTANCE = 2;

/**
 * How well `term` matches a lower-cased `query`: 0 when it contains the query outright,
 * otherwise the smallest edit distance between the query and any one of its words.
 */
function termDistance(query: string, term: string): number {
    const lower = term.toLowerCase();
    if (lower.includes(query)) return 0;
    let d = Infinity;
    for (const w of lower.split(/[\s\-_]+/)) d = Math.min(d, levenshtein(query, w));
    return d;
}

/** The best termDistance across several terms (a title, its tags, its stack...). */
export function bestDistance(query: string, terms: string[]): number {
    let d = Infinity;
    for (const t of terms) d = Math.min(d, termDistance(query, t));
    return d;
}
