import { describe, expect, it } from 'vitest';
import { deadTagsOf, filterProjects, shapeProject, tagsOf } from './shape';

const tags = tagsOf({
    1: { Name: 'React', Color: '#61dafb', Icon: 'https://example.com/react.svg' },
    2: { Name: 'CSS' },
    3: { Name: 'Electron' },
});

const project = (id: string, listing: number, stack: string[]) =>
    shapeProject({ id, Listing: listing, Tags: Object.fromEntries(stack.map((s, i) => [String(i), s])) }, [], tags);

const projects = [project('Kittle', 2, ['React', 'CSS']), project('Gunter', 1, ['Electron']), project('Vrose', 0, ['CSS'])];
const ids = (list: { id?: string | number }[]) => list.map(p => p.id);

describe('shapeProject', () => {
    it("takes a tag's colour and icon from Tags/Tags", () => {
        expect(projects[0].tags[0]).toEqual({ name: 'React', color: '#61dafb', iconSvg: 'https://example.com/react.svg' });
    });
});

describe('filterProjects', () => {
    it('keeps the listing order, a project never reordered last', () => {
        expect(ids(filterProjects(projects, { tags: [], query: '' }))).toEqual(['Gunter', 'Kittle', 'Vrose']);
    });

    it('puts pinned projects first, in pinning order', () => {
        expect(ids(filterProjects(projects, { tags: [], query: '', pinned: ['Vrose'] }))).toEqual(['Vrose', 'Gunter', 'Kittle']);
    });

    it('keeps only projects with every picked tag', () => {
        expect(ids(filterProjects(projects, { tags: ['CSS'], query: '' }))).toEqual(['Kittle', 'Vrose']);
        expect(ids(filterProjects(projects, { tags: ['CSS', 'react'], query: '' }))).toEqual(['Kittle']);
    });

    it('searches titles and tags, closest first', () => {
        expect(ids(filterProjects(projects, { tags: [], query: 'electron' }))).toEqual(['Gunter']);
    });
});

describe('deadTagsOf', () => {
    it('marks the tags no project carries with the ones picked', () => {
        expect([...deadTagsOf(tags, projects, ['CSS'])]).toEqual(['Electron']);
        expect([...deadTagsOf(tags, projects, [])]).toEqual([]);
    });
});
