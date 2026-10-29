import { useSyncExternalStore } from 'react';

const noSubscribe = () => () => { };

/**
 * False while the prerendered HTML is being hydrated (and on the server), true after and
 * on every later mount. For what only the browser can draw: a portal into <body>, or a
 * value read from this browser's storage. Rendered from it, the first client render
 * matches the HTML, and the browser's own version follows straight after.
 *
 * Kept out of lib/device.ts, which the server layout imports and so can't use hooks.
 */
export const useHydrated = () => useSyncExternalStore(noSubscribe, () => true, () => false);
