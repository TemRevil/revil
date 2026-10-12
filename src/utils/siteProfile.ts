import { SITE_URL, projectPages, tagNames } from './projectPages';

export { SITE_URL };

/**
 * Who the site is about, as search engines and AI answer engines read it: the page
 * titles and the schema.org JSON-LD. Server-only, like projectPages.
 *
 * Every public page prints `baseGraph` (the Person and the WebSite) in its own JSON-LD,
 * so each page's graph is complete on its own; the nodes that describe the homepage
 * itself (the profile page, its FAQ, the skills and the project list) are in
 * `homeGraph` and printed on the homepage only. They used to sit in the root layout,
 * which printed them on every page: each project page then claimed to be the profile
 * page, and /book carried two FAQPage blocks.
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

const PERSON_ID = `${SITE_URL}/#person`;
const WEBSITE_ID = `${SITE_URL}/#website`;
export const personRef = { '@id': PERSON_ID };
export const websiteRef = { '@id': WEBSITE_ID };

export const baseGraph = [
    {
        '@type': 'Person',
        '@id': PERSON_ID,
        name: 'Mohammed Ahmed',
        alternateName: ['Tem Revil', 'Temrevil', 'Tem', 'Tim'],
        description: PERSON_DESCRIPTION,
        url: SITE_URL,
        image: `${SITE_URL}${PORTRAIT}`,
        email: 'mailto:hello@temrevil.com',
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
        alternateName: ['Tem Revil', 'Temrevil'],
        description: PERSON_DESCRIPTION,
        inLanguage: 'en',
        creator: personRef,
        publisher: personRef,
    },
];

/** The FAQ the homepage shows and marks up; the two must say the same thing. */
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
    },
    {
        '@type': 'ItemList',
        '@id': `${SITE_URL}/#skills`,
        name: 'Technical skills',
        description: 'Core technologies Mohammed Ahmed works with',
        itemListElement: ['React', 'Next.js', 'TypeScript', 'Firebase', 'Tailwind CSS', 'Framer Motion', 'Node.js', 'Electron']
            .map((name, i) => ({ '@type': 'ListItem', position: i + 1, name })),
    },
    {
        '@type': 'FAQPage',
        '@id': `${SITE_URL}/#faq`,
        isPartOf: { '@id': `${SITE_URL}/#profile` },
        about: personRef,
        inLanguage: 'en',
        mainEntity: HOME_FAQ.map(({ q, a }) => ({ '@type': 'Question', name: q, acceptedAnswer: { '@type': 'Answer', text: a } })),
    },
    {
        // The work, baked in at build time from the committed snapshot: the homepage
        // loads projects from Firestore at runtime, which crawlers that don't run
        // JavaScript never see.
        '@type': 'ItemList',
        '@id': `${SITE_URL}/#projects`,
        name: 'Portfolio projects',
        description: 'Web apps, AI tools, desktop software and UI designs built by Mohammed Ahmed (Tem Revil).',
        numberOfItems: projectPages.length,
        itemListOrder: 'https://schema.org/ItemListUnordered',
        itemListElement: projectPages.map(({ project: p, name, slug }, i) => {
            const url = `${SITE_URL}/projects/${slug}`;
            const keywords = tagNames(p);
            return {
                '@type': 'ListItem',
                position: i + 1,
                url,
                item: {
                    '@type': 'CreativeWork',
                    // The same node the project's own page describes in full.
                    '@id': `${url}#project`,
                    name,
                    url,
                    ...(p.Description ? { description: p.Description } : {}),
                    ...(p['Live Link'] || p['Repository Link'] ? { sameAs: [p['Live Link'], p['Repository Link']].filter(Boolean) } : {}),
                    ...(p['Repository Link'] ? { codeRepository: p['Repository Link'] } : {}),
                    ...(p['Project Icon'] ? { image: p['Project Icon'] } : {}),
                    ...(keywords.length ? { keywords: keywords.join(', ') } : {}),
                    author: personRef,
                    isPartOf: websiteRef,
                },
            };
        }),
    },
];

/** A page's JSON-LD as a script body; `<` is escaped so text can't close the tag. */
export const jsonLd = (graph: object[]) =>
    JSON.stringify({ '@context': 'https://schema.org', '@graph': graph }).replace(/</g, '\\u003c');

