import {
    SITE_URL, projectPages, projectPageUrl, tagNames, contributorsOf, mediaOf, type ProjectPage,
} from './projectPages';

export { SITE_URL };

/**
 * Who the site is about, as search engines and AI answer engines read it: the page
 * titles and the schema.org JSON-LD. Server-only, like projectPages.
 *
 * Every public page prints `baseGraph` (the Person and the WebSite) in its own JSON-LD,
 * so each page's graph is complete on its own; the nodes that describe the homepage
 * itself (the profile page and the project list) are in `homeGraph` and printed on
 * the homepage only. They used to sit in the root layout, which printed them on every
 * page: each project page then claimed to be the profile page.
 *
 * No FAQPage: Google only shows FAQ results for government and health sites, and its
 * rules want the questions visible on the page, which the client-rendered app doesn't
 * do. The same answers stay in the homepage's <noscript> copy and in llms.txt, where
 * crawlers that don't run JavaScript read them.
 */

export const SITE_NAME = 'Tem Revil';
export const SITE_TITLE = 'Tem Revil (Mohammed Ahmed) | Frontend & AI Engineer, Egypt';
/** What a search result shows, kept near 155 characters so it isn't cut. */
export const SITE_DESCRIPTION =
    'Mohammed Ahmed (Tem Revil), frontend & AI engineer in El Mansoura, Egypt. React, Next.js and Firebase apps with AI built in. Book a free 60 minute call.';
/** The full version, for the Person and WebSite nodes. */
const PERSON_DESCRIPTION =
    'Mohammed Ahmed (Tem Revil) is a frontend and AI engineer based in El Mansoura, Egypt. He builds motion-rich, accessible web applications with React, Next.js, TypeScript and Firebase, and integrates AI into web products. Open to freelance, remote and full-time work.';
export const JOB_TITLE = 'Frontend & AI Engineer';
export const PORTRAIT = '/book/tem-cutout.webp';
/** The share card, drawn by scripts/og-card.mjs (`npm run og:card`). */
export const SHARE_CARD = { url: '/og.png', width: 1200, height: 630, alt: 'Tem Revil (Mohammed Ahmed), Frontend & AI Engineer' };

export const SOCIAL_PROFILES = {
    github: 'https://github.com/TemRevil',
    linkedin: 'https://www.linkedin.com/in/tem-revil',
    instagram: 'https://instagram.com/temrevil',
};

/** Names people search him by, besides "Mohammed Ahmed". */
export const ALIASES = ['Tem Revil', 'Temrevil'];
export const EMAIL = 'hello@temrevil.com';
export const LOCATION = 'El Mansoura (El Mansourah), Dakahlia, Egypt';

const PERSON_ID = `${SITE_URL}/#person`;
const WEBSITE_ID = `${SITE_URL}/#website`;
export const personRef = { '@id': PERSON_ID };
export const websiteRef = { '@id': WEBSITE_ID };

export const baseGraph = [
    {
        '@type': 'Person',
        '@id': PERSON_ID,
        name: 'Mohammed Ahmed',
        alternateName: ALIASES,
        description: PERSON_DESCRIPTION,
        url: SITE_URL,
        image: `${SITE_URL}${PORTRAIT}`,
        email: `mailto:${EMAIL}`,
        jobTitle: JOB_TITLE,
        homeLocation: { '@type': 'Place', name: 'El Mansoura, Dakahlia, Egypt' },
        address: { '@type': 'PostalAddress', addressLocality: 'El Mansoura', addressRegion: 'Dakahlia', addressCountry: 'EG' },
        nationality: { '@type': 'Country', name: 'Egypt' },
        sameAs: Object.values(SOCIAL_PROFILES),
        knowsAbout: [
            'Frontend engineering', 'React', 'Next.js', 'TypeScript', 'Firebase', 'Tailwind CSS',
            'Motion design for web interfaces', 'Framer Motion', 'Electron apps', 'AI product integration',
            'Web accessibility', 'Responsive design', 'Progressive Web Apps',
        ],
        makesOffer: {
            '@type': 'Offer',
            itemOffered: {
                '@type': 'Service',
                name: 'Frontend Development & AI Integration',
                description: 'Custom web applications built with React, Next.js, TypeScript and Firebase: motion-rich UI, AI features and performance work.',
            },
        },
    },
    {
        '@type': 'WebSite',
        '@id': WEBSITE_ID,
        url: SITE_URL,
        name: SITE_NAME,
        alternateName: ['Temrevil', 'temrevil.com'],
        description: PERSON_DESCRIPTION,
        inLanguage: 'en',
        creator: personRef,
        publisher: personRef,
    },
];

/** What he works with and what he offers, as the homepage's <noscript> copy and llms.txt list them. */
export const SKILLS = [
    'React, Next.js, and TypeScript frontend engineering',
    'Firebase (Firestore, Auth, Storage, Cloud Functions)',
    'Motion-rich UI with Framer Motion / Motion',
    'Tailwind CSS and custom design systems',
    'Electron cross-platform desktop applications',
    'AI-enhanced web experiences and AI product integration',
    'Web accessibility, responsive design, and Progressive Web Apps',
];
export const SERVICES = [
    'Custom web application development with React, Next.js, and TypeScript',
    'Real-time and serverless apps powered by Firebase',
    'Motion-rich, animated, and accessible user interfaces',
    'AI feature integration into web products',
    'Performance optimization and Core Web Vitals improvements',
    'Cross-platform desktop apps with Electron',
];

/** The questions the homepage's <noscript> copy and llms.txt answer. */
export const HOME_FAQ: { q: string; a: string }[] = [
    {
        q: 'Who is Tem Revil?',
        a: 'Tem Revil is the public name of Mohammed Ahmed, a frontend and AI engineer based in El Mansoura, Egypt. He builds motion-rich, accessible web applications with React, Next.js, TypeScript and Firebase, and integrates AI into web products.',
    },
    {
        q: 'What does Tem Revil specialize in?',
        a: 'Frontend engineering with React, Next.js and TypeScript, real-time and serverless apps on Firebase, motion design, cross-platform desktop apps with Electron, and AI features inside web products.',
    },
    {
        q: 'Where is Tem Revil based?',
        a: 'El Mansoura (also spelled El Mansourah), Dakahlia Governorate, Egypt. He works with clients remotely worldwide.',
    },
    {
        q: 'Is Tem Revil available for hire?',
        a: 'Yes: freelance, remote and full-time work on frontend development and AI integration. Book a free 60 minute call at https://temrevil.com/book or email hello@temrevil.com.',
    },
    {
        q: 'How can I contact Tem Revil?',
        a: 'Email hello@temrevil.com, book a call at https://temrevil.com/book, or find him as Tem Revil on GitHub, LinkedIn and Instagram.',
    },
];

/** Tags that are programming languages, for SoftwareSourceCode.programmingLanguage. */
const LANGUAGES = ['HTML', 'CSS', 'JavaScript', 'TypeScript', 'Python', 'Dart', 'Kotlin', 'Swift', 'Go', 'Rust', 'PHP', 'Java', 'C#', 'C++', 'SQL'];

/**
 * One project as schema.org sees it, the same node on the homepage and on the
 * project's own page. With a repository it is SoftwareSourceCode (codeRepository
 * belongs to that type, not to CreativeWork). The live site and the repo are links on
 * the page, not `sameAs`: they are the work's homes, not other descriptions of it.
 */
export const projectNode = ({ project: p, name, slug }: ProjectPage) => {
    const url = projectPageUrl(slug);
    const tags = tagNames(p);
    const repo = p['Repository Link'];
    const images = mediaOf(p).filter((m) => !m.video).map((m) => m.url);
    const languages = LANGUAGES.filter((l) => tags.some((t) => t.toLowerCase() === l.toLowerCase()));
    const others = contributorsOf(p).filter((c) => c.name !== 'Mohammed Ahmed');
    return {
        '@type': repo ? 'SoftwareSourceCode' : 'CreativeWork',
        '@id': `${url}#project`,
        url,
        name,
        ...(p.Description ? { description: p.Description } : {}),
        ...(images.length ? { image: images } : p['Project Icon'] ? { image: p['Project Icon'] } : {}),
        ...(tags.length ? { keywords: tags.join(', ') } : {}),
        ...(repo ? { codeRepository: repo } : {}),
        ...(repo && languages.length ? { programmingLanguage: languages } : {}),
        inLanguage: 'en',
        author: personRef,
        ...(others.length ? { contributor: others.map((c) => ({ '@type': 'Person', name: c.name, ...(c.role ? { jobTitle: c.role } : {}) })) } : {}),
        isPartOf: websiteRef,
        mainEntityOfPage: { '@id': `${url}#webpage` },
    };
};

export const homeGraph = [
    {
        '@type': 'ProfilePage',
        '@id': `${SITE_URL}/#profile`,
        url: SITE_URL,
        name: SITE_TITLE,
        description: SITE_DESCRIPTION,
        inLanguage: 'en',
        isPartOf: websiteRef,
        mainEntity: personRef,
        primaryImageOfPage: `${SITE_URL}${PORTRAIT}`,
        hasPart: { '@id': `${SITE_URL}/#projects` },
    },
    {
        // Google reads an ItemList as a carousel, which may only list page URLs (or
        // whole Course/Recipe/... items), so the list is URLs and each project is its
        // own node below.
        '@type': 'ItemList',
        '@id': `${SITE_URL}/#projects`,
        name: 'Portfolio projects',
        isPartOf: { '@id': `${SITE_URL}/#profile` },
        numberOfItems: projectPages.length,
        itemListElement: projectPages.map(({ slug }, i) => ({ '@type': 'ListItem', position: i + 1, url: `${SITE_URL}/projects/${slug}` })),
    },
    // The work itself, baked in at build time from the committed snapshot: the homepage
    // loads projects from Firestore at runtime, which crawlers that don't run JavaScript
    // never see. The very nodes the project pages print (projectNode).
    ...projectPages.map(projectNode),
];

/** A page's JSON-LD as a script body; `<` is escaped so text can't close the tag. */
export const jsonLd = (graph: object[]) =>
    JSON.stringify({ '@context': 'https://schema.org', '@graph': graph }).replace(/</g, '\\u003c');

