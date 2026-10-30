/** A word's letters, one span each, for an entrance to bring in one by one. */
export const Chars = ({ text, className }: { text: string; className: string }) => (
    <>{[...text].map((ch, i) => <span key={i} className={className}>{ch === ' ' ? String.fromCharCode(160) : ch}</span>)}</>
);
