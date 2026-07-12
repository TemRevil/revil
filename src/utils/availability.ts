/**
 * Availability configuration — the owner's working days + hours that drive the
 * public booking calendar (M-Contact) and are edited from the dashboard
 * (D-Canary → Hours). Stored on the Settings/Availability doc alongside the
 * timezone. Shared here so the editor and the booking page can never drift.
 */

export interface AvailabilityConfig {
    /** Weekday numbers that are working days (0 = Sun … 6 = Sat). */
    workingDays: number[];
    /** First bookable hour, host local, 0–23. */
    startHour: number;
    /** Last bookable hour, host local, 0–23 (inclusive). */
    endHour: number;
    /** Hours in [breakStart, breakEnd) are skipped (e.g. a lunch break). null = no break. */
    breakStart: number | null;
    breakEnd: number | null;
}

// Preserves the historic hardcoded schedule so behaviour is UNCHANGED until the
// owner edits it: every day on, 09:00–17:00 hourly, with a 13:00 (1 PM) lunch gap.
export const DEFAULT_AVAILABILITY: AvailabilityConfig = {
    workingDays: [0, 1, 2, 3, 4, 5, 6],
    startHour: 9,
    endHour: 17,
    breakStart: 13,
    breakEnd: 14,
};

export const WEEKDAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const;

const clampHour = (n: unknown, fallback: number): number =>
    typeof n === 'number' && Number.isInteger(n) && n >= 0 && n <= 23 ? n : fallback;

/** Read + validate the availability config off a Settings/Availability doc's data. */
export function parseAvailabilityConfig(data: Record<string, unknown> | undefined | null): AvailabilityConfig {
    if (!data) return DEFAULT_AVAILABILITY;

    const rawDays = Array.isArray(data.workingDays) ? data.workingDays : null;
    const workingDays = rawDays
        ? [...new Set(rawDays.filter((d): d is number => typeof d === 'number' && d >= 0 && d <= 6))].sort((a, b) => a - b)
        : DEFAULT_AVAILABILITY.workingDays;

    const startHour = clampHour(data.startHour, DEFAULT_AVAILABILITY.startHour);
    const endHour = clampHour(data.endHour, DEFAULT_AVAILABILITY.endHour);

    const hasBreak = data.breakStart !== null && data.breakStart !== undefined
        && data.breakEnd !== null && data.breakEnd !== undefined;
    const breakStart = hasBreak ? clampHour(data.breakStart, 13) : null;
    const breakEnd = hasBreak ? clampHour(data.breakEnd, 14) : null;

    return { workingDays, startHour, endHour, breakStart, breakEnd };
}

/** Format an integer hour (0–23) as a "hh:00 AM/PM" slot label. */
export function formatHourSlot(hour: number): string {
    const period = hour >= 12 ? 'PM' : 'AM';
    const display = hour % 12 || 12;
    return `${display.toString().padStart(2, '0')}:00 ${period}`;
}

/**
 * Generate the host-perspective hourly slot labels from a config, e.g.
 * ['09:00 AM', '10:00 AM', …]. Hours in the break range are skipped.
 */
export function buildHostSlots(cfg: AvailabilityConfig): string[] {
    const slots: string[] = [];
    if (cfg.endHour < cfg.startHour) return slots;
    for (let h = cfg.startHour; h <= cfg.endHour; h++) {
        if (cfg.breakStart !== null && cfg.breakEnd !== null && h >= cfg.breakStart && h < cfg.breakEnd) continue;
        slots.push(formatHourSlot(h));
    }
    return slots;
}

/** Whether a given date's weekday is a working (bookable) day. */
export function isWorkingDay(cfg: AvailabilityConfig, date: Date): boolean {
    return cfg.workingDays.includes(date.getDay());
}
