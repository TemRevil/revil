import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'motion/react';
import Handwriting, { fitSize } from './Handwriting';

/** The boil's three turbulence seeds, one per 15fps frame, as the brushes' (book/brushes.ts). */
const SEEDS = [4, 5, 6] as const;

/**
 * The page curtain with "Loading" handwritten on it, boiling at 15 frames a second like
 * the brushes: three copies of the word, each roughened by a different noise seed, shown
 * one per frame by a CSS animation (globals.css, .loading-curtain), so it moves from the
 * first paint of the prerendered page, before any script. When `open` turns false the
 * curtain lifts off the top. `portal` draws it on <body>, over everything (the dashboard).
 */
export default function LoadingCurtain({ open, portal = false }: { open: boolean; portal?: boolean }) {
    const curtain = (
        <AnimatePresence>
            {open && (
                <motion.div
                    key="loading"
                    className="loading-curtain"
                    role="status"
                    exit={{ y: '-100%' }}
                    transition={{ duration: 0.15, ease: [0.76, 0, 0.24, 1] }}
                >
                    <span className="sr-only">Loading</span>
                    <svg width="0" height="0" aria-hidden="true" focusable="false">
                        <defs>
                            {SEEDS.map(seed => (
                                <filter key={seed} id={`loading-boil-${seed}`} x="-10%" y="-10%" width="120%" height="120%">
                                    <feTurbulence type="fractalNoise" baseFrequency="0.05" numOctaves={2} seed={seed} result="w" />
                                    <feDisplacementMap in="SourceGraphic" in2="w" scale={5} xChannelSelector="R" yChannelSelector="G" />
                                </filter>
                            ))}
                        </defs>
                    </svg>
                    <div className="loading-curtain-word" style={{ fontSize: fitSize('Loading') }}>
                        {SEEDS.map(seed => (
                            <span key={seed} className="loading-curtain-frame" style={{ filter: `url(#loading-boil-${seed})` }}>
                                <Handwriting text="Loading" />
                            </span>
                        ))}
                    </div>
                </motion.div>
            )}
        </AnimatePresence>
    );
    return portal ? createPortal(curtain, document.body) : curtain;
}
