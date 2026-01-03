import { useState, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { Plus, Search, MoreVertical, ExternalLink, Eye, Edit2, Trash2, Github } from 'lucide-react';
import { collection, doc, onSnapshot, setDoc, deleteDoc } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL, listAll, deleteObject, getBlob } from 'firebase/storage';
import { db, storage } from '../../lib/firebase';
import Alert, { AlertType } from '../Alert';
import MProjectForm, { ProjectData } from './M-ProjectForm';
import MProjectView, { getTechColor, getStackIcon } from '../M-ProjectView';
import MContributorView from '../M-ContributorView';
import { useLoading } from '../../LoadingContext';
import MConfirmModal from './M-ConfirmModal';


const DProjects = () => {
    const { setIsLoading: setGlobalLoading } = useLoading();
    const [projects, setProjects] = useState<ProjectData[]>([]);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingProject, setEditingProject] = useState<ProjectData | null>(null);
    const [isDark, setIsDark] = useState(false);
    const [windowWidth, setWindowWidth] = useState(window.innerWidth);
    const [activeMenu, setActiveMenu] = useState<string | null>(null);
    const [menuPos, setMenuPos] = useState({ top: 0, right: 0 });
    const [searchQuery, setSearchQuery] = useState('');
    const [viewingProject, setViewingProject] = useState<any | null>(null);
    const [viewingContributor, setViewingContributor] = useState<any | null>(null);

    // Confirmation Modal State
    const [confirmConfig, setConfirmConfig] = useState<{
        isOpen: boolean;
        title: string;
        message: string;
        onConfirm: () => void;
        type?: 'danger' | 'warning' | 'info';
    }>({
        isOpen: false,
        title: '',
        message: '',
        onConfirm: () => { }
    });

    // Alert Toast State
    const [alert, setAlert] = useState<{ show: boolean; type: AlertType; message: string }>({
        show: false,
        type: 'success',
        message: ''
    });

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
        if (searchQuery.length < 2) return projects;

        const query = searchQuery.toLowerCase();

        const scored = projects.map(project => {
            let minDistance = Infinity;
            // Check helper
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

            // Search in Name
            minDistance = Math.min(minDistance, checkTerm(project.name));

            // Search in Tags (assuming plain string array or object with name)
            // project.tags is {name: string, ...}[] based on usage
            project.tags.forEach(tag => {
                minDistance = Math.min(minDistance, checkTerm(tag.name));
            });

            return { project, minDistance };
        });

        return scored
            .filter(item => item.minDistance <= 2)
            .sort((a, b) => a.minDistance - b.minDistance)
            .map(item => item.project);
    }, [projects, searchQuery]);

    // Responsive breakpoints
    const isExtraSmall = windowWidth < 400;
    const isSmall = windowWidth < 640;

    useEffect(() => {
        const checkTheme = () => setIsDark(document.documentElement.classList.contains('dark'));
        const handleResize = () => setWindowWidth(window.innerWidth);

        checkTheme();
        window.addEventListener('resize', handleResize);
        const observer = new MutationObserver(checkTheme);
        observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
        return () => {
            window.removeEventListener('resize', handleResize);
            observer.disconnect();
        };
    }, []);

    const handleAddProject = () => {
        setEditingProject(null);
        setIsModalOpen(true);
    };

    const handleEditProject = (project: ProjectData) => {
        setEditingProject(project);
        setIsModalOpen(true);
        setActiveMenu(null);
    };

    const [availableTags, setAvailableTags] = useState<any[]>([]);
    const [availableContributors, setAvailableContributors] = useState<any[]>([]);

    useEffect(() => {
        // Fetch Tags Metadata
        const unsubTags = onSnapshot(doc(db, 'Tags', 'Tags'),
            (docSnap) => {
                if (docSnap.exists()) {
                    const data = docSnap.data();
                    const loaded = Object.entries(data).map(([key, value]: [string, any]) => ({
                        id: key,
                        name: value.Name,
                        color: value.Color,
                        iconSvg: value.Icon
                    }));
                    setAvailableTags(loaded);
                }
            },
            (err) => {
                const status = navigator.onLine ? "Service Blocked (ISP/Firewall)" : "Offline";
                console.warn(`[Connection] Tags sync: ${status}. Check diagnostic in lib/firebase.ts`, err);
            }
        );

        // Fetch Contributors Metadata
        const unsubContrib = onSnapshot(doc(db, 'Tags', 'Contributors'),
            (docSnap) => {
                if (docSnap.exists()) {
                    const data = docSnap.data();
                    const loaded = Object.entries(data).map(([key, value]: [string, any]) => ({
                        id: key,
                        name: value.Name,
                        role: value.Role || '',
                        image: value.Image || undefined,
                        links: value['Social Accounts'] || {}
                    }));
                    setAvailableContributors(loaded);
                }
            },
            (err) => {
                const status = navigator.onLine ? "Service Blocked (ISP/Firewall)" : "Offline";
                console.warn(`[Connection] Contributors sync: ${status}. Check diagnostic in lib/firebase.ts`, err);
            }
        );

        return () => {
            unsubTags();
            unsubContrib();
        };
    }, []);

    // Fetch Projects from Firestore
    useEffect(() => {
        const unsub = onSnapshot(collection(db, 'Projects'), (snapshot) => {
            const loaded: ProjectData[] = snapshot.docs.map(doc => {
                const data = doc.data();

                // Map Firestore structure back to ProjectData using metadata for enrichment
                const tags: any[] = [];
                if (data.Tags) {
                    Object.values(data.Tags).forEach((tagName: any) => {
                        // Find full tag data from availableTags
                        const fullTag = availableTags.find(t => t.name === tagName);
                        tags.push(fullTag || { name: tagName });
                    });
                }

                const contributors: any[] = [];
                if (data.Contributors) {
                    Object.values(data.Contributors).forEach((c: any) => {
                        const name = c["Contributor Name"];
                        const projectRole = c["Role at Project"];

                        // Find full contributor data from availableContributors for images/links
                        const fullContrib = availableContributors.find(cont =>
                            cont.name?.trim().toLowerCase() === name?.trim().toLowerCase()
                        );

                        contributors.push({
                            ...(fullContrib || {}),
                            name,
                            role: projectRole || (fullContrib ? fullContrib.role : 'Contributor'),
                            // The "Real Role" from their profile
                            jobTitle: fullContrib ? fullContrib.role : 'Contributor'
                        });
                    });
                }

                const statusV = data.Views || {};
                const rawStack = data.Stack || [];
                const normalizedStack = (Array.isArray(rawStack) ? rawStack : Object.values(rawStack)).map((t: any) => {
                    const name = typeof t === 'string' ? t : (t.name || t.Name || 'Unix');
                    const globalTag = availableTags.find((gt: any) => gt.name?.toLowerCase() === name.toLowerCase());

                    return {
                        name,
                        color: (typeof t === 'object' && (t.color || t.Color)) ? (t.color || t.Color) : (globalTag?.color || getTechColor(name)),
                        iconSvg: (typeof t === 'object' && (t.iconSvg || t.Icon)) ? (t.iconSvg || t.Icon) : (globalTag?.iconSvg || getStackIcon(name) || '')
                    };
                }).filter(t => t.name !== 'Unix');

                return {
                    id: doc.id,
                    name: doc.id,
                    description: data.Description || '',
                    liveLink: data["Live Link"] || '',
                    repoLink: data["Repository Link"] || '',
                    downloadLink: data["Download Link"] || '',
                    icon: data["Project Icon"] || '',
                    tags: normalizedStack.length > 0 ? normalizedStack : tags,
                    stack: normalizedStack.map(t => t.name),
                    contributors,
                    views: Number(statusV.Project || 0) || 0,
                    githubViews: Number(statusV.Github || 0) || 0,
                    liveViews: Number(statusV.Live || 0) || 0,
                    images: data["Project Images"] || []
                } as ProjectData;
            });
            setProjects(loaded);
        });
        return () => unsub();
    }, [availableTags, availableContributors]);

    const handleDeleteProject = (projectId: string) => {
        setConfirmConfig({
            isOpen: true,
            title: 'Delete Project',
            message: `Are you sure you want to delete "${projectId}"? This action cannot be undone and all associated data will be removed.`,
            type: 'danger',
            onConfirm: async () => {
                try {
                    setGlobalLoading(true);
                    await deleteDoc(doc(db, 'Projects', projectId));
                } catch (error) {
                    console.error("Error deleting project:", error);
                } finally {
                    setGlobalLoading(false);
                }
            }
        });
        setActiveMenu(null);
    };

    const handleSaveProject = async (data: ProjectData) => {
        try {
            setGlobalLoading(true);
            const projectName = data.name;
            const oldName = editingProject?.name;
            const isNameChanged = oldName && oldName !== projectName;

            let iconUrl = typeof data.icon === 'string' ? data.icon : '';
            const imageUrls: string[] = [];

            // 1. Handle Rename in Storage if name changed
            if (isNameChanged) {
                console.log(`Renaming storage folder from "${oldName}" to "${projectName}"`);
                const oldFolderRef = ref(storage, `src/projects-imgs/${oldName}`);
                try {
                    const listResult = await listAll(oldFolderRef);
                    console.log(`Found ${listResult.items.length} items to move`);

                    for (const item of listResult.items) {
                        try {
                            const blob = await getBlob(item);
                            const newRef = ref(storage, `src/projects-imgs/${projectName}/${item.name}`);

                            await uploadBytes(newRef, blob);
                            const newFileUrl = await getDownloadURL(newRef);
                            console.log(`Moved ${item.name} to new folder`);

                            // Update iconUrl if this was the icon
                            if (item.name === 'icon' && typeof data.icon === 'string' && data.icon.includes(item.name)) {
                                iconUrl = newFileUrl;
                            }

                            // Delete old one after successful copy
                            await deleteObject(item);
                        } catch (itemErr) {
                            console.error(`Failed to move item ${item.name}:`, itemErr);
                            // If we can't move one, we might want to continue or stop
                            // For now, let's continue to move as many as possible
                        }
                    }
                } catch (e) {
                    console.error("Storage listAll or folder access failed:", e);
                }
            }

            // 2. Upload Project Icon (if new file provided)
            if (data.icon && typeof data.icon !== 'string') {
                const iconRef = ref(storage, `src/projects-imgs/${projectName}/icon`);
                await uploadBytes(iconRef, data.icon);
                iconUrl = await getDownloadURL(iconRef);
            }

            // 3. Upload Project Images
            for (const file of data.images) {
                if (typeof file === 'string') {
                    // If it was an old URL and we renamed, we need to point to the new one
                    const encodedOldName = encodeURIComponent(oldName || '');
                    const oldPathChunk = `projects-imgs%2F${encodedOldName}%2F`;

                    if (isNameChanged && file.includes(oldPathChunk)) {
                        const fileName = file.split('/').pop()?.split('?')[0].split('%2F').pop();
                        if (fileName) {
                            try {
                                const newRef = ref(storage, `src/projects-imgs/${projectName}/${decodeURIComponent(fileName)}`);
                                const newUrl = await getDownloadURL(newRef);
                                imageUrls.push(newUrl);
                            } catch (err) {
                                console.warn(`Could not get new URL for ${fileName}, keeping old:`, err);
                                imageUrls.push(file);
                            }
                        } else {
                            imageUrls.push(file);
                        }
                    } else {
                        imageUrls.push(file);
                    }
                } else {
                    const imgRef = ref(storage, `src/projects-imgs/${projectName}/${file.name}`);
                    await uploadBytes(imgRef, file);
                    const url = await getDownloadURL(imgRef);
                    imageUrls.push(url);
                }
            }

            // 4. Prepare Tags Map
            const tagsMap: Record<string, string> = {};
            data.tags.forEach((tag, idx) => {
                tagsMap[(idx + 1).toString()] = tag.name;
            });

            // 5. Prepare Contributors Map
            const contributorsMap: Record<string, any> = {};
            data.contributors.forEach((contrib, idx) => {
                contributorsMap[(idx + 1).toString()] = {
                    "Contributor Name": contrib.name,
                    "Role at Project": contrib.role
                };
            });

            // 6. Construct Document Data
            const projectDoc = {
                "Description": data.description,
                "Live Link": data.liveLink,
                "Download Link": data.downloadLink || '',
                "Project Icon": iconUrl,
                "Repository Link": data.repoLink,
                "Contributors": contributorsMap,
                "Tags": tagsMap,
                "Project Images": imageUrls,
                "Views": {
                    "Github": (data.githubViews || 0).toString(),
                    "Live": (data.liveViews || 0).toString(),
                    "Download": (data.downloadViews || 0).toString(),
                    "Project": (data.views || 0).toString()
                }
            };

            // 7. Save to Firestore
            if (isNameChanged) {
                await deleteDoc(doc(db, 'Projects', oldName));
            }

            await setDoc(doc(db, 'Projects', projectName), projectDoc);

            setIsModalOpen(false);
        } catch (error) {
            console.error("Error saving project:", error);
            setAlert({ show: true, type: 'error', message: 'Failed to save project. Check console.' });
        } finally {
            setGlobalLoading(false);
        }
    };

    // Responsive sizing
    const gap = isExtraSmall ? '16px' : '24px';
    const searchWidth = isExtraSmall ? '100%' : (isSmall ? '180px' : '300px');
    const inputPadding = isExtraSmall ? '10px 10px 10px 36px' : '12px 12px 12px 40px';
    const inputFontSize = isExtraSmall ? '0.85rem' : '0.9rem';
    const buttonPadding = isExtraSmall ? '10px 16px' : '12px 24px';

    // Table columns and min-width responsive settings
    const tableColumns = isExtraSmall
        ? 'minmax(180px, 1.5fr) 120px 120px 70px 56px'
        : isSmall
            ? 'minmax(220px, 2fr) 160px 140px 80px 56px'
            : 'minmax(240px, 2.5fr) 160px 140px 80px 56px';
    const tableMinWidth = isExtraSmall ? '550px' : isSmall ? '650px' : '750px';

    return (
        <div className="h-[90%] flex flex-col" style={{ gap: gap }}>
            {/* Header Actions */}
            <div className="flex justify-between items-center" style={{
                flexWrap: isExtraSmall ? 'wrap' : 'nowrap',
                gap: isExtraSmall ? '12px' : '0'
            }}>
                <div className="relative" style={{ width: searchWidth, minWidth: isExtraSmall ? '100%' : 'auto' }}>
                    <Search size={isExtraSmall ? 18 : 20} className="absolute left-3 top-1/2 -translate-y-1/2 text-sec" />
                    <input
                        type="text"
                        placeholder="Search projects..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="input-field w-full"
                        style={{
                            padding: inputPadding,
                            borderRadius: isExtraSmall ? '10px' : '12px',
                            fontSize: inputFontSize
                        }}
                    />
                </div>
                <button
                    onClick={handleAddProject}
                    className="btn btn-primary"
                    style={{
                        gap: isExtraSmall ? '6px' : '8px',
                        padding: buttonPadding,
                        width: isExtraSmall ? '100%' : 'auto',
                        borderRadius: isExtraSmall ? '10px' : '12px',
                        fontSize: isExtraSmall ? '0.85rem' : '0.9rem'
                    }}
                >
                    <Plus size={isExtraSmall ? 18 : 20} />
                    {isExtraSmall ? 'Add' : 'Add Project'}
                </button>
            </div>
            {/* Projects Table */}
            <div className="flex-1 glass-panel flex flex-col overflow-hidden">
                <div className="flex-1 overflow-auto custom-scrollbar">
                    {/* Header */}
                    <div className="grid p-4 border-b text-sec font-semibold text-sm" style={{
                        gridTemplateColumns: tableColumns,
                        borderColor: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.05)',
                        minWidth: tableMinWidth
                    }}>
                        <div>Project Name</div>
                        <div>Tags</div>
                        <div>Contributors</div>
                        <div>Views</div>
                        <div style={{ textAlign: 'right' }}>Actions</div>
                    </div>

                    {/* Table Body */}
                    <div className="min-w-0">
                        {filteredProjects.length === 0 ? (
                            <div className="p-12 text-center text-sec">
                                {searchQuery ? "No projects match your search." : "No projects found. Click \"Add Project\" to start."}
                            </div>
                        ) : (
                            filteredProjects.map((project) => (
                                <div key={project.id}
                                    onClick={() => setViewingProject(project)}
                                    className="grid p-4 border-b items-center transition-colors cursor-pointer"
                                    style={{
                                        gridTemplateColumns: tableColumns,
                                        borderColor: isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)',
                                        minWidth: tableMinWidth
                                    }}
                                    onMouseEnter={(e) => e.currentTarget.style.backgroundColor = isDark ? 'rgba(255,255,255,0.02)' : 'rgba(0,0,0,0.02)'}
                                    onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                                >
                                    {/* Project Info */}
                                    <div className="flex items-center gap-4" style={{ gridColumn: '1' }}>
                                        <div className="w-10 h-10 rounded-lg overflow-hidden flex items-center justify-center" style={{ backgroundColor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)' }}>
                                            {project.icon ? (
                                                typeof project.icon === 'string' ? (
                                                    <img src={project.icon} alt={project.name} className="w-full h-full object-cover" />
                                                ) : (
                                                    <img src={URL.createObjectURL(project.icon)} alt={project.name} className="w-full h-full object-cover" />
                                                )
                                            ) : project.images.length > 0 ? (
                                                <div className="w-full h-full bg-blue-500 text-white flex items-center justify-center font-bold">{project.name.charAt(0)}</div>
                                            ) : (
                                                <span className="text-xl">📁</span>
                                            )}
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <div className="font-semibold text-primary truncate" style={{ maxWidth: '100%' }} title={project.name}>{project.name}</div>
                                            <div className="text-xs text-sec opacity-70" style={{
                                                maxWidth: '250px',
                                                overflow: 'hidden',
                                                textOverflow: 'ellipsis',
                                                whiteSpace: 'nowrap'
                                            }} title={project.description}>
                                                {project.description}
                                            </div>
                                        </div>
                                    </div>

                                    {/* Tags - Minimalist Badges */}
                                    <div className="flex items-center" style={{ gridColumn: '2' }}>
                                        {project.tags && project.tags.length > 0 ? (
                                            <div className="flex items-center">
                                                {project.tags.slice(0, 5).map((tag, idx) => (
                                                    <div key={idx} title={tag.name}
                                                        className="w-8 h-8 rounded-full flex items-center justify-center border shadow-sm relative transition-all hover:z-20 cursor-help hover:scale-110"
                                                        style={{
                                                            backgroundColor: tag.color ? `${tag.color}40` : 'rgba(59, 130, 246, 0.25)',
                                                            borderColor: tag.color || 'rgba(59, 130, 246, 0.5)',
                                                            color: 'white',
                                                            zIndex: 10 - idx,
                                                            marginLeft: idx === 0 ? 0 : -12,
                                                            backdropFilter: 'blur(4px)',
                                                            transform: `translateX(-${idx * 2}px)`
                                                        }}>
                                                        {tag.iconSvg ? (
                                                            (tag.iconSvg.startsWith('http') || tag.iconSvg.startsWith('data:image')) ? (
                                                                <img src={tag.iconSvg} alt={tag.name} className="w-4 h-4 object-contain" />
                                                            ) : (
                                                                <span className="w-4 h-4 flex items-center justify-center"
                                                                    style={{ filter: isDark ? 'brightness(0) invert(1)' : 'none' }}
                                                                    dangerouslySetInnerHTML={{ __html: tag.iconSvg }} />
                                                            )
                                                        ) : (
                                                            <span className="text-[10px] font-bold text-gray-700 dark:text-gray-200">{tag.name.charAt(0)}</span>
                                                        )}
                                                    </div>
                                                ))}
                                                {project.tags.length > 5 && (
                                                    <div className="w-7 h-7 rounded-full flex items-center justify-center border-2 border-white dark:border-[#1a1a1a] bg-gray-100 dark:bg-white/10 text-[9px] font-bold text-sec shadow-sm relative" style={{ zIndex: 0, marginLeft: -10 }}>
                                                        +{project.tags.length - 5}
                                                    </div>
                                                )}
                                            </div>
                                        ) : (
                                            <div className="text-xs text-sec">—</div>
                                        )}
                                    </div>

                                    {/* Contributors */}
                                    <div className="flex items-center gap-2" style={{ gridColumn: '3' }}>
                                        {project.contributors && project.contributors.length > 0 ? (
                                            <div className="flex items-center">
                                                {project.contributors.slice(0, 5).map((c, i) => (
                                                    <div key={i}
                                                        className="w-7 h-7 rounded-full overflow-hidden border-2 border-white dark:border-[#1a1a1a] bg-gray-200 shadow-sm relative transition-all hover:z-20 cursor-pointer hover:scale-110"
                                                        title={c.name}
                                                        style={{
                                                            zIndex: 10 - i,
                                                            marginLeft: i === 0 ? 0 : -12,
                                                            transform: `translateX(-${i * 2}px)`
                                                        }}
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            setViewingContributor(c);
                                                        }}
                                                    >
                                                        {c.image ? (
                                                            typeof c.image === 'string' ? (
                                                                <img src={c.image} alt={c.name} className="w-full h-full object-cover" />
                                                            ) : (
                                                                <img src={URL.createObjectURL(c.image)} alt={c.name} className="w-full h-full object-cover" />
                                                            )
                                                        ) : (
                                                            <div className="w-full h-full flex items-center justify-center text-xs font-bold bg-accent/10 text-accent">{c.name.charAt(0)}</div>
                                                        )}
                                                    </div>
                                                ))}
                                                {project.contributors.length > 5 && (
                                                    <div className="w-7 h-7 rounded-full flex items-center justify-center border-2 border-white dark:border-[#1a1a1a] bg-gray-200 dark:bg-white/10 text-[9px] font-bold text-sec shadow-sm relative" style={{ zIndex: 0, marginLeft: -12 }}>
                                                        +{project.contributors.length - 5}
                                                    </div>
                                                )}
                                            </div>
                                        ) : (
                                            <div className="text-xs text-sec">—</div>
                                        )}
                                    </div>

                                    {/* Views */}
                                    <div className="flex items-center gap-1.5 text-sec" style={{ gridColumn: '4' }}>
                                        <Eye size={16} />
                                        {typeof project.views === 'number' ? project.views : 0}
                                    </div>

                                    {/* Actions */}
                                    <div className="text-right relative" style={{ gridColumn: '5' }}>
                                        <button
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                const rect = e.currentTarget.getBoundingClientRect();
                                                // Calculate positioning to be exactly next to the button
                                                // top should be slightly below the button center
                                                // right should match the button's right edge
                                                setMenuPos({
                                                    top: rect.bottom + 4,
                                                    right: window.innerWidth - rect.right
                                                });
                                                setActiveMenu(activeMenu === project.id ? null : project.id!);
                                            }}
                                            className={`p-2 rounded-lg border-none bg-transparent cursor-pointer transition-all ${activeMenu === project.id ? 'text-blue-500 bg-blue-500/10' : 'text-sec hover:bg-black/5 dark:hover:bg-white/5'}`}
                                        >
                                            <MoreVertical size={20} />
                                        </button>
                                    </div>
                                </div>
                            ))
                        )}
                    </div>
                </div>
            </div>

            <MProjectForm
                isOpen={isModalOpen}
                onClose={() => setIsModalOpen(false)}
                onSave={handleSaveProject}
                initialData={editingProject}
            />

            <MConfirmModal
                isOpen={confirmConfig.isOpen}
                title={confirmConfig.title}
                message={confirmConfig.message}
                type={confirmConfig.type as any}
                onConfirm={confirmConfig.onConfirm}
                onClose={() => setConfirmConfig(prev => ({ ...prev, isOpen: false }))}
                confirmText="Delete Project"
            />

            {/* Custom Alert Toast */}
            {alert.show && (
                <Alert
                    type={alert.type}
                    message={alert.message}
                    onClose={() => setAlert(prev => ({ ...prev, show: false }))}
                />
            )}

            {/* Fixed Position Menu - Rendered via Portal */}
            {activeMenu && createPortal(
                <>
                    {/* Backdrop to close menu */}
                    <div
                        className="fixed inset-0 z-[999]"
                        onClick={() => setActiveMenu(null)}
                    />
                    <div className="fixed z-[1000] glass-panel min-w-[160px] p-2 animate-pop flex flex-col gap-2 shadow-2xl border border-white/10" style={{
                        top: `${menuPos.top}px`,
                        right: `${menuPos.right}px`,
                        borderRadius: '16px'
                    }}>
                        <button
                            onClick={(e) => {
                                e.stopPropagation();
                                const project = projects.find(p => p.id === activeMenu);
                                if (project) setViewingProject(project);
                                setActiveMenu(null);
                            }}
                            className="w-full text-left flex items-center gap-2 bg-transparent border-none cursor-pointer rounded-lg text-sm p-2.5 transition-colors"
                            style={{
                                color: 'var(--text-primary)',
                                fontFamily: "'Inter', sans-serif"
                            }}
                            onMouseEnter={(e) => e.currentTarget.style.backgroundColor = isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.05)'}
                            onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                        >
                            <Eye size={16} /> View
                        </button>
                        <button
                            onClick={(e) => {
                                e.stopPropagation();
                                const project = projects.find(p => p.id === activeMenu);
                                if (project) handleEditProject(project);
                            }}
                            className="w-full text-left flex items-center gap-2 bg-transparent border-none cursor-pointer rounded-lg text-sm p-2.5 transition-colors"
                            style={{
                                color: 'var(--text-primary)',
                                fontFamily: "'Inter', sans-serif"
                            }}
                            onMouseEnter={(e) => e.currentTarget.style.backgroundColor = isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.05)'}
                            onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                        >
                            <Edit2 size={16} /> Edit
                        </button>

                        {/* Links in Menu */}
                        {(projects.find(p => p.id === activeMenu)?.repoLink || projects.find(p => p.id === activeMenu)?.liveLink) && (
                            <div className="mx-2 my-1 h-[1px]" style={{ backgroundColor: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)' }} />
                        )}
                        {projects.find(p => p.id === activeMenu)?.repoLink && (
                            <a
                                href={projects.find(p => p.id === activeMenu)?.repoLink}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="w-full text-left flex items-center gap-2 bg-transparent border-none cursor-pointer rounded-lg text-sm p-2.5 no-underline transition-colors"
                                style={{
                                    color: isDark ? '#60a5fa' : '#2563eb',
                                    fontFamily: "'Inter', sans-serif"
                                }}
                                onClick={(e) => e.stopPropagation()}
                                onMouseEnter={(e) => e.currentTarget.style.backgroundColor = isDark ? 'rgba(59, 130, 246, 0.1)' : 'rgba(37, 99, 235, 0.05)'}
                                onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                            >
                                <Github size={16} /> View Code
                            </a>
                        )}
                        {projects.find(p => p.id === activeMenu)?.liveLink && (
                            <a
                                href={projects.find(p => p.id === activeMenu)?.liveLink}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="w-full text-left flex items-center gap-2 bg-transparent border-none cursor-pointer rounded-lg text-sm p-2.5 no-underline transition-colors"
                                style={{
                                    color: isDark ? '#4ade80' : '#16a34a',
                                    fontFamily: "'Inter', sans-serif"
                                }}
                                onClick={(e) => e.stopPropagation()}
                                onMouseEnter={(e) => e.currentTarget.style.backgroundColor = isDark ? 'rgba(34, 197, 94, 0.1)' : 'rgba(22, 163, 74, 0.05)'}
                                onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                            >
                                <ExternalLink size={16} /> Visit Live
                            </a>
                        )}

                        <div className="mx-2 my-1 h-[1px]" style={{ backgroundColor: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)' }} />
                        <button
                            onClick={(e) => {
                                e.stopPropagation();
                                handleDeleteProject(activeMenu);
                            }}
                            className="w-full text-left flex items-center gap-2 bg-transparent border-none cursor-pointer rounded-lg text-sm p-2.5 transition-colors"
                            style={{
                                color: 'rgb(239, 68, 68)',
                                fontFamily: "'Inter', sans-serif"
                            }}
                            onMouseEnter={(e) => e.currentTarget.style.backgroundColor = isDark ? 'rgba(239, 68, 68, 0.1)' : 'rgba(239, 68, 68, 0.05)'}
                            onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                        >
                            <Trash2 size={16} /> Remove
                        </button>
                    </div>
                </>,
                document.body
            )}
            {/* View Modals */}
            {viewingProject && (
                <MProjectView
                    project={{
                        ...viewingProject,
                        title: viewingProject.name,
                        images: viewingProject.images.map((img: any) => typeof img === 'string' ? img : URL.createObjectURL(img))
                    }}
                    onClose={() => setViewingProject(null)}
                    onContributorClick={(c) => setViewingContributor(c)}
                />
            )}
            {viewingContributor && (
                <MContributorView
                    contributor={{
                        ...viewingContributor,
                        links: viewingContributor.socials || viewingContributor.links
                    }}
                    onClose={() => setViewingContributor(null)}
                />
            )}
        </div>
    );
};

export default DProjects;
