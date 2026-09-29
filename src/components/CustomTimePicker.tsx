import { useState, useRef, useEffect, type CSSProperties } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'motion/react';
import { Clock, X, Plus } from 'lucide-react';
import Select from './Select';
import { blurFade } from '../lib/modalMotion';

interface Props {
    isDark: boolean;
    /** True when a custom time is the currently-chosen slot (chip fills in + highlights). */
    active: boolean;
    /** The chosen custom time shown on the chip when active, e.g. "08:45 PM". */
    value: string | null;
    /** Called with "HH:MM AM/PM" when the visitor confirms a time. */
    onApply: (time: string) => void;
    /** Optional guard: return an error string to block (surfaced via onError), or null to allow. */
    validate?: (time: string) => string | null;
    onError?: (msg: string) => void;
    /**
     * Optional: return true for a "HH:MM AM/PM" that can no longer be picked (already
     * passed, or taken). Those choices are greyed out and unselectable in the Hour /
     * Minute / Period menus, so an invalid time can't be composed in the first place.
     */
    isUnavailable?: (time: string) => boolean;
    /** Base z-index for the backdrop; the modal sits at +1. Raise it above a host modal
     *  that stacks higher than the default (e.g. Canary's reschedule modal at z 2000). */
    zIndex?: number;
    /** The host's slot styling, so the chip is one more slot in its grid (aria-pressed marks it chosen). */
    className?: string;
    style?: CSSProperties;
}

const HOURS = Array.from({ length: 12 }, (_, i) => String(i + 1));
const MINUTES = ['00', '15', '30', '45'];
const PERIODS = ['AM', 'PM'];

/**
 * The "Custom" (free) slot: the last slot of a slots grid, styled by the host like the
 * others. On click a glassy time picker fades in over it out of a blur. Inside it uses the
 * reusable glassy <Select> for Hour / Minute / Period, so there are no native inputs.
 * Reused by the public booking modal, /book and Canary's reschedule modal.
 */
const CustomTimePicker = ({ isDark, active, value, onApply, validate, onError, isUnavailable, zIndex = 1500, className, style }: Props) => {
    const [open, setOpen] = useState(false);
    const [h, setH] = useState('10');
    const [m, setM] = useState('00');
    const [p, setP] = useState('AM');
    const chipRef = useRef<HTMLButtonElement>(null);
    const [anchor, setAnchor] = useState({ top: 0, left: 0, width: 340 });

    const openPicker = () => {
        // Anchor the picker over the chip, clamped to stay fully on screen.
        const el = chipRef.current;
        if (el) {
            const r = el.getBoundingClientRect();
            const width = Math.min(340, window.innerWidth - 24);
            const estH = 320;
            const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
            const left = Math.max(12, Math.min(cx - width / 2, window.innerWidth - width - 12));
            const top = Math.max(12, Math.min(cy - estH / 2, window.innerHeight - estH - 12));
            setAnchor({ top, left, width });
        }
        setOpen(true);
    };

    // Escape closes the picker and is swallowed (capture + stopPropagation) so a parent
    // modal's own Escape-to-close doesn't also fire underneath it.
    useEffect(() => {
        if (!open) return;
        const onKey = (e: KeyboardEvent) => {
            if (e.key === 'Escape') { e.stopPropagation(); setOpen(false); }
        };
        document.addEventListener('keydown', onKey, true);
        return () => document.removeEventListener('keydown', onKey, true);
    }, [open]);

    // Grey out choices that can no longer produce a valid time. A choice is only disabled
    // when EVERY time reachable through it is unavailable - so "3" stays pickable while any
    // of 3:00/3:15/3:30/3:45 is still open, and PM only dies once the whole afternoon has.
    const at = (hh: string, mm: string, pp: string) => `${hh.padStart(2, '0')}:${mm} ${pp}`;
    const gone = (hh: string, mm: string, pp: string) => !!isUnavailable?.(at(hh, mm, pp));
    const hourOpts = HOURS.map(hh => ({
        value: hh, label: hh,
        disabled: MINUTES.every(mm => gone(hh, mm, p)),
    }));
    const minuteOpts = MINUTES.map(mm => ({
        value: mm, label: mm,
        disabled: gone(h, mm, p),
    }));
    const periodOpts = PERIODS.map(pp => ({
        value: pp, label: pp,
        disabled: HOURS.every(hh => MINUTES.every(mm => gone(hh, mm, pp))),
    }));

    // Changing one menu can strand the others on a now-dead choice (e.g. flipping PM->AM
    // when the morning is gone). Snap to the first still-selectable option, adjusted during
    // render rather than in an effect so a disabled row is never painted as "selected".
    // One field is corrected per pass and each setter moves to a known-enabled value, so
    // this converges instead of looping.
    if (open && isUnavailable) {
        const firstFree = (o: { value: string; disabled: boolean }[]) => o.find(x => !x.disabled)?.value;
        const np = periodOpts.find(o => o.value === p)?.disabled ? firstFree(periodOpts) : undefined;
        const nh = hourOpts.find(o => o.value === h)?.disabled ? firstFree(hourOpts) : undefined;
        const nm = minuteOpts.find(o => o.value === m)?.disabled ? firstFree(minuteOpts) : undefined;
        if (np && np !== p) setP(np);
        else if (nh && nh !== h) setH(nh);
        else if (nm && nm !== m) setM(nm);
    }

    const apply = () => {
        const t = `${h.padStart(2, '0')}:${m} ${p}`;
        const err = validate ? validate(t) : null;
        if (err) { onError?.(err); return; }
        onApply(t);
        setOpen(false);
    };

    const chipActive = active && !!value;

    return (
        <>
            <button
                ref={chipRef}
                type="button"
                onClick={openPicker}
                aria-pressed={chipActive}
                aria-label={chipActive ? `Custom time, ${value}` : 'Pick a custom time'}
                className={className}
                style={style}
            >
                {chipActive ? value : (
                    <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 4 }}>
                        <Plus size={13} aria-hidden="true" />Custom
                    </span>
                )}
            </button>

            {createPortal(
                <AnimatePresence>
                    {open && (
                        <>
                            <motion.div
                                initial={{ opacity: 0 }}
                                animate={{ opacity: 1 }}
                                exit={{ opacity: 0 }}
                                transition={{ duration: 0.2, ease: [0.4, 0, 0.2, 1] }}
                                onClick={() => setOpen(false)}
                                style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.35)', backdropFilter: 'blur(10px)', WebkitBackdropFilter: 'blur(10px)', zIndex }}
                            />
                            <motion.div
                                {...blurFade}
                                role="dialog"
                                aria-modal="true"
                                aria-label="Pick a custom time"
                                onClick={(e) => e.stopPropagation()}
                                className="glass-panel-deep"
                                style={{
                                    position: 'fixed', top: anchor.top, left: anchor.left, width: anchor.width, zIndex: zIndex + 1,
                                    borderRadius: 24, padding: 22, display: 'flex', flexDirection: 'column', gap: 18,
                                    boxShadow: isDark ? '0 30px 80px rgba(0,0,0,0.6)' : '0 30px 80px rgba(0,0,0,0.28)',
                                }}
                            >
                                <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
                                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                        <h3 style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '1.05rem', fontWeight: 700, margin: 0, color: 'var(--text-primary)' }}>
                                            <Clock size={18} /> Custom Time
                                        </h3>
                                        <button
                                            type="button"
                                            onClick={() => setOpen(false)}
                                            aria-label="Close custom time picker"
                                            className="btn-icon rounded-full"
                                            style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', width: 30, height: 30, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                                        >
                                            <X size={17} />
                                        </button>
                                    </div>

                                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
                                        <div>
                                            <label className="input-label font-semibold" style={{ fontSize: '0.72rem' }}>Hour</label>
                                            <Select value={h} onChange={setH} isDark={isDark} searchable={false} aria-label="Hour" options={hourOpts} />
                                        </div>
                                        <div>
                                            <label className="input-label font-semibold" style={{ fontSize: '0.72rem' }}>Minute</label>
                                            <Select value={m} onChange={setM} isDark={isDark} aria-label="Minute" options={minuteOpts} />
                                        </div>
                                        <div>
                                            <label className="input-label font-semibold" style={{ fontSize: '0.72rem' }}>Period</label>
                                            <Select value={p} onChange={setP} isDark={isDark} aria-label="AM or PM" options={periodOpts} />
                                        </div>
                                    </div>

                                    <div style={{ display: 'flex', gap: 10 }}>
                                        <button
                                            type="button"
                                            onClick={() => setOpen(false)}
                                            style={{ flex: 1, padding: 12, borderRadius: 14, border: `1px solid ${isDark ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.1)'}`, background: 'transparent', color: 'var(--text-primary)', fontWeight: 600, cursor: 'pointer' }}
                                        >
                                            Cancel
                                        </button>
                                        <button type="button" onClick={apply} className="btn-primary btn" style={{ flex: 1, padding: 12, borderRadius: 14 }}>
                                            Set Time
                                        </button>
                                    </div>
                                </div>
                            </motion.div>
                        </>
                    )}
                </AnimatePresence>,
                document.body
            )}
        </>
    );
};

export default CustomTimePicker;
