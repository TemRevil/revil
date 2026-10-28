#!/usr/bin/env node
/**
 * migrate-per-entry.mjs - move contact messages, meetings and treasury entries out of
 * the old maps (Settings/Canary.Emails / .Meetings and Treasury/{projects, income,
 * spendings, accounts, receipts}.entries) into one Firestore document each:
 * CanaryMessages, CanaryMeetings, TreasuryProjects, TreasuryIncome, TreasurySpendings,
 * TreasuryAccounts and TreasuryReceipts. Each document's id is the entry's old key.
 *
 * Meetings change shape on the way: the old "DD/MM/YYYY" + "hh:mm AM/PM" (the owner's
 * wall clock) become `start`, a UTC ISO instant, read in the named zone from
 * Settings/Availability (`timeZone`), with `timeZone`/`utcOffset` recording that clock.
 * Without a named zone the old fixed offset is used, and every meeting read that way is
 * listed. Messages and meetings are marked `migratedFrom`, so the new triggers don't
 * email anyone about them again. Treasury entries are copied exactly.
 *
 * MODES (each run first writes a full JSON backup of every document it reads to
 * backups/<time>/ in the repo; backups/ is git-ignored):
 *   (no flag) or --dry-run   print what would be written, with counts and samples; writes nothing
 *   --apply                  create the missing documents in batches, then check every
 *                            planned document exists. Safe to run again: a document
 *                            that already exists is never overwritten (one that differs
 *                            from the old entry is listed, since the new one may be newer).
 *   --remove-old             only once every planned document exists: delete the
 *                            Emails and Meetings fields of Settings/Canary (Categories
 *                            stay) and the five old Treasury documents.
 *
 * CREDENTIALS - the same as scripts/set-admin.mjs: firebase-admin is loaded from
 * functions/node_modules (`npm --prefix functions ci`), and a service-account key for
 * the project is passed in GOOGLE_APPLICATION_CREDENTIALS. Keep that key OUTSIDE the repo.
 *
 *   GOOGLE_APPLICATION_CREDENTIALS="/abs/path/key.json" node scripts/migrate-per-entry.mjs --dry-run
 */
import { createRequire } from 'node:module';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { OLD_DOCS, SOURCES, backupStamp, planMigration, sameData, toJson } from './lib/per-entry.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const BATCH = 400;

const args = process.argv.slice(2);
const known = new Set(['--dry-run', '--apply', '--remove-old']);
const unknown = args.filter((a) => !known.has(a));
const apply = args.includes('--apply');
const removeOld = args.includes('--remove-old');
if (unknown.length || (apply && removeOld) || (args.includes('--dry-run') && (apply || removeOld))) {
    console.error('Usage: node scripts/migrate-per-entry.mjs [--dry-run | --apply | --remove-old]');
    process.exit(1);
}
const mode = apply ? 'apply' : removeOld ? 'remove-old' : 'dry-run';

if (!process.env.GOOGLE_APPLICATION_CREDENTIALS) {
    console.error('Set GOOGLE_APPLICATION_CREDENTIALS to your service-account key path first.');
    process.exit(1);
}
const requireFromFunctions = createRequire(new URL('../functions/package.json', import.meta.url));
let app, firestore;
try {
    app = requireFromFunctions('firebase-admin/app');
    firestore = requireFromFunctions('firebase-admin/firestore');
} catch {
    console.error('firebase-admin is not installed in functions/. Run `npm --prefix functions ci` first.');
    process.exit(1);
}
app.initializeApp({ credential: app.applicationDefault() });
const db = firestore.getFirestore();
const { FieldValue } = firestore;

// ── read everything, back it up ──────────────────────────────────────
const old = {};
for (const path of OLD_DOCS) {
    const snap = await db.doc(path).get();
    old[path] = snap.exists ? snap.data() : undefined;
}
const availability = (await db.doc('Settings/Availability').get()).data();
const current = {};
for (const src of SOURCES) {
    const snap = await db.collection(src.collection).get();
    current[src.collection] = new Map(snap.docs.map((d) => [d.id, d.data()]));
}

const stamp = backupStamp(Date.now());
const backupDir = resolve(ROOT, 'backups', stamp);
mkdirSync(backupDir, { recursive: true });
writeFileSync(resolve(backupDir, 'old-documents.json'), JSON.stringify(toJson({ ...old, 'Settings/Availability': availability }), null, 2));
writeFileSync(resolve(backupDir, 'new-collections.json'), JSON.stringify(
    toJson(Object.fromEntries(Object.entries(current).map(([c, m]) => [c, Object.fromEntries(m)]))), null, 2));
console.log(`Backup written to backups/${stamp}/ (old-documents.json, new-collections.json).`);

// ── plan ─────────────────────────────────────────────────────────────
const { writes, report } = planMigration(old, availability);
const state = (w) => {
    const have = current[w.collection].get(w.id);
    if (have === undefined) return 'missing';
    return sameData(have, w.data) ? 'same' : 'differs';
};

console.log(`\nMode: ${mode}`);
console.log(`Owner clock: ${report.host.named ? report.host.zone : `fixed offset UTC${report.host.zone >= 0 ? '+' : ''}${report.host.zone} (no named zone in Settings/Availability)`}`);
console.log('\nEntries per collection (planned / already there and identical / already there but different / to create):');
for (const src of SOURCES) {
    const mine = writes.filter((w) => w.collection === src.collection);
    const tally = { same: 0, differs: 0, missing: 0 };
    for (const w of mine) tally[state(w)]++;
    console.log(`  ${src.collection.padEnd(18)} ${String(mine.length).padStart(5)} / ${String(tally.same).padStart(5)} / ${String(tally.differs).padStart(5)} / ${String(tally.missing).padStart(5)}`);
}

const list = (title, items) => {
    if (!items.length) return;
    console.log(`\n${title} (${items.length}):`);
    for (const i of items) console.log(`  ${i}`);
};
list('Meetings read on the fixed-offset fallback (check their times)', report.fallback);
list('Meetings whose Date/Time could not be read: copied as they are, without a start (fix by hand)', report.unconverted);
list('Entries whose key cannot be a document id: NOT migrated, still in the old document and the backup', report.badIds);
list('Entries that are not objects: NOT migrated, still in the old document and the backup', report.notObjects);
list('Already in the new collection but different from the old entry: left as they are', writes.filter((w) => state(w) === 'differs').map((w) => `${w.collection}/${w.id}`));

// Samples show field names and the meeting time conversion, never visitor text or amounts.
console.log('\nSamples:');
for (const src of SOURCES) {
    const w = writes.find((x) => x.collection === src.collection);
    if (!w) continue;
    const fields = Object.keys(w.data).sort().join(', ');
    if (src.key === 'meetings') {
        const was = old[src.doc][src.field][w.id];
        console.log(`  ${src.collection}/${w.id}: ${was.Date} ${was.Time} -> start ${w.data.start ?? '(none)'} [${w.data.timeZone ?? `UTC offset ${w.data.utcOffset}`}]; fields: ${fields}`);
    } else {
        console.log(`  ${src.collection}/${w.id}: fields: ${fields}`);
    }
}

if (mode === 'dry-run') {
    console.log('\nDry run: nothing was written to Firestore. Run with --apply to create the documents.');
    process.exit(0);
}

// ── apply ────────────────────────────────────────────────────────────
async function createMissing(todo) {
    let created = 0;
    for (let i = 0; i < todo.length; i += BATCH) {
        const chunk = todo.slice(i, i + BATCH);
        const batch = db.batch();
        for (const w of chunk) batch.create(db.collection(w.collection).doc(w.id), w.data);
        try {
            await batch.commit();
            created += chunk.length;
        } catch (err) {
            // A document appeared since the read (a create fails rather than overwrite):
            // go one by one, so only that one is skipped.
            if (err?.code !== 6 && !/already exists/i.test(String(err?.message))) throw err;
            for (const w of chunk) {
                try { await db.collection(w.collection).doc(w.id).create(w.data); created++; } catch (e) {
                    if (e?.code !== 6 && !/already exists/i.test(String(e?.message))) throw e;
                    console.log(`  skipped ${w.collection}/${w.id}: it was created meanwhile`);
                }
            }
        }
    }
    return created;
}

async function missingAfter() {
    const missing = [];
    for (const src of SOURCES) {
        const ids = new Set((await db.collection(src.collection).select().get()).docs.map((d) => d.id));
        for (const w of writes) if (w.collection === src.collection && !ids.has(w.id)) missing.push(`${w.collection}/${w.id}`);
    }
    return missing;
}

if (mode === 'apply') {
    const todo = writes.filter((w) => state(w) === 'missing');
    console.log(`\nCreating ${todo.length} document(s) in batches of up to ${BATCH}...`);
    const created = await createMissing(todo);
    const missing = await missingAfter();
    console.log(`Created ${created}. Verification: ${writes.length - missing.length} of ${writes.length} planned documents exist.`);
    if (missing.length) {
        list('MISSING after apply', missing);
        process.exit(1);
    }
    console.log('All planned documents exist. When the new functions and site are live, run --remove-old.');
    process.exit(0);
}

// ── remove-old ───────────────────────────────────────────────────────
const missing = await missingAfter();
if (missing.length) {
    list('Not removing anything: these planned documents do not exist yet (run --apply)', missing);
    process.exit(1);
}
if (report.badIds.length || report.notObjects.length) {
    console.error('\nNot removing anything: some entries could not be migrated (listed above). Move or delete them by hand first; the backup holds them.');
    process.exit(1);
}
console.log(`\nAll ${writes.length} planned documents exist. Removing the old maps...`);
const batch = db.batch();
if (old['Settings/Canary']) {
    batch.update(db.doc('Settings/Canary'), {
        Emails: FieldValue.delete(), Meetings: FieldValue.delete(), lastMeetingWrite: FieldValue.delete(),
    });
}
for (const path of OLD_DOCS.filter((p) => p.startsWith('Treasury/'))) {
    if (old[path]) batch.delete(db.doc(path));
}
await batch.commit();
console.log('Removed Settings/Canary Emails and Meetings (Categories kept) and the old Treasury documents. Treasury/settings is untouched.');
process.exit(0);
