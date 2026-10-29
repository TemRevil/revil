/**
 * A handwritten label's letters, one span each, for lib/handwrite to write in by pen.
 * Put them in an element marked `data-write` (globals.css gives the letters room for
 * their tails).
 */
export const Chars = ({ text, className = 'ch' }: { text: string; className?: string }) => (
    <>{[...text].map((ch, i) => <span key={i} className={className}>{ch === ' ' ? String.fromCharCode(160) : ch}</span>)}</>
);
