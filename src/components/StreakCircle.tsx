import { useRef, useEffect, useState, lazy, Suspense } from 'react';
import { motion } from 'motion/react';
import type { LottieRefCurrentProps } from 'lottie-react';
import ErrorBoundary from './ErrorBoundary';

// lottie-react (~heavy) and Fire.json only appear in the below-the-fold Developer
// section, yet were being pulled into the eager first-paint bundle via the static
// App -> ProjectsHub -> Developer -> StreakCircle chain. Lazy-loading the player
// AND dynamic-importing the JSON keeps both out of the critical chunk.
// `import type` above is erased at build, so it adds no runtime weight.
const Lottie = lazy(() => import('lottie-react'));

interface StreakCircleProps {
    streak: number;
    isLoading?: boolean;
}

const StreakCircle = ({ streak, isLoading = false }: StreakCircleProps) => {
    const hasStreak = streak > 0;
    const lottieRef = useRef<LottieRefCurrentProps>(null);
    const [fireData, setFireData] = useState<object | null>(null);

    // Load the animation JSON on demand (kept out of the eager graph).
    useEffect(() => {
        let active = true;
        import('../../public/Fire.json').then((m) => { if (active) setFireData(m.default as object); });
        return () => { active = false; };
    }, []);

    // Ensure the animation is always playing once loaded (resilient to remounts/HMR)
    useEffect(() => {
        if (!fireData) return;
        const id = requestAnimationFrame(() => {
            lottieRef.current?.play();
        });
        return () => cancelAnimationFrame(id);
    }, [fireData]);

    return (
        <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
            style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: 0,
                userSelect: 'none',
            }}
        >
            {/* Fire — lazy-mounted; the 100x100 box is always reserved (no layout shift) */}
            <div
                style={{
                    width: 100,
                    height: 100,
                    filter: hasStreak && !isLoading
                        ? 'drop-shadow(0 6px 18px rgba(255,100,0,0.55))'
                        : 'grayscale(0.85) opacity(0.35)',
                    transition: 'filter 0.5s ease',
                    marginBottom: -8,
                }}
            >
                {fireData && (
                    // Boundary + Suspense both fall back to null: the reserved 100x100
                    // box prevents layout shift, and a failed lottie chunk fetch leaves
                    // the streak number/label intact instead of blanking the section.
                    <ErrorBoundary fallback={null}>
                        <Suspense fallback={null}>
                            <Lottie
                                lottieRef={lottieRef}
                                animationData={fireData}
                                loop
                                autoplay
                                rendererSettings={{ preserveAspectRatio: 'xMidYMid meet' }}
                                style={{ width: '100%', height: '100%' }}
                            />
                        </Suspense>
                    </ErrorBoundary>
                )}
            </div>

            {/* Number — uses page text color so it's always legible */}
            <div
                style={{
                    fontSize: '3rem',
                    fontWeight: 900,
                    lineHeight: 1,
                    fontFamily: 'var(--font-inter)',
                    letterSpacing: '-0.05em',
                    color: isLoading || !hasStreak ? 'var(--text-muted)' : 'var(--text-primary)',
                    transition: 'color 0.4s ease',
                    minWidth: 48,
                    textAlign: 'center',
                }}
            >
                {isLoading ? '—' : streak}
            </div>

            {/* Label */}
            <div
                style={{
                    fontSize: '0.6rem',
                    fontWeight: 800,
                    letterSpacing: '0.14em',
                    textTransform: 'uppercase',
                    color: hasStreak && !isLoading ? 'rgba(255,140,0,0.75)' : 'var(--text-muted)',
                    marginTop: 4,
                    transition: 'color 0.4s ease',
                }}
            >
                day streak
            </div>
        </motion.div>
    );
};

export default StreakCircle;
