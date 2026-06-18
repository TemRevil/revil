import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { AlertTriangle, X, Info, AlertCircle } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

export type ConfirmType = 'danger' | 'warning' | 'info' | 'success';

interface MConfirmModalProps {
    isOpen: boolean;
    title: string;
    message: string;
    confirmText?: string;
    cancelText?: string;
    type?: ConfirmType;
    onConfirm: () => void;
    onClose: () => void;
}

const MConfirmModal = ({
    isOpen,
    title,
    message,
    confirmText = 'Confirm',
    cancelText = 'Cancel',
    type = 'warning',
    onConfirm,
    onClose
}: MConfirmModalProps) => {
    const [isDark, setIsDark] = useState(false);

    useEffect(() => {
        const checkTheme = () => setIsDark(document.documentElement.classList.contains('dark'));
        checkTheme();
        const observer = new MutationObserver(checkTheme);
        observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
        return () => observer.disconnect();
    }, []);

    const getTypeStyles = () => {
        switch (type) {
            case 'danger':
                return {
                    icon: <AlertCircle className="text-red-500" size={28} />,
                    bg: 'rgba(239, 68, 68, 0.1)',
                    border: 'rgba(239, 68, 68, 0.2)',
                    btn: 'bg-red-500 hover:bg-red-600 shadow-red-500/20'
                };
            case 'success':
                return {
                    icon: <AlertCircle className="text-green-500" size={28} />,
                    bg: 'rgba(34, 197, 94, 0.1)',
                    border: 'rgba(34, 197, 94, 0.2)',
                    btn: 'bg-green-500 hover:bg-green-600 shadow-green-500/20'
                };
            case 'info':
                return {
                    icon: <Info className="text-blue-500" size={28} />,
                    bg: 'rgba(59, 130, 246, 0.1)',
                    border: 'rgba(59, 130, 246, 0.2)',
                    btn: 'bg-blue-500 hover:bg-blue-600 shadow-blue-500/20'
                };
            default:
                return {
                    icon: <AlertTriangle className="text-amber-500" size={28} />,
                    bg: 'rgba(245, 158, 11, 0.1)',
                    border: 'rgba(245, 158, 11, 0.2)',
                    btn: 'bg-amber-500 hover:bg-amber-600 shadow-amber-500/20'
                };
        }
    };

    const styles = getTypeStyles();

    return createPortal(
        <AnimatePresence>
            {isOpen && (
                <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.2 }}
                    className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
                >
                    <motion.div
                        initial={{ scale: 0.95, opacity: 0, y: 10 }}
                        animate={{ scale: 1, opacity: 1, y: 0 }}
                        exit={{ scale: 0.95, opacity: 0, y: 10 }}
                        transition={{ type: 'spring', damping: 25, stiffness: 350 }}
                        className={`w-full max-w-md overflow-hidden rounded-2xl shadow-2xl border relative ${isDark ? 'bg-[#0f0f0f] border-white/10' : 'bg-white border-gray-200'}`}
                        style={{ transformOrigin: 'center' }}
                    >
                        {/* Header/Banner Area */}
                        <div
                            className="p-6 flex flex-col items-center text-center gap-4"
                            style={{ background: `linear-gradient(to bottom, ${styles.bg}, transparent)` }}
                        >
                            <div
                                className="w-16 h-16 rounded-2xl flex items-center justify-center border-2 mb-2"
                                style={{ backgroundColor: styles.bg, borderColor: styles.border }}
                            >
                                {styles.icon}
                            </div>
                            <div>
                                <h3 className={`text-xl font-bold mb-2 ${isDark ? 'text-white' : 'text-gray-900'}`}>{title}</h3>
                                <p className={`text-sm leading-relaxed ${isDark ? 'text-gray-400' : 'text-gray-600'}`}>
                                    {message}
                                </p>
                            </div>
                        </div>

                        {/* Footer Buttons */}
                        <div className={`p-4 flex gap-3 ${isDark ? 'bg-white/5' : 'bg-gray-50'}`}>
                            <button
                                onClick={onClose}
                                className={`flex-1 px-4 py-2.5 rounded-xl font-semibold text-sm transition-all ${isDark ? 'hover:bg-white/10 text-gray-300' : 'hover:bg-gray-200 text-gray-700'}`}
                            >
                                {cancelText}
                            </button>
                            <button
                                onClick={() => {
                                    onConfirm();
                                    onClose();
                                }}
                                className={`flex-1 px-4 py-2.5 rounded-xl font-bold text-sm text-white transition-all shadow-lg hover:scale-[1.02] active:scale-[0.98] ${styles.btn}`}
                            >
                                {confirmText}
                            </button>
                        </div>

                        {/* Close Button Top Right */}
                        <button
                            onClick={onClose}
                            className={`absolute top-4 right-4 p-2 rounded-lg transition-all ${isDark ? 'hover:bg-white/10 text-gray-500 hover:text-gray-300' : 'hover:bg-gray-100 text-gray-400 hover:text-gray-600'}`}
                        >
                            <X size={18} />
                        </button>
                    </motion.div>
                </motion.div>
            )}
        </AnimatePresence>,
        document.body
    );
};

export default MConfirmModal;
