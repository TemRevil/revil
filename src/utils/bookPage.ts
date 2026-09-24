/**
 * What the public /book page says about the owner: the handwritten title, the short
 * intro, the "what I build" tags, the status pill and which links show. Stored in the
 * public-read, admin-write Settings/BookPage doc and edited from Canary → Options.
 * Every field falls back to the defaults below, so a missing or half-written doc still
 * renders the page as designed.
 */

export type BookLinkKind = 'email' | 'github' | 'linkedin' | 'instagram' | 'portfolio' | 'link';

export interface BookLink {
    id: string;
    kind: BookLinkKind;
    label: string;
    /** mailto:, https:// or a site path like "/". */
    url: string;
    show: boolean;
}

export interface BookPageConfig {
    /** Handwritten line beside the name. */
    slogan: string;
    /** The intro under the hero. Wrap words in **double asterisks** to bold them. */
    intro: string;
    tags: string[];
    /** Text of the green status pill. Empty hides the pill. */
    status: string;
    links: BookLink[];
}

export const MAX_TAGS = 12;
export const MAX_TAG_LENGTH = 32;
export const MAX_INTRO_LENGTH = 320;
export const MAX_SLOGAN_LENGTH = 40;
export const MAX_LINKS = 10;

export const DEFAULT_BOOK_PAGE: BookPageConfig = {
    slogan: 'AI Products Expert',
    intro: "I'm **Mohammed Ahmed**. I build web apps with AI inside them, from the idea to launch. Let's talk about your project, a role, a collab or your podcast.",
    tags: ['Web apps', 'AI features', 'Motion UI', 'Firebase back ends', 'Desktop apps'],
    status: 'Available now',
    links: [
        { id: 'email', kind: 'email', label: 'hello@temrevil.com', url: 'mailto:hello@temrevil.com', show: true },
        { id: 'github', kind: 'github', label: 'GitHub', url: 'https://github.com/TemRevil', show: true },
        { id: 'linkedin', kind: 'linkedin', label: 'LinkedIn', url: 'https://linkedin.com/in/temrevil', show: true },
        { id: 'instagram', kind: 'instagram', label: 'Instagram', url: 'https://instagram.com/temrevil', show: true },
        { id: 'portfolio', kind: 'portfolio', label: 'Full portfolio', url: '/', show: true },
    ],
};

const KINDS: BookLinkKind[] = ['email', 'github', 'linkedin', 'instagram', 'portfolio', 'link'];

/** Only links a visitor can safely follow: mailto, http(s), or a same-site path. */
export const isSafeLinkUrl = (url: string) => /^(mailto:[^\s]+|https?:\/\/[^\s]+|\/[^\s]*)$/i.test(url.trim());

const str = (v: unknown, max: number, fallback: string) =>
    typeof v === 'string' ? v.slice(0, max) : fallback;

export function parseBookPage(data: Record<string, unknown> | undefined | null): BookPageConfig {
    if (!data) return DEFAULT_BOOK_PAGE;
    const tags = Array.isArray(data.tags)
        ? data.tags.filter((t): t is string => typeof t === 'string' && t.trim() !== '').map(t => t.trim().slice(0, MAX_TAG_LENGTH)).slice(0, MAX_TAGS)
        : DEFAULT_BOOK_PAGE.tags;
    const links = Array.isArray(data.links)
        ? data.links.flatMap((l): BookLink[] => {
            if (!l || typeof l !== 'object') return [];
            const o = l as Record<string, unknown>;
            const url = typeof o.url === 'string' ? o.url.trim() : '';
            const label = typeof o.label === 'string' ? o.label.trim() : '';
            if (!url || !label || !isSafeLinkUrl(url)) return [];
            const kind = KINDS.includes(o.kind as BookLinkKind) ? (o.kind as BookLinkKind) : 'link';
            return [{ id: typeof o.id === 'string' && o.id ? o.id : `${kind}-${label}`, kind, label: label.slice(0, 60), url, show: o.show !== false }];
        }).slice(0, MAX_LINKS)
        : DEFAULT_BOOK_PAGE.links;
    return {
        slogan: str(data.slogan, MAX_SLOGAN_LENGTH, DEFAULT_BOOK_PAGE.slogan).trim() || DEFAULT_BOOK_PAGE.slogan,
        intro: str(data.intro, MAX_INTRO_LENGTH, DEFAULT_BOOK_PAGE.intro),
        tags,
        status: str(data.status, 40, DEFAULT_BOOK_PAGE.status),
        links,
    };
}

/** Splits "I'm **Mohammed**." into text + bold runs. No HTML is ever produced from input. */
export function introRuns(intro: string): { text: string; bold: boolean }[] {
    return intro.split(/(\*\*[^*]+\*\*)/g).filter(Boolean).map(part =>
        part.startsWith('**') && part.endsWith('**') && part.length > 4
            ? { text: part.slice(2, -2), bold: true }
            : { text: part, bold: false });
}
