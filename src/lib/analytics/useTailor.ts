import { useEffect, useState } from 'react';
import { EMPTY_TAILOR, type LinkTailor } from './types';
import { TAILOR_KEY } from '../../components/Algorithm';

/**
 * What this particular visitor's share link asked the site to do differently.
 *
 * The server resolves the link code and sends the tailoring back on the first
 * flush, which the recorder both stores and announces. Reading the stored copy at
 * mount covers a component that renders after that round-trip; the listener covers
 * one that renders before it.
 */
function readStored(): LinkTailor {
    if (typeof window === 'undefined') return EMPTY_TAILOR;
    try {
        const raw = sessionStorage.getItem(TAILOR_KEY);
        if (!raw) return EMPTY_TAILOR;
        const parsed = JSON.parse(raw) as Partial<LinkTailor>;
        return {
            AutoCv: parsed.AutoCv === true,
            Greeting: typeof parsed.Greeting === 'string' ? parsed.Greeting : '',
            Pinned: Array.isArray(parsed.Pinned) ? parsed.Pinned.filter(p => typeof p === 'string') : [],
        };
    } catch {
        return EMPTY_TAILOR;
    }
}

export function useTailor(): LinkTailor {
    const [tailor, setTailor] = useState<LinkTailor>(readStored);

    useEffect(() => {
        const onTailor = (e: Event) => {
            const detail = (e as CustomEvent).detail as { tailor?: LinkTailor } | undefined;
            if (detail?.tailor) setTailor(detail.tailor);
        };
        window.addEventListener('revil:tailor', onTailor);
        return () => window.removeEventListener('revil:tailor', onTailor);
    }, []);

    return tailor;
}
