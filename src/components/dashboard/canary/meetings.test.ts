import { describe, expect, it } from 'vitest';
import { meetingStart, slotOnHostClock, slotOccupied, cancelRequest, calendarErrorText } from './meetings';

const at = (y: number, mon: number, d: number) => new Date(y, mon - 1, d);
const stored = (id: string, y: number, mon: number, d: number, time: string, zone: number | string) =>
    ({ id, startMs: meetingStart({ date: at(y, mon, d), time }, zone) as number });

describe('meetingStart', () => {
    it('reads the owner wall clock as a UTC instant', () => {
        // 02:30 PM on 05/03/2027 at UTC+3 is 11:30 UTC.
        expect(meetingStart({ date: at(2027, 3, 5), time: '02:30 PM' }, 3)).toBe(Date.UTC(2027, 2, 5, 11, 30));
        expect(meetingStart({ date: at(2027, 3, 5), time: '12:00 AM' }, 0)).toBe(Date.UTC(2027, 2, 5, 0, 0));
        expect(meetingStart({ date: at(2027, 3, 5), time: 'later' }, 0)).toBeNull();
    });

    it('follows daylight saving for a named zone', () => {
        expect(meetingStart({ date: at(2027, 1, 15), time: '10:00 AM' }, 'Europe/Berlin')).toBe(Date.UTC(2027, 0, 15, 9, 0));
        expect(meetingStart({ date: at(2027, 7, 15), time: '10:00 AM' }, 'Europe/Berlin')).toBe(Date.UTC(2027, 6, 15, 8, 0));
    });

});

describe('slotOnHostClock', () => {
    it('shows a stored instant as the day and time on the owner clock', () => {
        expect(slotOnHostClock('2027-03-05T11:30:00.000Z', 3)).toEqual({ startMs: Date.UTC(2027, 2, 5, 11, 30), date: at(2027, 3, 5), time: '02:30 PM' });
        // Late evening UTC is already the next day in Tokyo.
        expect(slotOnHostClock('2027-03-05T22:00:00.000Z', 'Asia/Tokyo')).toMatchObject({ date: at(2027, 3, 6), time: '07:00 AM' });
    });

    it('round-trips with meetingStart', () => {
        const slot = slotOnHostClock('2027-07-15T08:00:00.000Z', 'Europe/Berlin');
        expect(slot && meetingStart(slot, 'Europe/Berlin')).toBe(Date.UTC(2027, 6, 15, 8, 0));
    });

    it('refuses anything that is not a stored instant', () => {
        expect(slotOnHostClock(undefined, 0)).toBeNull();
        expect(slotOnHostClock('05/03/2027', 0)).toBeNull();
        expect(slotOnHostClock('2027-03-05T11:30:00Z', 0)).toBeNull();
    });
});

describe('slotOccupied', () => {
    const meetings = [
        stored('a', 2027, 3, 5, '09:00 AM', 2),
        stored('b', 2027, 3, 5, '11:00 AM', 2),
    ];

    it('finds another meeting at the same start and ignores the one being moved', () => {
        expect(slotOccupied({ id: 'b', date: at(2027, 3, 5), time: '09:00 AM' }, meetings, 2)).toBe(true);
        expect(slotOccupied({ id: 'a', date: at(2027, 3, 5), time: '09:00 AM' }, meetings, 2)).toBe(false);
        expect(slotOccupied({ id: 'b', date: at(2027, 3, 6), time: '09:00 AM' }, meetings, 2)).toBe(false);
    });

    it('counts a one-hour overlap, not only the same start', () => {
        expect(slotOccupied({ id: 'c', date: at(2027, 3, 5), time: '09:30 AM' }, meetings, 2)).toBe(true);
        expect(slotOccupied({ id: 'c', date: at(2027, 3, 5), time: '10:00 AM' }, meetings, 'Africa/Cairo')).toBe(false);
        expect(slotOccupied({ id: 'c', date: at(2027, 3, 5), time: '10:45 AM' }, meetings, 'Africa/Cairo')).toBe(true);
    });
});

describe('cancelRequest', () => {
    it('cancels by exact event id only', () => {
        expect(cancelRequest({ googleEventId: 'evt_1' })).toEqual({ action: 'cancel', eventId: 'evt_1' });
    });

    it('sends nothing for a meeting without an event id, rather than a search that could hit another event', () => {
        expect(cancelRequest({})).toBeNull();
    });
});

describe('calendarErrorText', () => {
    it("shows the function's own sentence", () => {
        expect(calendarErrorText({ code: 'functions/internal', message: 'The calendar refused the change.' })).toBe('The calendar refused the change.');
        expect(calendarErrorText({ code: 'functions/invalid-argument', message: 'Invalid attendee email.' })).toBe('Invalid attendee email.');
    });

    it('reads a bare code or a network failure as the calendar being unreachable', () => {
        expect(calendarErrorText({ code: 'functions/internal', message: 'internal' })).toBe('The calendar could not be reached.');
        expect(calendarErrorText(new TypeError('Failed to fetch'))).toBe('The calendar could not be reached.');
        expect(calendarErrorText(undefined)).toBe('The calendar could not be reached.');
    });
});
