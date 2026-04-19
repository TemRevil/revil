import { useCallback, useRef, useState } from 'react';
import type { AlertType } from '../components/Alert';

type AlertShape = { show: boolean; type: AlertType; message: string; duration?: number } | null;

export default function useSafeAlert(defaultDuration = 4000) {
    const [alert, setAlert] = useState<AlertShape>(null);
    const lastRef = useRef<{ message: string; type: AlertType; t: number } | null>(null);
    // Use a ref to track alert visibility without causing useCallback to recreate
    const alertVisibleRef = useRef(false);

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

        if (duration > 0) {
            setTimeout(() => {
                alertVisibleRef.current = false;
                setAlert(prev => prev ? { ...prev, show: false } : null);
                lastRef.current = null;
            }, duration);
        }
    }, [defaultDuration]);

    const hideAlert = useCallback(() => {
        alertVisibleRef.current = false;
        lastRef.current = null;
        setAlert(prev => prev ? { ...prev, show: false } : null);
    }, []);

    return { alert, showAlert, hideAlert } as const;
}
