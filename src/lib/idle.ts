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

/**
 * Calls `cb` once frames are being drawn steadily again (two gaps in a row under `gap` ms),
 * at the latest after `cap` ms, and returns a cancel function: for an animation that
 * should start after a long task or a heavy first draw rather than during it, where the
 * frames it was timed for would never be shown.
 */
export function whenFramesFlow(cb: () => void, cap = 800, gap = 70): () => void {
    let raf = 0, prev = 0, calm = 0;
    const stop = () => { cancelAnimationFrame(raf); window.clearTimeout(timer); };
    const done = () => { stop(); cb(); };
    const tick = (t: number) => {
        calm = prev && t - prev < gap ? calm + 1 : 0;
        prev = t;
        if (calm >= 2) done();
        else raf = requestAnimationFrame(tick);
    };
    const timer = window.setTimeout(done, cap);
    raf = requestAnimationFrame(tick);
    return stop;
}
