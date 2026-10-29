// Firestore's REST API tags every value with its type ({ stringValue: 'x' }, { mapValue:
// { fields } }, ...). One decoder for both readers of it: the public pages at runtime
// (lib/liveDoc) and the build's snapshot (scripts/sync-data.mjs), so the snapshot and a live
// read decode the same document to the same data. Plain JavaScript, so Node runs it as is.

/** @typedef {Record<string, unknown>} RestValue */

/**
 * One REST value as the SDK's data() would give it, timestamps as ISO strings. A missing
 * value or a type the public documents don't use (references, geo points, bytes) is null.
 * @param {RestValue | null | undefined} v
 * @returns {unknown}
 */
export function decodeValue(v) {
    if (!v || typeof v !== 'object') return null;
    if ('stringValue' in v) return v.stringValue;
    if ('integerValue' in v) return Number(v.integerValue);
    if ('doubleValue' in v) return Number(v.doubleValue);
    if ('booleanValue' in v) return v.booleanValue;
    if ('nullValue' in v) return null;
    if ('timestampValue' in v) return v.timestampValue;
    if ('mapValue' in v) return decodeFields(/** @type {{ fields?: Record<string, RestValue> }} */ (v.mapValue)?.fields);
    if ('arrayValue' in v) return (/** @type {{ values?: RestValue[] }} */ (v.arrayValue)?.values || []).map(decodeValue);
    return null;
}

/**
 * A document's or map's fields, in name order: REST answers a map in a different order each
 * time, and the same content has to compare equal (the cached copy, the daily deploy check).
 * @param {Record<string, RestValue> | undefined} [fields]
 * @returns {Record<string, any>}
 */
export function decodeFields(fields = {}) {
    /** @type {Record<string, any>} */
    const out = {};
    for (const k of Object.keys(fields).sort()) out[k] = decodeValue(fields[k]);
    return out;
}
