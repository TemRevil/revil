/**
 * The pure half of scripts/migrate-per-entry.mjs: which old map becomes which new
 * collection, how an old meeting's "DD/MM/YYYY" + "hh:mm AM/PM" becomes a UTC instant,
 * and what to write. No Firebase here, so it can be tested on its own.
 *
 * The zone math is the same as src/lib/bookingRules.ts (offsetAt, zonedInstant,
 * hostZone), written out again because this script runs on plain Node without the
 * TypeScript build; per-entry.test.mjs checks the two agree.
 */

const DAY_MS = 86_400_000;
const HOUR_MS = 3_600_000;
const DEFAULT_HOST_TZ = 'UTC+02:00 (EET)';
export const MIGRATED_FROM_CANARY = 'Settings/Canary';

/**
 * Old map -> new collection. The new names match src/lib/collections.ts, which this
 * plain-Node script cannot import.
 */
export const SOURCES = [
    { key: 'messages', doc: 'Settings/Canary', field: 'Emails', collection: 'CanaryMessages' },
    { key: 'meetings', doc: 'Settings/Canary', field: 'Meetings', collection: 'CanaryMeetings' },
    { key: 'treasuryProjects', doc: 'Treasury/projects', field: 'entries', collection: 'TreasuryProjects' },
    { key: 'treasuryIncome', doc: 'Treasury/income', field: 'entries', collection: 'TreasuryIncome' },
    { key: 'treasurySpendings', doc: 'Treasury/spendings', field: 'entries', collection: 'TreasurySpendings' },
    { key: 'treasuryAccounts', doc: 'Treasury/accounts', field: 'entries', collection: 'TreasuryAccounts' },
    { key: 'treasuryReceipts', doc: 'Treasury/receipts', field: 'entries', collection: 'TreasuryReceipts' },
];

/** Every old document the migration reads (and --remove-old changes). */
export const OLD_DOCS = [...new Set(SOURCES.map((s) => s.doc))];

// ── zone math (as src/lib/bookingRules.ts) ─────────────────────────

const formats = new Map();
function zoneFormat(zone) {
    if (formats.has(zone)) return formats.get(zone);
    try {
        const f = new Intl.DateTimeFormat('en-US', {
            timeZone: zone, hourCycle: 'h23',
            year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric', second: 'numeric',
        });
        formats.set(zone, f);
        return f;
    } catch {
        return null;
    }
}

export function isTimeZone(name) {
    return typeof name === 'string' && name.length > 0 && name.length <= 64 && zoneFormat(name) !== null;
}

/** Hours east of UTC the zone is at an instant; a number is a fixed offset. */
export function offsetAt(zone, instantMs) {
    if (typeof zone === 'number') return Number.isFinite(zone) ? zone : 0;
    const f = zoneFormat(zone);
    if (!f || !Number.isFinite(instantMs)) return 0;
    const parts = {};
    for (const p of f.formatToParts(new Date(instantMs))) parts[p.type] = Number(p.value);
    const wall = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour % 24, parts.minute, parts.second);
    return Math.round((wall - Math.floor(instantMs / 1000) * 1000) / 60000) / 60;
}

/** The instant `minutes` after midnight on calendar day `day` (days since 1970-01-01) in the zone. */
export function zonedInstant(day, minutes, zone) {
    const naive = day * DAY_MS + minutes * 60000;
    const guess = naive - offsetAt(zone, naive) * HOUR_MS;
    return naive - offsetAt(zone, guess) * HOUR_MS;
}

/** Hours east of UTC from "UTC+03:00 (EEST)"; 0 when it doesn't parse. */
export function utcOffsetHours(tz) {
    const m = /UTC([+-]\d{2}):(\d{2})/.exec(String(tz ?? ''));
    if (!m) return 0;
    const h = parseInt(m[1], 10);
    return h + (parseInt(m[2], 10) / 60) * (h < 0 ? -1 : 1);
}

/**
 * The owner's clock from Settings/Availability, and whether it is a real named zone.
 * Without one it is the fixed offset in "Current Time" (or the site's default), which
 * is wrong for any meeting on the other side of a daylight-saving change: those
 * meetings are reported as using the fallback.
 */
export function hostZoneOf(availability) {
    const named = availability?.timeZone;
    if (isTimeZone(named)) return { zone: named, named: true };
    return { zone: utcOffsetHours(availability?.['Current Time'] ?? DEFAULT_HOST_TZ), named: false };
}

// ── the old meeting strings ──────────────────────────────────────────

/** "DD/MM/YYYY" -> days since 1970-01-01, or null for anything that is not a real day. */
export function legacyDay(v) {
    const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(String(v ?? '').trim());
    if (!m) return null;
    const [d, mo, y] = [Number(m[1]), Number(m[2]), Number(m[3])];
    const t = Date.UTC(y, mo - 1, d);
    const back = new Date(t);
    if (back.getUTCFullYear() !== y || back.getUTCMonth() !== mo - 1 || back.getUTCDate() !== d) return null;
    return Math.round(t / DAY_MS);
}

/** "hh:mm AM/PM" -> minutes after midnight, or null. */
export function legacyMinutes(v) {
    const m = /^(\d{1,2}):(\d{2})\s*(AM|PM)$/i.exec(String(v ?? '').trim());
    if (!m) return null;
    let h = parseInt(m[1], 10);
    const min = parseInt(m[2], 10);
    if (h < 1 || h > 12 || min > 59) return null;
    const pm = m[3].toUpperCase() === 'PM';
    if (pm && h !== 12) h += 12;
    if (!pm && h === 12) h = 0;
    return h * 60 + min;
}

/** An old meeting's Date + Time on the owner's clock as a UTC instant (ms), or null. */
export function legacyStart(meeting, zone) {
    const day = legacyDay(meeting?.Date);
    const min = legacyMinutes(meeting?.Time);
    return day === null || min === null ? null : zonedInstant(day, min, zone);
}

/** The clock fields a meeting stores beside `start` (as bookingRules zoneRecord). */
export function zoneRecord(zone) {
    return typeof zone === 'string' ? { timeZone: zone, utcOffset: null } : { timeZone: null, utcOffset: zone };
}

/**
 * One old meeting as its new document. A meeting whose Date/Time can't be read is
 * copied as it is (nothing is lost) without a `start`, and reported: the dashboard
 * and the busy-slot list skip it until it is fixed by hand.
 */
export function convertMeeting(meeting, host) {
    const at = legacyStart(meeting, host.zone);
    if (at === null) return { data: { ...meeting, migratedFrom: MIGRATED_FROM_CANARY }, status: 'unconverted' };
    // The old strings are not kept: `start` replaces them, and display is worked out from it.
    const rest = Object.fromEntries(Object.entries(meeting).filter(([k]) => k !== 'Date' && k !== 'Time'));
    return {
        data: { ...rest, start: new Date(at).toISOString(), ...zoneRecord(host.zone), migratedFrom: MIGRATED_FROM_CANARY },
        status: host.named ? 'converted' : 'fallback',
    };
}

/** Why a map key can't be a Firestore document id, or null when it can. */
export function idProblem(id) {
    if (typeof id !== 'string' || !id) return 'empty';
    if (id.includes('/')) return 'contains "/"';
    if (id === '.' || id === '..') return 'is "." or ".."';
    if (/^__.*__$/.test(id)) return 'is reserved (__name__)';
    if (Buffer.byteLength(id, 'utf8') > 1500) return 'is longer than 1500 bytes';
    return null;
}

/**
 * Everything the migration would write, from the old documents' data.
 * `old` maps each path in OLD_DOCS to its data (or undefined when the doc is missing).
 */
export function planMigration(old, availability) {
    const host = hostZoneOf(availability);
    const writes = [];
    const report = { host: { zone: host.zone, named: host.named }, counts: {}, fallback: [], unconverted: [], badIds: [], notObjects: [] };
    for (const src of SOURCES) {
        const map = old[src.doc]?.[src.field];
        let n = 0;
        if (map && typeof map === 'object' && !Array.isArray(map)) {
            for (const [id, entry] of Object.entries(map)) {
                const where = `${src.doc}.${src.field}.${id}`;
                if (!entry || typeof entry !== 'object' || Array.isArray(entry)) { report.notObjects.push(where); continue; }
                const problem = idProblem(id);
                if (problem) { report.badIds.push(`${where} (${problem})`); continue; }
                let data = entry;
                if (src.key === 'meetings') {
                    const c = convertMeeting(entry, host);
                    data = c.data;
                    if (c.status === 'fallback') report.fallback.push(id);
                    if (c.status === 'unconverted') report.unconverted.push(id);
                } else if (src.key === 'messages') {
                    data = { ...entry, migratedFrom: MIGRATED_FROM_CANARY };
                }
                writes.push({ collection: src.collection, id, data });
                n++;
            }
        }
        report.counts[src.collection] = n;
    }
    return { writes, report };
}

// ── comparing and saving Firestore values ────────────────────────────

const isTimestamp = (v) => !!v && typeof v === 'object' && typeof v.toMillis === 'function' && typeof v.toDate === 'function';

/** A value as plain JSON, with Firestore Timestamps written as { __timestamp: ISO }. */
export function toJson(v) {
    if (isTimestamp(v)) return { __timestamp: v.toDate().toISOString() };
    if (Array.isArray(v)) return v.map(toJson);
    if (v && typeof v === 'object') {
        const out = {};
        for (const k of Object.keys(v).sort()) out[k] = toJson(v[k]);
        return out;
    }
    return v;
}

/** Whether two Firestore values hold the same data, whatever order their keys are in. */
export function sameData(a, b) {
    return JSON.stringify(toJson(a)) === JSON.stringify(toJson(b));
}

/** Refuse cleanup until every copied record matches and every meeting is usable. */
export function cleanupProblems(writes, current, report) {
    const missing = [];
    const differs = [];
    for (const w of writes) {
        const collection = current[w.collection];
        if (!collection?.has(w.id)) missing.push(`${w.collection}/${w.id}`);
        else if (!sameData(collection.get(w.id), w.data)) differs.push(`${w.collection}/${w.id}`);
    }
    return {
        missing, differs,
        unconverted: report.unconverted,
        invalid: [...report.badIds, ...report.notObjects],
    };
}

/** A run's backup folder name: "2026-10-28T14-05-09Z". */
export function backupStamp(nowMs) {
    return new Date(nowMs).toISOString().replace(/\.\d{3}Z$/, 'Z').replace(/:/g, '-');
}
