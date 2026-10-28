import { onCall, HttpsError } from "firebase-functions/v2/https";
import { onDocumentWritten } from "firebase-functions/v2/firestore";
import { onSchedule } from "firebase-functions/v2/scheduler";
import admin from "firebase-admin";
import { defineSecret } from "firebase-functions/params";

admin.initializeApp();
const db = admin.firestore();

// ── Secrets (set via: firebase functions:secrets:set NAME) ────────────
// The email ones (SMTP_USER, RESEND_API_KEY) live in ./mail with the sender, and the
// Calendar script's URL (MEETING_SYNC_URL) is defined in ./mcp, which also uses it.

// LLM provider key for the dashboard assistant ("Spark"). Held server-side so it
// never ships in the public client bundle.
const llmApiKey = defineSecret("LLM_API_KEY");

// Remote MCP server (agentic portfolio access over OAuth) and its daily cleanup -
// defined in their own module and re-exported so `firebase deploy --only functions:mcp` works.
export { mcp, cleanupMcp } from "./mcp.js";
import { meetingSyncUrl } from "./mcp.js";
import { createTransporter, HELLO_EMAIL, resendKey, smtpUser } from "./mail.js";
import { escapeHtml as escHtml } from "./html.js";
import { clientIp } from "./geoip.js";
import {
  bookingRefusal, hostWallClock, hostZone, isUpcoming, meetingInstant, parseAvailability,
  MEETING_MS, type BookedSlot, type HostZone,
} from "./booking.js";
import { emailShell, SITE_URL } from "./emailShell.js";
import { handledProjectsMirror, sameMirror, type HandledProject } from "./handledProjects.js";
import { HOLD_MS, holdActive, holdIds, quota, readQuotas, refundQuotas, takeQuotas, RATE_LIMITS, type Quota } from "./limits.js";
import { callCalendar, readCreateReply, replySucceeded, MEET_LINK_RE } from "./calendar.js";
import { enqueueMail, jobId, retryFailed, MAIL_JOBS, type MailMessage } from "./outbox.js";
import {
  approxDocBytes, attachmentPath, futureSlots, greetingName, offsetLabel, replyPath,
  timeAtOffset, unrepliedCount, visitorOffset,
} from "./forms.js";

// Mail is delivered by the outbox (./outbox): every notification is a MailJobs
// document first, retried until it is sent and kept as `failed` if it never is.
export { sendMail, retryMail } from "./outbox.js";

// ── Shapes of the Firestore records these functions read ─────────────
interface EmailEntry {
  Name?: string;
  Email?: string;
  Number?: string;
  Message?: string;
  Whatsapp?: boolean;
  Timestamp?: string | number;
  "Files Attached"?: Array<{ url?: string; name?: string }>;
  RepliedAt?: number;
  /** false when the visitor's acknowledgement quota was used up at submission. */
  Ack?: boolean;
}
interface MeetingEntry {
  Name?: string;
  Email?: string;
  Date?: string;
  Time?: string;
  UserLocalTime?: string;
  UserTimezone?: number;
  MeetingLink?: string;
  "What For"?: string;
  Reason?: string;
  Ack?: boolean;
}
interface CanaryDoc {
  Emails?: Record<string, EmailEntry>;
  Meetings?: Record<string, MeetingEntry>;
}

const HOUR_MS = 3_600_000;
const DAY_MS = 86_400_000;
const CANARY = "Settings/Canary";
const AVAILABILITY = "Settings/Availability";
const BOOKED_SLOTS = "Settings/BookedSlots";

/** The project's default Storage bucket: the only one any stored link may point into. */
function ourBucket(): string {
  return admin.storage().bucket().name;
}

/**
 * Escape user-supplied strings used inside an HTML attribute (mailto:, href, etc).
 * Prevents attribute breakout without breaking URL protocols.
 */
function escAttr(v: unknown): string {
  if (v === null || v === undefined) return "";
  return String(v)
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

/**
 * Sanitize a string for use in an email subject / header.
 * Strips line breaks (prevents SMTP header injection) and clamps length.
 */
function escSubject(v: unknown): string {
  if (v === null || v === undefined) return "";
  return String(v).replace(/[\r\n]+/g, " ").trim().slice(0, 200);
}

/** Basic sanity check so we never try to email obvious junk addresses. */
const GUEST_EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/** Label/value rows for a mail body. Values are HTML: escape anything a visitor typed. */
function infoRows(rows: Array<[string, string]>): string {
  return rows.map(([label, value], i) => `
            <div class="info-row"${i === rows.length - 1 ? ' style="border:none"' : ""}>
              <div class="info-label">${escHtml(label)}</div>
              <div class="info-value">${value}</div>
            </div>`).join("");
}

/** The owner's own inbox, plus the public hello@ inbox when that is a different one. */
function ownerInboxes(): { to: string; cc?: string } {
  const owner = smtpUser.value();
  return { to: owner, cc: owner.toLowerCase() === HELLO_EMAIL ? undefined : HELLO_EMAIL };
}

/** The owner's clock, from Settings/Availability (a zone name, else the fixed offset). */
async function readHostZone(): Promise<HostZone> {
  return hostZone((await db.doc(AVAILABILITY).get()).data());
}

/** "27/10/2026 at 02:15 PM (Europe/Istanbul)": an instant on the owner's clock. */
function hostTime(instantMs: number, zone: HostZone): string {
  const w = hostWallClock(instantMs, zone);
  return `${w.date} at ${w.time} (${typeof zone === "string" ? zone : offsetLabel(zone)})`;
}

/**
 * The single admin gate for every callable in this file: the `admin` custom claim,
 * which `scripts/set-admin.mjs` sets and the Firestore and Storage rules check too.
 * Nothing else counts, so the functions and the rules can never disagree on who the
 * owner is.
 */
async function requireAdmin(
  auth: { uid: string; token?: Record<string, unknown> } | undefined,
  denial: string,
): Promise<void> {
  if (!auth) throw new HttpsError("unauthenticated", "Sign in required.");
  if (auth.token?.admin !== true) throw new HttpsError("permission-denied", denial);
}

/**
 * An acknowledgement to the address a visitor typed. It carries no text the visitor
 * wrote: anyone can type a stranger's address, so the only visitor field used is the
 * name, and only when it is plainly a name (greetingName); otherwise "Hi there". Rows
 * and the button are server-built.
 */
function guestAckMail(to: string, entryName: unknown, heading: string, intro: string,
  rows: Array<[string, string]>, ctaHtml: string, label: string): MailMessage {
  const name = greetingName(entryName);
  return {
    to,
    subject: heading,
    fromName: "Revil",
    replyTo: HELLO_EMAIL,
    label,
    html: emailShell({
      title: heading,
      preheader: "Thanks - I'll get back to you within 24 hours.",
      bodyHtml: `
          <h2>${escHtml(heading)}</h2>
          <p>Hi ${escHtml(name || "there")},</p>
          <p>${intro}</p>
          ${rows.length ? `<div class="divider"></div><div>${infoRows(rows)}</div>` : ""}
          ${ctaHtml}
          <div class="divider"></div>
          <p>I'll personally get back to you within <strong>24 hours</strong>. If it's urgent, just reply to this email.</p>
          <p style="margin-top:16px">- Revil</p>
        `,
    }),
  };
}

/** Queue mail without letting a queueing failure undo the work that caused it. */
async function queue(id: string, mail: MailMessage): Promise<void> {
  try {
    await enqueueMail(id, mail);
  } catch (err) {
    console.error(`Could not queue mail ${id}:`, (err as Error)?.message);
  }
}

/**
 * Rebuilds the public busy-slot list from the current Settings/Canary, inside one
 * transaction. Reading Canary in the transaction is what makes it safe: a trigger run
 * for an older Canary write can't overwrite the list with what was true then, because
 * a newer Canary makes the transaction retry with the newer meetings. Only meetings
 * that have not ended are published, with Date and Time and nothing else.
 */
async function refreshBookedSlots(): Promise<void> {
  const canaryRef = db.doc(CANARY);
  const availRef = db.doc(AVAILABILITY);
  const slotsRef = db.doc(BOOKED_SLOTS);
  await db.runTransaction(async (tx) => {
    const [canary, avail, cur] = await Promise.all([tx.get(canaryRef), tx.get(availRef), tx.get(slotsRef)]);
    const slots = futureSlots((canary.data() as CanaryDoc | undefined)?.Meetings, hostZone(avail.data()), Date.now());
    if (cur.exists && JSON.stringify(cur.data()?.Slots) === JSON.stringify(slots)) return;
    tx.set(slotsRef, { Slots: slots, lastWrite: admin.firestore.FieldValue.serverTimestamp() });
  });
}

// =====================================================================
//  1. Visit recording - see ./analytics.ts
//     `trackSession` replaced the old `syncSession`, which merged every visit
//     through a link into one string field and was never actually App Check
//     enforced (onRequest ignores that option). syncSession is gone.
// =====================================================================
export { trackSession } from "./analytics.js";

// =====================================================================
//  2. notifyCanary - Firestore trigger on Settings/Canary
//     Queues the owner's notification and the visitor's acknowledgement for each
//     new message and meeting, removes a deleted message's uploads, and refreshes
//     the public busy-slot list.
//
//     Every mail is queued under an id made from the entry's key, and a job is
//     only ever created once, so a trigger that runs twice for one write can't
//     send anything twice.
// =====================================================================
export const notifyCanary = onDocumentWritten(
  {
    document: CANARY,
    region: "us-central1",
    secrets: [smtpUser],
  },
  async (event) => {
    const before = (event.data?.before?.data() || {}) as CanaryDoc;
    const after = (event.data?.after?.data() || {}) as CanaryDoc;
    const bucket = ourBucket();

    // ── Deleted messages: remove their uploads ─────────────────
    // Only paths that really are contact uploads (emails/<folder>/<file> in our
    // bucket). A hand-edited entry naming any other file - a site image - is skipped.
    const oldEmails = before.Emails || {};
    const newEmails = after.Emails || {};
    for (const key of Object.keys(oldEmails).filter((k) => !newEmails[k])) {
      for (const f of oldEmails[key]?.["Files Attached"] || []) {
        const path = attachmentPath(f?.url, bucket);
        if (!path) {
          if (f?.url) console.warn(`Message ${key}: skipped an attachment link outside emails/`);
          continue;
        }
        try {
          await admin.storage().bucket().file(path).delete({ ignoreNotFound: true });
        } catch (err) {
          console.error(`Failed to delete an attachment of message ${key}:`, (err as Error)?.message);
        }
      }
    }

    const owner = ownerInboxes();
    const zone = await readHostZone();

    // ── New messages ───────────────────────────────────────────
    for (const key of Object.keys(newEmails).filter((k) => !oldEmails[k])) {
      const e = newEmails[key];
      if (!e || !e.Name) continue;

      const sentAt = Number(new Date(e.Timestamp ?? NaN));
      const ts = Number.isFinite(sentAt) ? hostTime(sentAt, zone) : "Unknown";

      const files = e["Files Attached"] || [];
      const attachmentHtml = files.length
        ? `<div class="divider"></div>
             <p style="font-size:13px;margin-bottom:8px">ATTACHMENTS</p>
             ${files.map((f) => attachmentPath(f?.url, bucket)
                // An unverified URL is shown as plain text, never as a clickable link.
                ? `<p style="margin:4px 0"><a href="${escAttr(f.url)}" style="color:#3395ff;text-decoration:none">${escHtml(f.name)}</a></p>`
                : `<p style="margin:4px 0">${escHtml(f?.name)} <span style="font-size:12px">(link not verified - open from the dashboard)</span></p>`)
              .join("")}`
        : "";

      const safeName = escHtml(e.Name);
      const safeEmailAttr = escAttr(e.Email);
      await queue(jobId("contact-owner", key), {
        ...owner,
        fromName: "Revil Portfolio",
        replyTo: GUEST_EMAIL_RE.test(String(e.Email || "")) ? e.Email : undefined,
        subject: escSubject(`New message from ${e.Name}`),
        label: "Contact notification",
        html: emailShell({
          title: "New Message Received",
          preheader: `${e.Name} sent you a message`,
          bodyHtml: `
          <h2>New Contact Message</h2>
          <p>You received a new message through your portfolio.</p>
          <div class="divider"></div>
          <div>${infoRows([
            ["From", safeName],
            ["Email", `<a href="mailto:${safeEmailAttr}" style="color:#3395ff;text-decoration:none">${escHtml(e.Email)}</a>`],
            ["Phone", `${escHtml(e.Number || "Not provided")} ${e.Whatsapp ? `<span class="badge badge-green">WhatsApp</span>` : ""}`],
            ["Time", escHtml(ts)],
          ])}</div>
          <div class="divider"></div>
          <p style="font-size:13px;margin-bottom:8px;text-transform:uppercase;letter-spacing:0.5px">MESSAGE</p>
          <div class="message-box">${escHtml(e.Message || "").replace(/\n/g, "<br/>")}</div>
          ${attachmentHtml}
          <div style="margin-top:24px;text-align:center">
            <a href="mailto:${safeEmailAttr}?subject=Re: Portfolio Contact" class="btn">Reply to ${safeName}</a>
          </div>
        `,
          footerHtml: `Sent from <a href="${SITE_URL}" style="color:#3395ff;text-decoration:none">temrevil.com</a> contact form`,
        }),
      });

      if (e.Ack !== false && GUEST_EMAIL_RE.test(String(e.Email || ""))) {
        await queue(jobId("contact-ack", key), guestAckMail(String(e.Email), e.Name,
          "I got your message",
          "Thanks for reaching out through my portfolio - your message has landed in my inbox.",
          [], "", "Contact acknowledgement"));
      }
    }

    // ── New meetings ───────────────────────────────────────────
    const oldMeetings = before.Meetings || {};
    const newMeetings = after.Meetings || {};
    for (const key of Object.keys(newMeetings).filter((k) => !oldMeetings[k])) {
      const m = newMeetings[key];
      if (!m || !m.Name) continue;

      const meetLink = typeof m.MeetingLink === "string" && MEET_LINK_RE.test(m.MeetingLink) ? m.MeetingLink : null;
      const meetButton = meetLink
        ? `<div style="margin-top:24px;text-align:center"><a href="${escAttr(meetLink)}" class="btn">Join Google Meet</a></div>`
        : "";
      const at = meetingInstant(m, zone);
      const guestOffset = visitorOffset(m.UserTimezone);
      const ownerWhen = at === null ? `${m.Date || ""} ${m.Time || ""}`.trim() : hostTime(at, zone);
      const guestWhen = at !== null && guestOffset !== null ? timeAtOffset(at, guestOffset) : null;

      const mName = escHtml(m.Name);
      await queue(jobId("meeting-owner", key), {
        // The meeting notice goes to both inboxes as recipients, not as a copy.
        to: owner.cc ? [owner.to, owner.cc] : owner.to,
        fromName: "Revil Portfolio",
        replyTo: GUEST_EMAIL_RE.test(String(m.Email || "")) ? m.Email : undefined,
        subject: escSubject(`Meeting booked: ${m.Name} on ${m.Date} at ${m.Time}`),
        label: "Booking notification",
        html: emailShell({
          title: "New Meeting Booked",
          preheader: `${m.Name} booked a meeting on ${m.Date}`,
          bodyHtml: `
          <h2>New Meeting Booked</h2>
          <p>Someone scheduled a meeting through your portfolio.</p>
          <div class="divider"></div>
          <div>${infoRows([
            ["Guest", mName],
            ["Email", `<a href="mailto:${escAttr(m.Email)}" style="color:#3395ff;text-decoration:none">${escHtml(m.Email)}</a>`],
            ["Your time", `<span class="badge badge-blue">${escHtml(ownerWhen)}</span>`],
            ...(guestWhen ? [["Guest time", escHtml(guestWhen)] as [string, string]] : []),
            ["Reason", escHtml(m["What For"] || m.Reason || "Not specified")],
          ])}</div>
          ${meetButton}
        `,
          footerHtml: `Sent from <a href="${SITE_URL}" style="color:#3395ff;text-decoration:none">temrevil.com</a> meeting system`,
        }),
      });

      if (m.Ack !== false && GUEST_EMAIL_RE.test(String(m.Email || ""))) {
        // The time is computed from the booked instant on the guest's own clock, not
        // copied from anything the browser sent.
        await queue(jobId("meeting-ack", key), guestAckMail(String(m.Email), m.Name,
          "Your call is booked",
          "Thanks for booking a call - it's on my calendar.",
          [["When", escHtml(guestWhen || ownerWhen)]], meetButton, "Booking acknowledgement"));
      }
    }

    // ── Public busy slots ──────────────────────────────────────
    // Settings/Canary is admin-read-only (visitor details, Meet links); the public
    // calendar reads Settings/BookedSlots instead. Writing that doc does not
    // re-trigger this function, so there is no loop.
    try {
      await refreshBookedSlots();
    } catch (err) {
      console.error("Failed to refresh booked slots:", (err as Error)?.message);
    }
  },
);

// =====================================================================
//  2b. Public submissions - submitContact, bookMeeting
//
//  Visitors have NO write access to Settings/Canary: they call these functions,
//  which validate every field, rate-limit per visitor IP and per email address
//  (./limits - there is no site-wide lock, so one sender can't block everyone),
//  and write through the Admin SDK. notifyCanary then queues the emails.
// =====================================================================

/** Messages the owner hasn't replied to. Replied ones stop counting. */
const CONTACT_INBOX_CAP = 50;
/** The owner is warned once a day when unreplied messages reach this. */
const CONTACT_INBOX_WARN = 40;
/** Upcoming meetings: past ones never count. */
const MEETINGS_CAP = 100;
/** Settings/Canary is one document (1 MiB max): stop taking new entries well before. */
const CANARY_MAX_BYTES = 800_000;
const CANARY_WARN_BYTES = 600_000;
const MAX_ATTACHMENTS = 5;
const CUSTOM_GRID_MS = 15 * 60_000;

const FULL_INBOX = `The inbox is full right now - please email ${HELLO_EMAIL} directly.`;

/** The caller's address, as the rate limits see it. */
function callerIp(raw: { headers: Record<string, string | string[] | undefined>; ip?: string }): string {
  return clientIp(raw.headers, raw.ip) || "unknown";
}

/**
 * Acknowledgements to a typed address: at most 2 a day to one address and 3 a day
 * caused by one IP. Past that the submission still goes through; it just gets no ack.
 */
function ackQuotas(email: string, ip: string): Quota[] {
  return [
    quota("ack-to", email, 2, DAY_MS, ""),
    quota("ack-ip", ip, 3, DAY_MS, ""),
  ];
}

/** A trimmed string of at most `max` characters, or a clear invalid-argument error. */
function textField(v: unknown, label: string, max: number, required: boolean): string {
  if (v === undefined || v === null || v === "") {
    if (required) throw new HttpsError("invalid-argument", `${label} is required.`);
    return "";
  }
  if (typeof v !== "string") throw new HttpsError("invalid-argument", `${label} must be text.`);
  const s = v.trim();
  if (required && !s) throw new HttpsError("invalid-argument", `${label} is required.`);
  if (s.length > max) throw new HttpsError("invalid-argument", `${label} is too long (max ${max} characters).`);
  return s;
}

function emailField(v: unknown): string {
  const s = textField(v, "Email", 254, true);
  if (!GUEST_EMAIL_RE.test(s)) throw new HttpsError("invalid-argument", "Please enter a valid email address.");
  return s;
}

/** Same key shape the site always used for Emails/Meetings map entries. */
function entryId(): string {
  return `${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

async function attachmentsField(v: unknown): Promise<Array<{ name: string; url: string }>> {
  if (v === undefined || v === null) return [];
  if (!Array.isArray(v)) throw new HttpsError("invalid-argument", "Attachments must be a list.");
  if (v.length > MAX_ATTACHMENTS) throw new HttpsError("invalid-argument", `At most ${MAX_ATTACHMENTS} attachments.`);
  const bucket = ourBucket();
  const out: Array<{ name: string; url: string }> = [];
  for (const f of v) {
    const file = (f || {}) as { name?: unknown; url?: unknown };
    const name = textField(file.name, "Attachment name", 200, true);
    const path = attachmentPath(file.url, bucket);
    if (!path) throw new HttpsError("invalid-argument", "An attachment link is not valid.");
    const [exists] = await admin.storage().bucket().file(path).exists();
    if (!exists) throw new HttpsError("invalid-argument", "An attachment is missing - please attach it again.");
    out.push({ name, url: String(file.url) });
  }
  return out;
}

/** Warn the owner, once a day, that the inbox document is filling up. */
async function warnInboxFilling(unreplied: number, bytes: number): Promise<void> {
  if (unreplied < CONTACT_INBOX_WARN && bytes < CANARY_WARN_BYTES) return;
  const day = new Date().toISOString().slice(0, 10);
  await queue(jobId("inbox-filling", day), {
    to: smtpUser.value(),
    fromName: "Revil Portfolio",
    subject: "Your portfolio inbox is nearly full",
    label: "Inbox nearly full",
    html: emailShell({
      title: "Inbox nearly full",
      bodyHtml: `
          <h2>Your inbox is nearly full</h2>
          <p>The contact form stops taking messages at ${CONTACT_INBOX_CAP} unreplied messages, or when the inbox record nears its storage limit. Reply to or delete a few messages in the dashboard to keep it open.</p>
          <div class="divider"></div>
          <div>${infoRows([
            ["Unreplied", `${unreplied} of ${CONTACT_INBOX_CAP}`],
            ["Storage", `${Math.round((bytes / CANARY_MAX_BYTES) * 100)}% of the limit`],
          ])}</div>
        `,
    }),
  });
}

export const submitContact = onCall(
  { region: "us-central1", enforceAppCheck: true, secrets: [smtpUser] },
  async (request) => {
    const d = (request.data || {}) as Record<string, unknown>;
    const entry: EmailEntry = {
      Name: textField(d.name, "Name", 100, true),
      Email: emailField(d.email),
      "Files Attached": await attachmentsField(d.files),
      Message: textField(d.message, "Message", 5000, true),
      Number: textField(d.number, "Phone number", 40, false),
      Whatsapp: d.whatsapp === true,
      Timestamp: Date.now(),
    };
    const ip = callerIp(request.rawRequest);
    const quotas = [
      quota("contact-ip-hour", ip, 3, HOUR_MS, "You've sent a few messages already - please try again in an hour."),
      quota("contact-ip-day", ip, 10, DAY_MS, `You've sent a lot of messages today - please email ${HELLO_EMAIL} instead.`),
      quota("contact-email", entry.Email!, 3, DAY_MS, `This address has sent a few messages today - please email ${HELLO_EMAIL} instead.`),
    ];
    const acks = ackQuotas(entry.Email!, ip);
    const canaryRef = db.doc(CANARY);

    const load = await db.runTransaction(async (tx) => {
      const [canary, snaps] = await Promise.all([tx.get(canaryRef), readQuotas(tx, db, [...quotas, ...acks])]);
      const data = (canary.data() || {}) as CanaryDoc;
      const unreplied = unrepliedCount(data.Emails);
      const row = { ...entry };
      const bytes = approxDocBytes(data) + approxDocBytes(row);
      if (unreplied >= CONTACT_INBOX_CAP || bytes > CANARY_MAX_BYTES) {
        throw new HttpsError("resource-exhausted", FULL_INBOX);
      }
      const now = Date.now();
      const used = takeQuotas(tx, db, quotas, snaps.slice(0, quotas.length), now);
      if (used) throw new HttpsError("resource-exhausted", used.message);
      if (takeQuotas(tx, db, acks, snaps.slice(quotas.length), now)) row.Ack = false;
      tx.set(canaryRef, { Emails: { [entryId()]: row } }, { merge: true });
      return { unreplied: unreplied + 1, bytes };
    });
    await warnInboxFilling(load.unreplied, load.bytes);
    return { ok: true };
  },
);

/** Tell the owner about a booking whose Calendar state could not be confirmed. */
async function alertUnconfirmedBooking(requestId: string, what: string, email: string, startMs: number, zone: HostZone): Promise<void> {
  await queue(jobId("booking-check", requestId), {
    to: smtpUser.value(),
    fromName: "Revil Portfolio",
    subject: "A booking needs checking in your calendar",
    label: "Booking needs checking",
    html: emailShell({
      title: "Booking needs checking",
      bodyHtml: `
          <h2>A booking needs checking</h2>
          <p>${escHtml(what)} The visitor was told the booking did not go through. Check your calendar for an event at this time and remove it if it is there.</p>
          <div class="divider"></div>
          <div>${infoRows([
            ["Guest email", escHtml(email)],
            ["Time", escHtml(hostTime(startMs, zone))],
            ["Request", `<code>${escHtml(requestId)}</code>`],
          ])}</div>
        `,
    }),
  });
}

/**
 * Public booking. Validates the request, reserves the time, creates the Calendar event
 * (with Meet link) and records the meeting in Canary.
 *
 * Only an explicit success from the Calendar script with a usable event id counts
 * (./calendar). A refusal is passed on as a plain message; anything else - a timeout,
 * an unreadable reply - may or may not have made an event, so it is cancelled (by the
 * request id, guest email and time) and the owner is told to check, and the visitor
 * gets a generic answer. If recording fails the event is cancelled too, so there is
 * never an invite for a time the public calendar does not show as taken.
 */
export const bookMeeting = onCall(
  { region: "us-central1", enforceAppCheck: true, secrets: [meetingSyncUrl, smtpUser], timeoutSeconds: 120 },
  async (request) => {
    const d = (request.data || {}) as Record<string, unknown>;
    const name = textField(d.name, "Name", 100, true);
    const email = emailField(d.email);
    const reason = textField(d.reason, "Reason", 1000, false);
    const userLocalTime = textField(d.userLocalTime, "Local time", 20, false);
    const userTimezone = visitorOffset(d.userTimezone) ?? 0;
    const via = d.via === "book" ? "book" : "contact";

    const startMs = new Date(typeof d.startTime === "string" ? d.startTime : NaN).getTime();
    if (Number.isNaN(startMs)) throw new HttpsError("invalid-argument", "Invalid meeting time.");
    const startTime = new Date(startMs).toISOString();
    const endTime = new Date(startMs + MEETING_MS).toISOString();

    const availability = (await db.doc(AVAILABILITY).get()).data() || {};
    const cfg = parseAvailability(availability);
    const zone = hostZone(availability);
    const host = hostWallClock(startMs, zone);
    const ip = callerIp(request.rawRequest);
    const canaryRef = db.doc(CANARY);
    const requestId = entryId();

    // Refunded when the booking does not happen; the attempts quota is not.
    const bookings = [
      quota("booking-ip", ip, 3, DAY_MS, "You've booked a few calls today already - please try again tomorrow."),
      quota("booking-email", email, 2, DAY_MS, `This email has a few calls booked today already - please email ${HELLO_EMAIL}.`),
    ];
    const attempts = [quota("booking-tries", ip, 10, DAY_MS, `Too many attempts today - please email ${HELLO_EMAIL} instead.`)];
    const acks = ackQuotas(email, ip);
    const holdRefs = holdIds(startMs, MEETING_MS, CUSTOM_GRID_MS).map((id) => db.collection(RATE_LIMITS).doc(id));
    const ownHold = db.collection(RATE_LIMITS).doc(`hold_${startMs}`);

    // 1. Reserve: the time is free and allowed, under the cap, not rate limited.
    const now = Date.now();
    let ackAllowed = true;
    await db.runTransaction(async (tx) => {
      const counted = [...bookings, ...attempts];
      const [canary, snaps, holds] = await Promise.all([
        tx.get(canaryRef),
        readQuotas(tx, db, [...counted, ...acks]),
        Promise.all(holdRefs.map((r) => tx.get(r))),
      ]);
      const data = (canary.data() || {}) as CanaryDoc;
      const meetings: BookedSlot[] = Object.values(data.Meetings || {}).filter(Boolean);
      if (meetings.filter((m) => isUpcoming(m, zone, now)).length >= MEETINGS_CAP) {
        throw new HttpsError("resource-exhausted", `Bookings are full right now - please email ${HELLO_EMAIL}.`);
      }
      if (approxDocBytes(data) > CANARY_MAX_BYTES) {
        throw new HttpsError("resource-exhausted", `Bookings are full right now - please email ${HELLO_EMAIL}.`);
      }
      // The same day, time and overlap rules the booking calendar draws from
      // (booking.ts, generated from src/utils/bookingRules.ts).
      const refusal = bookingRefusal(startMs, { nowMs: now, userTimezone, hostOffset: zone, cfg, meetings });
      if (refusal) throw new HttpsError("failed-precondition", refusal);
      if (holds.some((h) => holdActive(h.data(), now))) {
        throw new HttpsError("already-exists", "That time slot is no longer available. Please pick another.");
      }
      const used = takeQuotas(tx, db, counted, snaps.slice(0, counted.length), now);
      if (used) throw new HttpsError("resource-exhausted", used.message);
      ackAllowed = !takeQuotas(tx, db, acks, snaps.slice(counted.length), now);
      tx.set(ownHold, { expiresAt: new Date(now + HOLD_MS) });
    });
    const dropHold = () => ownHold.delete().catch(() => undefined);
    const release = async () => {
      await refundQuotas(db, bookings, now);
      await dropHold();
    };

    const url = (meetingSyncUrl.value() || "").trim();
    if (!url) {
      await release();
      console.error("bookMeeting: MEETING_SYNC_URL is not set");
      throw new HttpsError("failed-precondition", `Booking is unavailable right now - please email ${HELLO_EMAIL}.`);
    }

    // 2. Calendar event + Meet link. The invite reaches the address the visitor typed,
    // so it carries no free text from them: the name only when it is plainly a name,
    // and no reason (the owner reads that in the dashboard and the notification).
    const calendarName = greetingName(name) ?? "Guest";
    const reply = await callCalendar(url, { requestId, name: calendarName, email, reason: "", startTime, endTime });
    const outcome = readCreateReply(reply);
    if (outcome.kind === "refused") {
      await release();
      console.warn("bookMeeting: the Calendar script refused the booking", { requestId });
      throw outcome.invalidEmail
        ? new HttpsError("invalid-argument", "Invalid Email Address provided.")
        : new HttpsError("internal", "Could not book meeting");
    }
    if (outcome.kind === "unknown") {
      await release();
      console.error("bookMeeting: Calendar reply not confirmed", { requestId, httpStatus: reply.httpStatus });
      const cancel = await callCalendar(url, { action: "cancel", requestId, email, name: calendarName, startTime });
      await alertUnconfirmedBooking(requestId,
        replySucceeded(cancel)
          ? "The calendar did not confirm a booking, so a cancel was sent for it."
          : "The calendar did not confirm a booking, and the cancel sent for it was not confirmed either.",
        email, startMs, zone);
      throw new HttpsError("unavailable", `The booking couldn't be confirmed - please email ${HELLO_EMAIL} and I'll sort it out.`);
    }

    // 3. Record it (notifyCanary queues the emails and refreshes BookedSlots).
    try {
      const entry: MeetingEntry & Record<string, unknown> = {
        Date: host.date,
        Time: host.time,
        UserLocalTime: userLocalTime,
        UserTimezone: userTimezone,
        Email: email,
        "What For": reason,
        Name: name,
        timestamp: Date.now(),
        MeetingLink: outcome.link,
        GoogleEventId: outcome.id,
        Via: via,
        ...(ackAllowed ? {} : { Ack: false }),
      };
      await canaryRef.set({ Meetings: { [requestId]: entry } }, { merge: true });
    } catch (err) {
      console.error("bookMeeting: recording failed, cancelling the event:", (err as Error)?.message);
      const cancel = await callCalendar(url, { action: "cancel", eventId: outcome.id, requestId, email, name: calendarName, startTime });
      if (!replySucceeded(cancel)) {
        await alertUnconfirmedBooking(requestId,
          "A booking was made in the calendar but could not be recorded, and cancelling it was not confirmed.",
          email, startMs, zone);
      }
      await release();
      throw new HttpsError("internal", "Could not book meeting");
    }
    await dropHold();
    return { link: outcome.link };
  },
);

// =====================================================================
//  2c. syncMeeting - admin-only: create, update or cancel a Calendar event from
//      the dashboard's meeting editor (D-Canary). Moved here from the separate
//      `functions-meeting` codebase; same name, region, request and reply.
//      The payload carries guest details, so it is never logged; neither is the
//      script's URL (a credential) or its raw errors.
// =====================================================================
const SYNC_ACTIONS = new Set(["create", "update", "cancel"]);

export const syncMeeting = onCall(
  { region: "us-central1", enforceAppCheck: true, secrets: [meetingSyncUrl], maxInstances: 10, timeoutSeconds: 60 },
  async (request) => {
    await requireAdmin(request.auth, "Admin only.");
    const payload = request.data;
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
      throw new HttpsError("invalid-argument", "Missing meeting details.");
    }
    const action = (payload as { action?: unknown }).action ?? "create";
    if (typeof action !== "string" || !SYNC_ACTIONS.has(action)) {
      throw new HttpsError("invalid-argument", "Unknown meeting action.");
    }
    if (JSON.stringify(payload).length > 20_000) throw new HttpsError("invalid-argument", "Meeting details are too large.");

    const url = (meetingSyncUrl.value() || "").trim();
    if (!url) {
      console.error("syncMeeting: MEETING_SYNC_URL is not set");
      throw new HttpsError("failed-precondition", "Meeting sync is not configured.");
    }

    const reply = await callCalendar(url, payload as Record<string, unknown>);
    const body = reply.body as Record<string, unknown> | null;
    if (body && body.status === "error") {
      console.warn("syncMeeting: the Calendar script refused", { action });
      throw /invalid attendee email/i.test(String(body.message || ""))
        ? new HttpsError("invalid-argument", "Invalid attendee email.")
        : new HttpsError("internal", "The calendar refused the change.");
    }
    const ok = action === "create" ? readCreateReply(reply).kind === "created" : replySucceeded(reply);
    if (!ok) {
      console.error("syncMeeting: Calendar reply not confirmed", { action, httpStatus: reply.httpStatus });
      throw new HttpsError("unavailable", "The calendar didn't confirm the change - check it before trying again.");
    }
    return body;
  },
);

// =====================================================================
//  2c-ii. retryMailJob - admin-only: put a failed MailJobs entry back in the queue
//          and try it at once. The job's recipient and content are never taken from
//          the caller - only its id - so this can only resend what the functions
//          queued. MailJobs is read-only to every client (firestore.rules).
// =====================================================================
export const retryMailJob = onCall(
  { region: "us-central1", enforceAppCheck: true, secrets: [resendKey] },
  async (request) => {
    await requireAdmin(request.auth, "Admin only.");
    const id = (request.data as { id?: unknown } | undefined)?.id;
    if (typeof id !== "string" || !/^[A-Za-z0-9_-]{1,200}$/.test(id)) {
      throw new HttpsError("invalid-argument", "A mail job id is required.");
    }
    const status = await retryFailed(id);
    if (!status) throw new HttpsError("failed-precondition", "Only a failed mail job can be retried.");
    return { status };
  },
);
// =====================================================================
//  2d. mirrorHandledProjects - keeps the PUBLIC Settings/HandledProjects (the
//      homepage's "projects I handle") in step with the private Treasury/projects,
//      whoever wrote it: the dashboard, Spark or the MCP tools. Only name, status
//      and position are published (./handledProjects holds the one projection).
// =====================================================================
export const mirrorHandledProjects = onDocumentWritten(
  { document: "Treasury/projects", region: "us-central1" },
  async () => {
    const srcRef = db.doc("Treasury/projects");
    const outRef = db.doc("Settings/HandledProjects");
    // Read the source inside the transaction, so a run for an older write can't
    // publish an older list over a newer one.
    await db.runTransaction(async (tx) => {
      const [src, out] = await Promise.all([tx.get(srcRef), tx.get(outRef)]);
      const next = handledProjectsMirror(src.data()?.entries);
      const prev = out.data()?.projects as Record<string, HandledProject> | undefined;
      const clean = !!prev && typeof prev === "object" && Object.keys(out.data() || {}).every((k) => k === "projects" || k === "lastWrite")
        && Object.values(prev).every((p) => !!p && typeof p === "object" && Object.keys(p).length === 3);
      if (clean && sameMirror(prev!, next)) return;
      // Replaces the whole doc, so any field an older build published is dropped.
      tx.set(outRef, { projects: next, lastWrite: admin.firestore.FieldValue.serverTimestamp() });
    });
  },
);

// =====================================================================
//  2e. cleanupAttachments - the daily sweep:
//      - contact uploads (emails/) no message points to, once a day old: Storage
//        rules can't count uploads, so this stops emails/ becoming free hosting;
//      - reply uploads (replies/) a day old: sendReply removes them once sent,
//        this catches replies that were never sent;
//      - rate-limit documents whose window has passed, and the two site-wide
//        lock documents the old limits used;
//      - delivered mail jobs older than 30 days (failed ones stay for the owner);
//      - the public busy-slot list, so meetings that ended drop off it.
// =====================================================================
async function deleteOldUploads(prefix: string, keep: Set<string>, cutoff: number): Promise<number> {
  const [files] = await admin.storage().bucket().getFiles({ prefix });
  let deleted = 0;
  for (const file of files) {
    if (keep.has(file.name)) continue;
    const created = Date.parse(String(file.metadata?.timeCreated || ""));
    if (!Number.isFinite(created) || created > cutoff) continue;
    try {
      await file.delete();
      deleted++;
    } catch (err) {
      console.error("Failed to delete an old upload:", (err as Error)?.message);
    }
  }
  return deleted;
}

async function deleteMatching(query: FirebaseFirestore.Query): Promise<number> {
  let deleted = 0;
  for (;;) {
    const snap = await query.limit(400).get();
    if (snap.empty) return deleted;
    const batch = db.batch();
    snap.docs.forEach((doc) => batch.delete(doc.ref));
    await batch.commit();
    deleted += snap.size;
    if (snap.size < 400) return deleted;
  }
}

export const cleanupAttachments = onSchedule(
  { schedule: "every day 04:00", timeZone: "Etc/UTC", region: "us-central1" },
  async () => {
    const now = Date.now();
    const cutoff = now - DAY_MS;
    const bucket = ourBucket();

    const canary = (await db.doc(CANARY).get()).data() as CanaryDoc | undefined;
    const keep = new Set<string>();
    for (const e of Object.values(canary?.Emails || {})) {
      for (const f of e?.["Files Attached"] || []) {
        const path = attachmentPath(f?.url, bucket);
        if (path) keep.add(path);
      }
    }
    const steps: Array<[string, () => Promise<number | void>]> = [
      ["orphaned contact uploads", () => deleteOldUploads("emails/", keep, cutoff)],
      ["old reply uploads", () => deleteOldUploads("replies/", new Set(), cutoff)],
      ["expired rate limits", () => deleteMatching(db.collection(RATE_LIMITS).where("expiresAt", "<", new Date(now)))],
      ["legacy site-wide locks", async () => {
        await Promise.all(["contact", "meeting"].map((id) => db.collection(RATE_LIMITS).doc(id).delete()));
      }],
      ["delivered mail older than 30 days", () => deleteMatching(db.collection(MAIL_JOBS).where("sentAt", "<", now - 30 * DAY_MS))],
      ["busy-slot refresh", () => refreshBookedSlots()],
    ];
    for (const [label, step] of steps) {
      try {
        const n = await step();
        console.log(`cleanupAttachments: ${label}${typeof n === "number" ? `: ${n}` : " done"}`);
      } catch (err) {
        console.error(`cleanupAttachments: ${label} failed:`, (err as Error)?.message);
      }
    }
  },
);

// =====================================================================
//  3. notifyLogin - Callable function triggered by dashboard on sign-in
//     Queues an email alert with date/time/device info. A sign-in by anyone
//     but the owner is refused here: the account is deleted (the page's own
//     client-side delete can fail and leave it behind) and the owner gets a
//     "blocked sign-in" alert, at most one per BLOCKED_ALERT_EVERY_MS so a
//     script can't flood the inbox (every attempt is still counted).
// =====================================================================
const BLOCKED_ALERT_EVERY_MS = 10 * 60 * 1000;

async function blockSignIn(auth: { uid: string; token?: Record<string, unknown> }, userAgent: unknown, ip: string): Promise<void> {
  const email = String(auth.token?.email || "Unknown");
  try {
    await admin.auth().deleteUser(auth.uid);
  } catch (err) {
    console.error("[notifyLogin] could not delete blocked account:", (err as Error)?.message);
  }
  const ref = db.doc("Security/blockedSignIns");
  const now = Date.now();
  const shouldAlert = await db.runTransaction(async (tx) => {
    const last = Number((await tx.get(ref)).data()?.lastAlertAt || 0);
    const alert = now - last >= BLOCKED_ALERT_EVERY_MS;
    tx.set(ref, {
      count: admin.firestore.FieldValue.increment(1),
      lastAttemptAt: now,
      lastEmail: email,
      ...(alert ? { lastAlertAt: now } : {}),
    }, { merge: true });
    return alert;
  });
  console.warn("[notifyLogin] blocked a non-admin sign-in", { alerted: shouldAlert });
  if (!shouldAlert) return;
  const when = hostTime(now, await readHostZone());
  await queue(jobId("blocked-sign-in", String(now)), {
    to: smtpUser.value(),
    fromName: "Revil Security",
    subject: escSubject(`Blocked sign-in: ${email}`),
    label: "Blocked sign-in",
    html: emailShell({
      title: "Blocked sign-in",
      preheader: `Someone who isn't you tried to sign in: ${email}`,
      bodyHtml: `
        <h2>Blocked sign-in</h2>
        <p>An account that isn't yours signed in on the admin page. It was refused and deleted; it never reached any private data.</p>
        <div class="divider"></div>
        <div>${infoRows([
          ["Account", escHtml(email)],
          ["When", escHtml(when)],
          ["IP Address", escHtml(ip)],
          ["Device", `<span style="font-size:13px">${escHtml(String(userAgent || "Unknown"))}</span>`],
        ])}</div>
        <div class="divider"></div>
        <p style="font-size:13px">Further attempts within 10 minutes are counted but not emailed.</p>
      `,
      footerHtml: `Security alert from <a href="${SITE_URL}" style="color:#3395ff;text-decoration:none">temrevil.com</a>`,
    }),
  });
}

export const notifyLogin = onCall(
  {
    region: "us-central1",
    secrets: [smtpUser],
    enforceAppCheck: true,
  },
  async (request) => {
    if (!request.auth) throw new HttpsError("unauthenticated", "Sign in required.");
    const auth = request.auth;
    const { userAgent, provider } = request.data || {};
    // The same client-IP rule the rate limits use. It is still caller-influenced
    // input (see geoip.ts), so it is escaped like any other field.
    const ip = clientIp(request.rawRequest.headers, request.rawRequest.ip) || "Unknown";
    // Only the owner may sign in - and the gate fails closed. Anyone else is removed.
    try {
      await requireAdmin(auth, "Access denied.");
    } catch {
      await blockSignIn(auth, userAgent, ip);
      throw new HttpsError("permission-denied", "Access denied - account not recognized.");
    }

    const now = Date.now();
    const when = hostTime(now, await readHostZone());
    await queue(jobId("login", auth.uid, String(now)), {
      to: smtpUser.value(),
      fromName: "Revil Security",
      subject: escSubject(`Login alert: ${when}`),
      label: "Login alert",
      html: emailShell({
        title: "Login Alert",
        preheader: `Sign-in detected ${when}`,
        bodyHtml: `
        <h2>Sign-In Detected</h2>
        <p>A sign-in to your portfolio admin was detected.</p>
        <div class="divider"></div>
        <div>${infoRows([
          ["Account", escHtml(auth.token?.email || "Unknown")],
          ["Provider", `<span class="badge badge-blue">${escHtml(provider || "google.com")}</span>`],
          ["When", escHtml(when)],
          ["IP Address", `<code>${escHtml(ip)}</code>`],
          ["Device", `<span style="font-size:13px">${escHtml(userAgent || "Unknown")}</span>`],
        ])}</div>
        <div class="divider"></div>
        <p style="font-size:13px">If this wasn't you, change your password immediately and review your account security.</p>
      `,
        footerHtml: `Security alert from <a href="${SITE_URL}" style="color:#3395ff;text-decoration:none">temrevil.com</a>`,
      }),
    });
    return { status: "queued" };
  },
);

// =====================================================================
//  3b. sendReceipt - admin-only: email a project receipt to a customer.
//      The dashboard builds the receipt HTML (same string it previews and
//      lets you download) and passes it here; this just verifies the caller
//      is the owner, validates, and sends it via Resend from hello@temrevil.com.
//      Emailing prebuilt HTML is safe because it's admin-only + App Check.
// =====================================================================
export const sendReceipt = onCall(
  {
    region: "us-central1",
    secrets: [smtpUser, resendKey],
    enforceAppCheck: true,
  },
  async (request) => {
    await requireAdmin(request.auth, "Only the portfolio owner can send receipts.");

    const { to, subject, html, meta } = (request.data || {}) as {
      to?: string; subject?: string; html?: string;
      meta?: { receiptNo?: string; currency?: string; total?: number; balance?: number; projectIds?: string[]; projectNames?: string[] };
    };
    const email = String(to || "").trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) {
      throw new HttpsError("invalid-argument", "A valid customer email is required.");
    }
    // Guard against an empty or absurdly large payload (it's built by the admin's
    // dashboard, but still worth a sane bound).
    if (typeof html !== "string" || html.length < 40 || html.length > 200000) {
      throw new HttpsError("invalid-argument", "Receipt content is missing or too large.");
    }

    try {
      const transporter = createTransporter();
      const owner = smtpUser.value();
      await transporter.sendMail({
        from: `"Tem Revil" <${HELLO_EMAIL}>`,
        to: email,
        // Keep the owner a silent copy of every receipt sent, unless they're the recipient.
        bcc: owner && owner.toLowerCase() !== email.toLowerCase() ? owner : undefined,
        replyTo: HELLO_EMAIL,
        subject: (subject ? String(subject).slice(0, 200) : "") || "Your receipt from Tem Revil",
        html,
      });
      console.log("Receipt emailed");

      // Log it to the sent-receipts history (best-effort; a logging failure must not
      // fail the send, which already went out).
      try {
        const id = `rcp_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
        await db.doc("Treasury/receipts").set({
          entries: {
            [id]: {
              receiptNo: meta?.receiptNo || "",
              to: email,
              sentAt: Date.now(),
              currency: meta?.currency || "USD",
              total: typeof meta?.total === "number" ? meta.total : 0,
              ...(typeof meta?.balance === "number" ? { balance: meta.balance } : {}),
              projectIds: Array.isArray(meta?.projectIds) ? meta.projectIds : [],
              projectNames: Array.isArray(meta?.projectNames) ? meta.projectNames : [],
              via: "dashboard",
            },
          },
          lastWrite: admin.firestore.FieldValue.serverTimestamp(),
        }, { merge: true });
      } catch (logErr) {
        console.error("Receipt sent but history log failed:", logErr);
      }

      return { status: "sent" };
    } catch (err) {
      console.error("Failed to send receipt:", err);
      throw new HttpsError("internal", "Failed to send the receipt email.");
    }
  },
);

// =====================================================================
//  3c. sendReply - admin-only: reply to a contact message from the
//      dashboard composer. The dashboard builds the branded HTML (the
//      same string it previews) and uploads any attachments to Storage
//      under replies/<folder>/; this verifies the caller is the owner,
//      reads those objects from our own bucket, sends the reply via
//      Resend from hello@temrevil.com (owner bcc'd), then deletes them.
// =====================================================================
export const sendReply = onCall(
  {
    region: "us-central1",
    secrets: [smtpUser, resendKey],
    enforceAppCheck: true,
    memory: "512MiB",
    timeoutSeconds: 120,
  },
  async (request) => {
    await requireAdmin(request.auth, "Only the portfolio owner can send replies.");

    const { to, subject, html, attachments } = (request.data || {}) as {
      to?: string; subject?: string; html?: string;
      attachments?: { name?: string; url?: string }[];
    };
    const email = String(to || "").trim();
    if (!GUEST_EMAIL_RE.test(email)) {
      throw new HttpsError("invalid-argument", "A valid recipient email is required.");
    }
    if (typeof html !== "string" || html.length < 40 || html.length > 200000) {
      throw new HttpsError("invalid-argument", "Reply content is missing or too large.");
    }

    // Read attachments straight from our own Storage bucket (the dashboard uploaded
    // them to replies/<folder>/). Restricting to that prefix means this can never be
    // steered into reading unrelated objects, and there's no external fetch (no SSRF).
    const MAX_FILES = 10;
    const MAX_TOTAL = 20 * 1024 * 1024;
    const mailAttachments: { filename: string; content: Buffer }[] = [];
    const uploaded: string[] = [];
    if (Array.isArray(attachments) && attachments.length) {
      if (attachments.length > MAX_FILES) {
        throw new HttpsError("invalid-argument", `At most ${MAX_FILES} attachments per reply.`);
      }
      const bucket = admin.storage().bucket();
      let total = 0;
      for (const a of attachments) {
        const path = replyPath(a?.url, bucket.name);
        if (!path) {
          throw new HttpsError("invalid-argument", "Invalid attachment reference.");
        }
        uploaded.push(path);
        try {
          const [buf] = await bucket.file(path).download();
          total += buf.length;
          if (total > MAX_TOTAL) {
            throw new HttpsError("invalid-argument", "Attachments exceed the 20 MB total limit.");
          }
          mailAttachments.push({
            filename: String(a?.name || path.split("/").pop() || "attachment"),
            content: buf,
          });
        } catch (err) {
          if (err instanceof HttpsError) throw err;
          console.error("Failed to read a reply attachment:", (err as Error)?.message);
          throw new HttpsError("internal", "Could not read one of the attachments.");
        }
      }
    }

    try {
      const transporter = createTransporter();
      const owner = smtpUser.value();
      await transporter.sendMail({
        from: `"Tem Revil" <${HELLO_EMAIL}>`,
        to: email,
        // Keep the owner a silent copy of every reply sent, unless they're the recipient.
        bcc: owner && owner.toLowerCase() !== email.toLowerCase() ? owner : undefined,
        replyTo: HELLO_EMAIL,
        subject: (subject ? String(subject).slice(0, 200) : "") || "Reply from Tem Revil",
        html,
        attachments: mailAttachments.length ? mailAttachments : undefined,
      });
      console.log(`Reply emailed (${mailAttachments.length} attachment(s))`);
      // The uploads were only the way into this one mail: they go once it is sent.
      // (The daily cleanup removes any left by a reply that never went out.)
      await Promise.all(uploaded.map((p) => admin.storage().bucket().file(p).delete({ ignoreNotFound: true })
        .catch((e) => console.error("Failed to remove a sent reply's upload:", (e as Error)?.message))));
      return { status: "sent" };
    } catch (err) {
      console.error("Failed to send reply:", err);
      throw new HttpsError("internal", "Failed to send the reply email.");
    }
  },
);

// =====================================================================
//  4. llm - admin-only proxy for the dashboard assistant ("Spark")
//     Holds the provider API key server-side (Secret Manager) so it never
//     ships in the public client bundle. The client sends the provider-native
//     request body; this function injects the key and forwards to the fixed
//     provider endpoint (no arbitrary URLs → no SSRF). App Check enforced.
// =====================================================================

/** Detect the provider from the server key's prefix (mirrors src/lib/llm.ts). */
function detectLlmProvider(key: string): "anthropic" | "gemini" | "openai" | null {
  if (!key) return null;
  if (key.startsWith("sk-ant")) return "anthropic";
  if (key.startsWith("AIza") || key.startsWith("AQ.")) return "gemini";
  if (key.startsWith("sk-")) return "openai";
  return null;
}

export const llm = onCall(
  {
    region: "us-central1",
    secrets: [llmApiKey],
    enforceAppCheck: true,
  },
  async (request) => {
    await requireAdmin(request.auth, "Admin only.");

    const key = (llmApiKey.value() || "").trim();
    const provider = detectLlmProvider(key);
    if (!provider) {
      throw new HttpsError("failed-precondition", "Server LLM key is not configured.");
    }

    const { kind, model, body } = request.data || {};

    // The client asks which provider the server key is, so it can build native
    // requests / parse responses without ever seeing the key.
    if (kind === "provider") return { provider };

    if (kind !== "models" && kind !== "chat") {
      throw new HttpsError("invalid-argument", "kind must be 'provider', 'models', or 'chat'.");
    }
    // model is interpolated into the Gemini URL path - allow only safe chars.
    if (kind === "chat" && (typeof model !== "string" || !/^[A-Za-z0-9.\-_]+$/.test(model))) {
      throw new HttpsError("invalid-argument", "Invalid model id.");
    }

    // Build the outbound request from a fixed host map (never a client-supplied URL).
    let url: string;
    let method = "GET";
    let headers: Record<string, string> = {};
    let reqBody: string | undefined;
    if (provider === "anthropic") {
      headers = { "x-api-key": key, "anthropic-version": "2023-06-01", "content-type": "application/json" };
      if (kind === "models") {
        url = "https://api.anthropic.com/v1/models?limit=100";
      } else {
        url = "https://api.anthropic.com/v1/messages";
        method = "POST";
        reqBody = JSON.stringify(body || {});
      }
    } else if (provider === "openai") {
      headers = { Authorization: `Bearer ${key}`, "content-type": "application/json" };
      if (kind === "models") {
        url = "https://api.openai.com/v1/models";
      } else {
        url = "https://api.openai.com/v1/chat/completions";
        method = "POST";
        reqBody = JSON.stringify(body || {});
      }
    } else {
      // gemini - key goes in the query string
      const enc = encodeURIComponent(key);
      if (kind === "models") {
        url = `https://generativelanguage.googleapis.com/v1beta/models?key=${enc}`;
      } else {
        url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${enc}`;
        method = "POST";
        headers = { "content-type": "application/json" };
        reqBody = JSON.stringify(body || {});
      }
    }

    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 60000);
    try {
      const r = await fetch(url, { method, headers, body: reqBody, signal: ctrl.signal });
      const text = await r.text();
      let data: unknown;
      try { data = JSON.parse(text); } catch { data = text; }
      // Pass the provider's status through so the client surfaces real errors.
      return { ok: r.ok, status: r.status, data };
    } catch (err) {
      console.error("llm proxy error:", err);
      throw new HttpsError("internal", "LLM request failed.");
    } finally {
      clearTimeout(timer);
    }
  },
);
