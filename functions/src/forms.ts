/**
 * Small pure rules behind the public forms and the mail they cause, kept apart from
 * index.ts so they can be tested without Firebase.
 */
import { MEETING_MS, isUpcoming, isoInstant, slotStart, wallClock, type BookedSlot } from "./booking.js";

/** Only an upload a visitor really made to emails/<folder>/<file>. */
export const ATTACHMENT_PATH_RE = /^emails\/[A-Za-z0-9_-]{1,40}\/[^/]{1,200}$/;
/** Only a file the dashboard's reply composer uploaded to replies/<folder>/<file>. */
export const REPLY_PATH_RE = /^replies\/[A-Za-z0-9_-]{1,40}\/[^/]{1,200}$/;

/**
 * The object path of a contact-form attachment URL, when it points at OUR bucket under
 * emails/<folder>/<file>; null for anything else.
 *
 * This is what both the submission check and the attachment cleanup use: a
 * hand-edited entry naming a site image can never get it deleted.
 */
export function attachmentPath(v: unknown, bucket: string): string | null {
  const path = bucketObjectPath(v, bucket);
  return path && ATTACHMENT_PATH_RE.test(path) ? path : null;
}

/** The object path of a reply attachment URL in our bucket, or null. */
export function replyPath(v: unknown, bucket: string): string | null {
  const path = bucketObjectPath(v, bucket);
  return path && REPLY_PATH_RE.test(path) ? path : null;
}

/**
 * The object path a Storage URL names, when the URL is https and points at OUR bucket;
 * null for anything else. Checking the host is not enough: storage.googleapis.com
 * serves every public bucket, and firebasestorage.googleapis.com carries the bucket
 * inside the path, so the bucket name is pinned too. "." and ".." segments are refused.
 */
function bucketObjectPath(v: unknown, bucket: string): string | null {
  if (typeof v !== "string" || !v || !bucket) return null;
  let u: URL;
  try { u = new URL(v); } catch { return null; }
  if (u.protocol !== "https:") return null;

  let segs: string[];
  try { segs = u.pathname.split("/").filter(Boolean).map((seg) => decodeURIComponent(seg)); } catch { return null; }
  let objectBucket: string | undefined;
  let objectPath: string;
  if (u.hostname === "firebasestorage.googleapis.com") {
    // /v0/b/<bucket>/o/<url-encoded object path>
    const raw = u.pathname.split("/").filter(Boolean);
    if (raw[0] !== "v0" || raw[1] !== "b" || raw[3] !== "o" || raw.length !== 5) return null;
    objectBucket = segs[2];
    objectPath = segs[4];
  } else if (u.hostname === "storage.googleapis.com") {
    // /<bucket>/<object path>
    if (segs.length < 2) return null;
    objectBucket = segs[0];
    objectPath = segs.slice(1).join("/");
  } else {
    return null;
  }
  if (objectBucket !== bucket) return null;
  if (objectPath.split("/").some((s) => s === "." || s === "..")) return null;
  return objectPath;
}

/**
 * The name to greet a visitor by in mail sent to the address they typed, or null for a
 * neutral greeting. Only letters and single spaces, up to 40 characters: a "name" that
 * is a sentence, a link or a phone number is not echoed to a stranger's inbox.
 */
export function greetingName(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const s = v.trim().replace(/\s+/g, " ");
  if (!s || s.length > 40) return null;
  return /^[\p{L}\p{M}]+(?: [\p{L}\p{M}]+)*$/u.test(s) ? s : null;
}

/** "UTC+03:00", "UTC-05:30". */
export function offsetLabel(hours: number): string {
  const abs = Math.abs(hours);
  const h = Math.floor(abs);
  const m = Math.round((abs - h) * 60);
  return `UTC${hours < 0 ? "-" : "+"}${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

/** "15/01/2026 at 10:00 AM (UTC+02:00)": an instant on a clock at a fixed offset. */
export function timeAtOffset(instantMs: number, offsetHours: number): string {
  const w = wallClock(instantMs, offsetHours);
  return `${w.date} at ${w.time} (${offsetLabel(offsetHours)})`;
}

/** A visitor's UTC offset as the booking form sends it, or null when it is not one. */
export function visitorOffset(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) && Math.abs(v) <= 14 && Math.round(v * 4) === v * 4 ? v : null;
}

/**
 * What Settings/BookedSlots publishes: the start of each meeting that has not ended yet,
 * in time order - no names, emails, links, and no history of past calls.
 */
export function futureSlots(meetings: Array<BookedSlot | null | undefined>, nowMs: number): Array<{ start: string }> {
  return meetings
    .filter((m): m is BookedSlot => !!m && isUpcoming(m, nowMs))
    .map((m) => slotStart(m) as number)
    .sort((a, b) => a - b)
    .map((at) => ({ start: isoInstant(at) }));
}

/** Where the query for meetings that have not ended yet starts: anything starting after this. */
export function upcomingFrom(nowMs: number): string {
  return isoInstant(nowMs - MEETING_MS);
}