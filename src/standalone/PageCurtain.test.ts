import { describe, expect, it } from 'vitest';
import { curtainSide } from './PageCurtain';

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
