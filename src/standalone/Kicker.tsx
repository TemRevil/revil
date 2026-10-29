'use client';

import { useEffect, useRef } from 'react';
import { handwrite } from '../lib/handwrite';
import { Chars } from '../ui/Chars';

/** The handwritten word over a page's title, written in by pen as the page opens. */
export default function Kicker({ text }: { text: string }) {
    const ref = useRef<HTMLDivElement>(null);
    useEffect(() => {
        const ink = handwrite(ref.current, { delay: 150, show: true });
        return () => ink.forEach(a => a.cancel());
    }, []);
    return <div ref={ref} className="pj-kicker" aria-hidden="true" data-write><Chars text={text} /></div>;
}
