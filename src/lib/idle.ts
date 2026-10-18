/**
 * Runs `cb` when the main thread is idle (at the latest after `timeout` ms) and returns a
 * cancel function. Safari, on macOS and iOS, has no requestIdleCallback at all: calling it
 * there threw and took the whole page down, so it falls back to a short timeout.
 */
export function onIdle(cb: () => void, timeout = 1000): () => void {
    if (typeof window.requestIdleCallback === 'function') {
        const handle = window.requestIdleCallback(() => cb(), { timeout });
        return () => window.cancelIdleCallback(handle);
    }
    const handle = window.setTimeout(cb, 50);
    return () => window.clearTimeout(handle);
}

const ACTIVITY = ['scroll', 'wheel', 'pointerdown', 'touchstart', 'keydown'] as const;

/**
 * Like `onIdle`, but first waits until the reader has been still (no scroll, touch, click or
 * key) for `stillMs`: for work that blocks the main thread in one piece, so it lands while
 * they read rather than mid-scroll or under a tap.
 */
export function onQuiet(cb: () => void, stillMs = 1000): () => void {
    let cancelIdle = () => { };
    let timer = 0;
    const arm = () => {
        window.clearTimeout(timer);
        timer = window.setTimeout(() => { stop(); cancelIdle = onIdle(cb, 1000); }, stillMs);
    };
    const stop = () => {
        window.clearTimeout(timer);
        ACTIVITY.forEach(t => window.removeEventListener(t, arm, true));
    };
    ACTIVITY.forEach(t => window.addEventListener(t, arm, { capture: true, passive: true }));
    arm();
    return () => { stop(); cancelIdle(); };
}
