/**
 * Snapshot the public site's Firestore content (every path in src/data/publicPaths.json)
 * into src/data/public.snapshot.json. The build bakes it into the homepage and /book
 * (<script id="public-data">, baked in by scripts/public-data.mjs), where lib/dataCache hands it to a
 * first-time visitor's sections at once; Firestore's live copy replaces it a moment later.
 * The project pages (/projects and /projects/<slug>) and the homepage's <noscript> copy are
 * built from it too, so crawlers that don't run JavaScript see the real work.
 *
 * CI runs this before every build and once a day (.github/workflows/deploy-hostinger.yml),
 * with a read-only service-account token, so the snapshot follows the dashboard on its own.
 * Locally: `npm run sync:data`.
 *
 * Firestore can't be read anonymously from here: App Check is enforced, so a request
 * without its token is refused even though the rules allow public reads. An OAuth token
 * (a service account's, or the owner's) is not subject to App Check.
 *
 * Auth: $FIRESTORE_ACCESS_TOKEN, else a token for gcloud's active account.
 *
 * With $COMPARE_WITH set to a page URL (CI's daily run), it also writes `changed=true|false`
 * to $GITHUB_OUTPUT: whether the snapshot differs from the one that page carries.
 */
import { execSync } from 'node:child_process';
import { appendFileSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
// The same decoder lib/liveDoc reads with, fields in name order: the daily run compares
// this snapshot with the live one to decide whether to deploy.
import { decodeFields } from '../src/lib/firestoreRest.mjs';

const PROJECT_ID = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || 'temrevil1';
const DATA = resolve(dirname(fileURLToPath(import.meta.url)), '../src/data');
const OUT = resolve(DATA, 'public.snapshot.json');
const PATHS = JSON.parse(readFileSync(resolve(DATA, 'publicPaths.json'), 'utf8'));
const BASE = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents/`;

function getToken() {
    if (process.env.FIRESTORE_ACCESS_TOKEN) return process.env.FIRESTORE_ACCESS_TOKEN.trim();
    // A fixed command with nothing interpolated into it, so there's no injection surface.
    // It has to go through a shell: on Windows gcloud is a .cmd, and Node 20+ refuses to
    // execFile a .cmd/.bat without one (CVE-2024-27980 mitigation).
    try {
        return execSync('gcloud auth print-access-token', { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], timeout: 90_000 }).trim();
    } catch {
        throw new Error(
            'Could not get a token from gcloud. Make sure the Google Cloud SDK is installed and an account ' +
            'that can read the project Firestore is active (`gcloud auth login`), or set FIRESTORE_ACCESS_TOKEN.'
        );
    }
}

const token = getToken();
const url = (path, query = '') => BASE + path.split('/').map(encodeURIComponent).join('/') + query;

async function get(path, query) {
    const res = await fetch(url(path, query), { headers: { Authorization: `Bearer ${token}` } });
    if (!res.ok && res.status !== 404) throw new Error(`Firestore ${res.status} on ${path}: ${await res.text()}`);
    return res;
}

/** One document's data, or null when it doesn't exist. */
async function readDoc(path) {
    const res = await get(path);
    return res.status === 404 ? null : decodeFields((await res.json()).fields || {});
}

/** Every document in a collection as { id, ...data }, sorted by id for a stable diff. */
async function readCollection(path) {
    const docs = [];
    let page = '';
    do {
        const res = await get(path, `?pageSize=300${page ? `&pageToken=${encodeURIComponent(page)}` : ''}`);
        if (res.status === 404) break;
        const body = await res.json();
        for (const d of body.documents || []) docs.push({ id: d.name.split('/').pop(), ...decodeFields(d.fields || {}) });
        page = body.nextPageToken || '';
    } while (page);
    return docs.sort((a, b) => a.id.localeCompare(b.id));
}

const snapshot = { at: Date.now(), docs: {}, collections: {} };
const [docs, collections] = await Promise.all([
    Promise.all(PATHS.docs.map(readDoc)),
    Promise.all(PATHS.collections.map(readCollection)),
]);
PATHS.docs.forEach((p, i) => { snapshot.docs[p] = docs[i]; });
PATHS.collections.forEach((p, i) => { snapshot.collections[p] = collections[i]; });

const json = JSON.stringify(snapshot, null, 2) + '\n';
writeFileSync(OUT, json, 'utf8');
console.log(`Wrote ${PATHS.docs.length} documents and ${PATHS.collections.length} collections -> ${OUT}`);

if (process.env.COMPARE_WITH) {
    let changed = true;
    try {
        const html = await (await fetch(process.env.COMPARE_WITH)).text();
        const live = html.match(/<script id="public-data" type="application\/json">([\s\S]*?)<\/script>/)?.[1];
        // The content, not when it was read.
        const content = ({ docs, collections }) => JSON.stringify({ docs, collections });
        if (live) changed = content(JSON.parse(live)) !== content(snapshot);
    } catch (error) {
        console.warn(`Could not read the live snapshot (${error.message}); treating it as changed.`);
    }
    console.log(changed ? 'The live site carries an older snapshot.' : 'The live site already carries this snapshot.');
    if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `changed=${changed}\n`);
}
