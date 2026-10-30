import { describe, expect, it } from 'vitest';
import { readingIndex } from './Contents';

describe('readingIndex', () => {
    it('is the first section before any heading reaches the top', () => {
        expect(readingIndex([300, 900, 1500], 32)).toBe(0);
    });

    it('is the last heading that has reached the top', () => {
        expect(readingIndex([-600, 20, 700], 32)).toBe(1);
        expect(readingIndex([-1200, -500, 33], 32)).toBe(2);
    });
});
