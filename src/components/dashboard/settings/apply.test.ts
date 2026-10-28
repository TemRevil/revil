import { describe, expect, it } from 'vitest';
import { summarizeApply, staleHeroPath } from './apply';

describe('summarizeApply', () => {
    it('reports a partial failure as one, naming what did and did not save', () => {
        const s = summarizeApply([['availability', 'saved'], ['hero image', 'failed'], ['profile', 'skipped']]);
        expect(s.ok).toBe(false);
        expect(s.failed).toEqual(['hero image']);
        expect(s.saved).toEqual(['availability']);
        expect(s.message).toContain('Not saved: hero image');
        expect(s.message).not.toMatch(/success/i);
    });

    it('reports success only when every attempted save stored', () => {
        expect(summarizeApply([['availability', 'saved'], ['profile', 'saved']])).toMatchObject({ ok: true, message: 'Saved: availability, profile.' });
        expect(summarizeApply([['profile', 'skipped']])).toMatchObject({ ok: true, message: 'Nothing needed saving.' });
    });
});

const url = (path: string) => `https://firebasestorage.googleapis.com/v0/b/demo.appspot.com/o/${encodeURIComponent(path)}?alt=media&token=t`;

describe('staleHeroPath', () => {
    it('returns the old file when the extension changed', () => {
        expect(staleHeroPath(url('src/imgs/Settings/Hero.image.png'), url('src/imgs/Settings/Hero.image.jpg'), 'light'))
            .toBe('src/imgs/Settings/Hero.image.png');
        expect(staleHeroPath(url('src/imgs/Settings/Hero.image.dark.png'), url('src/imgs/Settings/Hero.image.dark.webp'), 'dark'))
            .toBe('src/imgs/Settings/Hero.image.dark.png');
    });

    it('never returns the file just written, the other variant, or a file it did not name', () => {
        expect(staleHeroPath(url('src/imgs/Settings/Hero.image.png'), url('src/imgs/Settings/Hero.image.png'), 'light')).toBeNull();
        expect(staleHeroPath(url('src/imgs/Settings/Hero.image.dark.png'), url('src/imgs/Settings/Hero.image.jpg'), 'light')).toBeNull();
        expect(staleHeroPath(url('src/imgs/Settings/Profile_1_cropped.webp'), url('src/imgs/Settings/Hero.image.jpg'), 'light')).toBeNull();
        expect(staleHeroPath('https://example.com/hero.png', url('src/imgs/Settings/Hero.image.jpg'), 'light')).toBeNull();
    });
});
