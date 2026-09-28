/**
 * Availability configuration - the owner's working days + individual working
 * hours that drive the public booking calendar (M-Contact) and are edited from
 * the dashboard (D-Canary → Hours) and the MCP server. Stored on the
 * Settings/Availability doc alongside the timezone. Shared here so every consumer
 * stays in sync.
 */

// The config shape, its defaults and its parsing live with the booking rules, which
// the bookMeeting function shares, so the dashboard, the calendar and the server
// read Settings/Availability the same way.
import { parseAvailability, type AvailabilityConfig } from './bookingRules';
import hostStatusSnapshot from '../data/availability.snapshot.json';
export { DEFAULT_AVAILABILITY, utcOffsetHours, type AvailabilityConfig } from './bookingRules';

export const WEEKDAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const;

/** Every hour of the day, for rendering a full pick grid. */
export const ALL_HOURS: number[] = Array.from({ length: 24 }, (_, h) => h);

/** Read + validate the availability config off a Settings/Availability doc's data. */
export function parseAvailabilityConfig(data: Record<string, unknown> | undefined | null): AvailabilityConfig {
    return parseAvailability(data);
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

/**
 * The public status pill: Settings/Availability "Current Availability" (a percent the
 * owner sets) as a label and dot colour. Shared by the homepage hero and /book.
 * Non-numeric / legacy values ("Available", "%") read as 100 rather than falling
 * through to "Busy".
 */
export function availabilityStatus(raw: unknown): { percent: number; label: string; color: string } {
    const parsed = parseInt(String(raw ?? '100%'));
    const percent = Number.isNaN(parsed) ? 100 : parsed;
    const color = percent >= 100 ? '#22c55e' : percent >= 75 ? '#a3e635' : percent >= 50 ? '#facc15' : percent >= 25 ? '#fb923c' : '#f87171';
    const label = percent >= 100 ? 'Available' : percent > 0 ? 'Handled' : 'Busy';
    return { percent, label, color };
}

/** The two Settings/Availability fields the status and clock pills show. */
export interface HostStatus {
    'Current Availability'?: string;
    'Current Time'?: string;
}

const HOST_STATUS_KEY = 'revil_host_status';

/**
 * What the pills draw with before Firebase has loaded: the last visit's copy, else the
 * build's snapshot (scripts/sync-projects.mjs). Without it they showed a hardcoded
 * "Available" and UTC+02:00, then switched a few seconds in when the live doc arrived.
 */
export function seedHostStatus(): HostStatus {
    try {
        const cached = JSON.parse(localStorage.getItem(HOST_STATUS_KEY) || 'null');
        if (cached && typeof cached === 'object') return { ...hostStatusSnapshot, ...cached };
    } catch { /* storage blocked */ }
    return { ...hostStatusSnapshot };
}

export function rememberHostStatus(data: Record<string, unknown>): void {
    const pick = (k: keyof HostStatus) => (typeof data[k] === 'string' && data[k] ? { [k]: data[k] } : {});
    try {
        localStorage.setItem(HOST_STATUS_KEY, JSON.stringify({ ...pick('Current Availability'), ...pick('Current Time') }));
    } catch { /* storage blocked */ }
}
