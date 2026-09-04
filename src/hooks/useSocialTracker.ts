import { useState, useEffect, useCallback } from 'react';

/**
 * Records a click on a social link and how long the visitor stayed away.
 *
 * This used to write its own numbered click log straight into Firestore. It no
 * longer touches the database at all: it dispatches the two events the visit
 * recorder listens for, and the Cloud Function rolls the totals up server-side
 * (Analytics/Socials/Items/{name}). One writer, one place, no rate-limit drops.
 */
export const useSocialTracker = () => {
    const [pendingVisit, setPendingVisit] = useState<{ linkName: string; clickTime: number } | null>(null);

    const trackClick = useCallback((linkName: string) => {
        if (!linkName) return;
        window.dispatchEvent(new CustomEvent('revil:social_click', { detail: { name: linkName } }));
        setPendingVisit({ linkName, clickTime: Date.now() });
    }, []);

    useEffect(() => {
        if (!pendingVisit) return;

        // Coming back to the tab is the only signal we get that they returned.
        const handleVisibilityChange = () => {
            if (document.visibilityState !== 'visible') return;
            window.dispatchEvent(new CustomEvent('revil:social_return', {
                detail: { name: pendingVisit.linkName, duration: Date.now() - pendingVisit.clickTime },
            }));
            setPendingVisit(null);
        };

        document.addEventListener('visibilitychange', handleVisibilityChange);
        return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
    }, [pendingVisit]);

    return { trackClick };
};
