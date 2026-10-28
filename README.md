# Revil

The source of [temrevil.com](https://temrevil.com): a portfolio site with a booking page,
and a private admin dashboard behind it, on Next.js and Firebase.

- **Public site**: the homepage (hero, stack, projects, contact and booking modals),
  `/book` (book a call), `/projects` and `/projects/<slug>` (static case-study pages),
  and `/mcp-login` (the sign-in step of the MCP server's OAuth flow).
- **Dashboard** (admin only): projects, tags, visit analytics, GitHub activity, treasury
  (finances and receipts), settings, the inbox and meetings calendar, and an AI assistant.
- **Backend**: Firebase Auth, Firestore, Storage and Cloud Functions. Every secret stays in
  the functions; the browser only holds public Firebase identifiers.

## Stack

| Area | Technology |
| :--- | :--- |
| Front end | Next.js 16 (App Router, static export), React 19, TypeScript |
| Styling | Tailwind CSS 4 and a hand-written CSS design system |
| Motion | Motion, Anime.js, Lottie (one icon) |
| Backend | Firebase: Auth, Firestore, Storage, Cloud Functions (Node 22), App Check |
| Email | Resend over SMTP, from the functions |
| Hosting | Hostinger (Apache) for the site, Firebase Hosting for the MCP endpoint |
| Tests | Vitest; `@firebase/rules-unit-testing` with the Firebase emulators |

## Layout

```text
src/
  app/              Next.js routes (/, /book, /projects, /mcp-login), metadata, SEO files
  components/       sections, modals (M-*.tsx), book/ (the /book page), dashboard/ (D-*.tsx tabs)
  lib/              Firebase setup, public data reads (liveDoc, dataCache), money, receipts, analytics
  utils/            booking rules, time zones, site profile (JSON-LD)
  data/             publicPaths.json and the build's data snapshot
functions/          the Cloud Functions (one codebase)
scripts/            build, data, preview, deploy and admin scripts (below)
tests/rules/        Firestore and Storage security-rules tests
deploy/hostinger/   .htaccess for the Apache host
firestore.rules, storage.rules, firebase.json
```

## Running it locally

Requirements: Node.js 22 or newer. For the rules tests, the Firebase CLI
(`npm install -g firebase-tools`) and Java 21.

```bash
npm ci
cp .env.example .env.local   # fill in your Firebase project's web config
npm run dev                  # http://localhost:3000
```

App Check is enforced, so a fresh local run cannot read Firestore until you register a
debug token: start the app, copy the token printed in the browser console, and add it in
the Firebase console under App Check > Apps > Manage debug tokens. Every variable is
explained in [`.env.example`](.env.example).

| Command | What it does |
| :--- | :--- |
| `npm run dev` | Development server |
| `npm run build` | Static export to `dist/`, then bakes the data snapshot into the pages (`scripts/public-data.mjs`) and writes `share.html` (`scripts/share-shell.mjs`) |
| `npm start` | Serves `dist/` on http://127.0.0.1:4173, routed like the live `.htaccess` (`scripts/preview.mjs`) |
| `npm run lint` | ESLint over the site, the functions and the scripts |
| `npm test` | Unit tests (Vitest) |
| `npm run test:rules` | Security-rules tests in the Firestore and Storage emulators (needs the Firebase CLI and Java) |
| `npm run sync:data` | Refreshes `src/data/public.snapshot.json` from Firestore (needs `gcloud auth login` or `FIRESTORE_ACCESS_TOKEN`) |
| `npm run og:card` | Renders `public/og.png` with a local Chrome or Edge |

## How the data flows

**Public pages** read a handful of public Firestore documents over the REST API with an
App Check token (`src/lib/liveDoc.ts`) instead of loading the Firestore SDK. Until a read
answers they show a cached copy: this device's, or the snapshot baked into the page at
build time. The snapshot comes from `scripts/sync-data.mjs`, which reads the paths in
`src/data/publicPaths.json`; both readers share one REST decoder (`src/lib/firestoreRest.mjs`).

**Visitors never write to Firestore directly.** The contact form and the booking form call
the `submitContact` and `bookMeeting` functions, which validate every field, rate-limit,
and write with the Admin SDK. Contact attachments are uploaded to Storage under `emails/`
first; the function only accepts links into that folder of the project's own bucket.

**The dashboard** signs in with Google and needs the `admin` custom claim. It reads and
writes Firestore and Storage directly, within the security rules.

**Private data is one document per entry**, in the collections named in
`src/lib/collections.ts`: `CanaryMessages`, `CanaryMeetings` (each meeting's `start` is a
UTC instant, with the owner's `timeZone` beside it), `TreasuryProjects`, `TreasuryIncome`,
`TreasurySpendings`, `TreasuryAccounts` and `TreasuryReceipts`. `scripts/migrate-per-entry.mjs`
moved them there from the old maps in `Settings/Canary` and `Treasury/*`; it backs up to
`backups/` (git-ignored) and runs as a dry run unless given `--apply` or `--remove-old`.

## Backend

Functions in `functions/` (Node 22):

| Function | Trigger | What it does |
| :--- | :--- | :--- |
| `submitContact` | Callable, public, App Check | Validates a contact message, rate-limits it per IP and per email address, stores it as a `CanaryMessages` document |
| `bookMeeting` | Callable, public, App Check | Validates a booking, checks the time, creates the Calendar event and Meet link through the Apps Script (only a clear success counts), stores the meeting |
| `notifyCanaryMessage` | Firestore write on `CanaryMessages/{id}` | Queues the owner's notification and the sender's acknowledgement for a new message; deletes a removed message's attachments |
| `notifyCanaryMeeting` | Firestore write on `CanaryMeetings/{id}` | Queues the owner's notification and the guest's acknowledgement for a new meeting, rebuilds the public busy-slot mirror `Settings/BookedSlots` (upcoming start instants only) |
| `sendMail` / `retryMail` | `MailJobs` create / every 5 minutes | The mail outbox: sends each queued mail, retries failures with backoff, keeps permanent failures as `failed` |
| `retryMailJob` | Callable, admin | Puts a failed mail job back in the queue and tries it at once |
| `syncMeeting` | Callable, admin, App Check | Forwards the dashboard's calendar changes (create, update, cancel) to the Apps Script |
| `mirrorTreasuryProjects` | Firestore write on `TreasuryProjects/{id}` | Publishes the public project list `Settings/HandledProjects` (name, status, order only) |
| `cleanupAttachments` | Scheduled, daily | Deletes stray contact and reply uploads, expired rate-limit records and old sent mail, and refreshes the busy-slot mirror |
| `cleanupMcp` | Scheduled, every 6 hours | Removes expired MCP logins, codes, tokens and unused client registrations |
| `notifyLogin` | Callable | Alerts the owner of a dashboard sign-in |
| `sendReceipt` | Callable, admin | Emails a receipt built in the dashboard |
| `sendReply` | Callable, admin | Sends a reply, with attachments, to a contact message |
| `llm` | Callable, admin | Proxies the dashboard assistant, so the provider key stays server-side |
| `trackSession` | HTTPS, App Check | Records visit analytics |
| `mcp` | HTTPS | MCP server with OAuth 2.1, served at the Firebase Hosting site in `firebase.json` |

The Google Apps Script owns the Calendar events and Meet links; `bookMeeting`,
`syncMeeting` and the MCP tools all reach it through `functions/src/calendar.ts`.

Shared logic (booking rules, time zones, money, receipts, the email shell, the public
project list, HTML escaping) lives once under `src/` and
is copied into `functions/src/` by `functions/scripts/sync-shared.mjs`; the functions'
build runs it, and CI checks the copies with `--check`.

Functions are deployed by hand, always scoped:

```bash
firebase deploy --only functions                              # every function
firebase deploy --only functions:mcp,functions:bookMeeting    # named functions
firebase deploy --only firestore:rules,storage                # security rules
```

`syncMeeting` used to live in a second codebase (`meeting`). On the first deploy after
it moved into `functions/`, delete the old one first, or the deploy refuses the clash:

```bash
firebase functions:delete syncMeeting --region us-central1
firebase deploy --only functions
```

A bare `firebase deploy` also republishes hosting and the rules. If discovery times out
("Cannot determine backend specification"), retry with `FUNCTIONS_DISCOVERY_TIMEOUT=120`.

### Secrets

Real credentials live in Google Secret Manager and are read only inside functions:

```bash
firebase functions:secrets:set SMTP_USER         # owner inbox
firebase functions:secrets:set RESEND_API_KEY    # email relay
firebase functions:secrets:set LLM_API_KEY       # assistant provider key
firebase functions:secrets:set MEETING_SYNC_URL  # Apps Script endpoint (anyone with it can edit the calendar)
```

## Security

- **Firestore rules** (`firestore.rules`): portfolio documents and a named list of
  `Settings` documents are publicly readable; everything else needs the `admin` claim.
  `MCP` and `RateLimits` are for the functions only; analytics, visit stories, the MCP
  audit log and the mail outbox (`MailJobs`) can be read and cleared by the admin but
  never written from a browser; `Settings/HandledProjects` is written only by its function.
- **Storage rules** (`storage.rules`): visitors may upload one new file of an allowed
  type (images, PDF, plain text, Office) under 10 MB to `emails/`, and read its metadata
  only in the first ten minutes (for its download link). Everything else is admin only.
- **App Check** guards the public functions and the public Firestore reads.
- **Tests**: `tests/rules/` checks both rule files in the emulators, in CI on every push.
- The admin claim is granted once with `scripts/set-admin.mjs` (it uses the functions'
  `firebase-admin`, so run `npm --prefix functions ci` first):

  ```bash
  GOOGLE_APPLICATION_CREDENTIALS=/path/outside/the/repo/key.json node scripts/set-admin.mjs <uid-or-email>
  node scripts/set-admin.mjs --check <uid-or-email>
  ```

## CI and deploy

- **CI** (`.github/workflows/ci.yml`) runs on every push and pull request: lint,
  type-check, unit tests and build of the site; the shared-code sync check and a
  type-check of the functions; and the security-rules tests in the emulators.
- **Release** (`.github/workflows/deploy-hostinger.yml`) runs on every push to `main`, by
  hand, and daily at 03:17 UTC. It refreshes the data snapshot, runs lint, the sync check,
  type-check, unit tests and the build, then uploads `dist/` over SSH and runs
  `scripts/deploy/activate.sh` on the server: the new release is swapped in with two
  renames back to back, the previous one is kept as a backup (the newest five are kept),
  and the homepage and one new script must answer before the run passes. If they don't,
  `scripts/deploy/rollback.sh` puts the previous release back. The daily run only ships
  when the Firestore content changed. A successful release pings IndexNow.
- **GitHub Pages** (`.github/workflows/pages-redirect.yml`) publishes a redirect to the
  canonical domain.

Every workflow action is pinned to a commit SHA.

Release secrets: `HOSTINGER_SSH_HOST`, `HOSTINGER_SSH_PORT`, `HOSTINGER_SSH_USERNAME`,
`HOSTINGER_SSH_KEY` (a private key without a passphrase, whose public key is authorised on
the host), `HOSTINGER_KNOWN_HOSTS` (the host's line from
`ssh-keyscan -p <port> <host>`, checked once against the host's real fingerprint), and the
`NEXT_PUBLIC_FIREBASE_*` values from `.env.example`. The job stops with a clear error when
one is missing. Release variables: `GCP_WORKLOAD_IDENTITY_PROVIDER` and
`GCP_SNAPSHOT_SERVICE_ACCOUNT`, a read-only service account reached through Workload
Identity Federation with no stored key. Without them the build uses the committed snapshot.

## License

MIT. See `LICENSE`.

Built by Tem Revil, with Claude as coding assistant.
