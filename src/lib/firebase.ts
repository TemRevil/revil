import { initializeApp } from "firebase/app";
import {
    initializeFirestore,
    persistentLocalCache,
    persistentMultipleTabManager
} from 'firebase/firestore';
import type { AppCheck } from 'firebase/app-check';

const firebaseConfig = {
    apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
    authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
    projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
    storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
    messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
    appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
    measurementId: process.env.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);

// Initialize Firestore with modern multi-tab persistence settings.
// Firestore is the only Firebase SDK kept in the eager bundle — the public site
// (Hero, Projects, Algorithm, SettingsContext, useSocialTracker) reads data on
// first paint. Auth / Storage / Functions / App Check are split into on-demand
// chunks below so the heavy reCAPTCHA Enterprise + auth/storage/functions code
// never blocks the initial load (Lighthouse: TBT / "reduce unused JavaScript").
export const db = initializeFirestore(app, {
    localCache: persistentLocalCache({
        tabManager: persistentMultipleTabManager()
    })
});

// ── App Check (deferred, lazy) ─────────────────────────────────────────
// Previously initialized synchronously at module load, which pulled reCAPTCHA
// Enterprise into the critical first-paint path. Now initialized once, on demand,
// via ensureAppCheck() — called after first paint from Algorithm.tsx. The provider
// SDK is dynamic-imported so it lands in its own chunk. Callers tolerate undefined
// (e.g. the syncSession fetch simply omits the X-Firebase-AppCheck header).
let appCheckInstance: AppCheck | undefined;
let appCheckPromise: Promise<AppCheck | undefined> | undefined;
export function ensureAppCheck(): Promise<AppCheck | undefined> {
    if (typeof window === 'undefined') return Promise.resolve(undefined);
    if (appCheckInstance) return Promise.resolve(appCheckInstance);
    if (appCheckPromise) return appCheckPromise;
    appCheckPromise = (async () => {
        const { initializeAppCheck, ReCaptchaEnterpriseProvider } = await import('firebase/app-check');
        // Enable a FIXED debug token on localhost (see .env.local) so it persists
        // across sessions — register it ONCE in the Firebase console. Must be set
        // before initializeAppCheck().
        if (process.env.NODE_ENV === 'development') {
            // @ts-expect-error — Firebase debug token flag
            self.FIREBASE_APPCHECK_DEBUG_TOKEN = process.env.NEXT_PUBLIC_APPCHECK_DEBUG_TOKEN || true;
        }
        appCheckInstance = initializeAppCheck(app, {
            provider: new ReCaptchaEnterpriseProvider('6LeyDfQsAAAAANACZEBPx9luTXrgcY9zHPF_4uE5'),
            isTokenAutoRefreshEnabled: true,
        });
        return appCheckInstance;
    })();
    return appCheckPromise;
}

// NOTE: Auth / Storage / Functions are intentionally NOT instantiated here.
// Doing so would pull those SDKs into the eager first-paint bundle (this module
// is imported by Hero/Algorithm/SettingsContext). Instead:
//   • Storage  — the contact form dynamic-imports firebase/storage in its upload
//     handler; the admin dashboard (lazy-loaded) calls getStorage(app) locally.
//   • Functions — the contact form dynamic-imports firebase/functions; SecretPage
//     (lazy-loaded) calls getFunctions(app) locally.
//   • Auth     — used only by the lazy-loaded SecretPage via firebase/auth directly.
// The shared `app` (default export) is what each of those passes to getXxx(app).

// Simple online/offline logging (info-level so it never trips the
// "no browser errors logged" Best-Practices audit; silent on success)
if (typeof window !== 'undefined') {
    window.addEventListener('offline', () => {
        console.info("%c[Firebase] Network connectivity lost. Switching to offline mode.", "color: #ff9800; font-weight: bold;");
    });
    window.addEventListener('online', () => {
        console.info("%c[Firebase] Network connectivity restored.", "color: #4caf50; font-weight: bold;");
    });
}

export default app;
