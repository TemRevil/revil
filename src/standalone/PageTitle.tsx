'use client';

import { useEffect, useRef } from 'react';
import { enter } from '../home/entrance';
import { handwrite } from '../lib/handwrite';

/** The same heading entrance and pen timing used in the homepage sections. */
export default function PageTitle({ children }: { children: string }) {
    const headingRef = useRef<HTMLHeadingElement>(null);
    const inkRef = useRef<SVGSVGElement>(null);

    useEffect(() => {
        const heading = enter(headingRef.current, { x: -30 }, { duration: 800, delay: 150 });
        const ink = handwrite(inkRef.current, { delay: 150 });
        return () => {
            heading?.stop();
            ink.forEach(animation => animation.cancel());
        };
    }, []);

    return (
        <div className="pj-heading-title">
            <h1 ref={headingRef} className="pj-display">{children}</h1>
            <svg ref={inkRef} className="pj-title-stroke" viewBox="0 0 360 20" fill="none" aria-hidden="true">
                <path d="M4 13C83 3 188 4 271 9S332 12 355 6" pathLength="1" data-pen="8" stroke="currentColor" strokeWidth="4" strokeLinecap="round" />
                <path d="M36 17C118 11 208 12 287 14" pathLength="1" data-pen="5" stroke="currentColor" strokeWidth="4" strokeLinecap="round" />
            </svg>
        </div>
    );
}
