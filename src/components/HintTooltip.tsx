import { useState, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'motion/react';
import { AlertCircle } from 'lucide-react';

interface Props {
    text: string;
    isDark: boolean;
    /** Icon size in px (defaults to 14 to match the inline info glyphs). */
    size?: number;
}

const WIDTH = 260;

/**
 * A small info "(i)" glyph that reveals a glassy tooltip on hover/focus. The tooltip is
 * PORTALED to <body> and fixed-positioned, so it floats over the modal's card frames
 * instead of being clipped by their overflow. Its arrow points straight at the icon, and
 * it's a frosted white sheet in light mode / dark glass in dark mode.
 */
const HintTooltip = ({ text, isDark, size = 14 }: Props) => {
    const [show, setShow] = useState(false);
    const iconRef = useRef<HTMLSpanElement>(null);
    const [pos, setPos] = useState({ left: 0, top: 0, arrow: WIDTH / 2, flipDown: false });

    const place = useCallback(() => {
        const el = iconRef.current;
        if (!el) return;
        const r = el.getBoundingClientRect();
        const gap = 10;
        const iconCX = r.left + r.width / 2;
        const left = Math.max(8, Math.min(iconCX - WIDTH / 2, window.innerWidth - WIDTH - 8));
        // Flip below the icon only when there isn't room above it.
        const flipDown = r.top < 96;
        const top = flipDown ? r.bottom + gap : r.top - gap;
        const arrow = Math.max(14, Math.min(iconCX - left, WIDTH - 14));
        setPos({ left, top, arrow, flipDown });
    }, []);

    const bg = isDark ? 'rgba(22,22,28,0.72)' : 'rgba(255,255,255,0.82)';
    const border = isDark ? 'rgba(255,255,255,0.14)' : 'rgba(0,0,0,0.08)';

    return (
        <>
            <span
                ref={iconRef}
                tabIndex={0}
                aria-label={text}
                onMouseEnter={() => { place(); setShow(true); }}
                onMouseLeave={() => setShow(false)}
                onFocus={() => { place(); setShow(true); }}
                onBlur={() => setShow(false)}
                style={{ display: 'inline-flex', alignItems: 'center', cursor: 'help', outline: 'none' }}
            >
                <AlertCircle size={size} className="opacity-60" />
            </span>
            {createPortal(
                <AnimatePresence>
                    {show && (
                        <motion.div
                            role="tooltip"
                            initial={{ opacity: 0, scale: 0.94 }}
                            animate={{ opacity: 1, scale: 1 }}
                            exit={{ opacity: 0, scale: 0.96 }}
                            transition={{ duration: 0.16, ease: [0.16, 1, 0.3, 1] }}
                            transformTemplate={(_, gen) => `${pos.flipDown ? '' : 'translateY(-100%)'} ${gen}`}
                            style={{
                                position: 'fixed', top: pos.top, left: pos.left, width: WIDTH, zIndex: 10001,
                                transformOrigin: pos.flipDown ? 'top center' : 'bottom center',
                                background: bg,
                                backdropFilter: 'blur(18px) saturate(1.7)',
                                WebkitBackdropFilter: 'blur(18px) saturate(1.7)',
                                border: `1px solid ${border}`,
                                color: 'var(--text-primary)',
                                borderRadius: 12,
                                padding: '10px 12px',
                                fontSize: '0.78rem',
                                lineHeight: 1.5,
                                fontWeight: 500,
                                boxShadow: isDark ? '0 14px 44px rgba(0,0,0,0.5)' : '0 14px 44px rgba(0,0,0,0.16)',
                                pointerEvents: 'none',
                            }}
                        >
                            {text}
                            {/* Arrow, aligned under/over the icon. */}
                            <div style={{
                                position: 'absolute',
                                left: pos.arrow - 7,
                                ...(pos.flipDown ? { bottom: '100%' } : { top: '100%' }),
                                width: 14, height: 7, overflow: 'hidden',
                            }}>
                                <div style={{
                                    width: 12, height: 12,
                                    margin: pos.flipDown ? '0 auto -6px' : '-6px auto 0',
                                    background: bg,
                                    borderLeft: `1px solid ${border}`,
                                    borderTop: `1px solid ${border}`,
                                    transform: 'rotate(45deg)',
                                    backdropFilter: 'blur(18px) saturate(1.7)',
                                    WebkitBackdropFilter: 'blur(18px) saturate(1.7)',
                                }} />
                            </div>
                        </motion.div>
                    )}
                </AnimatePresence>,
                document.body
            )}
        </>
    );
};

export default HintTooltip;
