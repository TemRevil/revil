import type { ReactNode } from 'react';

/**
 * Wraps a modal's content when it is rendered only to warm up (see `warm` on Contact and
 * CV): laid out like the real thing, so the browser's style, layout and text caches and the
 * component code are hot for the first real open, but never painted, focused or read aloud.
 */
const WarmHide = ({ warm, children }: { warm?: boolean; children: ReactNode }) =>
    warm ? <div aria-hidden inert style={{ visibility: 'hidden', pointerEvents: 'none' }}>{children}</div> : <>{children}</>;

export default WarmHide;
