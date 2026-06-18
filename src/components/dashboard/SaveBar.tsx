import { Save } from 'lucide-react';

interface Props {
    show: boolean;
    onApply: () => void;
    onCancel: () => void;
    isDark: boolean;
    applyLabel?: string;
    cancelLabel?: string;
    saving?: boolean;
}

/**
 * Shared floating "Apply / Cancel" pill for staged-changes screens (D-Settings,
 * Treasury Settings). One component, reused - centered above content and offset
 * for the dashboard sidebar.
 */
const SaveBar = ({ show, onApply, onCancel, isDark, applyLabel = 'Apply Settings', cancelLabel = 'Cancel', saving = false }: Props) => {
    if (!show) return null;
    return (
        <div
            className="fixed bottom-10 z-[5000] flex animate-slide-up pointer-events-none"
            style={{ left: '50%', transform: 'translateX(calc(-50% + (var(--sidebar-width, 0px) / 2)))' }}
        >
            <div
                className="flex items-center gap-3 sm:gap-4 p-2.5 sm:p-4 rounded-full shadow-2xl border pointer-events-auto"
                style={{
                    background: isDark ? 'rgba(10, 10, 12, 0.95)' : 'rgba(255, 255, 255, 0.95)',
                    backdropFilter: 'blur(32px)',
                    WebkitBackdropFilter: 'blur(32px)',
                    borderColor: isDark ? 'rgba(255, 255, 255, 0.15)' : 'rgba(0, 0, 0, 0.08)',
                }}
            >
                <button
                    onClick={onApply}
                    disabled={saving}
                    className="btn-primary px-5 sm:px-8 py-2.5 sm:py-3 rounded-full shadow-2xl shadow-blue-500/20 text-[13px] sm:text-[15px] font-bold flex items-center gap-2 hover:scale-105 transition-all whitespace-nowrap disabled:opacity-60"
                >
                    <Save size={18} className="sm:w-5 sm:h-5" /> {saving ? 'Saving…' : applyLabel}
                </button>
                <button
                    onClick={onCancel}
                    className={`px-5 sm:px-6 py-2.5 sm:py-3 rounded-full border transition-all font-semibold text-[13px] sm:text-[14px] whitespace-nowrap ${isDark
                        ? 'bg-white/5 hover:bg-white/10 text-white border-white/10'
                        : 'bg-black/5 hover:bg-black/10 text-black border-black/10'}`}
                >
                    {cancelLabel}
                </button>
            </div>
        </div>
    );
};

export default SaveBar;
