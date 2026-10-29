import { describe, expect, it } from 'vitest';
import { attachmentFolder, contactProblem, type ContactForm } from './contactRules';

const ok: ContactForm = { name: 'Ada', email: 'ada@example.com', number: '', message: 'Hello', attachments: [] };
const file = (over: Partial<File> = {}) => ({ name: 'brief.pdf', size: 1000, type: 'application/pdf', ...over });

describe('contactProblem', () => {
    it('accepts a complete form, with or without a phone number', () => {
        expect(contactProblem(ok)).toBeNull();
        expect(contactProblem({ ...ok, number: '+20 100 000 0000' })).toBeNull();
        expect(contactProblem({ ...ok, attachments: [file()] })).toBeNull();
    });

    it('needs a name, an email and a message, ignoring surrounding spaces', () => {
        expect(contactProblem({ ...ok, name: '   ' })).toMatch(/required/);
        expect(contactProblem({ ...ok, message: '\n' })).toMatch(/required/);
        expect(contactProblem({ ...ok, email: '' })).toMatch(/required/);
    });

    it('refuses what submitContact would refuse', () => {
        expect(contactProblem({ ...ok, email: 'ada@example' })).toMatch(/valid email/);
        expect(contactProblem({ ...ok, name: 'a'.repeat(101) })).toMatch(/Name is too long/);
        expect(contactProblem({ ...ok, message: 'a'.repeat(5001) })).toMatch(/Message is too long/);
        expect(contactProblem({ ...ok, number: '1'.repeat(41) })).toMatch(/Phone number is too long/);
        expect(contactProblem({ ...ok, attachments: Array.from({ length: 6 }, () => file()) })).toMatch(/At most 5/);
        expect(contactProblem({ ...ok, attachments: [file({ size: 11 * 1024 * 1024 })] })).toMatch(/10MB/);
        expect(contactProblem({ ...ok, attachments: [file({ type: 'image/svg+xml' })] })).toMatch(/not allowed/);
    });
});

describe('attachmentFolder', () => {
    it('is a random UUID that fits the folder pattern submitContact accepts', () => {
        const a = attachmentFolder(), b = attachmentFolder();
        expect(a).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
        expect(a).toMatch(/^[A-Za-z0-9_-]{1,40}$/);
        expect(a).not.toBe(b);
    });
});
