import { useState, useEffect, useRef } from 'react';
import { Search, Plus, Tag, Edit2, Trash2, Users, UserPlus } from 'lucide-react';
import { doc, collection, onSnapshot, updateDoc, deleteField } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL, deleteObject } from 'firebase/storage';
import { db, storage } from '../../lib/firebase';
import anime from 'animejs';
import { TagData, ContributorData, TagFormData } from '../../types';
import MTagForm from './M-TagForm';
import MContributorForm from './M-ContributorForm';
import { createPortal } from 'react-dom';
import Loader from '../reactbits/Loader';
import MConfirmModal from './M-ConfirmModal';

interface RawFirestoreTag {
    Name?: string;
    Color?: string;
    Icon?: string;
}

interface RawFirestoreContributor {
    Name?: string;
    Role?: string;
    Image?: string;
    'Social Accounts'?: {
        Github?: string;
        Linkedin?: string;
        Facebook?: string;
        Instagram?: string;
        Portfolio?: string;
    };
}

const DTags = () => {
    const [isLoading, setIsLoading] = useState(false);
    const [isDark, setIsDark] = useState(false);
    const [windowWidth, setWindowWidth] = useState(window.innerWidth);
    const [activeSection, setActiveSection] = useState<'tags' | 'contributors'>('tags');
    const [tags, setTags] = useState<TagData[]>([]);
    const [contributors, setContributors] = useState<ContributorData[]>([]);
    const [tagModalOpen, setTagModalOpen] = useState(false);
    const [contribModalOpen, setContribModalOpen] = useState(false);
    const [editingTag, setEditingTag] = useState<TagFormData | null>(null);
    const [editingContributor, setEditingContributor] = useState<ContributorData | null>(null);
    const [optionsOpen, setOptionsOpen] = useState(false);
    const [optionsPos, setOptionsPos] = useState({ x: 0, y: 0 });

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

    const directionRef = useRef<number>(1);
    const [isTransitioning, setIsTransitioning] = useState(false);
    const hasAnimatedRef = useRef<string | null>(null);
    const [revealedSections, setRevealedSections] = useState<Record<string, boolean>>({
        tags: false,
        contributors: false
    });

    const handleSectionChange = (newSection: 'tags' | 'contributors') => {
        if (newSection === activeSection || isTransitioning) return;

        hasAnimatedRef.current = null;
        setRevealedSections(prev => ({ ...prev, [newSection]: false }));

        const indices: Record<string, number> = { tags: 0, contributors: 1 };
        const direction = indices[newSection] > indices[activeSection] ? 1 : -1;
        directionRef.current = direction;
        setIsTransitioning(true);

        // Instant Exit
        anime({
            targets: '.tags-section',
            translateX: [0, -direction * 30],
            opacity: [1, 0],
            duration: 150,
            easing: 'easeInQuad',
            complete: () => {
                setActiveSection(newSection);
            }
        });
    };

    useEffect(() => {
        const checkTheme = () => setIsDark(document.documentElement.classList.contains('dark'));
        const handleResize = () => setWindowWidth(window.innerWidth);

        checkTheme();
        window.addEventListener('resize', handleResize);
        const observer = new MutationObserver(checkTheme);
        observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });

        // Real-time data from central documents
        const unsubTags = onSnapshot(doc(db, 'Tags', 'Tags'),
            (snapshot) => {
                if (snapshot.exists()) {
                    const data = snapshot.data();
                    const tagsData = Object.entries(data).map(([id, val]: [string, RawFirestoreTag]) => ({
                        id,
                        name: val.Name || 'Untitled',
                        color: val.Color || '#3b82f6',
                        iconSvg: val.Icon || ''
                    }));
                    // Sort by numeric ID if possible, otherwise by name
                    tagsData.sort((a, b) => {
                        const idA = parseInt(a.id);
                        const idB = parseInt(b.id);
                        if (!isNaN(idA) && !isNaN(idB)) return idA - idB;
                        return a.name.localeCompare(b.name);
                    });
                    setTags(tagsData);
                } else {
                    setTags([]);
                }
            },
            (err) => {
                const status = navigator.onLine ? "Service Blocked (ISP/Firewall)" : "Offline";
                console.warn(`[Connection] Tags sync: ${status}. Check diagnostic in lib/firebase.ts`, err);
            }
        );

        const unsubContributorsDoc = onSnapshot(doc(db, 'Tags', 'Contributors'), (snapshot) => {
            if (snapshot.exists()) {
                const data = snapshot.data();
                const contribData: ContributorData[] = Object.entries(data)
                    .filter(([, val]) => val && typeof val === 'object' && (val as RawFirestoreContributor).Name)
                    .map(([id, val]: [string, RawFirestoreContributor]) => ({
                        id,
                        name: val.Name || 'Untitled',
                        role: val.Role || '',
                        image: val.Image || '',
                        socials: {
                            github: val['Social Accounts']?.Github || '',
                            linkedin: val['Social Accounts']?.Linkedin || '',
                            facebook: val['Social Accounts']?.Facebook || '',
                            instagram: val['Social Accounts']?.Instagram || '',
                            portfolio: val['Social Accounts']?.Portfolio || ''
                        }
                    } as ContributorData));
                setContributors(prev => [...prev.filter(c => !contribData.some(d => d.id === c.id)), ...contribData]);
            }
        });

        const unsubContributorsCol = onSnapshot(collection(db, 'Tags', 'Contributors', 'Profiles'), (snapshot) => {
            const contribData: ContributorData[] = snapshot.docs.map(doc => {
                const val = doc.data();
                return {
                    id: doc.id,
                    name: val.Name || val.name || 'Anonymous',
                    role: val.Role || val.role || '',
                    image: val.Image || val.image || '',
                    socials: {
                        github: (val['Social Accounts']?.Github || val.socials?.github || ''),
                        linkedin: (val['Social Accounts']?.Linkedin || val.socials?.linkedin || ''),
                        facebook: (val['Social Accounts']?.Facebook || val.socials?.facebook || ''),
                        instagram: (val['Social Accounts']?.Instagram || val.socials?.instagram || ''),
                        portfolio: (val['Social Accounts']?.Portfolio || val.socials?.portfolio || '')
                    }
                };
            });
            setContributors(prev => {
                const filtered = prev.filter(c => !contribData.some(d => d.id === c.id));
                return [...filtered, ...contribData];
            });
        });

        return () => {
            window.removeEventListener('resize', handleResize);
            observer.disconnect();
            unsubTags();
            unsubContributorsDoc();
            unsubContributorsCol();
        };
    }, []);

    useEffect(() => {
        const runAnimation = () => {
            const targets = document.querySelectorAll('.tags-section');
            if (targets.length === 0) return;
            if (hasAnimatedRef.current === activeSection) return;

            hasAnimatedRef.current = activeSection;

            const timeline = anime.timeline({
                easing: 'easeOutExpo',
                complete: () => {
                    setRevealedSections(prev => ({ ...prev, [activeSection]: true }));
                    setIsTransitioning(false);
                }
            });

            // Ultra-Fast Entrance
            timeline.add({
                targets: '.tags-section',
                opacity: [0, 1],
                translateX: [directionRef.current * 40, 0],
                duration: 300
            }, 0);

            timeline.add({
                targets: '.tags-card',
                opacity: [0, 1],
                translateY: [10, 0],
                scale: [0.99, 1],
                rotateY: [directionRef.current * 3, 0],
                delay: anime.stagger(20, { start: 30 }),
                duration: 450
            }, 0);
        };

        runAnimation();
        // Safety revealed state
        const safetyId = setTimeout(() => {
            if (hasAnimatedRef.current !== activeSection) {
                setRevealedSections(prev => ({ ...prev, [activeSection]: true }));
                setIsTransitioning(false);
            }
        }, 150);

        const tid = setTimeout(runAnimation, 30);
        return () => {
            clearTimeout(tid);
            clearTimeout(safetyId);
        };
    }, [activeSection, tags.length, contributors.length]);

    const [searchQuery, setSearchQuery] = useState('');

    const filteredTags = tags.filter(tag =>
        tag.name.toLowerCase().includes(searchQuery.toLowerCase())
    );

    const filteredContributors = contributors.filter(c =>
        c.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        c.role.toLowerCase().includes(searchQuery.toLowerCase())
    );

    const handleSaveTag = async (data: TagFormData) => {
        try {
            setIsLoading(true);
            const nextIndex = tags.length > 0
                ? Math.max(...tags.map(t => parseInt(t.id?.toString() || '0')).filter(n => !isNaN(n))) + 1
                : 1;
            const id = data.id || nextIndex.toString();

            let iconUrl = data.iconSvg || '';

            // Handle file upload if a new file was provided
            if (data.iconFile) {
                const storageRef = ref(storage, `src/svgs/${id}_${data.iconFile.name}`);
                await uploadBytes(storageRef, data.iconFile);
                iconUrl = await getDownloadURL(storageRef);
            }

            const tagPayload = {
                Name: data.name,
                Color: data.color,
                Icon: iconUrl
            };

            await updateDoc(doc(db, 'Tags', 'Tags'), {
                [id]: tagPayload
            });

            setTagModalOpen(false);
            setEditingTag(null);
        } catch (error) {
            console.error('Error saving tag:', error);
        } finally {
            setIsLoading(false);
        }
    };

    const handleDeleteTag = (id: string) => {
        const tag = tags.find(t => t.id === id);
        setConfirmConfig({
            isOpen: true,
            title: 'Delete Tag',
            message: `Are you sure you want to delete the tag "${tag?.name || id}"? This will remove it from all projects.`,
            type: 'danger',
            onConfirm: async () => {
                try {
                    await updateDoc(doc(db, 'Tags', 'Tags'), {
                        [id]: deleteField()
                    });
                } catch (error) {
                    console.error('Error deleting tag:', error);
                }
            }
        });
    };

    const handleSaveContributor = async (data: ContributorData) => {
        try {
            setIsLoading(true);
            const nextIndex = contributors.length > 0
                ? Math.max(...contributors.map(c => parseInt(c.id?.toString() || '0')).filter(n => !isNaN(n))) + 1
                : 0;
            const id = data.id || nextIndex.toString();
            let imageUrl = '';

            // Find the existing contributor to check for old image
            const existingContributor = contributors.find(c => c.id?.toString() === id);
            const oldImageUrl = typeof existingContributor?.image === 'string' ? existingContributor.image : '';

            if (typeof data.image === 'string') {
                imageUrl = data.image;
            } else if (data.image instanceof File) {
                const now = new Date();
                const dateStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
                const timeStr = `${String(now.getHours()).padStart(2, '0')}-${String(now.getMinutes()).padStart(2, '0')}-${String(now.getSeconds()).padStart(2, '0')}`;
                const safeName = data.name.replace(/\s+/g, '_').replace(/[^a-zA-Z0-9_-]/g, '');
                const fileName = `${safeName}-${dateStr}-${timeStr}.png`;
                const storageRef = ref(storage, `src/imgs/Contributors/${fileName}`);
                await uploadBytes(storageRef, data.image);
                imageUrl = await getDownloadURL(storageRef);

                // Delete the old image from storage if it exists and is different
                if (oldImageUrl && oldImageUrl !== imageUrl) {
                    try {
                        const oldRef = ref(storage, oldImageUrl);
                        await deleteObject(oldRef);
                    } catch (err) {
                        console.warn('Could not delete old contributor image:', err);
                    }
                }
            }

            const contribPayload = {
                Name: data.name,
                Role: data.role,
                Image: imageUrl,
                'Social Accounts': {
                    Github: data.socials?.github || '',
                    Linkedin: data.socials?.linkedin || '',
                    Facebook: data.socials?.facebook || '',
                    Instagram: data.socials?.instagram || '',
                    Portfolio: data.socials?.portfolio || ''
                }
            };

            await updateDoc(doc(db, 'Tags', 'Contributors'), {
                [id]: contribPayload
            });

            setContribModalOpen(false);
            setEditingContributor(null);
        } catch (error) {
            console.error('Error saving contributor:', error);
        } finally {
            setIsLoading(false);
        }
    };

    const handleDeleteContributor = (id: string) => {
        const contrib = contributors.find(c => c.id === id);
        setConfirmConfig({
            isOpen: true,
            title: 'Delete Contributor',
            message: `Are you sure you want to remove "${contrib?.name || id}" from the contributors list?`,
            type: 'danger',
            onConfirm: async () => {
                try {
                    await updateDoc(doc(db, 'Tags', 'Contributors'), {
                        [id]: deleteField()
                    });
                } catch (error) {
                    console.error('Error deleting contributor:', error);
                }
            }
        });
    };

    const handleOptionsClick = (e: React.MouseEvent<HTMLButtonElement>) => {
        const rect = e.currentTarget.getBoundingClientRect();
        const menuWidth = 200;
        const menuHeight = 120;

        let x = rect.left;
        let y = rect.bottom + 12;

        if (x + menuWidth > window.innerWidth) {
            x = window.innerWidth - menuWidth - 16;
        }
        if (y + menuHeight > window.innerHeight) {
            y = rect.top - menuHeight - 12;
        }
        if (x < 16) x = 16;
        if (y < 16) y = 16;

        setOptionsPos({ x, y });
        setOptionsOpen(true);

        setTimeout(() => {
            anime({
                targets: '.tags-menu',
                scale: [0.85, 1],
                opacity: [0, 1],
                translateY: [-15, 0],
                duration: 450,
                easing: 'easeOutElastic(1, 0.8)'
            });
        }, 0);
    };

    const isExtraSmall = windowWidth < 400;
    const isSmall = windowWidth < 640;

    const containerPadding = isExtraSmall ? '12px' : (isSmall ? '16px' : '24px');
    const containerRadius = isExtraSmall ? '24px' : '32px';
    const gap = isExtraSmall ? '12px' : '20px';
    const searchWidth = isExtraSmall ? '100%' : '300px';
    const inputPadding = isExtraSmall ? '10px 10px 10px 40px' : '12px 12px 12px 42px';
    const buttonPadding = isExtraSmall ? '10px' : '12px';
    const inputFontSize = isExtraSmall ? '14px' : '16px';
    const tabPadding = isExtraSmall ? '8px 12px' : '10px 16px';
    const tabFontSize = isExtraSmall ? '13px' : '15px';
    const iconSize = isExtraSmall ? 16 : 18;

    return (
        <div className="h-[85vh] flex flex-col" style={{ gap: gap, touchAction: 'pan-y' }}>
            <Loader isOpen={isLoading} isFullScreen={true} />
            {/* Header Actions */}
            <div className="flex justify-between items-center" style={{
                flexWrap: isExtraSmall ? 'wrap' : 'nowrap',
                gap: isExtraSmall ? '12px' : '0'
            }}>
                <div className="relative" style={{ width: searchWidth, minWidth: isExtraSmall ? '100%' : 'auto' }}>
                    <Search size={isExtraSmall ? 18 : 20} className="absolute left-3 top-1/2 -translate-y-1/2 text-sec" />
                    <input
                        type="text"
                        placeholder={`Search ${activeSection}...`}
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
                    onClick={handleOptionsClick}
                    className="flex items-center justify-center btn btn-primary"
                    style={{
                        padding: buttonPadding,
                        borderRadius: isExtraSmall ? '10px' : '12px'
                    }}
                >
                    <Plus size={isExtraSmall ? 18 : 20} />
                </button>
            </div>

            {/* Section Tabs */}
            <div className="flex overflow-x-auto" style={{
                gap: isExtraSmall ? '4px' : '8px',
                backgroundColor: isDark ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.03)',
                padding: isExtraSmall ? '4px' : '6px',
                borderRadius: isExtraSmall ? '12px' : '14px',
                width: isExtraSmall ? '100%' : 'fit-content'
            }}>
                <button
                    onClick={() => handleSectionChange('tags')}
                    className="flex items-center whitespace-nowrap cursor-pointer transition-all font-semibold"
                    style={{
                        gap: isExtraSmall ? '6px' : '8px',
                        padding: tabPadding,
                        borderRadius: isExtraSmall ? '8px' : '10px',
                        backgroundColor: activeSection === 'tags'
                            ? (isDark ? 'rgba(59, 130, 246, 0.2)' : 'rgba(59, 130, 246, 0.1)')
                            : 'transparent',
                        color: activeSection === 'tags' ? 'rgb(59, 130, 246)' : 'var(--text-secondary)',
                        fontSize: tabFontSize,
                        flex: isExtraSmall ? 1 : 'none'
                    }}
                >
                    <Tag size={iconSize} />
                    {isExtraSmall ? tags.length : `Tags (${tags.length})`}
                </button>
                <button
                    onClick={() => handleSectionChange('contributors')}
                    className="flex items-center whitespace-nowrap cursor-pointer transition-all font-semibold"
                    style={{
                        gap: isExtraSmall ? '6px' : '8px',
                        padding: tabPadding,
                        borderRadius: isExtraSmall ? '8px' : '10px',
                        backgroundColor: activeSection === 'contributors'
                            ? (isDark ? 'rgba(168, 85, 247, 0.2)' : 'rgba(168, 85, 247, 0.1)')
                            : 'transparent',
                        color: activeSection === 'contributors' ? 'rgb(168, 85, 247)' : 'var(--text-secondary)',
                        fontSize: tabFontSize,
                        flex: isExtraSmall ? 1 : 'none'
                    }}
                >
                    <Users size={iconSize} />
                    {isExtraSmall ? contributors.length : `Contributors (${contributors.length})`}
                </button>
            </div>

            {/* Content Area */}
            <div className="flex-1 overflow-hidden" style={{
                backgroundColor: isDark ? '#00000040' : '#ffffff59',
                backdropFilter: 'blur(12px)',
                borderRadius: containerRadius,
                border: `1px solid ${isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.05)'}`,
                padding: containerPadding,
                minHeight: 0,
                maxHeight: '80vh'
            }}>
                <div className="flex-1 min-h-0 relative h-full">
                    <div
                        className="tags-section py-2 flex flex-col h-full overflow-y-auto custom-scrollbar"
                        style={{ opacity: revealedSections[activeSection] ? 1 : 0 }}
                    >
                        {activeSection === 'tags' ? (
                            <>
                                {filteredTags.length === 0 ? (
                                    <div className="p-12 text-center text-sec">
                                        {searchQuery ? "No tags match your search." : "No tags yet. Click the + button to add one."}
                                    </div>
                                ) : (
                                    <div className="grid grid-cols-1 xs:grid-cols-2 sm:grid-cols-3 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4 sm:gap-6 pb-12 overflow-visible">
                                        {filteredTags.map((tag: TagData) => (
                                            <div
                                                key={tag.id}
                                                className="tags-card flex flex-col p-4 sm:p-6 rounded-3xl transition-all duration-300 relative group"
                                                style={{
                                                    backgroundColor: isDark ? 'rgba(255,255,255,0.05)' : 'rgba(255, 255, 255, 0.4)',
                                                    backdropFilter: 'blur(16px)',
                                                    WebkitBackdropFilter: 'blur(16px)',
                                                    border: isDark ? '1px solid rgba(255,255,255,0.1)' : '1px solid rgba(255,255,255,0.3)',
                                                    opacity: revealedSections.tags ? 1 : 0,
                                                    boxShadow: isDark ? '0 10px 30px -10px rgba(0,0,0,0.3)' : '0 10px 30px -10px rgba(0,0,0,0.05)'
                                                }}
                                            >
                                                <div className="flex items-center justify-between mb-4 sm:mb-5">
                                                    <div className="w-12 h-12 sm:w-16 sm:h-16 rounded-xl sm:rounded-2xl flex items-center justify-center overflow-hidden p-2 sm:p-3 shadow-inner" style={{
                                                        backgroundColor: `${tag.color}15`,
                                                        color: tag.color,
                                                        border: `1px solid ${tag.color}25`
                                                    }}>
                                                        {tag.iconSvg ? (
                                                            tag.iconSvg.trim().startsWith('http') ? (
                                                                <img src={tag.iconSvg} alt={tag.name} className="w-full h-full object-contain" />
                                                            ) : (
                                                                <div className="w-full h-full flex items-center justify-center [&>svg]:w-full [&>svg]:h-full [&>svg]:fill-current"
                                                                    dangerouslySetInnerHTML={{ __html: tag.iconSvg }}
                                                                />
                                                            )
                                                        ) : (
                                                            <Tag size={isSmall ? 24 : 32} />
                                                        )}
                                                    </div>
                                                    <div className={`flex gap-1 transition-all ${isSmall ? 'opacity-100' : 'opacity-0 group-hover:opacity-100 translate-y-2 group-hover:translate-y-0'}`}>
                                                        <button
                                                            onClick={(e) => { e.stopPropagation(); setEditingTag(tag); setTagModalOpen(true); }}
                                                            className="p-2 sm:p-2.5 rounded-lg sm:rounded-xl border-none bg-blue-500/10 hover:bg-blue-500/20 text-blue-500 cursor-pointer transition-colors"
                                                        >
                                                            <Edit2 size={isSmall ? 14 : 18} />
                                                        </button>
                                                        <button
                                                            onClick={(e) => { e.stopPropagation(); handleDeleteTag(tag.id?.toString() ?? ''); }}
                                                            className="p-2 sm:p-2.5 rounded-lg sm:rounded-xl border-none bg-red-500/10 hover:bg-red-500/20 text-red-500 cursor-pointer transition-colors"
                                                        >
                                                            <Trash2 size={isSmall ? 14 : 18} />
                                                        </button>
                                                    </div>
                                                </div>
                                                <div className="min-w-0">
                                                    <div className="font-bold text-primary text-lg sm:text-xl lg:text-2xl truncate mb-0.5 sm:mb-1">{tag.name}</div>
                                                    <div className="text-[10px] sm:text-xs font-mono uppercase tracking-widest opacity-40 truncate">{tag.color}</div>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </>
                        ) : (
                            <>
                                {filteredContributors.length === 0 ? (
                                    <div className="p-12 text-center text-sec">
                                        {searchQuery ? "No contributors match your search." : "No contributors yet."}
                                    </div>
                                ) : (
                                    <div className="grid grid-cols-1 xs:grid-cols-2 sm:grid-cols-3 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4 sm:gap-6 pb-12 overflow-visible">
                                        {filteredContributors.map((contributor) => (
                                            <div
                                                key={contributor.id}
                                                className="tags-card flex flex-col p-4 sm:p-6 rounded-3xl transition-all duration-300 relative group"
                                                style={{
                                                    opacity: revealedSections.contributors ? 1 : 0,
                                                    backgroundColor: isDark ? 'rgba(255,255,255,0.05)' : 'rgba(255, 255, 255, 0.4)',
                                                    backdropFilter: 'blur(16px)',
                                                    WebkitBackdropFilter: 'blur(16px)',
                                                    border: isDark ? '1px solid rgba(255,255,255,0.1)' : '1px solid rgba(255,255,255,0.3)',
                                                    boxShadow: isDark ? '0 10px 30px -10px rgba(0,0,0,0.3)' : '0 10px 30px -10px rgba(0,0,0,0.05)'
                                                }}
                                            >
                                                {/* Top: Image & Actions */}
                                                <div className="flex items-center justify-between mb-4 sm:mb-5">
                                                    <div className="w-12 h-12 sm:w-16 sm:h-16 rounded-xl sm:rounded-2xl overflow-hidden border-2 p-1 shadow-md shrink-0 transition-transform group-hover:scale-105" style={{
                                                        borderColor: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.05)',
                                                        backgroundColor: isDark ? 'rgba(0,0,0,0.2)' : 'rgba(0,0,0,0.02)'
                                                    }}>
                                                        <div className="w-full h-full rounded-xl overflow-hidden flex items-center justify-center">
                                                            {contributor.image ? (
                                                                <img src={typeof contributor.image === 'string' ? contributor.image : undefined} alt={contributor.name} className="w-full h-full object-cover" />
                                                            ) : (
                                                                <span className="text-xl sm:text-2xl font-bold bg-gradient-to-br from-purple-500 to-blue-500 bg-clip-text text-transparent">
                                                                    {contributor.name.charAt(0).toUpperCase()}
                                                                </span>
                                                            )}
                                                        </div>
                                                    </div>
                                                    <div className={`flex gap-1 transition-all ${isSmall ? 'opacity-100' : 'opacity-0 group-hover:opacity-100 translate-y-2 group-hover:translate-y-0'}`}>
                                                        <button
                                                            onClick={(e) => { e.stopPropagation(); setEditingContributor(contributor); setContribModalOpen(true); }}
                                                            className="p-2 sm:p-2.5 rounded-lg sm:rounded-xl border-none bg-blue-500/10 hover:bg-blue-500/20 text-blue-500 cursor-pointer transition-colors"
                                                        >
                                                            <Edit2 size={isSmall ? 14 : 18} />
                                                        </button>
                                                        <button
                                                            onClick={(e) => { e.stopPropagation(); handleDeleteContributor(contributor.id!.toString()); }}
                                                            className="p-2 sm:p-2.5 rounded-lg sm:rounded-xl border-none bg-red-500/10 hover:bg-red-500/20 text-red-500 cursor-pointer transition-colors"
                                                        >
                                                            <Trash2 size={isSmall ? 14 : 18} />
                                                        </button>
                                                    </div>
                                                </div>

                                                {/* Bottom: Info */}
                                                <div className="min-w-0">
                                                    <div className="font-bold text-primary text-lg sm:text-xl truncate mb-0.5 sm:mb-1">{contributor.name}</div>
                                                    <div className="text-[10px] sm:text-[11px] font-medium text-sec bg-accent/5 dark:bg-accent/10 px-2.5 py-1 rounded-full w-fit truncate max-w-full uppercase tracking-wider">
                                                        {contributor.role}
                                                    </div>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </>
                        )}
                    </div>
                </div>
            </div>

            {/* Options Menu */}
            {optionsOpen && createPortal(
                <>
                    <div className="fixed inset-0 z-[1000]" onClick={() => setOptionsOpen(false)} />
                    <div
                        className="fixed z-[1001] p-2 min-w-[200px] tags-menu border border-white dark:border-white/20 shadow-[0_25px_60px_rgba(0,0,0,0.15)] dark:shadow-[0_25px_60px_rgba(0,0,0,0.45)] ring-4 ring-black/[0.02] dark:ring-white/[0.02]"
                        style={{
                            top: optionsPos.y,
                            left: optionsPos.x,
                            borderRadius: '20px',
                            transformOrigin: 'top center',
                            opacity: 0,
                            backgroundColor: isDark ? 'rgba(20, 20, 20, 0.85)' : 'rgba(255, 255, 255, 0.92)',
                            backdropFilter: 'blur(24px)',
                            WebkitBackdropFilter: 'blur(24px)'
                        }}
                    >
                        <button
                            onClick={() => { setOptionsOpen(false); setEditingTag(null); setTagModalOpen(true); }}
                            className="w-full flex items-center gap-3 p-3 border-none bg-transparent text-primary cursor-pointer rounded-xl text-sm font-medium hover:bg-gray-500/10 transition-colors"
                        >
                            <Tag size={18} style={{ color: 'rgb(59, 130, 246)' }} />
                            Add Tag
                        </button>
                        <button
                            onClick={() => { setOptionsOpen(false); setEditingContributor(null); setContribModalOpen(true); }}
                            className="w-full flex items-center gap-3 p-3 border-none bg-transparent text-primary cursor-pointer rounded-xl text-sm font-medium hover:bg-gray-500/10 transition-colors"
                        >
                            <UserPlus size={18} style={{ color: 'rgb(168, 85, 247)' }} />
                            Add Contributor
                        </button>
                    </div>
                </>,
                document.body
            )}

            <MTagForm isOpen={tagModalOpen} onClose={() => setTagModalOpen(false)} onSave={handleSaveTag} initialData={editingTag} />
            <MContributorForm isOpen={contribModalOpen} onClose={() => { setContribModalOpen(false); setEditingContributor(null); }} onSave={handleSaveContributor} initialData={editingContributor!} />

            <MConfirmModal
                isOpen={confirmConfig.isOpen}
                title={confirmConfig.title}
                message={confirmConfig.message}
                type={confirmConfig.type}
                onConfirm={confirmConfig.onConfirm}
                onClose={() => setConfirmConfig(prev => ({ ...prev, isOpen: false }))}
                confirmText="Delete"
            />
        </div>
    );
};

export default DTags;
