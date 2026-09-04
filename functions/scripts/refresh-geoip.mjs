#!/usr/bin/env node
/**
 * Rebuild the bundled IP -> country tables.
 *
 *   node scripts/refresh-geoip.mjs
 *
 * Source: sapics/ip-location-db "geo-whois-asn-country", which is CC0 (public
 * domain, no attribution required, no API key) and is rebuilt upstream daily.
 * We ship a snapshot rather than calling a geo API per visit: no key to rotate,
 * no third party in the hot path, no per-request latency, and nothing about a
 * visitor leaves the function.
 *
 * It does drift - address blocks get reassigned - so re-run this occasionally.
 * Quarterly is plenty; the practical effect of a stale table is that a small
 * number of visits get the previous owner's country. `data/geoip-meta.json`
 * records when the snapshot was taken so the dashboard can say how old it is.
 *
 * Output (binary, so the function can mmap-and-bisect instead of parsing 550k
 * lines of CSV on every cold start):
 *   data/geoip-v4.bin   10 bytes/row: start u32, end u32, 2 ASCII country bytes
 *   data/geoip-v6.bin   18 bytes/row: start u64, end u64 (the high half of the
 *                       address - country blocks are never finer than a /64),
 *                       2 ASCII country bytes
 */

import { writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const DATA = join(HERE, '..', 'data');
const BASE = 'https://cdn.jsdelivr.net/npm/@ip-location-db/geo-whois-asn-country';

const V4_ROW = 10;
const V6_ROW = 18;

async function fetchCsv(name) {
    const url = `${BASE}/${name}`;
    process.stdout.write(`  fetching ${name} ... `);
    const res = await fetch(url);
    if (!res.ok) throw new Error(`${url} -> HTTP ${res.status}`);
    const text = await res.text();
    console.log(`${(text.length / 1e6).toFixed(1)} MB`);
    return text;
}

/** "AU" -> two bytes. Anything that isn't a plain 2-letter code is dropped. */
function countryBytes(cc) {
    const s = String(cc || '').trim().toUpperCase();
    if (!/^[A-Z]{2}$/.test(s)) return null;
    return [s.charCodeAt(0), s.charCodeAt(1)];
}

function buildV4(csv) {
    const rows = [];
    for (const line of csv.split('\n')) {
        if (!line) continue;
        const [a, b, cc] = line.split(',');
        const start = Number(a), end = Number(b);
        if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) continue;
        const country = countryBytes(cc);
        if (!country) continue;
        rows.push([start, end, country]);
    }
    rows.sort((x, y) => x[0] - y[0]);

    const buf = Buffer.allocUnsafe(rows.length * V4_ROW);
    rows.forEach(([start, end, country], i) => {
        const at = i * V4_ROW;
        buf.writeUInt32BE(start >>> 0, at);
        buf.writeUInt32BE(end >>> 0, at + 4);
        buf[at + 8] = country[0];
        buf[at + 9] = country[1];
    });
    return { buf, count: rows.length };
}

function buildV6(csv) {
    const rows = [];
    for (const line of csv.split('\n')) {
        if (!line) continue;
        const [a, b, cc] = line.split(',');
        let start, end;
        try {
            // Only the high 64 bits are kept: allocations to a country are never
            // finer than a /64, so the low half carries no country information.
            start = BigInt(a) >> 64n;
            end = BigInt(b) >> 64n;
        } catch { continue; }
        if (end < start) continue;
        const country = countryBytes(cc);
        if (!country) continue;
        rows.push([start, end, country]);
    }
    rows.sort((x, y) => (x[0] < y[0] ? -1 : x[0] > y[0] ? 1 : 0));

    const buf = Buffer.allocUnsafe(rows.length * V6_ROW);
    rows.forEach(([start, end, country], i) => {
        const at = i * V6_ROW;
        buf.writeBigUInt64BE(BigInt.asUintN(64, start), at);
        buf.writeBigUInt64BE(BigInt.asUintN(64, end), at + 8);
        buf[at + 16] = country[0];
        buf[at + 17] = country[1];
    });
    return { buf, count: rows.length };
}

async function main() {
    // `--if-missing` is the prebuild guard: the tables are generated, not committed
    // (they are ~7 MB of binary and this repo is public), so a fresh checkout builds
    // them once and every later build skips straight past. Run the script with no
    // flag to force a refresh - see `npm run refresh-geoip`.
    if (process.argv.includes('--if-missing') && existsSync(join(DATA, 'geoip-v4.bin')) && existsSync(join(DATA, 'geoip-v6.bin'))) {
        console.log('geoip tables already present, skipping refresh');
        return;
    }
    console.log('Rebuilding the IP -> country tables from ip-location-db (CC0)');
    const [v4csv, v6csv] = await Promise.all([
        fetchCsv('geo-whois-asn-country-ipv4-num.csv'),
        fetchCsv('geo-whois-asn-country-ipv6-num.csv'),
    ]);

    const v4 = buildV4(v4csv);
    const v6 = buildV6(v6csv);
    if (v4.count < 100_000 || v6.count < 10_000) {
        throw new Error(`suspiciously small result (v4=${v4.count}, v6=${v6.count}) - refusing to overwrite`);
    }

    mkdirSync(DATA, { recursive: true });
    writeFileSync(join(DATA, 'geoip-v4.bin'), v4.buf);
    writeFileSync(join(DATA, 'geoip-v6.bin'), v6.buf);
    writeFileSync(join(DATA, 'geoip-meta.json'), JSON.stringify({
        source: 'https://github.com/sapics/ip-location-db (geo-whois-asn-country, CC0)',
        built: new Date().toISOString().slice(0, 10),
        v4Ranges: v4.count,
        v6Ranges: v6.count,
    }, null, 2) + '\n');

    console.log(`\n  data/geoip-v4.bin   ${v4.count.toLocaleString()} ranges  ${(v4.buf.length / 1e6).toFixed(1)} MB`);
    console.log(`  data/geoip-v6.bin   ${v6.count.toLocaleString()} ranges  ${(v6.buf.length / 1e6).toFixed(1)} MB`);
    console.log('\nDone. Redeploy trackSession to ship the new tables.');
}

main().catch(err => {
    console.error('\nrefresh-geoip failed:', err.message);
    process.exit(1);
});
