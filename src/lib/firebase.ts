import {
    initializeFirestore,
    persistentLocalCache,
    persistentSingleTabManager
} from 'firebase/firestore';
// The app and App Check live in ./firebaseApp (the public pages load only that);
// importing it first keeps App Check registered before the first Firestore read.
import app, { appCheck } from './firebaseApp';

export { appCheck };

// Initialize Firestore with on-disk persistence, ONE TAB AT A TIME. Only the sign-in
// page and the admin dashboard load it; the public pages read over REST (lib/liveDoc).
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
