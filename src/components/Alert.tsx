import { useEffect, useCallback, useRef } from 'react';
import { X, CheckCircle, AlertTriangle, AlertCircle, Info } from 'lucide-react';
import anime from 'animejs';

export type AlertType = 'success' | 'error' | 'warning' | 'info';

interface AlertProps {
    type: AlertType;
    message: string;
    onClose: () => void;
    duration?: number;
}

export default function Alert({ type, message, onClose, duration = 3000 }: AlertProps) {
    const alertRef = useRef<HTMLDivElement>(null);
    const closingRef = useRef(false);
    /* Every call site passes an inline `() => hideAlert()`, so `onClose` is a new function
       on each parent render. Holding it in a ref keeps handleClose stable, which keeps the
       auto-dismiss effect below from tearing down and restarting its timer on renders that
       have nothing to do with this toast. */
    const onCloseRef = useRef(onClose);
    // Written in an effect, not during render: the repo's react-hooks rules forbid touching a
    // ref while rendering, and the dismiss timer only reads this long after the commit.
    useEffect(() => { onCloseRef.current = onClose; });

    const handleClose = useCallback(() => {
        if (!alertRef.current || closingRef.current) return;
        // Exit animation. `opacity: [1, 0]` forces opacity back to 1 on the first frame, so
        // running this a second time on an already-faded toast reads as a flash.
        closingRef.current = true;
        anime({
            targets: alertRef.current,
            translateY: [0, -20],
            opacity: [1, 0],
            scale: [1, 0.95],
            duration: 250,
            easing: 'easeInQuad',
            complete: () => onCloseRef.current()
        });
    }, []);

    useEffect(() => {
        if (!alertRef.current) return;
        // Keyed on the content, not just on mount: call sites reuse this one instance for the
        // next toast, and without this a second message would inherit the faded-out element
        // and a closingRef still stuck at true - visible as nothing at all.
        closingRef.current = false;
        // Entrance animation
        anime({
            targets: alertRef.current,
            translateY: [-20, 0],
            opacity: [0, 1],
            scale: [0.95, 1],
            duration: 500,
            easing: 'easeOutQuart'
        });
    }, [message, type]);

    useEffect(() => {
        if (duration > 0) {
            const timer = setTimeout(() => {
                handleClose();
            }, duration);
            return () => clearTimeout(timer);
        }
    }, [duration, handleClose]);

    const styles = {
        success: {
            bg: 'rgba(34, 197, 94, 0.1)',
            border: 'rgb(34, 197, 94)',
            icon: CheckCircle
        },
        error: {
            bg: 'rgba(239, 68, 68, 0.1)',
            border: 'rgb(239, 68, 68)',
            icon: AlertCircle
        },
        warning: {
            bg: 'rgba(234, 179, 8, 0.1)',
            border: 'rgb(234, 179, 8)',
            icon: AlertTriangle
        },
        info: {
            bg: 'rgba(59, 130, 246, 0.1)',
            border: 'rgb(59, 130, 246)',
            icon: Info
        }
    };

    const currentStyle = styles[type];
    const Icon = currentStyle.icon;

    return (
        <div
            ref={alertRef}
            role={type === 'error' || type === 'warning' ? 'alert' : 'status'}
            aria-live={type === 'error' || type === 'warning' ? 'assertive' : 'polite'}
            /* Above the z-[9999] modals. An alert is almost always ABOUT something that just
               happened in a modal, and every modal portals to <body> - so at an equal
               z-index the modal (later in the DOM) covered the alert and every confirmation
               looked like nothing had happened at all. */
            className="custom-alert fixed top-6 right-6 z-[10050] flex items-center gap-3 p-4 rounded-md shadow-lg backdrop-blur-md min-w-[300px] max-w-[400px]"
            style={{ backgroundColor: 'var(--card-bg, #ffffff)', borderLeft: `4px solid ${currentStyle.border}` }}
        >
            <div className="flex items-center justify-center" style={{ color: currentStyle.border }}>
                <Icon size={24} />
            </div>

            <div className="flex-1">
                <p className="text-body font-medium">
                    {message}
                </p>
            </div>

            <button
                onClick={handleClose}
                className="btn-icon text-sec opacity-70 transition-fast hover:opacity-100"
                aria-label="Close alert"
            >
                <X size={18} />
            </button>
        </div>
    );
}
