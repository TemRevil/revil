import { describe, expect, it } from 'vitest';
import { curtainSide, nextTitle } from './PageCurtain';

describe('curtainSide', () => {
    it('follows the top bar order between projects and privacy', () => {
        expect(curtainSide('/projects', '/privacy')).toBe('right');
        expect(curtainSide('/privacy', '/projects')).toBe('left');
        expect(curtainSide('/privacy', '/projects/kittle')).toBe('left');
    });
    it('goes into a project from below and back out from above', () => {
        expect(curtainSide('/projects', '/projects/kittle')).toBe('bottom');
        expect(curtainSide('/projects/kittle', '/projects')).toBe('top');
    });
    it('leaves other pages and the open page alone', () => {
        expect(curtainSide('/privacy', '/')).toBeNull();
        expect(curtainSide('/privacy', '/book')).toBeNull();
        expect(curtainSide('/privacy', '/privacy/')).toBeNull();
        expect(curtainSide('/', '/projects')).toBeNull();
    });
});

describe('nextTitle', () => {
    const link = (text: string, pageTitle?: string) => ({ dataset: pageTitle ? { pageTitle } : {}, textContent: text });
    it('names the two fixed pages by their address', () => {
        expect(nextTitle('/privacy', link('Privacy & terms'))).toBe('Privacy & terms');
        expect(nextTitle('/projects/', link('All projects'))).toBe('Projects');
    });
    it("names a project by the link's page title, else its text", () => {
        expect(nextTitle('/projects/kittle', link('Kittle. AI, React, Firebase', 'Kittle.'))).toBe('Kittle.');
        expect(nextTitle('/projects/glass-rea', link('  Glass-Rea '))).toBe('Glass-Rea');
    });
});
