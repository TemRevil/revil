// Firebase (Firestore + App Check, which pulls in reCAPTCHA) is ~160KB gzipped. Nothing on
// the homepage's first screen needs it before it is drawn, so the eager home modules reach
// it only through these helpers: the SDK loads as its own chunk once the browser is idle,
// instead of sitting in front of the first paint.

type Firebase = typeof import('./firebase');

let loading: Promise<Firebase> | null = null;

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
        }).then(() => import('./firebase'));
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
    Promise.all([loadFirebase(), import('firebase/firestore')])
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
