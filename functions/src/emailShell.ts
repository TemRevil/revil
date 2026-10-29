// GENERATED from src/lib/emailShell.ts by scripts/sync-shared.mjs - edit that file.

/**
 * The branded email shell - the ONE frame every Revil email is sent in: the visitor and
 * owner notifications, the link-opened alert, replies, receipts and invoices. Change
 * the brand here once and every mail follows. The functions build copies this file to
 * functions/src/emailShell.ts (functions/scripts/sync-shared.mjs): edit it here. It may
 * only import ./html.
 *
 * The frame is table-based with inline styles, so it holds in Gmail and Outlook alike.
 * Two tones: dark for notes and replies, light for receipts, which are also downloaded
 * and printed (a dark page prints as light text on white paper).
 *
 * `bodyHtml` and `footerHtml` are inserted as they are, so every visitor-supplied value
 * in them must already be escaped. `title`, `preheader` and `kicker` are escaped here.
 */
import { escapeHtml as esc } from './html';

export const SITE_URL = 'https://temrevil.com';

export interface EmailShellArgs {
    title: string;
    /** The one line inboxes show after the subject. */
    preheader?: string;
    bodyHtml: string;
    /** Defaults to a "Sent from temrevil.com" line. */
    footerHtml?: string;
    /** A small label across from the logo, e.g. "Receipt". */
    kicker?: string;
    tone?: 'dark' | 'light';
}

const TONES = {
    dark: {
        page: '#0a0a0a', card: '#141414', line: '#222222', head: '#141414', logo: '#ffffff',
        text: '#e0e0e0', strong: '#ffffff', soft: '#b0b0b0', mute: '#666666', foot: '#555555',
        panel: '#1a1a1a', scheme: 'dark',
    },
    light: {
        page: '#f1f5f9', card: '#ffffff', line: '#e6e9ef', head: '#0f172a', logo: '#ffffff',
        text: '#0f172a', strong: '#0f172a', soft: '#475569', mute: '#64748b', foot: '#64748b',
        panel: '#f8fafc', scheme: 'light',
    },
} as const;

const ACCENT = '#3395ff';
const FONT = "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";

export function emailShell({ title, preheader = '', bodyHtml, footerHtml, kicker, tone = 'dark' }: EmailShellArgs): string {
    const t = TONES[tone];
    const footer = footerHtml ?? `Sent from <a href="${SITE_URL}" style="color:${ACCENT};text-decoration:none">temrevil.com</a>`;
    return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<meta name="color-scheme" content="${t.scheme}"/>
<meta name="supported-color-schemes" content="${t.scheme}"/>
<title>${esc(title)}</title>
<!--[if mso]><style>body,table,td{font-family:Arial,sans-serif!important}</style><![endif]-->
<style>
  body{margin:0;padding:0;background:${t.page};color:${t.text};font-family:${FONT};-webkit-font-smoothing:antialiased}
  .body h2{margin:0 0 16px;font-size:20px;font-weight:700;color:${t.strong}}
  .body p{margin:0 0 12px;font-size:15px;line-height:1.6;color:${t.soft}}
  .info-row{display:flex;padding:12px 0;border-bottom:1px solid ${t.panel}}
  .info-label{font-size:13px;font-weight:600;color:${t.mute};width:120px;flex-shrink:0;text-transform:uppercase;letter-spacing:0.5px}
  .info-value{font-size:15px;color:${t.text};word-break:break-word}
  .badge{display:inline-block;padding:4px 12px;border-radius:20px;font-size:12px;font-weight:600}
  .badge-blue{background:rgba(51,149,255,0.15);color:${ACCENT}}
  .badge-green{background:rgba(16,185,129,0.15);color:#10b981}
  .message-box{background:${t.panel};border:1px solid ${t.line};border-radius:12px;padding:18px 20px;margin:12px 0;font-size:15px;line-height:1.7;color:${t.soft}}
  .btn{display:inline-block;padding:12px 28px;background:${ACCENT};color:#ffffff!important;text-decoration:none;border-radius:10px;font-weight:600;font-size:14px}
  .divider{height:1px;background:${t.line};margin:20px 0}
  .preheader{display:none;font-size:1px;color:${t.page};line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden}
  @media(max-width:600px){
    .info-row{flex-direction:column;gap:4px}
    .info-label{width:auto}
    .pad{padding-left:20px!important;padding-right:20px!important}
  }
</style>
</head>
<body style="margin:0;padding:0;background:${t.page}">
<div class="preheader">${esc(preheader)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${t.page};padding:32px 12px">
  <tr><td align="center">
    <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="width:600px;max-width:100%;background:${t.card};border:1px solid ${t.line};border-radius:16px;overflow:hidden">
      <tr><td class="pad" style="background:${t.head};padding:24px 32px;border-bottom:1px solid ${t.line}">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
          <td style="font-family:${FONT};font-size:22px;font-weight:800;color:${t.logo};letter-spacing:-0.5px">Revil<span style="color:${ACCENT}">.</span></td>
          ${kicker ? `<td style="text-align:right;font-family:${FONT};color:${ACCENT};font-size:12px;font-weight:800;letter-spacing:3px;text-transform:uppercase">${esc(kicker)}</td>` : ''}
        </tr></table>
      </td></tr>
      <tr><td class="body pad" style="padding:32px;font-family:${FONT};color:${t.text}">
        ${bodyHtml}
      </td></tr>
      <tr><td class="pad" style="padding:20px 32px;border-top:1px solid ${t.line};text-align:center;font-family:${FONT};font-size:12px;line-height:1.6;color:${t.foot}">
        ${footer}
      </td></tr>
    </table>
  </td></tr>
</table>
</body>
</html>`;
}
