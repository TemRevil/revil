/**
 * Outbound email, shared by every module that sends it (index.ts, analytics.ts, mcp.ts).
 *
 * Secrets are set via: firebase functions:secrets:set SMTP_USER etc. A function that
 * sends mail must still list resendKey (and smtpUser, if it reads the owner's address)
 * in its own `secrets` option.
 */
import nodemailer, { type Transporter } from "nodemailer";
import { defineSecret } from "firebase-functions/params";

/** The owner's own address: where alerts and copies go. */
export const smtpUser = defineSecret("SMTP_USER");
// Outbound email routes through Resend (temrevil.com is a verified Resend domain
// with aligned DKIM/SPF). The old Hostinger SMTP_PASS secret is no longer used.
export const resendKey = defineSecret("RESEND_API_KEY");

/** Every message is sent from this address. */
export const HELLO_EMAIL = "hello@temrevil.com";

export function createTransporter(): Transporter {
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
