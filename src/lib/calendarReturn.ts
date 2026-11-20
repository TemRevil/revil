/**
 * Coming back from connecting Google Calendar: the server sends the browser to
 * `/?calendar=<outcome>` (functions/src/calendarAuth.ts). The outcome is moved off the
 * address bar into sessionStorage at once, so a reload or a shared URL never repeats
 * it, and the dashboard opens on Settings > Calendar to show it. Kept tiny and
 * dependency-free: the homepage checks it on boot.
 */
const KEY = 'revil:calendar';
const OUTCOMES = ['connected', 'denied', 'expired', 'permissions', 'failed'] as const;
export type CalendarReturn = (typeof OUTCOMES)[number];

const isOutcome = (v: unknown): v is CalendarReturn => typeof v === 'string' && (OUTCOMES as readonly string[]).includes(v);

/** Moves a `?calendar=` outcome into sessionStorage. True when one is waiting. */
export function parkCalendarReturn(): boolean {
    try {
        const url = new URL(window.location.href);
        const v = url.searchParams.get('calendar');
        if (v !== null) {
            url.searchParams.delete('calendar');
            window.history.replaceState(window.history.state, '', url.pathname + url.search + url.hash);
            if (isOutcome(v)) sessionStorage.setItem(KEY, v);
        }
        return isOutcome(sessionStorage.getItem(KEY));
    } catch {
        return false;
    }
}

/** The waiting outcome, if any (clearCalendarReturn once it is shown). */
export function waitingCalendarReturn(): CalendarReturn | null {
    try {
        const v = sessionStorage.getItem(KEY);
        return isOutcome(v) ? v : null;
    } catch {
        return null;
    }
}

/** Forget the outcome, so it is shown once. */
export function clearCalendarReturn(): void {
    try { sessionStorage.removeItem(KEY); } catch { /* nothing to clear */ }
}
