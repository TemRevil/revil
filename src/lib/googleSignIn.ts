import { GoogleAuthProvider, getRedirectResult, signInWithRedirect, type UserCredential } from 'firebase/auth';
import { appAuth } from './appAuth';
import { PENDING_KEY, type SignInPage } from './signInPending';

export { pendingSignIn } from './signInPending';

/**
 * Google sign-in by redirect: this tab goes to Google and comes back, with no popup
 * window. The return lands on the same URL, so the page that started it reads the
 * result with finishGoogleSignIn().
 *
 * It works in browsers that partition third-party storage because the auth domain
 * (NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN = mcp.temrevil.com, Firebase Hosting serves its
 * /__/auth helper) is the same site as temrevil.com.
 *
 * `where` names the page waiting for the result (sessionStorage, this tab only), so
 * the homepage knows to reopen the secret page after the round trip.
 */
export async function startGoogleSignIn(where: SignInPage): Promise<void> {
    try { sessionStorage.setItem(PENDING_KEY, where); } catch { /* the result is still read on return */ }
    const provider = new GoogleAuthProvider();
    provider.setCustomParameters({ prompt: 'select_account' });
    await signInWithRedirect(appAuth(), provider);
}

/** The sign-in this tab just came back from, or null when there is none. Throws the Firebase error. */
export async function finishGoogleSignIn(): Promise<UserCredential | null> {
    try {
        return await getRedirectResult(appAuth());
    } finally {
        try { sessionStorage.removeItem(PENDING_KEY); } catch { /* nothing to clear */ }
    }
}

/** "Sign-in failed (auth/network-request-failed)": the Firebase code says why. */
export function signInErrorMessage(err: unknown, fallback: string): string {
    const code = (err as { code?: unknown })?.code;
    return typeof code === 'string' ? `${fallback} (${code})` : fallback;
}
