import { initializeApp } from "firebase/app";
import {
    initializeFirestore,
    persistentLocalCache,
    persistentMultipleTabManager
} from 'firebase/firestore';
import { getAuth } from 'firebase/auth';
import { getStorage } from 'firebase/storage';
import { getFunctions } from 'firebase/functions'; // Used by M-Contact.tsx for httpsCallable
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

// Initialize App Check with reCAPTCHA Enterprise
// This runs only in the browser — SSR/build skips it.
// Exported so non-SDK callers (e.g. the raw fetch() to the syncSession HTTP
// function) can grab a token and attach the X-Firebase-AppCheck header.
let appCheck: AppCheck | undefined;
if (typeof window !== 'undefined') {
    // Enable debug token for localhost development
    if (process.env.NODE_ENV === 'development') {
        // @ts-expect-error — Firebase debug token flag
        self.FIREBASE_APPCHECK_DEBUG_TOKEN = true;
    }

    appCheck = initializeAppCheck(app, {
        provider: new ReCaptchaEnterpriseProvider('6LeyDfQsAAAAANACZEBPx9luTXrgcY9zHPF_4uE5'),
        isTokenAutoRefreshEnabled: true,
    });
}
export { appCheck };

// Initialize Firestore with modern multi-tab persistence settings
export const db = initializeFirestore(app, {
    localCache: persistentLocalCache({
        tabManager: persistentMultipleTabManager()
    })
});

export const auth = getAuth(app);
export const storage = getStorage(app);
export const functions = getFunctions(app);

// Simple online/offline logging (optional, silent on success)
if (typeof window !== 'undefined') {
    window.addEventListener('offline', () => {
        console.warn("%c[Firebase] Network connectivity lost. Switching to offline mode.", "color: #ff9800; font-weight: bold;");
    });
    window.addEventListener('online', () => {
        console.info("%c[Firebase] Network connectivity restored.", "color: #4caf50; font-weight: bold;");
    });
}

export default app;
