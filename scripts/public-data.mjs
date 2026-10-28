#!/usr/bin/env node
/**
 * After `next build`: bake the build's copy of the public Firestore content
 * (src/data/public.snapshot.json, written by sync-data.mjs) into the pages that read it,
 * as <script id="public-data" type="application/json"> for lib/dataCache. A first-time
 * visitor's sections then draw with it at once, before Firebase has loaded.
 *
 * Added here rather than rendered by React: a server-rendered tag also lands in the page's
 * RSC payload, so every byte of the snapshot shipped twice. React leaves a tag it didn't
 * render in <head> alone when it hydrates. `next dev` pages have no copy and read Firestore.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { inlineJson } from './lib/inline-json.mjs';

const root = process.cwd();
const dist = resolve(root, process.env.NEXT_DIST_DIR || 'dist');
const snapshot = JSON.parse(readFileSync(resolve(root, 'src/data/public.snapshot.json'), 'utf8'));

// Each page and what it reads: the homepage everything, /book its own few documents.
const PAGES = {
  'index.html': null,
  'book.html': ['Settings/BookPage', 'Settings/Account', 'Settings/Availability', 'Settings/BookedSlots'],
};

for (const [file, docs] of Object.entries(PAGES)) {
  const data = docs
    ? { at: snapshot.at, docs: Object.fromEntries(docs.map((p) => [p, snapshot.docs[p] ?? null])), collections: {} }
    : snapshot;
  // Escaped by scripts/lib/inline-json.mjs, so no text in the data can close the script tag.
  const json = inlineJson(data);
  const path = resolve(dist, file);
  const html = readFileSync(path, 'utf8');
  if (html.includes('id="public-data"') || !html.includes('</head>')) {
    console.error(`public-data: ${file} already has a copy or has no </head>.`);
    process.exit(1);
  }
  writeFileSync(path, html.replace('</head>', `<script id="public-data" type="application/json">${json}</script></head>`));
}
console.log(`Baked the data snapshot into ${Object.keys(PAGES).join(', ')}`);
