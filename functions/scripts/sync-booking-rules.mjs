#!/usr/bin/env node
/**
 * Copy the public booking rules from the site into this codebase.
 *
 *   node scripts/sync-booking-rules.mjs          # write src/booking.ts
 *   node scripts/sync-booking-rules.mjs --check  # exit 1 if it is out of date
 *
 * src/utils/bookingRules.ts (repo root) is the one definition of which days and times
 * a visitor may book: the booking calendar draws from it and bookMeeting enforces it.
 * Firebase deploys only this folder, so the functions build (prebuild) copies it in.
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const SRC = resolve(here, '../../src/utils/bookingRules.ts');
const OUT = resolve(here, '../src/booking.ts');
const HEADER = '// GENERATED from src/utils/bookingRules.ts by scripts/sync-booking-rules.mjs - edit that file.\n\n';

const want = HEADER + readFileSync(SRC, 'utf8');
const have = existsSync(OUT) ? readFileSync(OUT, 'utf8') : '';

if (process.argv.includes('--check')) {
  if (have !== want) {
    console.error('functions/src/booking.ts is out of date - run: npm --prefix functions run sync-booking-rules');
    process.exit(1);
  }
  console.log('functions/src/booking.ts is up to date');
} else if (have !== want) {
  writeFileSync(OUT, want, 'utf8');
  console.log(`Synced booking rules -> ${OUT}`);
}
