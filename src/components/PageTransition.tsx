import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useBoilHold } from './book/paintKit';
import { whenFramesFlow } from '../lib/idle';
import { prefersReducedMotion } from '../lib/device';
import { useHydrated } from './useHydrated';

interface PageTransitionProps {
    isTransitioning: boolean;
    /** The curtain is moving: the sections can switch and slide under it. */
    onCurtainMoving: () => void;
    onTransitionComplete: () => void;
    nextSectionName?: string;
    direction?: number;
}

const EASE_IN_OUT = 'cubic-bezier(.76, 0, .24, 1)';
/** The curtain's sweep across the page, in and out. */
const SWEEP = 150;
/** Each letter's stroke, the gap between letters, and the fill that follows. */
const WRITE = 100, STAGGER = 30, FILL = 60;
/** How long the written name stays before the curtain lifts. */
const HOLD = 150;
/** With reduced motion: the curtain fades in and out over the page instead of sweeping. */
const FADE = 150;

type Side = 'top' | 'bottom' | 'right' | 'left';
const FAR: Record<Side, Side> = { top: 'bottom', bottom: 'top', left: 'right', right: 'left' };
/** The curtain moved just past one side of the page. */
const past = (side: Side) =>
    side === 'top' ? 'translateY(-100%)' : side === 'bottom' ? 'translateY(100%)' :
        side === 'left' ? 'translateX(-100%)' : 'translateX(100%)';

/**
 * The page switch, in order: the curtain sweeps over the page and the sections slide
 * under it, the name is written once frames are flowing again, and the curtain lifts after
 * the last letter. Each step waits for the one before it: the switch itself is a long task,
 * and the letters timed alongside it were drawn (or skipped) while no frame was shown.
 */
const PageTransition = ({ isTransitioning, onCurtainMoving, onTransitionComplete, nextSectionName = '', direction = 0 }: PageTransitionProps) => {
    useBoilHold(isTransitioning);
    const curtainRef = useRef<HTMLDivElement>(null);
    const svgRef = useRef<SVGSVGElement>(null);
    const hydrated = useHydrated();
    const [fontSize, setFontSize] = useState(100);
    const currentDirection: Side =
        direction === 2 ? 'right' :
            direction === -2 ? 'left' :
                direction > 0 ? 'bottom' : 'top';

    const displayName = nextSectionName.charAt(0).toUpperCase() + nextSectionName.slice(1);

    useEffect(() => {
        const handleResize = () => {
            setFontSize(Math.max(40, Math.min(window.innerWidth / 6, 100)));
        };
        handleResize();
        window.addEventListener('resize', handleResize);
        return () => window.removeEventListener('resize', handleResize);
    }, []);

    // Read from refs, so a parent re-render mid-switch can't restart the sequence.
    const moving = useRef(onCurtainMoving);
    const completed = useRef(onTransitionComplete);
    const size = useRef(fontSize);
    const dir = useRef(currentDirection);
    useEffect(() => {
        moving.current = onCurtainMoving;
        completed.current = onTransitionComplete;
        size.current = fontSize;
        dir.current = currentDirection;
    });

    useEffect(() => {
        const curtain = curtainRef.current;
        if (!isTransitioning || !curtain) return;
        // It comes in from the side the visitor scrolled toward and leaves by the far side,
        // as a transform: the compositor moves it every frame, even while the switch under
        // it keeps the page busy (sized by width or height, it froze there and skipped).
        const d = dir.current;
        const s = curtain.style;
        // Reduced motion: nothing travels. The curtain fades in, the name is simply there,
        // and the curtain fades out.
        const still = prefersReducedMotion();
        const hidden: Keyframe = still ? { opacity: 0 } : { transform: past(d) };
        const shown: Keyframe = still ? { opacity: 1 } : { transform: 'none' };
        const gone: Keyframe = still ? { opacity: 0 } : { transform: past(FAR[d]) };
        if (still) s.opacity = '0'; else s.transform = past(d);
        s.display = 'block';

        const letters = [...(svgRef.current?.querySelectorAll<SVGTSpanElement>('.letter-path') ?? [])];
        const anims: Animation[] = [];
        let live = true, stopWaiting = () => { };
        const run = (el: Element, frames: Keyframe[], o: KeyframeAnimationOptions) => {
            const a = el.animate(frames, o);
            anims.push(a);
            return a.finished;
        };

        const write = (): Promise<unknown> => {
            const L = size.current * 3;
            if (still) {
                letters.forEach(t => { t.style.visibility = 'visible'; t.style.fillOpacity = '1'; t.style.strokeOpacity = '.3'; });
                return Promise.resolve();
            }
            return Promise.all(letters.map((t, i) => {
                const ts = t.style;
                ts.strokeDasharray = `${L}`;
                ts.visibility = 'visible';
                // The stroke draws, then the fill comes in under it and the stroke fades back.
                const delay = i * STAGGER;
                return Promise.all([
                    run(t, [{ strokeDashoffset: L }, { strokeDashoffset: 0 }], { duration: WRITE, delay, easing: 'cubic-bezier(.5, 1, .89, 1)', fill: 'both' }),
                    run(t, [{ fillOpacity: 0, strokeOpacity: 1 }, { fillOpacity: 1, strokeOpacity: .3 }], { duration: FILL, delay: delay + WRITE, easing: 'cubic-bezier(.5, 1, .89, 1)', fill: 'both' }),
                ]);
            }));
        };

        const finish = () => {
            s.display = 'none';
            s.transform = '';
            s.opacity = '';
            letters.forEach(t => { t.style.visibility = 'hidden'; t.style.fillOpacity = ''; t.style.strokeOpacity = ''; });
            anims.forEach(a => a.cancel());
            anims.length = 0;
            completed.current();
        };

        const sweepIn = curtain.animate([hidden, shown], { duration: still ? FADE : SWEEP, easing: EASE_IN_OUT, fill: 'forwards' });
        anims.push(sweepIn);
        // The sections switch once the curtain is on its way: readying them to slide is a
        // long task, and done first it held the curtain back ~0.5s after the scroll.
        void sweepIn.ready.then(() => requestAnimationFrame(() => { if (live) moving.current(); }));
        void sweepIn.finished
            .then(() => {
                if (!live) return;
                return new Promise<void>(r => { stopWaiting = whenFramesFlow(r); });
            })
            .then(() => live ? write() : undefined)
            .then(() => live ? new Promise(r => setTimeout(r, HOLD)) : undefined)
            .then(() => {
                if (!live) return;
                return run(curtain, [shown, gone], { duration: still ? FADE : SWEEP, easing: EASE_IN_OUT, fill: 'forwards' });
            })
            .then(() => { if (live) finish(); })
            .catch(() => { /* cancelled on unmount */ });

        return () => {
            live = false;
            stopWaiting();
            anims.forEach(a => a.cancel());
        };
    }, [isTransitioning]);

    // Portaled to <body>, so only once the page has hydrated (the prerendered HTML has none).
    if (!hydrated) return null;

    return createPortal(
        <div
            ref={curtainRef}
            /* Portaled to <body> at z-1000 so the transition curtain layers ABOVE the
               body-portaled nav/availability tooltips (z-60) - covering them during a
               page transition - while still sitting below modals (z-1400+). */
            className="fixed inset-0 overflow-hidden z-[1000]"
            style={{ backgroundColor: 'transparent', backdropFilter: 'blur(40px)', WebkitBackdropFilter: 'blur(40px)', display: 'none' }}
        >
            <div className="absolute flex items-center justify-center" style={{ top: '50%', left: '50%', transform: 'translate(-50%, -50%)', width: '100%', height: '100%' }}>
                <svg
                    ref={svgRef}
                    width="100%"
                    height="100%"
                    style={{ overflow: 'visible' }}
                >
                    <text
                        x="50%"
                        y="50%"
                        dominantBaseline="central"
                        textAnchor="middle"
                        fontFamily="var(--font-caveat), cursive"
                        fontSize={fontSize}
                        strokeWidth="1.2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        style={{ paintOrder: 'stroke fill', fill: 'var(--text-primary)', fillOpacity: 0, stroke: 'var(--text-primary)', strokeOpacity: 1 }}
                    >
                        {displayName.split('').map((char: string, index: number) => {
                            if (char === ' ') return <tspan key={index}> </tspan>;

                            return (
                                <tspan
                                    key={index}
                                    className="letter-path"
                                    style={{ visibility: 'hidden' }}
                                >
                                    {char}
                                </tspan>
                            );
                        })}
                    </text>
                </svg>
            </div>
        </div>,
        document.body,
    );
};

export default PageTransition;
