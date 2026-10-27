/**
 * Meeting time and calendar rules for the Canary tab, kept apart from the screen so they
 * can be tested. Times follow the public booking rules (utils/bookingRules.ts): a
 * meeting's Date + Time are the owner's wall clock, and one definition turns them into
 * an instant and decides whether a slot is taken.
 */
import { meetingInstant, isTaken, type BookedSlot } from '../../../utils/bookingRules';

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
export function meetingStart(m: Pick<MeetingSlot, 'date' | 'time'>, hostOffset: number): number | null {
    return meetingInstant(toBookedSlot(m), hostOffset);
}

/** Whether moving `edited` to its new time would collide with another stored meeting. */
export function slotOccupied(edited: MeetingSlot, meetings: MeetingSlot[], hostOffset: number): boolean {
    const start = meetingStart(edited, hostOffset);
    if (start === null) return false;
    return isTaken(start, hostOffset, meetings.filter(m => m.id !== edited.id).map(toBookedSlot));
}

/**
 * The calendar cancel to send for a meeting, or null when there is none to send.
 * Only an exact event id is ever cancelled: searching by email, name or time could
 * match - and delete - a different event.
 */
export function cancelRequest(m: Pick<MeetingSlot, 'googleEventId'>): { action: 'cancel'; eventId: string } | null {
    return m.googleEventId ? { action: 'cancel', eventId: m.googleEventId } : null;
}
