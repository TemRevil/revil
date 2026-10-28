// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

// The owner works from London, which is on summer time (UTC+1) in July, while the stored
// 'Current Time' label still reads the winter offset.
const AVAILABILITY = { timeZone: 'Europe/London', 'Current Time': 'UTC+00:00 (London)' };
// One booked call, plus an entry in the old { Date, Time } shape that must be ignored.
const SLOTS = { Slots: [{ start: '2027-07-06T12:00:00.000Z' }, { Date: '07/07/2027', Time: '10:00 AM' }] };

vi.mock('../lib/liveDoc', () => ({
    loadFirebase: vi.fn(),
    watchDoc: (path: string[], onData: (d: Record<string, unknown> | null) => void) => {
        onData(path[1] === 'Availability' ? AVAILABILITY : SLOTS);
        return () => { };
    },
}));
vi.mock('../lib/dataCache', () => ({ cachedDoc: () => undefined }));

const { default: useMeetingBooking } = await import('./useMeetingBooking');

type Booking = ReturnType<typeof useMeetingBooking>;
let root: Root | null = null;
afterEach(() => { act(() => root?.unmount()); root = null; document.body.innerHTML = ''; });

describe('useMeetingBooking', () => {
    it('places the owner\'s hours in the owner\'s named zone, summer time included', () => {
        let api: Booking | null = null;
        function Probe() {
            api = useMeetingBooking({ showAlert: () => { }, enabled: false });
            return null;
        }
        const host = document.createElement('div');
        document.body.appendChild(host);
        root = createRoot(host);
        act(() => root!.render(createElement(Probe)));
        act(() => api!.setUserTimezone(0));

        // Monday 5 July 2027: the first preset hour, London summer time, is an hour
        // earlier in UTC. The bare 'Current Time' offset would put it at that hour UTC.
        const first = api!.availConfig.hours[0];
        const slots = api!.daySlots(new Date(2027, 6, 5));
        expect(slots.length).toBeGreaterThan(0);
        expect(slots[0].startMs).toBe(Date.UTC(2027, 6, 5, first - 1));
    });

    it('reads booked slots as instants and shows them on the visitor clock', () => {
        let api: Booking | null = null;
        function Probe() {
            api = useMeetingBooking({ showAlert: () => { }, enabled: false });
            return null;
        }
        const host = document.createElement('div');
        document.body.appendChild(host);
        root = createRoot(host);
        act(() => root!.render(createElement(Probe)));
        act(() => api!.setUserTimezone(3));

        const booked = api!.getMeetingsForDate(new Date(2027, 6, 6));
        expect(booked).toEqual([{ start: '2027-07-06T12:00:00.000Z' }]);
        expect(api!.meetingTimeForVisitor(booked[0])).toBe('03:00 PM');
        expect(api!.getMeetingsForDate(new Date(2027, 6, 7))).toEqual([]);
    });
});
