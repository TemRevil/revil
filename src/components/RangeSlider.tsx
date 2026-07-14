import { useCallback, useEffect, useRef, useState } from 'react';
import { motion } from 'motion/react';

interface Props {
    value: number;
    onChange: (value: number) => void;
    min?: number;
    max?: number;
    step?: number;
    /** Rendered next to the value, e.g. "%" or " mo". */
    suffix?: string;
    /** Force a theme. Omit to auto-detect from the document's `dark` class. */
    isDark?: boolean;
    disabled?: boolean;
    'aria-label'?: string;
}

const clamp = (n: number, min: number, max: number) => Math.min(max, Math.max(min, n));

/**
 * Reusable glassy range slider. Built from a div + pointer events rather than a native
 * <input type="range"> so it matches the app's look (same rule as <Select>), and it stays
 * keyboard-accessible + screen-reader correct via role="slider" + arrow-key handling.
 */
const RangeSlider = ({
    value, onChange, min = 0, max = 100, step = 1, suffix = '',
    isDark: forcedDark, disabled = false, 'aria-label': ariaLabel,
}: Props) => {
    const [autoDark, setAutoDark] = useState(false);
    useEffect(() => {
        if (forcedDark !== undefined || typeof document === 'undefined') return;
        const el = document.documentElement;
        const sync = () => setAutoDark(el.classList.contains('dark'));
        sync();
        const obs = new MutationObserver(sync);
        obs.observe(el, { attributes: true, attributeFilter: ['class'] });
        return () => obs.disconnect();
    }, [forcedDark]);
    const isDark = forcedDark ?? autoDark;

    const trackRef = useRef<HTMLDivElement>(null);
    const [dragging, setDragging] = useState(false);

    const pct = max > min ? ((clamp(value, min, max) - min) / (max - min)) * 100 : 0;

    /** Map a clientX to the nearest stepped value on the track. */
    const valueFromX = useCallback((clientX: number) => {
        const el = trackRef.current;
        if (!el) return value;
        const r = el.getBoundingClientRect();
        const ratio = clamp((clientX - r.left) / r.width, 0, 1);
        const raw = min + ratio * (max - min);
        return clamp(Math.round(raw / step) * step, min, max);
    }, [min, max, step, value]);

    // Track drags on the window so the thumb keeps following the cursor even when it
    // leaves the track (standard slider behaviour).
    useEffect(() => {
        if (!dragging) return;
        const move = (e: PointerEvent) => onChange(valueFromX(e.clientX));
        const up = () => setDragging(false);
        window.addEventListener('pointermove', move);
        window.addEventListener('pointerup', up);
        window.addEventListener('pointercancel', up);
        return () => {
            window.removeEventListener('pointermove', move);
            window.removeEventListener('pointerup', up);
            window.removeEventListener('pointercancel', up);
        };
    }, [dragging, onChange, valueFromX]);

    const onKeyDown = (e: React.KeyboardEvent) => {
        if (disabled) return;
        const big = (max - min) / 10;
        let next: number | null = null;
        if (e.key === 'ArrowRight' || e.key === 'ArrowUp') next = value + step;
        else if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') next = value - step;
        else if (e.key === 'PageUp') next = value + big;
        else if (e.key === 'PageDown') next = value - big;
        else if (e.key === 'Home') next = min;
        else if (e.key === 'End') next = max;
        if (next !== null) {
            e.preventDefault();
            onChange(clamp(Math.round(next / step) * step, min, max));
        }
    };

    const accent = 'rgb(59, 130, 246)';

    return (
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, opacity: disabled ? 0.5 : 1 }}>
            <div
                ref={trackRef}
                role="slider"
                tabIndex={disabled ? -1 : 0}
                aria-label={ariaLabel}
                aria-valuemin={min}
                aria-valuemax={max}
                aria-valuenow={value}
                aria-valuetext={`${value}${suffix}`}
                aria-disabled={disabled}
                onKeyDown={onKeyDown}
                onPointerDown={(e) => {
                    if (disabled) return;
                    e.preventDefault();
                    setDragging(true);
                    onChange(valueFromX(e.clientX));
                }}
                style={{
                    position: 'relative', flex: 1, height: 28, display: 'flex', alignItems: 'center',
                    cursor: disabled ? 'not-allowed' : 'pointer', outline: 'none', touchAction: 'none',
                }}
            >
                {/* track */}
                <div style={{
                    position: 'absolute', left: 0, right: 0, height: 6, borderRadius: 999,
                    background: isDark ? 'rgba(255,255,255,0.10)' : 'rgba(0,0,0,0.08)',
                }} />
                {/* filled portion */}
                <div style={{
                    position: 'absolute', left: 0, width: `${pct}%`, height: 6, borderRadius: 999,
                    background: accent,
                }} />
                {/* thumb */}
                <motion.div
                    animate={{ scale: dragging ? 1.15 : 1 }}
                    transition={{ type: 'spring', stiffness: 500, damping: 30 }}
                    style={{
                        position: 'absolute', left: `${pct}%`, translateX: '-50%',
                        width: 18, height: 18, borderRadius: '50%', background: '#fff',
                        border: `2px solid ${accent}`,
                        boxShadow: '0 2px 8px rgba(0,0,0,0.25)',
                    }}
                />
            </div>
            <span
                className="tnum"
                style={{
                    minWidth: 52, textAlign: 'right', fontSize: '0.8rem', fontWeight: 700,
                    color: 'var(--text-primary)',
                }}
            >
                {value}{suffix}
            </span>
        </div>
    );
};

export default RangeSlider;
