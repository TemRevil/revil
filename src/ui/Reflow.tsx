import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';

const OUT = 300, SLIDE = 450, IN = 450, STAGGER = 40;
const EASE_OUT = 'cubic-bezier(.25, 1, .5, 1)';
const EASE_IN = 'cubic-bezier(.5, 0, .75, 0)';
const HIDDEN: Keyframe = { opacity: 0, filter: 'blur(12px)' };
const SHOWN: Keyframe = { opacity: 1, filter: 'blur(0px)' };

interface Props<T> {
    items: T[];
    keyOf: (item: T) => string;
    render: (item: T, index: number) => ReactNode;
    className?: string;
    style?: CSSProperties;
}

type Entry<T> = { key: string; item: T };
type Run = { anims: Animation[]; timer: number };
type Plan = { from: string[]; firsts: Map<string, DOMRect>; arriving: Map<string, Keyframe> };

const columnsOf = (el: HTMLElement | null) =>
    el ? Math.max(1, getComputedStyle(el).gridTemplateColumns.split(' ').filter(Boolean).length) : 1;

const calm = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

const play = (run: Run, el: HTMLElement | undefined, frames: Keyframe[], o: KeyframeAnimationOptions) => {
    if (el) run.anims.push(el.animate(frames, o));
};

const stop = (run: Run) => {
    run.anims.forEach(a => a.cancel());
    run.anims = [];
    window.clearTimeout(run.timer);
};

/**
 * A grid whose cards never pass over one another when the list changes. In order: the cards
 * leaving blur out where they stand, the cards keeping their row slide along it, and the cards
 * landing in another row (or new ones) blur in at their place. A card that changed row would
 * cut diagonally through the cards between, so it doesn't travel; and nothing moves while a
 * card is still fading on the spot it is leaving.
 */
export default function Reflow<T>({ items, keyOf, render, className, style }: Props<T>) {
    const root = useRef<HTMLDivElement>(null);
    const nodes = useRef(new Map<string, HTMLElement>());
    const run = useRef<Run>({ anims: [], timer: 0 });
    const plan = useRef<Plan | null>(null);

    const [shown, setShown] = useState<Entry<T>[]>(() => items.map(item => ({ key: keyOf(item), item })));
    const shownRef = useRef(shown);
    const sig = items.map(keyOf).join('\n');
    const latest = new Map(items.map(item => [keyOf(item), item]));

    // First showing: the cards come into focus one after another.
    useLayoutEffect(() => {
        const r = run.current;
        if (!calm()) shownRef.current.forEach(({ key }, i) =>
            play(r, nodes.current.get(key), [HIDDEN, SHOWN], { duration: IN, delay: i * STAGGER, easing: EASE_OUT, fill: 'backwards' }));
        return () => stop(r);
    }, []);

    useEffect(() => {
        const r = run.current;
        const from = shownRef.current.map(e => e.key);
        if (from.join('\n') === sig) return;
        const to = sig ? sig.split('\n') : [];
        const next = items.map(item => ({ key: keyOf(item), item }));
        const commit = () => { shownRef.current = next; setShown(next); };
        // A change that lands mid-way picks each card up from where it is now.
        const now = new Map([...nodes.current].map(([k, el]) => {
            const cs = getComputedStyle(el);
            return [k, { opacity: cs.opacity, filter: cs.filter === 'none' ? 'blur(0px)' : cs.filter }] as const;
        }));
        stop(r);
        if (calm()) { commit(); return; }

        const cols = columnsOf(root.current);
        const row = (i: number) => Math.floor(i / cols);
        const seen = (k: string) => Number(now.get(k)?.opacity ?? 1);
        const leaving = from.filter(k => !to.includes(k));
        const moved = to.filter(k => from.includes(k) && row(from.indexOf(k)) !== row(to.indexOf(k)));
        const arriving = new Map<string, Keyframe>();
        to.forEach(k => {
            if (!from.includes(k) || moved.includes(k)) arriving.set(k, HIDDEN);
            else if (seen(k) < 0.99) arriving.set(k, now.get(k)!);
        });

        const swap = () => {
            const firsts = new Map<string, DOMRect>();
            to.forEach(k => {
                const el = nodes.current.get(k);
                if (el && !arriving.has(k) && from.indexOf(k) !== to.indexOf(k)) firsts.set(k, el.getBoundingClientRect());
            });
            plan.current = { from, firsts, arriving };
            commit();
        };
        const outs = [...leaving, ...moved].filter(k => seen(k) > 0.01);
        outs.forEach(k => play(r, nodes.current.get(k), [now.get(k) ?? SHOWN, HIDDEN], { duration: OUT, easing: EASE_IN, fill: 'forwards' }));
        if (outs.length) r.timer = window.setTimeout(swap, OUT);
        else swap();
    }, [sig]); // eslint-disable-line react-hooks/exhaustive-deps

    useLayoutEffect(() => {
        const p = plan.current;
        if (!p) return;
        plan.current = null;
        const r = run.current;
        // The fades-out held the cards that changed row hidden until now; the fades-in
        // below take them over before this frame is painted.
        stop(r);
        let slid = false;
        p.firsts.forEach((first, k) => {
            const el = nodes.current.get(k);
            if (!el) return;
            const last = el.getBoundingClientRect();
            const dx = first.left - last.left, dy = first.top - last.top;
            if (!dx && !dy) return;
            slid = true;
            play(r, el, [{ transform: `translate(${dx}px, ${dy}px)` }, { transform: 'none' }], { duration: SLIDE, easing: EASE_OUT });
        });
        let i = 0;
        shown.forEach(({ key }) => {
            const start = p.arriving.get(key);
            if (start) play(r, nodes.current.get(key), [start, SHOWN], { duration: IN, delay: (slid ? SLIDE : 0) + i++ * STAGGER, easing: EASE_OUT, fill: 'backwards' });
        });
    }, [shown]);

    return (
        <div ref={root} className={className} style={style}>
            {shown.map(({ key, item }, i) => (
                <div
                    key={key}
                    style={{ minWidth: 0 }}
                    ref={el => {
                        if (!el) return;
                        nodes.current.set(key, el);
                        return () => { nodes.current.delete(key); };
                    }}
                >
                    {render(latest.get(key) ?? item, i)}
                </div>
            ))}
        </div>
    );
}
