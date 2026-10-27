import { describe, expect, it } from 'vitest';
import { toBookedSlot, meetingStart, slotOccupied, cancelRequest } from './meetings';

const at = (y: number, mon: number, d: number) => new Date(y, mon - 1, d);

describe('meetingStart', () => {
    it('reads the owner wall clock as a UTC instant', () => {
        // 02:30 PM on 05/03/2027 at UTC+3 is 11:30 UTC.
        expect(meetingStart({ date: at(2027, 3, 5), time: '02:30 PM' }, 3)).toBe(Date.UTC(2027, 2, 5, 11, 30));
        expect(meetingStart({ date: at(2027, 3, 5), time: '12:00 AM' }, 0)).toBe(Date.UTC(2027, 2, 5, 0, 0));
        expect(meetingStart({ date: at(2027, 3, 5), time: 'later' }, 0)).toBeNull();
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
});

describe('cancelRequest', () => {
    it('cancels by exact event id only', () => {
        expect(cancelRequest({ googleEventId: 'evt_1' })).toEqual({ action: 'cancel', eventId: 'evt_1' });
    });

    it('sends nothing for a meeting without an event id, rather than a search that could hit another event', () => {
        expect(cancelRequest({})).toBeNull();
    });
});
