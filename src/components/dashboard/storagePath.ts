/** The Storage path inside a Firebase download URL (".../o/<encoded path>?alt=media&token=..."), or null. */
export function storagePathFromUrl(url: string): string | null {
    const m = /\/o\/([^?#]+)/.exec(url);
    if (!m) return null;
    try { return decodeURIComponent(m[1]); } catch { return null; }
}
