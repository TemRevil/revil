import { describe, expect, it } from 'vitest';
import { ACCENT, C, emailShell, themeGaps } from './emailShell';
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

    it('declares both themes, and keeps the dark one off paper', () => {
        const html = emailShell({ title: 't', bodyHtml: '' });
        expect(html).toContain('<meta name="color-scheme" content="light dark"/>');
        expect(html).toContain('@media screen and (prefers-color-scheme: dark)');
        expect(html).not.toMatch(/@media[^{]*print/);
    });

    it('gives every palette color its dark twin, for each theme switch mail apps use', () => {
        const html = emailShell({
            title: 't',
            bodyHtml: `<p style="color:${C.mute}">a</p><div class="x" style="background:${C.chip};border:1px solid ${C.line}">b</div>`,
        });
        expect(html).toContain('<p class="rv-t-mute" style=');
        expect(html).toContain('<div class="x rv-b-chip rv-l-line" style=');
        expect(html).toContain('.rv-t-mute{color:#a0a0a0!important}');
        expect(html).toContain('[data-ogsc] .rv-t-mute{color:#a0a0a0!important}');
        expect(html).toContain('[data-ogsb] .rv-b-chip{background-color:#262626!important}');
        expect(html).toContain('.rv-l-line{border-color:#2b2b2b!important}');
    });

    it('leaves the accent and white-on-button alone, and never touches escaped visitor text', () => {
        const visitor = '&lt;p style="color:#0f172a"&gt;hi';
        const html = emailShell({ title: 't', bodyHtml: `<a style="color:#ffffff;background:${ACCENT}">go</a>${visitor}` });
        expect(html).toContain('<a style="color:#ffffff;background:#3395ff">go</a>');
        expect(html).toContain(visitor);
    });

    it('reports a color that would not follow the theme', () => {
        expect(themeGaps('<p style="color:#123456">x</p><td style="border-top:1px solid #222">')).toEqual(['text #123456', 'line #222']);
        expect(themeGaps(`<p style="color:${C.ink}">x</p>`)).toEqual([]);
    });
});

describe('every mail builder uses the shell, in colors that follow the theme', () => {
    it('receipts and invoices', () => {
        const base = {
            receiptNo: 'RCP-1', dateLabel: '1 May 2026', currency: 'USD' as const,
            lines: [{ name: 'Site', price: 100, paid: 100, balance: 0 }],
            totals: { price: 100, paid: 100, balance: 0 },
        };
        const paid = buildReceiptHtml(base);
        expect(paid).toContain(LOGO);
        expect(paid).toContain('>Receipt</td>');
        expect(paid).toContain('Thank you for your payment');
        expect(buildReceiptHtml({ ...base, kind: 'due' })).toContain('>Invoice</td>');

        const full = {
            ...base, note: 'n', converted: true, customerName: 'A', customerEmail: 'a@b.co',
            payments: [{ dateLabel: '1 May', amount: 50, note: 'x' }, { dateLabel: '2 May', amount: 50 }],
            lines: [...base.lines, { name: 'Retainer', note: 'Monthly', price: 10, paid: 0, balance: 10 }],
            totals: { price: 110, paid: 100, balance: 10 },
        };
        expect(themeGaps(buildReceiptHtml(full))).toEqual([]);
        expect(themeGaps(buildReceiptHtml({ ...full, kind: 'due', dueByLabel: '9 May' }))).toEqual([]);
    });

    it('replies', () => {
        const html = buildReplyHtml({ toName: 'Sam', bodyText: 'Hello <there>' });
        expect(html).toContain(LOGO);
        expect(html).toContain('Hello &lt;there&gt;');
        const full = buildReplyHtml({ toName: 'Sam', bodyText: 'Hi', attachmentNames: ['a.pdf'], quote: { message: 'q', name: 'Sam', at: 1 } });
        expect(themeGaps(full)).toEqual([]);
    });
});
