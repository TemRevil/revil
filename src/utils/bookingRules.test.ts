import { describe, expect, it } from 'vitest';
import {
    DAY_MS, MEETING_MS, bookingRefusal, customTimeRefusal, dayIndex, hostWallClock, hostZone,
    isTaken, isTimeZone, isUpcoming, meetingInstant, offsetAt, parseAvailability,
    presetSlotsForDay, zonedInstant, type DayContext,
} from './bookingRules';

const HOUR = 3600000;
const MIN = 60000;
/** 15 January 2026 (a Thursday), as a day index. */
const JAN15 = dayIndex(2026, 0, 15);
/** 15 July 2026 (a Wednesday), as a day index. */
const JUL15 = dayIndex(2026, 6, 15);

/** The UTC instant of an owner wall-clock time at a fixed offset. */
const at = (day: number, h: number, m: number, offset: number) => day * DAY_MS + h * HOUR + m * MIN - offset * HOUR;

describe('isTaken', () => {
    // A 10:00 meeting on the owner's clock (UTC+2).
    const meetings = [{ Date: '15/01/2026', Time: '10:00 AM' }];

    it('treats a time inside an existing one-hour meeting as taken', () => {
        for (const minute of [0, 15, 30, 45]) {
            expect(isTaken(at(JAN15, 10, minute, 2), 2, meetings)).toBe(true);
        }
    });

    it('treats a time whose hour would run into an existing meeting as taken', () => {
        expect(isTaken(at(JAN15, 9, 15, 2), 2, meetings)).toBe(true);
        expect(isTaken(at(JAN15, 9, 45, 2), 2, meetings)).toBe(true);
    });

    it('leaves the hours either side free', () => {
        expect(isTaken(at(JAN15, 9, 0, 2), 2, meetings)).toBe(false);
        expect(isTaken(at(JAN15, 11, 0, 2), 2, meetings)).toBe(false);
    });

    it('ignores meetings it cannot read', () => {
        expect(isTaken(at(JAN15, 10, 0, 2), 2, [{ Date: 'soon', Time: '10:00 AM' }, { Date: '15/01/2026' }])).toBe(false);
    });
});

describe('custom times', () => {
    const ctx: DayContext = {
        nowMs: at(JAN15 - 2, 12, 0, 2),
        userTimezone: 2,
        hostOffset: 2,
        cfg: parseAvailability(null),
        meetings: [{ Date: '15/01/2026', Time: '10:00 AM' }],
    };

    it('refuses a custom time that overlaps a booking', () => {
        expect(customTimeRefusal(at(JAN15, 10, 15, 2), ctx)).toMatch(/overlaps/);
        expect(bookingRefusal(at(JAN15, 10, 30, 2), ctx)).not.toBeNull();
    });

    it('marks an overlapped preset slot as taken', () => {
        const withCustom = { ...ctx, meetings: [{ Date: '15/01/2026', Time: '10:30 AM' }] };
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

    it('stores and reads back a meeting in summer and winter alike', () => {
        const summer = Date.UTC(2026, 6, 15, 7);
        const winter = Date.UTC(2026, 0, 15, 8);
        const s = hostWallClock(summer, 'Europe/Berlin');
        const w = hostWallClock(winter, 'Europe/Berlin');
        expect(s).toMatchObject({ date: '15/07/2026', time: '09:00 AM' });
        expect(w).toMatchObject({ date: '15/01/2026', time: '09:00 AM' });
        expect(meetingInstant({ Date: s.date, Time: s.time }, 'Europe/Berlin')).toBe(summer);
        expect(meetingInstant({ Date: w.date, Time: w.time }, 'Europe/Berlin')).toBe(winter);
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

describe('isUpcoming', () => {
    const m = { Date: '15/01/2026', Time: '10:00 AM' };
    const start = at(JAN15, 10, 0, 2);

    it('counts a meeting until it has ended', () => {
        expect(isUpcoming(m, 2, start - DAY_MS)).toBe(true);
        expect(isUpcoming(m, 2, start + MEETING_MS - 1)).toBe(true);
        expect(isUpcoming(m, 2, start + MEETING_MS)).toBe(false);
    });

    it('never counts a meeting it cannot read', () => {
        expect(isUpcoming({ Date: '', Time: '' }, 2, 0)).toBe(false);
    });
});
