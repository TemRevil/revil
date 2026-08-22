import { useCallback, useEffect, useRef, useState } from 'react';
import type { AlertType } from '../components/Alert';

type AlertShape = { show: boolean; type: AlertType; message: string; duration?: number } | null;

/** Length of Alert's exit animation. The hook's fallback timer waits this much longer. */
const EXIT_MS = 300;

export default function useSafeAlert(defaultDuration = 4000) {
    const [alert, setAlert] = useState<AlertShape>(null);
    const lastRef = useRef<{ message: string; type: AlertType; t: number } | null>(null);
    // Use a ref to track alert visibility without causing useCallback to recreate
    const alertVisibleRef = useRef(false);
    // Track the auto-dismiss timer so we can clear it on hide / unmount
    const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    const clearTimer = () => {
        if (timerRef.current !== null) {
            clearTimeout(timerRef.current);
            timerRef.current = null;
        }
    };

    const showAlert = useCallback((next: { type: AlertType; message: string; duration?: number }) => {
        const duration = typeof next.duration === 'number' ? next.duration : defaultDuration;
        if (alertVisibleRef.current) return; // already visible, ignore

        const last = lastRef.current;
        if (last && last.message === next.message && last.type === next.type && (Date.now() - last.t) < duration) {
            return; // duplicate within cooldown
        }

        lastRef.current = { message: next.message, type: next.type, t: Date.now() };
        alertVisibleRef.current = true;
        setAlert({ show: true, type: next.type, message: next.message, duration });

        clearTimer(); // never let a previous timer linger
        if (duration > 0) {
            // Alert runs its own 250ms exit animation at `duration` and calls onClose (which
            // is hideAlert) when it finishes. Firing at exactly `duration` here would unmount
            // it on the same tick and the fade would never be seen, so this is a safety net
            // set just past the animation: it only does the work if the animation never lands.
            timerRef.current = setTimeout(() => {
                timerRef.current = null;
                alertVisibleRef.current = false;
                setAlert(prev => (prev && prev.show ? { ...prev, show: false } : prev));
                lastRef.current = null;
            }, duration + EXIT_MS);
        }
    }, [defaultDuration]);

    const hideAlert = useCallback(() => {
        clearTimer(); // cancel the pending auto-dismiss so it can't reset dedupe state later
        alertVisibleRef.current = false;
        lastRef.current = null;
        // Return `prev` untouched when it's already hidden: a fresh object here is a state
        // change, and a state change re-renders the page for a toast nobody can see.
        setAlert(prev => (prev && prev.show ? { ...prev, show: false } : prev));
    }, []);

    // Clear any pending timer on unmount (prevents setState-after-unmount)
    useEffect(() => () => clearTimer(), []);

    return { alert, showAlert, hideAlert } as const;
}
