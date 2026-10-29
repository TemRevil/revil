/**
 * The owner's clock in Settings. It is saved as an IANA zone name (`timeZone`), which
 * keeps following daylight saving, plus the "Current Time" label ("UTC+03:00 (Cairo)")
 * that older readers parse for its offset. Readers prefer the name (bookingRules
 * hostZone), so the label only has to be right on the day it is saved.
 */
import { isTimeZone, offsetAt, utcOffsetHours } from '../../lib/bookingRules';

/** "UTC+03:00 (Cairo)" for a zone at an instant; the city is left off for a bare "UTC". */
export function zoneLabel(zone: string, nowMs: number): string {
    const offset = offsetAt(zone, nowMs);
    const abs = Math.abs(offset);
    const h = Math.floor(abs);
    const m = Math.round((abs - h) * 60);
    const base = `UTC${offset < 0 ? '-' : '+'}${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
    const city = zone.includes('/') ? zone.split('/').pop()!.replace(/_/g, ' ') : null;
    return city ? `${base} (${city})` : base;
}

/**
 * The zone the picker opens on for a stored Availability doc: its saved `timeZone`; else,
 * for a doc saved before zones were named, a zone at the offset its "Current Time" says
 * - the browser's own when it matches, so the owner's real city wins - else the browser's.
 */
export function initialZone(
    data: Record<string, unknown> | undefined | null,
    browserZone: string,
    zones: string[],
    nowMs: number,
): string {
    if (isTimeZone(data?.timeZone)) return data!.timeZone as string;
    const label = data?.['Current Time'];
    if (typeof label !== 'string' || !/UTC[+-]\d{2}:\d{2}/.test(label)) return browserZone;
    const offset = utcOffsetHours(label);
    if (offsetAt(browserZone, nowMs) === offset) return browserZone;
    return zones.find(z => offsetAt(z, nowMs) === offset) ?? browserZone;
}
