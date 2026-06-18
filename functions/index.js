const { onRequest, onCall, HttpsError } = require("firebase-functions/v2/https");
const { onDocumentWritten } = require("firebase-functions/v2/firestore");
const admin = require("firebase-admin");
const nodemailer = require("nodemailer");
const { defineSecret } = require("firebase-functions/params");

admin.initializeApp();
const db = admin.firestore();

// ── Secrets (set via: firebase functions:secrets:set SMTP_USER etc.) ──
const smtpUser = defineSecret("SMTP_USER");
const smtpPass = defineSecret("SMTP_PASS");

/**
 * Escape user-supplied strings before interpolating into email HTML.
 * Prevents an attacker from injecting <img onerror=...> via Name/Email/Message.
 */
function escHtml(v) {
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
 * URL-encodes characters that would break out of the attribute.
 */
function escAttr(v) {
  if (v === null || v === undefined) return "";
  return encodeURIComponent(String(v)).replace(/'/g, "%27");
}

/**
 * Sanitize a string for use in an email subject / header.
 * Strips line breaks (prevents SMTP header injection) and clamps length.
 */
function escSubject(v) {
  if (v === null || v === undefined) return "";
  return String(v).replace(/[\r\n]+/g, " ").trim().slice(0, 200);
}

/** Helper: create a reusable SMTP transporter */
function createTransporter() {
  return nodemailer.createTransport({
    host: "smtp.titan.email",
    port: 465,
    secure: true,
    auth: {
      user: smtpUser.value(),
      pass: smtpPass.value(),
    },
  });
}

// ── Branded Email Template ─────────────────────────────────────────
function emailTemplate({ title, preheader, bodyHtml, footerNote }) {
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
exports.syncSession = onRequest(
  {
    region: "us-central1",
    cors: [
      "https://temrevil.com",
      "https://www.temrevil.com",
      /localhost/,
    ],
    maxInstances: 10,
    enforceAppCheck: true,
  },
  async (req, res) => {
    if (req.method !== "POST") {
      return res.status(405).json({ error: "Method not allowed" });
    }

    const { linkId, recCli } = req.body;

    // Reject path separators / Firestore-illegal chars so a crafted linkId can't
    // escape the Settings/Views/Links/{id} document path.
    if (!linkId || typeof linkId !== "string" || linkId.length > 100 || /[/.]/.test(linkId)) {
      return res.status(400).json({ error: "Invalid linkId" });
    }
    if (!recCli || typeof recCli !== "string") {
      return res.status(400).json({ error: "Invalid recCli" });
    }
    if (recCli.length > 60000) {
      return res.status(400).json({ error: "recCli too large" });
    }

    try {
      const linkRef = db.doc(`Settings/Views/Links/${linkId}`);
      const linkSnap = await linkRef.get();

      if (!linkSnap.exists) {
        return res.status(404).json({ error: "Link not found" });
      }

      await linkRef.update({
        Rec_CLI: recCli,
        lastWrite: admin.firestore.FieldValue.serverTimestamp(),
      });

      return res.status(200).json({ ok: true });
    } catch (err) {
      console.error("syncSession error:", err);
      return res.status(500).json({ error: "Internal error" });
    }
  }
);

// =====================================================================
//  2. notifyCanary - Firestore trigger on Settings/Canary
//     Detects new emails & meetings, sends notification to admin
// =====================================================================
exports.notifyCanary = onDocumentWritten(
  {
    document: "Settings/Canary",
    region: "us-central1",
    secrets: [smtpUser, smtpPass],
  },
  async (event) => {
    const before = event.data?.before?.data() || {};
    const after = event.data?.after?.data() || {};

    const adminEmail = smtpUser.value(); // Send to self

    // ── Detect new email messages ──────────────────────────────
    const oldEmails = before.Emails || {};
    const newEmails = after.Emails || {};
    const addedEmailKeys = Object.keys(newEmails).filter(
      (k) => !oldEmails[k]
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
                   `<p style="margin:4px 0"><a href="${escAttr(f.url)}" style="color:#3395ff;text-decoration:none">${escHtml(f.name)}</a></p>`
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
          from: `"Revil Portfolio" <${adminEmail}>`,
          to: adminEmail,
          replyTo: e.Email,
          subject: escSubject(`New message from ${e.Name}`),
          html,
        });
        console.log(`Email notification sent for contact #${key}`);
      } catch (err) {
        console.error("Failed to send contact notification:", err);
      }
    }

    // ── Detect new meetings ────────────────────────────────────
    const oldMeetings = before.Meetings || {};
    const newMeetings = after.Meetings || {};
    const addedMeetingKeys = Object.keys(newMeetings).filter(
      (k) => !oldMeetings[k]
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

      try {
        const transporter = createTransporter();
        await transporter.sendMail({
          from: `"Revil Portfolio" <${adminEmail}>`,
          to: adminEmail,
          replyTo: m.Email,
          subject: escSubject(`Meeting booked: ${m.Name} on ${m.Date} at ${m.Time}`),
          html,
        });
        console.log(`Email notification sent for meeting #${key}`);
      } catch (err) {
        console.error("Failed to send meeting notification:", err);
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
  }
);

// =====================================================================
//  3. notifyLogin - Callable function triggered by dashboard on sign-in
//     Sends an email alert with date/time/device info
// =====================================================================
exports.notifyLogin = onCall(
  {
    region: "us-central1",
    secrets: [smtpUser, smtpPass],
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
        from: `"Revil Security" <${adminEmail}>`,
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
  }
);
