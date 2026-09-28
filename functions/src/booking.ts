// Public booking rules - the server-side twin of what the booking calendar offers
// (src/hooks/useMeetingBooking.ts + src/utils/availability.ts). bookMeeting uses it
// so a request sent straight to the function cannot book a day or time the page
// would never have offered. Keep the two in step.

export interface AvailabilityConfig {
  /** Weekday numbers that are working days (0 = Sun … 6 = Sat). */
  workingDays: number[];
  /** Bookable hours (0–23), host local. */
  hours: number[];
}

export const DEFAULT_AVAILABILITY: AvailabilityConfig = {
  workingDays: [0, 1, 2, 3, 4, 5, 6],
  hours: [9, 10, 11, 12, 14, 15, 16, 17],
};

/** The page's host timezone until Settings/Availability "Current Time" loads. */
export const DEFAULT_HOST_TZ = "UTC+02:00 (EET)";

/** Days ahead the calendar lets a visitor pick (useMeetingBooking limitDate). */
export const BOOKING_WINDOW_DAYS = 45;
/** No booking may start sooner than this (useMeetingBooking isTimePassed). */
export const BOOKING_BUFFER_MS = 30 * 60000;

const DAY_MS = 86400000;

function sanitizeHours(arr: unknown[]): number[] {
  return [...new Set(arr.filter((h): h is number => typeof h === "number" && Number.isInteger(h) && h >= 0 && h <= 23))]
    .sort((a, b) => a - b);
}

/** Legacy startHour/endHour (+ optional break) docs that predate `hours`. */
function deriveLegacyHours(data: Record<string, unknown>): number[] | null {
  const sh = data.startHour, eh = data.endHour;
  if (typeof sh !== "number" || typeof eh !== "number") return null;
  const bs = typeof data.breakStart === "number" ? data.breakStart : null;
  const be = typeof data.breakEnd === "number" ? data.breakEnd : null;
  const out: number[] = [];
  for (let h = sh; h <= eh; h++) {
    if (bs !== null && be !== null && h >= bs && h < be) continue;
    if (h >= 0 && h <= 23) out.push(h);
  }
  return out.length ? out : null;
}

/** Same reading as src/utils/availability.ts parseAvailabilityConfig. */
export function parseAvailability(data: Record<string, unknown> | undefined | null): AvailabilityConfig {
  if (!data) return DEFAULT_AVAILABILITY;
  const rawDays = Array.isArray(data.workingDays) ? data.workingDays : null;
  const workingDays = rawDays
    ? [...new Set(rawDays.filter((d): d is number => typeof d === "number" && d >= 0 && d <= 6))].sort((a, b) => a - b)
    : DEFAULT_AVAILABILITY.workingDays;
  // An explicit empty `hours` array means the owner is fully off.
  const hours = Array.isArray(data.hours)
    ? sanitizeHours(data.hours)
    : deriveLegacyHours(data) ?? DEFAULT_AVAILABILITY.hours;
  return { workingDays, hours };
}

/** Hours east of UTC from a "UTC+03:00 (EEST)" style string; 0 when it doesn't parse. */
export function utcOffsetHours(tz: unknown): number {
  const m = /UTC([+-]\d{2}):(\d{2})/.exec(String(tz ?? ""));
  if (!m) return 0;
  const h = parseInt(m[1], 10);
  return h + (parseInt(m[2], 10) / 60) * (h < 0 ? -1 : 1);
}

const pad2 = (n: number) => n.toString().padStart(2, "0");

/** "hh:mm AM/PM", the label every stored meeting Time uses. */
export function timeLabel(h24: number, min: number): string {
  return `${pad2(h24 % 12 || 12)}:${pad2(min)} ${h24 >= 12 ? "PM" : "AM"}`;
}

/** "DD/MM/YYYY" + "hh:mm AM/PM" wall clock of an instant at a UTC offset. */
export function wallClock(instantMs: number, offsetHours: number): { date: string; time: string; weekday: number; dayStartMs: number } {
  const w = new Date(instantMs + offsetHours * 3600000);
  return {
    date: `${pad2(w.getUTCDate())}/${pad2(w.getUTCMonth() + 1)}/${w.getUTCFullYear()}`,
    time: timeLabel(w.getUTCHours(), w.getUTCMinutes()),
    weekday: w.getUTCDay(),
    dayStartMs: Date.UTC(w.getUTCFullYear(), w.getUTCMonth(), w.getUTCDate()),
  };
}

export interface BookingCheck {
  startMs: number;
  nowMs: number;
  /** The timezone the visitor picked on the page (hours east of UTC). */
  userTimezone: number;
  hostOffset: number;
  cfg: AvailabilityConfig;
  meetings: Array<{ Date?: string; Time?: string }>;
}

/**
 * Why the booking page would not offer this start time, or null when it would.
 *
 * The page works on the day the visitor clicked in the calendar, in the timezone
 * they picked, so the day rules below do too:
 *  - the day is within the 45-day window and is one of the owner's working days;
 *  - the day still has at least one preset hour that is free and not passed
 *    (a full or fully-passed day is greyed out, custom times included);
 *  - the time is a preset hour, or a custom time on the picker's 15-minute grid.
 *    Custom times may fall outside the preset hours - that is what they are for.
 * The start must also be at least 30 minutes away. Whether the exact slot is
 * already taken is checked separately, against the host date and time.
 */
export function bookingRefusal({ startMs, nowMs, userTimezone, hostOffset, cfg, meetings }: BookingCheck): string | null {
  if (startMs < nowMs + BOOKING_BUFFER_MS) {
    return "That time slot is no longer available. Please pick another.";
  }
  // Every real UTC offset is a whole number of quarter hours, so the picker's
  // :00/:15/:30/:45 grid (and every preset hour) is a multiple of 15 min in UTC too.
  if ((startMs / 60000) % 15 !== 0) return "Invalid meeting time.";

  const day = wallClock(startMs, userTimezone);
  const today = wallClock(nowMs, userTimezone);
  // One day of slack: the page counts the window from the browser's own "today",
  // which can be a day off from the timezone the visitor picked.
  if (day.dayStartMs > today.dayStartMs + (BOOKING_WINDOW_DAYS + 1) * DAY_MS) {
    return `Bookings open up to ${BOOKING_WINDOW_DAYS} days ahead. Please pick an earlier day.`;
  }
  if (!cfg.workingDays.includes(day.weekday)) {
    return "That day isn't available for bookings. Please pick another.";
  }

  // Same test as the calendar's hasFreeSlots: on the chosen day, some preset hour
  // is not booked and (today only) not within 30 minutes of the host's clock.
  const hostNow = new Date(nowMs + hostOffset * 3600000);
  const hostNowMin = hostNow.getUTCHours() * 60 + hostNow.getUTCMinutes();
  const isToday = day.dayStartMs === today.dayStartMs;
  const hasFreePreset = cfg.hours.some((h) => {
    const label = timeLabel(h, 0);
    const busy = meetings.some((m) => m && m.Date === day.date && m.Time === label);
    const passed = isToday && hostNowMin + 30 > h * 60;
    return !busy && !passed;
  });
  if (!hasFreePreset) return "That day is fully booked. Please pick another.";

  return null;
}
