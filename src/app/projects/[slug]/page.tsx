import type { CSSProperties } from 'react';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { ExternalLink, Download, User } from 'lucide-react';
import {
    SITE_URL, projectPages, projectPageUrl, tagNames, mediaOf, shortDescription, tagsDoc, contributorsDoc, profileRows,
} from '../../../lib/projectPages';
import { baseGraph, jsonLd, personRef, projectNode, websiteRef } from '../../../lib/siteProfile';
import { allContributors, contributorsOf, profilesOf, shapeProject, tagsOf, type FirestoreProject } from '../../../home/projects/shape';
import TagIcon from '../../../home/projects/TagIcon';
import { Github } from '../../../ui/BrandIcons';
import StandaloneBar from '../../../standalone/StandaloneBar';
import CaseStudy from '../../../standalone/CaseStudy';
import ProjectGallery from '../../../standalone/ProjectGallery';
import '../../../standalone/standalone.css';

// One static page per project, built from the snapshot. A slug the build doesn't
// know is a 404 rather than a page rendered on demand (there is no server).
export const dynamicParams = false;

export function generateStaticParams() {
    return projectPages.map((p) => ({ slug: p.slug }));
}

const find = (slug: string) => projectPages.find((p) => p.slug === slug);

const knownTags = tagsOf(tagsDoc);
const people = allContributors(contributorsOf(contributorsDoc), profilesOf(profileRows));

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
    // The tags with their icons and colours, and the people with their pictures, as the
    // project's window on the homepage resolves them.
    const { tags, contributors } = shapeProject(project as FirestoreProject, people, knownTags);
    const media = mediaOf(project);
    // Videos lead, as in the window.
    const shown = [...media.filter((m) => m.video), ...media.filter((m) => !m.video)];
    const live = project['Live Link'];
    const repo = project['Repository Link'];
    const download = project['Download Link'];
    const others = projectPages.filter((p) => p.slug !== slug);
    const url = projectPageUrl(slug);

    const cover = media.find((m) => !m.video)?.url;

    // The Person and WebSite nodes (siteProfile) are printed with it, so the graph is whole.
    const graph = [
        ...baseGraph,
        {
            '@type': 'WebPage',
            '@id': `${url}#webpage`,
            url,
            name: `${name} | Tem Revil`,
            description: shortDescription(project.Description || `${name}, a project by Tem Revil (Mohammed Ahmed).`),
            inLanguage: 'en',
            isPartOf: websiteRef,
            about: personRef,
            ...(cover ? { primaryImageOfPage: cover } : {}),
            breadcrumb: { '@id': `${url}#breadcrumb` },
            mainEntity: { '@id': `${url}#project` },
        },
        projectNode(page),
        {
            '@type': 'BreadcrumbList',
            '@id': `${url}#breadcrumb`,
            itemListElement: [
                { '@type': 'ListItem', position: 1, name: 'Tem Revil', item: SITE_URL },
                { '@type': 'ListItem', position: 2, name: 'Projects', item: `${SITE_URL}/projects` },
                { '@type': 'ListItem', position: 3, name, item: url },
            ],
        },
    ];

    return (
        <div className="pj">
            <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd(graph) }} />
            <div className="pj-wrap">
                <StandaloneBar />

                <main>
                    <ol className="pj-crumbs" aria-label="Breadcrumb">
                        <li><a href="/">Portfolio</a></li>
                        <li><a href="/projects">Projects</a></li>
                        <li aria-current="page">{name}</li>
                    </ol>

                    <ProjectGallery name={name} media={shown} />

                    {/* Laid out like the project's window on the homepage: the project and
                        what it is built with on the left, the ways to open it and the people
                        who built it on the right. */}
                    <div className="pj-detail">
                        <div className="pj-main">
                            <section className="pj-panel" aria-labelledby="pj-title">
                                <div className="pj-head">
                                    {project['Project Icon'] && <img className="pj-icon" src={project['Project Icon']} alt={`${name} logo`} width={64} height={64} />}
                                    <div>
                                        <h1 id="pj-title">{name}</h1>
                                        {note && <span className="pj-note">{note}</span>}
                                    </div>
                                </div>
                                {project.Description && <p className="pj-lede">{project.Description}</p>}
                            </section>

                            {tags.length > 0 && (
                                <section className="pj-panel" aria-labelledby="pj-stack">
                                    <h2 id="pj-stack">Built with</h2>
                                    <ul className="pj-stack">
                                        {tags.map((t) => (
                                            <li key={t.name} style={{ '--tag': t.color } as CSSProperties}>
                                                {t.iconSvg
                                                    ? <TagIcon icon={t.iconSvg} name="" className="pj-stack-icon" />
                                                    : <span className="pj-stack-dot" aria-hidden="true" />}
                                                {t.name}
                                            </li>
                                        ))}
                                    </ul>
                                </section>
                            )}

                            {project['Case Study'] && <CaseStudy text={project['Case Study']} />}
                        </div>

                        <aside className="pj-side" aria-label={`About ${name}`}>
                            {(live || repo || download) && (
                                <div className="pj-actions">
                                    {live && <a className="pj-action primary" href={live} target="_blank" rel="noopener"><ExternalLink size={22} aria-hidden="true" />Open the live site</a>}
                                    {download && <a className="pj-action" href={download} rel="noopener"><Download size={22} aria-hidden="true" />Download the app</a>}
                                    {repo && <a className="pj-action" href={repo} target="_blank" rel="noopener"><Github size={22} aria-hidden="true" />Source code</a>}
                                </div>
                            )}

                            {contributors.length > 0 && (
                                <section aria-labelledby="pj-people">
                                    <h2 id="pj-people">Built by</h2>
                                    <ul className="pj-people">
                                        {contributors.map((c) => (
                                            <li key={c.name}>
                                                <span className="pj-avatar">
                                                    {typeof c.image === 'string' && c.image
                                                        ? <img src={c.image} alt="" width={48} height={48} loading="lazy" />
                                                        : <User size={22} aria-hidden="true" />}
                                                </span>
                                                <span><b>{c.name}</b>{c.role && <small>{c.role}</small>}</span>
                                            </li>
                                        ))}
                                    </ul>
                                </section>
                            )}
                        </aside>
                    </div>

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
                        <p>Want something like {name} built?<span>A free 60 minute call about your project, in your own time zone.</span></p>
                        <a className="pj-cta" href="/book">Book a call</a>
                    </div>
                </main>
            </div>
        </div>
    );
}
