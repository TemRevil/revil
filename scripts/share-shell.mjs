#!/usr/bin/env node
/**
 * After `next build`: write dist/share.html, a copy of the app shell (index.html) that
 * search engines are told not to index.
 *
 * Share links are temrevil.com/<code>, and any address the server has no file for
 * falls back to the app shell (deploy/hostinger/.htaccess), which reads the code.
 * That fallback used to be index.html itself, so every unknown address answered as a
 * copy of the homepage (a "soft 404" to Google). It now serves this file instead:
 * links keep working, and only real pages can end up in search results.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const dist = resolve(process.cwd(), process.env.NEXT_DIST_DIR || 'dist');
let html = readFileSync(resolve(dist, 'index.html'), 'utf8');

const swaps = [
  [/<meta name="robots" content="[^"]*"\/>/, '<meta name="robots" content="noindex, follow"/>'],
  [/<meta name="googlebot" content="[^"]*"\/>/, '<meta name="googlebot" content="noindex, follow"/>'],
  [/<link rel="canonical" href="[^"]*"\/>/, ''],
];
for (const [find, replace] of swaps) {
  if (!find.test(html)) {
    console.error(`share-shell: ${find} not found in index.html; the shell would stay indexable.`);
    process.exit(1);
  }
  html = html.replace(find, replace);
}

writeFileSync(resolve(dist, 'share.html'), html);
console.log('Wrote share.html (noindex app shell for share links)');
