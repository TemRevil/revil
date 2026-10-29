/**
 * Reply email builder (owner -> a contact who messaged through the site).
 *
 * The dashboard composer (Reply.tsx) builds this exact HTML, previews it, and
 * passes the string to the `sendReply` Cloud Function, which only attaches the
 * files and sends it. Same trust model as sendReceipt: the admin's dashboard
 * builds the body, the function verifies the caller is the owner and relays it.
 *
 * Framed by the shared shell (./emailShell), so a reply looks like every other Revil email.
 */

import { escapeHtml as esc } from './html';
import { emailShell } from './emailShell';

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

  return emailShell({
    title: 'Reply from Tem Revil',
    preheader: d.bodyText.slice(0, 120),
    bodyHtml,
  });
}
