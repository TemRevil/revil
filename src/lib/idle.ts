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
