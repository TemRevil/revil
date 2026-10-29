import { describe, expect, it } from 'vitest';
import { emailShell } from './emailShell';
import { buildReceiptHtml } from './receipt';
import { buildReplyHtml } from './replyEmail';

/** The brand mark the shell draws; any mail carrying it went through the shared frame. */
const LOGO = 'Revil<span style="color:#3395ff">.</span>';

describe('emailShell', () => {
    it('escapes the title, preheader and kicker but keeps the body HTML', () => {
        const html = emailShell({ title: '<b>t</b>', preheader: '"p"', kicker: '<k>', bodyHtml: '<p>body</p>' });
        expect(html).toContain('<title>&lt;b&gt;t&lt;/b&gt;</title>');
        expect(html).toContain('&quot;p&quot;');
        expect(html).toContain('&lt;k&gt;');
        expect(html).toContain('<p>body</p>');
        expect(html).toContain(LOGO);
    });

    it('has a light tone for documents that get printed', () => {
        expect(emailShell({ title: 't', bodyHtml: '', tone: 'light' })).toContain('content="light"');
        expect(emailShell({ title: 't', bodyHtml: '' })).toContain('content="dark"');
    });
});

describe('every mail builder uses the shell', () => {
    it('receipts and invoices', () => {
        const base = {
            receiptNo: 'RCP-1', dateLabel: '1 May 2026', currency: 'USD' as const,
            lines: [{ name: 'Site', price: 100, paid: 100, balance: 0 }],
            totals: { price: 100, paid: 100, balance: 0 },
        };
        const paid = buildReceiptHtml(base);
        expect(paid).toContain(LOGO);
        expect(paid).toContain('content="light"');
        expect(paid).toContain('>Receipt</td>');
        expect(paid).toContain('Thank you for your payment');
        expect(buildReceiptHtml({ ...base, kind: 'due' })).toContain('>Invoice</td>');
    });

    it('replies', () => {
        const html = buildReplyHtml({ toName: 'Sam', bodyText: 'Hello <there>' });
        expect(html).toContain(LOGO);
        expect(html).toContain('Hello &lt;there&gt;');
    });
});
