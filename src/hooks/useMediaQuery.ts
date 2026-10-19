import { useSyncExternalStore } from 'react';

/** Whether `query` matches, kept current as the screen changes; false while prerendering. Queries live in lib/device.ts. */
export default function useMediaQuery(query: string): boolean {
    return useSyncExternalStore(
        onChange => {
            const mq = window.matchMedia(query);
            mq.addEventListener('change', onChange);
            return () => mq.removeEventListener('change', onChange);
        },
        () => window.matchMedia(query).matches,
        () => false,
    );
}
