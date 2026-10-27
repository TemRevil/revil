import { describe, expect, it } from 'vitest';
import { projectSlugs, slugOf } from './projectSlug';

describe('projectSlugs', () => {
    it('gives a lone project its plain slug', () => {
        expect(projectSlugs(['Login-Design Vol.1', 'Gunter System (currently deactivated)'])).toEqual(new Map([
            ['Login-Design Vol.1', 'login-design-vol-1'],
            ['Gunter System (currently deactivated)', 'gunter-system'],
        ]));
    });

    it('never hands out one address twice', () => {
        // "Foo" and "Foo!" both slug to foo, and "Foo 2" is foo-2 on its own.
        const ids = ['Foo', 'Foo!', 'Foo 2', 'foo', 'FOO?'];
        const slugs = [...projectSlugs(ids).values()];
        expect(slugs).toHaveLength(ids.length);
        expect(new Set(slugs).size).toBe(ids.length);
        expect(projectSlugs(ids).get('Foo 2')).toBe('foo-2');
    });

    it('does not move a page when the portfolio is reordered', () => {
        const ids = ['Foo', 'Foo!', 'Bar', 'Foo 2', 'Bar?'];
        const a = projectSlugs(ids);
        const b = projectSlugs([...ids].reverse());
        expect(b).toEqual(a);
    });

    it('builds every tagged slug from the plain one', () => {
        const slugs = projectSlugs(['Foo', 'Foo!']);
        expect(slugs.get('Foo')).toBe('foo');
        expect(slugs.get('Foo!')).toMatch(/^foo-[0-9a-z]{4,}$/);
        expect(slugOf('Foo!')).toBe('foo');
    });
});
