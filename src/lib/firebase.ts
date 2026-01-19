import { initializeApp } from "firebase/app";
import {
    initializeFirestore,
    persistentLocalCache,
    persistentMultipleTabManager
} from 'firebase/firestore';
import { getAuth } from 'firebase/auth';
import { getStorage } from 'firebase/storage';
import { getFunctions } from 'firebase/functions';

const firebaseConfig = {
    apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
    authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
    projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
    storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
    messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
    appId: import.meta.env.VITE_FIREBASE_APP_ID,
    measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);

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
