import { motion, useReducedMotion } from 'motion/react';
import FireMark from './FireMark';

interface StreakCircleProps {
    streak: number;
    isLoading?: boolean;
}

const StreakCircle = ({ streak, isLoading = false }: StreakCircleProps) => {
    const hasStreak = streak > 0;
    const reduceMotion = useReducedMotion();

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
            {/* Fire - a fixed 100x100 box (no layout shift) */}
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
                <FireMark still={!!reduceMotion} />
            </div>

            {/* Number - uses page text color so it's always legible */}
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
                {isLoading ? '-' : streak}
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
