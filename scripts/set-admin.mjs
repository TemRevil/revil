#!/usr/bin/env node
/**
 * set-admin.mjs - mint the `admin: true` custom claim for the site owner.
 *
 * WHY THIS EXISTS
 * ---------------
 * The entire Firestore/Storage write-security model (firestore.rules / storage.rules)
 * gates admin writes on `request.auth.token.admin == true`. That claim is NOT set by
 * the app at runtime - it must be minted once with the Admin SDK. Without it, EVERY
 * dashboard write (settings, projects, tags, meeting cancel/reschedule, image uploads)
 * is silently rejected by the security rules.
 *
 * firebase-admin is a dependency of the Cloud Functions, not of the site, so this script
 * loads it from functions/node_modules (install it once with `npm --prefix functions ci`).
 *
 * USAGE
 * -----
 * 1. Download a service-account key for the Firebase project:
 *      Firebase Console > Project Settings > Service accounts > Generate new private key
 *    Save it OUTSIDE the repo (it must NEVER be committed - see .gitignore).
 * 2. Run, from the repo root:
 *      npm --prefix functions ci
 *      GOOGLE_APPLICATION_CREDENTIALS="/abs/path/serviceAccountKey.json" \
 *        node scripts/set-admin.mjs <admin-uid-or-email>
 * 3. Sign out and back in on the site (SecretPage already calls getIdToken(true),
 *    so the new claim takes effect on next sign-in).
 *
 * VERIFY
 * ------
 *    node scripts/set-admin.mjs --check <admin-uid-or-email>
 */
import { createRequire } from 'node:module';

const args = process.argv.slice(2);
const checkOnly = args[0] === '--check';
const ident = checkOnly ? args[1] : args[0];

if (!ident) {
  console.error('Usage: node scripts/set-admin.mjs [--check] <uid-or-email>');
  process.exit(1);
}
if (!process.env.GOOGLE_APPLICATION_CREDENTIALS) {
  console.error('Set GOOGLE_APPLICATION_CREDENTIALS to your service-account key path first.');
  process.exit(1);
}

// Resolved as if required from functions/, where firebase-admin is installed.
const requireFromFunctions = createRequire(new URL('../functions/package.json', import.meta.url));
let app, auth;
try {
  app = requireFromFunctions('firebase-admin/app');
  auth = requireFromFunctions('firebase-admin/auth');
} catch {
  console.error('firebase-admin is not installed in functions/. Run `npm --prefix functions ci` first.');
  process.exit(1);
}

app.initializeApp({ credential: app.applicationDefault() });
const users = auth.getAuth();

let user;
try {
  user = ident.includes('@')
    ? await users.getUserByEmail(ident)
    : await users.getUser(ident);
} catch (e) {
  console.error(`Could not find user "${ident}":`, e.message);
  process.exit(1);
}

if (checkOnly) {
  console.log(`Claims for ${user.email || user.uid}:`, user.customClaims || {});
  process.exit(0);
}

await users.setCustomUserClaims(user.uid, { admin: true });
console.log(`Set { admin: true } for ${user.email || user.uid} (uid: ${user.uid}).`);
console.log('Sign out and back in on the site for it to take effect.');
process.exit(0);
