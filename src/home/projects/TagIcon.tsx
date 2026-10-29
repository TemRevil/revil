'use client';

import type { CSSProperties } from 'react';
import { sanitizeSvg } from '../../lib/sanitize';
import { useHydrated } from '../../hooks/useHydrated';

/**
 * A tag's icon: a picture's address, or SVG markup saved in the dashboard. The markup is
 * cleaned with the browser's own parser, so it draws once the page is hydrated; the
 * prerendered HTML holds an empty box of the same size in its place.
 */
export default function TagIcon({ icon, name, className, style }: { icon: string; name: string; className?: string; style?: CSSProperties }) {
    const hydrated = useHydrated();
    if (/^(https?:|\/)/.test(icon) || icon.includes('/o/')) {
        return <img src={icon} alt={name} className={`object-contain ${className ?? ''}`} style={style} />;
    }
    return (
        <div
            aria-hidden="true"
            className={className}
            style={style}
            dangerouslySetInnerHTML={hydrated ? { __html: sanitizeSvg(icon) } : undefined}
        />
    );
}
