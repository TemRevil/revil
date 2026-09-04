/**
 * Visit recording: the only thing that writes anything under `Analytics/`.
 *
 * The browser buffers a visit and POSTs deltas here (see src/lib/analytics/
 * collector.ts); this applies them with the Admin SDK. That inversion is the whole
 * point of the rewrite - the previous design had the browser writing straight to
 * Firestore, where a rules-level rate limit silently rejected any write landing
 * inside a 5s window, so the busiest moments of a visit were exactly the ones that
 * went missing. Rules now deny every client write to Analytics outright.
 *
 * Because this endpoint is public it is App Check enforced *by hand*: onRequest
 * ignores the `enforceAppCheck` option (it is an onCall-only setting), which is why
 * the old syncSession accepted anything the internet sent it.
 *
 * Hierarchy, all under one root collection so nothing else gets disturbed:
 *   Analytics/Sessions/Items/{sessionId}   one document per visit - the story
 *   Analytics/Days/Items/{YYYY-MM-DD}      per-day rollups
 *   Analytics/Links/Items/{linkId}         share links: definition + how they're used
 *   Analytics/Socials/Items/{name}         social-link click totals
 *   Analytics/Totals                       lifetime counters
 */

import { onRequest } from "firebase-functions/v2/https";
import admin from "firebase-admin";
import nodemailer, { type Transporter } from "nodemailer";
import { defineSecret } from "firebase-functions/params";
import { lookupCountry } from "./geoip.js";

const db = () => admin.firestore();
const FV = admin.firestore.FieldValue;

// Mirrors index.ts / mcp.ts: each module declares the secrets it actually uses.
const smtpUser = defineSecret("SMTP_USER");
const resendKey = defineSecret("RESEND_API_KEY");
const HELLO_EMAIL = "hello@temrevil.com";
const SITE = "https://temrevil.com";

const SESSIONS = "Analytics/Sessions/Items";
const DAYS = "Analytics/Days/Items";
const LINKS = "Analytics/Links/Items";
const SOCIALS = "Analytics/Socials/Items";
const TOTALS = "Analytics/Totals";

/** Ceilings. Anything past these is a bug or an attack, not a visit. */
const MAX_SEQ = 300;
const MAX_EVENTS_PER_FLUSH = 120;
const MAX_EVENTS_TOTAL = 500;
const MAX_KEYS = 60;
const HOUR_MS = 60 * 60 * 1000;
const MAX_SESSION_AGE_MS = 12 * HOUR_MS;

const ID_RE = /^[a-z0-9]{1,14}-[a-z0-9]{8}$/;
const VISITOR_RE = /^v-[a-z0-9]{12}$/;
const CODE_RE = /^[A-Za-z0-9_-]{4,32}$/;

const EVENT_KINDS = new Set([
  "section", "project", "project_end", "out", "social", "social_back",
  "cv", "contact", "contact_tab", "contact_sent", "copy", "scroll",
  "idle", "wake", "hide", "show", "rage", "print", "end",
]);

// ── validation helpers ───────────────────────────────────────────────
const isObj = (v: unknown): v is Record<string, unknown> =>
  !!v && typeof v === "object" && !Array.isArray(v);

/**
 * A map key we are willing to write as a Firestore field or document id.
 * Project ids are the project documents' own ids and social names carry dashes,
 * so those stay legal; only what Firestore forbids in a path is rejected.
 */
function safeKey(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const s = v.trim();
  if (!s || s.length > 100) return null;
  if (s === "." || s === "..") return null;
  if (/[/[\]*~]/.test(s)) return null;
  if (s.startsWith("__")) return null;
  return s;
}

/** A non-negative integer, clamped. Anything else becomes 0. */
function num(v: unknown, max: number): number {
  const n = typeof v === "number" ? v : Number(v);
  if (!Number.isFinite(n) || n <= 0) return 0;
  return Math.min(Math.round(n), max);
}

function str(v: unknown, max: number): string {
  return typeof v === "string" ? v.slice(0, max) : "";
}

/** Read a delta map (`{key: number}`) with both the key set and values bounded. */
function deltaMap(v: unknown, max: number): Record<string, number> {
  const out: Record<string, number> = {};
  if (!isObj(v)) return out;
  let n = 0;
  for (const [k, raw] of Object.entries(v)) {
    if (n >= MAX_KEYS) break;
    const key = safeKey(k);
    const value = num(raw, max);
    if (!key || !value) continue;
    out[key] = value;
    n++;
  }
  return out;
}

function todayKey(): string {
  return new Date().toISOString().slice(0, 10);
}

// ── email ────────────────────────────────────────────────────────────
function createTransporter(): Transporter {
  return nodemailer.createTransport({
    host: "smtp.resend.com",
    port: 465,
    secure: true,
    auth: { user: "resend", pass: resendKey.value() },
  });
}

function escHtml(v: unknown): string {
  if (v === null || v === undefined) return "";
  return String(v)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

interface OpenedRow { label: string; value: string }

/**
 * "Someone just opened the link you made for X."
 *
 * The button deep-links to this exact visit: the dashboard parks the id, sends the
 * owner through the normal Google login, and reopens on that story. Nothing in the
 * URL is sensitive on its own - it is a session id, useless without admin auth.
 */
function openedEmailHtml(args: {
  linkName: string;
  linkFor: string;
  rows: OpenedRow[];
  storyUrl: string;
}): string {
  const rows = args.rows
    .map((r) => `
            <div class="info-row">
              <div class="info-label">${escHtml(r.label)}</div>
              <div class="info-value">${escHtml(r.value)}</div>
            </div>`)
    .join("");

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<meta name="color-scheme" content="dark"/>
<meta name="supported-color-schemes" content="dark"/>
<title>Your link was opened</title>
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
  .info-label{font-size:13px;font-weight:600;color:#666;width:130px;flex-shrink:0;text-transform:uppercase;letter-spacing:0.5px}
  .info-value{font-size:15px;color:#e0e0e0;word-break:break-word}
  .btn{display:inline-block;padding:14px 30px;background:#3395ff;color:#ffffff;text-decoration:none;border-radius:10px;font-weight:600;font-size:14px}
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
<div class="preheader">${escHtml(args.linkName)} just opened the link you sent.</div>
<div class="wrapper">
  <div class="card">
    <div class="header">
      <div class="logo">Revil<span>.</span></div>
    </div>
    <div class="body">
      <h2>${escHtml(args.linkName)} opened your link</h2>
      <p>The link you made for <strong style="color:#e0e0e0">${escHtml(args.linkFor)}</strong> is being read right now.</p>
      <div class="divider"></div>
      <div>${rows}</div>
      <div style="margin-top:28px;text-align:center">
        <a href="${escHtml(args.storyUrl)}" class="btn">Watch this visit</a>
      </div>
      <p style="margin-top:20px;font-size:13px;color:#666;text-align:center">
        Opens the dashboard on this exact visit after you sign in.
      </p>
    </div>
    <div class="footer">
      <p>Sent from <a href="${SITE}">temrevil.com</a></p>
    </div>
  </div>
</div>
</body>
</html>`;
}

async function sendOpenedEmail(args: {
  linkName: string;
  linkFor: string;
  sessionId: string;
  geo: { Country: string; Code: string } | null;
  device: Record<string, unknown>;
  visit: number;
  ref: string;
}): Promise<void> {
  const rows: OpenedRow[] = [
    { label: "Link", value: `${args.linkName} - ${args.linkFor}` },
    { label: "Where", value: args.geo ? `${args.geo.Country} (${args.geo.Code})` : "Unknown" },
    {
      label: "On",
      value: [args.device.Type, args.device.OS, args.device.Browser]
        .filter(Boolean).join(" - ") || "Unknown",
    },
    { label: "Their time", value: String(args.device.LocalTime || "-") },
    { label: "Came from", value: args.ref || "Direct" },
    { label: "Visit", value: args.visit > 1 ? `#${args.visit} - they have been here before` : "First time" },
  ];

  const html = openedEmailHtml({
    linkName: args.linkName,
    linkFor: args.linkFor,
    rows,
    storyUrl: `${SITE}/?s=${encodeURIComponent(args.sessionId)}`,
  });

  const transporter = createTransporter();
  await transporter.sendMail({
    from: `"Revil" <${HELLO_EMAIL}>`,
    to: smtpUser.value(),
    replyTo: HELLO_EMAIL,
    subject: `${args.linkName} opened your link`.replace(/[\r\n]+/g, " ").slice(0, 200),
    html,
  });
}

// ── the endpoint ─────────────────────────────────────────────────────
interface Applied {
  isNew: boolean;
  tailor?: unknown;
  link?: { Name: string; For: string };
}

export const trackSession = onRequest(
  {
    region: "us-central1",
    cors: ["https://temrevil.com", "https://www.temrevil.com", /localhost/],
    maxInstances: 20,
    secrets: [smtpUser, resendKey],
  },
  async (req, res) => {
    if (req.method !== "POST") {
      res.status(405).json({ error: "Method not allowed" });
      return;
    }

    // App Check, verified by hand - see the note at the top of this file.
    const appCheckToken = req.header("X-Firebase-AppCheck");
    if (!appCheckToken) {
      res.status(401).json({ error: "App Check token required" });
      return;
    }
    try {
      await admin.appCheck().verifyToken(appCheckToken);
    } catch {
      res.status(401).json({ error: "Invalid App Check token" });
      return;
    }

    const body = req.body as Record<string, unknown>;
    if (!isObj(body)) {
      res.status(400).json({ error: "Bad body" });
      return;
    }

    const id = str(body.id, 40);
    const seq = num(body.seq, MAX_SEQ + 1);
    const visitor = str(body.visitor, 40);
    const visit = Math.max(1, num(body.visit, 100000));

    if (!ID_RE.test(id) || !VISITOR_RE.test(visitor)) {
      res.status(400).json({ error: "Bad session identity" });
      return;
    }
    if (seq < 1 || seq > MAX_SEQ) {
      res.status(429).json({ error: "Too many flushes for one session" });
      return;
    }

    try {
      const result = await applyFlush({ id, seq, visitor, visit, body, req });
      res.status(200).json({
        ok: true,
        ...(result.tailor ? { tailor: result.tailor } : {}),
        ...(result.link ? { link: result.link } : {}),
      });
    } catch (err) {
      const message = (err as Error)?.message || "";
      if (message.startsWith("reject:")) {
        res.status(409).json({ error: message.slice(7) });
        return;
      }
      console.error("trackSession error:", err);
      res.status(500).json({ error: "Internal error" });
    }
  },
);

async function applyFlush(ctx: {
  id: string;
  seq: number;
  visitor: string;
  visit: number;
  body: Record<string, unknown>;
  req: { headers: Record<string, string | string[] | undefined>; ip?: string };
}): Promise<Applied> {
  const { id, seq, visitor, visit, body, req } = ctx;
  const now = Date.now();
  const sessionRef = db().doc(`${SESSIONS}/${id}`);
  const snap = await sessionRef.get();
  const existing = snap.exists ? (snap.data() as Record<string, unknown>) : null;

  // Idempotent: a retried or out-of-order flush is dropped rather than double-counted.
  if (existing && num(existing.Seq, MAX_SEQ) >= seq) {
    return { isNew: false };
  }
  if (existing && now - num(existing.StartedAt, Number.MAX_SAFE_INTEGER) > MAX_SESSION_AGE_MS) {
    throw new Error("reject:Session expired");
  }
  if (!existing && seq !== 1) {
    // The opening flush never arrived (blocked, offline). Start the story here
    // rather than dropping the visit entirely.
    if (seq > 10) throw new Error("reject:Unknown session");
  }

  const add = isObj(body.add) ? body.add : {};
  const set = isObj(body.set) ? body.set : {};
  const hello = isObj(body.hello) ? body.hello : null;
  const isNew = !existing;
  const owner = body.owner === true;

  // ── deltas ─────────────────────────────────────────────────────────
  const openMs = num(add.openMs, 6 * HOUR_MS);
  const activeMs = num(add.activeMs, 6 * HOUR_MS);
  const idleMs = num(add.idleMs, 6 * HOUR_MS);
  const sections = deltaMap(add.sections, 6 * HOUR_MS);
  const cvOpens = num(add.cvOpens, 500);
  const contactOpens = num(add.contactOpens, 500);
  const copies = num(add.copies, 500);
  const rage = num(add.rage, 2000);
  const prints = num(add.prints, 200);

  const projects: Record<string, Record<string, number>> = {};
  if (isObj(add.projects)) {
    let n = 0;
    for (const [rawKey, rawVal] of Object.entries(add.projects)) {
      if (n >= MAX_KEYS) break;
      const key = safeKey(rawKey);
      if (!key || !isObj(rawVal)) continue;
      const row = {
        Opens: num(rawVal.opens, 500),
        Ms: num(rawVal.ms, 6 * HOUR_MS),
        Live: num(rawVal.live, 500),
        Github: num(rawVal.github, 500),
        Download: num(rawVal.download, 500),
      };
      if (!Object.values(row).some(Boolean)) continue;
      projects[key] = row;
      n++;
    }
  }

  const socials: Record<string, Record<string, number>> = {};
  if (isObj(add.socials)) {
    let n = 0;
    for (const [rawKey, rawVal] of Object.entries(add.socials)) {
      if (n >= MAX_KEYS) break;
      const key = safeKey(rawKey);
      if (!key || !isObj(rawVal)) continue;
      const row = { Clicks: num(rawVal.clicks, 500), AwayMs: num(rawVal.awayMs, 6 * HOUR_MS) };
      if (!row.Clicks && !row.AwayMs) continue;
      socials[key] = row;
      n++;
    }
  }

  // ── absolute state ─────────────────────────────────────────────────
  const exitSection = safeKey(set.exitSection) || "";
  const scroll = deltaMap(set.scroll, 100);
  const contactTab = str(set.contactTab, 20);
  const contactSent = str(set.contactSent, 20);
  const perf = isObj(set.perf)
    ? { LoadMs: num(set.perf.LoadMs, 10 * 60_000), LcpMs: num(set.perf.LcpMs, 10 * 60_000) }
    : null;

  // ── timeline ───────────────────────────────────────────────────────
  const priorEvents = Array.isArray(existing?.Events) ? (existing!.Events as unknown[]).length : 0;
  const room = Math.max(0, MAX_EVENTS_TOTAL - priorEvents);
  const incoming = Array.isArray(body.events) ? body.events.slice(0, MAX_EVENTS_PER_FLUSH) : [];
  const events: Array<{ t: number; k: string; v?: string }> = [];
  for (const raw of incoming) {
    if (events.length >= room) break;
    if (!isObj(raw)) continue;
    const k = str(raw.k, 20);
    if (!EVENT_KINDS.has(k)) continue;
    const v = str(raw.v, 120);
    events.push({ t: num(raw.t, 24 * HOUR_MS), k, ...(v ? { v } : {}) });
  }
  const eventsCut = incoming.length > events.length;

  // ── link resolution + geo, first flush only ────────────────────────
  let linkRow: { id: string; data: Record<string, unknown> } | null = null;
  let geo: { Country: string; Code: string } | null = null;
  let device: Record<string, unknown> = {};
  let entry: Record<string, unknown> = {};

  if (isNew) {
    // A flush can arrive without its opening one (the first POST was blocked or the
    // tab was offline). Everything below tolerates a missing `hello`.
    geo = lookupCountry(req.headers, req.ip);
    device = readDevice(hello?.device);
    entry = readEntry(hello?.entry);
  }
  if (hello) {
    const code = str(hello.code, 40);
    if (CODE_RE.test(code)) {
      const found = await db().collection(LINKS).where("Code", "==", code).limit(1).get();
      if (!found.empty) {
        linkRow = { id: found.docs[0].id, data: found.docs[0].data() as Record<string, unknown> };
      }
    }
  }

  // ── the writes ─────────────────────────────────────────────────────
  const batch = db().batch();
  const day = todayKey();

  const sessionPatch: Record<string, unknown> = {
    Id: id,
    Visitor: visitor,
    Visit: visit,
    Seq: seq,
    Flushes: FV.increment(1),
    LastSeenAt: now,
    OpenMs: FV.increment(openMs),
    ActiveMs: FV.increment(activeMs),
    IdleMs: FV.increment(idleMs),
    Copies: FV.increment(copies),
    Rage: FV.increment(rage),
    Prints: FV.increment(prints),
    Cv: { Opens: FV.increment(cvOpens) },
    Contact: {
      Opens: FV.increment(contactOpens),
      ...(contactTab ? { Tab: contactTab } : {}),
      ...(contactSent ? { Sent: contactSent } : {}),
    },
  };

  if (Object.keys(sections).length) {
    sessionPatch.Sections = mapIncrements(sections);
  }
  if (Object.keys(scroll).length) sessionPatch.Scroll = scroll;
  if (Object.keys(projects).length) {
    sessionPatch.Projects = Object.fromEntries(
      Object.entries(projects).map(([k, v]) => [k, mapIncrements(v)]),
    );
  }
  if (Object.keys(socials).length) {
    sessionPatch.Socials = Object.fromEntries(
      Object.entries(socials).map(([k, v]) => [k, mapIncrements(v)]),
    );
  }
  if (exitSection) sessionPatch.Exit = { Section: exitSection };
  if (perf) sessionPatch.Perf = perf;
  if (events.length) sessionPatch.Events = FV.arrayUnion(...events);
  if (eventsCut) sessionPatch.EventsCut = true;
  if (owner) sessionPatch.Owner = true;

  if (isNew) {
    sessionPatch.StartedAt = num(hello?.startedAt, now) || now;
    sessionPatch.Ended = false;
    sessionPatch.EndedAt = null;
    sessionPatch.Entry = entry;
    sessionPatch.Device = device;
    if (geo) sessionPatch.Geo = geo;
    sessionPatch.Link = linkRow
      ? {
        Id: linkRow.id,
        Code: str(linkRow.data.Code, 40),
        Name: str(linkRow.data.Name, 120),
        For: str(linkRow.data.For, 120),
      }
      : null;
  }

  if (body.end === true) {
    sessionPatch.Ended = true;
    sessionPatch.EndedAt = now;
  }

  batch.set(sessionRef, sessionPatch, { merge: true });

  // Owner visits are recorded (so the tab that flipped the switch has a record)
  // but never counted: they would drown the real numbers.
  if (!owner && !existing?.Owner) {
    const dayPatch: Record<string, unknown> = {
      ActiveMs: FV.increment(activeMs),
      Projects: FV.increment(sumBy(projects, "Opens")),
      Socials: FV.increment(sumBy(socials, "Clicks")),
      Contacts: FV.increment(contactOpens),
      Cv: FV.increment(cvOpens),
    };
    const totalsPatch: Record<string, unknown> = {
      LastAt: now,
      Events: FV.increment(events.length),
      Projects: FV.increment(sumBy(projects, "Opens")),
      Socials: FV.increment(sumBy(socials, "Clicks")),
      Contacts: FV.increment(contactOpens),
      Cv: FV.increment(cvOpens),
    };

    if (isNew) {
      dayPatch.Sessions = FV.increment(1);
      totalsPatch.Sessions = FV.increment(1);
      if (visit <= 1) {
        dayPatch.Visitors = FV.increment(1);
        totalsPatch.Visitors = FV.increment(1);
      } else {
        dayPatch.Returning = FV.increment(1);
      }
      if (geo) dayPatch.Countries = { [geo.Code]: FV.increment(1) };
      const deviceType = safeKey(device.Type);
      if (deviceType) dayPatch.Devices = { [deviceType]: FV.increment(1) };
      if (linkRow) {
        dayPatch.LinkOpens = FV.increment(1);
        totalsPatch.LinkOpens = FV.increment(1);
      }
    }

    batch.set(db().doc(`${DAYS}/${day}`), dayPatch, { merge: true });
    batch.set(db().doc(TOTALS), totalsPatch, { merge: true });

    // Per-project engagement stays on the project itself: the public project modal
    // shows these counts. What changed is that only this function can write them.
    for (const [projectId, row] of Object.entries(projects)) {
      const views: Record<string, unknown> = {};
      if (row.Opens) views.Project = FV.increment(row.Opens);
      if (row.Live) views.Live = FV.increment(row.Live);
      if (row.Github) views.Github = FV.increment(row.Github);
      if (row.Download) views.Download = FV.increment(row.Download);
      if (Object.keys(views).length) {
        batch.set(db().doc(`Projects/${projectId}`), { Views: views }, { merge: true });
      }
    }

    for (const [name, row] of Object.entries(socials)) {
      batch.set(db().doc(`${SOCIALS}/${name}`), {
        Clicks: FV.increment(row.Clicks),
        AwayMs: FV.increment(row.AwayMs),
        LastAt: now,
      }, { merge: true });
    }

    if (isNew && linkRow) {
      batch.set(db().doc(`${LINKS}/${linkRow.id}`), {
        Opens: FV.increment(1),
        Sessions: FV.increment(1),
        LastOpenAt: now,
      }, { merge: true });
    }
  }

  await batch.commit();

  // Notification last: a mail failure must never cost us the visit.
  if (isNew && !owner && linkRow && linkRow.data.Notify === true) {
    try {
      await sendOpenedEmail({
        linkName: str(linkRow.data.Name, 120) || "Someone",
        linkFor: str(linkRow.data.For, 120) || "your portfolio",
        sessionId: id,
        geo,
        device,
        visit,
        ref: str((entry as { Ref?: string }).Ref, 120),
      });
    } catch (err) {
      console.error("link-open notification failed:", err);
    }
  }

  const tailor = linkRow ? readTailor(linkRow.data.Tailor) : null;
  return {
    isNew,
    ...(tailor ? { tailor } : {}),
    ...(linkRow ? { link: { Name: str(linkRow.data.Name, 120), For: str(linkRow.data.For, 120) } } : {}),
  };
}

// ── small shapers ────────────────────────────────────────────────────
function mapIncrements(row: Record<string, number>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(row).map(([k, v]) => [k, FV.increment(v)]));
}

function sumBy(rows: Record<string, Record<string, number>>, field: string): number {
  return Object.values(rows).reduce((total, row) => total + (row[field] || 0), 0);
}

function readDevice(raw: unknown): Record<string, unknown> {
  const d = isObj(raw) ? raw : {};
  const type = str(d.Type, 10);
  return {
    Type: type === "phone" || type === "tablet" ? type : "desktop",
    OS: str(d.OS, 20),
    Browser: str(d.Browser, 20),
    Screen: str(d.Screen, 20),
    Viewport: str(d.Viewport, 20),
    Language: str(d.Language, 20),
    Theme: str(d.Theme, 10) === "light" ? "light" : "dark",
    Timezone: str(d.Timezone, 60),
    LocalTime: str(d.LocalTime, 10),
    Touch: d.Touch === true,
  };
}

function readEntry(raw: unknown): Record<string, unknown> {
  const e = isObj(raw) ? raw : {};
  const utm: Record<string, string> = {};
  if (isObj(e.Utm)) {
    for (const [k, v] of Object.entries(e.Utm).slice(0, 5)) {
      const key = safeKey(k);
      if (key) utm[key] = str(v, 80);
    }
  }
  return {
    Section: safeKey(e.Section) || "home",
    Path: str(e.Path, 200),
    Referrer: str(e.Referrer, 300),
    Ref: str(e.Ref, 120),
    Utm: utm,
  };
}

function readTailor(raw: unknown): { AutoCv: boolean; Greeting: string; Pinned: string[] } {
  const t = isObj(raw) ? raw : {};
  const pinned = Array.isArray(t.Pinned)
    ? t.Pinned.map((p) => safeKey(p)).filter((p): p is string => !!p).slice(0, 12)
    : [];
  return {
    AutoCv: t.AutoCv === true,
    Greeting: str(t.Greeting, 160),
    Pinned: pinned,
  };
}
