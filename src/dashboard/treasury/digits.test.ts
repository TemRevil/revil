import { describe, expect, it } from 'vitest';
import { toWesternDigits, decimalInput } from './digits';

describe('decimalInput', () => {
    it('stores Arabic-Indic and extended digits as 0-9', () => {
        expect(toWesternDigits('١٢٣٤٥٦٧٨٩٠')).toBe('1234567890');
        expect(toWesternDigits('۱۲۳')).toBe('123');
        expect(decimalInput('١٢٫٥')).toBe('12.5');
    });

    it('keeps one decimal point, a leading minus, and nothing else', () => {
        expect(decimalInput('1,250.50')).toBe('1250.50');
        expect(decimalInput('-40')).toBe('-40');
        expect(decimalInput('3.1.4')).toBe('3.14');
        expect(decimalInput('abc')).toBe('');
        expect(parseFloat(decimalInput('٧٥٠')) || 0).toBe(750);
    });
});
