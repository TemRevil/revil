import { describe, expect, it } from 'vitest';
import * as money from './money';

describe('money', () => {
    it('loads', () => {
        expect(Object.keys(money).length).toBeGreaterThan(0);
    });
});
