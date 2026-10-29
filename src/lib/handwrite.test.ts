import { describe, expect, it } from 'vitest';
import { LIFT, MS_PER_EM, penTimes } from './handwrite';

describe('penTimes', () => {
    it('writes letters one after another at a steady pen speed', () => {
        const times = penTimes([10, 20], [false, false], 20, 100);
        expect(times[0]).toEqual({ delay: 100, duration: MS_PER_EM / 2 });
        // A letter twice as wide takes twice as long, and starts where the last one ended.
        expect(times[1]).toEqual({ delay: 100 + MS_PER_EM / 2, duration: MS_PER_EM });
    });

    it('lifts the pen for a space instead of writing it', () => {
        const times = penTimes([10, 6, 10], [false, true, false], 20);
        expect(times[1].duration).toBe(LIFT);
        expect(times[2].delay).toBe(MS_PER_EM / 2 + LIFT);
    });
});
