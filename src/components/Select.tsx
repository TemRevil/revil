import { useState, useRef, useEffect, useLayoutEffect, useCallback, useMemo, useId, type KeyboardEvent as ReactKeyboardEvent } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'motion/react';
import { ChevronDown, Check, Search } from 'lucide-react';
import { selectTriggerClass } from './selectTrigger';
import { firstEnabled, keyAction, typeahead } from './selectKeys';

export interface SelectOption {
    value: string;
    label: string;
    /** Optional muted hint shown to the right of the label. */
    hint?: string;
    /** Greyed out and unselectable (e.g. a time slot that has already passed). */
    disabled?: boolean;
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

/** Breathing room between the input and the menu. */
const GAP = 6;

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
 *
 * Keyboard: an ARIA select-only combobox (rules in selectKeys.ts). Focus stays on the
 * trigger, or the filter box when there is one; arrows, Home/End, PageUp/PageDown and
 * typing move the active option, Enter/Space choose it, Escape closes the list and is
 * marked handled so the dialog around it stays open.
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
    /** The option the keyboard is on, as an index into the shown (filtered) list. */
    const [active, setActive] = useState(-1);
    const triggerRef = useRef<HTMLButtonElement>(null);
    const popRef = useRef<HTMLDivElement>(null);
    const listRef = useRef<HTMLDivElement>(null);
    const selectedRef = useRef<HTMLDivElement>(null);
    const typed = useRef({ text: '', at: 0 });
    const baseId = useId();
    const listId = `${baseId}-list`;
    const [pos, setPos] = useState({ top: 0, left: 0, width: 280, flipUp: false, triggerH: 40, menuH: 0 });

    const updatePos = useCallback(() => {
        const el = triggerRef.current;
        if (!el) return;
        const r = el.getBoundingClientRect();
        const vw = window.innerWidth, vh = window.innerHeight;
        const width = Math.max(200, Math.min(r.width, vw - 16));
        const left = Math.max(8, Math.min(r.left, vw - width - 8));
        // Sits just under the input (flipping above it when there isn't room) - the menu
        // stays next to the control it belongs to. The entry animation below is what ties
        // the two together.
        const h = popRef.current?.offsetHeight || 0;
        const below = vh - r.bottom;
        const flipUp = h > 0 && below < h + GAP && r.top > below;
        const top = flipUp ? Math.max(8, r.top - GAP - h) : r.bottom + GAP;
        setPos({ top, left, width, flipUp, triggerH: r.height, menuH: h });
    }, []);

    // Shared transition: the menu starts life as the input itself - same width, same box,
    // sitting exactly on top of it (scaled down to the input's height and translated back
    // over it) - then unfolds into place. So the input visibly BECOMES the menu instead of
    // a panel appearing beside it. Falls back to a plain small scale until the height is
    // measured on the first open.
    const grow = pos.menuH ? pos.triggerH / pos.menuH : 0.3;
    const shift = pos.triggerH + GAP;
    const entry = {
        initial: { opacity: 0, scaleY: grow, y: pos.flipUp ? shift : -shift },
        animate: { opacity: 1, scaleY: 1, y: 0 },
        exit: { opacity: 0, scaleY: grow, y: pos.flipUp ? shift : -shift },
    };

    // Before the first paint of the open menu: fix its screen position AND scroll the
    // current value to the vertical middle. Both use layout metrics (getBoundingClientRect
    // / offsetTop), which are unaffected by the entry scale transform, and run in a layout
    // effect so React flushes them before the browser paints - the menu never appears at
    // (0,0) or scrolled to the top and then jumps.
    useIsoLayoutEffect(() => {
        if (!open) return;
        // Scroll the current value to the middle FIRST, then overlay the menu on the
        // trigger using the popover's now-known height. Both happen before the browser
        // paints, so neither the scroll nor the reposition is ever visible.
        const c = listRef.current, el = selectedRef.current;
        if (c && el) {
            // scrollTo({behavior:'instant'}) - NOT `c.scrollTop = x`. The app sets
            // scroll-behavior: smooth globally, so a plain assignment starts an ANIMATED
            // scroll that the very next re-render interrupts, leaving the list at 0. That
            // silently defeated this centring entirely.
            c.scrollTo({ top: el.offsetTop - (c.clientHeight - el.offsetHeight) / 2, behavior: 'instant' });
        }
        updatePos();
    }, [open, updatePos]);

    useEffect(() => {
        if (!open) return;
        const onDown = (e: MouseEvent) => {
            if (popRef.current?.contains(e.target as Node) || triggerRef.current?.contains(e.target as Node)) return;
            setOpen(false);
        };
        const onScroll = () => updatePos();
        document.addEventListener('mousedown', onDown, true);
        window.addEventListener('scroll', onScroll, true);
        window.addEventListener('resize', onScroll);
        return () => {
            document.removeEventListener('mousedown', onDown, true);
            window.removeEventListener('scroll', onScroll, true);
            window.removeEventListener('resize', onScroll);
        };
    }, [open, updatePos]);

    const showSearch = (searchable ?? opts.length > 8) && opts.length > 8;
    const filtered = query
        ? opts.filter(o => o.label.toLowerCase().includes(query.toLowerCase()))
        : opts;
    const selectedIndex = filtered.findIndex(o => o.value === value);
    const optionId = (i: number) => `${baseId}-opt-${i}`;

    // Keep the active option in view as the keyboard moves it (instant: the app scrolls
    // smoothly by default, and a smooth scroll here would lag behind fast key repeats).
    useEffect(() => {
        if (!open || active < 0) return;
        document.getElementById(`${baseId}-opt-${active}`)?.scrollIntoView?.({ block: 'nearest', behavior: 'instant' });
    }, [open, active, baseId]);

    const openAt = (index: number) => {
        if (disabled) return;
        setQuery('');
        // Compute position synchronously so the very first render of the popover is
        // already placed (belt-and-braces with the layout effect).
        updatePos();
        setActive(index);
        setOpen(true);
    };
    const close = () => {
        setOpen(false);
        setActive(-1);
    };
    const choose = (index: number) => {
        const o = filtered[index];
        if (o && !o.disabled) onChange(o.value);
        close();
        triggerRef.current?.focus({ preventScroll: true });
    };

    const onKeyDown = (e: ReactKeyboardEvent, typing: boolean) => {
        const action = keyAction(e, { open, active, selected: selectedIndex, typing }, filtered);
        if (!action) return;
        if (action.kind === 'tab' && !typing) {
            // Choose what the keyboard is on and let Tab carry on to the next control.
            const o = filtered[action.index];
            if (o && !o.disabled) onChange(o.value);
            close();
            return;
        }
        // Handled here: the browser and any dialog around this (it checks defaultPrevented)
        // leave the key alone, so Escape closes only this list.
        e.preventDefault();
        e.stopPropagation();
        switch (action.kind) {
            case 'open': openAt(action.active); break;
            case 'move': if (action.active >= 0) setActive(action.active); break;
            // From the filter box (portaled outside the page), Tab chooses and returns focus to
            // the trigger, so the next Tab carries on from where the control sits.
            case 'tab':
            case 'choose': choose(action.index); break;
            case 'close': close(); triggerRef.current?.focus({ preventScroll: true }); break;
            case 'find': {
                const now = Date.now();
                const t = typed.current;
                t.text = now - t.at > 600 ? action.char : t.text + action.char;
                t.at = now;
                const hit = typeahead(filtered, open ? active : selectedIndex, t.text);
                if (!open) openAt(hit >= 0 ? hit : (selectedIndex >= 0 ? selectedIndex : firstEnabled(filtered)));
                else if (hit >= 0) setActive(hit);
                break;
            }
        }
    };

    const triggerCls = selectTriggerClass(isDark, { open, selected: !!selected, disabled, className });

    return (
        <>
            <button
                ref={triggerRef}
                type="button"
                role="combobox"
                disabled={disabled}
                aria-label={ariaLabel}
                aria-haspopup="listbox"
                aria-expanded={open}
                aria-controls={listId}
                aria-activedescendant={open && active >= 0 && !showSearch ? optionId(active) : undefined}
                onKeyDown={e => onKeyDown(e, false)}
                // A button "clicks" when Space comes back up; Space was already handled on
                // the way down, so that click would undo it.
                onKeyUp={e => { if (e.key === ' ') e.preventDefault(); }}
                onClick={() => {
                    if (disabled) return;
                    if (open) close();
                    else openAt(selectedIndex >= 0 ? selectedIndex : firstEnabled(filtered));
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
                            initial={entry.initial}
                            animate={entry.animate}
                            exit={entry.exit}
                            transition={{
                                default: { type: 'spring', stiffness: 560, damping: 38, mass: 0.7 },
                                // Fade in fast so the squashed first frames of the unfold aren't visible.
                                opacity: { duration: 0.12 },
                            }}
                            style={{
                                position: 'fixed', top: pos.top, left: pos.left, width: pos.width, zIndex: 10000,
                                // Anchor on the edge that touches the input, so it unfolds away from it.
                                transformOrigin: pos.flipUp ? 'bottom center' : 'top center',
                            }}
                            className={`rounded-2xl border shadow-2xl overflow-hidden backdrop-blur-xl
                                ${isDark ? 'bg-[#15151c]/80 border-white/10' : 'bg-white/80 border-black/10'}`}
                        >
                            {showSearch && (
                                <div className={`flex items-center gap-2 px-3 py-2 border-b ${isDark ? 'border-white/10' : 'border-black/10'}`}>
                                    <Search size={14} className="text-sec" />
                                    <input
                                        autoFocus
                                        value={query}
                                        onChange={e => {
                                            const q = e.target.value;
                                            setQuery(q);
                                            const shown = q ? opts.filter(o => o.label.toLowerCase().includes(q.toLowerCase())) : opts;
                                            setActive(firstEnabled(shown));
                                        }}
                                        onKeyDown={e => onKeyDown(e, true)}
                                        role="combobox"
                                        aria-label={`Filter ${ariaLabel ?? 'options'}`}
                                        aria-expanded
                                        aria-controls={listId}
                                        aria-autocomplete="list"
                                        aria-activedescendant={active >= 0 ? optionId(active) : undefined}
                                        placeholder="Filter…"
                                        className="flex-1 bg-transparent outline-none text-sm text-primary placeholder:text-sec"
                                    />
                                </div>
                            )}
                            <div ref={listRef} id={listId} role="listbox" aria-label={ariaLabel} className="relative max-h-[260px] overflow-y-auto custom-scrollbar p-1.5 flex flex-col gap-0.5">
                                {filtered.length === 0 ? (
                                    <div className="px-3 py-4 text-center text-sec text-sm">No matches</div>
                                ) : filtered.map((o, i) => (
                                    <div
                                        key={o.value}
                                        id={optionId(i)}
                                        ref={o.value === value ? selectedRef : undefined}
                                        role="option"
                                        aria-selected={o.value === value}
                                        aria-disabled={o.disabled || undefined}
                                        // Keep focus on the trigger (or the filter box) while clicking.
                                        onMouseDown={e => e.preventDefault()}
                                        onMouseMove={() => { if (!o.disabled && i !== active) setActive(i); }}
                                        // A disabled option stays visible (so the list doesn't jump around as
                                        // time passes) but is inert: no click, no hover, and it never closes
                                        // the menu.
                                        onClick={() => { if (!o.disabled) choose(i); }}
                                        className={`w-full flex items-center justify-between gap-2 px-3 py-2 rounded-lg text-left text-sm transition-colors ${
                                            o.disabled
                                                ? 'text-sec opacity-40 cursor-not-allowed line-through'
                                                : o.value === value
                                                    ? `bg-blue-500/15 text-blue-500 font-semibold cursor-pointer ${i === active ? 'ring-1 ring-inset ring-blue-500/50' : ''}`
                                                    : `text-primary cursor-pointer ${i === active ? 'bg-black/5 dark:bg-white/10' : ''}`
                                        }`}
                                    >
                                        <span className="truncate">{o.label}</span>
                                        {o.hint && <span className="text-sec text-xs flex-shrink-0">{o.hint}</span>}
                                        {!o.disabled && o.value === value && <Check size={15} className="flex-shrink-0" />}
                                    </div>
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
