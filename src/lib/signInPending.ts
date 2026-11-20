/**
 * Which page is waiting for a Google sign-in this tab went off to (sessionStorage).
 * Kept apart from googleSignIn.ts so the homepage can check it without loading
 * firebase/auth.
 */
export const PENDING_KEY = 'revil:signin';
export type SignInPage = 'secret' | 'mcp';

export function pendingSignIn(): SignInPage | null {
    try {
        const v = sessionStorage.getItem(PENDING_KEY);
        return v === 'secret' || v === 'mcp' ? v : null;
    } catch { return null; }
}
