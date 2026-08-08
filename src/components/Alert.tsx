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

    const handleClose = useCallback(() => {
        if (!alertRef.current) return;
        // Exit animation
        anime({
            targets: alertRef.current,
            translateY: [0, -20],
            opacity: [1, 0],
            scale: [1, 0.95],
            duration: 250,
            easing: 'easeInQuad',
            complete: onClose
        });
    }, [onClose]);

    useEffect(() => {
        if (!alertRef.current) return;
        // Entrance animation
        anime({
            targets: alertRef.current,
            translateY: [-20, 0],
            opacity: [0, 1],
            scale: [0.95, 1],
            duration: 500,
            easing: 'easeOutQuart'
        });
    }, []);

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
