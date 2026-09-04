import { useEffect, useState } from 'react';
import { motion, AnimatePresence, useReducedMotion } from 'motion/react';
import { X } from 'lucide-react';
import { useTailor } from '../lib/analytics/useTailor';

/**
 * A line written for one person.
 *
 * When a share link carries a greeting, it arrives here rather than in the hero:
 * the hero's name animation is the page's opening move and nothing should be
 * spliced into it. This waits for that to finish, then settles into the corner
 * where it can be read or dismissed without being in the way.
 */
const APPEAR_AFTER_MS = 3400;

const TailorNote = () => {
    const { Greeting } = useTailor();
    const reduceMotion = useReducedMotion();
    const [ready, setReady] = useState(false);
    const [dismissed, setDismissed] = useState(false);

    useEffect(() => {
        if (!Greeting) return;
        const id = setTimeout(() => setReady(true), APPEAR_AFTER_MS);
        return () => clearTimeout(id);
    }, [Greeting]);

    const show = !!Greeting && ready && !dismissed;

    return (
        <AnimatePresence>
            {show && (
                <motion.div
                    initial={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 14 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 8 }}
                    transition={{ duration: reduceMotion ? 0 : 0.42, ease: [0.16, 1, 0.3, 1] }}
                    className="fixed left-4 bottom-4 z-40 max-w-[min(360px,calc(100vw-2rem))]"
                >
                    <div className="glass-panel flex items-start gap-3 px-4 py-3.5 shadow-lg" style={{ borderRadius: '18px' }}>
                        <p className="text-[13px] leading-relaxed m-0 flex-1" style={{ color: 'var(--text-secondary)' }}>
                            {Greeting}
                        </p>
                        <button
                            type="button"
                            onClick={() => setDismissed(true)}
                            aria-label="Dismiss"
                            className="w-7 h-7 grid place-items-center rounded-lg shrink-0 cursor-pointer transition-colors hover:bg-black/5 dark:hover:bg-white/10"
                            style={{ color: 'var(--text-muted)' }}
                        >
                            <X size={14} />
                        </button>
                    </div>
                </motion.div>
            )}
        </AnimatePresence>
    );
};

export default TailorNote;
