#!/usr/bin/env node
/**
 * Render scripts/og-card.html to public/og.png (1200x630), the share card for the
 * homepage and /projects. Uses the installed Chrome or Edge in headless mode, so the
 * card is drawn with the site's own fonts and photo. Run after changing either:
 *
 *   npm run og:card              # or set CHROME=/path/to/chrome
 */
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const page = pathToFileURL(resolve(here, 'og-card.html')).href;
const out = resolve(here, '../public/og.png');

const candidates = [
  process.env.CHROME,
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
].filter(Boolean);
const chrome = candidates.find((c) => existsSync(c));
if (!chrome) {
  console.error('No Chrome or Edge found; set CHROME to its path.');
  process.exit(1);
}

execFileSync(chrome, [
  '--headless=new', '--disable-gpu', '--hide-scrollbars', '--allow-file-access-from-files',
  '--force-device-scale-factor=1', '--window-size=1200,630', '--virtual-time-budget=3000',
  `--screenshot=${out}`, page,
], { stdio: 'inherit' });
console.log(`Wrote ${out}`);
