import { useMemo } from 'react';
import { motion } from 'motion/react';

interface Props {
    /** The already-formatted string to roll in, e.g. "E£42,000" or "$1,250.50". */
    text: string;
    /** Seconds between each digit starting. Left-to-right cascade. */
    stagger?: number;
    className?: string;
    style?: React.CSSProperties;
}

/** Three 0-9 cycles: the digit is landed on in the MIDDLE one, so a reel can approach it
 *  from a full cycle above OR below without running out of track. */
const CYCLES = 3;
const ROWS = Array.from({ length: 10 * CYCLES }, (_, i) => i % 10);
const LAND_CYCLE = 1; // 0-indexed: the middle cycle

/**
 * A single digit reel. Lands on `digit` in the middle cycle, entering from above or below.
 * Translation is a % of the reel's OWN height, so it's exact regardless of font metrics:
 * the window is one row tall, the reel is 30 rows, so row k sits at -(k/30 * 100)%.
 */
const Reel = ({ digit, index, stagger }: { digit: number; index: number; stagger: number }) => {
    const land = LAND_CYCLE * 10 + digit;
    // Alternate the approach so the row reads as tumbling - some digits drop in from
    // above, some climb from below, like a slot machine settling.
    const fromAbove = index % 2 === 0;
    const start = fromAbove ? land + 10 : land - 10;
    const pct = (k: number) => `-${(k / ROWS.length) * 100}%`;

    return (
        <span
            aria-hidden
            style={{ display: 'inline-block', height: '1em', lineHeight: 1, overflow: 'hidden', verticalAlign: 'baseline' }}
        >
            <motion.span
                initial={{ y: pct(start) }}
                animate={{ y: pct(land) }}
                transition={{ type: 'spring', stiffness: 70, damping: 14, mass: 0.9, delay: index * stagger }}
                style={{ display: 'block' }}
            >
                {ROWS.map((n, k) => (
                    <span key={k} style={{ display: 'block', height: '1em', lineHeight: 1 }}>{n}</span>
                ))}
            </motion.span>
        </span>
    );
};

/**
 * Slot-machine money. Rolls each digit of a formatted amount into place, tumbling in from
 * above and below with a left-to-right cascade. Non-digits (currency symbols, separators,
 * minus signs) stay put so only the numerals move.
 *
 * Takes the FORMATTED string rather than a number, so it can't disagree with whatever
 * formatMoney() would have printed - it renders exactly those characters.
 */
const RollingNumber = ({ text, stagger = 0.045, className = '', style }: Props) => {
    const chars = useMemo(() => Array.from(text ?? ''), [text]);
    // Re-mounting on a value change replays the roll (keyed by the caller if wanted).
    let digitIndex = 0;

    return (
        <span className={className} style={style}>
            {/* The plain string for screen readers + copy/paste; the reels are aria-hidden. */}
            <span className="sr-only">{text}</span>
            <span aria-hidden style={{ display: 'inline-flex', alignItems: 'baseline' }}>
                {chars.map((c, i) => {
                    if (c >= '0' && c <= '9') {
                        const idx = digitIndex++;
                        return <Reel key={i} digit={Number(c)} index={idx} stagger={stagger} />;
                    }
                    return <span key={i}>{c}</span>;
                })}
            </span>
        </span>
    );
};

export default RollingNumber;
