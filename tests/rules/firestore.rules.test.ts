import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest';
import { assertFails, assertSucceeds, type RulesTestEnvironment } from '@firebase/rules-unit-testing';
import { ADMIN, SIGNED_IN, startRulesEnv } from './setup';

let env: RulesTestEnvironment;

beforeAll(async () => { env = await startRulesEnv(); });
afterAll(async () => { await env?.cleanup(); });
beforeEach(async () => { await env.clearFirestore(); });

const anon = () => env.unauthenticatedContext().firestore();
const user = () => env.authenticatedContext(SIGNED_IN.uid, SIGNED_IN.claims).firestore();
const admin = () => env.authenticatedContext(ADMIN.uid, ADMIN.claims).firestore();

/** Seeds a document with the rules switched off. */
async function seed(path: string, data: Record<string, unknown> = { v: 1 }) {
    await env.withSecurityRulesDisabled(async (ctx) => { await ctx.firestore().doc(path).set(data); });
}

const PUBLIC_DOCS = [
    'Projects/p1', 'Tags/t1', 'Settings/Account', 'Settings/Availability', 'Settings/BookedSlots',
    'Settings/BookPage', 'Settings/Developer', 'Settings/HandledProjects', 'Settings/Tech Stack',
];

const PRIVATE_DOCS = [
    'Settings/Canary', 'Settings/MCP', 'Settings/Hero/sub/x', 'Treasury/projects', 'Spark/memory',
    'Analytics/Totals', 'Analytics/Links/Items/l1', 'Analytics/Sessions/Items/s1', 'McpAudit/e1', 'MailJobs/j1', 'Anything/else',
];

describe('public portfolio documents', () => {
    it.each(PUBLIC_DOCS)('anyone can read %s', async (path) => {
        await seed(path);
        await assertSucceeds(anon().doc(path).get());
    });

    it.each(PUBLIC_DOCS.filter((p) => p !== 'Settings/HandledProjects'))('only the admin can write %s', async (path) => {
        await assertFails(anon().doc(path).set({ v: 2 }));
        await assertFails(user().doc(path).set({ v: 2 }));
        await assertSucceeds(admin().doc(path).set({ v: 2 }));
    });
});

describe('private documents', () => {
    it.each(PRIVATE_DOCS)('a visitor or a signed-in non-admin cannot read %s', async (path) => {
        await seed(path);
        await assertFails(anon().doc(path).get());
        await assertFails(user().doc(path).get());
    });

    it.each(['Settings/Canary', 'Settings/MCP', 'Treasury/projects', 'Spark/memory', 'Anything/else', 'Settings/Hero/sub/x'])(
        'the admin can read and write %s', async (path) => {
            await assertSucceeds(admin().doc(path).set({ v: 1 }));
            await assertSucceeds(admin().doc(path).get());
            await assertSucceeds(admin().doc(path).delete());
        });

    it('nobody can list the private Settings documents through the collection', async () => {
        await seed('Settings/Canary');
        await assertFails(anon().collection('Settings').get());
    });
});

describe('function-only collections', () => {
    it.each(['MCP/tokens_abc', 'MCP/sub/deeper/doc', 'RateLimits/ip1'])('even the admin cannot touch %s', async (path) => {
        await seed(path);
        await assertFails(admin().doc(path).get());
        await assertFails(admin().doc(path).set({ v: 2 }));
    });

    it('the admin can read analytics but never write them', async () => {
        await seed('Analytics/Totals');
        await assertSucceeds(admin().doc('Analytics/Totals').get());
        await assertFails(admin().doc('Analytics/Totals').set({ v: 2 }));
        await assertFails(admin().doc('Analytics/Daily/Items/2026-10-27').set({ v: 2 }));
    });

    it('a visit story can be read and deleted by the admin, never forged or edited', async () => {
        await seed('Analytics/Sessions/Items/s1');
        await assertSucceeds(admin().doc('Analytics/Sessions/Items/s1').get());
        await assertFails(admin().doc('Analytics/Sessions/Items/s1').update({ v: 2 }));
        await assertFails(admin().doc('Analytics/Sessions/Items/s2').set({ v: 1 }));
        await assertSucceeds(admin().doc('Analytics/Sessions/Items/s1').delete());
    });

    it('share links are the admin\'s to create and edit', async () => {
        await assertSucceeds(admin().doc('Analytics/Links/Items/l1').set({ Name: 'x' }));
        await assertSucceeds(admin().doc('Analytics/Links/Items/l1').update({ Name: 'y' }));
    });

    it('the mail outbox can be read and cleared by the admin, never written', async () => {
        await seed('MailJobs/contact-owner_1', { status: 'failed', to: 'owner@example.com' });
        await assertSucceeds(admin().doc('MailJobs/contact-owner_1').get());
        await assertSucceeds(admin().collection('MailJobs').get());
        await assertFails(admin().doc('MailJobs/contact-owner_1').update({ status: 'pending' }));
        await assertFails(admin().doc('MailJobs/forged').set({ to: 'someone@example.com' }));
        await assertFails(admin().doc('MailJobs/x/sub/y').set({ v: 1 }));
        await assertSucceeds(admin().doc('MailJobs/contact-owner_1').delete());
    });

    it('the public handled-projects list is written only by its function', async () => {
        await seed('Settings/HandledProjects', { projects: {} });
        await assertSucceeds(anon().doc('Settings/HandledProjects').get());
        await assertFails(admin().doc('Settings/HandledProjects').set({ projects: { p: { name: 'x', status: 'active', order: 0 } } }));
        await assertFails(admin().doc('Settings/HandledProjects').update({ lastWrite: 1 }));
        await assertFails(admin().doc('Settings/HandledProjects').delete());
        await assertFails(user().doc('Settings/HandledProjects').set({ projects: {} }));
    });

    it('the MCP audit log can be read and cleared by the admin, never written', async () => {
        await seed('McpAudit/e1');
        await assertSucceeds(admin().doc('McpAudit/e1').get());
        await assertFails(admin().doc('McpAudit/e2').set({ v: 1 }));
        await assertFails(admin().doc('McpAudit/e1').update({ v: 2 }));
        await assertSucceeds(admin().doc('McpAudit/e1').delete());
    });
});
