import { describe, expect, it } from 'vitest';
import { toBookedSlot, meetingStart, slotOccupied, cancelRequest, calendarErrorText } from './meetings';

const at = (y: number, mon: number, d: number) => new Date(y, mon - 1, d);

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

    it('stores the day the way bookings do', () => {
        expect(toBookedSlot({ date: at(2027, 3, 5), time: '09:00 AM' })).toEqual({ Date: '05/03/2027', Time: '09:00 AM' });
    });
});

describe('slotOccupied', () => {
    const meetings = [
        { id: 'a', date: at(2027, 3, 5), time: '09:00 AM' },
        { id: 'b', date: at(2027, 3, 5), time: '11:00 AM' },
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
