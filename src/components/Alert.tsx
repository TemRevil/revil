import { useEffect } from 'react';
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
    useEffect(() => {
        // Entrance animation
        anime({
            targets: '.custom-alert',
            translateY: [-20, 0],
            opacity: [0, 1],
            scale: [0.9, 1],
            duration: 400,
            easing: 'easeOutElastic(1, .8)'
        });

        if (duration > 0) {
            const timer = setTimeout(() => {
                handleClose();
            }, duration);
            return () => clearTimeout(timer);
        }
    }, [duration]);

    const handleClose = () => {
        // Exit animation
        anime({
            targets: '.custom-alert',
            translateY: [0, -20],
            opacity: [1, 0],
            scale: [1, 0.9],
            duration: 300,
            easing: 'easeInBack',
            complete: onClose
        });
    };

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
            className="custom-alert fixed top-6 right-6 z-[9999] flex items-center gap-3 p-4 rounded-md shadow-lg backdrop-blur-md min-w-[300px] max-w-[400px]"
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
