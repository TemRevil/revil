/**
 * Meeting time and calendar rules for the Canary tab, kept apart from the screen so they
 * can be tested. Times follow the public booking rules (utils/bookingRules.ts): a meeting
 * stores the UTC instant it starts (`start`), and the tab shows it on the owner's clock
 * (hostZone: an IANA name, or a fixed offset for an older Availability doc). One
 * definition turns a picked day and time into an instant and decides whether a one-hour
 * slot overlaps another.
 */
import {
    dayIndex, hostTimeToInstant, hostWallClock, isTaken, isoInstant, slotStart, type HostZone,
} from '../../../utils/bookingRules';

export interface MeetingSlot {
    id: string;
    /** The owner's calendar day, as a local Date at midnight. */
    date: Date;
    /** "hh:mm AM/PM" on the owner's clock. */
    time: string;
    /** When it starts, as a UTC instant. */
    startMs: number;
    googleEventId?: string;
}

/** When a picked day and owner-clock time start, as a UTC instant, or null when the time doesn't parse. */
export function meetingStart(m: Pick<MeetingSlot, 'date' | 'time'>, zone: HostZone): number | null {
    return hostTimeToInstant(dayIndex(m.date.getFullYear(), m.date.getMonth(), m.date.getDate()), m.time, zone);
}

/** A stored `start` on the owner's clock: the day (local Date at midnight) and "hh:mm AM/PM". */
export function slotOnHostClock(start: unknown, zone: HostZone): { startMs: number; date: Date; time: string } | null {
    const startMs = slotStart({ start });
    if (startMs === null) return null;
    const w = hostWallClock(startMs, zone);
    const [d, mon, y] = w.date.split('/').map(Number);
    return { startMs, date: new Date(y, mon - 1, d), time: w.time };
}

/** Whether moving `edited` to its new day and time would overlap another stored meeting. */
export function slotOccupied(
    edited: Pick<MeetingSlot, 'id' | 'date' | 'time'>, meetings: Pick<MeetingSlot, 'id' | 'startMs'>[], zone: HostZone,
): boolean {
    const start = meetingStart(edited, zone);
    if (start === null) return false;
    return isTaken(start, meetings.filter(m => m.id !== edited.id).map(m => ({ start: isoInstant(m.startMs) })));
}

/**
 * The calendar cancel to send for a meeting, or null when there is none to send.
 * Only an exact event id is ever cancelled: searching by email, name or time could
 * match - and delete - a different event.
 */
export function cancelRequest(m: Pick<MeetingSlot, 'googleEventId'>): { action: 'cancel'; eventId: string } | null {
    return m.googleEventId ? { action: 'cancel', eventId: m.googleEventId } : null;
}

/**
 * A plain sentence for a failed callable. The functions answer with short, generic
 * messages ("The calendar refused the change."); those are shown as they are. Anything
 * else - a network drop, a bare code - becomes `fallback`.
 */
export function callableErrorText(err: unknown, fallback: string): string {
    const e = (err && typeof err === 'object' ? err : {}) as { code?: unknown; message?: unknown };
    const code = typeof e.code === 'string' ? e.code : '';
    const message = typeof e.message === 'string' ? e.message.trim() : '';
    const bare = code.replace(/^functions\//, '').toLowerCase();
    if (code.startsWith('functions/') && message && message.toLowerCase() !== bare) return message;
    return fallback;
}

/** callableErrorText for syncMeeting. */
export const calendarErrorText = (err: unknown): string => callableErrorText(err, 'The calendar could not be reached.');
