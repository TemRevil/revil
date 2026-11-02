'use client';

import { useEffect, useState, type MouseEvent } from 'react';
import PageTransition from '../home/PageTransition';
import { isLite } from '../lib/device';

/** How far below the top of the window a section counts as the one being read (px): clear
 *  of the floating top bar, the same as --pj-under-bar in standalone.css. */
const OFFSET = 88;

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
 * a click moves focus to the section and gets there under the homepage's curtain (it
 * sweeps over, the section's name is written, it lifts on the section). On phones (lite,
 * where nothing is blurred and the curtain would be see-through) it glides there instead.
 */
export default function Contents({ items }: { items: { id: string; title: string }[] }) {
    const [active, setActive] = useState(0);
    /** The section the curtain is taking the reader to, and which way (1 down, -1 up). */
    const [jump, setJump] = useState<{ id: string; title: string; direction: number } | null>(null);

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

    const go = (e: MouseEvent<HTMLAnchorElement>, { id, title }: { id: string; title: string }) => {
        const target = document.getElementById(id);
        if (!target || e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
        e.preventDefault();
        if (jump) return;
        const away = target.getBoundingClientRect().top - OFFSET;
        if (isLite()) {
            const calm = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
            window.scrollTo({ top: away + window.scrollY, behavior: calm ? 'auto' : 'smooth' });
        }
        // Already there: nothing to cover.
        if (isLite() || Math.abs(away) < 2) {
            target.focus({ preventScroll: true });
            return;
        }
        setJump({ id, title, direction: away > 0 ? 1 : -1 });
    };

    // Under the curtain: the page jumps to the section, which takes focus.
    const arrive = () => {
        const target = jump && document.getElementById(jump.id);
        if (!target) return;
        window.scrollTo({ top: target.getBoundingClientRect().top + window.scrollY - OFFSET, behavior: 'instant' });
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
                            onClick={(e) => go(e, item)}
                        >
                            {item.title}
                        </a>
                    </li>
                ))}
            </ol>
            <PageTransition
                isTransitioning={jump !== null}
                onCurtainMoving={arrive}
                onTransitionComplete={() => setJump(null)}
                nextSectionName={jump?.title}
                direction={jump?.direction}
            />
        </nav>
    );
}
