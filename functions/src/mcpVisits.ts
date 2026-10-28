/**
 * How the MCP Trails tools describe a visit. Almost everything in a visit document was
 * sent by the visitor's browser (device strings, the referrer and landing path, section,
 * project and social names, timeline values), so each of those leaves here wrapped as
 * untrusted. Only the owner's own share-link details and the server's numbers and
 * wording stay plain.
 */
import { untrusted, markUntrusted } from "./mcpRules";

const pad2 = (n: number): string => String(n).padStart(2, "0");
const obj = (v: unknown): Record<string, unknown> => (v && typeof v === "object" ? v as Record<string, unknown> : {});
const wrapAll = (xs: unknown[]) => xs.map(untrusted).filter((x): x is { untrusted: string } => !!x);

/** A map keyed by visitor-chosen names, as a list with each name wrapped. */
const namedRows = (m: unknown, valueKey?: string) =>
  Object.entries(obj(m))
    .filter(([name]) => !!name)
    .map(([name, val]) => ({ name: untrusted(name), ...(valueKey ? { [valueKey]: val } : obj(val)) }));

export function visitViews(offsetLabel: string, nowMs: () => number = Date.now) {
  // Timestamps come back in the owner's timezone (the same offset as get_current_time)
  // so "last night" means the same thing to both of you.
  const ownerOffset = (() => {
    const m = /UTC([+-])(\d{2}):(\d{2})/.exec(offsetLabel);
    return m ? (m[1] === "-" ? -1 : 1) * (Number(m[2]) + Number(m[3]) / 60) : 0;
  })();
  const at = (ms: unknown): string | null => {
    if (typeof ms !== "number" || !ms) return null;
    const d = new Date(ms + ownerOffset * 3600000);
    return `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}-${pad2(d.getUTCDate())} ${pad2(d.getUTCHours())}:${pad2(d.getUTCMinutes())} (${offsetLabel})`;
  };
  const dur = (ms: unknown): string => {
    const s = Math.max(0, Math.round((typeof ms === "number" ? ms : 0) / 1000));
    if (s < 60) return `${s}s`;
    const m = Math.floor(s / 60);
    return m < 60 ? `${m}m ${s % 60}s` : `${Math.floor(m / 60)}h ${m % 60}m`;
  };
  const sentWords = (sent: unknown): string | null =>
    sent === "book" ? "booked a call on the /book page"
      : sent === "meeting" ? "booked a call in the contact window"
        : sent === "message" ? "sent a message" : null;

  /** One visit as a short line-up of facts: what the Trails list shows. */
  const visitSummary = (id: string, v: Record<string, unknown>) => {
    const link = obj(v.Link);
    const geo = obj(v.Geo);
    const dev = obj(v.Device);
    const entry = obj(v.Entry);
    const contact = obj(v.Contact);
    const sections = Object.entries(obj(v.Sections))
      .filter((pair): pair is [string, number] => typeof pair[1] === "number" && pair[1] > 0)
      .sort((a, b) => b[1] - a[1])
      .map(([name, ms]) => ({ section: untrusted(name), time: dur(ms) }));
    const source = obj(v.Source);
    return {
      id,
      startedAt: at(v.StartedAt),
      live: !v.Ended && nowMs() - (typeof v.LastSeenAt === "number" ? v.LastSeenAt : 0) < 60_000,
      // Looked up on the server from the connection, not typed by the visitor.
      country: geo.Country || null,
      device: untrusted([dev.Type, dev.OS, dev.Browser].filter(Boolean).join(" · ")) || null,
      visit: typeof v.Visit === "number" ? (v.Visit > 1 ? `returning, visit #${v.Visit}` : "first time") : null,
      // The owner made the share link, so its name and code are the owner's words.
      link: link.Name ? { name: link.Name, for: link.For || null, code: link.Code || null } : null,
      // A known source is named by the server; an unknown one is the referrer's own host.
      cameFrom: source.Name && source.Kind !== "referral" ? source.Name : untrusted(source.Name || entry.Ref) || "Direct",
      landedOn: untrusted(entry.Section) || null,
      leftFrom: untrusted(obj(v.Exit).Section) || null,
      active: dur(v.ActiveMs),
      tabOpen: dur(v.OpenMs),
      timeBySection: sections,
      projectsOpened: wrapAll(Object.keys(obj(v.Projects))),
      socialsClicked: wrapAll(Object.keys(obj(v.Socials))),
      openedCv: Number(obj(v.Cv).Opens || 0) > 0,
      contact: sentWords(contact.Sent) || (Number(contact.Opens || 0) > 0 ? "opened contact but sent nothing" : null),
      ownerVisit: v.Owner === true,
    };
  };

  /** What happened, in the server's words; `value` is whatever the visitor's browser sent. */
  const describeEvent = (e: Record<string, unknown>): { what: string; value?: { untrusted: string }; kind?: { untrusted: string } } => {
    const k = String(e.k || "");
    const v = typeof e.v === "string" ? e.v : "";
    const with_ = (what: string) => ({ what, ...(v ? { value: untrusted(v) } : {}) });
    switch (k) {
      case "section": return v === "book" ? { what: "Opened the /book page" } : with_("Moved to a section");
      case "project": return with_("Opened a project");
      case "project_end": return with_("Closed a project");
      case "out": {
        const kind = v.split(":")[1];
        return with_(`Followed ${kind === "live" ? "the live demo" : kind === "github" ? "the repo" : "the download"} of a project`);
      }
      case "social": return with_("Left for a social link");
      case "social_back": return with_("Came back from a social link");
      case "cv": return { what: "Opened the CV" };
      case "contact": return { what: "Opened the contact window" };
      case "contact_tab": return with_("Switched the contact tab");
      case "contact_sent": {
        const words = sentWords(v);
        return words ? { what: words.charAt(0).toUpperCase() + words.slice(1) } : with_("Submitted the contact form");
      }
      case "copy": return v === "text" ? { what: "Copied some text" } : with_("Copied a detail");
      case "scroll": return with_("Scrolled a section (section:percent)");
      case "idle": return { what: "Went idle" };
      case "wake": return { what: "Came back" };
      case "hide": return { what: "Left the tab" };
      case "show": return { what: "Returned to the tab" };
      case "rage": return { what: v === "dead" ? "Clicked something that does nothing" : "Clicked the same spot over and over" };
      case "print": return { what: "Printed the page" };
      case "end": return { what: "Left" };
      // trackSession only stores known kinds; anything else is reported as-is, wrapped.
      default: return { ...with_("Other event"), ...(k ? { kind: untrusted(k) } : {}) };
    }
  };

  /** The full story of one visit: get_visit's result. */
  const visitDetail = (id: string, v: Record<string, unknown>) => {
    const events = Array.isArray(v.Events) ? v.Events as Record<string, unknown>[] : [];
    const dev = obj(v.Device);
    const entry = obj(v.Entry);
    return {
      ...visitSummary(id, v),
      idle: dur(v.IdleMs),
      timeline: events.map((e) => ({ after: dur(e.t), ...describeEvent(e) })),
      timelineCut: v.EventsCut === true,
      projects: namedRows(v.Projects),
      socials: namedRows(v.Socials),
      scrollDepth: namedRows(v.Scroll, "percent"),
      who: {
        ...markUntrusted({
          localTime: dev.LocalTime, timezone: dev.Timezone, language: dev.Language,
          screen: dev.Screen, window: dev.Viewport, theme: dev.Theme,
        }, ["localTime", "timezone", "language", "screen", "window", "theme"]),
        touch: typeof dev.Touch === "boolean" ? dev.Touch : null,
      },
      // Whoever wrote the link that brought them chose the referrer and tags.
      entry: markUntrusted({ path: entry.Path, referrer: entry.Referrer, tags: entry.Utm ? JSON.stringify(entry.Utm) : undefined }, ["path", "referrer", "tags"]),
      frustration: { deadClicks: v.Rage || 0, copies: v.Copies || 0, prints: v.Prints || 0 },
      checkIns: v.Flushes || 0,
    };
  };

  return { visitSummary, visitDetail, obj, at };
}
