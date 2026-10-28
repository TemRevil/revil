// GENERATED from src/utils/bookingRules.ts by scripts/sync-shared.mjs - edit that file.

/**
 * Public booking rules - the ONE definition of which days and times a visitor may book.
 *
 * The booking calendar (src/hooks/useMeetingBooking.ts) draws from it, and the
 * bookMeeting Cloud Function enforces it, so a request sent straight to the function
 * can never book something the page would not have offered. The functions build copies
 * this file to functions/src/booking.ts (functions/scripts/sync-shared.mjs):
 * edit it here. It must stay dependency-free.
 *
 * The model:
 *  - The owner's preset slots are their working days x hours, on THEIR clock. A slot
 *    belongs to whichever of the visitor's days it falls on in the timezone the visitor
 *    picked, so e.g. the owner's Monday 09:00 (UTC+3) is Sunday 11 PM for a visitor at
 *    UTC-7. (The page used to shift only the time of day, which offered the owner's
 *    Saturday 09:00 on the visitor's Friday and greyed the wrong day's taken slots.)
 *  - A visitor day is open when it is within the booking window and still has a preset
 *    slot that is free and at least 30 minutes away.
 *  - On an open day a visitor may also propose a custom time - outside the preset hours
 *    is the point of it - on the picker's 15-minute grid, as long as it is on one of the
 *    owner's working days (their date), 30+ minutes away and not already taken.
 *  - Every meeting lasts an hour, so a time is taken when it would overlap a stored
 *    meeting, not only when it starts at the same minute.
 *  - The owner's clock is a HostZone: an IANA zone name follows daylight saving, so its
 *    offset is worked out for each instant; a bare number is a fixed UTC offset.
 */

export interface AvailabilityConfig {
    /** Weekday numbers that are working days (0 = Sun … 6 = Sat), owner's clock. */
    workingDays: number[];
    /** Bookable hours (0–23), owner's clock. */
    hours: number[];
}

/** Every stored meeting carries the owner's wall-clock "DD/MM/YYYY" + "hh:mm AM/PM". */
export interface BookedSlot {
    Date?: string;
    Time?: string;
}

// Preserves the historic hardcoded schedule until the owner edits it: every day on,
// 09:00–17:00 with the 13:00 (1 PM) hour left out.
export const DEFAULT_AVAILABILITY: AvailabilityConfig = {
    workingDays: [0, 1, 2, 3, 4, 5, 6],
    hours: [9, 10, 11, 12, 14, 15, 16, 17],
};

/** The owner's timezone until Settings/Availability says otherwise. */
export const DEFAULT_HOST_TZ = 'UTC+02:00 (EET)';
/** How many days ahead of the visitor's today the calendar offers. */
export const BOOKING_WINDOW_DAYS = 45;
/** No booking may start sooner than this. */
const BOOKING_BUFFER_MS = 30 * 60000;
/** The custom-time picker's minute grid. */
const CUSTOM_GRID_MINUTES = 15;

export const DAY_MS = 86400000;
const HOUR_MS = 3600000;
/** How long every meeting lasts. */
export const MEETING_MS = HOUR_MS;

/**
 * The owner's clock. An IANA zone name ("Africa/Cairo") follows daylight saving, so the
 * offset is looked up for each instant; a number is a fixed offset in hours east of UTC,
 * which is all a "Current Time" string such as "UTC+03:00 (Cairo)" can say.
 */
export type HostZone = string | number;

const zoneFormats = new Map<string, Intl.DateTimeFormat>();

function zoneFormat(zone: string): Intl.DateTimeFormat | null {
    const hit = zoneFormats.get(zone);
    if (hit) return hit;
    try {
        const f = new Intl.DateTimeFormat('en-US', {
            timeZone: zone, hourCycle: 'h23',
            year: 'numeric', month: 'numeric', day: 'numeric',
            hour: 'numeric', minute: 'numeric', second: 'numeric',
        });
        zoneFormats.set(zone, f);
        return f;
    } catch {
        return null;
    }
}

/** Whether a value names a timezone this runtime knows ("Africa/Cairo", "UTC"). */
export function isTimeZone(name: unknown): name is string {
    return typeof name === 'string' && name.length > 0 && name.length <= 64 && zoneFormat(name) !== null;
}

/** Hours east of UTC the zone is at an instant (3 for Cairo in summer, 2 in winter). */
export function offsetAt(zone: HostZone, instantMs: number): number {
    if (typeof zone === 'number') return Number.isFinite(zone) ? zone : 0;
    const f = zoneFormat(zone);
    if (!f || !Number.isFinite(instantMs)) return 0;
    const parts: Record<string, number> = {};
    for (const p of f.formatToParts(new Date(instantMs))) parts[p.type] = Number(p.value);
    const wall = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour % 24, parts.minute, parts.second);
    return Math.round((wall - Math.floor(instantMs / 1000) * 1000) / 60000) / 60;
}

/**
 * The instant a wall-clock time happens in the zone: `minutes` after midnight on the
 * calendar day `day` (see dayIndex). Inside a daylight-saving jump the nearest real
 * instant wins.
 */
export function zonedInstant(day: number, minutes: number, zone: HostZone): number {
    const naive = day * DAY_MS + minutes * 60000;
    const guess = naive - offsetAt(zone, naive) * HOUR_MS;
    return naive - offsetAt(zone, guess) * HOUR_MS;
}

/**
 * The owner's zone from a Settings/Availability doc: its IANA `timeZone` when that names
 * a real zone, else the fixed offset in its "Current Time" string, else the default.
 */
export function hostZone(data: Record<string, unknown> | undefined | null): HostZone {
    const named = data?.timeZone;
    if (isTimeZone(named)) return named;
    return utcOffsetHours(data?.['Current Time'] ?? DEFAULT_HOST_TZ);
}

function sanitizeHours(arr: unknown[]): number[] {
    return [...new Set(arr.filter((h): h is number => typeof h === 'number' && Number.isInteger(h) && h >= 0 && h <= 23))]
        .sort((a, b) => a - b);
}

/**
 * Legacy fallback: earlier versions stored a startHour/endHour range with an optional
 * break. If a doc predates the `hours` array, derive the hour list from those.
 */
function deriveLegacyHours(data: Record<string, unknown>): number[] | null {
    const sh = data.startHour, eh = data.endHour;
    if (typeof sh !== 'number' || typeof eh !== 'number') return null;
    const bs = typeof data.breakStart === 'number' ? data.breakStart : null;
    const be = typeof data.breakEnd === 'number' ? data.breakEnd : null;
    const out: number[] = [];
    for (let h = sh; h <= eh; h++) {
        if (bs !== null && be !== null && h >= bs && h < be) continue;
        if (h >= 0 && h <= 23) out.push(h);
    }
    return out.length ? out : null;
}

/** Read + validate the availability config off a Settings/Availability doc's data. */
export function parseAvailability(data: Record<string, unknown> | undefined | null): AvailabilityConfig {
    if (!data) return DEFAULT_AVAILABILITY;
    const rawDays = Array.isArray(data.workingDays) ? data.workingDays : null;
    const workingDays = rawDays
        ? [...new Set(rawDays.filter((d): d is number => typeof d === 'number' && d >= 0 && d <= 6))].sort((a, b) => a - b)
        : DEFAULT_AVAILABILITY.workingDays;
    // An explicit empty `hours` array is respected (owner is fully off); only an ABSENT
    // field falls back to the legacy range or the default.
    const hours = Array.isArray(data.hours)
        ? sanitizeHours(data.hours)
        : deriveLegacyHours(data) ?? DEFAULT_AVAILABILITY.hours;
    return { workingDays, hours };
}

/** Hours east of UTC from a "UTC+03:00 (EEST)" style string; 0 when it doesn't parse. */
export function utcOffsetHours(tz: unknown): number {
    const m = /UTC([+-]\d{2}):(\d{2})/.exec(String(tz ?? ''));
    if (!m) return 0;
    const h = parseInt(m[1], 10);
    return h + (parseInt(m[2], 10) / 60) * (h < 0 ? -1 : 1);
}

const pad2 = (n: number) => n.toString().padStart(2, '0');

/** "hh:mm AM/PM" - the label every slot and stored meeting Time uses. */
function timeLabel(h24: number, min: number): string {
    return `${pad2(h24 % 12 || 12)}:${pad2(min)} ${h24 >= 12 ? 'PM' : 'AM'}`;
}

/** "hh:mm AM/PM" -> minutes after midnight, or null. */
function parseTimeLabel(label: string): number | null {
    const m = /^(\d{1,2}):(\d{2})\s*(AM|PM)$/i.exec(String(label || '').trim());
    if (!m) return null;
    let h = parseInt(m[1], 10);
    const min = parseInt(m[2], 10);
    if (h < 1 || h > 12 || min > 59) return null;
    const pm = m[3].toUpperCase() === 'PM';
    if (pm && h !== 12) h += 12;
    if (!pm && h === 12) h = 0;
    return h * 60 + min;
}

/** A calendar day as a whole number of days since 1970-01-01 (timezone-free). */
export function dayIndex(year: number, month: number, day: number): number {
    return Math.round(Date.UTC(year, month, day) / DAY_MS);
}

/** Which calendar day an instant falls on at a UTC offset. */
export function dayIndexAt(instantMs: number, offsetHours: number): number {
    return Math.floor((instantMs + offsetHours * HOUR_MS) / DAY_MS);
}

/** The wall clock at a fixed offset for an instant, in the Date/Time shape meetings use. */
export function wallClock(instantMs: number, offsetHours: number): { date: string; time: string; weekday: number } {
    const w = new Date(instantMs + offsetHours * HOUR_MS);
    return {
        date: `${pad2(w.getUTCDate())}/${pad2(w.getUTCMonth() + 1)}/${w.getUTCFullYear()}`,
        time: timeLabel(w.getUTCHours(), w.getUTCMinutes()),
        weekday: w.getUTCDay(),
    };
}

/** The owner's wall clock for an instant: the Date/Time a meeting is stored under. */
export function hostWallClock(instantMs: number, zone: HostZone): { date: string; time: string; weekday: number } {
    return wallClock(instantMs, offsetAt(zone, instantMs));
}

/** The instant of a visitor's "hh:mm AM/PM" on a visitor day, or null for a bad label. */
export function visitorTimeToInstant(visitorDay: number, label: string, userTimezone: number): number | null {
    const min = parseTimeLabel(label);
    if (min === null) return null;
    return visitorDay * DAY_MS + min * 60000 - userTimezone * HOUR_MS;
}

/** The instant a stored meeting starts at, or null when its Date/Time don't parse. */
export function meetingInstant(m: BookedSlot, hostOffset: HostZone): number | null {
    const d = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(String(m?.Date || ''));
    const min = parseTimeLabel(String(m?.Time || ''));
    if (!d || min === null) return null;
    return zonedInstant(dayIndex(+d[3], +d[2] - 1, +d[1]), min, hostOffset);
}

/** Whether a one-hour meeting starting at startMs would overlap a stored one. */
function overlapsStored(startMs: number, zone: HostZone, meetings: BookedSlot[]): boolean {
    return meetings.some((m) => {
        const at = m ? meetingInstant(m, zone) : null;
        return at !== null && Math.abs(at - startMs) < MEETING_MS;
    });
}

/**
 * Whether a one-hour meeting starting at startMs would overlap one already stored.
 * `hostOffset` is the owner's offset at startMs (offsetAt gives it for a zone).
 */
export function isTaken(startMs: number, hostOffset: number, meetings: BookedSlot[]): boolean {
    return overlapsStored(startMs, hostOffset, meetings);
}

/** A stored meeting that has not ended yet. One that can't be read never counts. */
export function isUpcoming(m: BookedSlot, zone: HostZone, nowMs: number): boolean {
    const at = meetingInstant(m, zone);
    return at !== null && at + MEETING_MS > nowMs;
}

export interface PresetSlot {
    startMs: number;
    /** As the visitor sees it, in the timezone they picked. */
    label: string;
    taken: boolean;
    passed: boolean;
}

export interface DayContext {
    nowMs: number;
    userTimezone: number;
    /** The owner's clock: a zone name, or a fixed offset in hours. */
    hostOffset: HostZone;
    cfg: AvailabilityConfig;
    meetings: BookedSlot[];
}

/** The owner's preset slots that fall on this visitor day, in time order. */
export function presetSlotsForDay(visitorDay: number, { nowMs, userTimezone, hostOffset, cfg, meetings }: DayContext): PresetSlot[] {
    const dayStart = visitorDay * DAY_MS - userTimezone * HOUR_MS;
    const out: PresetSlot[] = [];
    // With offsets up to ±14h, the visitor's day overlaps at most the owner's day
    // before, the same day and the day after.
    for (let hostDay = visitorDay - 1; hostDay <= visitorDay + 1; hostDay++) {
        if (!cfg.workingDays.includes(new Date(hostDay * DAY_MS).getUTCDay())) continue;
        for (const h of cfg.hours) {
            const startMs = zonedInstant(hostDay, h * 60, hostOffset);
            if (startMs < dayStart || startMs >= dayStart + DAY_MS) continue;
            const v = new Date(startMs + userTimezone * HOUR_MS);
            out.push({
                startMs,
                label: timeLabel(v.getUTCHours(), v.getUTCMinutes()),
                taken: overlapsStored(startMs, hostOffset, meetings),
                passed: startMs < nowMs + BOOKING_BUFFER_MS,
            });
        }
    }
    return out.sort((a, b) => a.startMs - b.startMs);
}

/** Whether the visitor day is inside the booking window (their today … +45 days). */
function isInWindow(visitorDay: number, nowMs: number, userTimezone: number): boolean {
    const today = dayIndexAt(nowMs, userTimezone);
    return visitorDay >= today && visitorDay <= today + BOOKING_WINDOW_DAYS;
}

/** A day the calendar lets the visitor pick. */
export function isDayOpen(visitorDay: number, ctx: DayContext): boolean {
    return isInWindow(visitorDay, ctx.nowMs, ctx.userTimezone)
        && presetSlotsForDay(visitorDay, ctx).some((s) => !s.taken && !s.passed);
}

/**
 * Why a custom time on an open day can't be picked, or null when it can. The same
 * test the picker greys options with, so an unpickable time can't be composed.
 */
export function customTimeRefusal(startMs: number, { nowMs, hostOffset, cfg, meetings }: DayContext): string | null {
    if (startMs < nowMs + BOOKING_BUFFER_MS) return 'That time has already passed, pick a later one.';
    if (!cfg.workingDays.includes(hostWallClock(startMs, hostOffset).weekday)) {
        return "That time falls on a day I'm not working, pick another.";
    }
    if (overlapsStored(startMs, hostOffset, meetings)) return 'That time overlaps an existing booking, pick another.';
    return null;
}

/**
 * Why a booking at `startMs` would be refused, or null when the page would offer it -
 * as a preset slot on an open day, or as a custom time there.
 */
export function bookingRefusal(startMs: number, ctx: DayContext): string | null {
    if (!Number.isFinite(startMs)) return 'Invalid meeting time.';
    if (startMs < ctx.nowMs + BOOKING_BUFFER_MS) return 'That time slot is no longer available. Please pick another.';
    // Every real UTC offset is a whole number of quarter hours, so the picker's grid
    // (and every preset hour) is a multiple of 15 minutes in UTC as well.
    if (startMs % (CUSTOM_GRID_MINUTES * 60000) !== 0) return 'Invalid meeting time.';

    const visitorDay = dayIndexAt(startMs, ctx.userTimezone);
    if (!isInWindow(visitorDay, ctx.nowMs, ctx.userTimezone)) {
        return `Bookings open up to ${BOOKING_WINDOW_DAYS} days ahead. Please pick an earlier day.`;
    }
    if (!isDayOpen(visitorDay, ctx)) return 'Nothing is open on that day any more. Please pick another.';
    const preset = presetSlotsForDay(visitorDay, ctx).find((s) => s.startMs === startMs);
    if (preset) return preset.taken ? 'That time slot is no longer available. Please pick another.' : null;
    return customTimeRefusal(startMs, ctx);
}
