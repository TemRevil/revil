/**
 * The UTC offsets offered by the two booking pickers: the public contact modal
 * (the visitor's own zone) and the dashboard's availability panel (the owner's).
 *
 * The abbreviations in brackets are a hint and nothing firmer. One offset covers
 * many zones - UTC+03:00 is Cairo in summer every bit as much as it is Moscow -
 * so a fixed abbreviation is simply wrong for most of the people reading it, and
 * reads as a mistake when it is your own row. The single offset a browser can
 * name for certain is the reader's, so that one is labelled with their actual
 * city and the rest keep the hint.
 */
export interface TimezoneOption {
    value: number;
    label: string;
}

const OFFSETS: Array<{ value: number; hint?: string }> = [
    { value: -12 }, { value: -11 }, { value: -10 }, { value: -9 },
    { value: -8, hint: 'PST' }, { value: -7, hint: 'MST' },
    { value: -6, hint: 'CST' }, { value: -5, hint: 'EST' },
    { value: -4 }, { value: -3 }, { value: -2 }, { value: -1 },
    { value: 0, hint: 'GMT' }, { value: 1, hint: 'CET' }, { value: 2, hint: 'EET' },
    { value: 3, hint: 'MSK' }, { value: 4 }, { value: 5 },
    { value: 5.5, hint: 'IST' }, { value: 6 }, { value: 7 },
    { value: 8, hint: 'CST' }, { value: 9, hint: 'JST' },
    { value: 10, hint: 'AEST' }, { value: 11 }, { value: 12, hint: 'NZST' },
];

/** The offset half of a label: 3 -> "UTC+03:00", -5.5 -> "UTC-05:30". */
export function offsetLabel(value: number): string {
    const abs = Math.abs(value);
    const h = Math.floor(abs);
    const m = Math.round((abs - h) * 60);
    return `UTC${value < 0 ? '-' : '+'}${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

/** The reader's current offset from UTC, in hours (3 for Cairo on summer time). */
export function localOffset(): number {
    return -(new Date().getTimezoneOffset() / 60);
}

/**
 * The city the browser puts the reader in - "Cairo", out of "Africa/Cairo".
 * Null when there is nothing worth showing: no browser (the export's build-time
 * render), a bare "UTC", or an alias carrying no city.
 */
export function localCity(): string | null {
    if (typeof window === 'undefined') return null;
    try {
        const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
        if (!zone || !zone.includes('/')) return null;
        return zone.split('/').pop()?.replace(/_/g, ' ') || null;
    } catch {
        // Some locked-down browsers refuse to resolve a zone; the hints still work.
        return null;
    }
}

/**
 * Every offset as a pickable option, the reader's own named after their city.
 * The `value` is untouched, so anything matching on the numeric offset (and the
 * "UTC+HH:MM" prefix every label still starts with) keeps working.
 */
export function timezoneOptions(): TimezoneOption[] {
    const city = localCity();
    const mine = localOffset();
    return OFFSETS.map(({ value, hint }) => {
        const name = value === mine && city ? city : hint;
        const base = offsetLabel(value);
        return { value, label: name ? `${base} (${name})` : base };
    });
}
