# Handoff: Firebase security work (from a cloud Claude session)

Written for whoever picks this up next, including Claude running on the owner's computer. Delete this file once everything below is done.

## What happened

A cloud Claude Code session audited the Firebase rules and fixed what it found. The work is all in `main` already, in these commits:

| Commit | What it did |
|---|---|
| `4b0dfa4` | Visitors can no longer write `Settings/Canary`. The contact form and bookings go through two new callable functions, `submitContact` and `bookMeeting`, which check every field and rate-limit (site-wide plus per IP). `syncMeeting` is admin-only. Rules and storage were tightened. A daily `cleanupAttachments` job was added. |
| `160eaa4` | `bookMeeting` enforces the booking page's day rules. |
| `4d67794` | Slots are judged by the owner's real date: the visitor's timezone used to shift only the time of day. One shared rules file, `src/utils/bookingRules.ts`, is used by both the page and `bookMeeting`; the functions build copies it to `functions/src/booking.ts`. A booking that fails is refunded. Per-IP limits are 3 bookings and 10 attempts a day. |

**Tests.** All of these were run in the cloud session; the test scripts are not in the repo.
- Unit tests and a property test (168,687 checks that the page and the server agree).
- 55 security-rules tests and about 60 function tests, all in the emulator.
- Browser tests of `/book` and the contact form against the emulators.

**Branches.** `claude/firebase-rules-workflow-inf30h` was deleted after being merged.

## Not done yet: needs the owner's machine and Firebase login

**1. Deploy.** Pushing to `main` auto-deploys the site, so the live site may already be calling functions that don't exist yet. Until they're deployed, the contact form and bookings fail. Deploy the functions first, then the rules:
```
firebase login
firebase deploy --only functions --project temrevil1
firebase deploy --only firestore:rules,storage --project temrevil1
```
- `--only functions` deploys both codebases, `functions/` and `functions-meeting/`.
- Allow Cloud Scheduler if asked; `cleanupAttachments` needs it.
- `MEETING_SYNC_URL` must be set in Secret Manager. `bookMeeting` now reads it from the main codebase.

**2. App Check.** In the Firebase console, open App Check → APIs.
- Check that almost all requests show as verified.
- Then turn on **Enforce** for Cloud Firestore and Cloud Storage.
- The new callable functions already enforce it in code.

**3. Apps Script** (the script behind `MEETING_SYNC_URL`):
- Keep its web app URL private. Anyone who has it can change the calendar.
- `cancel` and `update` should act only on an exact event ID. They should never fall back to matching an event by name or email.

## Watch out

- **Merging `perf/home` into `main`.** It conflicts in `src/hooks/useMeetingBooking.ts`. **Do not take `perf/home`'s side of the submit code**: it calls `syncMeeting` and writes Canary directly, both of which are now refused, so every public booking would break. The resolution that was tested:
  - keep `perf/home`'s `loadFirebase()` and lazy imports;
  - submit through `bookMeeting` (`const [{ default: app }, { httpsCallable, getFunctions }] = await Promise.all([loadFirebase(), import('firebase/functions')])`);
  - return both `loaded` from `perf/home` and `daySlots` / `meetingTimeForVisitor` from `main`.
- **Remaining risks:**
  - If saving a booking fails *and* the automatic cancel also fails, an orphaned calendar invite remains. This is only logged.
  - Acknowledgement emails still go to whatever address a visitor enters. Rate limits and App Check bound this.
