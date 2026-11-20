import { describe, expect, it } from 'vitest';
import {
    DAY_MS, MEETING_MS, bookingRefusal, customTimeRefusal, dayIndex, hostTimeToInstant, hostWallClock, hostZone,
    isTaken, isTimeZone, isUpcoming, isoInstant, offsetAt, parseAvailability,
    presetSlotsForDay, slotStart, zoneRecord, zonedInstant, type DayContext,
} from './bookingRules';

const HOUR = 3600000;
const MIN = 60000;
/** 15 January 2026 (a Thursday), as a day index. */
const JAN15 = dayIndex(2026, 0, 15);
/** 15 July 2026 (a Wednesday), as a day index. */
const JUL15 = dayIndex(2026, 6, 15);

/** The UTC instant of an owner wall-clock time at a fixed offset. */
const at = (day: number, h: number, m: number, offset: number) => day * DAY_MS + h * HOUR + m * MIN - offset * HOUR;
/** A stored meeting starting at that instant. */
const booked = (ms: number) => ({ start: isoInstant(ms) });

describe('isTaken', () => {
    // A 10:00 meeting on the owner's clock (UTC+2).
    const meetings = [booked(at(JAN15, 10, 0, 2))];

    it('treats a time inside an existing one-hour meeting as taken', () => {
        for (const minute of [0, 15, 30, 45]) {
            expect(isTaken(at(JAN15, 10, minute, 2), meetings)).toBe(true);
        }
    });

    it('treats a time whose hour would run into an existing meeting as taken', () => {
        expect(isTaken(at(JAN15, 9, 15, 2), meetings)).toBe(true);
        expect(isTaken(at(JAN15, 9, 45, 2), meetings)).toBe(true);
    });

    it('leaves the hours either side free', () => {
        expect(isTaken(at(JAN15, 9, 0, 2), meetings)).toBe(false);
        expect(isTaken(at(JAN15, 11, 0, 2), meetings)).toBe(false);
    });

    it('ignores meetings it cannot read, the old Date and Time strings included', () => {
        const unreadable = [{ start: 'soon' }, { start: Date.UTC(2026, 0, 15, 8) }, { Date: '15/01/2026', Time: '10:00 AM' }, {}];
        expect(isTaken(at(JAN15, 10, 0, 2), unreadable)).toBe(false);
    });
});

describe('custom times', () => {
    const ctx: DayContext = {
        nowMs: at(JAN15 - 2, 12, 0, 2),
        userTimezone: 2,
        hostOffset: 2,
        cfg: parseAvailability(null),
        meetings: [booked(at(JAN15, 10, 0, 2))],
    };

    it('refuses a custom time that overlaps a booking', () => {
        expect(customTimeRefusal(at(JAN15, 10, 15, 2), ctx)).toMatch(/overlaps/);
        expect(bookingRefusal(at(JAN15, 10, 30, 2), ctx)).not.toBeNull();
    });

    it('marks an overlapped preset slot as taken', () => {
        const withCustom = { ...ctx, meetings: [booked(at(JAN15, 10, 30, 2))] };
        const slots = presetSlotsForDay(JAN15, withCustom);
        const label = (h: number) => slots.find((s) => s.startMs === at(JAN15, h, 0, 2));
        expect(label(10)?.taken).toBe(true);
        expect(label(11)?.taken).toBe(true);
        expect(label(9)?.taken).toBe(false);
        expect(label(12)?.taken).toBe(false);
    });
});

describe('host zone and daylight saving', () => {
    it('reads the offset of a real zone for the instant asked about', () => {
        expect(offsetAt('Europe/Berlin', Date.UTC(2026, 0, 15, 12))).toBe(1);
        expect(offsetAt('Europe/Berlin', Date.UTC(2026, 6, 15, 12))).toBe(2);
        expect(offsetAt('Asia/Kathmandu', Date.UTC(2026, 6, 15, 12))).toBe(5.75);
        expect(offsetAt(3, Date.UTC(2026, 6, 15, 12))).toBe(3);
    });

    it('turns an owner wall-clock time into the right instant on both sides of a change', () => {
        expect(zonedInstant(JAN15, 9 * 60, 'Europe/Berlin')).toBe(Date.UTC(2026, 0, 15, 8));
        expect(zonedInstant(JUL15, 9 * 60, 'Europe/Berlin')).toBe(Date.UTC(2026, 6, 15, 7));
        expect(zonedInstant(JUL15, 9 * 60, 2)).toBe(Date.UTC(2026, 6, 15, 7));
    });

    it('shows a meeting on the owner clock, and reads that clock back, in summer and winter alike', () => {
        const summer = Date.UTC(2026, 6, 15, 7);
        const winter = Date.UTC(2026, 0, 15, 8);
        expect(hostWallClock(summer, 'Europe/Berlin')).toMatchObject({ date: '15/07/2026', time: '09:00 AM' });
        expect(hostWallClock(winter, 'Europe/Berlin')).toMatchObject({ date: '15/01/2026', time: '09:00 AM' });
        expect(hostTimeToInstant(JUL15, '09:00 AM', 'Europe/Berlin')).toBe(summer);
        expect(hostTimeToInstant(JAN15, '09:00 AM', 'Europe/Berlin')).toBe(winter);
        expect(hostTimeToInstant(JAN15, 'nine', 'Europe/Berlin')).toBeNull();
    });

    it('offers the preset hours on the owner clock whatever the season', () => {
        const ctx = (nowMs: number): DayContext => ({
            nowMs, userTimezone: 0, hostOffset: 'Europe/Berlin', cfg: { workingDays: [0, 1, 2, 3, 4, 5, 6], hours: [9] }, meetings: [],
        });
        expect(presetSlotsForDay(JAN15, ctx(Date.UTC(2026, 0, 1))).map((s) => s.startMs)).toEqual([Date.UTC(2026, 0, 15, 8)]);
        expect(presetSlotsForDay(JUL15, ctx(Date.UTC(2026, 6, 1))).map((s) => s.startMs)).toEqual([Date.UTC(2026, 6, 15, 7)]);
    });

    it('prefers the saved zone name, then the Current Time offset, then the default', () => {
        expect(hostZone({ timeZone: 'Africa/Cairo', 'Current Time': 'UTC+03:00 (Cairo)' })).toBe('Africa/Cairo');
        expect(hostZone({ timeZone: 'Not/AZone', 'Current Time': 'UTC+03:00 (Cairo)' })).toBe(3);
        expect(hostZone({ 'Current Time': 'UTC-03:30' })).toBe(-3.5);
        expect(hostZone(undefined)).toBe(2);
        expect(isTimeZone('UTC')).toBe(true);
        expect(isTimeZone('../etc')).toBe(false);
        expect(isTimeZone(5)).toBe(false);
    });
});

describe('busy blocks from the owner calendar', () => {
    // Busy on the owner's clock (UTC+2) from 13:30 to 15:00.
    const busy = [{ start: isoInstant(at(JAN15, 13, 30, 2)), end: isoInstant(at(JAN15, 15, 0, 2)) }];

    it('takes every time whose hour would touch the block, whatever its length', () => {
        expect(isTaken(at(JAN15, 12, 45, 2), busy)).toBe(true);
        expect(isTaken(at(JAN15, 13, 0, 2), busy)).toBe(true);
        expect(isTaken(at(JAN15, 14, 45, 2), busy)).toBe(true);
    });

    it('leaves the times that end before it or start after it free', () => {
        expect(isTaken(at(JAN15, 12, 30, 2), busy)).toBe(false);
        expect(isTaken(at(JAN15, 15, 0, 2), busy)).toBe(false);
    });

    it('reads an end that is missing, unreadable or not after the start as a one-hour meeting', () => {
        const start = isoInstant(at(JAN15, 10, 0, 2));
        for (const end of [undefined, 'later', start, isoInstant(at(JAN15, 9, 0, 2))]) {
            expect(isTaken(at(JAN15, 10, 45, 2), [{ start, end }])).toBe(true);
            expect(isTaken(at(JAN15, 11, 0, 2), [{ start, end }])).toBe(false);
        }
    });

    it('greys a preset slot that falls in a block and keeps a block upcoming until it ends', () => {
        const ctx: DayContext = {
            nowMs: at(JAN15, 0, 0, 2) - DAY_MS, userTimezone: 2, hostOffset: 2,
            cfg: { workingDays: [0, 1, 2, 3, 4, 5, 6], hours: [13, 14, 15] }, meetings: busy,
        };
        expect(presetSlotsForDay(JAN15, ctx).map((s) => s.taken)).toEqual([true, true, false]);
        expect(isUpcoming(busy[0], at(JAN15, 14, 59, 2))).toBe(true);
        expect(isUpcoming(busy[0], at(JAN15, 15, 0, 2))).toBe(false);
    });
});

describe('isUpcoming', () => {
    const start = at(JAN15, 10, 0, 2);
    const m = booked(start);

    it('counts a meeting until it has ended', () => {
        expect(isUpcoming(m, start - DAY_MS)).toBe(true);
        expect(isUpcoming(m, start + MEETING_MS - 1)).toBe(true);
        expect(isUpcoming(m, start + MEETING_MS)).toBe(false);
    });

    it('never counts a meeting it cannot read', () => {
        expect(isUpcoming({ start: '' }, 0)).toBe(false);
    });
});

describe('stored instants', () => {
    it('reads back only the exact ISO shape a meeting is stored in', () => {
        expect(slotStart({ start: '2026-10-28T14:00:00.000Z' })).toBe(Date.UTC(2026, 9, 28, 14));
        expect(slotStart({ start: isoInstant(Date.UTC(2027, 0, 1)) })).toBe(Date.UTC(2027, 0, 1));
        expect(slotStart({ start: '2026-10-28T14:00:00+02:00' })).toBeNull();
        expect(slotStart({ start: '2026-10-28' })).toBeNull();
        expect(slotStart(null)).toBeNull();
    });

    it('records the zone name, or the fixed offset when no zone is named', () => {
        expect(zoneRecord('Africa/Cairo')).toEqual({ timeZone: 'Africa/Cairo', utcOffset: null });
        expect(zoneRecord(3)).toEqual({ timeZone: null, utcOffset: 3 });
    });
});
