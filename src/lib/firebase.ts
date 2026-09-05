import { initializeApp } from "firebase/app";
import {
    initializeFirestore,
    persistentLocalCache,
    persistentSingleTabManager
} from 'firebase/firestore';
import { initializeAppCheck, ReCaptchaEnterpriseProvider, type AppCheck } from 'firebase/app-check';

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

// Initialize App Check with reCAPTCHA Enterprise - EAGERLY, before any Firestore
// read. This ordering is REQUIRED: Firestore App Check enforcement is on, so a read
// issued before App Check is registered goes out with no token and is rejected
// (permission-denied) with no auto-retry. Hero/SettingsContext attach Firestore
// listeners on mount, so App Check must already exist here. (Do NOT defer this.)
// Runs only in the browser - SSR/build skips it. Exported so non-SDK callers (the
// raw fetch() to syncSession) can grab a token for the X-Firebase-AppCheck header.
let appCheck: AppCheck | undefined;
if (typeof window !== 'undefined') {
    // Enable a FIXED debug token on localhost (see .env.local) so it persists across
    // sessions - register it ONCE in the Firebase console. Falling back to `true`
    // makes Firebase mint a random token that must be re-registered each time.
    if (process.env.NODE_ENV === 'development') {
        // @ts-expect-error - Firebase debug token flag
        self.FIREBASE_APPCHECK_DEBUG_TOKEN = process.env.NEXT_PUBLIC_APPCHECK_DEBUG_TOKEN || true;
    }

    appCheck = initializeAppCheck(app, {
        provider: new ReCaptchaEnterpriseProvider('6LeyDfQsAAAAANACZEBPx9luTXrgcY9zHPF_4uE5'),
        isTokenAutoRefreshEnabled: true,
    });
}
export { appCheck };

// Initialize Firestore with on-disk persistence, ONE TAB AT A TIME. Firestore is the
// only Firebase SDK (besides App Check) kept in the eager bundle - the public site
// reads data on first paint. Auth / Storage / Functions are split into on-demand
// chunks (see the lazy accessors used by the contact form, SecretPage, and the
// admin dashboard) so they never block initial load.
//
// The tab manager is SINGLE, never multiple, and that is a correctness fix rather
// than a preference. Under the multi-tab manager only one tab talks to the network:
// it runs every other tab's queries too, signed in as whoever THAT tab is. Sign-in
// here is browserSessionPersistence (see appAuth) - deliberately per-tab - so a
// portfolio tab open beside the dashboard is always a different, signed-out user.
// Whenever the portfolio tab held the lease it re-issued the dashboard's /Analytics
// listeners anonymously, the rules refused all five (they are admin-only), and the
// dashboard showed "Could not load visits." while the refusals piled up in the
// PORTFOLIO tab's console for queries that page never made. Per-tab auth and shared
// cross-tab credentials cannot both be true. Each tab now owns its own connection
// and reads as itself; the second tab simply keeps its cache in memory instead of
// on disk, which is invisible next to being denied outright.
export const db = initializeFirestore(app, {
    localCache: persistentLocalCache({
        tabManager: persistentSingleTabManager({ forceOwnership: false })
    }),
    // Drop `undefined` fields instead of throwing - optional fields (e.g. a
    // project's notes/client/endDate) are commonly undefined and Firestore would
    // otherwise reject the whole write ("Unsupported field value: undefined").
    ignoreUndefinedProperties: true,
});

// NOTE: Auth / Storage / Functions are intentionally NOT instantiated here (they
// would bloat the first-paint bundle and, unlike App Check, are not needed before
// the first Firestore read). The contact form dynamic-imports firebase/storage +
// firebase/functions in its handlers; the lazy-loaded SecretPage and dashboard call
// getStorage(app)/getFunctions(app) locally. They all pass the shared `app` default.

// Simple online/offline logging (info-level so it never trips the "no browser
// errors logged" Best-Practices audit; silent on success)
if (typeof window !== 'undefined') {
    window.addEventListener('offline', () => {
        console.info("%c[Firebase] Network connectivity lost. Switching to offline mode.", "color: #ff9800; font-weight: bold;");
    });
    window.addEventListener('online', () => {
        console.info("%c[Firebase] Network connectivity restored.", "color: #4caf50; font-weight: bold;");
    });
}

export default app;
