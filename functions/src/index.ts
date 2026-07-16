import { onRequest, onCall, HttpsError } from "firebase-functions/v2/https";
import { onDocumentWritten } from "firebase-functions/v2/firestore";
import admin from "firebase-admin";
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
// from src/components/M-Contact.tsx (public meeting booking) and
// src/components/dashboard/D-Canary.tsx (admin cancel). It wraps the Google
// Calendar API to create/cancel events with Meet links.
//
// If you redeploy this functions folder, run with `--only` flags to avoid
// removing syncMeeting:
//   firebase deploy --only functions:syncSession,functions:notifyCanary,functions:notifyLogin
// =====================================================================

// =====================================================================
//  1. syncSession - HTTP endpoint for Algorithm.tsx session recording
// =====================================================================
export const syncSession = onRequest(
  {
    region: "us-central1",
    cors: [
      "https://temrevil.com",
      "https://www.temrevil.com",
      /localhost/,
    ],
    maxInstances: 10,
    // NOTE: onRequest (HttpsOptions) does NOT support `enforceAppCheck` - that option
    // is only honored by onCall (CallableOptions). The previous JS passed it here, but
    // it was silently ignored, so this endpoint was never App Check-enforced by it.
    // To actually enforce, verify the X-Firebase-AppCheck header manually with
    // admin.appCheck().verifyToken() (the client already sends it - see
    // src/lib/firebase.ts). Left as a follow-up to avoid changing runtime behavior here.
  },
  async (req, res) => {
    if (req.method !== "POST") {
      res.status(405).json({ error: "Method not allowed" });
      return;
    }

    const { linkId, recCli } = req.body;

    // Reject path separators / Firestore-illegal chars so a crafted linkId can't
    // escape the Settings/Views/Links/{id} document path.
    if (!linkId || typeof linkId !== "string" || linkId.length > 100 || /[/.]/.test(linkId)) {
      res.status(400).json({ error: "Invalid linkId" });
      return;
    }
    if (!recCli || typeof recCli !== "string") {
      res.status(400).json({ error: "Invalid recCli" });
      return;
    }
    if (recCli.length > 60000) {
      res.status(400).json({ error: "recCli too large" });
      return;
    }

    try {
      const linkRef = db.doc(`Settings/Views/Links/${linkId}`);
      const linkSnap = await linkRef.get();

      if (!linkSnap.exists) {
        res.status(404).json({ error: "Link not found" });
        return;
      }

      await linkRef.update({
        Rec_CLI: recCli,
        lastWrite: admin.firestore.FieldValue.serverTimestamp(),
      });

      res.status(200).json({ ok: true });
    } catch (err) {
      console.error("syncSession error:", err);
      res.status(500).json({ error: "Internal error" });
    }
  },
);

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
               .map(
                 (f) =>
                   `<p style="margin:4px 0"><a href="${escAttr(f.url)}" style="color:#3395ff;text-decoration:none">${escHtml(f.name)}</a></p>`,
               )
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
//  3. notifyLogin - Callable function triggered by dashboard on sign-in
//     Sends an email alert with date/time/device info
// =====================================================================
export const notifyLogin = onCall(
  {
    region: "us-central1",
    secrets: [smtpUser, resendKey],
    enforceAppCheck: true,
  },
  async (request) => {
    // Only authenticated users can call this - use HttpsError so client gets a typed rejection
    if (!request.auth) {
      throw new HttpsError("unauthenticated", "Sign in required to call notifyLogin.");
    }

    // Only alert for admin
    const accountSnap = await db.doc("Settings/Account").get();
    const adminUid = accountSnap.data()?.uid;
    if (adminUid && request.auth.uid !== adminUid) {
      return { status: "skipped", reason: "Not admin" };
    }

    const { userAgent, provider } = request.data || {};

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
            <div class="info-value">${request.auth.token?.email || "Unknown"}</div>
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
            <div class="info-value"><code style="background:#1a1a1a;padding:4px 8px;border-radius:6px;font-size:13px">${ip}</code></div>
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
    if (!request.auth) {
      throw new HttpsError("unauthenticated", "Sign in required to send a receipt.");
    }
    const accountSnap = await db.doc("Settings/Account").get();
    const adminUid = accountSnap.data()?.uid;
    if (adminUid && request.auth.uid !== adminUid) {
      throw new HttpsError("permission-denied", "Only the portfolio owner can send receipts.");
    }

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
    if (!request.auth) {
      throw new HttpsError("unauthenticated", "Sign in required.");
    }
    // Admin gate: custom claim, or fall back to Settings/Account.uid (mirrors notifyLogin).
    const accountSnap = await db.doc("Settings/Account").get();
    const adminUid = accountSnap.data()?.uid;
    const isAdmin = request.auth.token?.admin === true || (adminUid && request.auth.uid === adminUid);
    if (!isAdmin) {
      throw new HttpsError("permission-denied", "Admin only.");
    }

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
