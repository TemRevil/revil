import { useEffect, useRef, useState, useMemo } from 'react';
import { motion, AnimatePresence, LayoutGroup } from 'framer-motion';
import anime from 'animejs';
import { X, Search } from 'lucide-react';
import { db } from '../lib/firebase';
import { collection, onSnapshot, doc } from 'firebase/firestore';

// Import SVG icons

import MProjectView, { getStackIcon, getTechColor, Project } from './M-ProjectView';
import MContributorView, { Contributor } from './M-ContributorView';


// Static data removed in favor of Firestore fetching

const ProjectCard = ({ project, index, onClick }: { project: Project; index: number; onClick: () => void }) => {
    const cardRef = useRef<HTMLDivElement>(null);
    const [currentImageIndex, setCurrentImageIndex] = useState(0);
    const [isHovered, setIsHovered] = useState(false);
    const [showContributors, setShowContributors] = useState(false);

    // Slideshow logic (Card Hover)
    useEffect(() => {
        // eslint-disable-next-line no-undef
        let interval: ReturnType<typeof setInterval> | undefined;
        if (isHovered && project.images.length > 1) {
            interval = setInterval(() => {
                setCurrentImageIndex((prev) => (prev + 1) % project.images.length);
            }, 2000);
        } else {
            setCurrentImageIndex(0);
        }
        return () => clearInterval(interval);
    }, [isHovered, project.images.length]);

    // Cycle between Stack and Contributors
    useEffect(() => {
        const interval = setInterval(() => {
            setShowContributors(prev => !prev);
        }, 3000);
        return () => clearInterval(interval);
    }, []);

    // Entrance animation
    useEffect(() => {
        anime({
            targets: cardRef.current,
            opacity: [0, 1],
            translateY: [50, 0],
            duration: 500,
            delay: index * 50,
            easing: 'easeOutQuad'
        });
    }, [index]);



    return (
        <motion.div
            layoutId={`project-card-${project.id}`}
            onMouseEnter={() => setIsHovered(true)}
            onMouseLeave={() => setIsHovered(false)}
            onClick={onClick}
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: isHovered ? -8 : 0 }}
            transition={{
                opacity: { duration: 0.3, delay: index * 0.03 },
                y: { duration: 0.2 },
                layout: { duration: 0.4, type: "tween", ease: "easeOut" }
            }}
            className="group flex flex-col h-full"
            style={{
                cursor: 'pointer',
                backgroundColor: 'var(--card-bg)',
                backdropFilter: 'blur(16px)',
                WebkitBackdropFilter: 'blur(16px)',
                borderRadius: '20px',
                overflow: 'hidden',
                border: '1px solid var(--navbar-border)',
                boxShadow: isHovered ? 'var(--card-shadow-hover)' : 'var(--card-shadow)',
                willChange: 'transform, opacity',
            }}
        >
            <motion.div
                layoutId={`project-image-${project.id}`}
                transition={{ duration: 0.4, type: "tween", ease: "easeOut" }}
                style={{
                    position: 'relative',
                    height: '200px',
                    overflow: 'hidden',
                    borderRadius: '20px 20px 0 0',
                    willChange: 'transform'
                }}
            >
                <div style={{
                    display: 'flex',
                    height: '100%',
                    width: `${project.images.length * 100}%`,
                    transform: `translateX(-${(currentImageIndex * 100) / project.images.length}%)`,
                    transition: 'transform 0.5s ease-in-out'
                }}>
                    {project.images.map((img, i) => (
                        <div key={i} style={{ width: `${100 / project.images.length}%`, height: '100%', position: 'relative', overflow: 'hidden' }}>
                            <img
                                src={img}
                                alt={project.title}
                                style={{
                                    width: '100%',
                                    height: '100%',
                                    objectFit: 'cover',
                                    transition: 'transform 0.5s ease',
                                    transform: isHovered ? 'scale(1.05)' : 'scale(1)'
                                }}
                            />
                            {/* Gradient Overlay for text readability (optional, but good for aesthetics) */}
                            <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent opacity-60"></div>
                        </div>
                    ))}
                </div>
            </motion.div>

            <div style={{ padding: '24px', flex: 1, display: 'flex', flexDirection: 'column' }}>
                <h3 className="font-inter font-extrabold text-2xl mb-2.5 text-[var(--text-primary)]">
                    {project.title}
                </h3>
                <p
                    className="font-inter text-base text-[var(--text-secondary)] leading-relaxed flex-1"
                    style={{
                        display: '-webkit-box',
                        WebkitLineClamp: 3,
                        WebkitBoxOrient: 'vertical',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis'
                    }}
                >
                    {project.description}
                </p>
            </div>
        </motion.div>
    );
};



const Projects = () => {
    const titleRef = useRef<HTMLHeadingElement>(null);
    const handwritingRef = useRef<HTMLDivElement>(null);
    const [availableContributors, setAvailableContributors] = useState<any[]>([]);
    const [availableTags, setAvailableTags] = useState<any[]>([]);
    const [projectsData, setProjectsData] = useState<Project[]>([]);
    const [selectedProject, setSelectedProject] = useState<Project | null>(null);
    const [showProjectModal, setShowProjectModal] = useState(false);
    const [selectedContributor, setSelectedContributor] = useState<Contributor | null>(null);
    const [showContributorModal, setShowContributorModal] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');

    // Fetch contributors from Firestore (Global Team List)
    useEffect(() => {
        // Option 1: Map inside document
        const unsubDoc = onSnapshot(doc(db, 'Tags', 'Contributors'), (docSnap) => {
            if (docSnap.exists()) {
                const data = docSnap.data();
                const loaded = Object.entries(data)
                    .filter(([_, val]) => val && typeof val === 'object' && (val as any).Name)
                    .map(([id, val]: [string, any]) => ({
                        id,
                        name: val.Name,
                        role: val.Role,
                        image: val.Image,
                        links: val["Social Accounts"] || {}
                    }));
                setAvailableContributors(prev => {
                    const filtered = prev.filter(p => !loaded.some(l => l.id === p.id));
                    return [...filtered, ...loaded];
                });
            }
        });

        // Option 2: Individual documents in subcollection
        const unsubCol = onSnapshot(collection(db, 'Tags', 'Contributors', 'Profiles'), (snapshot) => {
            const loaded = snapshot.docs.map(d => {
                const val = d.data();
                return {
                    id: d.id,
                    name: val.Name || val.name,
                    role: val.Role || val.role,
                    image: val.Image || val.image,
                    links: val["Social Accounts"] || val.links || val.socials || {}
                };
            });
            setAvailableContributors(prev => {
                const filtered = prev.filter(p => !loaded.some(l => l.id === p.id));
                return [...filtered, ...loaded];
            });
        });

        // Fetch Global Tags for Icons/Colors
        const unsubTags = onSnapshot(doc(db, 'Tags', 'Tags'), (docSnap) => {
            if (docSnap.exists()) {
                const data = docSnap.data();
                const loaded = Object.entries(data).map(([id, val]: [string, any]) => ({
                    id,
                    name: val.Name || 'Untitled',
                    color: val.Color || '#60a5fa',
                    iconSvg: val.Icon || ''
                }));
                setAvailableTags(loaded);
            }
        });

        return () => {
            unsubDoc();
            unsubCol();
            unsubTags();
        };
    }, []);

    const [rawProjects, setRawProjects] = useState<any[]>([]);

    // Fetch projects from Firestore
    useEffect(() => {
        const unsub = onSnapshot(collection(db, 'Projects'), (snapshot) => {
            setRawProjects(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
        });
        return () => unsub();
    }, []);

    // Resolve projects with contributor details and metrics
    useEffect(() => {
        const loaded = rawProjects.map(data => {
            const v = data.Views || {};

            const projectContributors = data.Contributors ? Object.values(data.Contributors).map((c: any) => {
                const name = c["Contributor Name"] || '';
                const projectRole = c["Role at Project"];

                // Optimized matching: Trim, Lowercase, and check for exact match
                const fullContrib = availableContributors.find(cont => {
                    const cName = (cont.name || '').trim().toLowerCase();
                    const pName = name.trim().toLowerCase();
                    return cName === pName && cName !== '';
                });

                return {
                    name,
                    role: projectRole || (fullContrib ? (fullContrib.role || fullContrib.jobTitle || 'Contributor') : 'Contributor'),
                    jobTitle: fullContrib ? (fullContrib.role || fullContrib.jobTitle || 'Contributor') : 'Contributor',
                    image: fullContrib?.image || '',
                    links: fullContrib?.links || {}
                };
            }) : [];

            const resolveTag = (t: any) => {
                const name = typeof t === 'string' ? t : (t.name || t.Name || 'Unix');
                // Try to find in global tags
                const globalTag = availableTags.find(gt => gt.name.toLowerCase() === name.toLowerCase());

                return {
                    name,
                    color: (typeof t === 'object' && (t.color || t.Color)) ? (t.color || t.Color) : (globalTag?.color || getTechColor(name)),
                    iconSvg: (typeof t === 'object' && (t.iconSvg || t.Icon)) ? (t.iconSvg || t.Icon) : (globalTag?.iconSvg || getStackIcon(name) || '')
                };
            };

            const rawStack = data.Stack || [];
            const normalizedStack = (Array.isArray(rawStack) ? rawStack : Object.values(rawStack))
                .map(resolveTag)
                .filter(t => t.name !== 'Unix');

            const rawTags = data.Tags ? Object.values(data.Tags) : [];
            const normalizedTags = rawTags
                .map(resolveTag)
                .filter(t => t.name !== 'Unix');

            const displayTags = normalizedStack.length > 0 ? normalizedStack : normalizedTags;

            return {
                id: data.id,
                title: data.Title || data.id,
                name: data.id,
                description: data.Description || '',
                fullDescription: data.Description || '',
                images: data["Project Images"] || [],
                stack: normalizedStack.map((t: any) => t.name),
                tags: displayTags,
                repoLink: data["Repository Link"],
                liveLink: data["Live Link"],
                downloadLink: data["Download Link"] || '',
                views: Number(v.Project || 0) || 0,
                githubViews: Number(v.Github || 0) || 0,
                liveViews: Number(v.Live || 0) || 0,
                downloadViews: Number(v.Download || 0) || 0,
                contributors: projectContributors
            } as Project;
        });
        setProjectsData(loaded);

        // Keep selected project in sync with latest resolved data
        if (selectedProject) {
            const updated = loaded.find(p => p.id === selectedProject.id);
            if (updated) setSelectedProject(updated);
        }
    }, [rawProjects, availableContributors, availableTags]);

    // Levenshtein distance for fuzzy search
    const getLevenshteinDistance = (a: string, b: string) => {
        if (a.length === 0) return b.length;
        if (b.length === 0) return a.length;
        const matrix = [];
        for (let i = 0; i <= b.length; i++) matrix[i] = [i];
        for (let j = 0; j <= a.length; j++) matrix[0][j] = j;
        for (let i = 1; i <= b.length; i++) {
            for (let j = 1; j <= a.length; j++) {
                if (b.charAt(i - 1) === a.charAt(j - 1)) {
                    matrix[i][j] = matrix[i - 1][j - 1];
                } else {
                    matrix[i][j] = Math.min(
                        matrix[i - 1][j - 1] + 1,
                        Math.min(matrix[i][j - 1] + 1, matrix[i - 1][j] + 1)
                    );
                }
            }
        }
        return matrix[b.length][a.length];
    };

    const filteredProjects = useMemo(() => {
        if (searchQuery.length < 2) return projectsData;

        const query = searchQuery.toLowerCase();

        const scored = projectsData.map(project => {
            let minDistance = Infinity;
            // Check helper
            const checkTerm = (term: string) => {
                const lower = term.toLowerCase();
                if (lower.includes(query)) return 0;
                // Check words for fuzzy match
                const words = lower.split(/[\s-_]+/);
                let d = Infinity;
                words.forEach(w => {
                    d = Math.min(d, getLevenshteinDistance(query, w));
                });
                return d;
            };

            // Calculate min distance across all fields
            // Title
            minDistance = Math.min(minDistance, checkTerm(project.title || ''));
            // Tags
            (project.tags || []).forEach(tag => {
                minDistance = Math.min(minDistance, checkTerm(typeof tag === 'string' ? tag : tag.name));
            });
            // Stack (Technologies)
            (project.stack || []).forEach(tech => {
                minDistance = Math.min(minDistance, checkTerm(tech));
            });
            // Contributors
            project.contributors.forEach(c => {
                minDistance = Math.min(minDistance, checkTerm(c.name));
            });

            return { project, minDistance };
        });

        // Filter: Allow partial matches (0 distance) or close fuzzy matches (distance <= 2)
        // Sort: Closest matches first
        return scored
            .filter(item => item.minDistance <= 2)
            .sort((a, b) => a.minDistance - b.minDistance)
            .map(item => item.project);
    }, [searchQuery, projectsData]);

    useEffect(() => {
        // Animate handwriting text
        anime({
            targets: handwritingRef.current,
            opacity: [0, 1],
            translateX: [-30, 0],
            duration: 800,
            easing: 'easeOutQuad'
        });

        // Animate title
        anime({
            targets: titleRef.current,
            opacity: [0, 1],
            translateX: [-50, 0],
            duration: 1000,
            delay: 200,
            easing: 'easeOutQuad'
        });
    }, []);

    // Prevent body scrolling when modals are open
    // Prevent body scrolling when modals are open and handle scrollbar compensation
    useEffect(() => {
        if (showProjectModal || showContributorModal) {
            const scrollbarWidth = window.innerWidth - document.documentElement.clientWidth;
            document.body.style.overflow = 'hidden';
            document.body.style.paddingRight = `${scrollbarWidth}px`;
        } else {
            document.body.style.overflow = 'unset';
            document.body.style.paddingRight = '0px';
        }

        // Cleanup on unmount
        return () => {
            document.body.style.overflow = 'unset';
            document.body.style.paddingRight = '0px';
        };
    }, [showProjectModal, showContributorModal]);

    return (
        <div style={{
            minHeight: '100vh',
            backgroundColor: 'var(--bg-primary)',
            transition: 'background-color 0.3s ease'
        }} className="pt-32 pb-20">
            <div className="page-padding">
                {/* Header */}
                <div style={{ marginBottom: '60px', paddingLeft: '0' }}>
                    <div
                        ref={handwritingRef}
                        style={{
                            fontFamily: "'Rock Salt', cursive",
                            fontSize: '2rem',
                            color: 'rgb(59, 130, 246)', // Blue accent
                            marginBottom: '-15px',
                            marginLeft: '10px',
                            opacity: 0
                        }}
                    >
                        Selected
                    </div>
                    <h1
                        ref={titleRef}
                        className="text-5xl md:text-7xl lg:text-8xl"
                        style={{
                            fontFamily: "'Inter', sans-serif",
                            fontWeight: 900,
                            color: 'var(--text-primary)',
                            margin: 0,
                            opacity: 0,
                            transition: 'color 0.3s ease'
                        }}
                    >
                        Projects
                    </h1>
                </div>

                {/* Search Bar */}
                <div style={{ marginBottom: '40px', maxWidth: '600px' }}>
                    <div style={{
                        display: 'flex',
                        alignItems: 'center',
                        backgroundColor: 'var(--card-bg)',
                        backdropFilter: 'blur(12px)',
                        WebkitBackdropFilter: 'blur(12px)',
                        borderRadius: '16px',
                        padding: '12px 20px',
                        border: '1px solid var(--navbar-border)',
                        boxShadow: 'var(--card-shadow)',
                        transition: 'box-shadow 0.3s ease'
                    }}
                        onFocus={() => {
                            // optional focus styles if needed via state or pure css
                        }}
                    >
                        <Search size={20} style={{ color: 'var(--text-secondary)', marginRight: '12px' }} />
                        <input
                            type="text"
                            placeholder="Search projects by title, tags, or contributor..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            style={{
                                border: 'none',
                                background: 'transparent',
                                color: 'var(--text-primary)',
                                fontSize: '1rem',
                                width: '100%',
                                outline: 'none',
                                fontFamily: "'Inter', sans-serif"
                            }}
                        />
                        {searchQuery && (
                            <button
                                onClick={() => setSearchQuery('')}
                                style={{
                                    background: 'none',
                                    border: 'none',
                                    color: 'var(--text-secondary)',
                                    cursor: 'pointer',
                                    display: 'flex',
                                    alignItems: 'center'
                                }}
                            >
                                <X size={16} />
                            </button>
                        )}
                    </div>
                </div>

                {/* Projects Grid */}
                <div style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))',
                    gap: '40px'
                }}>
                    {filteredProjects.map((project, index) => (
                        <ProjectCard
                            key={project.id}
                            project={project}
                            index={index}
                            onClick={() => {
                                setSelectedProject(project);
                                setShowProjectModal(true);
                            }}
                        />
                    ))}
                </div>
            </div>

            <LayoutGroup>
                {/* Modals */}
                <AnimatePresence>
                    {showProjectModal && selectedProject && (
                        <MProjectView
                            project={selectedProject}
                            onClose={() => setShowProjectModal(false)}
                            onContributorClick={(contributor: Contributor) => {
                                setSelectedContributor(contributor);
                                setShowContributorModal(true);
                            }}
                        />
                    )}
                </AnimatePresence>
            </LayoutGroup>
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
