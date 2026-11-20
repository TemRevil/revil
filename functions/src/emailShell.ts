// GENERATED from src/lib/emailShell.ts by scripts/sync-shared.mjs - edit that file.

/**
 * The branded email shell - the ONE frame every Revil email is sent in: the visitor and
 * owner notifications, the link-opened alert, replies, receipts and invoices. Change
 * the brand here once and every mail follows. The functions build copies this file to
 * functions/src/emailShell.ts (functions/scripts/sync-shared.mjs): edit it here. It may
 * only import ./html.
 *
 * The frame is table-based with inline styles, so it holds in Gmail and Outlook alike.
 *
 * It follows the reader's theme. Every mail is drawn light, in the colors of `C`, and
 * each of those colors has a dark twin: the shell tags every element that uses one with
 * a class (themed()), and a dark stylesheet swaps the colors for mail apps that report a
 * dark theme (Apple Mail, iOS Mail, Outlook for Mac and phones through
 * prefers-color-scheme; Outlook.com through its data-ogsc / data-ogsb markers). Apps that
 * report nothing stay light, and the Gmail apps darken a light mail on their own. The
 * dark sheet is for screens only, so a receipt always prints light.
 *
 * So a mail body takes its colors from `C` (or the accent, or white on a filled
 * button); a color outside them would not change with the theme, which themeGaps()
 * reports and the tests check for every mail.
 *
 * `bodyHtml` and `footerHtml` are inserted as they are, so every visitor-supplied value
 * in them must already be escaped. `title`, `preheader` and `kicker` are escaped here.
 */
import { escapeHtml as esc } from './html';

export const SITE_URL = 'https://temrevil.com';
export const ACCENT = '#3395ff';

/** The light palette every mail is drawn in. Each one has a dark twin below. */
export const C = {
    // surfaces
    page: '#f1f5f9', card: '#ffffff', panel: '#f8fafc', chip: '#eef2f6',
    okFill: '#f0fdf4', dueFill: '#fff7ed', stopFill: '#fef2f2',
    // hairlines
    line: '#e6e9ef', okLine: '#bbf7d0', dueLine: '#fed7aa', stopLine: '#fecaca',
    // text, strongest first
    ink: '#0f172a', body: '#334155', soft: '#475569', mute: '#64748b',
    green: '#16a34a', amber: '#d97706',
    okInk: '#166534', okSoft: '#15803d', dueInk: '#9a3412', dueSoft: '#b45309', stopInk: '#991b1b', stopSoft: '#b91c1c',
} as const;
type Role = keyof typeof C;

/** The dark twin of each color (text tones clear WCAG AA on the dark card and chip). */
const DARK: Record<Role, string> = {
    page: '#0a0a0a', card: '#141414', panel: '#1a1a1a', chip: '#262626',
    okFill: '#0f2417', dueFill: '#2b1a0e', stopFill: '#2a1212',
    line: '#2b2b2b', okLine: '#166534', dueLine: '#7c2d12', stopLine: '#7f1d1d',
    ink: '#ececec', body: '#c8c8c8', soft: '#b0b0b0', mute: '#a0a0a0',
    green: '#4ade80', amber: '#fbbf24',
    okInk: '#86efac', okSoft: '#4ade80', dueInk: '#fdba74', dueSoft: '#fcd34d', stopInk: '#fca5a5', stopSoft: '#f87171',
};

const SURFACES: Role[] = ['page', 'card', 'panel', 'chip', 'okFill', 'dueFill', 'stopFill'];
const LINES: Role[] = ['line', 'okLine', 'dueLine', 'stopLine'];
const TEXTS: Role[] = ['ink', 'body', 'soft', 'mute', 'green', 'amber', 'okInk', 'okSoft', 'dueInk', 'dueSoft', 'stopInk', 'stopSoft'];

/** Colors that read the same in both themes: the accent, and white on a filled button. */
const FIXED = {
    text: new Set([ACCENT, '#fff', '#ffffff']),
    surface: new Set([ACCENT, '#1f6fd0']),
    line: new Set([ACCENT]),
};

type Kind = 'text' | 'surface' | 'line';
const PREFIX: Record<Kind, string> = { text: 'rv-t-', surface: 'rv-b-', line: 'rv-l-' };
const byHex = (roles: Role[]) => new Map(roles.map((r) => [C[r], r] as [string, Role]));
const ROLE_OF: Record<Kind, Map<string, Role>> = { text: byHex(TEXTS), surface: byHex(SURFACES), line: byHex(LINES) };

const HEX_RE = /#[0-9a-f]{3,8}\b/i;

/** Each hex color in an inline style, with what it colors. */
function inlineColors(style: string): { kind: Kind; hex: string }[] {
    const out: { kind: Kind; hex: string }[] = [];
    for (const decl of style.split(';')) {
        const i = decl.indexOf(':');
        if (i < 0) continue;
        const prop = decl.slice(0, i).trim().toLowerCase();
        const hex = decl.slice(i + 1).match(HEX_RE)?.[0].toLowerCase();
        if (!hex) continue;
        if (prop === 'color') out.push({ kind: 'text', hex });
        else if (prop === 'background' || prop === 'background-color') out.push({ kind: 'surface', hex });
        else if (prop.startsWith('border')) out.push({ kind: 'line', hex });
    }
    return out;
}

/** Every opening tag that carries a style attribute. Escaped visitor text has no raw `<`. */
const TAG_RE = /<([a-z][a-z0-9]*)(\s[^<>]*?\bstyle="([^"]*)"[^<>]*)>/gi;

/** Tag every element that uses a palette color with the class that gives it its dark twin. */
export function themed(html: string): string {
    return html.replace(TAG_RE, (tag, name: string, attrs: string, style: string) => {
        const classes = [...new Set(inlineColors(style)
            .map(({ kind, hex }) => { const r = ROLE_OF[kind].get(hex); return r ? PREFIX[kind] + r : ''; })
            .filter(Boolean))];
        if (!classes.length) return tag;
        const has = attrs.match(/\sclass="([^"]*)"/);
        const next = has
            ? attrs.replace(has[0], ` class="${has[1]} ${classes.join(' ')}"`)
            : ` class="${classes.join(' ')}"${attrs}`;
        return `<${name}${next}>`;
    });
}

/** Inline colors that would not follow the theme: neither a palette color nor a fixed one. */
export function themeGaps(html: string): string[] {
    const gaps = new Set<string>();
    for (const m of html.matchAll(TAG_RE)) {
        for (const { kind, hex } of inlineColors(m[3])) {
            if (!ROLE_OF[kind].has(hex) && !FIXED[kind].has(hex)) gaps.add(`${kind} ${hex}`);
        }
    }
    return [...gaps];
}

/** The dark rules for the tagged elements, for one selector prefix. */
function darkRules(scope: (kind: Kind) => string): string {
    const rule = (kind: Kind, roles: Role[], prop: string) =>
        roles.map((r) => `${scope(kind)}.${PREFIX[kind]}${r}{${prop}:${DARK[r]}!important}`).join('');
    return rule('text', TEXTS, 'color') + rule('surface', SURFACES, 'background-color') + rule('line', LINES, 'border-color');
}

const FONT = "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";

export interface EmailShellArgs {
    title: string;
    /** The one line inboxes show after the subject. */
    preheader?: string;
    bodyHtml: string;
    /** Defaults to a "Sent from temrevil.com" line. */
    footerHtml?: string;
    /** A small label across from the logo, e.g. "Receipt". */
    kicker?: string;
}

export function emailShell({ title, preheader = '', bodyHtml, footerHtml, kicker }: EmailShellArgs): string {
    const footer = footerHtml ?? `Sent from <a href="${SITE_URL}" style="color:${ACCENT};text-decoration:none">temrevil.com</a>`;
    const page = themed(`<body style="margin:0;padding:0;background:${C.page}">
<div class="preheader">${esc(preheader)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${C.page};padding:32px 12px">
  <tr><td align="center">
    <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="width:600px;max-width:100%;background:${C.card};border:1px solid ${C.line};border-radius:16px;overflow:hidden">
      <tr><td class="pad" style="background:${C.card};padding:24px 32px;border-bottom:1px solid ${C.line}">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
          <td style="font-family:${FONT};font-size:22px;font-weight:800;color:${C.ink};letter-spacing:-0.5px">Revil<span style="color:${ACCENT}">.</span></td>
          ${kicker ? `<td style="text-align:right;font-family:${FONT};color:${ACCENT};font-size:12px;font-weight:800;letter-spacing:3px;text-transform:uppercase">${esc(kicker)}</td>` : ''}
        </tr></table>
      </td></tr>
      <tr><td class="body pad" style="padding:32px;font-family:${FONT};color:${C.ink}">
        ${bodyHtml}
      </td></tr>
      <tr><td class="pad" style="padding:20px 32px;border-top:1px solid ${C.line};text-align:center;font-family:${FONT};font-size:12px;line-height:1.6;color:${C.mute}">
        ${footer}
      </td></tr>
    </table>
  </td></tr>
</table>
</body>`);
    const D = DARK;
    return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<meta name="color-scheme" content="light dark"/>
<meta name="supported-color-schemes" content="light dark"/>
<title>${esc(title)}</title>
<!--[if mso]><style>body,table,td{font-family:Arial,sans-serif!important}</style><![endif]-->
<style>
  :root{color-scheme:light dark;supported-color-schemes:light dark}
  body{margin:0;padding:0;background:${C.page};color:${C.ink};font-family:${FONT};-webkit-font-smoothing:antialiased}
  .body h2{margin:0 0 16px;font-size:20px;font-weight:700;color:${C.ink}}
  .body p{margin:0 0 12px;font-size:15px;line-height:1.6;color:${C.soft}}
  .info-row{display:flex;padding:12px 0;border-bottom:1px solid ${C.line}}
  .info-label{font-size:13px;font-weight:600;color:${C.mute};width:120px;flex-shrink:0;text-transform:uppercase;letter-spacing:0.5px}
  .info-value{font-size:15px;color:${C.ink};word-break:break-word}
  .badge{display:inline-block;padding:4px 12px;border-radius:20px;font-size:12px;font-weight:600}
  .badge-blue{background:rgba(51,149,255,0.15);color:${ACCENT}}
  .badge-green{background:rgba(16,185,129,0.15);color:${C.green}}
  .message-box{background:${C.panel};border:1px solid ${C.line};border-radius:12px;padding:18px 20px;margin:12px 0;font-size:15px;line-height:1.7;color:${C.body}}
  .btn{display:inline-block;padding:12px 28px;background:${ACCENT};color:#ffffff!important;text-decoration:none;border-radius:10px;font-weight:600;font-size:14px}
  .divider{height:1px;background:${C.line};margin:20px 0}
  .preheader{display:none;font-size:1px;color:${C.page};line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden}
  @media(max-width:600px){
    .info-row{flex-direction:column;gap:4px}
    .info-label{width:auto}
    .pad{padding-left:20px!important;padding-right:20px!important}
  }
</style>
<style>
  @media screen and (prefers-color-scheme: dark){
    body{background:${D.page}!important;color:${D.ink}!important}
    .body h2,.info-value{color:${D.ink}!important}
    .body p{color:${D.soft}!important}
    .info-label{color:${D.mute}!important}
    .info-row{border-bottom-color:${D.line}!important}
    .message-box{background:${D.panel}!important;border-color:${D.line}!important;color:${D.body}!important}
    .divider{background:${D.line}!important}
    .badge-green{color:${D.green}!important}
    ${darkRules(() => '')}
  }
  ${darkRules((kind) => (kind === 'surface' ? '[data-ogsb] ' : '[data-ogsc] '))}
</style>
</head>
${page}
</html>`;
}
