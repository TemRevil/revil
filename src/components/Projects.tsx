import { useEffect, useRef, useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import anime from 'animejs';
import { X, Search } from 'lucide-react';
import { db } from '../lib/firebase';
import { collection, onSnapshot, doc } from 'firebase/firestore';

import MProjectView from './M-ProjectView';
import MContributorView, { Contributor } from './M-ContributorView';
import { ProjectData as Project, TagData as Tag, ContributorData } from '../types';
import { getStackIcon, getTechColor, isVideoFile } from '../utils/projectUtils';

interface RawContributorData {
    Name?: string;
    Role?: string;
    Image?: string;
    "Social Accounts"?: Record<string, string>;
}

interface RawTagData {
    Name?: string;
    Color?: string;
    Icon?: string;
}

interface ProjectContributorData {
    "Contributor Name"?: string;
    "Role at Project"?: string;
}

interface FirestoreProject {
    id: string;
    Title?: string;
    Description?: string;
    "Project Images"?: string[];
    Stack?: (string | RawTagData)[] | Record<string, string | RawTagData>;
    Tags?: Record<string, string | RawTagData>;
    Contributors?: Record<string, ProjectContributorData>;
    "Repository Link"?: string;
    "Live Link"?: string;
    "Download Link"?: string;
    Views?: {
        Project?: number;
        Github?: number;
        Live?: number;
        Download?: number;
    };
    Listing?: number | string;
    listing?: number | string;
}

const CardVideo = ({ src, isActive }: { src: string; isActive: boolean }) => {
    const videoRef = useRef<HTMLVideoElement>(null);

    useEffect(() => {
        const video = videoRef.current;
        if (!video) return;

        if (isActive) {
            // Jump to random time when becoming active to show "random frames"
            if (video.duration) {
                video.currentTime = Math.random() * video.duration;
            }
            video.play().catch(() => { });
        } else {
            video.pause();
        }
    }, [isActive]);

    // YouTube-style "pick a random starting point" 
    useEffect(() => {
        const video = videoRef.current;
        if (!video) return;

        const setRandomTime = () => {
            if (video.duration) {
                video.currentTime = Math.random() * video.duration;
            }
        };

        if (video.readyState >= 1) {
            setRandomTime();
        } else {
            video.addEventListener('loadedmetadata', setRandomTime);
            return () => video.removeEventListener('loadedmetadata', setRandomTime);
        }
    }, []);

    return (
        <video
            ref={videoRef}
            src={src}
            muted
            loop
            playsInline
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
        />
    );
};

const shimmerKeyframes = `
@keyframes shimmer-fast {
    0% { transform: translateX(-150%) skewX(-20deg); }
    100% { transform: translateX(150%) skewX(-20deg); }
}
`;

const CardImage = ({ src, alt }: { src: string; alt: string }) => {
    const [isImageLoaded, setIsImageLoaded] = useState(false);
    return (
        <>
            <style>{shimmerKeyframes}</style>
            {/* Skeleton Loader Container */}
            <div 
                className={`absolute inset-0 z-10 bg-white/5 overflow-hidden transition-opacity duration-1000 ease-out ${isImageLoaded ? 'opacity-0 pointer-events-none' : 'opacity-100'}`}
            >
                {/* Moving Light effect - only rendered when loading to stop the animation when complete */}
                {!isImageLoaded && (
                    <div 
                        className="absolute inset-0 w-full h-full bg-gradient-to-r from-transparent via-white/20 to-transparent"
                        style={{ animation: 'shimmer-fast 1.2s infinite ease-in-out' }}
                    />
                )}
            </div>
            <img
                src={src}
                alt={alt}
                onLoad={() => setIsImageLoaded(true)}
                className={`w-full h-full object-cover group-hover:scale-105 transition-all duration-[1500ms] ease-out ${!isImageLoaded ? 'scale-105' : ''}`}
                style={{
                    filter: isImageLoaded ? 'blur(0px)' : 'blur(20px)',
                    opacity: isImageLoaded ? 1 : 0
                }}
            />
        </>
    );
};

const ProjectCard = ({ project, index, onClick }: { project: Project; index: number; onClick: () => void }) => {
    const cardRef = useRef<HTMLDivElement>(null);
    const [currentImageIndex, setCurrentImageIndex] = useState(0);
    const [isHovered, setIsHovered] = useState(false);
    const [showContributors, setShowContributors] = useState(false);

    // Slideshow logic (Card Hover)
    useEffect(() => {
        let interval: ReturnType<typeof setInterval> | undefined;
        if (isHovered && project.images.length > 1) {
            interval = setInterval(() => {
                setCurrentImageIndex((prev) => (prev + 1) % project.images.length);
            }, 2000);
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
            onMouseEnter={() => setIsHovered(true)}
            onMouseLeave={() => {
                setIsHovered(false);
                setCurrentImageIndex(0);
            }}
            onClick={onClick}
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: isHovered ? -8 : 0 }}
            transition={{
                opacity: { duration: 0.3, delay: index * 0.03 },
                y: { duration: 0.2 },
                layout: { duration: 0.4, type: "tween", ease: "easeOut" }
            }}
            className={`
                group flex flex-col h-full glass-panel cursor-pointer overflow-hidden
                border border-[var(--navbar-border)] transition-shadow duration-300
                ${isHovered ? 'shadow-xl' : 'shadow-md'}
            `}
            style={{ willChange: 'transform, opacity' }}
        >
            <div className="relative h-[200px] overflow-hidden rounded-t-[20px] will-change-transform">
                {/* Slideshow Overlay */}
                <div
                    className="absolute inset-0"
                    style={{ pointerEvents: 'none' }}
                >
                    <div
                        className="flex h-full transition-transform duration-500 ease-in-out"
                        style={{
                            width: `${project.images.length * 100}%`,
                            transform: `translateX(-${(currentImageIndex * 100) / project.images.length}%)`,
                        }}
                    >
                        {project.images.map((img, i) => {
                            const isVideo = isVideoFile(img);
                            return (
                                <div key={i} style={{ width: `${100 / project.images.length}%` }} className="h-full relative overflow-hidden">
                                    {isVideo ? (
                                        <CardVideo src={img} isActive={isHovered && currentImageIndex === i} />
                                    ) : (
                                        <CardImage src={img} alt={project.title || 'Project'} />
                                    )}
                                    <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent opacity-60"></div>
                                </div>
                            );
                        })}
                    </div>
                </div>

                {/* Overlays: Tags / Contributors Slideshow */}
                <div className="absolute top-4 left-4 z-10">
                    <AnimatePresence mode="wait">
                        {!showContributors ? (
                            <motion.div
                                key="tags"
                                initial={{ opacity: 0, y: -10 }}
                                animate={{ opacity: 1, y: 0 }}
                                exit={{ opacity: 0, y: 10 }}
                                transition={{ duration: 0.3 }}
                                className="flex gap-1.5 flex-wrap"
                            >
                                {(project.tags || []).slice(0, 2).map((tag: Tag, i) => (
                                    <div
                                        key={i}
                                        className="px-2.5 py-1 rounded-full bg-white/40 backdrop-blur-md text-xs font-semibold text-gray-800 shadow-sm flex items-center gap-1"
                                    >
                                        <div className="w-1.5 h-1.5 rounded-full" style={{ background: tag.color || '#3b82f6' }} />
                                        {tag.name}
                                    </div>
                                ))}
                                {(project.tags || []).length > 2 && (
                                    <div className="px-2.5 py-1 rounded-full bg-black/40 backdrop-blur-md text-xs font-semibold text-white shadow-sm">
                                        +{(project.tags || []).length - 2} More
                                    </div>
                                )}
                            </motion.div>
                        ) : (
                            <motion.div
                                key="contributors"
                                initial={{ opacity: 0, y: -10 }}
                                animate={{ opacity: 1, y: 0 }}
                                exit={{ opacity: 0, y: 10 }}
                                transition={{ duration: 0.3 }}
                                className="flex items-center"
                            >
                                <div className="flex pl-1">
                                    {(project.contributors || []).slice(0, 3).map((c, i) => (
                                        <div
                                            key={i}
                                            className="w-8 h-8 rounded-full border-2 border-white -ml-2 overflow-hidden bg-gray-100 shadow-sm"
                                            title={c.name}
                                        >
                                            {c.image && typeof c.image === 'string' ? (
                                                <img src={c.image} alt={c.name} className="w-full h-full object-cover" />
                                            ) : (
                                                <div className="w-full h-full flex items-center justify-center bg-gray-200 text-gray-500 text-[10px] font-bold">
                                                    {c.name ? c.name.charAt(0) : '?'}
                                                </div>
                                            )}
                                        </div>
                                    ))}
                                    {(project.contributors || []).length > 3 && (
                                        <div className="w-8 h-8 rounded-full border-2 border-white -ml-2 bg-blue-500 text-white flex items-center justify-center text-[0.7rem] font-bold shadow-sm">
                                            +{(project.contributors || []).length - 3}
                                        </div>
                                    )}
                                </div>
                            </motion.div>
                        )}
                    </AnimatePresence>
                </div>
            </div>

            <div className="p-6 flex flex-col flex-1">
                <h3 className="heading-md mb-2.5 text-primary">
                    {project.title}
                </h3>
                <p
                    className="text-body text-sec leading-relaxed flex-1 overflow-hidden"
                    style={{
                        display: '-webkit-box',
                        WebkitLineClamp: 3,
                        WebkitBoxOrient: 'vertical',
                        textOverflow: 'ellipsis'
                    }}
                >
                    {project.description}
                </p>
            </div>
        </motion.div >
    );
};

const Projects = () => {
    const titleRef = useRef<HTMLHeadingElement>(null);
    const handwritingRef = useRef<HTMLDivElement>(null);
    const [availableContributors, setAvailableContributors] = useState<Contributor[]>([]);
    const [availableTags, setAvailableTags] = useState<Tag[]>([]);
    const [selectedContributor, setSelectedContributor] = useState<Contributor | null>(null);
    const [showContributorModal, setShowContributorModal] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');
    const [selectedTags, setSelectedTags] = useState<string[]>([]);
    const [windowWidth, setWindowWidth] = useState(typeof window !== 'undefined' ? window.innerWidth : 1200);

    useEffect(() => {
        const handleResize = () => setWindowWidth(window.innerWidth);
        window.addEventListener('resize', handleResize);
        return () => window.removeEventListener('resize', handleResize);
    }, []);

    // Fetch Data
    useEffect(() => {
        // Contributors
        const unsubDoc = onSnapshot(doc(db, 'Tags', 'Contributors'), (docSnap) => {
            if (docSnap.exists()) {
                const data = docSnap.data();
                const loaded = Object.entries(data)
                    .filter(([, val]) => val && typeof val === 'object' && (val as RawContributorData).Name)
                    .map(([id, val]: [string, RawContributorData]): Contributor => ({
                        id,
                        name: val.Name || '',
                        role: val.Role || '',
                        jobTitle: val.Role || '',
                        image: val.Image || '',
                        links: val["Social Accounts"] || {}
                    }));
                setAvailableContributors(prev => {
                    const filtered = prev.filter(p => !loaded.some(l => l.id === p.id));
                    return [...filtered, ...loaded];
                });
            }
        });

        const unsubCol = onSnapshot(collection(db, 'Tags', 'Contributors', 'Profiles'), (snapshot) => {
            const loaded = snapshot.docs.map(d => {
                const val = d.data();
                return {
                    id: d.id,
                    name: val.Name || val.name || '',
                    role: val.Role || val.role || '',
                    jobTitle: val.Role || val.role || '',
                    image: val.Image || val.image || '',
                    links: val["Social Accounts"] || val.links || val.socials || {}
                } as Contributor;
            });
            setAvailableContributors(prev => {
                const filtered = prev.filter(p => !loaded.some(l => l.id === p.id));
                return [...filtered, ...loaded];
            });
        });

        // Tags
        const unsubTags = onSnapshot(doc(db, 'Tags', 'Tags'), (docSnap) => {
            if (docSnap.exists()) {
                const data = docSnap.data();
                const loaded = Object.entries(data).map(([id, val]: [string, RawTagData]): Tag => ({
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

    const [rawProjects, setRawProjects] = useState<FirestoreProject[]>([]);

    useEffect(() => {
        const unsub = onSnapshot(collection(db, 'Projects'), (snapshot) => {
            setRawProjects(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
        });
        return () => unsub();
    }, []);

    // Memoize projects data to avoid infinite loops and unnecessary re-calculations
    const projectsData = useMemo(() => {
        return rawProjects.map(data => {
            const v = data.Views || {};

            const projectContributors = data.Contributors ? Object.values(data.Contributors).map((c: ProjectContributorData): Contributor => {
                const name = c["Contributor Name"] || '';
                const projectRole = c["Role at Project"];

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
                } as Contributor;
            }) : [];

            const resolveTag = (t: string | RawTagData) => {
                const name = typeof t === 'string' ? t : (t.Name || 'Unix');
                const globalTag = availableTags.find(gt => gt.name.toLowerCase() === name.toLowerCase());

                return {
                    name,
                    color: (typeof t === 'object' && t.Color) ? t.Color : (globalTag?.color || getTechColor(name)),
                    iconSvg: (typeof t === 'object' && t.Icon) ? t.Icon : (globalTag?.iconSvg || getStackIcon(name) || '')
                };
            };

            const rawStack = data.Stack || [];
            const normalizedStack = (Array.isArray(rawStack) ? rawStack : Object.values(rawStack))
                .map(resolveTag)
                .filter(t => t.name !== 'Unix');

            const rawTags = data.Tags ? Object.values(data.Tags) : [];
            const normalizedTags = rawTags.map(resolveTag).filter(t => t.name !== 'Unix');
            const displayTags = normalizedStack.length > 0 ? normalizedStack : normalizedTags;

            return {
                id: data.id,
                title: data.Title || data.id,
                name: data.id,
                description: data.Description || '',
                fullDescription: data.Description || '',
                images: data["Project Images"] || [],
                stack: normalizedStack.map((t: Tag) => t.name),
                tags: displayTags,
                repoLink: data["Repository Link"] || '',
                liveLink: data["Live Link"] || '',
                downloadLink: data["Download Link"] || '',
                views: Number(v.Project || 0) || 0,
                githubViews: Number(v.Github || 0) || 0,
                liveViews: Number(v.Live || 0) || 0,
                downloadViews: Number(v.Download || 0) || 0,
                contributors: projectContributors,
                listing: Number(data.Listing ?? data.listing ?? 0) || 0
            };
        });
    }, [rawProjects, availableContributors, availableTags]);

    const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
    const selectedProject = useMemo(() =>
        projectsData.find(p => p.id === selectedProjectId) || null,
        [projectsData, selectedProjectId]
    );

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
        let results = projectsData;
        if (selectedTags.length > 0) {
            results = results.filter(project => {
                const projectTags = [
                    ...(project.stack || []).map(s => s.toLowerCase()),
                    ...(project.tags || []).map(t => t.name.toLowerCase())
                ];
                return selectedTags.every(tag => projectTags.includes(tag.toLowerCase()));
            });
        }
        if (searchQuery.length < 2) {
            return [...results].sort((a, b) => {
                const aVal = a.listing && a.listing > 0 ? a.listing : 999999;
                const bVal = b.listing && b.listing > 0 ? b.listing : 999999;
                if (aVal !== bVal) return aVal - bVal;
                return (a.title || '').localeCompare(b.title || '');
            });
        }

        const query = searchQuery.toLowerCase();
        const scored = results.map(project => {
            let minDistance = Infinity;
            const checkTerm = (term: string) => {
                const lower = term.toLowerCase();
                if (lower.includes(query)) return 0;
                const words = lower.split(/[\s-_]+/);
                let d = Infinity;
                words.forEach(w => {
                    d = Math.min(d, getLevenshteinDistance(query, w));
                });
                return d;
            };
            minDistance = Math.min(minDistance, checkTerm(project.title || ''));
            (project.tags || []).forEach(tag => {
                minDistance = Math.min(minDistance, checkTerm(typeof tag === 'string' ? tag : tag.name));
            });
            (project.stack || []).forEach(tech => {
                minDistance = Math.min(minDistance, checkTerm(tech));
            });
            project.contributors.forEach(c => {
                minDistance = Math.min(minDistance, checkTerm(c.name || ''));
            });
            return { project, minDistance };
        });

        return scored
            .filter(item => item.minDistance <= 2)
            .sort((a, b) => a.minDistance - b.minDistance)
            .map(item => item.project);
    }, [searchQuery, projectsData, selectedTags]);

    const toggleTag = (tagName: string) => {
        setSelectedTags(prev =>
            prev.includes(tagName)
                ? prev.filter(t => t !== tagName)
                : [...prev, tagName]
        );
    };

    useEffect(() => {
        anime({
            targets: handwritingRef.current,
            opacity: [0, 1],
            translateX: [-20, 0],
            duration: 600,
            easing: 'easeOutExpo'
        });
        anime({
            targets: titleRef.current,
            opacity: [0, 1],
            translateX: [-30, 0],
            duration: 800,
            delay: 150,
            easing: 'easeOutExpo'
        });
    }, []);

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
        <div className="min-h-screen bg-primary transition-colors duration-300 pt-32 pb-20">
            <div className="page-padding">
                {/* Header - Reduced MB */}
                <div className="mb-8 pl-0">
                    <div
                        ref={handwritingRef}
                        className="text-4xl opacity-0 mb-[-15px] ml-2.5"
                        style={{
                            fontFamily: "'Rock Salt', cursive",
                            color: 'var(--accent)'
                        }}
                    >
                        Selected
                    </div>
                    <h1
                        ref={titleRef}
                        className="text-5xl md:text-7xl lg:text-8xl font-black text-primary m-0 opacity-0 transition-colors duration-300 font-inter"
                    >
                        Projects
                    </h1>
                </div>

                {/* Search Bar - Reduced MB */}
                <div className="mb-6 max-w-[600px]">
                    <div className="glass-surface flex items-center p-3 px-5 border border-[var(--navbar-border)] shadow-md transition-shadow duration-300">
                        <Search size={20} className="text-sec mr-3" />
                        <input
                            type="text"
                            placeholder="Search projects by title, tags, or contributor..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="border-none bg-transparent text-primary text-base w-full outline-none font-inter"
                        />
                        {searchQuery && (
                            <button
                                onClick={() => setSearchQuery('')}
                                className="bg-none border-none text-sec cursor-pointer flex items-center"
                            >
                                <X size={16} />
                            </button>
                        )}
                    </div>
                </div>

                {/* Filter Tags - Reduced MB */}
                <div className={`mb-8 flex flex-wrap items-center ${windowWidth < 460 ? 'gap-2' : 'gap-2.5'}`}>
                    <span className="text-xs font-black text-sec mr-2.5 uppercase tracking-widest opacity-60">
                        Filter View:
                    </span>

                    {/* Tags Container */}
                    <div className="flex flex-wrap gap-2 items-center">
                        {availableTags.map(tag => {
                            const isActive = selectedTags.includes(tag.name);
                            const isUrl = tag.iconSvg && (tag.iconSvg.startsWith('http') || tag.iconSvg.includes('/o/'));

                            return (
                                <button
                                    key={tag.id}
                                    onClick={() => toggleTag(tag.name)}
                                    className={`
                                        flex items-center gap-2 rounded-xl border font-bold cursor-pointer transition-all duration-300
                                        backdrop-blur-xl shadow-sm whitespace-nowrap
                                        ${windowWidth < 460 ? 'px-3 py-1.5 text-xs' : 'px-4 py-2 text-sm'}
                                        ${isActive
                                            ? 'border-accent bg-[rgba(59,130,246,0.12)] text-accent scale-105 z-10 shadow-[0_8px_16px_-4px_rgba(59,130,246,0.25)]'
                                            : 'border-[var(--navbar-border)] bg-[var(--card-bg)] text-sec'}
                                    `}
                                >
                                    {tag.iconSvg && (
                                        isUrl ? (
                                            <img
                                                src={tag.iconSvg}
                                                alt={tag.name}
                                                className={`w-8 h-8 object-contain ${isActive ? '' : 'grayscale opacity-60'}`}
                                            />
                                        ) : (
                                            <div
                                                dangerouslySetInnerHTML={{ __html: tag.iconSvg }}
                                                className="w-8 h-8 fill-current"
                                                style={{ opacity: isActive ? 1 : 0.6 }}
                                            />
                                        )
                                    )}
                                    {tag.name}
                                </button>
                            );
                        })}

                        {selectedTags.length > 0 && (
                            <button
                                onClick={() => setSelectedTags([])}
                                className="px-3 py-2 bg-transparent border-none text-accent text-xs font-black cursor-pointer transition-all duration-200 uppercase tracking-widest ml-1 hover:opacity-70"
                            >
                                [ Reset ]
                            </button>
                        )}
                    </div>
                </div>

                {/* Projects Grid */}
                <div className="grid grid-cols-[repeat(auto-fill,minmax(300px,1fr))] gap-6">
                    {filteredProjects.map((project, index) => (
                        <ProjectCard
                            key={project.id}
                            project={project}
                            index={index}
                            onClick={() => {
                                window.dispatchEvent(new CustomEvent('revil:project_open', { detail: { id: project.id } }));
                                setSelectedProjectId(project.id);
                            }}
                        />
                    ))}
                </div>

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
