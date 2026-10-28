import { afterEach, describe, expect, it, vi } from 'vitest';
import { timeZoneOptions, timezoneOptions } from './timezones';

afterEach(() => vi.restoreAllMocks());

describe('timezoneOptions', () => {
    it('offers the half-hour, quarter-hour and far-east offsets people really live in', () => {
        const values = timezoneOptions().map((o) => o.value);
        for (const v of [-9.5, -3.5, 3.5, 4.5, 5.5, 5.75, 6.5, 8.75, 9.5, 10.5, 12.75, 13, 14]) {
            expect(values).toContain(v);
        }
        expect(timezoneOptions().find((o) => o.value === 5.75)?.label).toMatch(/^UTC\+05:45/);
        expect(timezoneOptions().find((o) => o.value === -3.5)?.label).toMatch(/^UTC-03:30/);
    });

    it('keeps the list in offset order', () => {
        const values = timezoneOptions().map((o) => o.value);
        expect([...values].sort((a, b) => a - b)).toEqual(values);
    });

    it('always includes the reader\'s own offset, even one missing from the list', () => {
        vi.spyOn(Date.prototype, 'getTimezoneOffset').mockReturnValue(495); // UTC-08:15
        const values = timezoneOptions().map((o) => o.value);
        expect(values).toContain(-8.25);
        expect([...values].sort((a, b) => a - b)).toEqual(values);
    });
});

describe('timeZoneOptions', () => {
    it('lists real zones by name, labelled with the offset they have at that moment', () => {
        const winter = timeZoneOptions(Date.UTC(2026, 0, 15));
        const summer = timeZoneOptions(Date.UTC(2026, 6, 15));
        expect(winter.find((o) => o.value === 'Europe/Berlin')?.label).toBe('UTC+01:00 (Berlin)');
        expect(summer.find((o) => o.value === 'Europe/Berlin')?.label).toBe('UTC+02:00 (Berlin)');
        expect(winter.find((o) => o.value === 'America/St_Johns')?.label).toBe('UTC-03:30 (St Johns)');
    });

    it('sorts by offset, then by name', () => {
        const list = timeZoneOptions(Date.UTC(2026, 0, 15));
        const berlin = list.findIndex((o) => o.value === 'Europe/Berlin');
        const london = list.findIndex((o) => o.value === 'Europe/London');
        const tokyo = list.findIndex((o) => o.value === 'Asia/Tokyo');
        expect(london).toBeLessThan(berlin);
        expect(berlin).toBeLessThan(tokyo);
    });
});
