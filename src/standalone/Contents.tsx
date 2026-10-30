'use client';

import { useEffect, useState, type MouseEvent } from 'react';

/** How far below the top of the window a section counts as the one being read (px). */
const OFFSET = 32;

/**
 * The index of the section being read: the last heading that has reached OFFSET from the
 * top of the window, or the first while none has.
 */
export const readingIndex = (tops: number[], offset = OFFSET) => {
    let at = 0;
    tops.forEach((top, i) => { if (top <= offset + 1) at = i; });
    return at;
};

/**
 * "On this page": a link to each section, the one being read marked as you scroll. The
 * links are in the prerendered HTML and work as plain anchors without a script; with one,
 * a click glides to the section (or jumps, for less motion) and moves focus to it.
 */
export default function Contents({ items }: { items: { id: string; title: string }[] }) {
    const [active, setActive] = useState(0);

    useEffect(() => {
        const headings = items.map(item => document.getElementById(item.id));
        let frame = 0;
        const update = () => {
            frame = 0;
            // A short last section never reaches the top: at the end of the page it is the one read.
            const atEnd = Math.ceil(window.innerHeight + window.scrollY) >= document.documentElement.scrollHeight - 2;
            setActive(atEnd && window.scrollY > 0
                ? headings.length - 1
                : readingIndex(headings.map(h => h?.getBoundingClientRect().top ?? Infinity)));
        };
        const onScroll = () => { frame ||= requestAnimationFrame(update); };
        update();
        window.addEventListener('scroll', onScroll, { passive: true });
        window.addEventListener('resize', onScroll);
        return () => {
            cancelAnimationFrame(frame);
            window.removeEventListener('scroll', onScroll);
            window.removeEventListener('resize', onScroll);
        };
    }, [items]);

    const go = (e: MouseEvent<HTMLAnchorElement>, id: string) => {
        const target = document.getElementById(id);
        if (!target || e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
        e.preventDefault();
        const calm = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        window.scrollTo({ top: target.getBoundingClientRect().top + window.scrollY - OFFSET, behavior: calm ? 'auto' : 'smooth' });
        target.focus({ preventScroll: true });
    };

    return (
        <nav className="toc" aria-labelledby="toc-label">
            <p id="toc-label" className="toc-label">On this page</p>
            <ol className="toc-list">
                {items.map((item, i) => (
                    <li key={item.id}>
                        <a
                            href={`#${item.id}`}
                            className="toc-link"
                            aria-current={i === active ? 'location' : undefined}
                            onClick={(e) => go(e, item.id)}
                        >
                            {item.title}
                        </a>
                    </li>
                ))}
            </ol>
        </nav>
    );
}
