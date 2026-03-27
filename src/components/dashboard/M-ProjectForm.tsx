import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { X, Upload, Plus, Image as ImageIcon, Github, ExternalLink, Trash2, Eye, Edit } from 'lucide-react';
import { doc, collection, onSnapshot } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import anime from 'animejs';

import { ProjectData, TagData, ContributorData } from '../../types';

interface ProjectFormData extends Omit<ProjectData, 'images' | 'icon'> {
    images: (File | string)[];
    icon?: File | string;
}

interface MProjectFormProps {
    isOpen: boolean;
    onClose: () => void;
    onSave: (data: ProjectFormData) => void;
    initialData?: ProjectFormData | null;
}

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

const MProjectForm = ({ isOpen, onClose, onSave, initialData }: Omit<MProjectFormProps, 'initialData'> & { initialData?: MProjectFormProps['initialData'] }) => {
    // --- STATE ---
    const [formData, setFormData] = useState<ProjectFormData>(initialData || {
        name: '',
        description: '',
        tags: [],
        contributors: [],
        repoLink: '',
        liveLink: '',
        downloadLink: '',
        images: [],
        icon: undefined,
        listing: 0
    });

    const [isDark, setIsDark] = useState(true);
    const [selectTagOpen, setSelectTagOpen] = useState(false);
    const [selectContribOpen, setSelectContribOpen] = useState(false);
    const [availableTags, setAvailableTags] = useState<TagData[]>([]);
    const [availableContributors, setAvailableContributors] = useState<ContributorData[]>([]);
    const [activeView, setActiveView] = useState<'edit' | 'preview'>('edit');

    const iconInputRef = useRef<HTMLInputElement>(null);
    const imagesInputRef = useRef<HTMLInputElement>(null);

    // --- EFFECTS ---
    useEffect(() => {
        const checkTheme = () => setIsDark(document.documentElement.classList.contains('dark'));
        checkTheme();
        const observer = new MutationObserver(checkTheme);
        observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
        return () => observer.disconnect();
    }, []);

    // Fetch Tags and Contributors from Firebase
    useEffect(() => {
        const unsubTags = onSnapshot(doc(db, 'Tags', 'Tags'), (snapshot) => {
            if (snapshot.exists()) {
                const data = snapshot.data();
                const tagsData = Object.entries(data).map(([id, val]: [string, RawFirestoreTag]) => ({
                    id,
                    name: val.Name || 'Untitled',
                    color: val.Color || '#3b82f6',
                    iconSvg: val.Icon || ''
                }));
                tagsData.sort((a, b) => a.name.localeCompare(b.name));
                setAvailableTags(tagsData);
            }
        });

        const unsubContributorsDoc = onSnapshot(doc(db, 'Tags', 'Contributors'), (snapshot) => {
            if (snapshot.exists()) {
                const data = snapshot.data();
                const contribData = Object.entries(data)
                    .filter(([, val]) => val && typeof val === 'object' && (val as RawFirestoreContributor).Name)
                    .map(([id, val]: [string, RawFirestoreContributor]) => ({
                        id,
                        name: val.Name || 'Anonymous',
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
                setAvailableContributors(prev => {
                    const filtered = prev.filter(c => !contribData.some(d => d.id === c.id));
                    const combined = [...filtered, ...contribData];
                    return combined.sort((a, b) => a.name.localeCompare(b.name));
                });
            }
        });

        const unsubContributorsCol = onSnapshot(collection(db, 'Tags', 'Contributors', 'Profiles'), (snapshot) => {
            const contribData = snapshot.docs.map(doc => {
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
            setAvailableContributors(prev => {
                const filtered = prev.filter(c => !contribData.some(d => d.id === c.id));
                const combined = [...filtered, ...contribData];
                return combined.sort((a, b) => a.name.localeCompare(b.name));
            });
        });

        return () => {
            unsubTags();
            unsubContributorsDoc();
            unsubContributorsCol();
        };
    }, []);


    useEffect(() => {
        if (isOpen) {
            // Animate Modal Entrance
            anime({
                targets: '.project-modal-container',
                scale: [0.9, 1],
                opacity: [0, 1],
                easing: 'easeOutElastic(1, .6)',
                duration: 600,
                delay: 100
            });

            // Animate Form Cards Staggered
            anime({
                targets: '.dashboard-card',
                translateY: [20, 0],
                opacity: [0, 1],
                delay: anime.stagger(100, { start: 300 }),
                easing: 'easeOutQuad',
                duration: 500
            });
        }
    }, [isOpen]);

    // Animate Selection Modals
    useEffect(() => {
        if (selectTagOpen || selectContribOpen) {
            anime({
                targets: '.select-modal-content',
                scale: [0.95, 1],
                opacity: [0, 1],
                easing: 'easeOutCubic',
                duration: 300
            });
        }
    }, [selectTagOpen, selectContribOpen]);

    // --- HANDLERS ---
    const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
        const { name, value, type } = e.target as HTMLInputElement;
        setFormData(prev => ({ ...prev, [name]: type === 'number' ? Number(value) : value }));
    };

    const isVideo = (file: File | string) => {
        if (typeof file === 'string') {
            const videoExtensions = ['.mp4', '.webm', '.ogg', '.mov'];
            const url = file.split('?')[0].toLowerCase();
            return videoExtensions.some(ext => url.endsWith(ext)) || url.includes('/videos/');
        }
        return file.type.startsWith('video/');
    };

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files.length > 0) {
            const newFiles = Array.from(e.target.files);
            setFormData(prev => ({ ...prev, images: [...prev.images, ...newFiles] }));
        }
    };

    const handleIconChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) setFormData(prev => ({ ...prev, icon: file }));
    };

    const removeFile = (index: number) => {
        setFormData(prev => ({
            ...prev,
            images: prev.images.filter((_, i) => i !== index)
        }));
    };

    const handleAddTag = (tag: TagData) => {
        setFormData(prev => ({ ...prev, tags: [...prev.tags, tag] }));
    };

    const removeTag = (index: number) => setFormData(prev => ({ ...prev, tags: prev.tags.filter((_, i) => i !== index) }));

    const handleAddContributor = (c: ContributorData) => {
        setFormData(prev => ({ ...prev, contributors: [...prev.contributors, c] }));
    };

    const removeContributor = (index: number) => setFormData(prev => ({ ...prev, contributors: prev.contributors.filter((_, i) => i !== index) }));

    const updateContributorRole = (index: number, role: string) => {
        setFormData(prev => ({
            ...prev,
            contributors: prev.contributors.map((c, i) => i === index ? { ...c, role } : c)
        }));
    };

    const selectTag = (tag: TagData) => {
        if (!formData.tags.some(t => t.id === tag.id || t.name === tag.name)) {
            handleAddTag(tag);
        }
        setSelectTagOpen(false);
    };

    const selectContributor = (c: ContributorData) => {
        if (!formData.contributors.some(existing => existing.id === c.id || existing.name === c.name)) {
            handleAddContributor(c);
        }
        setSelectContribOpen(false);
    };

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        onSave(formData);
        onClose();
    };

    if (!isOpen) return null;

    // Calculate completion percentage
    const completionFields = [
        !!formData.name,
        !!formData.description,
        formData.tags.length > 0,
        formData.contributors.length > 0,
        !!formData.repoLink || !!formData.liveLink,
        formData.images.length > 0 || !!formData.icon
    ];
    const completionPercentage = Math.round((completionFields.filter(Boolean).length / completionFields.length) * 100);

    return createPortal(
        <div className={`fixed inset-0 z-[1000] flex items-center justify-center p-4 animate-fade-in ${isDark ? 'bg-black/80' : 'bg-black/60'} backdrop-blur-sm`}>
            {/* Main Modal Container */}
            <div
                className={`project-modal-container w-full max-w-[95vw] lg:max-w-[1200px] h-[95vh] rounded-xl overflow-hidden flex flex-row shadow-2xl ${isDark ? 'bg-[#0a0a0a]' : 'bg-white'} border ${isDark ? 'border-white/10' : 'border-gray-200'}`}
                style={{ animation: 'scaleIn 0.3s cubic-bezier(0.16, 1, 0.3, 1)' }}
            >
                {/* LEFT PANEL - Form (Hidden on mobile when preview is active) */}
                <div className={`project-form-left ${activeView === 'preview' ? 'hidden-mobile' : ''} min-w-0 flex-1 flex flex-col overflow-hidden ${isDark ? 'bg-[#0a0a0a]' : 'bg-gray-50'}`}>
                    {/* Header */}
                    <div className={`px-4 lg:px-8 py-4 lg:py-6 border-b ${isDark ? 'border-white/10' : 'border-gray-200'}`}
                        style={{ background: isDark ? 'linear-gradient(135deg, rgba(20, 184, 166, 0.1) 0%, rgba(99, 102, 241, 0.1) 100%)' : 'linear-gradient(135deg, rgba(20, 184, 166, 0.05) 0%, rgba(99, 102, 241, 0.05) 100%)' }}>
                        <div className="flex items-center justify-between gap-4">
                            <div className="flex items-center gap-3 lg:gap-4 flex-1">
                                <div className="relative shrink-0">
                                    <div className={`w-10 h-10 lg:w-12 lg:h-12 rounded-lg flex items-center justify-center shadow-lg`}
                                        style={{ background: 'linear-gradient(135deg, #3395ff 0%, rgb(99, 102, 241) 100%)' }}>
                                        <Edit className="text-white" size={window.innerWidth < 1024 ? 20 : 24} />
                                    </div>
                                </div>
                                <div className="min-w-0 flex-1">
                                    <h2 className={`text-lg lg:text-2xl font-bold truncate ${isDark ? 'text-white' : 'text-gray-900'}`}>
                                        {initialData ? 'Edit Project' : 'Create Project'}
                                    </h2>
                                    <p className={`text-xs lg:text-sm font-semibold ${isDark ? 'text-gray-400' : 'text-gray-600'}`}>
                                        {completionPercentage}% Complete
                                    </p>
                                </div>

                                {/* Mobile View Toggle */}
                                <div className="project-mobile-toggle flex">
                                    <button
                                        onClick={() => setActiveView('preview')}
                                        className={`px-3 py-2 text-xs font-bold uppercase rounded-lg transition-all duration-300 flex items-center gap-2 ${isDark ? 'bg-white/10 text-gray-400 hover:bg-white/20' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
                                    >
                                        <Eye size={14} />
                                        Preview
                                    </button>
                                </div>
                            </div>
                            <button
                                onClick={onClose}
                                className={`shrink-0 w-8 h-8 lg:w-10 lg:h-10 rounded-lg flex items-center justify-center transition-all ${isDark ? 'hover:bg-white/10 text-gray-400 hover:text-white' : 'hover:bg-gray-200 text-gray-500 hover:text-gray-900'}`}
                            >
                                <X size={20} />
                            </button>
                        </div>

                        {/* Progress Bar */}
                        <div className={`mt-3 h-1.5 rounded-full overflow-hidden ${isDark ? 'bg-white/5' : 'bg-gray-200'}`}>
                            <div
                                className="h-full transition-all duration-500 ease-out"
                                style={{ width: `${completionPercentage}%`, background: 'linear-gradient(135deg, #3395ff 0%, rgb(99, 102, 241) 100%)' }}
                            />
                        </div>
                    </div>

                    {/* Form Content */}
                    <div className="flex-1 overflow-y-auto px-4 lg:px-8 py-6 custom-scrollbar">
                        <form id="projectForm" onSubmit={handleSubmit} className="flex flex-col gap-6">
                            {/* Basic Info Card */}
                            <div className="dashboard-card shadow-lg">
                                <div className="dashboard-section-header">
                                    <div className="dashboard-section-number" style={{ backgroundColor: isDark ? 'rgba(20, 184, 166, 0.2)' : 'rgba(20, 184, 166, 0.15)', color: '#14b8a6' }}>
                                        <span>1</span>
                                    </div>
                                    <h3 className={`text-base lg:text-lg font-bold ${isDark ? 'text-white' : 'text-gray-900'}`}>Basic Information</h3>
                                </div>

                                <div className="flex flex-col gap-6">
                                    <div className="grid grid-cols-1 gap-4">
                                        <div>
                                            <label className="dashboard-label">Project Name *</label>
                                            <input
                                                type="text"
                                                name="name"
                                                value={formData.name}
                                                onChange={handleInputChange}
                                                placeholder="My Awesome Project"
                                                className="dashboard-input"
                                                required
                                            />
                                        </div>
                                    </div>

                                    <div>
                                        <label className="dashboard-label">Description *</label>
                                        <textarea
                                            name="description"
                                            value={formData.description}
                                            onChange={handleInputChange}
                                            placeholder="Describe your project in a few sentences..."
                                            className="dashboard-textarea"
                                            required
                                        />
                                    </div>

                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                        <div>
                                            <label className="dashboard-label">
                                                <Github size={14} className="inline mr-1" />
                                                Repository Link
                                            </label>
                                            <input
                                                type="url"
                                                name="repoLink"
                                                value={formData.repoLink}
                                                onChange={handleInputChange}
                                                placeholder="https://github.com/..."
                                                className="dashboard-input"
                                            />
                                        </div>
                                        <div>
                                            <label className="dashboard-label">
                                                <ExternalLink size={14} className="inline mr-1" />
                                                Live Link
                                            </label>
                                            <input
                                                type="url"
                                                name="liveLink"
                                                value={formData.liveLink}
                                                onChange={handleInputChange}
                                                placeholder="https://..."
                                                className="dashboard-input"
                                            />
                                        </div>
                                        <div>
                                            <label className="dashboard-label">
                                                <Upload size={14} className="inline mr-1" />
                                                Download Link
                                            </label>
                                            <input
                                                type="url"
                                                name="downloadLink"
                                                value={formData.downloadLink}
                                                onChange={handleInputChange}
                                                placeholder="https://..."
                                                className="dashboard-input"
                                            />
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* Media Card */}
                            <div className="dashboard-card shadow-lg">
                                <div className="dashboard-section-header">
                                    <div className="dashboard-section-number" style={{ backgroundColor: isDark ? 'rgba(99, 102, 241, 0.2)' : 'rgba(99, 102, 241, 0.15)', color: 'rgb(99, 102, 241)' }}>
                                        <span>2</span>
                                    </div>
                                    <h3 className={`text-base lg:text-lg font-bold ${isDark ? 'text-white' : 'text-gray-900'}`}>Media & Assets</h3>
                                </div>

                                <div className="flex flex-col gap-6">
                                    {/* Icon Upload */}
                                    <div>
                                        <label className="dashboard-label">Project Icon</label>
                                        <div className="flex items-center gap-4">
                                            <div
                                                onClick={() => iconInputRef.current?.click()}
                                                className={`w-16 h-16 rounded-lg overflow-hidden cursor-pointer group relative border-2 border-dashed transition-all`}
                                                style={{ borderColor: isDark ? 'rgba(255,255,255,0.2)' : 'rgba(0,0,0,0.1)', backgroundColor: isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.02)' }}
                                            >
                                                {formData.icon ? (
                                                    <img
                                                        src={typeof formData.icon === 'string' ? formData.icon : URL.createObjectURL(formData.icon)}
                                                        className="w-full h-full object-cover"
                                                        alt="Icon"
                                                    />
                                                ) : (
                                                    <div className="w-full h-full flex items-center justify-center">
                                                        <Upload size={20} className={isDark ? 'text-gray-600' : 'text-gray-400'} />
                                                    </div>
                                                )}
                                                <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                                                    <Upload size={16} className="text-white" />
                                                </div>
                                            </div>
                                            <div className="flex-1">
                                                <p className={`text-sm font-medium ${isDark ? 'text-white' : 'text-gray-900'}`}>Upload icon</p>
                                                <p className={`text-xs ${isDark ? 'text-gray-500' : 'text-gray-500'}`}>Square, min 400x400px</p>
                                            </div>
                                            <input ref={iconInputRef} type="file" accept="image/*" onChange={handleIconChange} className="hidden" />
                                        </div>
                                    </div>

                                    {/* Gallery Upload */}
                                    <div>
                                        <label className="dashboard-label">Project Gallery</label>
                                        {formData.images.length > 0 ? (
                                            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                                                {formData.images.map((file, idx) => (
                                                    <div key={idx} className={`aspect-video rounded-lg overflow-hidden relative group ${isDark ? 'bg-white/5' : 'bg-gray-100'}`}>
                                                        {isVideo(file) ? (
                                                            <video
                                                                src={typeof file === 'string' ? file : URL.createObjectURL(file)}
                                                                className="w-full h-full object-cover"
                                                            />
                                                        ) : (
                                                            <img
                                                                src={typeof file === 'string' ? file : URL.createObjectURL(file)}
                                                                className="w-full h-full object-cover"
                                                                alt={`Gallery ${idx + 1}`}
                                                            />
                                                        )}
                                                        <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                                                            <button
                                                                type="button"
                                                                onClick={() => removeFile(idx)}
                                                                className="w-8 h-8 rounded-lg bg-red-500 hover:bg-red-600 flex items-center justify-center transition-colors"
                                                            >
                                                                <Trash2 size={16} className="text-white" />
                                                            </button>
                                                        </div>
                                                    </div>
                                                ))}
                                                <button
                                                    type="button"
                                                    onClick={() => imagesInputRef.current?.click()}
                                                    className={`aspect-video rounded-lg border-2 border-dashed flex items-center justify-center transition-all hover:border-[#3395ff]`}
                                                    style={{ borderColor: isDark ? 'rgba(255,255,255,0.2)' : 'rgba(0,0,0,0.15)' }}
                                                >
                                                    <Plus size={24} className={isDark ? 'text-gray-500' : 'text-gray-400'} />
                                                </button>
                                            </div>
                                        ) : (
                                            <button
                                                type="button"
                                                onClick={() => imagesInputRef.current?.click()}
                                                className={`w-full py-8 rounded-lg border-2 border-dashed flex flex-col items-center justify-center gap-2 transition-all hover:border-[#3395ff]`}
                                                style={{ borderColor: isDark ? 'rgba(255,255,255,0.2)' : 'rgba(0,0,0,0.15)' }}
                                            >
                                                <ImageIcon size={28} className={isDark ? 'text-gray-600' : 'text-gray-400'} />
                                                <p className={`text-sm font-medium ${isDark ? 'text-white' : 'text-gray-900'}`}>Click to upload</p>
                                                <p className={`text-xs ${isDark ? 'text-gray-500' : 'text-gray-500'}`}>PNG, JPG, GIF, MP4 up to 50MB</p>
                                            </button>
                                        )}
                                        <input ref={imagesInputRef} type="file" multiple accept="image/*,video/*" onChange={handleFileChange} className="hidden" />
                                    </div>
                                </div>
                            </div>

                            {/* Tech Stack Card */}
                            <div className="dashboard-card shadow-lg">
                                <div className="dashboard-section-header">
                                    <div className="dashboard-section-number" style={{ backgroundColor: isDark ? 'rgba(16, 185, 129, 0.2)' : 'rgba(16, 185, 129, 0.15)', color: 'rgb(16, 185, 129)' }}>
                                        <span>3</span>
                                    </div>
                                    <h3 className={`text-base lg:text-lg font-bold ${isDark ? 'text-white' : 'text-gray-900'}`}>Tech Stack</h3>
                                </div>

                                <div className="flex flex-wrap gap-2">
                                    {formData.tags.map((tag, idx) => (
                                        <div
                                            key={idx}
                                            className={`inline-flex items-center gap-2 px-3 py-2 rounded-lg ${isDark ? 'bg-white/10 border border-white/20' : 'bg-gray-100 border border-gray-200'} group hover:scale-105 transition-all`}
                                        >
                                            {tag.iconSvg && (
                                                tag.iconSvg.startsWith('http') || tag.iconSvg.startsWith('data:image') ? (
                                                    <img src={tag.iconSvg} className="w-4 h-4 object-contain" alt={tag.name} />
                                                ) : (
                                                    <span className="w-4 h-4 flex items-center justify-center" dangerouslySetInnerHTML={{ __html: tag.iconSvg }} />
                                                )
                                            )}
                                            <span className={`text-sm font-medium ${isDark ? 'text-white' : 'text-gray-900'}`}>{tag.name}</span>
                                            <button
                                                type="button"
                                                onClick={() => removeTag(idx)}
                                                className={`ml-1 opacity-0 group-hover:opacity-100 transition-opacity ${isDark ? 'text-gray-400 hover:text-red-400' : 'text-gray-500 hover:text-red-500'}`}
                                            >
                                                <X size={14} />
                                            </button>
                                        </div>
                                    ))}
                                    <button
                                        type="button"
                                        onClick={() => setSelectTagOpen(true)}
                                        className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg border-2 border-dashed transition-all hover:border-[#3395ff]`}
                                        style={{ borderColor: isDark ? 'rgba(255,255,255,0.2)' : 'rgba(0,0,0,0.15)' }}
                                    >
                                        <Plus size={16} />
                                        <span className="text-sm font-medium">Add Tech</span>
                                    </button>
                                </div>
                            </div>

                            {/* Team Card */}
                            <div className="dashboard-card shadow-lg">
                                <div className="dashboard-section-header">
                                    <div className="dashboard-section-number" style={{ backgroundColor: isDark ? 'rgba(245, 158, 11, 0.2)' : 'rgba(245, 158, 11, 0.15)', color: 'rgb(245, 158, 11)' }}>
                                        <span>4</span>
                                    </div>
                                    <h3 className={`text-base lg:text-lg font-bold ${isDark ? 'text-white' : 'text-gray-900'}`}>Team Members</h3>
                                </div>

                                <div className="flex flex-col gap-3">
                                    {formData.contributors.map((contrib, idx) => (
                                        <div
                                            key={idx}
                                            className={`flex items-center gap-3 p-3 rounded-lg ${isDark ? 'bg-white/5 border border-white/10' : 'bg-gray-50 border border-gray-200'} group`}
                                        >
                                            {contrib.image ? (
                                                <img
                                                    src={typeof contrib.image === 'string' ? contrib.image : URL.createObjectURL(contrib.image)}
                                                    className="w-10 h-10 rounded-lg object-cover"
                                                    alt={contrib.name}
                                                />
                                            ) : (
                                                <div className="w-10 h-10 rounded-lg flex items-center justify-center text-white font-bold"
                                                    style={{ background: 'linear-gradient(135deg, #3395ff 0%, rgb(99, 102, 241) 100%)' }}>
                                                    {contrib.name.charAt(0)}
                                                </div>
                                            )}
                                            <div className="flex-1 min-w-0">
                                                <p className={`font-semibold text-sm ${isDark ? 'text-white' : 'text-gray-900'}`}>{contrib.name}</p>
                                                <input
                                                    type="text"
                                                    value={contrib.role}
                                                    onChange={(e) => updateContributorRole(idx, e.target.value)}
                                                    placeholder="Role in project..."
                                                    className="dashboard-input text-xs py-1 mt-1"
                                                />
                                            </div>
                                            <button
                                                type="button"
                                                onClick={() => removeContributor(idx)}
                                                className={`opacity-0 group-hover:opacity-100 transition-opacity ${isDark ? 'text-gray-500 hover:text-red-400' : 'text-gray-400 hover:text-red-500'}`}
                                            >
                                                <X size={18} />
                                            </button>
                                        </div>
                                    ))}
                                    <button
                                        type="button"
                                        onClick={() => setSelectContribOpen(true)}
                                        className={`py-3 rounded-lg border-2 border-dashed flex items-center justify-center gap-2 transition-all hover:border-[#3395ff]`}
                                        style={{ borderColor: isDark ? 'rgba(255,255,255,0.2)' : 'rgba(0,0,0,0.15)' }}
                                    >
                                        <Plus size={18} />
                                        <span className="font-medium text-sm">Add Member</span>
                                    </button>
                                </div>
                            </div>
                        </form>
                    </div>

                    {/* Footer */}
                    <div className={`px-4 lg:px-8 py-4 border-t ${isDark ? 'border-white/10 bg-black/20' : 'border-gray-200 bg-gray-50'}`}>
                        <div className="flex items-center justify-between gap-3">
                            <button
                                type="button"
                                onClick={onClose}
                                className="btn btn-secondary px-4 py-2 text-sm font-bold"
                            >
                                Cancel
                            </button>
                            <button
                                type="submit"
                                form="projectForm"
                                className="btn btn-primary px-6 py-2 shadow-lg hover:scale-105 text-sm font-bold"
                                style={{ background: 'linear-gradient(135deg, #3395ff 0%, rgb(99, 102, 241) 100%)' }}
                            >
                                {initialData ? 'Update' : 'Create'} Project
                            </button>
                        </div>
                    </div>
                </div>

                {/* RIGHT PANEL - Live Preview */}
                <div className={`project-form-right ${activeView === 'edit' ? 'hidden-mobile' : ''} flex-col border-l min-w-0 ${isDark ? 'border-white/10 bg-[#080808]' : 'border-gray-200 bg-gray-100'}`}>
                    <div className={`px-4 lg:px-6 py-4 border-b ${isDark ? 'border-white/10' : 'border-gray-200'} flex items-center justify-between`}>
                        <div className="flex items-center gap-3">
                            <div className={`w-8 h-8 rounded-lg flex items-center justify-center`}
                                style={{ background: 'linear-gradient(135deg, #3395ff 0%, rgb(99, 102, 241) 100%)' }}>
                                <Eye className="text-white" size={16} />
                            </div>
                            <h3 className={`text-xs lg:text-sm font-bold uppercase tracking-wider ${isDark ? 'text-gray-400' : 'text-gray-700'}`}>
                                Live Preview
                            </h3>
                        </div>
                        {activeView === 'preview' && (
                            <div className="project-preview-edit-btn flex">
                                <button
                                    onClick={() => setActiveView('edit')}
                                    className="px-3 py-2 text-xs font-bold uppercase rounded-lg transition-all duration-300 flex items-center gap-2 bg-blue-500 text-white hover:scale-105"
                                >
                                    <Edit size={14} />
                                    Edit
                                </button>
                            </div>
                        )}
                    </div>

                    <div className="flex-1 overflow-y-auto p-4 lg:p-6 flex items-center justify-center bg-dots-pattern">
                        <div className="w-full max-w-sm transform scale-90 sm:scale-95 lg:scale-100">
                            <LiveProjectCard project={formData} isDark={isDark} />
                        </div>
                    </div>
                </div>
            </div>

            {/* Selection Modals */}
            {selectTagOpen && (
                <div className="fixed inset-0 z-[2100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm" onClick={() => setSelectTagOpen(false)}>
                    <div
                        className={`select-modal-content w-full max-w-2xl rounded-lg p-6 ${isDark ? 'bg-[#0a0a0a] border border-white/10' : 'bg-white border border-gray-200'} shadow-2xl`}
                        onClick={(e) => e.stopPropagation()}
                    >
                        <div className="flex items-center justify-between mb-2">
                            <h3 className={`text-xl font-bold ${isDark ? 'text-white' : 'text-gray-900'}`}>Select Tech Stack</h3>
                            <button onClick={() => setSelectTagOpen(false)} className={`p-2 rounded-lg ${isDark ? 'hover:bg-white/10' : 'hover:bg-gray-100'}`}>
                                <X size={20} />
                            </button>
                        </div>
                        <div className="grid grid-cols-2 md:grid-cols-3 gap-3 max-h-[60vh] overflow-y-auto">
                            {availableTags.map((tag) => (
                                <button
                                    key={tag.id}
                                    type="button"
                                    onClick={() => selectTag(tag)}
                                    className={`p-4 rounded-lg border text-left transition-all hover:border-[#3395ff]`}
                                    style={{ borderColor: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)' }}
                                >
                                    <div className="flex items-center gap-3">
                                        {tag.iconSvg && (
                                            tag.iconSvg.startsWith('http') || tag.iconSvg.startsWith('data:image') ? (
                                                <img src={tag.iconSvg} className="w-8 h-8 object-contain" alt={tag.name} />
                                            ) : (
                                                <span className="w-8 h-8 flex items-center justify-center" dangerouslySetInnerHTML={{ __html: tag.iconSvg }} />
                                            )
                                        )}
                                        <span className={`font-semibold ${isDark ? 'text-white' : 'text-gray-900'}`}>{tag.name}</span>
                                    </div>
                                </button>
                            ))}
                        </div>
                    </div>
                </div>
            )}

            {selectContribOpen && (
                <div className="fixed inset-0 z-[2100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm" onClick={() => setSelectContribOpen(false)}>
                    <div
                        className={`select-modal-content w-full max-w-2xl rounded-lg p-6 ${isDark ? 'bg-[#0a0a0a] border border-white/10' : 'bg-white border border-gray-200'} shadow-2xl`}
                        onClick={(e) => e.stopPropagation()}
                    >
                        <div className="flex items-center justify-between mb-2">
                            <h3 className={`text-xl font-bold ${isDark ? 'text-white' : 'text-gray-900'}`}>Select Contributors</h3>
                            <button onClick={() => setSelectContribOpen(false)} className={`p-2 rounded-lg ${isDark ? 'hover:bg-white/10' : 'hover:bg-gray-100'}`}>
                                <X size={20} />
                            </button>
                        </div>
                        <div className="grid gap-3 max-h-[60vh] overflow-y-auto">
                            {availableContributors.map((contrib) => (
                                <button
                                    key={contrib.id}
                                    type="button"
                                    onClick={() => selectContributor(contrib)}
                                    className={`flex items-center gap-4 p-4 rounded-lg border text-left transition-all hover:border-[#3395ff]`}
                                    style={{ borderColor: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)' }}
                                >
                                    <img src={contrib.image as string} className="w-12 h-12 rounded-lg object-cover" alt="" />
                                    <div>
                                        <p className={`font-semibold ${isDark ? 'text-white' : 'text-gray-900'}`}>{contrib.name}</p>
                                        <p className={`text-sm ${isDark ? 'text-gray-400' : 'text-gray-600'}`}>{contrib.role}</p>
                                    </div>
                                </button>
                            ))}
                        </div>
                    </div>
                </div>
            )}

            <style>{`
                @keyframes scaleIn {
                    from { opacity: 0; transform: scale(0.95); }
                    to { opacity: 1; transform: scale(1); }
                }
                .custom-scrollbar::-webkit-scrollbar { width: 8px; }
                .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
                .custom-scrollbar::-webkit-scrollbar-thumb {
                    background-color: ${isDark ? 'rgba(255,255,255,0.2)' : 'rgba(0,0,0,0.2)'};
                    border-radius: 20px;
                }
            `}</style>
        </div>,
        document.body
    );
};

// Live Preview Component
const LiveProjectCard = ({ project, isDark }: { project: ProjectFormData; isDark: boolean }) => {
    const [currentImageIndex, setCurrentImageIndex] = useState(0);
    const [showContributors, setShowContributors] = useState(false);

    const sortedImages = [...project.images].sort((a, b) => {
        const isVidA = typeof a === 'string'
            ? (a.split('?')[0].toLowerCase().match(/\.(mp4|webm|ogg|mov)$/) || a.includes('/videos/'))
            : a.type.startsWith('video/');
        const isVidB = typeof b === 'string'
            ? (b.split('?')[0].toLowerCase().match(/\.(mp4|webm|ogg|mov)$/) || b.includes('/videos/'))
            : b.type.startsWith('video/');
        if (isVidA && !isVidB) return -1;
        if (!isVidA && isVidB) return 1;
        return 0;
    });

    useEffect(() => {
        if (sortedImages.length > 1) {
            const interval = setInterval(() => {
                setCurrentImageIndex((prev) => (prev + 1) % sortedImages.length);
            }, 3000);
            return () => clearInterval(interval);
        }
    }, [sortedImages.length]);

    useEffect(() => {
        const interval = setInterval(() => {
            setShowContributors(prev => !prev);
        }, 3000);
        return () => clearInterval(interval);
    }, []);

    const visibleStack = project.tags.slice(0, 2);
    const remainingStackCount = project.tags.length - 2;

    return (
        <div
            className="group flex flex-col w-full max-w-sm"
            style={{
                backgroundColor: 'var(--card-bg)',
                backdropFilter: 'blur(16px)',
                WebkitBackdropFilter: 'blur(16px)',
                borderRadius: '20px',
                overflow: 'hidden',
                boxShadow: 'var(--card-shadow)',
                border: `1px solid ${isDark ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.05)'}`,
                transition: 'all 0.3s ease',
            }}
        >
            {/* Image Section */}
            <div style={{ position: 'relative', height: '200px', overflow: 'hidden' }}>
                {sortedImages.length > 0 ? (
                    sortedImages.map((img, i) => {
                        const isVid = typeof img === 'string'
                            ? (img.split('?')[0].toLowerCase().match(/\.(mp4|webm|ogg|mov)$/) || img.includes('/videos/'))
                            : img.type.startsWith('video/');

                        return isVid ? (
                            <video
                                key={i}
                                src={typeof img === 'string' ? img : URL.createObjectURL(img)}
                                muted
                                autoPlay
                                loop
                                playsInline
                                style={{
                                    position: 'absolute',
                                    top: 0,
                                    left: 0,
                                    width: '100%',
                                    height: '100%',
                                    objectFit: 'cover',
                                    opacity: i === currentImageIndex ? 1 : 0,
                                    transition: 'opacity 0.5s ease, transform 0.5s ease',
                                }}
                            />
                        ) : (
                            <img
                                key={i}
                                src={typeof img === 'string' ? img : URL.createObjectURL(img)}
                                alt={project.name}
                                style={{
                                    position: 'absolute',
                                    top: 0,
                                    left: 0,
                                    width: '100%',
                                    height: '100%',
                                    objectFit: 'cover',
                                    opacity: i === currentImageIndex ? 1 : 0,
                                    transition: 'opacity 0.5s ease, transform 0.5s ease',
                                }}
                            />
                        );
                    })
                ) : (
                    <div className={`w-full h-full flex items-center justify-center ${isDark ? 'bg-white/5' : 'bg-gray-100'}`}>
                        <ImageIcon size={48} className={isDark ? 'text-gray-600' : 'text-gray-400'} />
                    </div>
                )}

                <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent opacity-60"></div>

                <div className="absolute top-[15px] left-[15px] w-[calc(100%-30px)] h-[40px] overflow-hidden pointer-events-none">
                    {/* Stack Container */}
                    <div
                        style={{
                            position: 'absolute',
                            top: 0,
                            left: 0,
                            display: 'flex',
                            alignItems: 'center',
                            gap: '8px',
                            opacity: showContributors ? 0 : 1,
                            transform: showContributors ? 'translateY(-20px)' : 'translateY(0)',
                            transition: 'opacity 0.5s ease, transform 0.5s ease'
                        }}
                    >
                        {visibleStack.map((tech, i) => (
                            <span key={i} style={{
                                padding: '6px 14px',
                                backgroundColor: tech.color ? `${tech.color}40` : 'rgba(59, 130, 246, 0.25)',
                                color: 'white',
                                borderRadius: '20px',
                                fontSize: '0.75rem',
                                fontWeight: 600,
                                backdropFilter: 'blur(12px)',
                                WebkitBackdropFilter: 'blur(12px)',
                                border: `1px solid ${tech.color ? tech.color : 'rgba(255, 255, 255, 0.2)'}`,
                                boxShadow: '0 4px 6px rgba(0, 0, 0, 0.1)',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '6px'
                            }}>
                                {tech.iconSvg && (
                                    tech.iconSvg.startsWith('http') || tech.iconSvg.startsWith('data:image') ? (
                                        <img src={tech.iconSvg} className="w-3.5 h-3.5 object-contain" alt={tech.name} />
                                    ) : (
                                        <span className="w-3.5 h-3.5 flex items-center justify-center"
                                            style={{ filter: 'brightness(0) invert(1)' }}
                                            dangerouslySetInnerHTML={{ __html: tech.iconSvg }} />
                                    )
                                )}
                                {tech.name}
                            </span>
                        ))}
                        {remainingStackCount > 0 && (
                            <span style={{
                                padding: '6px 14px',
                                backgroundColor: 'rgba(0, 0, 0, 0.4)',
                                color: 'white',
                                borderRadius: '20px',
                                fontSize: '0.75rem',
                                fontWeight: 600,
                                backdropFilter: 'blur(12px)',
                                WebkitBackdropFilter: 'blur(12px)',
                                border: '1px solid rgba(255, 255, 255, 0.1)'
                            }}>
                                +{remainingStackCount}
                            </span>
                        )}
                    </div>

                    {/* Contributors Container */}
                    <div
                        style={{
                            position: 'absolute',
                            top: 0,
                            left: 0,
                            display: 'flex',
                            alignItems: 'center',
                            gap: '8px',
                            opacity: showContributors ? 1 : 0,
                            transform: showContributors ? 'translateY(0)' : 'translateY(20px)',
                            transition: 'opacity 0.5s ease, transform 0.5s ease',
                            pointerEvents: 'auto'
                        }}
                    >
                        <span style={{
                            padding: '6px 14px',
                            backgroundColor: 'rgba(0, 0, 0, 0.4)',
                            color: 'white',
                            borderRadius: '20px',
                            fontSize: '0.75rem',
                            fontWeight: 600,
                            backdropFilter: 'blur(12px)',
                            WebkitBackdropFilter: 'blur(12px)',
                            border: '1px solid rgba(255, 255, 255, 0.1)',
                            marginRight: '4px',
                            boxShadow: '0 4px 6px rgba(0, 0, 0, 0.1)'
                        }}>
                            Contributors
                        </span>
                        <div className="flex ml-1">
                            {project.contributors.slice(0, 3).map((contributor, i) => (
                                <div key={i} className={`w-8 h-8 rounded-full overflow-hidden border-2 border-white/80 shadow-sm bg-gray-200 ${i > 0 ? '-ml-4' : ''}`} style={{ transform: `translateX(${i * -12}px)` }}>
                                    {typeof contributor.image === 'string' ? (
                                        <img src={contributor.image} alt={contributor.name} className="w-full h-full object-cover" />
                                    ) : (
                                        <div className="w-full h-full flex items-center justify-center bg-blue-500 text-white text-xs font-bold">
                                            {contributor.name.charAt(0)}
                                        </div>
                                    )}
                                </div>
                            ))}
                            {project.contributors.length > 3 && (
                                <div className="w-8 h-8 rounded-full overflow-hidden border-2 border-white/80 shadow-sm bg-gray-800 text-white flex items-center justify-center text-[10px] font-bold -ml-4" style={{ transform: `translateX(-36px)` }}>
                                    +{project.contributors.length - 3}
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            </div>

            {/* Content Section */}
            <div style={{ padding: '24px', flex: 1, display: 'flex', flexDirection: 'column' }}>
                <h3 className="font-inter font-extrabold text-2xl mb-2 text-[var(--text-primary)]">
                    {project.name || 'Untitled Project'}
                </h3>
                <p className="font-inter text-base text-[var(--text-secondary)] leading-relaxed flex-1 line-clamp-3">
                    {project.description || 'Project description will appear here...'}
                </p>

                {/* Links */}
                {(project.repoLink || project.liveLink) && (
                    <div className="mt-6 flex gap-3">
                        {project.repoLink && (
                            <div className="flex items-center gap-2 text-sm font-semibold text-blue-500">
                                <Github size={16} /> Code
                            </div>
                        )}
                        {project.liveLink && (
                            <div className="flex items-center gap-2 text-sm font-semibold text-green-500">
                                <ExternalLink size={16} /> Live
                            </div>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
};

export default MProjectForm;
