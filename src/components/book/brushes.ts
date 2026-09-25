/**
 * The painted hero (/book, the homepage, and the page-edge strokes on the sign-in page): dry-brush strokes drawn in SVG, revealed in
 * stop-motion steps and "boiling" at 15 frames a second like hand-drawn animation. Every
 * visit picks a different composition (a "mood", never the same one twice in a row) and
 * rolls the count, height, width and colour of each stroke. Strokes around the owner come
 * in from past the page edges, ring the body (far half behind, near half in front) and
 * are rejected if they would cross the face or the name on the shirt. Phones get a lighter set (fewer strokes and
 * bristles). Filters referenced here (#bp-rag, #bp-fabric, #bp-soft) are in PaintDefs.
 */

const NS = 'http://www.w3.org/2000/svg';
const FPS = 15;
export const FRAME = 1000 / FPS;

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
const stepped = (ms: number) => `steps(${Math.max(2, Math.round(ms / FRAME))}, end)`;

// ---------- dry brush ----------
/** Phones: fewer bristles per stroke (set per paint by paintBook). */
let lite = false;

function paint(svg: SVGElement, pts0: Pt[], width: number, color: string, delay: number, animate: boolean, dur?: number) {
    const d = 'M' + pts0.map(p => p[0].toFixed(1) + ' ' + p[1].toFixed(1)).join(' L');
    const probe = el('path', { d }) as SVGPathElement;
    svg.appendChild(probe);
    const L = probe.getTotalLength();
    if (L < 4) { probe.remove(); return; }
    const n = Math.max(24, Math.floor(L / 6));
    const pts: { x: number; y: number; nx: number; ny: number; t: number }[] = [];
    for (let i = 0; i <= n; i++) {
        const t = i / n, p = probe.getPointAtLength(t * L), q = probe.getPointAtLength(Math.min(L, t * L + 1));
        const dx = q.x - p.x, dy = q.y - p.y, m = Math.hypot(dx, dy) || 1;
        pts.push({ x: p.x, y: p.y, nx: -dy / m, ny: dx / m, t });
    }
    probe.remove();
    // The mask region must be huge: by default it is the element's own box plus 10%,
    // which clipped every stroke to a frame around the stage.
    const id = 'bpm' + (++uid);
    const mask = el('mask', { id, maskUnits: 'userSpaceOnUse', x: -5000, y: -5000, width: 10000, height: 10000 });
    const mp = el('path', { d, fill: 'none', stroke: '#fff', 'stroke-width': width * 1.9, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }) as SVGPathElement;
    mask.appendChild(mp);
    svg.appendChild(mask);
    const g = el('g', { mask: `url(#${id})`, filter: 'url(#bp-rag)' });
    const K = lite ? Math.max(5, Math.round(width / 6)) : Math.max(8, Math.round(width / 3));
    for (let k = 0; k < K; k++) {
        const off = (k / (K - 1) - .5) * width + R(-1.5, 1.5), tEnd = R(.62, 1), tStart = R(0, .06), wig = R(.4, 1.6);
        let s = '';
        for (const p of pts) {
            if (p.t < tStart || p.t > tEnd) continue;
            const taper = Math.pow(Math.sin(Math.PI * Math.min(1, p.t * 1.03)), .45);
            const o = off * (.35 + .65 * taper) + Math.sin(p.t * 34 + k) * wig;
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
        const ms = dur || (500 + L * .45);
        mp.style.strokeDasharray = String(L);
        mp.style.strokeDashoffset = String(L);
        mp.animate([{ strokeDashoffset: L }, { strokeDashoffset: 0 }], { duration: ms, delay, easing: stepped(ms), fill: 'forwards' });
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
    const sweeps = lite ? int(1, 2) : { sweep: int(3, 4), orbit: int(1, 2), slash: int(2, 3), bold: int(1, 2) }[mood];
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
    const rings = lite ? int(0, 1) : { sweep: int(1, 2), orbit: int(2, 3), slash: int(0, 1), bold: int(1, 2) }[mood];
    shuffle([[.44, .52], [.54, .64], [.68, .78], [.82, .92]]).slice(0, rings).forEach(([a, b]) => {
        const cx = W * R(.48, .57), cy = H * R(a, b), rx = W * R(.56, .8), ry = H * R(.045, .1), tilt = R(-.25, .25), w = R(22, 50) * k, col = colour();
        const near = safe(() => ring(cx, cy, rx, ry, tilt, -.05, Math.PI - R(.02, .1) * Math.PI), f, w);
        paint(back, ring(cx, cy, rx, ry, tilt, Math.PI + R(.02, .12) * Math.PI, Math.PI * 2 + .05), w, col, t += 190, animate, 560);
        if (near) paint(front, near, w, col, t + 420, animate, 560);
        t += 420;
    });
    // Flicks in front, from either side of the body, checked against the face and the shirt's name.
    const flicks = lite ? int(0, 1) : int(mood === 'slash' ? 2 : 0, 3);
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
    const n = lite ? 2 : int(mood === 'bold' ? 2 : 3, 4);
    const sides = shuffle<('l' | 'r' | 't' | 'b')[]>([['r', 't'], ['r', 'b'], ['l', 't'], ['l', 'b'], ['t', 'b']]);
    for (let i = 0; i < n; i++) {
        const w = (i === 0 ? R(55, mood === 'bold' ? 110 : 85) : R(18, 48)) * big;
        const col = i === 0 ? 'var(--accent)' : pick(['var(--accent)', 'var(--paint-ink)', '#1668d8']);
        paint(layer, fromEdge(frame, R(.25, .6), R(.3, .55), sides[i % sides.length]), w, col, t0 + i * 170, animate);
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
    const letters: SVGTextElement[] = [], widths: number[] = [];
    for (const ch of text) {
        const t = el('text', { 'font-size': fs, y: cy + fs * .35 }) as SVGTextElement;
        t.style.fontFamily = 'var(--font-permanent-marker), "Permanent Marker", cursive';
        t.textContent = ch === ' ' ? ' ' : ch;
        g.appendChild(t);
        widths.push(ch === ' ' ? fs * .3 : t.getComputedTextLength());
        letters.push(t);
    }
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

/** Handwritten labels and the stacked name, character by character (spans rendered by React). */
function textIn(root: HTMLElement) {
    const ease = 'cubic-bezier(.25,1,.5,1)';
    root.querySelectorAll<HTMLElement>('[data-write]').forEach((n, j) => {
        n.querySelectorAll<HTMLElement>('.ch').forEach((s, i) => s.animate(
            [{ opacity: 0, transform: 'translateY(6px) scale(.9)', filter: 'blur(4px)' }, { opacity: 1, transform: 'none', filter: 'blur(0)' }],
            { duration: 320, delay: (j ? 1900 : 0) + i * 80, easing: 'ease-out', fill: 'backwards' }));
    });
    root.querySelectorAll<HTMLElement>('.name-char').forEach((c, i) => c.animate(
        [{ opacity: 0, transform: 'translateY(20px)', filter: 'blur(12px)' }, { opacity: 1, transform: 'none', filter: 'blur(0)' }],
        { duration: 700, delay: 300 + i * 60, easing: ease, fill: 'backwards' }));
    root.querySelector<HTMLElement>('.stage img')?.animate(
        [{ opacity: 0, transform: 'scale(.97)', filter: 'blur(16px)' }, { opacity: 1, transform: 'none', filter: 'blur(0)' }],
        { duration: 1200, delay: 600, easing: ease, fill: 'backwards' });
    // The side column and the pills: a soft fade out of blur, one after another.
    [...root.querySelectorAll<HTMLElement>('.side > *'), ...root.querySelectorAll<HTMLElement>('.pills > *')].forEach((n, i) => n.animate(
        [{ opacity: 0, transform: 'translateY(14px)', filter: 'blur(10px)' }, { opacity: 1, transform: 'none', filter: 'blur(0)' }],
        { duration: 800, delay: 450 + i * 110, easing: ease, fill: 'backwards' }));
}

/**
 * Full entrance. `phone` paints the lighter set. With `animate` false (reduced motion, or a redraw after resize) everything
 * lands at once. The page is rendered hidden (book.css gates it until data-intro="done"), so
 * the gate lifts in the same task the entrance starts: nothing shows, then vanishes, then
 * animates back in.
 */
export function paintBook(root: HTMLElement, animate: boolean, phone = false) {
    lite = phone;
    // One composition per page load: a redraw after a resize keeps the same mood.
    const mood = (root.dataset.mood || (root.dataset.mood = pickMood())) as Mood;
    // Paint first: drawBg measures the text boxes, which the entrance offsets while it runs.
    drawBg(root, 900, animate, mood);
    drawShirt(root, drawStage(root, 1100, animate, mood) + 200, animate);
    if (animate) textIn(root);
    root.dataset.intro = 'done';
}

/** Old-animation boil: the brush edges re-roll 15 times a second. Returns a stop function. */
export function startBoil(turb: SVGElement) {
    let f = 0;
    const id = window.setInterval(() => {
        if (!document.hidden) turb.setAttribute('seed', String(4 + (f++ % 3)));
    }, FRAME);
    return () => window.clearInterval(id);
}
