import { useState, useRef, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { Calendar as CalendarIcon, ChevronLeft, ChevronRight } from 'lucide-react';

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const WEEKDAYS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];

const pad = (n: number) => String(n).padStart(2, '0');
const toKey = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const parse = (s?: string | null) => {
    if (!s) return null;
    const d = new Date(`${s}T00:00:00`);
    return Number.isNaN(d.getTime()) ? null : d;
};
const sameDay = (a: Date, b: Date) => a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();

interface Props {
    value?: string | null;            // 'YYYY-MM-DD'
    onChange: (v: string) => void;
    isDark: boolean;
    placeholder?: string;
    allowClear?: boolean;
}

/**
 * Custom calendar date picker (portaled popover) - replaces the native
 * <input type="date"> so the look is consistent in light & dark and across
 * browsers. Closes on outside-click / Escape; Escape is captured + stopped so
 * it dismisses the calendar without also closing a surrounding modal.
 */
const DatePicker = ({ value, onChange, isDark, placeholder = 'Select a date', allowClear = true }: Props) => {
    const [open, setOpen] = useState(false);
    const selected = parse(value);
    const [view, setView] = useState<Date>(() => selected || new Date());
    const triggerRef = useRef<HTMLButtonElement>(null);
    const popRef = useRef<HTMLDivElement>(null);
    const [pos, setPos] = useState({ top: 0, left: 0, width: 280, flipUp: false });

    const updatePos = useCallback(() => {
        const el = triggerRef.current;
        if (!el) return;
        const r = el.getBoundingClientRect();
        const popH = 350, gap = 6;
        const spaceBelow = window.innerHeight - r.bottom;
        const flipUp = spaceBelow < popH + gap && r.top > spaceBelow;
        const width = Math.max(264, Math.min(r.width, window.innerWidth - 16));
        let left = r.left;
        left = Math.max(8, Math.min(left, window.innerWidth - width - 8));
        setPos({ top: flipUp ? r.top - gap : r.bottom + gap, left, width, flipUp });
    }, []);

    const openCal = () => { setView(selected || new Date()); updatePos(); setOpen(true); };

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

    const today = new Date();
    const y = view.getFullYear(), m = view.getMonth();
    const firstDow = new Date(y, m, 1).getDay();
    const cells: Date[] = [];
    for (let i = 0; i < 42; i++) cells.push(new Date(y, m, 1 - firstDow + i));

    const pick = (d: Date) => { onChange(toKey(d)); setOpen(false); };

    const triggerCls = `w-full flex items-center justify-between gap-2 px-3.5 py-2.5 rounded-xl border text-sm transition-colors outline-none
        ${isDark ? 'bg-white/5 border-white/10 hover:border-white/20' : 'bg-black/[0.03] border-black/10 hover:border-black/20'}
        ${open ? 'border-blue-400/60' : ''} ${selected ? 'text-primary' : 'text-sec'}`;

    const popover = open ? createPortal(
        <div
            ref={popRef}
            style={{
                position: 'fixed', top: pos.top, left: pos.left, width: pos.width, zIndex: 10000,
                transform: pos.flipUp ? 'translateY(-100%)' : 'none',
            }}
            className={`rounded-2xl border shadow-2xl p-3 ${isDark ? 'bg-[#15151c] border-white/10' : 'bg-white border-black/10'}`}
        >
            {/* Header */}
            <div className="flex items-center justify-between mb-2 px-1">
                <span className="text-sm font-bold text-primary">{MONTHS[m]} {y}</span>
                <div className="flex items-center gap-1">
                    <button type="button" onClick={() => setView(new Date(y, m - 1, 1))} className="p-1.5 rounded-lg text-sec hover:text-primary hover:bg-black/5 dark:hover:bg-white/10 transition-colors"><ChevronLeft size={16} /></button>
                    <button type="button" onClick={() => setView(new Date(y, m + 1, 1))} className="p-1.5 rounded-lg text-sec hover:text-primary hover:bg-black/5 dark:hover:bg-white/10 transition-colors"><ChevronRight size={16} /></button>
                </div>
            </div>
            {/* Weekday row */}
            <div className="grid grid-cols-7 mb-1">
                {WEEKDAYS.map(w => <span key={w} className="text-center text-[11px] font-bold text-sec py-1">{w}</span>)}
            </div>
            {/* Days */}
            <div className="grid grid-cols-7 gap-0.5">
                {cells.map((d, i) => {
                    const inMonth = d.getMonth() === m;
                    const isSel = selected && sameDay(d, selected);
                    const isToday = sameDay(d, today);
                    return (
                        <button
                            key={i}
                            type="button"
                            onClick={() => pick(d)}
                            className={`h-8 rounded-lg text-[13px] font-semibold transition-colors
                                ${isSel ? 'bg-blue-500 text-white shadow' : inMonth ? 'text-primary hover:bg-blue-500/10' : 'text-sec/40 hover:bg-black/5 dark:hover:bg-white/5'}
                                ${isToday && !isSel ? 'ring-1 ring-blue-400/60' : ''}`}
                        >
                            {d.getDate()}
                        </button>
                    );
                })}
            </div>
            {/* Footer */}
            <div className="flex items-center justify-between mt-2 pt-2 border-t border-[var(--section-border)]">
                {allowClear
                    ? <button type="button" onClick={() => { onChange(''); setOpen(false); }} className="text-xs font-semibold text-sec hover:text-red-500 transition-colors px-1">Clear</button>
                    : <span />}
                <button type="button" onClick={() => pick(new Date())} className="text-xs font-semibold text-blue-500 hover:text-blue-600 transition-colors px-1">Today</button>
            </div>
        </div>,
        document.body
    ) : null;

    return (
        <>
            <button ref={triggerRef} type="button" onClick={() => (open ? setOpen(false) : openCal())} className={triggerCls}>
                <span>{selected ? selected.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' }) : placeholder}</span>
                <CalendarIcon size={16} className="text-sec flex-shrink-0" />
            </button>
            {popover}
        </>
    );
};

export default DatePicker;
