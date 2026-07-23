/**
 * Reply email builder (owner -> a contact who messaged through the site).
 *
 * The dashboard composer (M-Reply.tsx) builds this exact HTML, previews it, and
 * passes the string to the `sendReply` Cloud Function, which only attaches the
 * files and sends it. Same trust model as sendReceipt: the admin's dashboard
 * builds the body, the function verifies the caller is the owner and relays it.
 *
 * Kept visually in sync with the branded dark card in functions/src/index.ts
 * (emailTemplate), so a reply looks like every other Revil email.
 */

import { escapeHtml as esc } from './html';

export interface ReplyEmailData {
  /** Recipient's name, used for the greeting. */
  toName?: string;
  /** The owner's message, plain text with newlines preserved. */
  bodyText: string;
  /** The original inbound message, rendered as a quoted block at the bottom. */
  quote?: { name?: string; message?: string; at?: number };
  /** Attachment file names, listed in the body (the files are attached by the server). */
  attachmentNames?: string[];
}

export const DEFAULT_REPLY_SUBJECT = 'Re: your message to Tem Revil';

/** Escaped text -> paragraphs (a blank line starts a new <p>, single newline -> <br>). */
function toParagraphs(text: string): string {
  return String(text ?? '')
    .replace(/\r\n/g, '\n')
    .split(/\n{2,}/)
    .map(b => b.trim())
    .filter(Boolean)
    .map(b => `<p>${esc(b).replace(/\n/g, '<br>')}</p>`)
    .join('');
}

/** The shared dark Revil card shell (mirrors functions emailTemplate). */
function shell({ title, preheader, bodyHtml }: { title: string; preheader: string; bodyHtml: string }): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<meta name="color-scheme" content="dark"/>
<meta name="supported-color-schemes" content="dark"/>
<title>${esc(title)}</title>
<style>
  body{margin:0;padding:0;background:#0a0a0a;color:#e0e0e0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif}
  .wrapper{max-width:600px;margin:0 auto;padding:40px 20px}
  .card{background:#141414;border:1px solid #222;border-radius:16px;overflow:hidden}
  .header{padding:32px 32px 24px;border-bottom:1px solid #222;text-align:center}
  .logo{font-size:24px;font-weight:800;color:#ffffff;letter-spacing:-0.5px}
  .logo span{color:#3395ff}
  .body{padding:32px}
  .body h2{margin:0 0 16px;font-size:20px;font-weight:700;color:#ffffff}
  .body p{margin:0 0 12px;font-size:15px;line-height:1.6;color:#c8c8c8}
  .message-box{background:#1a1a1a;border:1px solid #222;border-radius:12px;padding:16px 18px;margin:12px 0;font-size:14px;line-height:1.7;color:#9a9a9a}
  .footer{padding:24px 32px;border-top:1px solid #222;text-align:center}
  .footer p{margin:0;font-size:12px;color:#555}
  .footer a{color:#3395ff;text-decoration:none}
  .divider{height:1px;background:#222;margin:20px 0}
  .preheader{display:none;font-size:1px;color:#0a0a0a;line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden}
  @media(max-width:600px){
    .wrapper{padding:16px 8px}
    .header,.body,.footer{padding-left:20px;padding-right:20px}
  }
</style>
</head>
<body>
<div class="preheader">${esc(preheader)}</div>
<div class="wrapper">
  <div class="card">
    <div class="header">
      <div class="logo">Revil<span>.</span></div>
    </div>
    <div class="body">
      ${bodyHtml}
    </div>
    <div class="footer">
      <p>Sent from <a href="https://temrevil.com">temrevil.com</a></p>
    </div>
  </div>
</div>
</body>
</html>`;
}

export function buildReplyHtml(d: ReplyEmailData): string {
  const name = d.toName?.trim();
  const greeting = `<p>Hi ${name ? esc(name) : 'there'},</p>`;
  const body = toParagraphs(d.bodyText) || '<p></p>';

  const names = (d.attachmentNames || []).filter(Boolean);
  const attach = names.length
    ? `<p style="color:#8a8a8a;font-size:13px;margin-top:16px"><strong style="color:#aaa">Attached:</strong> ${names.map(esc).join(', ')}</p>`
    : '';

  const q = d.quote;
  const quote = q?.message
    ? `<div class="divider"></div>
       <p style="font-size:12px;color:#666;margin-bottom:6px">On ${q.at ? esc(new Date(q.at).toLocaleString()) : 'your earlier message'}, ${q.name ? esc(q.name) + ' ' : ''}wrote:</p>
       <div class="message-box">${esc(q.message).replace(/\r?\n/g, '<br>')}</div>`
    : '';

  const bodyHtml = `
    ${greeting}
    ${body}
    ${attach}
    <div class="divider"></div>
    <p style="margin-bottom:2px;color:#c8c8c8">Best,</p>
    <p style="margin-top:0;font-weight:700;color:#ffffff">Tem Revil</p>
    ${quote}
  `;

  return shell({
    title: 'Reply from Tem Revil',
    preheader: d.bodyText.slice(0, 120),
    bodyHtml,
  });
}
