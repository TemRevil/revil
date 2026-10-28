import { initializeFirestore, memoryLocalCache } from 'firebase/firestore';
// The app and App Check live in ./firebaseApp (the public pages load only that);
// importing it first keeps App Check registered before the first Firestore read.
import app from './firebaseApp';

// Firestore for the sign-in page and the admin dashboard; the public pages read over
// REST (lib/liveDoc) and never load this module.
//
// The cache lives in MEMORY, never on disk. Everything read here is private - the
// treasury, visitors' messages, meetings, visit analytics - and sign-in is per tab and
// ends with the tab (browserSessionPersistence, see appAuth). An on-disk cache outlived
// both: the documents stayed in the browser's IndexedDB after the tab closed or the
// owner signed out, readable by anyone who opened that browser profile next. In memory
// they go when the tab does. It also settles the old multi-tab problem for good: with
// no shared on-disk cache there is no tab lease, so every tab owns its own connection
// and reads as its own signed-in user.
export const db = initializeFirestore(app, {
    localCache: memoryLocalCache(),
    // Drop `undefined` fields instead of throwing - optional fields (e.g. a
    // project's notes/client/endDate) are commonly undefined and Firestore would
    // otherwise reject the whole write ("Unsupported field value: undefined").
    ignoreUndefinedProperties: true,
});

// Earlier builds kept that cache on disk, so a browser that ran one still holds a copy.
// Delete it by its SDK name directly rather than through clearIndexedDbPersistence: that
// runs on Firestore's own queue, and a tab of an old build still holding the database
// open would block the delete, and every read queued behind it, until that tab closed.
if (typeof window !== 'undefined' && typeof indexedDB !== 'undefined' && app.options.projectId) {
    try {
        indexedDB.deleteDatabase(`firestore/${app.name}/${app.options.projectId}/main`);
    } catch { /* storage blocked (private mode): there is no old cache to clear */ }
}

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
