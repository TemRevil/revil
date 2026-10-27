import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useBoilHold } from './book/paintKit';
import { whenFramesFlow } from '../lib/idle';

interface PageTransitionProps {
    isTransitioning: boolean;
    onCurtainCovered: () => void;
    onTransitionComplete: () => void;
    nextSectionName?: string;
    direction?: number;
}

const EASE_OUT = 'cubic-bezier(.25, 1, .5, 1)';
const EASE_IN = 'cubic-bezier(.5, 0, .75, 0)';
/** The curtain's sweep across the page, in and out. */
const SWEEP = 450;
/** Each letter's stroke, the gap between letters, and the fill that follows. */
const WRITE = 100, STAGGER = 30, FILL = 60;
/** How long the written name stays before the curtain lifts. */
const HOLD = 150;

type Side = 'top' | 'bottom' | 'right' | 'left';
const FAR: Record<Side, Side> = { top: 'bottom', bottom: 'top', left: 'right', right: 'left' };
/** The curtain moved just past one side of the page. */
const past = (side: Side) =>
    side === 'top' ? 'translateY(-100%)' : side === 'bottom' ? 'translateY(100%)' :
        side === 'left' ? 'translateX(-100%)' : 'translateX(100%)';

/**
 * The page switch, in order: the curtain covers the page, the new section is put in place
 * under it, the name is written once frames are flowing again, and the curtain lifts after
 * the last letter. Each step waits for the one before it: the switch itself is a long task,
 * and the letters timed alongside it were drawn (or skipped) while no frame was shown.
 */
const PageTransition = ({ isTransitioning, onCurtainCovered, onTransitionComplete, nextSectionName = '', direction = 0 }: PageTransitionProps) => {
    useBoilHold(isTransitioning);
    const curtainRef = useRef<HTMLDivElement>(null);
    const svgRef = useRef<SVGSVGElement>(null);
    const [fontSize, setFontSize] = useState(Math.min(window.innerWidth / 6, 100));
    const currentDirection: Side =
        direction === 2 ? 'right' :
            direction === -2 ? 'left' :
                direction > 0 ? 'bottom' : 'top';

    const displayName = nextSectionName.charAt(0).toUpperCase() + nextSectionName.slice(1);

    useEffect(() => {
        const handleResize = () => {
            setFontSize(Math.max(40, Math.min(window.innerWidth / 6, 100)));
        };

        window.addEventListener('resize', handleResize);
        return () => window.removeEventListener('resize', handleResize);
    }, []);

    // Read from refs, so a parent re-render mid-switch can't restart the sequence.
    const covered = useRef(onCurtainCovered);
    const completed = useRef(onTransitionComplete);
    const size = useRef(fontSize);
    const dir = useRef(currentDirection);
    useEffect(() => {
        covered.current = onCurtainCovered;
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
        s.transform = past(d);
        s.display = 'block';

        const letters = [...(svgRef.current?.querySelectorAll<SVGTSpanElement>('.letter-path') ?? [])];
        const anims: Animation[] = [];
        let live = true, stopWaiting = () => { };
        const run = (el: Element, frames: Keyframe[], o: KeyframeAnimationOptions) => {
            const a = el.animate(frames, o);
            anims.push(a);
            return a.finished;
        };

        const write = () => {
            const L = size.current * 3;
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
            letters.forEach(t => { t.style.visibility = 'hidden'; });
            anims.forEach(a => a.cancel());
            anims.length = 0;
            completed.current();
        };

        void run(curtain, [{ transform: past(d) }, { transform: 'none' }], { duration: SWEEP, easing: EASE_OUT, fill: 'forwards' })
            .then(() => {
                if (!live) return;
                covered.current();
                return new Promise<void>(r => { stopWaiting = whenFramesFlow(r); });
            })
            .then(() => live ? write() : undefined)
            .then(() => live ? new Promise(r => setTimeout(r, HOLD)) : undefined)
            .then(() => {
                if (!live) return;
                return run(curtain, [{ transform: 'none' }, { transform: past(FAR[d]) }], { duration: SWEEP, easing: EASE_IN, fill: 'forwards' });
            })
            .then(() => { if (live) finish(); })
            .catch(() => { /* cancelled on unmount */ });

        return () => {
            live = false;
            stopWaiting();
            anims.forEach(a => a.cancel());
        };
    }, [isTransitioning]);

    if (typeof document === 'undefined') return null;

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
