#!/usr/bin/env node
/**
 * set-admin.js - mint the `admin: true` custom claim for the portfolio owner.
 *
 * WHY THIS EXISTS
 * ---------------
 * The entire Firestore/Storage write-security model (firestore.rules / storage.rules)
 * gates admin writes on `request.auth.token.admin == true`. That claim is NOT set by
 * the app at runtime - it must be minted once with the Admin SDK. Without it, EVERY
 * dashboard write (settings, projects, tags, meeting cancel/reschedule, image uploads)
 * is silently rejected by the security rules.
 *
 * USAGE
 * -----
 * 1. Download a service-account key for the `temrevil1` project:
 *      Firebase Console → Project Settings → Service accounts → Generate new private key
 *    Save it OUTSIDE the repo (it must NEVER be committed - see .gitignore).
 * 2. Run:
 *      GOOGLE_APPLICATION_CREDENTIALS="/abs/path/serviceAccountKey.json" \
 *        node scripts/set-admin.js <admin-uid-or-email>
 *    e.g.  node scripts/set-admin.js hello@temrevil.com
 * 3. Sign out and back in on the site (SecretPage already calls getIdToken(true),
 *    so the new claim takes effect on next sign-in).
 *
 * VERIFY
 * ------
 *    node scripts/set-admin.js --check <admin-uid-or-email>
 */

const admin = require("firebase-admin");

async function main() {
  const args = process.argv.slice(2);
  const checkOnly = args[0] === "--check";
  const ident = checkOnly ? args[1] : args[0];

  if (!ident) {
    console.error("Usage: node scripts/set-admin.js [--check] <uid-or-email>");
    process.exit(1);
  }
  if (!process.env.GOOGLE_APPLICATION_CREDENTIALS) {
    console.error(
      "Set GOOGLE_APPLICATION_CREDENTIALS to your service-account key path first."
    );
    process.exit(1);
  }

  admin.initializeApp({ credential: admin.credential.applicationDefault() });

  // Resolve UID from email if needed
  let user;
  try {
    user = ident.includes("@")
      ? await admin.auth().getUserByEmail(ident)
      : await admin.auth().getUser(ident);
  } catch (e) {
    console.error(`Could not find user "${ident}":`, e.message);
    process.exit(1);
  }

  if (checkOnly) {
    console.log(`Claims for ${user.email || user.uid}:`, user.customClaims || {});
    process.exit(0);
  }

  await admin.auth().setCustomUserClaims(user.uid, { admin: true });
  console.log(`✓ Set { admin: true } for ${user.email || user.uid} (uid: ${user.uid}).`);
  console.log("Sign out and back in on the site for it to take effect.");
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
