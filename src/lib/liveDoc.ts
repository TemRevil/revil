// Firebase (Firestore + App Check, which pulls in reCAPTCHA) is ~160KB gzipped. Nothing on
// the first screen of the homepage or /book needs it before it is drawn, so their eager
// modules reach it only through these helpers: the SDK loads as its own chunk once the
// browser is idle, instead of sitting in front of the first paint.

type Firebase = typeof import('./firebase');

let loading: Promise<Firebase> | null = null;
let held: Promise<unknown> = Promise.resolve();

/**
 * Keeps Firebase from loading until `until` settles. reCAPTCHA alone is ~1s of main-thread
 * work on a phone, and its long tasks stutter the hero's stroke animation (stroke-dashoffset
 * runs on the main thread), so a page holds it until its entrance has played. It also covers
 * a next/dynamic page like /book, whose chunk arrives after the window's load event, so
 * "loaded and idle" can come before anything is drawn.
 */
export function holdFirebase(until: Promise<unknown>): void {
    held = Promise.all([held, until.catch(() => { })]);
}

/** Loads lib/firebase once: after the page has loaded, the main thread has a gap and no hold remains. */
export function loadFirebase(): Promise<Firebase> {
    if (!loading) {
        loading = new Promise<void>((resolve) => {
            const idle = () => {
                if (typeof window.requestIdleCallback === 'function') window.requestIdleCallback(() => resolve(), { timeout: 1500 });
                else setTimeout(resolve, 300);
            };
            if (document.readyState === 'complete') idle();
            else window.addEventListener('load', idle, { once: true });
        }).then(() => held).then(() => import('./firebase'));
    }
    return loading;
}

/** onSnapshot on one document, without Firestore in the caller's bundle. Returns the unsubscribe. */
export function watchDoc(
    path: [string, string],
    onData: (data: Record<string, unknown> | null) => void,
    onError?: (error: unknown) => void,
): () => void {
    let stop: (() => void) | undefined;
    let cancelled = false;
    // Firestore is imported only once lib/firebase is in (which already holds it), so the
    // SDK is not fetched and run ahead of the wait above.
    loadFirebase()
        .then((fb) => import('firebase/firestore').then((fs) => [fb, fs] as const))
        .then(([{ db }, { doc, onSnapshot }]) => {
            if (cancelled) return;
            stop = onSnapshot(doc(db, ...path), (snap) => onData(snap.exists() ? snap.data() : null), onError);
        })
        .catch((error) => onError?.(error));
    return () => {
        cancelled = true;
        stop?.();
    };
}
