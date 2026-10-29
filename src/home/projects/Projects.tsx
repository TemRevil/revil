import { useEffect, useRef, useState, useMemo } from 'react';
import { AnimatePresence } from 'motion/react';
import { watchCollection, watchDoc } from '../../lib/liveDoc';
import { cachedCollection, cachedDoc } from '../../lib/dataCache';

import MProjectView from './ProjectView';
import ProjectCard from './ProjectCard';
import ProjectFilters from './ProjectFilters';
import Reflow from '../../ui/Reflow';
import MContributorView, { Contributor } from './ContributorView';
import { ContributorData } from '../../types';
import { enter } from '../entrance';
import { handwrite } from '../../lib/handwrite';
import { Chars } from '../../ui/Chars';
import { useTailor } from '../../lib/analytics/useTailor';
import { projectSlugs } from '../../lib/projectSlug';
import {
    allContributors, contributorsOf, deadTagsOf, filterProjects, profilesOf, shapeProject, tagsOf,
    type FirestoreProject,
} from './shape';

/**
 * `active` is false while the section is built but off screen (App keeps it mounted on
 * desktop so its data and images are ready); the entrance plays each time it turns true.
 */
const Projects = ({ active = true }: { active?: boolean }) => {
    const titleRef = useRef<HTMLHeadingElement>(null);
    const handwritingRef = useRef<HTMLDivElement>(null);
    // Everything starts from the cached copy (lib/dataCache), so the grid never waits for Firestore.
    const [docContributors, setDocContributors] = useState(() => contributorsOf(cachedDoc(['Tags', 'Contributors'])));
    const [profiles, setProfiles] = useState(() => profilesOf(cachedCollection(['Tags', 'Contributors', 'Profiles'])));
    const availableContributors = useMemo(() => allContributors(docContributors, profiles), [docContributors, profiles]);
    const [availableTags, setAvailableTags] = useState(() => tagsOf(cachedDoc(['Tags', 'Tags'])));
    const [selectedContributor, setSelectedContributor] = useState<Contributor | null>(null);
    const [showContributorModal, setShowContributorModal] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');
    const [debouncedSearch, setDebouncedSearch] = useState('');
    const [selectedTags, setSelectedTags] = useState<string[]>([]);

    // Debounce search input - waits 250ms after user stops typing before filtering
    useEffect(() => {
        const timer = setTimeout(() => setDebouncedSearch(searchQuery), 250);
        return () => clearTimeout(timer);
    }, [searchQuery]);

    const [rawProjects, setRawProjects] = useState<FirestoreProject[]>(() => (cachedCollection(['Projects']) ?? []) as FirestoreProject[]);

    useEffect(() => {
        const stops = [
            watchDoc(['Tags', 'Contributors'], (doc) => { if (doc) setDocContributors(contributorsOf(doc)); }),
            watchCollection(['Tags', 'Contributors', 'Profiles'], (docs) => setProfiles(profilesOf(docs))),
            watchDoc(['Tags', 'Tags'], (doc) => { if (doc) setAvailableTags(tagsOf(doc)); }),
            watchCollection(['Projects'], (docs) => setRawProjects(docs as FirestoreProject[])),
        ];
        return () => stops.forEach(stop => stop());
    }, []);

    const projectsData = useMemo(
        () => rawProjects.map(data => shapeProject(data, availableContributors, availableTags)),
        [rawProjects, availableContributors, availableTags]
    );

    // The same page addresses the build gave each project (projectPages).
    const slugs = useMemo(() => projectSlugs(rawProjects.map(p => p.id)), [rawProjects]);

    const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
    const selectedProject = useMemo(() =>
        projectsData.find(p => p.id === selectedProjectId) || null,
        [projectsData, selectedProjectId]
    );

    // A share link can ask for particular projects to lead the grid.
    const { Pinned } = useTailor();

    const filteredProjects = useMemo(
        () => filterProjects(projectsData, { tags: selectedTags, query: debouncedSearch, pinned: Pinned }),
        [debouncedSearch, projectsData, selectedTags, Pinned]
    );

    // A tag that would leave the grid empty can't be picked.
    const deadTags = useMemo(() => deadTagsOf(availableTags, projectsData, selectedTags), [availableTags, projectsData, selectedTags]);

    useEffect(() => {
        if (!active) return;
        const ink = handwrite(handwritingRef.current, { show: true });
        const all = [enter(titleRef.current, { x: -30 }, { duration: 800, delay: 150 })];
        return () => { ink.forEach(a => a.cancel()); all.forEach(a => a?.stop()); };
    }, [active]);

    useEffect(() => {
        if (selectedProjectId || showContributorModal) {
            const scrollbarWidth = window.innerWidth - document.documentElement.clientWidth;
            document.body.style.overflow = 'hidden';
            document.body.style.paddingRight = `${scrollbarWidth}px`;
        } else {
            document.body.style.overflow = 'unset';
            document.body.style.paddingRight = '0px';
        }
        return () => {
            document.body.style.overflow = 'unset';
            document.body.style.paddingRight = '0px';
        };
    }, [selectedProjectId, showContributorModal]);

    return (
        <div className="min-h-screen bg-primary transition-colors duration-300 pt-32 pb-48">
            <div className="page-padding">
                {/* Header */}
                <div style={{ marginBottom: 32 }}>
                    <div
                        ref={handwritingRef}
                        className="text-5xl opacity-0 ml-2.5"
                        aria-hidden="true"
                        data-write
                        style={{
                            fontFamily: "var(--font-caveat), cursive",
                            color: 'var(--accent)',
                            marginBottom: -20
                        }}
                    >
                        <Chars text="Selected" />
                    </div>
                    <h2
                        ref={titleRef}
                        className="text-5xl md:text-7xl lg:text-8xl font-black text-primary opacity-0 transition-colors duration-300 font-inter"
                        style={{ margin: 0 }}
                    >
                        Projects
                    </h2>
                </div>

                <ProjectFilters
                    query={searchQuery}
                    onQuery={setSearchQuery}
                    tags={availableTags}
                    picked={selectedTags}
                    onPick={setSelectedTags}
                    dead={deadTags}
                    shown={filteredProjects.length}
                    total={projectsData.length}
                />

                {/* Projects Grid */}
                <Reflow
                    className="grid grid-cols-[repeat(auto-fill,minmax(300px,1fr))] gap-6"
                    items={filteredProjects}
                    keyOf={project => String(project.id)}
                    render={project => (
                        <ProjectCard
                            project={project}
                            href={`/projects/${slugs.get(String(project.id)) ?? ''}`}
                            active={active}
                            onOpen={() => {
                                window.dispatchEvent(new CustomEvent('revil:project_open', { detail: { id: project.id } }));
                                setSelectedProjectId(String(project.id));
                            }}
                        />
                    )}
                />

                {/* Modals */}
                <AnimatePresence>
                    {selectedProject && (
                        <MProjectView
                            project={selectedProject}
                            onClose={() => {
                                window.dispatchEvent(new CustomEvent('revil:project_close'));
                                setSelectedProjectId(null);
                            }}
                            onContributorClick={(contributor: ContributorData) => {
                                setSelectedContributor(contributor as Contributor);
                                setShowContributorModal(true);
                            }}
                        />
                    )}
                </AnimatePresence>
            </div>

            {showContributorModal && selectedContributor && (
                <MContributorView
                    contributor={selectedContributor}
                    onClose={() => setShowContributorModal(false)}
                />
            )}
        </div>
    );
};

export default Projects;
