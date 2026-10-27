import { describe, expect, it } from 'vitest';
import { decodeFields, decodeValue } from './firestoreRest.mjs';

describe('Firestore REST decoding', () => {
    it('unwraps every scalar type the public documents use', () => {
        expect(decodeValue({ stringValue: 'hi' })).toBe('hi');
        expect(decodeValue({ integerValue: '42' })).toBe(42);
        expect(decodeValue({ doubleValue: 1.5 })).toBe(1.5);
        expect(decodeValue({ booleanValue: false })).toBe(false);
        expect(decodeValue({ nullValue: 'NULL_VALUE' })).toBeNull();
        expect(decodeValue({ timestampValue: '2026-10-27T09:00:00Z' })).toBe('2026-10-27T09:00:00Z');
    });

    it('unwraps maps and arrays, including empty ones', () => {
        expect(decodeValue({ mapValue: {} })).toEqual({});
        expect(decodeValue({ arrayValue: {} })).toEqual([]);
        expect(decodeValue({
            arrayValue: { values: [{ stringValue: 'a' }, { mapValue: { fields: { n: { integerValue: '1' } } } }] },
        })).toEqual(['a', { n: 1 }]);
    });

    it('answers null for a missing or unknown value', () => {
        expect(decodeValue(undefined)).toBeNull();
        expect(decodeValue({ geoPointValue: { latitude: 1, longitude: 2 } })).toBeNull();
    });

    it('returns fields in name order, at every depth, so the same content compares equal', () => {
        const a = decodeFields({
            b: { integerValue: '2' },
            a: { mapValue: { fields: { z: { stringValue: 'z' }, y: { stringValue: 'y' } } } },
        });
        expect(JSON.stringify(a)).toBe('{"a":{"y":"y","z":"z"},"b":2}');
        expect(decodeFields(undefined)).toEqual({});
    });
});
