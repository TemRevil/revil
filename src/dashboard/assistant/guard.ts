/**
 * What Spark must ask the owner about before it acts, kept apart from the component so
 * the rules can be tested on their own.
 *
 * Spark reads text strangers wrote (contact messages on the Canary page), so anything an
 * injected instruction could use to lose data waits for a human click, auto mode or not:
 * deletes, whole-document replaces, changes to Spark's own memory (they would persist the
 * injection into every later session) and clicks on controls that delete, send, confirm or
 * change state. Auto mode only skips the confirm for routine merge writes.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type NativeMsg = any;

export type SparkAction =
    | { kind: 'write'; path: string; merge: boolean }
    | { kind: 'delete'; path: string }
    | { kind: 'memory' }
    | { kind: 'click'; risky: boolean };

const MEMORY_PATH = 'Spark/Memory';
const cleanPath = (p: string) => p.split('/').filter(Boolean).join('/');

/** True when the owner has to confirm this action before it runs. */
export function mustConfirm(action: SparkAction, auto: boolean): boolean {
    switch (action.kind) {
        case 'delete':
        case 'memory':
            return true;
        case 'click':
            return action.risky;
        case 'write':
            if (cleanPath(action.path) === MEMORY_PATH) return true;
            if (!action.merge) return true;
            return !auto;
    }
}

/** Words on a control that deletes, sends, commits or changes something. */
const RISKY_LABEL = /\b(delete|remove|erase|discard|clear|reset|wipe|purge|destroy|cancel|revoke|disconnect|unlink|archive|send|reply|submit|publish|unpublish|confirm|apply|save|overwrite|replace|sign ?out|log ?out|logout|yes|ok|do it|proceed|reopen|resume|pause[d]?|close[d]?|complete[d]?|enable[d]?|disable[d]?|turn (on|off)|upload|import|restore|move|reschedule|mark)\b/i;

export interface ClickInfo {
    /** The control's visible text, or its aria-label/title when it has none. */
    label: string;
    /** Inside a dialog, e.g. the delete confirmation: its buttons commit what it asks. */
    inDialog: boolean;
    /** A form's submit button. */
    isSubmit: boolean;
    /** A toggle, switch, checkbox, radio, option or menu item: clicking it changes state. */
    stateful: boolean;
}

/** Whether a click could lose or send something, so the owner must confirm it. */
export function isRiskyClick(c: ClickInfo): boolean {
    return c.inDialog || c.isSubmit || c.stateful || RISKY_LABEL.test(c.label);
}

const norm = (s: string) => s.replace(/\s+/g, ' ').trim().toLowerCase();

/**
 * Exact label match, ignoring case and spacing. Never a "contains" match: that read
 * "Do not delete" as the "Delete" button and "Delete" as "Delete Message".
 */
export function labelsMatch(wanted: string, label: string): boolean {
    const w = norm(wanted);
    return !!w && w === norm(label);
}

/** A user message the owner typed (a turn start), not a tool result riding as "user". */
function isTurnStart(m: NativeMsg): boolean {
    if (!m || m.role !== 'user') return false;
    if (typeof m.content === 'string') return true;
    if (Array.isArray(m.parts)) return m.parts.length > 0 && m.parts.every((p: { text?: unknown }) => typeof p?.text === 'string');
    return false;
}

/**
 * The conversation to send: at most `maxTurns` of the latest turns and about `maxChars`
 * of JSON. It only ever cuts at a turn start, so a tool call is never separated from its
 * result (every provider rejects that), and the newest turn is always kept whole.
 */
export function trimHistory(msgs: NativeMsg[], { maxTurns, maxChars }: { maxTurns: number; maxChars: number }): NativeMsg[] {
    const starts: number[] = [];
    msgs.forEach((m, i) => { if (isTurnStart(m)) starts.push(i); });
    if (!starts.length) return msgs;
    let k = Math.max(0, starts.length - maxTurns);
    let out = msgs.slice(starts[k]);
    while (k < starts.length - 1 && JSON.stringify(out).length > maxChars) {
        k++;
        out = msgs.slice(starts[k]);
    }
    return out;
}

export interface SparkMemory { userName?: string; instructions?: string; facts?: string[]; }

/** A readable list of what a memory change would do, for the confirm card. */
export function memoryDiff(current: SparkMemory, next: SparkMemory): string {
    const lines: string[] = [];
    const q = (s?: string) => `"${s ?? ''}"`;
    if (next.userName !== undefined && next.userName !== current.userName) lines.push(`name: ${q(current.userName)} -> ${q(next.userName)}`);
    if (next.instructions !== undefined && next.instructions !== current.instructions) {
        lines.push(`instructions: ${q(current.instructions)} -> ${q(next.instructions)}`);
    }
    if (next.facts) {
        const old = current.facts || [];
        next.facts.filter(f => !old.includes(f)).forEach(f => lines.push(`add fact: ${q(f)}`));
        old.filter(f => !next.facts!.includes(f)).forEach(f => lines.push(`drop fact: ${q(f)}`));
    }
    return lines.join('\n') || 'No change.';
}
