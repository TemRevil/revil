import { describe, expect, it } from 'vitest';
import { initialZone, zoneLabel } from './zone';

const JAN = Date.UTC(2026, 0, 15);
const JUL = Date.UTC(2026, 6, 15);

describe('zoneLabel', () => {
    it('labels a zone with the offset it has that day', () => {
        expect(zoneLabel('Europe/Berlin', JAN)).toBe('UTC+01:00 (Berlin)');
        expect(zoneLabel('Europe/Berlin', JUL)).toBe('UTC+02:00 (Berlin)');
        expect(zoneLabel('Asia/Kolkata', JAN)).toBe('UTC+05:30 (Kolkata)');
        expect(zoneLabel('America/St_Johns', JAN)).toBe('UTC-03:30 (St Johns)');
        expect(zoneLabel('UTC', JAN)).toBe('UTC+00:00');
    });
});

describe('initialZone', () => {
    const zones = ['America/New_York', 'Asia/Riyadh', 'Europe/Moscow', 'Europe/Berlin'];

    it('opens on the saved zone name', () => {
        expect(initialZone({ timeZone: 'Asia/Riyadh', 'Current Time': 'UTC+03:00 (Riyadh)' }, 'Europe/Berlin', zones, JAN)).toBe('Asia/Riyadh');
    });

    it('for an offset-only doc, prefers the browser zone when it matches, else a zone at that offset', () => {
        expect(initialZone({ 'Current Time': 'UTC+01:00 (CET)' }, 'Europe/Berlin', zones, JAN)).toBe('Europe/Berlin');
        expect(initialZone({ 'Current Time': 'UTC+03:00 (MSK)' }, 'Europe/Berlin', zones, JAN)).toBe('Asia/Riyadh');
    });

    it('falls back to the browser zone when nothing usable is stored', () => {
        expect(initialZone({ timeZone: 'Not/AZone' }, 'Europe/Berlin', zones, JAN)).toBe('Europe/Berlin');
        expect(initialZone(undefined, 'Europe/Berlin', zones, JAN)).toBe('Europe/Berlin');
    });
});
