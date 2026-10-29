import { describe, expect, it } from 'vitest';
import { LIFT, MS_PER_EM, WORD, penTimes } from './handwrite';

describe('penTimes', () => {
    it('writes strokes one after another at a steady pen speed, lifting the pen between them', () => {
        const [a, b] = penTimes([{ kind: 'stroke', length: 2 }, { kind: 'stroke', length: 4 }], 100);
        expect(a).toEqual({ delay: 100, duration: 2 * MS_PER_EM });
        // A stroke twice as long takes twice as long, and starts once the pen is set down again.
        expect(b).toEqual({ delay: 100 + 2 * MS_PER_EM + LIFT, duration: 4 * MS_PER_EM });
    });

    it('pauses between words instead of lifting', () => {
        const times = penTimes([{ kind: 'stroke', length: 2 }, { kind: 'space' }, { kind: 'stroke', length: 2 }]);
        expect(times[2].delay).toBe(2 * MS_PER_EM + WORD);
    });

    it('writes faster at a quicker pace', () => {
        const [a, b] = penTimes([{ kind: 'stroke', length: 2 }, { kind: 'stroke', length: 2 }], 0, 2);
        expect(a.duration).toBe(MS_PER_EM);
        expect(b.delay).toBe(MS_PER_EM + LIFT / 2);
    });
});
