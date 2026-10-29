import { describe, expect, it } from 'vitest';
import {
    writeProject, placeReordered, changedListings,
    ProjectNameTaken, ProjectGone, ZERO_VIEWS, type DocTx, type ProjectFields,
} from './save';
import { storagePathFromUrl } from '../storagePath';

type Store = Map<string, Record<string, unknown>>;

/** A transaction over an in-memory store: writes apply only if the whole run succeeds. */
async function run(store: Store, body: (tx: DocTx<string>) => Promise<void>) {
    const writes: Array<() => void> = [];
    const tx: DocTx<string> = {
        get: async id => ({ exists: () => store.has(id), data: () => store.get(id) }),
        set: (id, data, options) => {
            writes.push(() => {
                if (!options) { store.set(id, { ...data }); return; }
                const next = { ...(store.get(id) || {}) };
                for (const f of options.mergeFields) next[f] = data[f];
                store.set(id, next);
            });
        },
        delete: id => { writes.push(() => store.delete(id)); },
    };
    await body(tx);
    writes.forEach(w => w());
}

const fields = (description: string): ProjectFields => ({
    Description: description, 'Case Study': '', 'Live Link': '', 'Download Link': '', 'Project Icon': '',
    'Repository Link': '', Contributors: {}, Tags: {}, 'Project Images': [],
});

const stored = () => new Map<string, Record<string, unknown>>([
    ['Alpha', { ...fields('alpha'), Views: { Github: 4, Live: 9, Download: 1, Project: 30 }, Listing: 2 }],
    ['Beta', { ...fields('beta'), Views: { Github: 0, Live: 0, Download: 0, Project: 5 }, Listing: 1 }],
]);

describe('writeProject', () => {
    it('an edit leaves the stored view counts and listing alone', async () => {
        const store = stored();
        // Visits recorded on the live site while the form was open.
        store.get('Alpha')!.Views = { Github: 5, Live: 12, Download: 1, Project: 41 };
        await run(store, tx => writeProject(tx, { mode: 'edit', target: 'Alpha', name: 'Alpha', fields: fields('changed') }));
        expect(store.get('Alpha')).toMatchObject({ Description: 'changed', Views: { Project: 41, Live: 12 }, Listing: 2 });
    });

    it('a rename onto an existing project is refused and changes nothing', async () => {
        const store = stored();
        await expect(run(store, tx => writeProject(tx, {
            mode: 'rename', target: 'Beta', source: 'Alpha', name: 'Beta', oldName: 'Alpha', fields: fields('renamed'),
        }))).rejects.toBeInstanceOf(ProjectNameTaken);
        expect(store.get('Beta')!.Description).toBe('beta');
        expect(store.has('Alpha')).toBe(true);
    });

    it('a rename moves the document with its counts and listing, then removes the old one', async () => {
        const store = stored();
        await run(store, tx => writeProject(tx, {
            mode: 'rename', target: 'Gamma', source: 'Alpha', name: 'Gamma', oldName: 'Alpha', fields: fields('moved'),
        }));
        expect(store.has('Alpha')).toBe(false);
        expect(store.get('Gamma')).toMatchObject({ Description: 'moved', Views: { Project: 30 }, Listing: 2 });
    });

    it('a rename of a project deleted elsewhere is refused', async () => {
        const store = stored();
        store.delete('Alpha');
        await expect(run(store, tx => writeProject(tx, {
            mode: 'rename', target: 'Gamma', source: 'Alpha', name: 'Gamma', oldName: 'Alpha', fields: fields('x'),
        }))).rejects.toBeInstanceOf(ProjectGone);
        expect(store.has('Gamma')).toBe(false);
    });

    it('a create never overwrites a project of the same name, and starts its counts at zero', async () => {
        const store = stored();
        await expect(run(store, tx => writeProject(tx, { mode: 'create', target: 'Beta', name: 'Beta', fields: fields('new') })))
            .rejects.toBeInstanceOf(ProjectNameTaken);
        await run(store, tx => writeProject(tx, { mode: 'create', target: 'Delta', name: 'Delta', fields: fields('new'), listing: 3 }));
        expect(store.get('Delta')).toMatchObject({ Views: ZERO_VIEWS, Listing: 3 });
    });
});

describe('storagePathFromUrl', () => {
    it('reads the same path from URLs whose tokens differ', () => {
        const a = 'https://firebasestorage.googleapis.com/v0/b/demo.appspot.com/o/src%2Fprojects-imgs%2FMy%20App%2Fshot%201.png?alt=media&token=aaa';
        const b = 'https://firebasestorage.googleapis.com/v0/b/demo.appspot.com/o/src%2Fprojects-imgs%2FMy%20App%2Fshot%201.png?alt=media&token=bbb';
        expect(storagePathFromUrl(a)).toBe('src/projects-imgs/My App/shot 1.png');
        expect(storagePathFromUrl(a)).toBe(storagePathFromUrl(b));
        expect(storagePathFromUrl('https://example.com/x.png')).toBeNull();
    });
});

describe('placeReordered + changedListings', () => {
    const all = [
        { id: 'a', listing: 1 }, { id: 'b', listing: 2 }, { id: 'c', listing: 3 }, { id: 'd', listing: 4 },
    ];

    it('a drag inside a filtered view keeps hidden projects in place and indexes unique', () => {
        // The view shows b and d; the owner drags d above b.
        const next = placeReordered(all, [all[3], all[1]]);
        expect(next.map(p => p.id)).toEqual(['a', 'd', 'c', 'b']);
        const listings = next.map(p => p.listing);
        expect(new Set(listings).size).toBe(listings.length);
    });

    it('only projects whose index moved are written', () => {
        const next = placeReordered(all, [all[1], all[0], all[2], all[3]]);
        const stored = new Map(all.map(p => [p.id, p.listing]));
        expect(changedListings(next, stored)).toEqual([{ id: 'b', listing: 1 }, { id: 'a', listing: 2 }]);
    });
});
