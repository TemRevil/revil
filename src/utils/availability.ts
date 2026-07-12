/**
 * Availability configuration — the owner's working days + individual working
 * hours that drive the public booking calendar (M-Contact) and are edited from
 * the dashboard (D-Canary → Hours) and the MCP server. Stored on the
 * Settings/Availability doc alongside the timezone. Shared here so every consumer
 * stays in sync.
 */

export interface AvailabilityConfig {
    /** Weekday numbers that are working days (0 = Sun … 6 = Sat). */
    workingDays: number[];
    /** Individually-selected bookable hours (0–23), host local. Sorted, no gaps implied. */
    hours: number[];
}

// Preserves the historic hardcoded schedule so behaviour is UNCHANGED until the
// owner edits it: every day on, 09:00–17:00 with the 13:00 (1 PM) hour left out.
export const DEFAULT_AVAILABILITY: AvailabilityConfig = {
    workingDays: [0, 1, 2, 3, 4, 5, 6],
    hours: [9, 10, 11, 12, 14, 15, 16, 17],
};

export const WEEKDAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const;

/** Every hour of the day, for rendering a full pick grid. */
export const ALL_HOURS: number[] = Array.from({ length: 24 }, (_, h) => h);

/** Keep only valid, unique, sorted hour integers (0–23). */
function sanitizeHours(arr: unknown[]): number[] {
    return [...new Set(arr.filter((h): h is number => typeof h === 'number' && Number.isInteger(h) && h >= 0 && h <= 23))]
        .sort((a, b) => a - b);
}

/**
 * Legacy fallback: earlier versions stored a startHour/endHour range with an
 * optional break. If a doc predates the `hours` array, derive the hour list from
 * those so an already-saved config still works.
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
export function parseAvailabilityConfig(data: Record<string, unknown> | undefined | null): AvailabilityConfig {
    if (!data) return DEFAULT_AVAILABILITY;

    const rawDays = Array.isArray(data.workingDays) ? data.workingDays : null;
    const workingDays = rawDays
        ? [...new Set(rawDays.filter((d): d is number => typeof d === 'number' && d >= 0 && d <= 6))].sort((a, b) => a - b)
        : DEFAULT_AVAILABILITY.workingDays;

    // Canonical field is `hours`. An explicit empty array is respected (owner is
    // fully off); only an ABSENT field falls back to the legacy range or default.
    let hours: number[];
    if (Array.isArray(data.hours)) {
        hours = sanitizeHours(data.hours);
    } else {
        hours = deriveLegacyHours(data) ?? DEFAULT_AVAILABILITY.hours;
    }

    return { workingDays, hours };
}

/** Format an integer hour (0–23) as a "hh:00 AM/PM" slot label. */
export function formatHourSlot(hour: number): string {
    const period = hour >= 12 ? 'PM' : 'AM';
    const display = hour % 12 || 12;
    return `${display.toString().padStart(2, '0')}:00 ${period}`;
}

/** The host-perspective hourly slot labels, e.g. ['09:00 AM', '10:00 AM', …]. */
export function buildHostSlots(cfg: AvailabilityConfig): string[] {
    return [...cfg.hours].sort((a, b) => a - b).map(formatHourSlot);
}

/** Whether a given date's weekday is a working (bookable) day. */
export function isWorkingDay(cfg: AvailabilityConfig, date: Date): boolean {
    return cfg.workingDays.includes(date.getDay());
}
