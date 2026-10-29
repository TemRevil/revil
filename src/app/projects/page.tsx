import type { Metadata } from 'next';
import { SITE_URL, projectPages, projectPageUrl, tagsDoc, contributorsDoc, profileRows } from '../../lib/projectPages';
import { baseGraph, jsonLd, personRef, websiteRef, SHARE_CARD } from '../../lib/siteProfile';
import StandaloneBar from '../../standalone/StandaloneBar';
import ProjectsList from '../../standalone/ProjectsList';
import Kicker from '../../standalone/Kicker';
import type { FirestoreProject } from '../../home/projects/shape';
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

// What the grid needs of each project: the long write-up and the view counts stay out of
// the page, which carries this list once more for the browser to take over.
const gridProjects = projectPages.map(({ project, name, slug }) => {
    const { 'Case Study': _story, Views: _views, ...card } = project as typeof project & { Views?: unknown };
    return { ...(card as FirestoreProject), name, slug };
});

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
                    <div className="pj-list-head">
                        <Kicker text="Selected" />
                        <h1 className="pj-display">Projects</h1>
                        <p className="pj-intro">Things I designed and built: web apps, AI tools, a desktop system and UI designs. Each one has its live site and source code.</p>
                    </div>
                    <ProjectsList projects={gridProjects} tagsDoc={tagsDoc} contributorsDoc={contributorsDoc} profiles={profileRows} />
                    <div className="pj-end">
                        <p>Have a project in mind?<span>A free 60 minute call about it, in your own time zone.</span></p>
                        <a className="pj-cta" href="/book">Book a call</a>
                    </div>
                </main>
            </div>
        </div>
    );
}
