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
import { getAppCheck } from "firebase-admin/app-check";
import { getAuth } from "firebase-admin/auth";
import { FieldValue, getFirestore, type DocumentSnapshot } from "firebase-admin/firestore";
import { clientIp, lookupCountry } from "./geoip.js";
import { HELLO_EMAIL, smtpUser } from "./mail.js";
import { escapeHtml as escHtml } from "./html.js";
import { emailShell, SITE_URL } from "./emailShell.js";
import { enqueueMail, jobId, type MailMessage } from "./outbox.js";
import { quota, readQuotas, takeQuotas } from "./limits.js";

const db = () => getFirestore();
const FV = FieldValue;


const SESSIONS = "Analytics/Sessions/Items";
const DAYS = "Analytics/Days/Items";
const LINKS = "Analytics/Links/Items";
const SOCIALS = "Analytics/Socials/Items";
const SOURCES = "Analytics/Sources/Items";
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

/**
 * One spelling per social network.
 *
 * The name reaches us from whatever the site had stored for that link, and the two
 * places that render social links read it from different documents - so the same
 * network arrived as both "GitHub" and "Github", and as both "LinkedIn" and
 * "Linkedin". Each spelling opened its own counter document and the real click
 * count was split between them. Folding case here, at the one point every writer
 * passes through, means it cannot happen again whatever a caller sends.
 */
const SOCIAL_NAMES: Record<string, string> = {
  github: "GitHub", gitlab: "GitLab", linkedin: "LinkedIn", instagram: "Instagram",
  facebook: "Facebook", threads: "Threads", tiktok: "TikTok", youtube: "YouTube",
  twitter: "Twitter", x: "X", behance: "Behance", dribbble: "Dribbble",
  medium: "Medium", whatsapp: "WhatsApp", telegram: "Telegram", discord: "Discord",
  pinterest: "Pinterest", reddit: "Reddit", twitch: "Twitch", spotify: "Spotify",
  email: "Email", mail: "Email",
};

export function canonicalSocial(name: string): string {
  // An unknown name is one "Other" row: the name arrives in the request, and each
  // new spelling would otherwise open its own counter document.
  return SOCIAL_NAMES[name.trim().toLowerCase()] || "Other";
}

/**
 * Where a visit came from, as one name and one kind.
 *
 * A referrer host is no longer the whole answer. Assistants are the reason: some
 * arrive with no referrer at all and nothing but ?utm_source=chatgpt.com to go on,
 * some send a referrer naming the company rather than the surface, and the same
 * origin reaches us spelled three ways across the two. So the query string is read
 * first, the referrer second, and both fold onto one canonical name - one row for
 * ChatGPT, not one each for "chatgpt.com", "chat.openai.com" and "openai".
 *
 * Kind is what the name is FOR. "ai" is the interesting one - someone asked an
 * assistant and it sent them here - kept apart from ordinary search, social and
 * plain links so it can be counted on its own.
 */
type SourceKind = "ai" | "search" | "social" | "mail" | "referral" | "direct";

/** Host patterns, most specific first: copilot before bing, gemini before google. */
const SOURCE_HOSTS: Array<[RegExp, string, SourceKind]> = [
  [/(^|\.)chatgpt\.com$|(^|\.)openai\.com$/, "ChatGPT", "ai"],
  [/(^|\.)claude\.ai$|(^|\.)anthropic\.com$/, "Claude", "ai"],
  [/(^|\.)perplexity\.ai$/, "Perplexity", "ai"],
  [/^(gemini|bard|aistudio)\.google\.com$/, "Gemini", "ai"],
  [/(^|\.)copilot\.microsoft\.com$|(^|\.)copilot\.cloud\.microsoft$/, "Copilot", "ai"],
  [/(^|\.)grok\.com$|(^|\.)x\.ai$/, "Grok", "ai"],
  [/(^|\.)meta\.ai$/, "Meta AI", "ai"],
  [/(^|\.)deepseek\.com$/, "DeepSeek", "ai"],
  [/(^|\.)mistral\.ai$/, "Le Chat", "ai"],
  [/(^|\.)poe\.com$/, "Poe", "ai"],
  [/(^|\.)you\.com$/, "You.com", "ai"],
  [/(^|\.)phind\.com$/, "Phind", "ai"],
  [/(^|\.)t3\.chat$/, "T3 Chat", "ai"],
  [/(^|\.)kagi\.com$/, "Kagi", "search"],
  [/(^|\.)google\.[a-z.]{2,7}$/, "Google", "search"],
  [/(^|\.)bing\.com$/, "Bing", "search"],
  [/(^|\.)duckduckgo\.com$/, "DuckDuckGo", "search"],
  [/(^|\.)ecosia\.org$/, "Ecosia", "search"],
  [/(^|\.)search\.brave\.com$/, "Brave Search", "search"],
  [/(^|\.)yandex\.[a-z.]{2,7}$/, "Yandex", "search"],
  [/(^|\.)baidu\.com$/, "Baidu", "search"],
  [/(^|\.)linkedin\.com$|(^|\.)lnkd\.in$/, "LinkedIn", "social"],
  [/(^|\.)x\.com$|(^|\.)twitter\.com$|(^|\.)t\.co$/, "X", "social"],
  [/(^|\.)facebook\.com$|(^|\.)fb\.com$|(^|\.)fb\.me$/, "Facebook", "social"],
  [/(^|\.)instagram\.com$/, "Instagram", "social"],
  [/(^|\.)threads\.(net|com)$/, "Threads", "social"],
  [/(^|\.)tiktok\.com$/, "TikTok", "social"],
  [/(^|\.)youtube\.com$|(^|\.)youtu\.be$/, "YouTube", "social"],
  [/(^|\.)reddit\.com$/, "Reddit", "social"],
  [/(^|\.)t\.me$|(^|\.)telegram\.me$/, "Telegram", "social"],
  [/(^|\.)wa\.me$|(^|\.)whatsapp\.com$/, "WhatsApp", "social"],
  [/(^|\.)discord\.(com|gg)$/, "Discord", "social"],
  [/(^|\.)pinterest\.[a-z.]{2,7}$/, "Pinterest", "social"],
  [/(^|\.)medium\.com$/, "Medium", "social"],
  [/(^|\.)behance\.net$/, "Behance", "social"],
  [/(^|\.)dribbble\.com$/, "Dribbble", "social"],
  [/(^|\.)github\.com$/, "GitHub", "referral"],
  [/(^|\.)stackoverflow\.com$/, "Stack Overflow", "referral"],
  [/(^|\.)news\.ycombinator\.com$/, "Hacker News", "referral"],
  [/(^|\.)producthunt\.com$/, "Product Hunt", "referral"],
  [/(^|\.)mail\.google\.com$/, "Gmail", "mail"],
  [/(^|\.)outlook\.(com|live|office)\.?[a-z]*$/, "Outlook", "mail"],
];

/** Bare utm_source words ("chatgpt", "linkedin") pointed at the host they mean. */
const SOURCE_WORDS: Record<string, string> = {
  chatgpt: "chatgpt.com", gpt: "chatgpt.com", openai: "openai.com",
  claude: "claude.ai", anthropic: "anthropic.com",
  perplexity: "perplexity.ai", gemini: "gemini.google.com", bard: "gemini.google.com",
  copilot: "copilot.microsoft.com", grok: "grok.com", deepseek: "deepseek.com",
  mistral: "mistral.ai", lechat: "mistral.ai", poe: "poe.com", meta: "meta.ai",
  google: "google.com", bing: "bing.com", duckduckgo: "duckduckgo.com", ddg: "duckduckgo.com",
  kagi: "kagi.com", brave: "search.brave.com", yandex: "yandex.com", baidu: "baidu.com",
  linkedin: "linkedin.com", twitter: "x.com", x: "x.com",
  facebook: "facebook.com", fb: "facebook.com", instagram: "instagram.com", ig: "instagram.com",
  threads: "threads.net", tiktok: "tiktok.com", youtube: "youtube.com", yt: "youtube.com",
  reddit: "reddit.com", telegram: "t.me", whatsapp: "wa.me", discord: "discord.com",
  pinterest: "pinterest.com", medium: "medium.com", behance: "behance.net",
  dribbble: "dribbble.com", github: "github.com", stackoverflow: "stackoverflow.com",
  hn: "news.ycombinator.com", hackernews: "news.ycombinator.com",
  producthunt: "producthunt.com", gmail: "mail.google.com", outlook: "outlook.com",
};

function matchSourceHost(host: string): [string, SourceKind] | null {
  for (const [re, name, kind] of SOURCE_HOSTS) {
    if (re.test(host)) return [name, kind];
  }
  return null;
}

export function classifySource(entry: Record<string, unknown>): { Name: string; Kind: SourceKind } {
  const utm = isObj(entry.Utm) ? (entry.Utm as Record<string, string>) : {};
  const medium = String(utm.medium || "").trim().toLowerCase();

  // What the LINK claims beats what the browser reports: an assistant that strips
  // the referrer still tags the URL, and that tag is the only thing naming it.
  let token = String(utm.source || utm.ref || "").trim().toLowerCase();
  if (!token) token = String(entry.Ref || "").trim().toLowerCase();
  if (!token && utm.gclid) token = "google.com";
  if (!token && utm.fbclid) token = "facebook.com";

  if (!token) return { Name: "Direct", Kind: "direct" };
  if (token === "email" || token === "newsletter" || medium === "email") {
    return { Name: token === "newsletter" ? "Newsletter" : "Email", Kind: "mail" };
  }

  const host = (SOURCE_WORDS[token.replace(/[^a-z0-9.]/g, "")] || token).replace(/^www\./, "");
  const hit = matchSourceHost(host);
  if (hit) return { Name: hit[0], Kind: hit[1] };

  // Nothing we have a name for: a real host stays as it is, one row per origin. Any
  // other word (it comes straight from the URL, so it can be anything) is "Other",
  // so made-up names can't each open a counter document.
  return HOSTNAME_RE.test(host) ? { Name: host, Kind: "referral" } : { Name: "Other", Kind: "referral" };
}

const HOSTNAME_RE = /^(?=.{4,60}$)[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)*\.[a-z]{2,24}$/;

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
/** At most one "link opened" email per link per hour, however many visits it gets. */
const LINK_MAIL_EVERY_MS = HOUR_MS;

/**
 * "Someone just opened the link you made for X."
 *
 * The button deep-links to this exact visit: the dashboard parks the id, sends the
 * owner through the normal Google login, and reopens on that story. Nothing in the
 * URL is sensitive on its own - it is a session id, useless without admin auth.
 */
function openedEmail(args: {
  linkName: string;
  linkFor: string;
  sessionId: string;
  geo: { Country: string; Code: string } | null;
  device: Record<string, unknown>;
  visit: number;
  ref: string;
}): MailMessage {
  const rows: Array<[string, string]> = [
    ["Link", `${args.linkName} - ${args.linkFor}`],
    ["Where", args.geo ? `${args.geo.Country} (${args.geo.Code})` : "Unknown"],
    ["On", [args.device.Type, args.device.OS, args.device.Browser].filter(Boolean).join(" - ") || "Unknown"],
    ["Their time", String(args.device.LocalTime || "-")],
    ["Came from", args.ref || "Direct"],
    ["Visit", args.visit > 1 ? `#${args.visit} - they have been here before` : "First time"],
  ];
  const storyUrl = `${SITE_URL}/?s=${encodeURIComponent(args.sessionId)}`;
  return {
    to: smtpUser.value(),
    fromName: "Revil",
    replyTo: HELLO_EMAIL,
    subject: `${args.linkName} opened your link`.replace(/[\r\n]+/g, " ").slice(0, 200),
    label: "Link opened",
    html: emailShell({
      title: "Your link was opened",
      preheader: `${args.linkName} just opened the link you sent.`,
      bodyHtml: `
      <h2>${escHtml(args.linkName)} opened your link</h2>
      <p>The link you made for <strong>${escHtml(args.linkFor)}</strong> is being read right now.</p>
      <div class="divider"></div>
      <div>${rows.map(([label, value], i) => `
            <div class="info-row"${i === rows.length - 1 ? ' style="border:none"' : ""}>
              <div class="info-label">${escHtml(label)}</div>
              <div class="info-value">${escHtml(value)}</div>
            </div>`).join("")}</div>
      <div style="margin-top:28px;text-align:center">
        <a href="${escHtml(storyUrl)}" class="btn">Watch this visit</a>
      </div>
      <p style="margin-top:20px;font-size:13px;text-align:center">
        Opens the dashboard on this exact visit after you sign in.
      </p>`,
    }),
  };
}

// ── the endpoint ─────────────────────────────────────────────────────
interface Applied {
  isNew: boolean;
  tailor?: unknown;
  link?: { Name: string; For: string };
}

/** New visits one IP may open per hour. A real reader opens a handful. */
const NEW_SESSIONS_PER_IP_HOUR = 30;

/** Exact origins only: the old /localhost/ also matched https://localhost.evil.example. */
export const LOCAL_ORIGIN_RE = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/;

/**
 * Whether the caller is the owner: a Firebase ID token carrying the `admin` claim in
 * the Authorization header. The body's word for it is not taken any more - anyone
 * could send `owner: true` and hide their visits, or not send it and inflate counts.
 */
async function isOwnerRequest(authorization: string | undefined): Promise<boolean> {
  const m = /^Bearer\s+(\S+)$/.exec(authorization || "");
  if (!m) return false;
  try {
    return (await getAuth().verifyIdToken(m[1])).admin === true;
  } catch {
    return false;
  }
}

export const trackSession = onRequest(
  {
    region: "us-central1",
    cors: ["https://temrevil.com", "https://www.temrevil.com", LOCAL_ORIGIN_RE],
    maxInstances: 20,
    secrets: [smtpUser],
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
      await getAppCheck().verifyToken(appCheckToken);
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
    const fid = str(body.fid, 40);

    if (!ID_RE.test(id) || !VISITOR_RE.test(visitor) || (fid && !FID_RE.test(fid))) {
      res.status(400).json({ error: "Bad session identity" });
      return;
    }
    if (seq < 1 || seq > MAX_SEQ) {
      res.status(429).json({ error: "Too many flushes for one session" });
      return;
    }

    try {
      const owner = await isOwnerRequest(req.header("Authorization"));
      const result = await applyFlush({ id, seq, fid, visitor, visit, owner, body, req });
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
      if (message.startsWith("limit:")) {
        res.status(429).json({ error: message.slice(6) });
        return;
      }
      console.error("trackSession error:", message);
      res.status(500).json({ error: "Internal error" });
    }
  },
);

/** A flush id: the client's name for one POST, the same on every resend of it. */
const FID_RE = /^[a-z0-9]{6,32}$/;
/** How many recent flush ids a session remembers, to drop a resent one. */
const MAX_FIDS = 50;

/**
 * What to do with a flush, given the session as stored.
 *   apply     - new: count it, and take its absolute state (exit section, scroll...)
 *   late      - an older flush that never landed, resent after a newer one did:
 *               count it, but don't let its state overwrite the newer state
 *   duplicate - already applied (its id is on the session, or it carries no id and
 *               its seq is not newer): drop it
 */
export function flushDecision(existing: Record<string, unknown> | null, seq: number, fid: string): "apply" | "late" | "duplicate" {
  if (!existing) return "apply";
  const fids = Array.isArray(existing.Fids) ? existing.Fids : [];
  if (fid && fids.includes(fid)) return "duplicate";
  if (num(existing.Seq, MAX_SEQ) >= seq) return fid ? "late" : "duplicate";
  return "apply";
}

async function applyFlush(ctx: {
  id: string;
  seq: number;
  fid: string;
  visitor: string;
  visit: number;
  owner: boolean;
  body: Record<string, unknown>;
  req: { headers: Record<string, string | string[] | undefined>; ip?: string };
}): Promise<Applied> {
  const { id, seq, fid, visitor, visit, owner, body, req } = ctx;
  const sessionRef = db().doc(`${SESSIONS}/${id}`);

  const add = isObj(body.add) ? body.add : {};
  const set = isObj(body.set) ? body.set : {};
  const hello = isObj(body.hello) ? body.hello : null;

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
      const safe = safeKey(rawKey);
      if (!safe || !isObj(rawVal)) continue;
      // One document per network, not one per spelling.
      const key = canonicalSocial(safe);
      const row = { Clicks: num(rawVal.clicks, 500), AwayMs: num(rawVal.awayMs, 6 * HOUR_MS) };
      if (!row.Clicks && !row.AwayMs) continue;
      const prev = socials[key];
      socials[key] = prev
        ? { Clicks: prev.Clicks + row.Clicks, AwayMs: prev.AwayMs + row.AwayMs }
        : row;
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

  const incoming = Array.isArray(body.events) ? body.events.slice(0, MAX_EVENTS_PER_FLUSH) : [];
  const code = hello ? str(hello.code, 40) : "";
  const ip = clientIp(req.headers, req.ip) || "unknown";
  const visitQuota = quota("visit-ip", ip, NEW_SESSIONS_PER_IP_HOUR, HOUR_MS, "Too many visits from this address");

  // ── one transaction: read everything, then write everything ───────
  // Two flushes of one session (the timer and the unload one, or a resend) used to
  // both read the session, both see it as new, and both count it. Now the second
  // transaction to commit retries and reads what the first wrote.
  const outcome = await db().runTransaction(async (tx) => {
    const now = Date.now();
    const snap = await tx.get(sessionRef);
    const existing = snap.exists ? (snap.data() as Record<string, unknown>) : null;

    const decision = flushDecision(existing, seq, fid);
    if (decision === "duplicate") return { applied: { isNew: false } as Applied, mail: null };
    if (existing && now - num(existing.FirstSeenAt ?? existing.StartedAt, Number.MAX_SAFE_INTEGER) > MAX_SESSION_AGE_MS) {
      throw new Error("reject:Session expired");
    }
    if (!existing && seq > 10) {
      // The opening flush never arrived (blocked, offline): start the story here
      // rather than dropping the visit - but not from deep inside one.
      throw new Error("reject:Unknown session");
    }
    const isNew = !existing;
    const late = decision === "late";

    // Reads that depend on the session.
    let quotaSnaps: DocumentSnapshot[] = [];
    if (isNew) quotaSnaps = await readQuotas(tx, db(), [visitQuota]);
    let linkRow: { id: string; data: Record<string, unknown> } | null = null;
    if (CODE_RE.test(code)) {
      const found = await tx.get(db().collection(LINKS).where("Code", "==", code).limit(1));
      if (!found.empty) linkRow = { id: found.docs[0].id, data: found.docs[0].data() as Record<string, unknown> };
    }

    // ── timeline ───────────────────────────────────────────────────
    const priorEvents = Array.isArray(existing?.Events) ? (existing!.Events as unknown[]).length : 0;
    const room = Math.max(0, MAX_EVENTS_TOTAL - priorEvents);
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

    // ── link resolution + geo, first flush only ────────────────────
    let geo: { Country: string; Code: string } | null = null;
    let device: Record<string, unknown> = {};
    let entry: Record<string, unknown> = {};
    let source: { Name: string; Kind: SourceKind } | null = null;
    if (isNew) {
      // A flush can arrive without its opening one (the first POST was blocked or
      // the tab was offline). Everything below tolerates a missing `hello`.
      geo = lookupCountry(req.headers, req.ip);
      device = readDevice(hello?.device);
      entry = readEntry(hello?.entry);
      source = classifySource(entry);
    }

    // What this flush counts, or takes back.
    const counting = !owner && !existing?.Owner;
    const adding: Counts | null = counting ? {
      opened: isNew,
      visit,
      countryCode: geo?.Code || "",
      source,
      deviceType: safeKey(device.Type) || "",
      linkId: isNew && linkRow ? linkRow.id : "",
      activeMs,
      projects,
      socials,
      contactOpens,
      cvOpens,
      events: events.length,
    } : null;
    // Recognised as the owner part-way through the visit: every flush before this one
    // was counted as a stranger's. Take them back out, or the totals and the link's
    // card would count a visit that Trails hides as the owner's own.
    const takeBack = owner && existing && !existing.Owner ? countedSoFar(existing) : null;
    const takeDay = existing ? dayOf(existing.FirstSeenAt ?? existing.StartedAt) : todayKey();

    // Which counter documents exist: projects are never created by a count, and a
    // take-back never creates anything.
    const paths = [...new Set([
      ...(adding ? countPaths(adding, todayKey()).filter((p) => p.startsWith("Projects/")) : []),
      ...(takeBack ? countPaths(takeBack, takeDay) : []),
    ])];
    const existingPaths = new Set<string>();
    if (paths.length) {
      const snaps = await tx.getAll(...paths.map((p) => db().doc(p)));
      snaps.forEach((s, i) => { if (s.exists) existingPaths.add(paths[i]); });
    }

    // ── writes ─────────────────────────────────────────────────────
    if (isNew && takeQuotas(tx, db(), [visitQuota], quotaSnaps, now)) {
      throw new Error(`limit:${visitQuota.message}`);
    }

    const sessionPatch: Record<string, unknown> = {
      Id: id,
      Visitor: visitor,
      Visit: visit,
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
        ...(!late && contactTab ? { Tab: contactTab } : {}),
        ...(!late && contactSent ? { Sent: contactSent } : {}),
      },
    };
    if (!late) sessionPatch.Seq = seq;
    if (fid) {
      const fids = Array.isArray(existing?.Fids) ? (existing!.Fids as unknown[]).filter((f) => typeof f === "string") : [];
      sessionPatch.Fids = [...fids, fid].slice(-MAX_FIDS);
    }
    if (Object.keys(sections).length) sessionPatch.Sections = mapIncrements(sections);
    if (!late && Object.keys(scroll).length) sessionPatch.Scroll = scroll;
    if (Object.keys(projects).length) {
      sessionPatch.Projects = Object.fromEntries(Object.entries(projects).map(([k, v]) => [k, mapIncrements(v)]));
    }
    if (Object.keys(socials).length) {
      sessionPatch.Socials = Object.fromEntries(Object.entries(socials).map(([k, v]) => [k, mapIncrements(v)]));
    }
    if (!late && exitSection) sessionPatch.Exit = { Section: exitSection };
    if (!late && perf) sessionPatch.Perf = perf;
    if (events.length) sessionPatch.Events = FV.arrayUnion(...events);
    if (eventsCut) sessionPatch.EventsCut = true;
    if (owner) sessionPatch.Owner = true;

    if (isNew) {
      sessionPatch.StartedAt = num(hello?.startedAt, now) || now;
      // The server's own clock: the day the visit was counted under, whatever the
      // browser claims its start was.
      sessionPatch.FirstSeenAt = now;
      sessionPatch.Ended = false;
      sessionPatch.EndedAt = null;
      sessionPatch.Entry = entry;
      if (source) sessionPatch.Source = source;
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
    tx.set(sessionRef, sessionPatch, { merge: true });

    // Owner visits are recorded (so the tab that flipped the switch has a record)
    // but never counted: they would drown the real numbers.
    const write = (path: string, data: Record<string, unknown>) => tx.set(db().doc(path), data, { merge: true });
    if (adding) addCounts(write, adding, 1, todayKey(), now, existingPaths);
    if (takeBack) addCounts(write, takeBack, -1, takeDay, now, existingPaths);

    // The link-opened email, at most once an hour per link.
    let mail: MailMessage | null = null;
    if (isNew && !owner && linkRow && linkRow.data.Notify === true
      && now - num(linkRow.data.LastMailAt, Number.MAX_SAFE_INTEGER) >= LINK_MAIL_EVERY_MS) {
      write(`${LINKS}/${linkRow.id}`, { LastMailAt: now });
      mail = openedEmail({
        linkName: str(linkRow.data.Name, 120) || "Someone",
        linkFor: str(linkRow.data.For, 120) || "your portfolio",
        sessionId: id,
        geo,
        device,
        visit,
        ref: str((entry as { Ref?: string }).Ref, 120),
      });
    }

    const tailor = linkRow ? readTailor(linkRow.data.Tailor) : null;
    const applied: Applied = {
      isNew,
      ...(tailor ? { tailor } : {}),
      ...(linkRow ? { link: { Name: str(linkRow.data.Name, 120), For: str(linkRow.data.For, 120) } } : {}),
    };
    return { applied, mail };
  });

  // Queued after the commit: a mail failure must never cost us the visit, and the
  // job id makes a second queueing for this visit a no-op.
  if (outcome.mail) {
    try {
      await enqueueMail(jobId("link-open", id), outcome.mail);
    } catch (err) {
      console.error("link-open notification could not be queued:", (err as Error)?.message);
    }
  }
  return outcome.applied;
}

// ── counting ─────────────────────────────────────────────────────────
/** What one visit adds to the rollups: a flush's deltas, or a whole visit so far. */
interface Counts {
  /** The visit itself: sessions, visitors, country, source, device, link open. */
  opened: boolean;
  visit: number;
  countryCode: string;
  source: { Name: string; Kind: SourceKind } | null;
  deviceType: string;
  linkId: string;
  activeMs: number;
  projects: Record<string, Record<string, number>>;
  socials: Record<string, Record<string, number>>;
  contactOpens: number;
  cvOpens: number;
  events: number;
}

/** Every counter document a Counts touches. */
function countPaths(c: Counts, day: string): string[] {
  const sourceKey = c.opened && c.source ? safeKey(c.source.Name) : null;
  return [
    `${DAYS}/${day}`,
    TOTALS,
    ...(sourceKey ? [`${SOURCES}/${sourceKey}`] : []),
    ...Object.keys(c.projects).map((id) => `Projects/${id}`),
    ...Object.keys(c.socials).map((name) => `${SOCIALS}/${name}`),
    ...(c.opened && c.linkId ? [`${LINKS}/${c.linkId}`] : []),
  ];
}

/**
 * Add a visit's counts to the day, the totals, the projects, the socials, the
 * sources and its link (sign 1), or take them back out (sign -1). `exists` holds
 * the counter documents read as existing in this transaction: a project is only
 * ever counted when it exists, and taking back never creates a document - a link,
 * source or day removed since stays removed, with no negative leftovers.
 */
function addCounts(
  write: (path: string, data: Record<string, unknown>) => void,
  c: Counts,
  sign: 1 | -1,
  day: string,
  now: number,
  exists: Set<string>,
): void {
  const inc = (n: number) => FV.increment(sign * n);
  const put = (path: string, data: Record<string, unknown>) => {
    if (sign > 0 || exists.has(path)) write(path, data);
  };
  const projectOpens = sumBy(c.projects, "Opens");
  const socialClicks = sumBy(c.socials, "Clicks");

  const dayPatch: Record<string, unknown> = {
    ActiveMs: inc(c.activeMs),
    Projects: inc(projectOpens),
    Socials: inc(socialClicks),
    Contacts: inc(c.contactOpens),
    Cv: inc(c.cvOpens),
  };
  const totalsPatch: Record<string, unknown> = {
    Events: inc(c.events),
    Projects: inc(projectOpens),
    Socials: inc(socialClicks),
    Contacts: inc(c.contactOpens),
    Cv: inc(c.cvOpens),
  };
  if (sign > 0) totalsPatch.LastAt = now;

  if (c.opened) {
    dayPatch.Sessions = inc(1);
    totalsPatch.Sessions = inc(1);
    if (c.visit <= 1) {
      dayPatch.Visitors = inc(1);
      totalsPatch.Visitors = inc(1);
    } else {
      dayPatch.Returning = inc(1);
    }
    if (c.countryCode) dayPatch.Countries = { [c.countryCode]: inc(1) };
    const sourceKey = c.source ? safeKey(c.source.Name) : null;
    if (c.source && sourceKey) {
      dayPatch.Sources = { [sourceKey]: inc(1) };
      // One document per origin, the same shape the socials rollup uses, so the
      // dashboard can list them without reading every session back.
      put(`${SOURCES}/${sourceKey}`, sign > 0
        ? { Name: c.source.Name, Kind: c.source.Kind, Sessions: inc(1), LastAt: now }
        : { Sessions: inc(1) });
    }
    if (c.deviceType) dayPatch.Devices = { [c.deviceType]: inc(1) };
    if (c.linkId) {
      dayPatch.LinkOpens = inc(1);
      totalsPatch.LinkOpens = inc(1);
    }
  }

  put(`${DAYS}/${day}`, dayPatch);
  put(TOTALS, totalsPatch);

  // Per-project engagement stays on the project itself: the public project modal
  // shows these counts. The id comes from the caller's payload, so only a project
  // that already exists is counted - never created as a junk document in the
  // publicly readable Projects collection.
  for (const [projectId, row] of Object.entries(c.projects)) {
    const path = `Projects/${projectId}`;
    if (!exists.has(path)) continue;
    const views: Record<string, unknown> = {};
    if (row.Opens) views.Project = inc(row.Opens);
    if (row.Live) views.Live = inc(row.Live);
    if (row.Github) views.Github = inc(row.Github);
    if (row.Download) views.Download = inc(row.Download);
    if (Object.keys(views).length) write(path, { Views: views });
  }

  for (const [name, row] of Object.entries(c.socials)) {
    put(`${SOCIALS}/${name}`, {
      Clicks: inc(row.Clicks || 0),
      AwayMs: inc(row.AwayMs || 0),
      ...(sign > 0 ? { LastAt: now } : {}),
    });
  }

  if (c.opened && c.linkId) {
    put(`${LINKS}/${c.linkId}`, {
      Opens: inc(1),
      Sessions: inc(1),
      ...(sign > 0 ? { LastOpenAt: now } : {}),
    });
  }
}

/** Everything a visit has had counted so far, read back from its story. */
function countedSoFar(s: Record<string, unknown>): Counts {
  const obj = (v: unknown): Record<string, unknown> => (isObj(v) ? v : {});
  const rows = (v: unknown, fields: string[]): Record<string, Record<string, number>> => {
    const out: Record<string, Record<string, number>> = {};
    for (const [key, row] of Object.entries(obj(v))) {
      if (!safeKey(key) || !isObj(row)) continue;
      out[key] = Object.fromEntries(fields.map((f) => [f, num(row[f], Number.MAX_SAFE_INTEGER)]));
    }
    return out;
  };
  const source = obj(s.Source);
  return {
    opened: true,
    visit: Math.max(1, num(s.Visit, 100000)),
    countryCode: safeKey(obj(s.Geo).Code) || "",
    source: typeof source.Name === "string" ? { Name: source.Name, Kind: source.Kind as SourceKind } : null,
    deviceType: safeKey(obj(s.Device).Type) || "",
    linkId: str(obj(s.Link).Id, 40),
    activeMs: num(s.ActiveMs, Number.MAX_SAFE_INTEGER),
    projects: rows(s.Projects, ["Opens", "Live", "Github", "Download"]),
    socials: rows(s.Socials, ["Clicks", "AwayMs"]),
    contactOpens: num(obj(s.Contact).Opens, Number.MAX_SAFE_INTEGER),
    cvOpens: num(obj(s.Cv).Opens, Number.MAX_SAFE_INTEGER),
    events: Array.isArray(s.Events) ? s.Events.length : 0,
  };
}

/** The UTC day a visit began on, the day its opening flush was counted under. */
function dayOf(startedAt: unknown): string {
  const at = num(startedAt, Number.MAX_SAFE_INTEGER);
  return at ? new Date(at).toISOString().slice(0, 10) : todayKey();
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
