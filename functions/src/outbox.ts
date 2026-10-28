/**
 * The mail outbox: every notification and acknowledgement is a MailJobs/{id} document
 * first, and a sent email second.
 *
 * Before this, a failed send was logged and forgotten: a transient SMTP error left a
 * real message or booking with no notification and nothing on record. Now:
 *   - the job id is an idempotency key (`contact-owner_<entry id>`), and jobs are
 *     created with create(), so a retried trigger can never queue a second copy;
 *   - delivery claims the job in a transaction before sending, so two runs can't both
 *     send it, and the Message-ID is derived from the job id;
 *   - a failure is retried with backoff (sendMail on create, then retryMail every few
 *     minutes), and after MAX_ATTEMPTS the job stays as `failed`, with a short reason,
 *     for the dashboard to show.
 * Only functions write here (Admin SDK). The rendered HTML is dropped once sent.
 */
import { onDocumentCreated } from "firebase-functions/v2/firestore";
import { onSchedule } from "firebase-functions/v2/scheduler";
import admin from "firebase-admin";
import { createTransporter, HELLO_EMAIL, resendKey } from "./mail.js";

export const MAIL_JOBS = "MailJobs";
export const MAX_ATTEMPTS = 6;
/** How long a claimed job is reserved for the run that claimed it. */
const LEASE_MS = 2 * 60_000;

export interface MailMessage {
  to: string | string[];
  subject: string;
  html: string;
  /** Display name for HELLO_EMAIL, e.g. "Revil Portfolio". */
  fromName: string;
  cc?: string;
  /** A silent copy, e.g. the owner on a receipt sent to a customer. */
  bcc?: string;
  replyTo?: string;
  /** A few words for the dashboard: "Contact notification", "Booking acknowledgement". */
  label: string;
}

export type JobStatus = "pending" | "sending" | "sent" | "failed";

export interface MailJob extends MailMessage {
  status: JobStatus;
  attempts: number;
  /** When delivery may next be tried; removed once the job is sent or has failed. */
  nextAttemptAt?: number;
  createdAt: number;
  sentAt?: number;
  lastError?: string;
}

/** The wait before attempt n+1, after n failed attempts: 1m, 5m, 20m, 1h, 3h. */
export function backoffMs(attempts: number): number {
  const steps = [60_000, 5 * 60_000, 20 * 60_000, 60 * 60_000, 3 * 60 * 60_000];
  return steps[Math.min(Math.max(attempts, 1), steps.length) - 1];
}

/** Whether a run may claim the job now. A stuck "sending" claim expires with its lease. */
export function claimable(job: Partial<MailJob> | undefined, now: number): boolean {
  if (!job) return false;
  if (job.status !== "pending" && job.status !== "sending") return false;
  return typeof job.nextAttemptAt !== "number" || job.nextAttemptAt <= now;
}

/** A failure reason short and safe enough to keep and show: the SMTP code and first line. */
export function safeError(err: unknown): string {
  const e = (err || {}) as { code?: unknown; responseCode?: unknown; message?: unknown };
  const code = [e.code, e.responseCode].filter((v) => typeof v === "string" || typeof v === "number").join(" ");
  const first = String(e.message || "send failed").split(/\r?\n/)[0].replace(/\S+@\S+/g, "[address]");
  return `${code ? `${code}: ` : ""}${first}`.slice(0, 200);
}

/** A job id from its parts: only characters Firestore and Message-ID both accept. */
export function jobId(...parts: string[]): string {
  return parts.map((p) => p.replace(/[^A-Za-z0-9_-]/g, "-")).join("_").slice(0, 200);
}

/**
 * The change that puts a failed job back in the queue, or null when the job is not
 * failed (pending and sending jobs are already being retried; sent ones are done).
 * Its attempts start again from zero, so it gets the full set of retries.
 */
export function retryReset(job: Partial<MailJob> | undefined, now: number): Pick<MailJob, "status" | "attempts" | "nextAttemptAt"> | null {
  if (!job || job.status !== "failed" || typeof job.html !== "string") return null;
  return { status: "pending", attempts: 0, nextAttemptAt: now };
}

/**
 * Re-queue a failed job and try it at once (the dashboard's "retry"). Returns the
 * job's status afterwards, or null when there was no failed job with that id.
 */
export async function retryFailed(id: string): Promise<JobStatus | null> {
  const db = admin.firestore();
  const ref = db.collection(MAIL_JOBS).doc(id);
  const reset = await db.runTransaction(async (tx) => {
    const patch = retryReset((await tx.get(ref)).data() as MailJob | undefined, Date.now());
    if (patch) tx.update(ref, patch);
    return patch;
  });
  if (!reset) return null;
  await deliver(id);
  return (((await ref.get()).data() as MailJob | undefined)?.status) ?? null;
}

/** Queue a mail once. A job that already exists (a retried trigger) is left as it is. */
export async function enqueueMail(id: string, mail: MailMessage): Promise<void> {
  const job: MailJob = { ...mail, status: "pending", attempts: 0, nextAttemptAt: Date.now(), createdAt: Date.now() };
  try {
    await admin.firestore().collection(MAIL_JOBS).doc(id).create(job);
  } catch (err) {
    if ((err as { code?: number }).code === 6) return; // ALREADY_EXISTS: queued before
    throw err;
  }
}

/**
 * Queue a mail and try it straight away, for a caller that wants to say whether it
 * went (an MCP tool sending a receipt). If this first try fails the job stays queued
 * and is retried like any other, so the answer is "sent", or "queued" with the reason.
 */
export async function sendNow(id: string, mail: MailMessage): Promise<{ status: JobStatus; lastError?: string }> {
  await enqueueMail(id, mail);
  await deliver(id);
  const job = (await admin.firestore().collection(MAIL_JOBS).doc(id).get()).data() as MailJob | undefined;
  return { status: job?.status ?? "pending", ...(job?.lastError ? { lastError: job.lastError } : {}) };
}

/** Claim, send and record one job. Safe to call twice: only one run gets the claim. */
export async function deliver(id: string): Promise<void> {
  const db = admin.firestore();
  const ref = db.collection(MAIL_JOBS).doc(id);
  const now = Date.now();
  const job = await db.runTransaction(async (tx) => {
    const cur = (await tx.get(ref)).data() as MailJob | undefined;
    if (!claimable(cur, now)) return null;
    tx.update(ref, { status: "sending", attempts: (cur!.attempts || 0) + 1, nextAttemptAt: now + LEASE_MS });
    return cur!;
  });
  if (!job) return;

  try {
    await createTransporter().sendMail({
      from: `"${job.fromName.replace(/["\r\n]/g, "")}" <${HELLO_EMAIL}>`,
      to: job.to,
      cc: job.cc || undefined,
      bcc: job.bcc || undefined,
      replyTo: job.replyTo || undefined,
      subject: job.subject,
      html: job.html,
      messageId: `<${id}@temrevil.com>`,
    });
    await ref.update({
      status: "sent", sentAt: Date.now(),
      html: admin.firestore.FieldValue.delete(),
      nextAttemptAt: admin.firestore.FieldValue.delete(),
      lastError: admin.firestore.FieldValue.delete(),
    });
  } catch (err) {
    const attempts = (job.attempts || 0) + 1;
    const lastError = safeError(err);
    console.error(`Mail job ${id} failed (attempt ${attempts}):`, lastError);
    await ref.update(attempts >= MAX_ATTEMPTS
      ? { status: "failed", lastError, nextAttemptAt: admin.firestore.FieldValue.delete() }
      : { status: "pending", lastError, nextAttemptAt: Date.now() + backoffMs(attempts) });
  }
}

export const sendMail = onDocumentCreated(
  { document: `${MAIL_JOBS}/{jobId}`, region: "us-central1", secrets: [resendKey] },
  async (event) => { await deliver(event.params.jobId); },
);

export const retryMail = onSchedule(
  { schedule: "every 5 minutes", region: "us-central1", secrets: [resendKey] },
  async () => {
    const due = await admin.firestore().collection(MAIL_JOBS)
      .where("nextAttemptAt", "<=", Date.now()).limit(50).get();
    for (const doc of due.docs) {
      try { await deliver(doc.id); } catch (err) { console.error(`retryMail ${doc.id}:`, (err as Error)?.message); }
    }
  },
);
