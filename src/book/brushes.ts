/**
 * The painted hero (/book, the homepage, and the page-edge strokes on the sign-in page): dry-brush strokes drawn in SVG, revealed in
 * stop-motion steps and "boiling" at 15 frames a second like hand-drawn animation. Every
 * visit picks a different composition (a "mood", never the same one twice in a row) and
 * rolls the count, height, width and colour of each stroke. Strokes around the owner come
 * in from past the page edges, ring the body (far half behind, near half in front) and
 * are rejected if they would cross the face or the name on the shirt. Phones get thinner strokes
 * (fewer bristles, no rough edge) but still a full composition that follows the visit's mood,
 * with the page strokes coming from the corners. Filters referenced here (#bp-rag, #bp-fabric,
 * #bp-soft) are in PaintDefs.
 */

import { isLite } from '../lib/device';
import { onIdle } from '../lib/idle';

const NS = 'http://www.w3.org/2000/svg';
const FPS = 15;
const FRAME = 1000 / FPS;

type Pt = [number, number];
type Face = { cx: number; cy: number; rx: number; ry: number };

let seed = (Math.random() * 1e9 | 0) + 1;
let uid = 0;
const rand = () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };
const R = (a: number, b: number) => a + rand() * (b - a);
const pick = <T,>(a: readonly T[]) => a[Math.floor(rand() * a.length)];
const int = (a: number, b: number) => a + Math.floor(rand() * (b - a + 1));
const shuffle = <T,>(a: T[]) => { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
const el = (tag: string, attrs: Record<string, string | number>) => {
    const e = document.createElementNS(NS, tag);
    for (const k in attrs) e.setAttribute(k, String(attrs[k]));
    return e;
};
/** Snaps a time to whole 15fps frames, so every stroke steps on the same frames (see drive). */
const onGrid = (ms: number) => Math.max(1, Math.round(ms / FRAME)) * FRAME;

// ---------- dry brush ----------
/** Phones: fewer bristles per stroke (set per paint by paintBook). */
let lite = false;

/** This entrance's stroke reveals, so the boil knows when the last one has landed. */
let reveals: Animation[] = [];

/**
 * Length of the polyline `d` draws, and the point at a distance along it: what a probe
 * path's getTotalLength/getPointAtLength return, in the same 32-bit float steps Skia
 * takes, without the probe. Each probe in the DOM forced a style and layout pass, about
 * 45 of them in the task that starts the entrance.
 */
function polyline(pts: Pt[]) {
    const f = Math.fround;
    const P = pts.map(([x, y]) => [f(+x.toFixed(1)), f(+y.toFixed(1))]);
    const segs: { a: number[]; b: number[]; d0: number; d1: number }[] = [];
    let L = 0;
    for (let i = 1; i < P.length; i++) {
        const dx = f(P[i][0] - P[i - 1][0]), dy = f(P[i][1] - P[i - 1][1]);
        const prev = L;
        L = f(L + f(Math.sqrt(f(f(dx * dx) + f(dy * dy)))));
        if (L > prev) segs.push({ a: P[i - 1], b: P[i], d0: prev, d1: L });
    }
    const at = (dist: number) => {
        dist = Math.min(L, Math.max(0, f(dist)));
        let lo = 0, hi = segs.length - 1;
        while (lo < hi) { const mid = (lo + hi) >> 1; if (segs[mid].d1 < dist) lo = mid + 1; else hi = mid; }
        const { a, b, d0, d1 } = segs[lo], t = f(f(dist - d0) / f(d1 - d0));
        return { x: f(a[0] + f(f(b[0] - a[0]) * t)), y: f(a[1] + f(f(b[1] - a[1]) * t)) };
    };
    return { L, at };
}

function paint(svg: SVGElement, pts0: Pt[], width: number, color: string, delay: number, animate: boolean, dur?: number) {
    const d = 'M' + pts0.map(p => p[0].toFixed(1) + ' ' + p[1].toFixed(1)).join(' L');
    const { L, at } = polyline(pts0);
    if (L < 4) return;
    const n = Math.max(24, Math.floor(L / 6));
    const pts: { x: number; y: number; nx: number; ny: number; t: number; taper: number }[] = [];
    for (let i = 0; i <= n; i++) {
        const t = i / n, p = at(t * L), q = at(Math.min(L, t * L + 1));
        const dx = q.x - p.x, dy = q.y - p.y, m = Math.hypot(dx, dy) || 1;
        pts.push({ x: p.x, y: p.y, nx: -dy / m, ny: dx / m, t, taper: Math.pow(Math.sin(Math.PI * Math.min(1, t * 1.03)), .45) });
    }
    // The mask region must be huge: by default it is the element's own box plus 10%,
    // which clipped every stroke to a frame around the stage.
    const id = 'bpm' + (++uid);
    const mask = el('mask', { id, maskUnits: 'userSpaceOnUse', x: -5000, y: -5000, width: 10000, height: 10000 });
    const mp = el('path', { d, fill: 'none', stroke: '#fff', 'stroke-width': width * 1.9, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }) as SVGPathElement;
    mask.appendChild(mp);
    svg.appendChild(mask);
    // Lite pages (lib/device.ts) keep the bristles but not the rough edge: the noise filter
    // re-ran over every stroke on each 15fps step of the entrance.
    const g = el('g', isLite() ? { mask: `url(#${id})` } : { mask: `url(#${id})`, filter: 'url(#bp-rag)' });
    const K = lite ? Math.max(5, Math.round(width / 6)) : Math.max(8, Math.round(width / 3));
    for (let k = 0; k < K; k++) {
        const off = (k / (K - 1) - .5) * width + R(-1.5, 1.5), tEnd = R(.62, 1), tStart = R(0, .06), wig = R(.4, 1.6);
        let s = '';
        for (const p of pts) {
            if (p.t < tStart || p.t > tEnd) continue;
            const o = off * (.35 + .65 * p.taper) + Math.sin(p.t * 34 + k) * wig;
            s += (s ? 'L' : 'M') + (p.x + p.nx * o).toFixed(1) + ' ' + (p.y + p.ny * o).toFixed(1) + ' ';
        }
        if (!s) continue;
        const b = el('path', { d: s, fill: 'none', 'stroke-linecap': 'round', 'stroke-linejoin': 'round', 'stroke-width': (width / K * R(1.1, 2.1)).toFixed(2), opacity: R(.55, 1).toFixed(2) });
        b.style.stroke = color;
        if (rand() < .5) b.setAttribute('stroke-dasharray', `${R(60, 260) | 0} ${R(3, 20) | 0} ${R(20, 120) | 0} ${R(2, 10) | 0}`);
        g.appendChild(b);
    }
    svg.appendChild(g);
    if (animate) {
        const ms = onGrid(dur || (500 + L * .45));
        mp.style.strokeDasharray = String(L);
        mp.style.strokeDashoffset = String(L);
        const a = mp.animate([{ strokeDashoffset: L }, { strokeDashoffset: 0 }], { duration: ms, delay: onGrid(delay), fill: 'forwards' });
        a.pause();
        reveals.push(a);
    }
}

const bez = (p0: Pt, c1: Pt, c2: Pt, p3: Pt): Pt[] => {
    const out: Pt[] = [];
    for (let i = 0; i <= 40; i++) {
        const t = i / 40, u = 1 - t;
        out.push([
            u * u * u * p0[0] + 3 * u * u * t * c1[0] + 3 * u * t * t * c2[0] + t * t * t * p3[0],
            u * u * u * p0[1] + 3 * u * u * t * c1[1] + 3 * u * t * t * c2[1] + t * t * t * p3[1],
        ]);
    }
    return out;
};
function bezier(x0: number, y0: number, len: number, ang: number, bend: number) {
    const x3 = x0 + Math.cos(ang) * len, y3 = y0 + Math.sin(ang) * len, nx = -Math.sin(ang), ny = Math.cos(ang);
    const b1 = R(-bend, bend) * len, b2 = R(-bend, bend) * len;
    return bez([x0, y0], [x0 + (x3 - x0) / 3 + nx * b1, y0 + (y3 - y0) / 3 + ny * b1], [x0 + (x3 - x0) * 2 / 3 + nx * b2, y0 + (y3 - y0) * 2 / 3 + ny * b2], [x3, y3]);
}
/** A stroke that enters from outside the frame (box in local coords) and heads inward. */
function fromEdge(box: [number, number, number, number], lenK: number, bend: number, edges: ('l' | 'r' | 't' | 'b')[] = ['l', 'r', 't', 'b']) {
    const [x0, y0, x1, y1] = box, w = x1 - x0, h = y1 - y0, e = pick(edges), pad = 60;
    let sx = 0, sy = 0, ang = 0;
    if (e === 'l') { sx = x0 - pad; sy = y0 + R(.1, .9) * h; ang = R(-.6, .6); }
    if (e === 'r') { sx = x1 + pad; sy = y0 + R(.1, .9) * h; ang = Math.PI + R(-.6, .6); }
    if (e === 't') { sx = x0 + R(.1, .9) * w; sy = y0 - pad; ang = Math.PI / 2 + R(-.7, .7); }
    if (e === 'b') { sx = x0 + R(.1, .9) * w; sy = y1 + pad; ang = -Math.PI / 2 + R(-.7, .7); }
    return bezier(sx, sy, lenK * Math.max(w, h), ang, bend);
}
function ring(cx: number, cy: number, rx: number, ry: number, tilt: number, from: number, to: number) {
    const out: Pt[] = [], c = Math.cos(tilt), s = Math.sin(tilt);
    for (let i = 0; i <= 48; i++) {
        const a = from + (to - from) * i / 48, w = 1 + R(-.025, .025), x = Math.cos(a) * rx * w, y = Math.sin(a) * ry * w;
        out.push([cx + x * c - y * s, cy + x * s + y * c]);
    }
    return out;
}
/**
 * What nothing painted in FRONT may enter, in stage coordinates: the face (hair to chin)
 * and "Tem Revil" on the shirt (drawShirt: centred at .545W, .7H, about .68W wide).
 */
const keepClear = (W: number, H: number): Face[] => [
    { cx: W * .53, cy: H * .2, rx: W * .23, ry: H * .23 },
    { cx: W * .545, cy: H * .69, rx: W * .42, ry: H * .08 },
];
const hits = (pts: Pt[], zones: Face[], pad: number) => zones.some(f => pts.some(([x, y]) => ((x - f.cx) / (f.rx + pad)) ** 2 + ((y - f.cy) / (f.ry + pad)) ** 2 < 1));
function safe(make: () => Pt[], zones: Face[], pad: number) {
    for (let i = 0; i < 40; i++) { const p = make(); if (!hits(p, zones, pad)) return p; }
    return null;
}

const MOODS = ['sweep', 'orbit', 'slash', 'bold'] as const;
type Mood = typeof MOODS[number];
/** A different composition from last visit's (remembered per browser, best effort). */
function pickMood(): Mood {
    let last = '';
    try { last = localStorage.getItem('revil_paint_mood') || ''; } catch { /* storage blocked */ }
    const mood = pick(MOODS.filter(m => m !== last));
    try { localStorage.setItem('revil_paint_mood', mood); } catch { /* storage blocked */ }
    return mood;
}

function drawStage(root: HTMLElement, t0: number, animate: boolean, mood: Mood) {
    const stage = root.querySelector<HTMLElement>('.stage:not(.stage-back)');
    const back = root.querySelector<SVGSVGElement>('.ring-back'), front = root.querySelector<SVGSVGElement>('.ring-front');
    if (!stage || !back || !front) return t0;
    const W = stage.clientWidth, H = stage.clientHeight;
    for (const s of [back, front]) { s.replaceChildren(); s.setAttribute('viewBox', `0 0 ${W} ${H}`); }
    // The whole device width, in stage coordinates.
    const sr = stage.getBoundingClientRect(), br = root.getBoundingClientRect(), k0 = W / (sr.width || 1);
    const X0 = (br.left - sr.left) * k0, X1 = (br.right - sr.left) * k0;
    // Edge to edge: starts past one side of the screen, ends past the other, crossing behind.
    const across = (y0: number, y1: number, bend: number) => {
        const l2r = rand() < .5, a = l2r ? X0 - 80 : X1 + 80, b = l2r ? X1 + 80 : X0 - 80, dx = b - a;
        const ya = H * (l2r ? y0 : y1), yb = H * (l2r ? y1 : y0);
        return bez([a, ya], [a + dx / 3, ya + R(-bend, bend) * H], [a + dx * 2 / 3, yb + R(-bend, bend) * H], [b, yb]);
    };
    const k = W / 520, blue = 'var(--accent)', deep = '#1668d8', ink = 'var(--paint-ink)', f = keepClear(W, H);
    const colour = () => pick([blue, blue, deep, ink]);
    let t = t0;

    // Behind: long sweeps from the page edges that pass behind the body. Heights come from
    // shuffled bands, so two sweeps rarely land on the same line.
    const sweeps = lite
        ? { sweep: int(2, 3), orbit: 2, slash: int(2, 3), bold: 2 }[mood]
        : { sweep: int(3, 4), orbit: int(1, 2), slash: int(2, 3), bold: int(1, 2) }[mood];
    const bands = shuffle([[.22, .36], [.34, .5], [.48, .64], [.6, .78], [.74, .92]]);
    for (let i = 0; i < sweeps; i++) {
        const [a, b] = bands[i % bands.length], y = R(a, b);
        const path = mood === 'slash'
            ? (rand() < .5 ? across(R(.05, .35), R(.62, .98), .12) : across(R(.62, .98), R(.05, .35), .12))
            : across(y, y + R(-.14, .14), R(.1, .25));
        const w = (i === 0 ? (mood === 'bold' ? R(120, 170) : R(80, 130)) : R(22, 80)) * k;
        paint(back, path, w, i === 0 ? blue : colour(), t, animate, 1300);
        t += 170;
    }
    // A ring behind the head, now and then.
    if (rand() < (mood === 'orbit' ? .9 : .4)) {
        paint(back, ring(W * R(.49, .55), H * R(.14, .2), W * R(.28, .38), H * R(.1, .16), R(-.3, .3), Math.PI * R(.95, 1.1), Math.PI * R(1.85, 2.05)), R(16, 28) * k, colour(), t, animate);
        t += 170;
    }
    // Rings around the body: far half behind, near half across the front, never over the face or the shirt's name.
    const rings = lite
        ? { sweep: 1, orbit: 2, slash: 1, bold: 1 }[mood]
        : { sweep: int(1, 2), orbit: int(2, 3), slash: int(0, 1), bold: int(1, 2) }[mood];
    shuffle([[.44, .52], [.54, .64], [.68, .78], [.82, .92]]).slice(0, rings).forEach(([a, b]) => {
        const cx = W * R(.48, .57), cy = H * R(a, b), rx = W * R(.56, .8), ry = H * R(.045, .1), tilt = R(-.25, .25), w = R(22, 50) * k, col = colour();
        const near = safe(() => ring(cx, cy, rx, ry, tilt, -.05, Math.PI - R(.02, .1) * Math.PI), f, w);
        paint(back, ring(cx, cy, rx, ry, tilt, Math.PI + R(.02, .12) * Math.PI, Math.PI * 2 + .05), w, col, t += 190, animate, 560);
        if (near) paint(front, near, w, col, t + 420, animate, 560);
        t += 420;
    });
    // Flicks in front, from either side of the body, checked against the face and the shirt's name.
    const flicks = lite ? int(1, mood === 'slash' ? 3 : 2) : int(mood === 'slash' ? 2 : 0, 3);
    for (let i = 0; i < flicks; i++) {
        const left = rand() < .5, w = R(8, 16) * k;
        const p = safe(() => left
            ? bezier(W * R(.02, .22), H * R(.4, .72), R(.16, .3) * W, Math.PI + R(.2, 1), .3)
            : bezier(W * R(.78, .96), H * R(.4, .72), R(.16, .3) * W, R(-1, -.2), .3), f, w);
        if (p) paint(front, p, w, colour(), t += 140, animate);
    }
    return t;
}

/** Page-level strokes from the frame edges; faded out under the text, blurred behind the glass. */
function drawBg(root: HTMLElement, t0: number, animate: boolean, mood: Mood) {
    const svg = root.querySelector<SVGSVGElement>('.paint-bg');
    if (!svg) return;
    const W = root.clientWidth, H = root.clientHeight;
    svg.replaceChildren();
    svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
    const rb = root.getBoundingClientRect(), s = W / (rb.width || 1);
    const m = el('mask', { id: 'bps' + (++uid), maskUnits: 'userSpaceOnUse', x: -5000, y: -5000, width: 10000, height: 10000 });
    m.appendChild(el('rect', { x: -200, y: -200, width: W + 400, height: H + 400, fill: '#fff' }));
    root.querySelectorAll('.pitch, .builds, .reach, .slogan, [data-paint-clear]').forEach(n => {
        const r = n.getBoundingClientRect();
        m.appendChild(el('rect', { x: (r.left - rb.left) * s - 12, y: (r.top - rb.top) * s - 12, width: r.width * s + 24, height: r.height * s + 24, rx: 20, fill: '#000', filter: 'url(#bp-soft)' }));
    });
    svg.appendChild(m);
    const layer = el('g', { mask: `url(#${m.getAttribute('id')})` });
    svg.appendChild(layer);
    const big = W >= 1000 ? 1 : .55, frame: [number, number, number, number] = [0, 0, W, H];
    const n = lite ? int(3, 4) : int(mood === 'bold' ? 2 : 3, 4);
    // A phone screen is tall and narrow: its strokes come in from the corners, where the
    // empty space is. Never the top-left corner (the handwritten "This is") and never top to
    // bottom (it would cross the links under the nav).
    const sides = lite
        ? shuffle<('l' | 'r' | 't' | 'b')[]>([['r', 't'], ['l', 'b'], ['r', 'b']])
        : shuffle<('l' | 'r' | 't' | 'b')[]>([['r', 't'], ['r', 'b'], ['l', 't'], ['l', 'b'], ['t', 'b']]);
    for (let i = 0; i < n; i++) {
        const w = (i === 0 ? R(55, mood === 'bold' ? 110 : 85) : R(18, 48)) * big;
        const col = i === 0 ? 'var(--accent)' : pick(['var(--accent)', 'var(--paint-ink)', '#1668d8']);
        paint(layer, fromEdge(frame, R(.25, .6), R(.3, .55), sides[i % sides.length]), w, col, t0 + i * 170, animate);
    }
    const centre = root.querySelector<HTMLElement>('[data-paint-center]');
    if (centre) drawAround(layer, centre, rb, s, W, t0 + n * 170, animate, mood);
}

/**
 * Pages with no cut-out (the sign-in page): sweeps from one screen edge to the other
 * across the element marked [data-paint-center], and a ring around it, all behind it
 * so its glass blurs them.
 */
function drawAround(layer: SVGElement, centre: HTMLElement, rb: DOMRect, s: number, W: number, t0: number, animate: boolean, mood: Mood) {
    const r = centre.getBoundingClientRect();
    const cx = (r.left + r.width / 2 - rb.left) * s, cy = (r.top + r.height / 2 - rb.top) * s, cw = r.width * s, ch = r.height * s;
    const big = W >= 1000 ? 1 : .6, colour = () => pick(['var(--accent)', 'var(--accent)', '#1668d8', 'var(--paint-ink)']);
    let t = t0;
    const sweeps = lite ? 1 : { sweep: int(2, 3), orbit: 1, slash: 2, bold: int(1, 2) }[mood];
    for (let i = 0; i < sweeps; i++) {
        const l2r = rand() < .5, a = l2r ? -80 : W + 80, b = l2r ? W + 80 : -80, dx = b - a;
        const tiltY = mood === 'slash' ? R(.9, 1.5) * ch * (rand() < .5 ? 1 : -1) : R(-.35, .35) * ch;
        const y0 = cy + R(-.7, .7) * ch - tiltY / 2, y1 = y0 + tiltY;
        const path = bez([a, y0], [a + dx / 3, y0 + R(-.3, .3) * ch], [a + dx * 2 / 3, y1 + R(-.3, .3) * ch], [b, y1]);
        const w = (i === 0 ? (mood === 'bold' ? R(120, 170) : R(80, 130)) : R(26, 70)) * big;
        paint(layer, path, w, i === 0 ? 'var(--accent)' : colour(), t, animate, 1300);
        t += 170;
    }
    if (!lite || rand() < .5) {
        const n = mood === 'orbit' ? 2 : int(1, 2);
        for (let i = 0; i < n; i++) {
            const from = R(0, 2) * Math.PI;
            paint(layer, ring(cx, cy, cw * R(.62, .85), ch * R(.55, .8), R(-.35, .35), from, from + R(1.1, 1.7) * Math.PI), R(16, 34) * big, colour(), t, animate, 900);
            t += 200;
        }
    }
}

/** "Tem Revil" on the shirt, letter by letter like the homepage's HandwritingText. */
function drawShirt(root: HTMLElement, t0: number, animate: boolean) {
    const stage = root.querySelector<HTMLElement>('.stage:not(.stage-back)'), svg = root.querySelector<SVGSVGElement>('.shirt');
    if (!stage || !svg) return;
    const W = stage.clientWidth, H = stage.clientHeight;
    svg.replaceChildren();
    svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
    const fs = W * .125, text = 'Tem Revil', cx = W * .545, cy = H * .7;
    const g = el('g', { transform: `rotate(-7 ${cx} ${cy})`, filter: 'url(#bp-fabric)' });
    svg.appendChild(g);
    const letters = [...text].map(ch => {
        const t = el('text', { 'font-size': fs, y: cy + fs * .35 }) as SVGTextElement;
        t.style.fontFamily = 'var(--font-permanent-marker), "Permanent Marker", cursive';
        t.textContent = ch === ' ' ? ' ' : ch;
        g.appendChild(t);
        return t;
    });
    // Measured once all are in: one layout pass, not one per letter.
    const widths = letters.map((t, i) => text[i] === ' ' ? fs * .3 : t.getComputedTextLength());
    let x = cx - widths.reduce((a, b) => a + b, 0) / 2;
    letters.forEach((t, i) => {
        t.setAttribute('x', String(x));
        x += widths[i];
        t.style.fill = '#1f6fe0'; t.style.stroke = '#1f6fe0'; t.style.strokeWidth = '1.5'; t.style.paintOrder = 'stroke fill';
        if (!animate) { t.style.fillOpacity = '1'; t.style.strokeOpacity = '.55'; return; }
        const Ls = fs * 5, start = t0 + i * 80;
        t.style.strokeDasharray = String(Ls); t.style.strokeDashoffset = String(Ls); t.style.fillOpacity = '0';
        t.animate([{ strokeDashoffset: Ls }, { strokeDashoffset: 0 }], { duration: 240, delay: start, easing: 'ease-in-out', fill: 'forwards' });
        t.animate([{ fillOpacity: 0 }, { fillOpacity: 1 }], { duration: 200, delay: start + 90, easing: 'ease-out', fill: 'forwards' });
        t.animate([{ strokeOpacity: 1 }, { strokeOpacity: .55 }], { duration: 180, delay: start + 110, fill: 'forwards' });
    });
}

/** Lite pages bring the text in without the blur, which re-rasters every letter on each frame. */
const unblur = (frames: Keyframe[]) => (isLite() ? frames.map(f => { const c = { ...f }; delete c.filter; return c; }) : frames);

/** Handwritten labels and the stacked name, character by character (spans rendered by React). */
function textIn(root: HTMLElement) {
    const ease = 'cubic-bezier(.25,1,.5,1)';
    root.querySelectorAll<HTMLElement>('[data-write]').forEach((n, j) => {
        n.querySelectorAll<HTMLElement>('.ch').forEach((s, i) => s.animate(
            unblur([{ opacity: 0, transform: 'translateY(6px) scale(.9)', filter: 'blur(4px)' }, { opacity: 1, transform: 'none', filter: 'blur(0)' }]),
            { duration: 320, delay: (j ? 1900 : 0) + i * 80, easing: 'ease-out', fill: 'backwards' }));
    });
    root.querySelectorAll<HTMLElement>('.name-char').forEach((c, i) => c.animate(
        unblur([{ opacity: 0, transform: 'translateY(20px)', filter: 'blur(12px)' }, { opacity: 1, transform: 'none', filter: 'blur(0)' }]),
        { duration: 700, delay: 300 + i * 60, easing: ease, fill: 'backwards' }));
    // The photo comes in with the name, not after it: it is the page's largest paint.
    root.querySelector<HTMLElement>('.stage img')?.animate(
        unblur([{ opacity: 0, transform: 'scale(.97)', filter: 'blur(16px)' }, { opacity: 1, transform: 'none', filter: 'blur(0)' }]),
        { duration: 1200, delay: 300, easing: ease, fill: 'backwards' });
    // The side column and the pills: a soft fade out of blur, one after another.
    [...root.querySelectorAll<HTMLElement>('.side > *'), ...root.querySelectorAll<HTMLElement>('.pills > *')].forEach((n, i) => n.animate(
        unblur([{ opacity: 0, transform: 'translateY(14px)', filter: 'blur(10px)' }, { opacity: 1, transform: 'none', filter: 'blur(0)' }]),
        { duration: 800, delay: 450 + i * 110, easing: ease, fill: 'backwards' }));
}

/**
 * Full entrance. `phone` paints the lighter set. With `animate` false (reduced motion, or a redraw after resize) everything
 * lands at once. The page is rendered hidden (book.css gates it until data-intro="done"), so
 * the gate lifts in the same task the entrance starts: nothing shows, then vanishes, then
 * animates back in.
 */
export function paintBook(root: HTMLElement, animate: boolean, phone = false) {
    drives.get(root)?.();
    uncache(root);
    reveals = [];
    lite = phone;
    // One composition per page load: a redraw (a resize, or the name or availability text
    // arriving after the entrance) replays the same random rolls, so the strokes are only
    // re-fitted to the new layout, never swapped for new ones.
    const mood = (root.dataset.mood || (root.dataset.mood = pickMood())) as Mood;
    seed = Number(root.dataset.seed || (root.dataset.seed = String(seed)));
    // Paint first: drawBg measures the text boxes, which the entrance offsets while it runs.
    drawBg(root, 900, animate, mood);
    drawShirt(root, drawStage(root, 1100, animate, mood) + 200, animate);
    landed.set(root, Promise.all(reveals.map(a => a.finished)).then(() => true, () => false));
    if (reveals.length) drives.set(root, drive(reveals));
    reveals = [];
    boils.get(root)?.();
    if (animate) textIn(root);
    root.dataset.intro = 'done';
}

/** Each root's running entrance (see drive): stopped by a repaint. */
const drives = new WeakMap<HTMLElement, () => void>();

/**
 * Plays an entrance's stroke reveals in 15fps steps, taken on the frames the page actually
 * draws. The page clock runs on while a frame is held up (the first draw of the brushes
 * keeps the GPU busy for up to a second, more on a phone), so reveals timed by it landed
 * whole, or jumped to the end. Here a drawn frame advances one step per 15fps frame of the
 * clock since the last (the boil re-rolls on the same frames), but never more than two: a
 * stall pauses the entrance, and a slow device skips at most every other drawing instead
 * of dragging the entrance out. Returns a stop that cancels what is left.
 */
function drive(list: Animation[]) {
    const end = Math.max(...list.map(a => Number(a.effect?.getComputedTiming().endTime) || 0));
    let step = 0, last = -1, raf = 0;
    const tick = (now: number) => {
        const f = Math.floor(now / FRAME);
        if (f !== last) {
            if (last >= 0) step += Math.min(f - last, 2);
            last = f;
            if (step * FRAME >= end) { raf = 0; list.forEach(a => a.finish()); return; }
            list.forEach(a => { a.currentTime = step * FRAME; });
        }
        raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => { if (raf) { cancelAnimationFrame(raf); raf = 0; list.forEach(a => a.cancel()); } };
}

// ---------- boil ----------
/** The three turbulence seeds the boil cycles through, one per 15fps frame. */
const SEEDS = [4, 5, 6];
/** Each root's latest paint: true once its last stroke has landed (false if a reveal was cancelled). */
const landed = new WeakMap<HTMLElement, Promise<boolean>>();
/** The running boil on each root, told when the root is painted again. */
const boils = new WeakMap<HTMLElement, () => void>();
/** Every running boil's sync, run when a hold starts or ends. */
const syncs = new Set<() => void>();
/** How many things are animating over the brushes right now (an open modal, the page curtain). */
let holds = 0;
/**
 * Freezes the boil until the returned release is called. Each boil step redraws the
 * brushes under the pills' glass, which takes the frames a modal or the page curtain
 * needs to open smoothly, and the brushes sit under glass or a curtain meanwhile anyway.
 */
export function holdBoil() {
    holds++;
    syncs.forEach(s => s());
    let held = true;
    return () => { if (held) { held = false; holds--; syncs.forEach(s => s()); } };
}

/** The brush layers whose filters boil: the page strokes and the rings behind and in front of the photo. */
const BOILED = '.paint-bg, .ring-back, .ring-front';
/** Copy k of a brush layer shows on every third frame of the 15fps grid, starting at frame k. */
const BLINK: Keyframe[] = [{ opacity: 1 }, { opacity: 1, offset: 1 / 3 }, { opacity: 0, offset: 1 / 3 }, { opacity: 0 }];

/** Back to one live layer per brush svg, before a repaint or when the boil stops. */
function uncache(root: HTMLElement) {
    root.querySelectorAll('[data-boil-copy]').forEach(n => n.remove());
    root.querySelectorAll<SVGSVGElement>('svg[data-boil]').forEach(s => {
        s.getAnimations().forEach(a => a.cancel());
        unsnap(s);
        s.removeAttribute('data-boil');
        s.querySelectorAll('[filter^="url(#bp-rag-"]').forEach(g => g.setAttribute('filter', 'url(#bp-rag)'));
    });
}

/**
 * A layer of its own is drawn at its box's position, and the photo's stage sits at a
 * fraction of a pixel (centred with translateX(-50%)), so its copies would be resampled
 * and come out soft. This moves the svg onto the device pixel grid and its drawing back
 * by the same fraction, so every stroke lands on exactly the pixels it did before.
 */
function snap(svg: SVGSVGElement) {
    const d = svg.dataset, ox = Number(d.boilDx || 0), oy = Number(d.boilDy || 0);
    const r = svg.getBoundingClientRect(), dpr = window.devicePixelRatio || 1;
    const left = (r.left - ox) * dpr, top = (r.top - oy) * dpr;
    const dx = (Math.round(left) - left) / dpr, dy = (Math.round(top) - top) / dpr;
    if (Math.abs(dx - ox) < 1e-3 && Math.abs(dy - oy) < 1e-3) return;
    const vb = (d.boilVb ?? svg.getAttribute('viewBox') ?? '').split(/[\s,]+/).map(Number);
    if (vb.length !== 4 || !vb[2] || !vb[3]) return;
    // User units per CSS pixel, as the default preserveAspectRatio (xMidYMid meet) scales them.
    const k = 1 / Math.min(r.width / vb[2], r.height / vb[3]);
    d.boilVb ??= svg.getAttribute('viewBox') || '';
    d.boilDx = String(dx); d.boilDy = String(dy);
    svg.setAttribute('viewBox', `${vb[0] + dx * k} ${vb[1] + dy * k} ${vb[2]} ${vb[3]}`);
    svg.style.translate = `${dx}px ${dy}px`;
}
function unsnap(svg: SVGSVGElement) {
    const d = svg.dataset;
    if (d.boilVb === undefined) return;
    svg.setAttribute('viewBox', d.boilVb);
    svg.style.translate = '';
    delete d.boilVb; delete d.boilDx; delete d.boilDy;
}

/**
 * Old-animation boil: the brush edges re-roll 15 times a second, through three noise
 * seeds. It steps on the same 15fps grid of the page clock as the entrance strokes (see
 * drive), so both repaint the brushes on the same frames.
 *
 * While strokes are still landing, it re-seeds the filter (`turb`) each frame. Once the
 * last one has landed nothing else changes, so each brush layer is drawn once per seed
 * into three stacked copies, and the compositor shows one copy per frame: the same three
 * images in the same order, without redrawing the noise filter 15 times a second. It
 * stops while the hero is off screen or the tab is hidden, and freezes on a hold.
 * Returns a stop function.
 */
export function startBoil(root: HTMLElement, turb: SVGFETurbulenceElement) {
    const rag = turb.parentElement!;
    const fixed = SEEDS.map(s => {
        const f = rag.cloneNode(true) as Element;
        f.id = `bp-rag-${s}`;
        f.querySelector('feTurbulence')!.setAttribute('seed', String(s));
        rag.after(f);
        return f;
    });
    let raf = 0, last = -1, seen = true, live = true, layers: [Animation, number][] = [];
    const tick = (now: number) => {
        const f = Math.floor(now / FRAME);
        if (f !== last) { last = f; turb.setAttribute('seed', String(SEEDS[f % 3])); }
        raf = requestAnimationFrame(tick);
    };
    const sync = () => {
        const run = live && !holds && seen && !document.hidden;
        if (layers.length) {
            if (raf) { cancelAnimationFrame(raf); raf = 0; }
            for (const [a, k] of layers) {
                if (!run) { if (a.playState === 'running') a.pause(); }
                else if (a.playState !== 'running') a.startTime = k * FRAME; // back on the grid
            }
        } else if (run && !raf) raf = requestAnimationFrame(tick);
        else if (!run && raf) { cancelAnimationFrame(raf); raf = 0; }
    };
    const cache = async () => {
        const p = landed.get(root);
        if (!p || !(await p) || !live || landed.get(root) !== p) return;
        // Drawing the copies takes the GPU a few hundred ms in one go (spreading it out only
        // made many smaller stalls), so it waits until the whole entrance has finished and
        // the page is idle: then only the boil is moving, and it is stop-motion anyway.
        await Promise.all(root.getAnimations({ subtree: true })
            .filter(a => a.effect?.getComputedTiming().iterations !== Infinity)
            .map(a => a.finished.catch(() => { })));
        await new Promise<void>(r => onIdle(r, 1500));
        if (!live || landed.get(root) !== p) return;
        layers = [];
        root.querySelectorAll<SVGSVGElement>(BOILED).forEach(svg => {
            snap(svg);
            const copies = [svg, svg.cloneNode(true) as SVGSVGElement, svg.cloneNode(true) as SVGSVGElement];
            copies.forEach((c, k) => {
                // The copies keep pointing at the original's stroke masks.
                if (k) { c.querySelectorAll('mask').forEach(m => m.remove()); c.setAttribute('data-boil-copy', ''); }
                c.setAttribute('data-boil', String(k));
                c.querySelectorAll('[filter="url(#bp-rag)"]').forEach(g => g.setAttribute('filter', `url(#bp-rag-${SEEDS[k]})`));
            });
            svg.after(copies[1], copies[2]);
            copies.forEach((c, k) => {
                const a = c.animate(BLINK, { duration: 3 * FRAME, iterations: Infinity });
                a.startTime = k * FRAME;
                layers.push([a, k]);
            });
        });
        sync();
    };
    const io = new IntersectionObserver(([e]) => { seen = e.isIntersecting; sync(); });
    io.observe(root);
    // A height change moves the stage without a repaint (usePaint redraws on width only).
    const ro = new ResizeObserver(() => root.querySelectorAll<SVGSVGElement>('svg[data-boil]').forEach(snap));
    ro.observe(root);
    document.addEventListener('visibilitychange', sync);
    syncs.add(sync);
    boils.set(root, () => { layers = []; sync(); void cache(); });
    sync();
    void cache();
    return () => {
        live = false;
        cancelAnimationFrame(raf);
        io.disconnect();
        ro.disconnect();
        document.removeEventListener('visibilitychange', sync);
        syncs.delete(sync);
        boils.delete(root);
        uncache(root);
        fixed.forEach(f => f.remove());
    };
}
