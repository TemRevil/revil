// Firebase (Firestore + App Check, which pulls in reCAPTCHA) is ~160KB gzipped. Nothing on
// the first screen of the homepage or /book needs it before it is drawn, so their eager
// modules reach it only through these helpers: the SDK loads as its own chunk once the browser is idle,
// instead of sitting in front of the first paint.

type Firebase = typeof import('./firebase');

let loading: Promise<Firebase> | null = null;
let hold: Promise<unknown> = Promise.resolve();

/**
 * Holds the load back until `until` settles as well. For a page whose own chunk arrives
 * after the window's load event (a next/dynamic page like /book), "loaded and idle" can
 * come before anything is drawn; the page passes its first paint here instead.
 */
export function deferFirebase(until: Promise<unknown>) {
    hold = Promise.all([hold, until.catch(() => { })]);
}

/** Loads lib/firebase once, after the page has loaded and the main thread has a gap. */
export function loadFirebase(): Promise<Firebase> {
    if (!loading) {
        loading = new Promise<void>((resolve) => {
            const idle = () => {
                if (typeof window.requestIdleCallback === 'function') window.requestIdleCallback(() => resolve(), { timeout: 1500 });
                else setTimeout(resolve, 300);
            };
            if (document.readyState === 'complete') idle();
            else window.addEventListener('load', idle, { once: true });
        }).then(() => hold).then(() => import('./firebase'));
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
