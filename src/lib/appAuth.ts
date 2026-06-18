import { initializeAuth, getAuth, browserSessionPersistence, browserPopupRedirectResolver, type Auth } from 'firebase/auth';
import app from './firebase';

/**
 * Session-only authentication: the signed-in session lives in sessionStorage,
 * so closing the tab/browser signs the user out (nothing persists to disk).
 *
 * Initialized ONCE with browserSessionPersistence; every auth consumer
 * (SecretPage login, dashboard gate, Treasury/Assistant listeners) must use
 * this so the persistence is consistent and a same-tab refresh still restores
 * the session. Kept in its own (lazy-imported) module so firebase/auth stays
 * out of the public eager bundle.
 */
let cached: Auth | null = null;
export function appAuth(): Auth {
    if (cached) return cached;
    try {
        // popupRedirectResolver is REQUIRED here - initializeAuth (unlike getAuth)
        // doesn't add the default one, so signInWithPopup would throw argument-error.
        cached = initializeAuth(app, {
            persistence: browserSessionPersistence,
            popupRedirectResolver: browserPopupRedirectResolver,
        });
    } catch {
        // Auth was already initialized elsewhere this session - reuse it.
        cached = getAuth(app);
    }
    return cached;
}
