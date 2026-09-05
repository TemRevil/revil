/**
 * The shape of a visit.
 *
 * One document per visit lives at `Analytics/Sessions/Items/{id}`, written only by
 * the `trackSession` Cloud Function. The browser never writes analytics directly -
 * it POSTs deltas and the function applies them with the Admin SDK. That is what
 * killed the old design's silent data loss: the previous collector wrote straight
 * to Firestore, where a rules-level rate limit rejected roughly every write landing
 * inside a 5s window and the client swallowed the rejection.
 *
 * Field names are PascalCase to match the rest of this project's Firestore docs.
 */

/** Everything the timeline can record. Kept terse - these ship on every flush. */
export type EventKind =
    | 'section'        // v = section name
    | 'project'        // v = project id (opened)
    | 'project_end'    // v = project id (closed)
    | 'out'            // v = "<projectId>:live" | "<projectId>:github" | "<projectId>:download"
    | 'social'         // v = social name
    | 'social_back'    // v = social name
    | 'cv'             // CV opened
    | 'contact'        // contact modal opened
    | 'contact_tab'    // v = "meeting" | "message"
    | 'contact_sent'   // v = "meeting" | "message"
    | 'copy'           // v = "email" | "phone" | "text"
    | 'scroll'         // v = "<section>:<pct>" milestone
    | 'idle'
    | 'wake'
    | 'hide'
    | 'show'
    | 'rage'
    | 'print'
    | 'end';

export interface SessionEvent {
    /** Milliseconds since the session started. */
    t: number;
    k: EventKind;
    v?: string;
}

export interface SessionLink {
    Id: string;
    Code: string;
    Name: string;
    For: string;
}

export interface SessionEntry {
    Section: string;
    Path: string;
    /** Full referrer URL, or '' for a direct visit. */
    Referrer: string;
    /** Just the referrer's host, for grouping. */
    Ref: string;
    Utm?: Record<string, string>;
}

/** Where the visit came from, resolved server-side from the referrer + query tags. */
export interface SessionSource {
    Name: string;
    /** 'ai' means an assistant sent them: the one worth watching on its own. */
    Kind: 'ai' | 'search' | 'social' | 'mail' | 'referral' | 'direct';
}

export interface SessionDevice {
    Type: 'phone' | 'tablet' | 'desktop';
    OS: string;
    Browser: string;
    Screen: string;
    Viewport: string;
    Language: string;
    Theme: 'dark' | 'light';
    Timezone: string;
    /** The visitor's own wall clock when they arrived, e.g. "23:41". */
    LocalTime: string;
    Touch: boolean;
}

export interface SessionProject {
    Opens: number;
    Ms: number;
    Live: number;
    Github: number;
    Download: number;
}

export interface SessionSocial {
    Clicks: number;
    AwayMs: number;
}

export interface SessionContact {
    Opens: number;
    /** Last tab they were on: the furthest step of the funnel they reached. */
    Tab: string;
    Sent: string;
}

export interface SessionDoc {
    Id: string;
    Visitor: string;
    /** 1 for a first-time visitor, 2 for their second visit, and so on. */
    Visit: number;
    StartedAt: number;
    LastSeenAt: number;
    EndedAt?: number | null;
    Ended: boolean;
    /** Wall-clock time the tab was open. */
    OpenMs: number;
    /** Tab visible AND the visitor was doing something. The honest number. */
    ActiveMs: number;
    IdleMs: number;
    Link?: SessionLink | null;
    Entry: SessionEntry;
    Source?: SessionSource;
    Exit?: { Section: string };
    Device: SessionDevice;
    Geo?: { Country: string; Code: string };
    Sections: Record<string, number>;
    Scroll: Record<string, number>;
    Projects: Record<string, SessionProject>;
    Socials: Record<string, SessionSocial>;
    Cv: { Opens: number };
    Contact: SessionContact;
    Copies: number;
    Rage: number;
    Prints: number;
    Perf?: { LoadMs: number; LcpMs: number };
    Events: SessionEvent[];
    /** True when the timeline hit its cap and stopped appending. */
    EventsCut: boolean;
    Flushes: number;
    /** Set when the visit came from the owner's own browser - hidden by default. */
    Owner?: boolean;
    /** Set on rows rebuilt from the pre-rewrite Rec_CLI blobs. */
    Legacy?: boolean;
}

/** `Analytics/Days/Items/{YYYY-MM-DD}` - one rollup per day. */
export interface DayDoc {
    Sessions: number;
    Visitors: number;
    Returning: number;
    ActiveMs: number;
    Projects: number;
    Socials: number;
    Contacts: number;
    Cv: number;
    LinkOpens: number;
    Countries: Record<string, number>;
    Devices: Record<string, number>;
}

/** `Analytics/Totals` - the lifetime counters. */
export interface TotalsDoc {
    Sessions: number;
    Visitors: number;
    Events: number;
    Projects: number;
    Socials: number;
    Contacts: number;
    Cv: number;
    LinkOpens: number;
    /** The first day on record answers "since when", so there is no FirstAt here. */
    LastAt: number;
}

/** What the site does differently for someone arriving on a specific link. */
export interface LinkTailor {
    /** Pops the CV open once the hero finishes - the old "Interviewer mode". */
    AutoCv: boolean;
    /** Shown in place of the default hero line. Empty = no override. */
    Greeting: string;
    /** Project ids to float to the top of the grid. */
    Pinned: string[];
}

export const EMPTY_TAILOR: LinkTailor = { AutoCv: false, Greeting: '', Pinned: [] };

/** `Analytics/Links/Items/{id}` - the link itself plus how it has been used. */
export interface LinkDoc {
    Code: string;
    Name: string;
    For: string;
    Created: number;
    Opens: number;
    Sessions: number;
    LastOpenAt: number | null;
    /** Email me the moment somebody opens this one. */
    Notify: boolean;
    Tailor: LinkTailor;
    /** The pre-rewrite blob, kept verbatim after migration for reference. */
    LegacyRec?: string;
}

/**
 * `Analytics/Socials/Items/{name}`.
 *
 * Per-project engagement deliberately does NOT live here: the project modal shows
 * those counts to visitors, so they stay on `Projects/{id}.Views` where the public
 * can read them. The difference is who writes them - the client no longer can.
 */
export interface SocialStatsDoc {
    Clicks: number;
    AwayMs: number;
    LastAt: number | null;
}

/** Human labels for the timeline. Keep in step with EventKind. */
export const EVENT_LABEL: Record<EventKind, string> = {
    section: 'Moved to',
    project: 'Opened project',
    project_end: 'Closed project',
    out: 'Followed link',
    social: 'Left for',
    social_back: 'Came back from',
    cv: 'Opened the CV',
    contact: 'Opened contact',
    contact_tab: 'Switched to',
    contact_sent: 'Submitted',
    copy: 'Copied',
    scroll: 'Read down to',
    idle: 'Went idle',
    wake: 'Came back',
    hide: 'Left the tab',
    show: 'Returned to the tab',
    rage: 'Clicked something dead',
    print: 'Printed the page',
    end: 'Left',
};

/** Format a duration the way the dashboard shows it everywhere. */
export const formatMs = (ms: number): string => {
    const s = Math.max(0, Math.round(ms / 1000));
    if (s < 60) return `${s}s`;
    const m = Math.floor(s / 60);
    if (m < 60) return `${m}m ${s % 60}s`;
    return `${Math.floor(m / 60)}h ${m % 60}m`;
};
