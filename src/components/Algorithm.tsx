import { useEffect, useRef } from 'react';
import { getToken } from 'firebase/app-check';
import { appCheck } from '../lib/firebase';
import { analytics } from '../lib/analytics/collector';
import { EMPTY_TAILOR, type LinkTailor } from '../lib/analytics/types';

interface AlgorithmProps {
    currentSection: string;
    isContactOpen: boolean;
    // parameter name intentionally unused in the type signature
    onNavigate: (_section: 'home' | 'stack' | 'projects' | 'secret' | 'dashboard' | 'view_link') => void;
}

/** Where a story deep-link from an email parks its id until the dashboard opens. */
export const STORY_KEY = 'revil_open_story';
/** The per-link tailoring the server sent back for this visit. */
export const TAILOR_KEY = 'revil_tailor';

/**
 * The bridge between the app and the visit recorder.
 *
 * Everything about *how* a visit is recorded lives in lib/analytics/collector.ts.
 * This component only translates the app's own vocabulary - section changes, the
 * custom events project cards and social links already dispatch - into calls on it,
 * and hands back the per-link tailoring the server resolves from the URL code.
 */
export const Algorithm = ({ currentSection, isContactOpen, onNavigate }: AlgorithmProps) => {
    const started = useRef(false);
    // Held in a ref so the boot effect below can navigate without re-running when
    // App re-creates the callback. Refs may not be written during render.
    const navigateRef = useRef(onNavigate);
    useEffect(() => { navigateRef.current = onNavigate; }, [onNavigate]);

    // ── boot ─────────────────────────────────────────────────────────────
    useEffect(() => {
        if (started.current) return;
        started.current = true;

        // A story link from a "someone opened your link" email: park the id and send
        // the owner through the normal login. The dashboard picks it up from there.
        try {
            const params = new URLSearchParams(window.location.search);
            const story = params.get('s');
            if (story && /^[a-z0-9-]{6,40}$/.test(story)) {
                sessionStorage.setItem(STORY_KEY, story);
                params.delete('s');
                const rest = params.toString();
                window.history.replaceState({}, '', window.location.pathname + (rest ? `?${rest}` : ''));
                navigateRef.current('secret');
                return;   // the owner's own visit is never a tracked session
            }
        } catch { /* no sessionStorage - fall through and just track the visit */ }

        // The admin half of the site is not a visit worth recording.
        if (currentSection === 'dashboard' || currentSection === 'secret') return;

        // A trailing path segment is a share link code; the server resolves it,
        // so no visitor ever downloads the list of who links were made for.
        const parts = window.location.pathname.split('/').filter(Boolean);
        const code = parts.length ? parts[parts.length - 1] : '';

        // A visit with no code is not a tailored visit, and must be scrubbed of the
        // last one. Tailoring is kept in sessionStorage, which belongs to the TAB
        // rather than the page, so it outlives the link that set it: open a share
        // link and then type temrevil.com in the same tab and the greeting meant for
        // someone else was still there, addressing you by their name. Clearing the
        // store is not enough on its own - anything already mounted has read it - so
        // the empty tailoring is announced the same way a real one would be.
        if (!code) {
            try {
                sessionStorage.removeItem(TAILOR_KEY);
                sessionStorage.removeItem('revil_interviewer_mode');
            } catch { /* private mode - nothing was ever stored */ }
            window.dispatchEvent(new CustomEvent('revil:tailor', { detail: { tailor: EMPTY_TAILOR, link: null } }));
        }

        analytics.start({
            section: currentSection,
            code: /^[A-Za-z0-9_-]{4,32}$/.test(code) ? code : '',
            getToken: async () => {
                if (!appCheck) return '';
                const { token } = await getToken(appCheck, false);
                return token;
            },
            onTailor: (tailor: LinkTailor, link) => {
                try {
                    sessionStorage.setItem(TAILOR_KEY, JSON.stringify(tailor));
                    // Kept for the hero's CV auto-open, which reads this key directly.
                    if (tailor.AutoCv) sessionStorage.setItem('revil_interviewer_mode', 'true');
                    else sessionStorage.removeItem('revil_interviewer_mode');
                } catch { /* private mode - tailoring is skipped, the visit still records */ }
                window.dispatchEvent(new CustomEvent('revil:tailor', { detail: { tailor, link } }));
                // Recognised code: drop the visitor onto the real page.
                if (code) setTimeout(() => navigateRef.current('home'), 400);
            },
        });

        // An unrecognised trailing segment should still land somewhere sensible.
        if (code) {
            const bail = setTimeout(() => navigateRef.current('home'), 2500);
            return () => clearTimeout(bail);
        }
    }, [currentSection]);

    // Keep the App Check token warm: the final flush fires during unload, where
    // there is no room to await one.
    useEffect(() => {
        if (!appCheck) return;
        analytics.warmToken();
        const id = setInterval(() => analytics.warmToken(), 20 * 60 * 1000);
        return () => clearInterval(id);
    }, []);

    // ── the app's own vocabulary ─────────────────────────────────────────
    useEffect(() => {
        if (currentSection === 'dashboard' || currentSection === 'secret') {
            // This browser belongs to the owner. Close the visit and stop counting
            // their own traffic from here on.
            analytics.stop('owner');
            return;
        }
        analytics.setSection(currentSection);
    }, [currentSection]);

    const prevContactOpen = useRef(isContactOpen);
    useEffect(() => {
        if (isContactOpen && !prevContactOpen.current) analytics.contactOpen();
        prevContactOpen.current = isContactOpen;
    }, [isContactOpen]);

    useEffect(() => {
        const detail = <T,>(e: Event): T => (e as CustomEvent).detail as T;

        const handlers: Array<[string, EventListener]> = [
            ['revil:project_open', e => analytics.projectOpen(detail<{ id: string }>(e)?.id)],
            ['revil:project_close', () => analytics.projectClose()],
            ['revil:project_outbound', e => {
                const d = detail<{ id: string; kind: 'live' | 'github' | 'download' }>(e);
                if (d?.id && d?.kind) analytics.projectOutbound(d.id, d.kind);
            }],
            ['revil:social_click', e => analytics.socialClick(detail<{ name: string }>(e)?.name)],
            ['revil:social_return', e => {
                const d = detail<{ name: string; duration?: number }>(e);
                if (d?.name) analytics.socialReturn(d.name, d.duration);
            }],
            ['revil:cv_open', () => analytics.cvOpen()],
            ['revil:contact_tab', e => analytics.contactTabChange(detail<{ tab: string }>(e)?.tab)],
            ['revil:contact_sent', e => {
                const d = detail<{ kind: 'meeting' | 'message' }>(e);
                if (d?.kind) analytics.contactSubmit(d.kind);
            }],
        ];

        handlers.forEach(([name, fn]) => window.addEventListener(name, fn));
        return () => handlers.forEach(([name, fn]) => window.removeEventListener(name, fn));
    }, []);

    return null;
};
