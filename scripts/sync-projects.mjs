/**
 * Snapshot the public `Projects` collection into src/data/projects.snapshot.json, and the
 * hero's name + title (Settings/Account) into src/data/account.snapshot.json, and what
 * /book says (Settings/BookPage + the Account email and social links) into
 * src/data/book.snapshot.json, and the status percent + time zone (Settings/Availability)
 * into src/data/availability.snapshot.json.
 *
 * WHY: the site is a static export whose content is fetched from Firestore at RUNTIME,
 * so the prerendered HTML ships empty. AI crawlers (GPTBot / ClaudeBot / PerplexityBot)
 * do NOT execute JavaScript, so they never see the portfolio work. This snapshot is read
 * at BUILD time and baked into the page's JSON-LD, so crawlers get the real projects.
 * The app still live-updates from Firestore via onSnapshot on top of it.
 *
 * The account snapshot is what the homepage hero draws with before Firebase has loaded
 * (it no longer waits for Firestore to show the page), so refresh it after renaming. The
 * book snapshot does the same for /book: refresh it after editing the page in Canary →
 * Options or the links in Settings. The availability snapshot seeds the status and clock
 * pills (both pages); a returning visitor gets the last live copy instead.
 *
 * We can't fetch this in CI with the public key: App Check is enforced on Firestore, so
 * anonymous REST reads 403 even though the rules are `allow read: if true`. Hence the
 * snapshot is generated locally with an owner/admin token and committed.
 *
 * Refresh after editing projects in Canary:
 *   npm run sync:projects && git commit -am "chore: refresh projects snapshot"
 *
 * Auth: gcloud owner token, or a service-account token via $FIRESTORE_ACCESS_TOKEN.
 */
import { execSync } from 'node:child_process';
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const PROJECT_ID = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || 'temrevil1';
const DATA = resolve(dirname(fileURLToPath(import.meta.url)), '../src/data');
const OUT = resolve(DATA, 'projects.snapshot.json');
const ACCOUNT_OUT = resolve(DATA, 'account.snapshot.json');
const BOOK_OUT = resolve(DATA, 'book.snapshot.json');
const HOST_STATUS_OUT = resolve(DATA, 'availability.snapshot.json');

/** Firestore REST tags every value with its type; unwrap to what doc.data() returns. */
function decode(v) {
    if (!v || typeof v !== 'object') return null;
    if ('stringValue' in v) return v.stringValue;
    if ('integerValue' in v) return Number(v.integerValue);
    if ('doubleValue' in v) return Number(v.doubleValue);
    if ('booleanValue' in v) return v.booleanValue;
    if ('nullValue' in v) return null;
    if ('timestampValue' in v) return v.timestampValue;
    if ('mapValue' in v) return decodeFields(v.mapValue?.fields || {});
    if ('arrayValue' in v) return (v.arrayValue?.values || []).map(decode);
    return null;
}

function decodeFields(fields) {
    const out = {};
    for (const [k, v] of Object.entries(fields)) out[k] = decode(v);
    return out;
}

function getToken() {
    if (process.env.FIRESTORE_ACCESS_TOKEN) return process.env.FIRESTORE_ACCESS_TOKEN.trim();
    // A fixed command with nothing interpolated into it, so there's no injection surface.
    // It has to go through a shell: on Windows gcloud is a .cmd, and Node 20+ refuses to
    // execFile a .cmd/.bat without one (CVE-2024-27980 mitigation), so execFile can never
    // find it. execSync is the thing that actually works here.
    try {
        return execSync('gcloud auth print-access-token', { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
    } catch {
        throw new Error(
            'Could not get a token from gcloud. Make sure the Google Cloud SDK is installed and ' +
            'you are logged in as the temrevil1 owner (`gcloud auth login`), or set FIRESTORE_ACCESS_TOKEN.'
        );
    }
}

const token = getToken();
const url = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents/Projects?pageSize=300`;
const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
if (!res.ok) throw new Error(`Firestore ${res.status}: ${await res.text()}`);

const { documents = [] } = await res.json();

const projects = documents
    .map((d) => ({ id: d.name.split('/').pop(), ...decodeFields(d.fields || {}) }))
    // Sort by id so regenerating produces a stable diff (the UI re-sorts by Listing anyway).
    .sort((a, b) => a.id.localeCompare(b.id));

mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, JSON.stringify(projects, null, 2) + '\n', 'utf8');
console.log(`Wrote ${projects.length} projects -> ${OUT}`);

/** One Settings document, decoded. */
async function settingsDoc(id) {
    const r = await fetch(
        `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents/Settings/${id}`,
        { headers: { Authorization: `Bearer ${token}` } },
    );
    if (!r.ok) throw new Error(`Firestore ${r.status}: ${await r.text()}`);
    return decodeFields((await r.json()).fields || {});
}

const account = await settingsDoc('Account');
const { name, title } = account;
writeFileSync(ACCOUNT_OUT, JSON.stringify({ name, title }, null, 2) + '\n', 'utf8');
console.log(`Wrote the account name + title -> ${ACCOUNT_OUT}`);

const { slogan, intro, tags } = await settingsDoc('BookPage');
const book = {
    page: { slogan, intro, tags },
    account: { Email: account.Email, 'Social Links': account['Social Links'] },
};
writeFileSync(BOOK_OUT, JSON.stringify(book, null, 2) + '\n', 'utf8');
console.log(`Wrote the /book text + links -> ${BOOK_OUT}`);

const availability = await settingsDoc('Availability');
const hostStatus = { 'Current Availability': availability['Current Availability'], 'Current Time': availability['Current Time'] };
writeFileSync(HOST_STATUS_OUT, JSON.stringify(hostStatus, null, 2) + '\n', 'utf8');
console.log(`Wrote the status + time zone pills -> ${HOST_STATUS_OUT}`);
