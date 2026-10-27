/**
 * The timezones offered by the two booking pickers: the public contact modal (the
 * visitor's own zone) and the dashboard's availability panel (the owner's).
 *
 * The abbreviations in brackets are a hint and nothing firmer. One offset covers
 * many zones - UTC+03:00 is Cairo in summer every bit as much as it is Moscow -
 * so a fixed abbreviation is simply wrong for most of the people reading it, and
 * reads as a mistake when it is your own row. The single offset a browser can
 * name for certain is the reader's, so that one is labelled with their actual
 * city and the rest keep the hint.
 *
 * A fixed offset cannot follow daylight saving, so the owner's clock is better
 * saved as a zone name (timeZoneOptions), which the booking rules resolve for
 * each date.
 */
import { offsetAt } from './bookingRules';

export interface TimezoneOption {
    value: number;
    label: string;
}

/** A named zone, labelled with the offset it has right now. */
export interface ZoneOption {
    value: string;
    label: string;
}

/** Every offset a place on Earth keeps, standard or summer time. */
const OFFSETS: Array<{ value: number; hint?: string }> = [
    { value: -12 }, { value: -11 }, { value: -10 }, { value: -9.5 }, { value: -9 },
    { value: -8, hint: 'PST' }, { value: -7, hint: 'MST' },
    { value: -6, hint: 'CST' }, { value: -5, hint: 'EST' },
    { value: -4 }, { value: -3.5 }, { value: -3 }, { value: -2 }, { value: -1 },
    { value: 0, hint: 'GMT' }, { value: 1, hint: 'CET' }, { value: 2, hint: 'EET' },
    { value: 3, hint: 'MSK' }, { value: 3.5 }, { value: 4 }, { value: 4.5 }, { value: 5 },
    { value: 5.5, hint: 'IST' }, { value: 5.75 }, { value: 6 }, { value: 6.5 }, { value: 7 },
    { value: 8, hint: 'CST' }, { value: 8.75 }, { value: 9, hint: 'JST' }, { value: 9.5 },
    { value: 10, hint: 'AEST' }, { value: 10.5 }, { value: 11 }, { value: 12, hint: 'NZST' },
    { value: 12.75 }, { value: 13 }, { value: 14 },
];

/** The offset half of a label: 3 -> "UTC+03:00", -5.5 -> "UTC-05:30". */
function offsetLabel(value: number): string {
    const abs = Math.abs(value);
    const h = Math.floor(abs);
    const m = Math.round((abs - h) * 60);
    return `UTC${value < 0 ? '-' : '+'}${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

/** The reader's current offset from UTC, in hours (3 for Cairo on summer time). */
export function localOffset(): number {
    return -(new Date().getTimezoneOffset() / 60);
}

/** "Cairo" out of "Africa/Cairo", "St Johns" out of "America/St_Johns". */
function cityOf(zone: string): string | null {
    if (!zone.includes('/')) return null;
    return zone.split('/').pop()?.replace(/_/g, ' ') || null;
}

/**
 * The city the browser puts the reader in - "Cairo", out of "Africa/Cairo".
 * Null when there is nothing worth showing: no browser (the export's build-time
 * render), a bare "UTC", or an alias carrying no city.
 */
function localCity(): string | null {
    if (typeof window === 'undefined') return null;
    try {
        return cityOf(Intl.DateTimeFormat().resolvedOptions().timeZone || '');
    } catch {
        // Some locked-down browsers refuse to resolve a zone; the hints still work.
        return null;
    }
}

/**
 * Every offset as a pickable option, the reader's own named after their city.
 * The `value` is untouched, so anything matching on the numeric offset (and the
 * "UTC+HH:MM" prefix every label still starts with) keeps working. A reader whose
 * offset is missing from the list still finds their own row.
 */
export function timezoneOptions(): TimezoneOption[] {
    const city = localCity();
    const mine = localOffset();
    const offsets = OFFSETS.some((o) => o.value === mine)
        ? OFFSETS
        : [...OFFSETS, { value: mine }].sort((a, b) => a.value - b.value);
    return offsets.map(({ value, hint }) => {
        const name = value === mine && city ? city : hint;
        const base = offsetLabel(value);
        return { value, label: name ? `${base} (${name})` : base };
    });
}

/**
 * Every zone this runtime knows, by name, labelled "UTC+02:00 (Cairo)" with the offset
 * it has at `nowMs`, in offset order. What the owner picks their own clock from: a
 * name keeps following daylight saving after it is saved, an offset does not.
 */
export function timeZoneOptions(nowMs: number = Date.now()): ZoneOption[] {
    let zones: string[] = [];
    try {
        zones = Intl.supportedValuesOf('timeZone');
    } catch {
        // An engine without the zone list: nothing to offer, the offset picker still works.
    }
    return zones
        .map((zone) => {
            const offset = offsetAt(zone, nowMs);
            const city = cityOf(zone);
            return { zone, offset, label: city ? `${offsetLabel(offset)} (${city})` : offsetLabel(offset) };
        })
        .sort((a, b) => a.offset - b.offset || a.zone.localeCompare(b.zone))
        .map(({ zone, label }) => ({ value: zone, label }));
}
