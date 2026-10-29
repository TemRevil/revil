'use client';

import { useEffect, useMemo, useState } from 'react';
import type { Data, Row } from '../lib/dataCache';
import ProjectCard from '../home/projects/ProjectCard';
import ProjectFilters from '../home/projects/ProjectFilters';
import Reflow from '../ui/Reflow';
import {
    allContributors, contributorsOf, deadTagsOf, filterProjects, profilesOf, shapeProject, tagsOf,
    type FirestoreProject,
} from '../home/projects/shape';

interface Props {
    /** The projects, in the build's snapshot (app/projects/page.tsx), each with its page's name and address. */
    projects: (FirestoreProject & { name: string; slug: string })[];
    tagsDoc: Data | null;
    contributorsDoc: Data | null;
    profiles: Row[];
}

/**
 * The /projects grid: the homepage's Projects section (its search, technology filter and
 * cards), where a card is the link to the project's page instead of opening its window.
 * Prerendered with every project, so the page reads whole before any script runs.
 */
export default function ProjectsList({ projects, tagsDoc, contributorsDoc, profiles }: Props) {
    const tags = useMemo(() => tagsOf(tagsDoc), [tagsDoc]);
    const shaped = useMemo(() => {
        const people = allContributors(contributorsOf(contributorsDoc), profilesOf(profiles));
        return projects.map(p => ({ ...shapeProject(p, people, tags), title: p.name }));
    }, [projects, contributorsDoc, profiles, tags]);
    const slugs = useMemo(() => new Map(projects.map(p => [p.id, p.slug])), [projects]);

    const [query, setQuery] = useState('');
    const [search, setSearch] = useState('');
    const [picked, setPicked] = useState<string[]>([]);

    // The same wait as the homepage: the grid moves once typing pauses.
    useEffect(() => {
        const timer = setTimeout(() => setSearch(query), 250);
        return () => clearTimeout(timer);
    }, [query]);

    const shown = useMemo(() => filterProjects(shaped, { tags: picked, query: search }), [shaped, picked, search]);
    const dead = useMemo(() => deadTagsOf(tags, shaped, picked), [tags, shaped, picked]);

    return (
        <>
            <ProjectFilters
                query={query}
                onQuery={setQuery}
                tags={tags}
                picked={picked}
                onPick={setPicked}
                dead={dead}
                shown={shown.length}
                total={shaped.length}
            />
            <Reflow
                className="grid grid-cols-[repeat(auto-fill,minmax(300px,1fr))] gap-6"
                items={shown}
                keyOf={project => String(project.id)}
                render={project => (
                    <ProjectCard project={project} href={`/projects/${slugs.get(String(project.id)) ?? ''}`} active />
                )}
            />
        </>
    );
}
