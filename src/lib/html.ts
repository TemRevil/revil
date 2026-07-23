/** Escape a value for safe interpolation into HTML text or attributes. */
export function escapeHtml(v: unknown): string {
    return String(v ?? '')
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}
