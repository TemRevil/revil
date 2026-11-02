/** The lowercase r of the monogram in public/icon.svg, in its own 512 grid. */
const R = 'M205 190V344M205 232C218 200 262 182 322 194';

/**
 * The R monogram from public/icon.svg, drawn inline so it costs no request and sits in the
 * box an icon would. The crisp r takes currentColor, so it follows the state it is in
 * (muted, hovered, current, either theme); the red and blue split stays behind it. The
 * icon's blur filters are left out: at this size they soften less than a pixel.
 */
const RevilMark = ({ size = 24, className }: { size?: number; className?: string }) => (
    <svg
        width={size}
        height={size}
        viewBox="153 157 220 220"
        fill="none"
        strokeWidth={22}
        strokeLinecap="round"
        strokeLinejoin="round"
        className={className}
        aria-hidden="true"
        focusable="false"
    >
        <path d={R} stroke="#FF3B3B" strokeOpacity={0.55} transform="translate(-11 -4)" />
        <path d={R} stroke="#3A86FF" strokeOpacity={0.55} transform="translate(11 4)" />
        <path d={R} stroke="currentColor" />
    </svg>
);

export default RevilMark;
