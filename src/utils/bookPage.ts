/**
 * What the public /book page says about the owner: the handwritten title, the short
 * intro and the "what I build" tags. Stored in the public-read, admin-write
 * Settings/BookPage doc and edited from Canary → Options. The links are not stored
 * here: they are the site's own, from Settings/Account (see linksFromAccount).
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
}

export interface BookPageConfig {
    /** Handwritten line beside the name. */
    slogan: string;
    /** The intro under the hero. Wrap words in **double asterisks** to bold them. */
    intro: string;
    tags: string[];
}

export const MAX_TAGS = 12;
export const MAX_TAG_LENGTH = 32;
export const MAX_INTRO_LENGTH = 320;
export const MAX_SLOGAN_LENGTH = 40;

export const DEFAULT_BOOK_PAGE: BookPageConfig = {
    slogan: 'AI Products Expert',
    intro: "I'm **Mohammed Ahmed**. I build web apps with AI inside them, from the idea to launch. Let's talk about your project, a role, a collab or your podcast.",
    tags: ['Web apps', 'AI features', 'Motion UI', 'Firebase back ends', 'Desktop apps'],
};

/** Only links a visitor can safely follow: mailto, http(s), or a same-site path. */
export const isSafeLinkUrl = (url: string) => /^(mailto:[^\s]+|https?:\/\/[^\s]+|\/[^\s]*)$/i.test(url.trim());

const str = (v: unknown, max: number, fallback: string) =>
    typeof v === 'string' ? v.slice(0, max) : fallback;

export function parseBookPage(data: Record<string, unknown> | undefined | null): BookPageConfig {
    if (!data) return DEFAULT_BOOK_PAGE;
    const tags = Array.isArray(data.tags)
        ? data.tags.filter((t): t is string => typeof t === 'string' && t.trim() !== '').map(t => t.trim().slice(0, MAX_TAG_LENGTH)).slice(0, MAX_TAGS)
        : DEFAULT_BOOK_PAGE.tags;
    return {
        slogan: str(data.slogan, MAX_SLOGAN_LENGTH, DEFAULT_BOOK_PAGE.slogan).trim() || DEFAULT_BOOK_PAGE.slogan,
        intro: str(data.intro, MAX_INTRO_LENGTH, DEFAULT_BOOK_PAGE.intro),
        tags,
    };
}

/** Splits "I'm **Mohammed**." into text + bold runs. No HTML is ever produced from input. */
export function introRuns(intro: string): { text: string; bold: boolean }[] {
    return intro.split(/(\*\*[^*]+\*\*)/g).filter(Boolean).map(part =>
        part.startsWith('**') && part.endsWith('**') && part.length > 4
            ? { text: part.slice(2, -2), bold: true }
            : { text: part, bold: false });
}

const kindOf = (name: string, url: string): BookLinkKind => {
    const s = `${name} ${url}`.toLowerCase();
    if (s.includes('github')) return 'github';
    if (s.includes('linkedin')) return 'linkedin';
    if (s.includes('instagram')) return 'instagram';
    if (/^mailto:/i.test(url)) return 'email';
    return 'link';
};

/**
 * The links /book shows are the site's own, set in dashboard Settings → Social Links:
 * the contact email (Settings/Account.Email) first, then every social link in the
 * order Settings lists them, then the way back to the full portfolio.
 */
export function linksFromAccount(account: Record<string, unknown> | null | undefined): BookLink[] {
    const out: BookLink[] = [];
    const email = typeof account?.Email === 'string' ? account.Email.trim() : '';
    if (/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) out.push({ id: 'email', kind: 'email', label: email, url: `mailto:${email}` });
    const raw = account?.['Social Links'];
    if (raw && typeof raw === 'object') {
        for (const [name, url] of Object.entries(raw as Record<string, unknown>)) {
            if (typeof url !== 'string' || !name.trim() || !isSafeLinkUrl(url)) continue;
            out.push({ id: `social-${name}`, kind: kindOf(name, url.trim()), label: name.trim(), url: url.trim() });
        }
    }
    out.push({ id: 'portfolio', kind: 'portfolio', label: 'Full portfolio', url: '/' });
    return out;
}
