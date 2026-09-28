import { onCall, HttpsError } from "firebase-functions/v2/https";
import { onDocumentWritten } from "firebase-functions/v2/firestore";
import { onSchedule } from "firebase-functions/v2/scheduler";
import admin from "firebase-admin";
import { createHash } from "node:crypto";
import nodemailer, { type Transporter } from "nodemailer";
import { defineSecret } from "firebase-functions/params";

admin.initializeApp();
const db = admin.firestore();

// ── Secrets (set via: firebase functions:secrets:set SMTP_USER etc.) ──
const smtpUser = defineSecret("SMTP_USER");
// Outbound email now routes through Resend (temrevil.com is a verified Resend domain
// with aligned DKIM/SPF). The old Hostinger SMTP_PASS secret is no longer used.
const resendKey = defineSecret("RESEND_API_KEY");

// LLM provider key for the dashboard assistant ("Spark"). Held server-side so it
// never ships in the public client bundle. Set with:
//   firebase functions:secrets:set LLM_API_KEY
const llmApiKey = defineSecret("LLM_API_KEY");

// Public-facing inbox that booking notifications are also copied to.
const HELLO_EMAIL = "hello@temrevil.com";

// Remote MCP server (agentic portfolio access over OAuth) - defined in its own
// module and re-exported so `firebase deploy --only functions:mcp` works.
export { mcp } from "./mcp.js";
import { meetingSyncUrl } from "./mcp.js";
import { clientIp } from "./geoip.js";
import { bookingRefusal, isTaken, parseAvailability, utcOffsetHours, wallClock, DEFAULT_HOST_TZ } from "./booking.js";

// ── Shapes of the Firestore records these functions read ─────────────
interface EmailEntry {
  Name?: string;
  Email?: string;
  Number?: string;
  Message?: string;
  Whatsapp?: boolean;
  Timestamp?: string | number;
  "Files Attached"?: Array<{ url?: string; name?: string }>;
}
interface MeetingEntry {
  Name?: string;
  Email?: string;
  Date?: string;
  Time?: string;
  UserLocalTime?: string;
  MeetingLink?: string;
  "What For"?: string;
  Reason?: string;
}
interface CanaryDoc {
  Emails?: Record<string, EmailEntry>;
  Meetings?: Record<string, MeetingEntry>;
}

interface EmailTemplateArgs {
  title: string;
  preheader?: string;
  bodyHtml: string;
  footerNote?: string;
}
interface GuestAckArgs {
  to?: string;
  name?: string;
  heading: string;
  intro: string;
  detailRows?: Array<{ label: string; value: string }>;
  ctaHtml?: string;
}

/**
 * Escape user-supplied strings before interpolating into email HTML.
 * Prevents an attacker from injecting <img onerror=...> via Name/Email/Message.
 */
function escHtml(v: unknown): string {
  if (v === null || v === undefined) return "";
  return String(v)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * A contact-form attachment link is only trustworthy if it actually points at OUR
 * OWN bucket under `emails/`. The public form writes the `Files Attached` array
 * straight into Settings/Canary, so a visitor can name any URL there without
 * uploading anything - escAttr stops attribute breakout but says nothing about the
 * destination, which would put an attacker-chosen link in the owner's inbox.
 *
 * Checking the hostname is not enough on its own: `storage.googleapis.com` serves
 * every public GCS bucket there is, and `firebasestorage.googleapis.com` carries
 * the bucket inside the path, so an attacker's own bucket with an `emails/` folder
 * in it clears a host-only test. The bucket name is pinned here, and the object
 * path must START with `emails/` - the same shape of gate sendReply already applies
 * to `replies/` before it reads a file (it is safe there for a second reason: it
 * reads through the Admin SDK, which is scoped to our bucket whatever the URL said).
 *
 * Returns the URL when it is ours, null otherwise.
 */
function ourBucket(): string {
  return admin.storage().bucket().name;
}

function safeAttachmentUrl(v: unknown): string | null {
  if (typeof v !== "string" || !v) return null;
  let u: URL;
  try { u = new URL(v); } catch { return null; }
  if (u.protocol !== "https:") return null;

  let bucket: string | null = null;
  let objectPath: string | null = null;
  const segs = u.pathname.split("/").filter(Boolean).map((seg) => decodeURIComponent(seg));

  if (u.hostname === "firebasestorage.googleapis.com") {
    // /v0/b/<bucket>/o/<url-encoded object path>
    const i = u.pathname.indexOf("/o/");
    if (segs[0] !== "v0" || segs[1] !== "b" || !segs[2] || i === -1) return null;
    bucket = segs[2];
    objectPath = decodeURIComponent(u.pathname.slice(i + 3).split("?")[0]);
  } else if (u.hostname === "storage.googleapis.com") {
    // /<bucket>/<object path>
    if (segs.length < 2) return null;
    bucket = segs[0];
    objectPath = segs.slice(1).join("/");
  } else {
    return null;
  }

  if (bucket !== ourBucket()) return null;
  return objectPath.startsWith("emails/") ? v : null;
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

/**
 * Extract the storage path from a Firebase Storage download URL.
 * E.g. https://firebasestorage.googleapis.com/v0/b/.../o/emails%2F1781817458723_zmn0zb6%2Ffilename.jpg?alt=media...
 * returns "emails/1781817458723_zmn0zb6/filename.jpg".
 */
function getStoragePathFromUrl(url: string): string | null {
  try {
    const parts = url.split("/o/");
    if (parts.length < 2) return null;
    const pathPart = parts[1].split("?")[0];
    return decodeURIComponent(pathPart);
  } catch (err) {
    console.error("Failed to parse storage URL:", url, err);
    return null;
  }
}

/** Helper: create a reusable SMTP transporter (Resend relay). */
function createTransporter(): Transporter {
  // Resend's SMTP relay: the username is literally "resend", the password is the API
  // key. From addresses must be on a verified domain - we always send as HELLO_EMAIL.
  return nodemailer.createTransport({
    host: "smtp.resend.com",
    port: 465,
    secure: true,
    auth: {
      user: "resend",
      pass: resendKey.value(),
    },
  });
}

// ── Branded Email Template ─────────────────────────────────────────
function emailTemplate({ title, preheader, bodyHtml, footerNote }: EmailTemplateArgs): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<meta name="color-scheme" content="dark"/>
<meta name="supported-color-schemes" content="dark"/>
<title>${title}</title>
<!--[if mso]><style>body,table,td{font-family:Arial,sans-serif!important}</style><![endif]-->
<style>
  body{margin:0;padding:0;background:#0a0a0a;color:#e0e0e0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif}
  .wrapper{max-width:600px;margin:0 auto;padding:40px 20px}
  .card{background:#141414;border:1px solid #222;border-radius:16px;overflow:hidden}
  .header{padding:32px 32px 24px;border-bottom:1px solid #222;text-align:center}
  .logo{font-size:24px;font-weight:800;color:#ffffff;letter-spacing:-0.5px}
  .logo span{color:#3395ff}
  .body{padding:32px}
  .body h2{margin:0 0 16px;font-size:20px;font-weight:700;color:#ffffff}
  .body p{margin:0 0 12px;font-size:15px;line-height:1.6;color:#b0b0b0}
  .info-row{display:flex;padding:12px 0;border-bottom:1px solid #1a1a1a}
  .info-label{font-size:13px;font-weight:600;color:#666;width:110px;flex-shrink:0;text-transform:uppercase;letter-spacing:0.5px}
  .info-value{font-size:15px;color:#e0e0e0;word-break:break-word}
  .badge{display:inline-block;padding:4px 12px;border-radius:20px;font-size:12px;font-weight:600}
  .badge-blue{background:rgba(51,149,255,0.15);color:#3395ff}
  .badge-green{background:rgba(16,185,129,0.15);color:#10b981}
  .badge-orange{background:rgba(245,158,11,0.15);color:#f59e0b}
  .message-box{background:#1a1a1a;border:1px solid #222;border-radius:12px;padding:20px;margin:16px 0;font-size:15px;line-height:1.7;color:#d0d0d0}
  .btn{display:inline-block;padding:12px 28px;background:#3395ff;color:#ffffff;text-decoration:none;border-radius:10px;font-weight:600;font-size:14px}
  .footer{padding:24px 32px;border-top:1px solid #222;text-align:center}
  .footer p{margin:0;font-size:12px;color:#555}
  .footer a{color:#3395ff;text-decoration:none}
  .divider{height:1px;background:#222;margin:20px 0}
  .preheader{display:none;font-size:1px;color:#0a0a0a;line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden}
  @media(max-width:600px){
    .wrapper{padding:16px 8px}
    .header,.body,.footer{padding-left:20px;padding-right:20px}
    .info-row{flex-direction:column;gap:4px}
    .info-label{width:auto}
  }
</style>
</head>
<body>
<div class="preheader">${preheader || ""}</div>
<div class="wrapper">
  <div class="card">
    <div class="header">
      <div class="logo">Revil<span>.</span></div>
    </div>
    <div class="body">
      ${bodyHtml}
    </div>
    <div class="footer">
      <p>${footerNote || "temrevil.com"}</p>
    </div>
  </div>
</div>
</body>
</html>`;
}

/** Basic sanity check so we never try to email obvious junk addresses. */
const GUEST_EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/**
 * The single admin gate for every callable in this file.
 *
 * Fails CLOSED. The old per-callable form was `if (adminUid && uid !== adminUid)`,
 * which skipped the whole check whenever `Settings/Account.uid` was absent - and
 * nothing in this repo ever writes that field (`scripts/set-admin.js` sets the
 * `admin: true` custom claim instead), so on a fresh deployment every signed-in
 * Google user passed. Accepts the claim first, then the optional uid mirror.
 */
async function requireAdmin(
  auth: { uid: string; token?: Record<string, unknown> } | undefined,
  denial: string,
): Promise<void> {
  if (!auth) throw new HttpsError("unauthenticated", "Sign in required.");
  if (auth.token?.admin === true) return;
  const adminUid = (await db.doc("Settings/Account").get()).data()?.uid;
  if (typeof adminUid === "string" && adminUid && auth.uid === adminUid) return;
  throw new HttpsError("permission-denied", denial);
}

/**
 * Auto-acknowledge a visitor: a branded "I received it, I'll reply within 24h"
 * email sent back to the address they entered (contact message or booking).
 * `intro`/`detailRows`/`ctaHtml` are server-built HTML; only echoed user fields
 * are passed through escHtml by the caller. No-ops on a missing/invalid address.
 */
async function sendGuestAck(
  transporter: Transporter,
  { to, name, heading, intro, detailRows = [], ctaHtml = "" }: GuestAckArgs,
): Promise<void> {
  if (!to || !GUEST_EMAIL_RE.test(String(to))) return;
  const rows = detailRows
    .map((r) => `
            <div class="info-row">
              <div class="info-label">${escHtml(r.label)}</div>
              <div class="info-value">${r.value}</div>
            </div>`)
    .join("");

  const html = emailTemplate({
    title: heading,
    preheader: "Thanks - I'll get back to you within 24 hours.",
    bodyHtml: `
          <h2>${escHtml(heading)}</h2>
          <p>Hi ${escHtml(name || "there")},</p>
          <p>${intro}</p>
          ${rows ? `<div class="divider"></div><div>${rows}</div>` : ""}
          ${ctaHtml}
          <div class="divider"></div>
          <p>I'll personally get back to you within <strong style="color:#e0e0e0">24 hours</strong>. If it's urgent, just reply to this email.</p>
          <p style="margin-top:16px">- Revil</p>
        `,
    footerNote: `Sent from <a href="https://temrevil.com">temrevil.com</a>`,
  });

  await transporter.sendMail({
    from: `"Revil" <${HELLO_EMAIL}>`,
    to,
    replyTo: HELLO_EMAIL,
    subject: escSubject(heading),
    html,
  });
}

// =====================================================================
// NOTE - `syncMeeting` Cloud Function is NOT defined here.
// It is deployed to this Firebase project from a separate codebase and is called
// from src/components/dashboard/D-Canary.tsx (admin create/update/cancel). It
// wraps the Google Calendar API to create/cancel events with Meet links, and is
// admin-only. Public bookings go through `bookMeeting` below instead.
//
// If you redeploy this functions folder, run with `--only` flags to avoid
// removing syncMeeting:
//   firebase deploy --only functions:trackSession,functions:notifyCanary,functions:notifyLogin,functions:submitContact,functions:bookMeeting,functions:cleanupAttachments
// =====================================================================

// =====================================================================
//  1. Visit recording - see ./analytics.ts
//     `trackSession` replaced the old `syncSession`, which merged every visit
//     through a link into one string field and was never actually App Check
//     enforced (onRequest ignores that option). syncSession is gone.
// =====================================================================
export { trackSession } from "./analytics.js";

// =====================================================================
//  2. notifyCanary - Firestore trigger on Settings/Canary
//     Detects new emails & meetings, sends notification to admin
// =====================================================================
export const notifyCanary = onDocumentWritten(
  {
    document: "Settings/Canary",
    region: "us-central1",
    secrets: [smtpUser, resendKey],
  },
  async (event) => {
    const before = (event.data?.before?.data() || {}) as CanaryDoc;
    const after = (event.data?.after?.data() || {}) as CanaryDoc;

    // ── Detect deleted email messages & clean up storage ──────────
    const oldEmails = before.Emails || {};
    const newEmails = after.Emails || {};
    const deletedEmailKeys = Object.keys(oldEmails).filter(
      (k) => !newEmails[k],
    );

    for (const key of deletedEmailKeys) {
      const e = oldEmails[key];
      if (!e) continue;

      const files = e["Files Attached"] || [];
      for (const f of files) {
        if (!f || !f.url) continue;
        const storagePath = getStoragePathFromUrl(f.url);
        if (storagePath) {
          try {
            console.log(`Deleting storage file: ${storagePath}`);
            const bucket = admin.storage().bucket();
            await bucket.file(storagePath).delete();
            console.log(`Successfully deleted storage file: ${storagePath}`);
          } catch (err) {
            console.error(`Failed to delete storage file ${storagePath}:`, err);
          }
        }
      }
    }

    const adminEmail = smtpUser.value(); // Send to self

    // ── Detect new email messages ──────────────────────────────
    const addedEmailKeys = Object.keys(newEmails).filter(
      (k) => !oldEmails[k],
    );

    for (const key of addedEmailKeys) {
      const e = newEmails[key];
      if (!e || !e.Name) continue;

      const ts = e.Timestamp
        ? new Date(e.Timestamp).toLocaleString("en-US", {
            timeZone: "Europe/Istanbul",
            dateStyle: "medium",
            timeStyle: "short",
          })
        : "Unknown";

      const attachmentHtml =
        e["Files Attached"] && e["Files Attached"].length > 0
          ? `<div class="divider"></div>
             <p style="font-size:13px;color:#666;margin-bottom:8px">ATTACHMENTS</p>
             ${e["Files Attached"]
               .map((f) => {
                 const href = safeAttachmentUrl(f.url);
                 // An unverified URL is shown as plain text, never as a clickable link.
                 return href
                   ? `<p style="margin:4px 0"><a href="${escAttr(href)}" style="color:#3395ff;text-decoration:none">${escHtml(f.name)}</a></p>`
                   : `<p style="margin:4px 0;color:#888">${escHtml(f.name)} <span style="font-size:12px">(link not verified - open from the dashboard)</span></p>`;
               })
               .join("")}`
          : "";

      const whatsappBadge = e.Whatsapp
        ? `<span class="badge badge-green">WhatsApp</span>`
        : "";

      // Pre-escape all user-supplied fields once for safe template interpolation
      const safeName = escHtml(e.Name);
      const safeEmail = escHtml(e.Email);
      const safeEmailAttr = escAttr(e.Email);
      const safeNumber = escHtml(e.Number || "Not provided");
      const safeMessage = escHtml(e.Message || "").replace(/\n/g, "<br/>");

      const html = emailTemplate({
        title: "New Message Received",
        preheader: `${safeName} sent you a message`,
        bodyHtml: `
          <h2>New Contact Message</h2>
          <p>You received a new message through your portfolio.</p>
          <div class="divider"></div>
          <div>
            <div class="info-row">
              <div class="info-label">From</div>
              <div class="info-value">${safeName}</div>
            </div>
            <div class="info-row">
              <div class="info-label">Email</div>
              <div class="info-value"><a href="mailto:${safeEmailAttr}" style="color:#3395ff;text-decoration:none">${safeEmail}</a></div>
            </div>
            <div class="info-row">
              <div class="info-label">Phone</div>
              <div class="info-value">${safeNumber} ${whatsappBadge}</div>
            </div>
            <div class="info-row" style="border:none">
              <div class="info-label">Time</div>
              <div class="info-value">${ts}</div>
            </div>
          </div>
          <div class="divider"></div>
          <p style="font-size:13px;color:#666;margin-bottom:8px;text-transform:uppercase;letter-spacing:0.5px">MESSAGE</p>
          <div class="message-box">${safeMessage}</div>
          ${attachmentHtml}
          <div style="margin-top:24px;text-align:center">
            <a href="mailto:${safeEmailAttr}?subject=Re: Portfolio Contact" class="btn">Reply to ${safeName}</a>
          </div>
        `,
        footerNote: `Sent from <a href="https://temrevil.com">temrevil.com</a> contact form`,
      });

      try {
        const transporter = createTransporter();
        await transporter.sendMail({
          from: `"Revil Portfolio" <${HELLO_EMAIL}>`,
          to: adminEmail,
          // Copy the public hello@ inbox too (skip if the admin already is hello@).
          cc: adminEmail.toLowerCase() === HELLO_EMAIL ? undefined : HELLO_EMAIL,
          replyTo: e.Email,
          subject: escSubject(`New message from ${e.Name}`),
          html,
        });
        console.log(`Email notification sent for contact #${key}`);
      } catch (err) {
        console.error("Failed to send contact notification:", err);
      }

      // Auto-acknowledge the sender at the address they entered.
      try {
        await sendGuestAck(createTransporter(), {
          to: e.Email,
          name: e.Name,
          heading: "I got your message",
          intro: "Thanks for reaching out through my portfolio - your message has landed in my inbox.",
        });
        console.log(`Acknowledgement sent to sender of contact #${key}`);
      } catch (err) {
        console.error("Failed to send sender acknowledgement:", err);
      }
    }

    // ── Detect new meetings ────────────────────────────────────
    const oldMeetings = before.Meetings || {};
    const newMeetings = after.Meetings || {};
    const addedMeetingKeys = Object.keys(newMeetings).filter(
      (k) => !oldMeetings[k],
    );

    for (const key of addedMeetingKeys) {
      const m = newMeetings[key];
      if (!m || !m.Name) continue;

      // Only allow safe meet links - must be https://meet.google.com
      const safeMeetLink =
        typeof m.MeetingLink === "string" && /^https:\/\/meet\.google\.com\//.test(m.MeetingLink)
          ? m.MeetingLink
          : null;
      const meetLinkHtml = safeMeetLink
        ? `<div style="margin-top:24px;text-align:center">
             <a href="${escAttr(safeMeetLink)}" class="btn">Join Google Meet</a>
           </div>`
        : "";

      const mName = escHtml(m.Name);
      const mEmail = escHtml(m.Email);
      const mEmailAttr = escAttr(m.Email);
      const mDate = escHtml(m.Date);
      const mTime = escHtml(m.Time);
      const mUserLocal = escHtml(m.UserLocalTime);
      const mReason = escHtml(m["What For"] || m.Reason || "Not specified");

      const html = emailTemplate({
        title: "New Meeting Booked",
        preheader: `${mName} booked a meeting on ${mDate}`,
        bodyHtml: `
          <h2>New Meeting Booked</h2>
          <p>Someone scheduled a meeting through your portfolio.</p>
          <div class="divider"></div>
          <div>
            <div class="info-row">
              <div class="info-label">Guest</div>
              <div class="info-value">${mName}</div>
            </div>
            <div class="info-row">
              <div class="info-label">Email</div>
              <div class="info-value"><a href="mailto:${mEmailAttr}" style="color:#3395ff;text-decoration:none">${mEmail}</a></div>
            </div>
            <div class="info-row">
              <div class="info-label">Date</div>
              <div class="info-value"><span class="badge badge-blue">${mDate}</span></div>
            </div>
            <div class="info-row">
              <div class="info-label">Time</div>
              <div class="info-value">${mTime} (your time)${m.UserLocalTime ? ` / ${mUserLocal} (guest)` : ""}</div>
            </div>
            <div class="info-row" style="border:none">
              <div class="info-label">Reason</div>
              <div class="info-value">${mReason}</div>
            </div>
          </div>
          ${meetLinkHtml}
        `,
        footerNote: `Sent from <a href="https://temrevil.com">temrevil.com</a> meeting system`,
      });

      // Notify the admin AND the public hello@ inbox (deduped if they're the same).
      const meetingRecipients = adminEmail.toLowerCase() === HELLO_EMAIL
        ? [adminEmail]
        : [adminEmail, HELLO_EMAIL];

      try {
        const transporter = createTransporter();
        await transporter.sendMail({
          from: `"Revil Portfolio" <${HELLO_EMAIL}>`,
          to: meetingRecipients,
          replyTo: m.Email,
          subject: escSubject(`Meeting booked: ${m.Name} on ${m.Date} at ${m.Time}`),
          html,
        });
        console.log(`Email notification sent for meeting #${key}`);
      } catch (err) {
        console.error("Failed to send meeting notification:", err);
      }

      // Auto-acknowledge the guest at the address they entered.
      try {
        await sendGuestAck(createTransporter(), {
          to: m.Email,
          name: m.Name,
          heading: "Your call is booked",
          intro: "Thanks for booking a call - it's on my calendar.",
          detailRows: [
            { label: "Date", value: `<span class="badge badge-blue">${mDate}</span>` },
            { label: "Time", value: `${mUserLocal || mTime}` },
          ],
          ctaHtml: safeMeetLink
            ? `<div style="margin-top:24px;text-align:center"><a href="${escAttr(safeMeetLink)}" class="btn">Join Google Meet</a></div>`
            : "",
        });
        console.log(`Acknowledgement sent to guest of meeting #${key}`);
      } catch (err) {
        console.error("Failed to send guest acknowledgement:", err);
      }
    }

    // ── Mirror busy slots to a sanitized public doc ─────────────
    // Settings/Canary is admin-read-only (it holds visitor PII + Meet links).
    // The public booking calendar only needs to know which {Date, Time} slots are
    // taken, so we mirror exactly that - no names, emails, reasons, or links - to
    // Settings/BookedSlots, which is publicly readable. Runs on every Canary write
    // (book / reschedule / cancel) so availability stays in sync. Writing a
    // different doc does not re-trigger this function, so there is no loop.
    try {
      const slots = Object.values(after.Meetings || {})
        .filter((m) => m && typeof m.Date === "string" && typeof m.Time === "string")
        .map((m) => ({ Date: m.Date, Time: m.Time }));
      await db.doc("Settings/BookedSlots").set({
        Slots: slots,
        lastWrite: admin.firestore.FieldValue.serverTimestamp(),
      });
    } catch (err) {
      console.error("Failed to mirror booked slots:", err);
    }
  },
);

// =====================================================================
//  2b. Public submissions - submitContact, bookMeeting, cleanupAttachments
//
//  The contact form and the booking form used to write straight into
//  Settings/Canary, guarded only by security rules. Rules cannot check the one
//  new entry inside a map, so any field, type or length got through, and the
//  cooldown timestamps themselves were publicly writable (one request could jam
//  both forms for good). Visitors now have NO write access to Canary at all: they
//  call these functions, which validate every field, rate-limit per IP and
//  site-wide, and write through the Admin SDK. notifyCanary still does the emails.
// =====================================================================

const CONTACT_INBOX_CAP = 50;
const MEETINGS_CAP = 100;
const MAX_ATTACHMENTS = 5;
const MEETING_MS = 3600000;

interface RateLimits {
  cooldownMs: number;
  /** Accepted submissions per IP per window. */
  perIp: number;
  windowMs: number;
  /** Attempts per IP per window, failed ones included (for work that can fail after the reservation). */
  triesPerIp?: number;
}
// Site-wide cooldowns are the same as the old rules had (30s / 5min). The per-IP caps
// are new: one address can no longer use up the whole site's quota. A booking that fails
// (Calendar error, recording error) is refunded, so a typo does not cost a visitor one
// of their bookings; the attempts cap is what still bounds how often one address can
// make the Calendar script run.
const CONTACT_LIMITS: RateLimits = { cooldownMs: 30_000, perIp: 3, windowMs: 3_600_000 };
const MEETING_LIMITS: RateLimits = { cooldownMs: 300_000, perIp: 3, windowMs: 86_400_000, triesPerIp: 10 };

/** RateLimits/{kind}: the last accepted submission, plus recent ones (and attempts) per hashed IP. */
interface RateDoc { last?: number; ips?: Record<string, number[]>; tries?: Record<string, number[]> }

/** Hashed so the rate-limit doc never stores a raw visitor IP. */
function ipKey(rawRequest: { headers: Record<string, string | string[] | undefined>; ip?: string }): string {
  const ip = clientIp(rawRequest.headers, rawRequest.ip) || "unknown";
  return createHash("sha256").update(ip).digest("hex").slice(0, 16);
}

/**
 * Checks the site-wide cooldown and the caller's per-IP quota, and returns the
 * doc to write back if the submission is allowed. Entries older than the window
 * are pruned on every write, so the doc stays small.
 */
function takeRateSlot(prev: RateDoc, key: string, limits: RateLimits, now: number, busyMessage: string): RateDoc {
  if (typeof prev.last === "number" && now - prev.last < limits.cooldownMs) {
    throw new HttpsError("resource-exhausted", busyMessage);
  }
  const recent = (byIp: Record<string, number[]> | undefined) => {
    const out: Record<string, number[]> = {};
    for (const [k, times] of Object.entries(byIp || {})) {
      const kept = (Array.isArray(times) ? times : []).filter((t) => typeof t === "number" && now - t < limits.windowMs);
      if (kept.length) out[k] = kept;
    }
    return out;
  };
  const ips = recent(prev.ips);
  if ((ips[key] || []).length >= limits.perIp) {
    throw new HttpsError("resource-exhausted", "You've sent a few already - please try again later.");
  }
  ips[key] = [...(ips[key] || []), now];
  if (limits.triesPerIp === undefined) return { last: now, ips };

  const tries = recent(prev.tries);
  if ((tries[key] || []).length >= limits.triesPerIp) {
    throw new HttpsError("resource-exhausted", `Too many attempts today - please email ${HELLO_EMAIL} instead.`);
  }
  tries[key] = [...(tries[key] || []), now];
  return { last: now, ips, tries };
}

/**
 * Undoes a reservation that did not become a booking: the caller's booking is removed
 * from their per-IP count (the attempt stays counted) and the site-wide cooldown goes
 * back to what it was - unless another reservation has been made since.
 */
async function refundRateSlot(ref: FirebaseFirestore.DocumentReference, key: string, stamp: number, prevLast: number | undefined): Promise<void> {
  try {
    await db.runTransaction(async (tx) => {
      const cur = ((await tx.get(ref)).data() || {}) as RateDoc;
      const ips = { ...(cur.ips || {}) };
      const left = (ips[key] || []).filter((t) => t !== stamp);
      if (left.length) ips[key] = left;
      else delete ips[key];
      const next: RateDoc = { ...cur, ips };
      if (cur.last === stamp) {
        if (prevLast === undefined) delete next.last;
        else next.last = prevLast;
      }
      tx.set(ref, next);
    });
  } catch (err) {
    console.error("Failed to refund booking reservation:", err);
  }
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

/** Only an upload the visitor really made to emails/<folder>/<file> in our bucket. */
const ATTACHMENT_PATH_RE = /^emails\/[A-Za-z0-9_-]{1,40}\/[^/]{1,200}$/;

async function attachmentsField(v: unknown): Promise<Array<{ name: string; url: string }>> {
  if (v === undefined || v === null) return [];
  if (!Array.isArray(v)) throw new HttpsError("invalid-argument", "Attachments must be a list.");
  if (v.length > MAX_ATTACHMENTS) throw new HttpsError("invalid-argument", `At most ${MAX_ATTACHMENTS} attachments.`);
  const out: Array<{ name: string; url: string }> = [];
  for (const f of v) {
    const file = (f || {}) as { name?: unknown; url?: unknown };
    const name = textField(file.name, "Attachment name", 200, true);
    const url = safeAttachmentUrl(file.url);
    const path = url ? getStoragePathFromUrl(url) : null;
    if (!url || !path || !ATTACHMENT_PATH_RE.test(path)) {
      throw new HttpsError("invalid-argument", "An attachment link is not valid.");
    }
    const [exists] = await admin.storage().bucket().file(path).exists();
    if (!exists) throw new HttpsError("invalid-argument", "An attachment is missing - please attach it again.");
    out.push({ name, url });
  }
  return out;
}

export const submitContact = onCall(
  { region: "us-central1", enforceAppCheck: true },
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
    const key = ipKey(request.rawRequest);

    await db.runTransaction(async (tx) => {
      const rlRef = db.doc("RateLimits/contact");
      const canaryRef = db.doc("Settings/Canary");
      const [rl, canary] = await Promise.all([tx.get(rlRef), tx.get(canaryRef)]);
      const emails = (canary.data() as CanaryDoc | undefined)?.Emails || {};
      if (Object.keys(emails).length >= CONTACT_INBOX_CAP) {
        throw new HttpsError("resource-exhausted", `The inbox is full right now - please email ${HELLO_EMAIL} directly.`);
      }
      const next = takeRateSlot((rl.data() || {}) as RateDoc, key, CONTACT_LIMITS, Date.now(),
        "Another message just came in - please try again in a minute.");
      tx.set(rlRef, next);
      tx.set(canaryRef, { Emails: { [entryId()]: entry } }, { merge: true });
    });
    return { ok: true };
  },
);

async function postToCalendar(payload: Record<string, unknown>): Promise<{ status?: string; link?: string; id?: string; message?: string }> {
  const url = (meetingSyncUrl.value() || "").trim();
  if (!url) throw new HttpsError("failed-precondition", "Meeting sync is not configured.");
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(30000),
  });
  const data = await res.json().catch(() => ({})) as { status?: string; link?: string; id?: string; message?: string };
  if (!res.ok || data.status === "error") {
    throw new HttpsError("internal", data.message || `Calendar sync failed (HTTP ${res.status}).`);
  }
  return data;
}

/**
 * Public booking. Validates the request, reserves the site-wide booking slot,
 * creates the Calendar event (with Meet link) and records the meeting in Canary.
 * If recording fails the event is cancelled again, so there is never an invite
 * for a slot the public calendar does not show as taken.
 */
export const bookMeeting = onCall(
  { region: "us-central1", enforceAppCheck: true, secrets: [meetingSyncUrl] },
  async (request) => {
    const d = (request.data || {}) as Record<string, unknown>;
    const name = textField(d.name, "Name", 100, true);
    const email = emailField(d.email);
    const reason = textField(d.reason, "Reason", 1000, false);
    const userLocalTime = textField(d.userLocalTime, "Local time", 20, false);
    const userTimezone = typeof d.userTimezone === "number" && Number.isFinite(d.userTimezone) &&
      Math.abs(d.userTimezone) <= 14 ? d.userTimezone : 0;
    const via = d.via === "book" ? "book" : "contact";

    const start = new Date(typeof d.startTime === "string" ? d.startTime : NaN);
    const now = Date.now();
    if (Number.isNaN(start.getTime())) {
      throw new HttpsError("invalid-argument", "Invalid meeting time.");
    }
    const end = new Date(start.getTime() + MEETING_MS);

    const availability = (await db.doc("Settings/Availability").get()).data() || {};
    const cfg = parseAvailability(availability);
    const hostOffset = utcOffsetHours(availability["Current Time"] ?? DEFAULT_HOST_TZ);
    const host = wallClock(start.getTime(), hostOffset);
    const key = ipKey(request.rawRequest);
    const rlRef = db.doc("RateLimits/meeting");
    const canaryRef = db.doc("Settings/Canary");

    // 1. Reserve: slot free, under the cap, and not rate limited.
    const stamp = now;
    const prevLast = await db.runTransaction(async (tx) => {
      const [rl, canary] = await Promise.all([tx.get(rlRef), tx.get(canaryRef)]);
      const meetings = Object.values((canary.data() as CanaryDoc | undefined)?.Meetings || {});
      if (meetings.length >= MEETINGS_CAP) {
        throw new HttpsError("resource-exhausted", `Bookings are full right now - please email ${HELLO_EMAIL}.`);
      }
      if (isTaken(start.getTime(), hostOffset, meetings)) {
        throw new HttpsError("already-exists", "That time slot is no longer available. Please pick another.");
      }
      // The same day and time rules the booking calendar draws from (booking.ts,
      // generated from src/utils/bookingRules.ts).
      const refusal = bookingRefusal(start.getTime(), { nowMs: now, userTimezone, hostOffset, cfg, meetings });
      if (refusal) throw new HttpsError("failed-precondition", refusal);
      const prev = (rl.data() || {}) as RateDoc;
      tx.set(rlRef, takeRateSlot(prev, key, MEETING_LIMITS, now,
        "Another booking just came in - please wait a few minutes and try again."));
      return prev.last;
    });
    // A failed booking gives back the site-wide slot and the caller's booking count.
    const release = () => refundRateSlot(rlRef, key, stamp, prevLast);

    // 2. Calendar event + Meet link.
    let event: { link?: string; id?: string };
    try {
      event = await postToCalendar({ name, email, reason, startTime: start.toISOString(), endTime: end.toISOString() });
    } catch (err) {
      await release();
      if (err instanceof HttpsError) {
        throw /Invalid attendee email/i.test(err.message)
          ? new HttpsError("invalid-argument", "Invalid Email Address provided.")
          : err;
      }
      throw new HttpsError("internal", "Could not book meeting");
    }

    // 3. Record it (notifyCanary sends the emails and updates BookedSlots).
    try {
      const entry = {
        Date: host.date,
        Time: host.time,
        UserLocalTime: userLocalTime,
        UserTimezone: userTimezone,
        Email: email,
        "What For": reason,
        Name: name,
        timestamp: Date.now(),
        MeetingLink: typeof event.link === "string" ? event.link : "",
        GoogleEventId: typeof event.id === "string" ? event.id : "",
        Via: via,
      };
      await canaryRef.set({ Meetings: { [entryId()]: entry } }, { merge: true });
    } catch (err) {
      console.error("Failed to record meeting, cancelling the calendar event:", err);
      if (event.id) {
        await postToCalendar({ action: "cancel", eventId: event.id, email, name, startTime: start.toISOString() })
          .catch((e) => console.error("Rollback cancel failed:", e));
      }
      await release();
      throw new HttpsError("internal", "Could not book meeting");
    }

    return { link: typeof event.link === "string" ? event.link : "" };
  },
);

/**
 * Deletes contact-form uploads that no message points to, once they are a day
 * old. Storage rules cannot count uploads, so this is what stops `emails/` from
 * becoming free public file hosting (uploads that were never sent with a message).
 */
export const cleanupAttachments = onSchedule(
  { schedule: "every day 04:00", timeZone: "Europe/Istanbul", region: "us-central1" },
  async () => {
    const canary = (await db.doc("Settings/Canary").get()).data() as CanaryDoc | undefined;
    const keep = new Set<string>();
    for (const e of Object.values(canary?.Emails || {})) {
      for (const f of e?.["Files Attached"] || []) {
        const path = f?.url ? getStoragePathFromUrl(f.url) : null;
        if (path) keep.add(path);
      }
    }
    const cutoff = Date.now() - 86400000;
    const [files] = await admin.storage().bucket().getFiles({ prefix: "emails/" });
    let deleted = 0;
    for (const file of files) {
      if (keep.has(file.name)) continue;
      const created = Date.parse(String(file.metadata?.timeCreated || ""));
      if (!Number.isFinite(created) || created > cutoff) continue;
      try {
        await file.delete();
        deleted++;
      } catch (err) {
        console.error(`Failed to delete orphaned attachment ${file.name}:`, err);
      }
    }
    console.log(`cleanupAttachments: deleted ${deleted} orphaned file(s)`);
  },
);

// =====================================================================
//  3. notifyLogin - Callable function triggered by dashboard on sign-in
//     Sends an email alert with date/time/device info. A sign-in by anyone
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
    console.error("[notifyLogin] could not delete blocked account:", err);
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
  console.warn("[notifyLogin] blocked a non-admin sign-in", { email, alerted: shouldAlert });
  if (!shouldAlert) return;
  const when = new Date(now).toLocaleString("en-US", { timeZone: "Europe/Istanbul", dateStyle: "full", timeStyle: "medium" });
  const html = emailTemplate({
    title: "Blocked sign-in",
    preheader: `Someone who isn't you tried to sign in: ${email}`,
    bodyHtml: `
        <h2>Blocked sign-in</h2>
        <p>An account that isn't yours signed in on the admin page. It was refused and deleted; it never reached any private data.</p>
        <div class="divider"></div>
        <div>
          <div class="info-row"><div class="info-label">Account</div><div class="info-value">${escHtml(email)}</div></div>
          <div class="info-row"><div class="info-label">When</div><div class="info-value">${escHtml(when)}</div></div>
          <div class="info-row"><div class="info-label">IP Address</div><div class="info-value">${escHtml(ip)}</div></div>
          <div class="info-row" style="border:none"><div class="info-label">Device</div><div class="info-value" style="font-size:13px;color:#888">${escHtml(String(userAgent || "Unknown"))}</div></div>
        </div>
        <div class="divider"></div>
        <p style="font-size:13px;color:#888">Further attempts within 10 minutes are counted but not emailed.</p>
      `,
    footerNote: `Security alert from <a href="https://temrevil.com">temrevil.com</a>`,
  });
  try {
    await createTransporter().sendMail({
      from: `"Revil Security" <${HELLO_EMAIL}>`,
      to: smtpUser.value(),
      subject: `Blocked sign-in: ${email}`,
      html,
    });
  } catch (err) {
    console.error("[notifyLogin] blocked-sign-in alert failed:", err);
  }
}
export const notifyLogin = onCall(
  {
    region: "us-central1",
    secrets: [smtpUser, resendKey],
    enforceAppCheck: true,
  },
  async (request) => {
    if (!request.auth) throw new HttpsError("unauthenticated", "Sign in required.");
    const auth = request.auth;
    const { userAgent, provider } = request.data || {};
    // Only the owner may sign in - and the gate fails closed. Anyone else is removed.
    try {
      await requireAdmin(auth, "Access denied.");
    } catch {
      await blockSignIn(auth, userAgent, request.rawRequest?.ip || "Unknown");
      throw new HttpsError("permission-denied", "Access denied - account not recognized.");
    }

    const now = new Date();
    const dateStr = now.toLocaleString("en-US", {
      timeZone: "Europe/Istanbul",
      weekday: "long",
      year: "numeric",
      month: "long",
      day: "numeric",
    });
    const timeStr = now.toLocaleString("en-US", {
      timeZone: "Europe/Istanbul",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: true,
    });

    // Derived from the caller-supplied X-Forwarded-For header (Functions runs behind a
    // trusted proxy), so it is untrusted input and must be escaped like any other field.
    const ip = request.rawRequest?.ip || "Unknown";

    const html = emailTemplate({
      title: "Login Alert",
      preheader: `Sign-in detected at ${timeStr}`,
      bodyHtml: `
        <h2>Sign-In Detected</h2>
        <p>A sign-in to your portfolio admin was detected.</p>
        <div class="divider"></div>
        <div>
          <div class="info-row">
            <div class="info-label">Account</div>
            <div class="info-value">${escHtml(auth.token?.email || "Unknown")}</div>
          </div>
          <div class="info-row">
            <div class="info-label">Provider</div>
            <div class="info-value"><span class="badge badge-blue">${escHtml(provider || "google.com")}</span></div>
          </div>
          <div class="info-row">
            <div class="info-label">Date</div>
            <div class="info-value">${dateStr}</div>
          </div>
          <div class="info-row">
            <div class="info-label">Time</div>
            <div class="info-value">${timeStr}</div>
          </div>
          <div class="info-row">
            <div class="info-label">IP Address</div>
            <div class="info-value"><code style="background:#1a1a1a;padding:4px 8px;border-radius:6px;font-size:13px">${escHtml(ip)}</code></div>
          </div>
          <div class="info-row" style="border:none">
            <div class="info-label">Device</div>
            <div class="info-value" style="font-size:13px;color:#888">${escHtml(userAgent || "Unknown")}</div>
          </div>
        </div>
        <div class="divider"></div>
        <p style="font-size:13px;color:#888">If this wasn't you, change your password immediately and review your account security.</p>
      `,
      footerNote: `Security alert from <a href="https://temrevil.com">temrevil.com</a>`,
    });

    try {
      const adminEmail = smtpUser.value();
      const transporter = createTransporter();
      await transporter.sendMail({
        from: `"Revil Security" <${HELLO_EMAIL}>`,
        to: adminEmail,
        subject: `Login alert: ${dateStr} at ${timeStr}`,
        html,
      });
      console.log("Login alert email sent");
      return { status: "sent" };
    } catch (err) {
      // Log details server-side; return a generic message so SMTP/internal
      // details don't leak to the client.
      console.error("Failed to send login alert:", err);
      return { status: "error", message: "Failed to send login alert." };
    }
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
      console.log(`Receipt emailed to ${email}`);

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
//      reads those objects from our own bucket, and sends the reply via
//      Resend from hello@temrevil.com (owner bcc'd).
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
    if (Array.isArray(attachments) && attachments.length) {
      if (attachments.length > MAX_FILES) {
        throw new HttpsError("invalid-argument", `At most ${MAX_FILES} attachments per reply.`);
      }
      const bucket = admin.storage().bucket();
      let total = 0;
      for (const a of attachments) {
        const path = getStoragePathFromUrl(String(a?.url || ""));
        if (!path || !path.startsWith("replies/")) {
          throw new HttpsError("invalid-argument", "Invalid attachment reference.");
        }
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
          console.error("Failed to read reply attachment:", path, err);
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
      console.log(`Reply emailed to ${email} (${mailAttachments.length} attachment(s))`);
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
