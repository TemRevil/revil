import { useState, useRef, useEffect, useLayoutEffect, useCallback, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'motion/react';
import { ChevronDown, Check, Search } from 'lucide-react';

export interface SelectOption {
    value: string;
    label: string;
    /** Optional muted hint shown to the right of the label. */
    hint?: string;
}

interface Props {
    value: string;
    /** Options as {value,label} objects, or plain strings (value === label). */
    options: Array<SelectOption | string>;
    onChange: (value: string) => void;
    placeholder?: string;
    /** Show a filter box for long lists. Defaults on when >8 options. */
    searchable?: boolean;
    /** Force a theme. Omit to auto-detect from the document's `dark` class. */
    isDark?: boolean;
    disabled?: boolean;
    /** Extra classes on the trigger button. */
    className?: string;
    'aria-label'?: string;
}

const normalize = (o: SelectOption | string): SelectOption =>
    typeof o === 'string' ? { value: o, label: o } : o;

/** SSR-safe layout effect. The site is a static export, so the module is evaluated
 *  on the server where useLayoutEffect warns; fall back to useEffect there. */
const useIsoLayoutEffect = typeof window !== 'undefined' ? useLayoutEffect : useEffect;

/** Read the document's current theme (used when `isDark` isn't passed). */
function useAutoDark(forced?: boolean): boolean {
    const [dark, setDark] = useState(() =>
        typeof document !== 'undefined' && document.documentElement.classList.contains('dark'));
    useEffect(() => {
        if (forced !== undefined || typeof document === 'undefined') return;
        const el = document.documentElement;
        const sync = () => setDark(el.classList.contains('dark'));
        sync();
        const obs = new MutationObserver(sync);
        obs.observe(el, { attributes: true, attributeFilter: ['class'] });
        return () => obs.disconnect();
    }, [forced]);
    return forced ?? dark;
}

/**
 * Reusable blurry select: a portaled, glassy popover dropdown that replaces every
 * native <select> and the ad-hoc dropdowns across the app. Same spirit/positioning
 * as the old ScrollMenu, but backdrop-blurred, theme-aware, and value/label based.
 *
 * On open it lands already positioned AND already scrolled so the current value sits
 * centered in the list (measured in a layout effect, before the browser paints) so
 * there's no first-frame flash from (0,0) or from the top of the list. The entry
 * itself springs up from the trigger, iOS-menu style.
 */
const Select = ({
    value, options, onChange, placeholder = 'Select…', searchable, isDark: forcedDark,
    disabled = false, className = '', 'aria-label': ariaLabel,
}: Props) => {
    const isDark = useAutoDark(forcedDark);
    const opts = useMemo(() => options.map(normalize), [options]);
    const selected = opts.find(o => o.value === value);

    const [open, setOpen] = useState(false);
    const [query, setQuery] = useState('');
    const triggerRef = useRef<HTMLButtonElement>(null);
    const popRef = useRef<HTMLDivElement>(null);
    const listRef = useRef<HTMLDivElement>(null);
    const selectedRef = useRef<HTMLButtonElement>(null);
    const [pos, setPos] = useState({ top: 0, left: 0, width: 280, flipUp: false });

    const updatePos = useCallback(() => {
        const el = triggerRef.current;
        if (!el) return;
        const r = el.getBoundingClientRect();
        const popH = 320, gap = 6;
        const below = window.innerHeight - r.bottom;
        const flipUp = below < popH + gap && r.top > below;
        const width = Math.max(200, Math.min(r.width, window.innerWidth - 16));
        let left = r.left;
        left = Math.max(8, Math.min(left, window.innerWidth - width - 8));
        setPos({ top: flipUp ? r.top - gap : r.bottom + gap, left, width, flipUp });
    }, []);

    // Before the first paint of the open menu: fix its screen position AND scroll the
    // current value to the vertical middle. Both use layout metrics (getBoundingClientRect
    // / offsetTop), which are unaffected by the entry scale transform, and run in a layout
    // effect so React flushes them before the browser paints - the menu never appears at
    // (0,0) or scrolled to the top and then jumps.
    useIsoLayoutEffect(() => {
        if (!open) return;
        updatePos();
        const c = listRef.current, el = selectedRef.current;
        if (c && el) {
            c.scrollTop = el.offsetTop - (c.clientHeight - el.offsetHeight) / 2;
        }
    }, [open, updatePos]);

    useEffect(() => {
        if (!open) return;
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

    const showSearch = (searchable ?? opts.length > 8) && opts.length > 8;
    const filtered = query
        ? opts.filter(o => o.label.toLowerCase().includes(query.toLowerCase()))
        : opts;

    const triggerCls = `w-full flex items-center justify-between gap-2 px-3.5 py-2.5 rounded-xl border text-sm transition-colors outline-none
        ${isDark ? 'bg-white/5 border-white/10 hover:border-white/20' : 'bg-black/[0.03] border-black/10 hover:border-black/20'}
        ${open ? 'border-blue-400/60' : ''} ${selected ? 'text-primary' : 'text-sec'}
        ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'} ${className}`;

    return (
        <>
            <button
                ref={triggerRef}
                type="button"
                disabled={disabled}
                aria-label={ariaLabel}
                aria-haspopup="listbox"
                aria-expanded={open}
                onClick={() => {
                    if (disabled) return;
                    setQuery('');
                    // Compute position synchronously so the very first render of the
                    // popover is already placed (belt-and-braces with the layout effect).
                    if (!open) updatePos();
                    setOpen(o => !o);
                }}
                className={triggerCls}
                title={selected?.label || placeholder}
            >
                <span className="truncate">{selected?.label || placeholder}</span>
                <ChevronDown size={16} className={`text-sec flex-shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} />
            </button>
            {createPortal(
                <AnimatePresence>
                    {open && (
                        <motion.div
                            key="select-pop"
                            ref={popRef}
                            role="listbox"
                            initial={{ opacity: 0, scale: 0.9 }}
                            animate={{ opacity: 1, scale: 1 }}
                            exit={{ opacity: 0, scale: 0.94 }}
                            transition={{ type: 'spring', stiffness: 520, damping: 32, mass: 0.7 }}
                            transformTemplate={(_, generated) => `translateY(${pos.flipUp ? '-100%' : '0px'}) ${generated}`}
                            style={{ position: 'fixed', top: pos.top, left: pos.left, width: pos.width, zIndex: 10000, transformOrigin: pos.flipUp ? 'bottom center' : 'top center' }}
                            className={`rounded-2xl border shadow-2xl overflow-hidden backdrop-blur-xl
                                ${isDark ? 'bg-[#15151c]/80 border-white/10' : 'bg-white/80 border-black/10'}`}
                        >
                            {showSearch && (
                                <div className={`flex items-center gap-2 px-3 py-2 border-b ${isDark ? 'border-white/10' : 'border-black/10'}`}>
                                    <Search size={14} className="text-sec" />
                                    <input autoFocus value={query} onChange={e => setQuery(e.target.value)} placeholder="Filter…" className="flex-1 bg-transparent outline-none text-sm text-primary placeholder:text-sec" />
                                </div>
                            )}
                            <div ref={listRef} className="relative max-h-[260px] overflow-y-auto custom-scrollbar p-1.5 flex flex-col gap-0.5">
                                {filtered.length === 0 ? (
                                    <div className="px-3 py-4 text-center text-sec text-sm">No matches</div>
                                ) : filtered.map(o => (
                                    <button
                                        key={o.value}
                                        ref={o.value === value ? selectedRef : undefined}
                                        type="button"
                                        role="option"
                                        aria-selected={o.value === value}
                                        onClick={() => { onChange(o.value); setOpen(false); }}
                                        className={`w-full flex items-center justify-between gap-2 px-3 py-2 rounded-lg text-left text-sm transition-colors ${o.value === value ? 'bg-blue-500/15 text-blue-500 font-semibold' : 'text-primary hover:bg-black/5 dark:hover:bg-white/10'}`}
                                    >
                                        <span className="truncate">{o.label}</span>
                                        {o.hint && <span className="text-sec text-xs flex-shrink-0">{o.hint}</span>}
                                        {o.value === value && <Check size={15} className="flex-shrink-0" />}
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

export default Select;
