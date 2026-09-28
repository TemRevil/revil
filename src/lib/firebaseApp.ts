import { initializeApp } from 'firebase/app';
import { initializeAppCheck, ReCaptchaEnterpriseProvider, type AppCheck } from 'firebase/app-check';

// The Firebase app and App Check, without Firestore. The public pages read their few
// documents over Firestore's REST API (lib/liveDoc) and only need the App Check token
// for that, so they load this instead of the ~550KB Firestore SDK in lib/firebase.
const firebaseConfig = {
    apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
    authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
    projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
    storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
    messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
    appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
    measurementId: process.env.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID
};

const app = initializeApp(firebaseConfig);

// App Check with reCAPTCHA Enterprise, registered before anything reads Firestore:
// enforcement is on, so a read (SDK or REST) without a token is refused. Browser only -
// SSR/build skips it. Exported for the callers that attach the token themselves (the
// REST reads, the trackSession POSTs).
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

export default app;
