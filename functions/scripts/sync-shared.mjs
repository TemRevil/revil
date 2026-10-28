#!/usr/bin/env node
/**
 * Copy the code the site and the Cloud Functions share into this codebase.
 *
 *   node scripts/sync-shared.mjs          # write the copies under src/
 *   node scripts/sync-shared.mjs --check  # exit 1 if any copy is out of date
 *
 * Each source below (repo root) is the one definition of its logic: the booking rules
 * the calendar draws from and bookMeeting enforces, the treasury money math the
 * dashboard and the AI tools both report, the receipt both of them email, the email
 * shell every mail is framed in, and the public handled-projects projection.
 * Firebase deploys only this folder, so the functions build (prebuild) copies them in.
 * The sources must stay dependency-free (they may import each other by the same name).
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(here, '../..');

const FILES = [
  ['src/utils/bookingRules.ts', 'booking.ts'],
  ['src/lib/money.ts', 'money.ts'],
  ['src/lib/html.ts', 'html.ts'],
  ['src/lib/receipt.ts', 'receipt.ts'],
  ['src/lib/emailShell.ts', 'emailShell.ts'],
  ['src/lib/handledProjects.ts', 'handledProjects.ts'],
];

const check = process.argv.includes('--check');
const lf = (s) => s.replace(/\r\n/g, '\n');
let stale = 0;

for (const [from, to] of FILES) {
  const out = resolve(here, '../src', to);
  const want = `// GENERATED from ${from} by scripts/sync-shared.mjs - edit that file.\n\n`
    + readFileSync(resolve(ROOT, from), 'utf8');
  const have = existsSync(out) ? readFileSync(out, 'utf8') : '';
  // Compare text, not bytes: a Windows checkout (core.autocrlf) has CRLF on one side.
  if (lf(have) === lf(want)) continue;
  if (check) {
    console.error(`functions/src/${to} is out of date with ${from}`);
    stale++;
  } else {
    writeFileSync(out, want, 'utf8');
    console.log(`Synced ${from} -> functions/src/${to}`);
  }
}

if (check) {
  if (stale) {
    console.error('Run: npm --prefix functions run sync-shared');
    process.exit(1);
  }
  console.log('Shared code is up to date');
}
