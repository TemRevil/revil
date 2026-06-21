import { useState, useRef, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'motion/react';
import { ChevronDown, Check, Search } from 'lucide-react';

interface Props {
    value: string;
    options: string[];
    onChange: (v: string) => void;
    isDark: boolean;
    placeholder?: string;
    searchable?: boolean;
}

/**
 * Custom scrollable select (portaled popover) - same spirit as the timezone
 * menu: no native <select>. Optional fuzzy filter for long lists (e.g. models).
 */
const ScrollMenu = ({ value, options, onChange, isDark, placeholder = 'Select…', searchable = true }: Props) => {
    const [open, setOpen] = useState(false);
    const [query, setQuery] = useState('');
    const triggerRef = useRef<HTMLButtonElement>(null);
    const popRef = useRef<HTMLDivElement>(null);
    const [pos, setPos] = useState({ top: 0, left: 0, width: 280, flipUp: false });

    const updatePos = useCallback(() => {
        const el = triggerRef.current;
        if (!el) return;
        const r = el.getBoundingClientRect();
        const popH = 320, gap = 6;
        const below = window.innerHeight - r.bottom;
        const flipUp = below < popH + gap && r.top > below;
        const width = Math.max(220, Math.min(r.width, window.innerWidth - 16));
        let left = r.left;
        left = Math.max(8, Math.min(left, window.innerWidth - width - 8));
        setPos({ top: flipUp ? r.top - gap : r.bottom + gap, left, width, flipUp });
    }, []);

    useEffect(() => {
        if (!open) return;
        updatePos();
        const onDown = (e: MouseEvent) => {
            if (popRef.current?.contains(e.target as Node) || triggerRef.current?.contains(e.target as Node)) return;
            setOpen(false);
        };
        const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.stopPropagation(); setOpen(false); } };
        const onScroll = () => updatePos();
        document.addEventListener('mousedown', onDown, true);
        document.addEventListener('keydown', onKey, true);
        window.addEventListener('scroll', onScroll, true);
        window.addEventListener('resize', onScroll);
        return () => {
            document.removeEventListener('mousedown', onDown, true);
            document.removeEventListener('keydown', onKey, true);
            window.removeEventListener('scroll', onScroll, true);
            window.removeEventListener('resize', onScroll);
        };
    }, [open, updatePos]);

    const filtered = query ? options.filter(o => o.toLowerCase().includes(query.toLowerCase())) : options;

    const triggerCls = `w-full flex items-center justify-between gap-2 px-3.5 py-2.5 rounded-xl border text-sm transition-colors outline-none
        ${isDark ? 'bg-white/5 border-white/10 hover:border-white/20' : 'bg-black/[0.03] border-black/10 hover:border-black/20'}
        ${open ? 'border-blue-400/60' : ''} ${value ? 'text-primary' : 'text-sec'}`;

    return (
        <>
            <button ref={triggerRef} type="button" onClick={() => { setQuery(''); setOpen(o => !o); }} className={triggerCls} title={value}>
                <span className="truncate">{value || placeholder}</span>
                <ChevronDown size={16} className={`text-sec flex-shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} />
            </button>
            {createPortal(
                <AnimatePresence>
                    {open && (
                        <motion.div
                            key="scrollmenu-pop"
                            ref={popRef}
                            initial={{ opacity: 0, scale: 0.96 }}
                            animate={{ opacity: 1, scale: 1 }}
                            exit={{ opacity: 0, scale: 0.96 }}
                            transition={{ duration: 0.16, ease: [0.16, 1, 0.3, 1] }}
                            transformTemplate={(_, generated) => `translateY(${pos.flipUp ? '-100%' : '0px'}) ${generated}`}
                            style={{ position: 'fixed', top: pos.top, left: pos.left, width: pos.width, zIndex: 10000, transformOrigin: pos.flipUp ? 'bottom center' : 'top center' }}
                            className={`rounded-2xl border shadow-2xl overflow-hidden ${isDark ? 'bg-[#15151c] border-white/10' : 'bg-white border-black/10'}`}
                        >
                            {searchable && options.length > 8 && (
                                <div className={`flex items-center gap-2 px-3 py-2 border-b ${isDark ? 'border-white/10' : 'border-black/10'}`}>
                                    <Search size={14} className="text-sec" />
                                    <input autoFocus value={query} onChange={e => setQuery(e.target.value)} placeholder="Filter…" className="flex-1 bg-transparent outline-none text-sm text-primary placeholder:text-sec" />
                                </div>
                            )}
                            <div className="max-h-[260px] overflow-y-auto custom-scrollbar p-1.5 flex flex-col gap-0.5">
                                {filtered.length === 0 ? (
                                    <div className="px-3 py-4 text-center text-sec text-sm">No matches</div>
                                ) : filtered.map(o => (
                                    <button key={o} type="button" onClick={() => { onChange(o); setOpen(false); }}
                                        className={`w-full flex items-center justify-between gap-2 px-3 py-2 rounded-lg text-left text-sm transition-colors ${o === value ? 'bg-blue-500/15 text-blue-500 font-semibold' : 'text-primary hover:bg-black/5 dark:hover:bg-white/10'}`}>
                                        <span className="truncate">{o}</span>
                                        {o === value && <Check size={15} className="flex-shrink-0" />}
                                    </button>
                                ))}
                            </div>
                        </motion.div>
                    )}
                </AnimatePresence>,
                document.body
            )}
        </>
    );
};

export default ScrollMenu;
