import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import {
    SITE_URL, projectPages, projectPageUrl, tagNames, contributorsOf, mediaOf, shortDescription,
} from '../../../utils/projectPages';
import ProjectsBar from '../ProjectsBar';
import '../projects.css';

// One static page per project, built from the snapshot. A slug the build doesn't
// know is a 404 rather than a page rendered on demand (there is no server).
export const dynamicParams = false;

export function generateStaticParams() {
    return projectPages.map((p) => ({ slug: p.slug }));
}

const find = (slug: string) => projectPages.find((p) => p.slug === slug);

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
    const page = find((await params).slug);
    if (!page) return {};
    const { project, name, slug } = page;
    const title = `${name} | Tem Revil`;
    const description = shortDescription(project.Description || `${name}, a project by Tem Revil (Mohammed Ahmed).`);
    const cover = mediaOf(project).find((m) => !m.video)?.url || project['Project Icon'];
    const images = cover ? [{ url: cover, alt: name }] : undefined;
    // Nested metadata replaces the root's openGraph/twitter objects wholesale, so the
    // fields the root sets are repeated here.
    return {
        title,
        description,
        keywords: [name, `${name} Tem Revil`, ...tagNames(project), 'Tem Revil project', 'Mohammed Ahmed project'],
        alternates: { canonical: `/projects/${slug}` },
        openGraph: { type: 'article', url: projectPageUrl(slug), title, description, siteName: 'Tem Revil', locale: 'en_US', images },
        twitter: { card: 'summary_large_image', title, description, images: cover ? [cover] : undefined },
    };
}

export default async function ProjectPage({ params }: { params: Promise<{ slug: string }> }) {
    const page = find((await params).slug);
    if (!page) notFound();
    const { project, name, note, slug } = page;
    const tags = tagNames(project);
    const people = contributorsOf(project);
    const media = mediaOf(project);
    const live = project['Live Link'];
    const repo = project['Repository Link'];
    const download = project['Download Link'];
    const others = projectPages.filter((p) => p.slug !== slug);
    const url = projectPageUrl(slug);

    // Linked to the root Person and WebSite nodes (layout.tsx) by @id.
    const structuredData = {
        '@context': 'https://schema.org',
        '@graph': [
            {
                '@type': 'CreativeWork',
                '@id': `${url}#project`,
                url,
                name,
                ...(project.Description ? { description: project.Description } : {}),
                ...(media.length ? { image: media.filter((m) => !m.video).map((m) => m.url) } : {}),
                ...(tags.length ? { keywords: tags.join(', ') } : {}),
                ...(repo ? { codeRepository: repo } : {}),
                ...(live || repo ? { sameAs: [live, repo].filter(Boolean) } : {}),
                author: { '@id': `${SITE_URL}/#person` },
                ...(people.length > 1 ? {
                    contributor: people.filter((p) => p.name !== 'Mohammed Ahmed').map((p) => ({ '@type': 'Person', name: p.name, jobTitle: p.role || undefined })),
                } : {}),
                isPartOf: { '@id': `${SITE_URL}/#website` },
            },
            {
                '@type': 'BreadcrumbList',
                itemListElement: [
                    { '@type': 'ListItem', position: 1, name: 'Tem Revil', item: SITE_URL },
                    { '@type': 'ListItem', position: 2, name: 'Projects', item: `${SITE_URL}/projects` },
                    { '@type': 'ListItem', position: 3, name, item: url },
                ],
            },
        ],
    };

    return (
        <div className="pj">
            <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData).replace(/</g, String.fromCharCode(92) + "u003c") }} />
            <div className="pj-wrap">
                <ProjectsBar />

                <main>
                    <ol className="pj-crumbs" aria-label="Breadcrumb">
                        <li><a href="/">Portfolio</a></li>
                        <li><a href="/projects">Projects</a></li>
                        <li aria-current="page">{name}</li>
                    </ol>

                    <div className="pj-head">
                        {project['Project Icon'] && <img className="pj-icon" src={project['Project Icon']} alt="" width={64} height={64} />}
                        <div>
                            <h1>{name}</h1>
                            {note && <span className="pj-note">{note}</span>}
                        </div>
                    </div>

                    {project.Description && <p className="pj-lede">{project.Description}</p>}

                    {tags.length > 0 && (
                        <ul className="pj-tags" aria-label="Built with">
                            {tags.map((t) => <li key={t}>{t}</li>)}
                        </ul>
                    )}

                    {(live || repo || download) && (
                        <div className="pj-actions">
                            {live && <a className="pj-btn primary" href={live} target="_blank" rel="noopener">Open the live site ↗</a>}
                            {repo && <a className="pj-btn" href={repo} target="_blank" rel="noopener">Source code on GitHub ↗</a>}
                            {download && <a className="pj-btn" href={download} rel="noopener">Download</a>}
                        </div>
                    )}

                    {media.length > 0 && (
                        <div className="pj-gallery">
                            {media.map((m, i) => (
                                <figure className="pj-shot" key={m.url}>
                                    {m.video
                                        ? <video src={m.url} controls muted playsInline preload="metadata" aria-label={`${name} video`} />
                                        : <img src={m.url} alt={`${name} screenshot ${i + 1}`} loading={i === 0 ? 'eager' : 'lazy'} decoding="async" />}
                                </figure>
                            ))}
                        </div>
                    )}

                    {people.length > 0 && (
                        <section className="pj-section" aria-labelledby="pj-people">
                            <h2 id="pj-people">Built by</h2>
                            <ul className="pj-people">
                                {people.map((p) => <li key={p.name}><b>{p.name}</b>{p.role && <span>{p.role}</span>}</li>)}
                            </ul>
                        </section>
                    )}

                    {others.length > 0 && (
                        <section className="pj-section" aria-labelledby="pj-more">
                            <h2 id="pj-more">More projects</h2>
                            <ul className="pj-more">
                                {others.map((o) => (
                                    <li key={o.slug}>
                                        <a href={`/projects/${o.slug}`}>
                                            {o.project['Project Icon'] && <img src={o.project['Project Icon']} alt="" width={36} height={36} loading="lazy" />}
                                            <span><b>{o.name}</b><small>{tagNames(o.project).slice(0, 3).join(', ')}</small></span>
                                        </a>
                                    </li>
                                ))}
                            </ul>
                        </section>
                    )}

                    <div className="pj-end">
                        <p>Want something like {name} built?<span>A free 30 minute call about your project, in your own time zone.</span></p>
                        <a className="pj-cta" href="/book">Book a call</a>
                    </div>
                </main>
            </div>
        </div>
    );
}
