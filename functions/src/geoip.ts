/**
 * IP -> country, from tables bundled with the function.
 *
 * The address itself is never stored, logged or returned: it goes in, a country
 * comes out, and the caller only ever persists the country. The tables are built
 * by `scripts/refresh-geoip.mjs` from ip-location-db (CC0) - see that file for the
 * binary layout and how often it wants rebuilding.
 *
 * Loading is lazy and cached in module scope, so a warm instance pays nothing and
 * a cold one pays a single ~7 MB read from local disk. No network, no API key.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";

const DATA_DIR = join(__dirname, "..", "data");
const V4_ROW = 10;
const V6_ROW = 18;

let v4: Buffer | null = null;
let v6: Buffer | null = null;
let loadFailed = false;

function load(): void {
  if (v4 || loadFailed) return;
  try {
    v4 = readFileSync(join(DATA_DIR, "geoip-v4.bin"));
    v6 = readFileSync(join(DATA_DIR, "geoip-v6.bin"));
  } catch (err) {
    // Missing tables must never take the endpoint down - the visit is still
    // recorded, it just has no country on it.
    loadFailed = true;
    console.warn("geoip tables unavailable:", (err as Error).message);
  }
}

/** Dotted quad -> the 32-bit number the table is keyed by. */
function ipv4ToInt(ip: string): number | null {
  const parts = ip.split(".");
  if (parts.length !== 4) return null;
  let out = 0;
  for (const p of parts) {
    if (!/^\d{1,3}$/.test(p)) return null;
    const n = Number(p);
    if (n > 255) return null;
    out = (out * 256) + n;
  }
  return out >>> 0;
}

/** IPv6 -> the high 64 bits, which is all the table keys on. */
function ipv6ToHigh(ip: string): bigint | null {
  const clean = ip.split("%")[0];
  if (!/^[0-9a-fA-F:.]+$/.test(clean)) return null;

  const [head, tail] = clean.split("::");
  const toGroups = (s: string): string[] => (s ? s.split(":").filter(Boolean) : []);
  let groups = toGroups(head);
  const tailGroups = clean.includes("::") ? toGroups(tail) : [];

  // A trailing dotted quad (::ffff:1.2.3.4) counts as two groups.
  const expandDotted = (list: string[]): string[] | null => {
    if (!list.length) return list;
    const last = list[list.length - 1];
    if (!last.includes(".")) return list;
    const n = ipv4ToInt(last);
    if (n === null) return null;
    return [
      ...list.slice(0, -1),
      ((n >>> 16) & 0xffff).toString(16),
      (n & 0xffff).toString(16),
    ];
  };

  const headExp = expandDotted(groups);
  const tailExp = expandDotted(tailGroups);
  if (!headExp || !tailExp) return null;
  groups = headExp;

  if (clean.includes("::")) {
    const missing = 8 - (groups.length + tailExp.length);
    if (missing < 0) return null;
    groups = [...groups, ...Array(missing).fill("0"), ...tailExp];
  }
  if (groups.length !== 8) return null;

  let high = 0n;
  for (let i = 0; i < 4; i++) {
    const g = groups[i];
    if (!/^[0-9a-fA-F]{1,4}$/.test(g)) return null;
    high = (high << 16n) | BigInt(parseInt(g, 16));
  }
  return high;
}

/**
 * Private, loopback, link-local, CGNAT and multicast space.
 *
 * These never appear in the dataset, but a binary search still lands *somewhere* -
 * on the range that happens to straddle the gap - so a visitor behind a proxy
 * reporting 192.168.x.x would confidently be labelled with a country they have
 * never been to. Reject them before looking anything up.
 */
function isReservedV4(n: number): boolean {
  const a = (n >>> 24) & 0xff;
  const b = (n >>> 16) & 0xff;
  if (a === 0 || a === 10 || a === 127) return true;
  if (a === 169 && b === 254) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  if (a === 100 && b >= 64 && b <= 127) return true;
  if (a >= 224) return true;
  return false;
}

/** The IPv6 equivalent: loopback, unique-local and link-local. */
function isReservedV6(high: bigint): boolean {
  if (high === 0n) return true;                       // :: and ::1
  const top = high >> 56n;
  if (top >= 0xfcn && top <= 0xfdn) return true;      // fc00::/7
  if ((high >> 54n) === 0x3fan) return true;          // fe80::/10
  return false;
}

function searchV4(target: number): string | null {
  if (!v4) return null;
  let lo = 0;
  let hi = (v4.length / V4_ROW) - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    const at = mid * V4_ROW;
    const start = v4.readUInt32BE(at);
    const end = v4.readUInt32BE(at + 4);
    if (target < start) hi = mid - 1;
    else if (target > end) lo = mid + 1;
    else return String.fromCharCode(v4[at + 8], v4[at + 9]);
  }
  return null;
}

function searchV6(target: bigint): string | null {
  if (!v6) return null;
  let lo = 0;
  let hi = (v6.length / V6_ROW) - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    const at = mid * V6_ROW;
    const start = v6.readBigUInt64BE(at);
    const end = v6.readBigUInt64BE(at + 8);
    if (target < start) hi = mid - 1;
    else if (target > end) lo = mid + 1;
    else return String.fromCharCode(v6[at + 16], v6[at + 17]);
  }
  return null;
}

let regionNames: Intl.DisplayNames | null = null;
function countryName(code: string): string {
  try {
    if (!regionNames) regionNames = new Intl.DisplayNames(["en"], { type: "region" });
    return regionNames.of(code) || code;
  } catch {
    return code;
  }
}

/**
 * Resolve the caller's country from the request headers.
 * Returns null when the address is private, unparseable, or simply unlisted.
 */
export function lookupCountry(
  headers: Record<string, string | string[] | undefined>,
  fallbackIp?: string,
): { Code: string; Country: string } | null {
  // x-forwarded-for is "client, proxy1, proxy2" - the client is first.
  const raw = headers["x-forwarded-for"];
  const chain = Array.isArray(raw) ? raw.join(",") : (raw || "");
  const ip = (chain.split(",")[0] || fallbackIp || "").trim();
  if (!ip) return null;

  load();
  if (loadFailed) return null;

  let code: string | null = null;
  const v4mapped = ip.startsWith("::ffff:") ? ip.slice(7) : ip;
  if (v4mapped.includes(".") && !v4mapped.includes(":")) {
    const n = ipv4ToInt(v4mapped);
    if (n !== null && !isReservedV4(n)) code = searchV4(n);
  } else if (ip.includes(":")) {
    const high = ipv6ToHigh(ip);
    if (high !== null && !isReservedV6(high)) code = searchV6(high);
  }

  if (!code) return null;
  return { Code: code, Country: countryName(code) };
}
