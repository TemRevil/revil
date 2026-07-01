#!/usr/bin/env node
/**
 * migrate-views-to-numbers.js - one-time backfill to make every project's
 * Views counters numeric.
 *
 * WHY THIS EXISTS
 * ---------------
 * Projects/{id} docs carry a `Views` map with Project / Github / Live / Download
 * counters. Older or manually-seeded docs stored these as strings ("0", "1"),
 * while any project touched by the app's `increment(1)` calls gets silently
 * converted to a number the first time it's incremented (Firestore's increment()
 * overwrites a non-numeric field). The result is mixed typing across the
 * collection. The UI already normalizes on read with `Number(v || 0) || 0`, but
 * we now tighten the write path to numbers-only, so this script brings existing
 * data in line once.
 *
 * WHAT IT DOES
 * ------------
 * Iterates every doc in the `Projects` collection, casts Views.Project,
 * Views.Github, Views.Live and Views.Download to Number, and writes them back
 * as numbers in a single update() per doc. Docs already fully numeric are
 * skipped (no write). Missing counters default to 0.
 *
 * USAGE
 * -----
 * firebase-admin is installed under functions/, so run from there:
 *
 *   cd functions
 *   GOOGLE_APPLICATION_CREDENTIALS="/abs/path/serviceAccountKey.json" \
 *     node ../scripts/migrate-views-to-numbers.js
 *
 * Add --dry-run to report what would change without writing:
 *
 *   node ../scripts/migrate-views-to-numbers.js --dry-run
 *
 * (Download a service-account key for the `temrevil1` project: Firebase Console
 *  → Project Settings → Service accounts → Generate new private key. Keep it
 *  OUTSIDE the repo.)
 */

const admin = require("firebase-admin");

const FIELDS = ["Project", "Github", "Live", "Download"];

async function main() {
  const dryRun = process.argv.slice(2).includes("--dry-run");

  if (!process.env.GOOGLE_APPLICATION_CREDENTIALS) {
    console.error(
      "Set GOOGLE_APPLICATION_CREDENTIALS to your service-account key path first."
    );
    process.exit(1);
  }

  admin.initializeApp({ credential: admin.credential.applicationDefault() });
  const db = admin.firestore();

  const snap = await db.collection("Projects").get();
  console.log(`Scanning ${snap.size} project doc(s)${dryRun ? " (dry run)" : ""}...`);

  let changed = 0;
  let skipped = 0;

  for (const docSnap of snap.docs) {
    const views = docSnap.get("Views") || {};

    // Build a fully-numeric Views map and detect whether anything actually differs
    const numeric = {};
    let needsWrite = false;
    for (const f of FIELDS) {
      const raw = views[f];
      const n = Number(raw) || 0;
      numeric[f] = n;
      // Rewrite if the stored value isn't already this exact number
      // (catches strings like "0" and missing fields).
      if (typeof raw !== "number" || raw !== n) needsWrite = true;
    }

    if (!needsWrite) {
      skipped++;
      continue;
    }

    // Spread `views` first so any unexpected extra keys survive; the numeric
    // casts of the four known counters override their string versions.
    const merged = { ...views, ...numeric };
    console.log(`  ${docSnap.id}:`, JSON.stringify(views), "->", JSON.stringify(merged));
    if (!dryRun) {
      await docSnap.ref.update({ Views: merged });
    }
    changed++;
  }

  console.log(
    `\nDone. ${changed} doc(s) ${dryRun ? "would be" : "were"} updated, ${skipped} already numeric.`
  );
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
