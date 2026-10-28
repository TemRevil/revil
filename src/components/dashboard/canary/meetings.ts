/**
 * Meeting time and calendar rules for the Canary tab, kept apart from the screen so they
 * can be tested. Times follow the public booking rules (utils/bookingRules.ts): a
 * meeting's Date + Time are the owner's wall clock in their zone (hostZone: an IANA
 * name, or a fixed offset for an older Availability doc), and one definition turns them
 * into an instant and decides whether a one-hour slot overlaps another.
 */
import { meetingInstant, isTaken, offsetAt, type BookedSlot, type HostZone } from '../../../utils/bookingRules';

export interface MeetingSlot {
    id: string;
    date: Date;
    time: string;
    googleEventId?: string;
}

/** A meeting's local day + time label as stored ("DD/MM/YYYY", "hh:mm AM/PM"). */
export function toBookedSlot(m: Pick<MeetingSlot, 'date' | 'time'>): BookedSlot {
    const dd = String(m.date.getDate()).padStart(2, '0');
    const mm = String(m.date.getMonth() + 1).padStart(2, '0');
    return { Date: `${dd}/${mm}/${m.date.getFullYear()}`, Time: m.time };
}

/** When a meeting starts, as a UTC instant, or null when its time doesn't parse. */
export function meetingStart(m: Pick<MeetingSlot, 'date' | 'time'>, zone: HostZone): number | null {
    return meetingInstant(toBookedSlot(m), zone);
}

/** Whether moving `edited` to its new time would overlap another stored meeting. */
export function slotOccupied(edited: MeetingSlot, meetings: MeetingSlot[], zone: HostZone): boolean {
    const start = meetingStart(edited, zone);
    if (start === null) return false;
    return isTaken(start, offsetAt(zone, start), meetings.filter(m => m.id !== edited.id).map(toBookedSlot));
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
