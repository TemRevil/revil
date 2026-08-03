import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence, useReducedMotion } from 'motion/react';
import { X } from 'lucide-react';

/**
 * "Revi" - the walking guide character on the public site.
 *
 * Walks along the bottom of the viewport to each thing worth pointing out, says one
 * short line, then moves on. Desktop only, dismissible, and the dismissal sticks.
 *
 * CHARACTER LAYER IS SWAPPABLE. Today it renders <SvgCharacter> (no extra dependency,
 * tiny, fully controllable). When a Rive character (.riv with a state machine exposing
 * `isWalking` / `isPointing` inputs) is ready, drop it in public/ and render a
 * <RiveCharacter> here instead - every behaviour below (pathing, steps, bubbles,
 * dismissal, gating) stays exactly as-is. See CHARACTER SWAP below.
 */

interface Step {
    id: string;
    /** CSS selector for the element to walk to. null = centre of the screen. */
    target: string | null;
    text: string;
}

// Anchored to stable aria-labels already present in the Navbar / Hero.
const STEPS: Step[] = [
    { id: 'welcome', target: null, text: "Hey! I'm Revi. Give me 20 seconds and I'll show you around." },
    { id: 'book', target: '[aria-label="Book a call"]', text: 'Free right now? You can book a call straight from here.' },
    { id: 'stack', target: '[aria-label="Tech stack"]', text: 'This is the tech I actually build with.' },
    { id: 'projects', target: '[aria-label="Projects"]', text: 'And these are the things I have shipped.' },
    { id: 'cv', target: '[aria-label="Open digital CV"]', text: 'Hiring? My full CV opens right here.' },
    { id: 'contact', target: '[aria-label="Open contact form"]', text: 'Or just send a message. That is the whole tour!' },
];

const STORAGE_KEY = 'revil_guide_seen';
const CHAR_W = 76;   // character footprint, used to keep it on-screen
const BOTTOM = 148;  // sits above the bottom-docked navbar

/** Blinking, bobbing, walking SVG character. Pure SVG + motion, no external asset. */
function SvgCharacter({ walking, facing, pointing, reduced }: {
    walking: boolean; facing: 1 | -1; pointing: boolean; reduced: boolean;
}) {
    // Legs/arms swing only while walking; the body bob sells the step rhythm.
    const swing = walking && !reduced;
    const legT = { repeat: Infinity, duration: 0.52, ease: 'easeInOut' as const };

    return (
        <motion.svg
            width={CHAR_W} height={94} viewBox="0 0 76 94" fill="none"
            style={{ transform: `scaleX(${facing})`, overflow: 'visible' }}
            animate={swing ? { y: [0, -3, 0] } : { y: 0 }}
            transition={swing ? { repeat: Infinity, duration: 0.26, ease: 'easeInOut' } : { duration: 0.2 }}
        >
            {/* soft ground shadow */}
            <ellipse cx="38" cy="90" rx="19" ry="3.5" fill="rgba(0,0,0,0.18)" />

            {/* legs */}
            <motion.rect
                x="30" y="62" width="7" height="24" rx="3.5" fill="var(--accent)"
                style={{ originX: '33px', originY: '64px' }}
                animate={swing ? { rotate: [18, -18, 18] } : { rotate: 0 }}
                transition={swing ? legT : { duration: 0.2 }}
            />
            <motion.rect
                x="39" y="62" width="7" height="24" rx="3.5" fill="var(--accent)"
                style={{ originX: '42px', originY: '64px' }}
                animate={swing ? { rotate: [-18, 18, -18] } : { rotate: 0 }}
                transition={swing ? legT : { duration: 0.2 }}
            />

            {/* body */}
            <rect x="24" y="38" width="28" height="28" rx="11" fill="var(--accent)" />

            {/* back arm */}
            <motion.rect
                x="20" y="42" width="6" height="20" rx="3" fill="var(--accent)" opacity="0.75"
                style={{ originX: '23px', originY: '44px' }}
                animate={swing ? { rotate: [-22, 22, -22] } : { rotate: 0 }}
                transition={swing ? legT : { duration: 0.2 }}
            />
            {/* front arm - points at the target when standing still */}
            <motion.rect
                x="50" y="42" width="6" height="20" rx="3" fill="var(--accent)"
                style={{ originX: '53px', originY: '44px' }}
                animate={pointing && !reduced ? { rotate: -122 } : swing ? { rotate: [22, -22, 22] } : { rotate: 0 }}
                transition={pointing ? { type: 'spring', stiffness: 220, damping: 16 } : swing ? legT : { duration: 0.2 }}
            />

            {/* head */}
            <circle cx="38" cy="24" r="17" fill="var(--accent)" />
            {/* face plate keeps the eyes readable on any theme */}
            <circle cx="38" cy="24" r="13" fill="#0b1220" opacity="0.92" />
            {/* eyes - blink by squashing scaleY */}
            <motion.g
                style={{ originX: '38px', originY: '22px' }}
                animate={reduced ? { scaleY: 1 } : { scaleY: [1, 1, 0.12, 1, 1] }}
                transition={reduced ? undefined : { repeat: Infinity, duration: 4.2, times: [0, 0.86, 0.9, 0.94, 1] }}
            >
                <circle cx="32.5" cy="22" r="2.6" fill="#fff" />
                <circle cx="43.5" cy="22" r="2.6" fill="#fff" />
            </motion.g>
            {/* smile */}
            <path d="M33 29.5c1.8 2.2 8.2 2.2 10 0" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" />
        </motion.svg>
    );
}

interface GuideProps {
    /** Only runs while the visitor is on a public section. */
    active: boolean;
}

const Guide = ({ active }: GuideProps) => {
    const reduced = useReducedMotion() ?? false;
    // Desktop only, and never for a visitor who already dismissed it. Resolved in lazy
    // initialisers (the app renders client-side only, so there is no hydration mismatch).
    const [enabled, setEnabled] = useState(() => {
        if (typeof window === 'undefined') return false;
        let seen = false;
        try { seen = localStorage.getItem(STORAGE_KEY) === '1'; } catch { /* private mode */ }
        return !seen && window.matchMedia('(min-width: 768px)').matches;
    });
    const [step, setStep] = useState(0);
    const [x, setX] = useState(() => (typeof window === 'undefined' ? 0 : window.innerWidth / 2 - CHAR_W / 2));
    const [facing, setFacing] = useState<1 | -1>(1);
    const [walking, setWalking] = useState(false);
    const walkTimer = useRef<number | null>(null);

    const current = STEPS[step];

    /** Walk to the horizontal centre of the current step's target. */
    const moveToStep = useCallback((index: number) => {
        const s = STEPS[index];
        if (typeof window === 'undefined') return;
        let destination = window.innerWidth / 2 - CHAR_W / 2;
        if (s?.target) {
            const el = document.querySelector(s.target);
            if (el) {
                const r = el.getBoundingClientRect();
                destination = r.left + r.width / 2 - CHAR_W / 2;
            }
        }
        // Keep the whole character (and its bubble) on-screen.
        destination = Math.max(16, Math.min(window.innerWidth - CHAR_W - 16, destination));
        setX((prev) => {
            if (Math.abs(prev - destination) > 4) setFacing(destination > prev ? 1 : -1);
            return destination;
        });
        if (!reduced) {
            setWalking(true);
            if (walkTimer.current) window.clearTimeout(walkTimer.current);
            walkTimer.current = window.setTimeout(() => setWalking(false), 1150);
        }
    }, [reduced]);

    // Walk on every step change, and re-aim if the window resizes. Deferred to the next
    // frame so the target's layout has settled before we measure it (and so the walk is
    // scheduled rather than set synchronously during the effect).
    useEffect(() => {
        if (!enabled || !active) return;
        let raf = requestAnimationFrame(() => moveToStep(step));
        const onResize = () => {
            cancelAnimationFrame(raf);
            raf = requestAnimationFrame(() => moveToStep(step));
        };
        window.addEventListener('resize', onResize);
        return () => {
            cancelAnimationFrame(raf);
            window.removeEventListener('resize', onResize);
        };
    }, [enabled, active, step, moveToStep]);

    useEffect(() => () => { if (walkTimer.current) window.clearTimeout(walkTimer.current); }, []);

    const dismiss = useCallback(() => {
        setEnabled(false);
        try { localStorage.setItem(STORAGE_KEY, '1'); } catch { /* private mode */ }
    }, []);

    const next = useCallback(() => {
        setStep((s) => {
            if (s >= STEPS.length - 1) { dismiss(); return s; }
            return s + 1;
        });
    }, [dismiss]);

    const isLast = step === STEPS.length - 1;
    // The bubble flips to the character's left near the right edge so it never clips.
    const bubbleFlip = useMemo(
        () => (typeof window !== 'undefined' && x > window.innerWidth - 320),
        [x],
    );

    if (!enabled || !active) return null;

    return createPortal(
        <AnimatePresence>
            <motion.div
                key="guide"
                initial={{ opacity: 0, y: 24 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 24 }}
                transition={{ type: 'spring', stiffness: 260, damping: 26 }}
                // Below modals (1400+) and the navbar's tooltips, above page content.
                className="fixed pointer-events-none"
                style={{ left: 0, bottom: BOTTOM, zIndex: 45 }}
            >
                <motion.div
                    animate={{ x }}
                    transition={reduced ? { duration: 0 } : { type: 'spring', stiffness: 42, damping: 14, mass: 0.9 }}
                    style={{ position: 'relative', width: CHAR_W }}
                >
                    {/* Speech bubble. Intentionally NOT wrapped in AnimatePresence: keying it
                        on the step makes React swap it instantly and play the entry, with no
                        exit animation to wait on (or to leave stranded if a frame is dropped). */}
                    {(
                        <motion.div
                            key={current.id}
                            initial={{ opacity: 0, scale: 0.9, y: 8 }}
                            animate={{ opacity: 1, scale: 1, y: 0 }}
                            transition={{ duration: 0.22 }}
                            className="pointer-events-auto absolute w-[268px] rounded-2xl p-3.5 shadow-xl backdrop-blur-xl"
                            style={{
                                bottom: 104,
                                left: bubbleFlip ? undefined : CHAR_W - 8,
                                right: bubbleFlip ? CHAR_W - 8 : undefined,
                                background: 'var(--card-bg, rgba(255,255,255,0.92))',
                                border: '1px solid var(--section-border)',
                                color: 'var(--text-primary)',
                            }}
                        >
                            <button
                                onClick={dismiss}
                                aria-label="Dismiss the guide"
                                className="absolute top-2 right-2 p-1 rounded-md text-sec hover:text-primary transition-colors"
                            >
                                <X size={13} />
                            </button>
                            <p className="text-[13px] leading-relaxed m-0 pr-4">{current.text}</p>
                            <div className="flex items-center justify-between gap-2 mt-3">
                                <span className="text-[10px] font-bold tracking-wider text-sec">
                                    {step + 1} / {STEPS.length}
                                </span>
                                <div className="flex items-center gap-1.5">
                                    <button
                                        onClick={dismiss}
                                        className="px-2.5 py-1.5 rounded-lg text-[11px] font-semibold text-sec hover:text-primary transition-colors"
                                    >
                                        Skip
                                    </button>
                                    <button
                                        onClick={next}
                                        className="px-3 py-1.5 rounded-lg text-[11px] font-bold text-white transition-transform active:scale-95"
                                        style={{ background: 'var(--accent)' }}
                                    >
                                        {isLast ? 'Got it' : 'Next'}
                                    </button>
                                </div>
                            </div>
                        </motion.div>
                    )}

                    {/* CHARACTER SWAP: replace this one element with <RiveCharacter .../> when a
                        .riv is ready - it receives the same walking/facing/pointing state. */}
                    <SvgCharacter walking={walking} facing={facing} pointing={!walking && !!current.target} reduced={reduced} />
                </motion.div>
            </motion.div>
        </AnimatePresence>,
        document.body,
    );
};

export default Guide;
