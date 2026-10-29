'use client';

import { useEffect, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';

const STEP_MS = 5000;

/**
 * A project page's pictures and videos, shown one at a time like the project's window on
 * the homepage: videos first, a picture moves on by itself every few seconds (not while a
 * video shows, the pointer or focus is on it, or the visitor asked for less motion), and
 * the arrows and dots move by hand. Every one is in the prerendered HTML; the ones not
 * shown are hidden from the keyboard and screen readers.
 */
export default function ProjectGallery({ name, media }: { name: string; media: { url: string; video: boolean }[] }) {
    const [at, setAt] = useState(0);
    const [held, setHeld] = useState(false);
    const stage = useRef<HTMLDivElement>(null);
    const count = media.length;
    const current = media[at];

    // A video stops when it is no longer the one shown.
    useEffect(() => {
        stage.current?.querySelectorAll<HTMLVideoElement>('[aria-hidden="true"] video').forEach(v => v.pause());
    }, [at]);

    useEffect(() => {
        if (count < 2 || held || current?.video || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
        const timer = setTimeout(() => setAt(i => (i + 1) % count), STEP_MS);
        return () => clearTimeout(timer);
    }, [at, count, held, current?.video]);

    if (!count) return null;
    const go = (step: number) => setAt(i => (i + step + count) % count);

    return (
        <section
            className="pj-hero"
            aria-roledescription="carousel"
            aria-label={`${name} pictures`}
            onMouseEnter={() => setHeld(true)}
            onMouseLeave={() => setHeld(false)}
            onFocus={() => setHeld(true)}
            onBlur={(e) => { if (!e.currentTarget.contains(e.relatedTarget)) setHeld(false); }}
        >
            {!current.video && <div className="pj-hero-glow" style={{ backgroundImage: `url("${current.url}")` }} aria-hidden="true" />}
            <div className="pj-hero-name" aria-hidden="true">{name}</div>
            <div className="pj-stage" ref={stage}>
                {media.map((m, i) => (
                    <figure
                        key={m.url}
                        className="pj-slide"
                        data-shown={i === at || undefined}
                        aria-roledescription="slide"
                        aria-label={`${i + 1} of ${count}`}
                        aria-hidden={i !== at}
                        inert={i !== at}
                    >
                        {m.video
                            ? <video src={m.url} controls muted playsInline preload="metadata" aria-label={`${name} video`} />
                            : <img src={m.url} alt={`${name} screenshot ${i + 1}`} loading={i === 0 ? 'eager' : 'lazy'} decoding="async" />}
                    </figure>
                ))}
                {count > 1 && (
                    <>
                        <button type="button" className="pj-step prev" aria-label="Previous picture" onClick={() => go(-1)}>
                            <ChevronLeft size={22} />
                        </button>
                        <button type="button" className="pj-step next" aria-label="Next picture" onClick={() => go(1)}>
                            <ChevronRight size={22} />
                        </button>
                    </>
                )}
            </div>
            {count > 1 && (
                <div className="pj-dots">
                    {media.map((m, i) => (
                        <button
                            key={m.url}
                            type="button"
                            aria-label={`Show ${i + 1} of ${count}`}
                            aria-current={i === at || undefined}
                            onClick={() => setAt(i)}
                        />
                    ))}
                </div>
            )}
        </section>
    );
}
