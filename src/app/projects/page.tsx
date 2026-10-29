import type { Metadata } from 'next';
import { SITE_URL, projectPages, projectPageUrl, tagNames, mediaOf, shortDescription } from '../../lib/projectPages';
import { baseGraph, jsonLd, personRef, websiteRef, SHARE_CARD } from '../../lib/siteProfile';
import StandaloneBar from '../../standalone/StandaloneBar';
import '../../standalone/standalone.css';

const title = 'Projects | Tem Revil';
const description =
    'Web apps, AI tools, desktop software and UI designs built by Tem Revil (Mohammed Ahmed), frontend and AI engineer from El Mansoura, Egypt.';

export const metadata: Metadata = {
    title,
    description,
    alternates: { canonical: '/projects' },
    openGraph: { type: 'website', url: `${SITE_URL}/projects`, title, description, siteName: 'Tem Revil', locale: 'en_US', images: [SHARE_CARD] },
    twitter: { card: 'summary_large_image', title, description, images: [SHARE_CARD.url] },
};

export default function ProjectsIndex() {
    const graph = [
        ...baseGraph,
            {
                '@type': 'CollectionPage',
                '@id': `${SITE_URL}/projects#webpage`,
                url: `${SITE_URL}/projects`,
                name: title,
                description,
                inLanguage: 'en',
                isPartOf: websiteRef,
                about: personRef,
                breadcrumb: { '@id': `${SITE_URL}/projects#breadcrumb` },
                mainEntity: {
                    '@type': 'ItemList',
                    '@id': `${SITE_URL}/projects#list`,
                    numberOfItems: projectPages.length,
                    itemListElement: projectPages.map((p, i) => ({ '@type': 'ListItem', position: i + 1, url: projectPageUrl(p.slug), name: p.name })),
                },
            },
            {
                '@type': 'BreadcrumbList',
                '@id': `${SITE_URL}/projects#breadcrumb`,
                itemListElement: [
                    { '@type': 'ListItem', position: 1, name: 'Tem Revil', item: SITE_URL },
                    { '@type': 'ListItem', position: 2, name: 'Projects', item: `${SITE_URL}/projects` },
                ],
            },
    ];

    return (
        <div className="pj">
            <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd(graph) }} />
            <div className="pj-wrap">
                <StandaloneBar current="list" />
                <main>
                    <h1 style={{ marginTop: 40 }}>Projects</h1>
                    <p className="pj-intro">Things I designed and built: web apps, AI tools, a desktop system and UI designs. Each one has its live site and source code.</p>
                    <ul className="pj-grid">
                        {projectPages.map((p, i) => {
                            const cover = mediaOf(p.project).find((m) => !m.video)?.url || p.project['Project Icon'];
                            return (
                                <li key={p.slug}>
                                    <a className="pj-card" href={`/projects/${p.slug}`}>
                                        <figure>{cover && <img src={cover} alt={`${p.name} screenshot`} loading={i < 3 ? 'eager' : 'lazy'} decoding="async" />}</figure>
                                        <div>
                                            <h2>{p.name}</h2>
                                            {p.project.Description && <p>{shortDescription(p.project.Description, 120)}</p>}
                                            {tagNames(p.project).length > 0 && (
                                                <ul className="pj-tags" style={{ marginTop: 4 }}>
                                                    {tagNames(p.project).slice(0, 4).map((t) => <li key={t}>{t}</li>)}
                                                </ul>
                                            )}
                                        </div>
                                    </a>
                                </li>
                            );
                        })}
                    </ul>
                    <div className="pj-end">
                        <p>Have a project in mind?<span>A free 60 minute call about it, in your own time zone.</span></p>
                        <a className="pj-cta" href="/book">Book a call</a>
                    </div>
                </main>
            </div>
        </div>
    );
}
