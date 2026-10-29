import { describe, expect, it } from 'vitest';
import { UNITS, penLine, samplePath } from './pen';

describe('samplePath', () => {
    it('follows relative lines and curves, and closes back to the start', () => {
        expect(samplePath('m 0,0 l 3,4 z')).toEqual([[0, 0], [3, 4], [0, 0]]);
        // A straight curve ends where its last point says.
        const curve = samplePath('m 0,0 c 1,0,2,0,3,0', 4);
        expect(curve[curve.length - 1]).toEqual([3, 0]);
    });
});

describe('penLine', () => {
    it('places each letter after the last, in the order written', () => {
        const [i, l] = penLine('il').letters;
        if (i.kind !== 'ink' || l.kind !== 'ink') throw new Error('expected ink');
        expect(l.strokes[0].x).toBeGreaterThan(i.strokes[0].x);
        expect(i.strokes).toHaveLength(2); // the stem, then the dot
    });

    it('measures how far the pen travels, in em', () => {
        const [one] = penLine('1').letters;
        if (one.kind !== 'ink') throw new Error('expected ink');
        // "1" is a single near-vertical stroke about 30 font units long.
        expect(one.strokes[0].length).toBeGreaterThan(25 / UNITS);
        expect(one.strokes[0].length).toBeLessThan(35 / UNITS);
    });

    it('keeps words apart and sets what the pen cannot write as text', () => {
        const kinds = penLine('a b€').letters.map(l => l.kind);
        expect(kinds).toEqual(['ink', 'space', 'ink', 'text']);
        expect(penLine('ab').width).toBeLessThan(penLine('a b').width);
    });
});
