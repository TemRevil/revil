import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest';
import { assertFails, assertSucceeds, type RulesTestEnvironment } from '@firebase/rules-unit-testing';
import { ADMIN, SIGNED_IN, startRulesEnv } from './setup';

let env: RulesTestEnvironment;

beforeAll(async () => { env = await startRulesEnv(); });
afterAll(async () => { await env?.cleanup(); });
beforeEach(async () => {
    // The SDK's clearStorage currently deletes only root-level items, not prefixes.
    // Our fixtures all live in nested folders: leaving them behind makes a later
    // upload fail the intentional no-overwrite rule before download is even tested.
    await env.withSecurityRulesDisabled(async (ctx) => {
        const clear = async (ref: ReturnType<Storage['ref']>): Promise<void> => {
            const { items, prefixes } = await ref.listAll();
            await Promise.all([...items.map(item => item.delete()), ...prefixes.map(clear)]);
        };
        await clear(ctx.storage().ref());
    });
});

type Storage = ReturnType<ReturnType<RulesTestEnvironment['unauthenticatedContext']>['storage']>;

const anon = () => env.unauthenticatedContext().storage();
const user = () => env.authenticatedContext(SIGNED_IN.uid, SIGNED_IN.claims).storage();
const admin = () => env.authenticatedContext(ADMIN.uid, ADMIN.claims).storage();

/** Uploads `size` zero bytes as `contentType`; a promise, as the assert helpers want. */
const put = (storage: Storage, path: string, contentType: string, size = 16): Promise<unknown> =>
    new Promise((resolve, reject) => storage.ref(path).put(new Uint8Array(size), { contentType }).then(resolve, reject));

/** Uploads a file with the rules switched off. */
async function seed(path: string, contentType = 'image/png') {
    await env.withSecurityRulesDisabled(async (ctx) => { await put(ctx.storage(), path, contentType); });
}

describe('contact-form attachments (emails/)', () => {
    const folder = 'emails/1781817458723_zmn0zb6';
    const path = `${folder}/0_photo.png`;

    it('a visitor can upload an allowed file type', async () => {
        await assertSucceeds(put(anon(), path, 'image/png'));
        const allowed = ['image/jpeg', 'application/pdf', 'text/plain',
            'application/vnd.openxmlformats-officedocument.wordprocessingml.document'];
        for (const [i, contentType] of allowed.entries()) {
            await assertSucceeds(put(anon(), `emails/f1/${i}_file`, contentType));
        }
    });

    it('refuses executable or disguised types', async () => {
        for (const [i, contentType] of ['image/svg+xml', 'text/html', 'application/javascript', 'image/png, text/html'].entries()) {
            await assertFails(put(anon(), `emails/f2/${i}_x`, contentType));
        }
    });

    it('refuses a file of 10 MB or more', async () => {
        await assertFails(put(anon(), 'emails/f3/0_big.png', 'image/png', 10 * 1024 * 1024));
    });

    it('refuses a folder id or file name that is too long', async () => {
        await assertFails(put(anon(), `emails/${'a'.repeat(41)}/0_x.png`, 'image/png'));
        await assertFails(put(anon(), `emails/f4/${'a'.repeat(201)}`, 'image/png'));
    });

    it('a visitor cannot overwrite an existing attachment', async () => {
        await seed(path);
        await assertFails(put(anon(), path, 'image/png'));
    });

    it('the uploader can fetch the download link right after uploading', async () => {
        await assertSucceeds(put(anon(), path, 'image/png'));
        await assertSucceeds(anon().ref(path).getDownloadURL());
    });

    it('a visitor can neither list a folder nor delete a file', async () => {
        await seed(path);
        await assertFails(anon().ref(folder).listAll());
        await assertFails(anon().ref(path).delete());
    });

    it('the admin can read, list and delete attachments', async () => {
        await seed(path);
        await assertSucceeds(admin().ref(path).getMetadata());
        await assertSucceeds(admin().ref(folder).listAll());
        await assertSucceeds(admin().ref(path).delete());
    });
});

describe('everything else in the bucket', () => {
    const path = 'Projects/demo/cover.webp';

    it('only the admin can read or list it', async () => {
        await seed(path, 'image/webp');
        await assertFails(anon().ref(path).getMetadata());
        await assertFails(user().ref(path).getMetadata());
        await assertFails(anon().ref('').listAll());
        await assertSucceeds(admin().ref(path).getMetadata());
        await assertSucceeds(admin().ref('Projects').listAll());
    });

    it('only the admin can upload', async () => {
        await assertFails(put(anon(), path, 'image/webp'));
        await assertFails(put(user(), path, 'image/webp'));
        await assertSucceeds(put(admin(), path, 'image/webp'));
    });

    it('the admin can delete a file (a delete has no request.resource)', async () => {
        await seed(path, 'image/webp');
        await assertFails(user().ref(path).delete());
        await assertSucceeds(admin().ref(path).delete());
    });
});
