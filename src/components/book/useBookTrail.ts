import { useEffect } from 'react';
import { getToken } from 'firebase/app-check';
import { appCheck } from '../../lib/firebase';
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
            getToken: async () => {
                if (!appCheck) return '';
                const { token } = await getToken(appCheck, false);
                return token;
            },
        });

        // Keep the App Check token warm: the final flush fires during unload, where
        // there is no room to await one.
        let warm: ReturnType<typeof setInterval> | undefined;
        if (appCheck) {
            analytics.warmToken();
            warm = setInterval(() => analytics.warmToken(), 20 * 60 * 1000);
        }

        const onSent = (e: Event) => {
            const d = (e as CustomEvent).detail as { kind?: string; via?: string } | undefined;
            if (d?.kind === 'meeting') analytics.contactSubmit(d.via === 'book' ? 'book' : 'meeting');
        };
        window.addEventListener('revil:contact_sent', onSent);
        return () => {
            if (warm) clearInterval(warm);
            window.removeEventListener('revil:contact_sent', onSent);
        };
    }, []);
}
