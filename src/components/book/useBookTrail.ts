import { useEffect } from 'react';
import { loadFirebase } from '../../lib/liveDoc';
import { analytics } from '../../lib/analytics/collector';
import { BOOK_SECTION } from '../../lib/analytics/types';

/**
 * Records a /book visit in Trails, the way <Algorithm> does for the portfolio.
 *
 * /book is its own route, so App (and Algorithm) never mount here. The visit is
 * recorded under the "book" section, which is how Trails tells it apart from the
 * contact modal: a booking made here is sent as 'book', one made in the modal as
 * 'meeting'. No share-link code is read: the path's last segment is always "book".
 */
export default function useBookTrail() {
    useEffect(() => {
        analytics.start({
            section: BOOK_SECTION,
            code: '',
            // Firebase loads off the first paint; the recorder waits for it here.
            getToken: async () => {
                const { appCheck } = await loadFirebase();
                if (!appCheck) return '';
                const { getToken } = await import('firebase/app-check');
                const { token } = await getToken(appCheck, false);
                return token;
            },
        });

        // Keep the App Check token warm: the final flush fires during unload, where
        // there is no room to await one.
        analytics.warmToken();
        const warm = setInterval(() => analytics.warmToken(), 20 * 60 * 1000);

        const onSent = (e: Event) => {
            const d = (e as CustomEvent).detail as { kind?: string; via?: string } | undefined;
            if (d?.kind === 'meeting') analytics.contactSubmit(d.via === 'book' ? 'book' : 'meeting');
        };
        window.addEventListener('revil:contact_sent', onSent);
        return () => {
            clearInterval(warm);
            window.removeEventListener('revil:contact_sent', onSent);
        };
    }, []);
}
