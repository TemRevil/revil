import font from './shadows-into-light.json';

/**
 * The site's handwriting: Shadows Into Light by Kimberly Geswein (OFL.txt), as the pen
 * paths Vara.js traced for it (VARA-LICENSE.txt). Each letter is the strokes a hand
 * makes, in the order it makes them, so it can be written in stroke by stroke
 * (lib/handwrite) instead of shown. Pure, so the server renders it into the page.
 *
 * Font units: y grows downward, a glyph's strokes start at its (x, y).
 */
type Glyph = { x: number; y: number; d: string }[];
const GLYPHS = font.glyphs as Record<string, Glyph>;

/** Font units in one em: capitals stand about 0.75em tall. */
export const UNITS = 44;
/** Where the letters sit (font units). */
export const BASELINE = -15;
/** The line's box, from the baseline: what sits above it and below it (em). Strokes may overflow it. */
export const ASCENT = 0.8;
export const DESCENT = 0.2;
/** The pen's width (em). */
export const STROKE = 0.075;
/** Between two letters' strokes, past the pen's own width, and the width of a space (font units). */
const GAP = STROKE * UNITS + 2;
const SPACE = font.space;
/** A character the font doesn't have is set in the browser's own handwriting, this wide (em). */
const FALLBACK = 0.5;

type Point = [number, number];

/** The points along a path (relative m, l, c and z, as the font writes them), curves sampled. */
export function samplePath(d: string, steps = 16): Point[] {
    const t = d.match(/[a-zA-Z]|-?\d*\.?\d+(?:e-?\d+)?/g) || [];
    const points: Point[] = [];
    let i = 0, cmd = '', x = 0, y = 0, sx = 0, sy = 0;
    const num = () => parseFloat(t[i++]);
    while (i < t.length) {
        if (/[a-zA-Z]/.test(t[i])) cmd = t[i++];
        if (cmd === 'z') { x = sx; y = sy; points.push([x, y]); continue; }
        if (cmd === 'm' || cmd === 'l') {
            x += num(); y += num();
            if (cmd === 'm') { sx = x; sy = y; cmd = 'l'; }
            points.push([x, y]);
            continue;
        }
        if (cmd === 'c') {
            const [x1, y1, x2, y2, x3, y3] = [num(), num(), num(), num(), num(), num()];
            for (let k = 1; k <= steps; k++) {
                const s = k / steps, u = 1 - s;
                points.push([x + 3 * u * u * s * x1 + 3 * u * s * s * x2 + s * s * s * x3, y + 3 * u * u * s * y1 + 3 * u * s * s * y2 + s * s * s * y3]);
            }
            x += x3; y += y3;
            continue;
        }
        throw new Error(`pen: unknown path command "${cmd}"`);
    }
    return points;
}

const lengthOf = (points: Point[]) =>
    points.reduce((sum, p, i) => i ? sum + Math.hypot(p[0] - points[i - 1][0], p[1] - points[i - 1][1]) : 0, 0);

export interface PenStroke {
    d: string;
    /** Where the stroke starts (font units, the line's own). */
    x: number;
    y: number;
    /** How far the pen travels (em). */
    length: number;
}

export type PenLetter =
    | { kind: 'ink'; strokes: PenStroke[] }
    | { kind: 'space' }
    /** Not in the font: drawn as text at x (font units). */
    | { kind: 'text'; char: string; x: number };

export interface PenLine {
    letters: PenLetter[];
    /** The written width (font units). */
    width: number;
}

const measured = new Map<string, { strokes: Omit<PenStroke, 'x' | 'y'>[]; offsets: Point[]; left: number; width: number }>();

function measure(ch: string) {
    let m = measured.get(ch);
    if (m) return m;
    const glyph = GLYPHS[ch];
    let left = Infinity, right = -Infinity;
    const strokes = glyph.map(s => {
        const points = samplePath(s.d);
        for (const [px] of points) { left = Math.min(left, s.x + px); right = Math.max(right, s.x + px); }
        return { d: s.d, length: lengthOf(points) / UNITS };
    });
    m = { strokes, offsets: glyph.map(s => [s.x, s.y] as Point), left, width: right - left };
    measured.set(ch, m);
    return m;
}

/** A line of handwriting: each letter's strokes placed one after another. */
export function penLine(text: string): PenLine {
    const letters: PenLetter[] = [];
    let x = 0;
    for (const ch of text) {
        if (!ch.trim()) { letters.push({ kind: 'space' }); x += SPACE; continue; }
        if (!GLYPHS[ch]) {
            letters.push({ kind: 'text', char: ch, x });
            x += FALLBACK * UNITS + GAP;
            continue;
        }
        const m = measure(ch);
        letters.push({
            kind: 'ink',
            strokes: m.strokes.map((s, i) => ({ ...s, x: x - m.left + m.offsets[i][0], y: m.offsets[i][1] })),
        });
        x += m.width + GAP;
    }
    return { letters, width: Math.max(0, x - GAP) };
}
