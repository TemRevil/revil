import React, { useState, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Folder, FileImage, ChevronRight, ChevronLeft, Search } from 'lucide-react';
import { ref, listAll, getDownloadURL } from 'firebase/storage';
import { storage } from '../../lib/firebase';

const Spinner = () => (
    <div className="flex flex-col items-center gap-3">
        <div className="relative w-10 h-10">
            <div className="absolute inset-0 border-4 border-blue-500/20 rounded-full"></div>
            <div className="absolute inset-0 border-4 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
        </div>
        <span className="text-[10px] font-bold text-blue-500/80 uppercase tracking-widest animate-pulse">Syncing...</span>
    </div>
);

interface FirebaseFile {
    name: string;
    fullPath: string;
    url?: string;
    isFolder: boolean;
}

interface MFirebaseStorageProps {
    isOpen: boolean;
    onClose: () => void;
    onSelect: (url: string, name: string) => void;
    fileTypes?: string[]; // e.g. ['svg', 'png', 'jpg']
    title?: string;
}

const MFirebaseStorage = ({ isOpen, onClose, onSelect, fileTypes = ['svg', 'png', 'jpg', 'jpeg', 'gif', 'webp'], title = 'Select from Firebase Storage' }: MFirebaseStorageProps) => {
    const [isLoading, setIsLoading] = useState(false);
    const [currentPath, setCurrentPath] = useState('');
    const [files, setFiles] = useState<FirebaseFile[]>([]);
    const [searchQuery, setSearchQuery] = useState('');
    const [isDark, setIsDark] = useState(false);
    const [selectedFile, setSelectedFile] = useState<FirebaseFile | null>(null);
    const [previewUrl, setPreviewUrl] = useState<string | null>(null);

    useEffect(() => {
        const checkTheme = () => setIsDark(document.documentElement.classList.contains('dark'));
        checkTheme();
        const observer = new MutationObserver(checkTheme);
        observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
        return () => observer.disconnect();
    }, []);

    const fileTypesKey = fileTypes.join(',');
    const memoizedFileTypes = useMemo(() => fileTypes, [fileTypesKey]); // eslint-disable-line react-hooks/exhaustive-deps

    useEffect(() => {
        if (!isOpen) return;

        let cancelled = false;

        const load = async (path: string) => {
            setIsLoading(true);
            try {
                // Use empty string for root path (no leading slash)
                const folderRef = ref(storage, path || '');
                const result = await listAll(folderRef);

                // Prepare folder entries
                const folders: FirebaseFile[] = result.prefixes.map(folder => ({
                    name: folder.name,
                    fullPath: folder.fullPath,
                    isFolder: true
                }));

                // Prepare fetch promises for files (parallel)
                const filePromises = result.items.map(async (item) => {
                    const extension = item.name.split('.').pop()?.toLowerCase() || '';
                    if (memoizedFileTypes.length > 0 && !memoizedFileTypes.includes(extension)) return null;
                    try {
                        const url = await getDownloadURL(item);
                        return {
                            name: item.name,
                            fullPath: item.fullPath,
                            url,
                            isFolder: false
                        } as FirebaseFile;
                    } catch {
                        // If getting a URL fails for a single file, continue without it
                        return null;
                    }
                });

                const resolved = await Promise.all(filePromises);
                if (cancelled) return;

                const filesList: FirebaseFile[] = [
                    ...folders,
                    ...resolved.filter((f): f is FirebaseFile => f !== null)
                ];

                if (!cancelled) setFiles(filesList);
            } catch (err) {
                console.error('Error loading files:', err);
                if (!cancelled) setFiles([]);
            } finally {
                if (!cancelled) setIsLoading(false);
            }
        };

        load(currentPath);

        return () => {
            cancelled = true;
        };
    }, [isOpen, currentPath, memoizedFileTypes]);

    const handleFolderClick = (path: string) => {
        setCurrentPath(path);
        setSelectedFile(null);
        setPreviewUrl(null);
    };

    const handleFileClick = async (file: FirebaseFile) => {
        if (file.isFolder) {
            handleFolderClick(file.fullPath);
        } else {
            setSelectedFile(file);
            setPreviewUrl(file.url || null);
        }
    };

    const handleGoBack = () => {
        const parts = currentPath.split('/').filter(Boolean);
        parts.pop();
        setCurrentPath(parts.join('/'));
        setSelectedFile(null);
        setPreviewUrl(null);
    };

    const handleSelect = () => {
        if (selectedFile && selectedFile.url) {
            onSelect(selectedFile.url, selectedFile.name);
            onClose();
        }
    };

    const filteredFiles = searchQuery
        ? files.filter(f => f.name.toLowerCase().includes(searchQuery.toLowerCase()))
        : files;

    if (!isOpen) return null;

    const pathParts = currentPath.split('/').filter(Boolean);

    return createPortal(
        <div className="modal-backdrop open animate-fade-in" style={{ zIndex: 1300 }}>
            <div
                className="modal-content glass-panel animate-scale-in transition-all duration-300 ease-in-out"
                style={{
                    maxWidth: '700px',
                    maxHeight: '80vh',
                    display: 'flex',
                    flexDirection: 'column',
                    height: selectedFile && !selectedFile.isFolder ? 'auto' : '600px' // Dynamic height with transition
                }}
            >
                {/* Header */}
                <div className="modal-header" style={{ borderBottom: `1px solid ${isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)'}` }}>
                    <div className="flex items-center gap-3">
                        <div className="icon-box icon-box-md" style={{ background: 'linear-gradient(135deg, #FFCA28 0%, #FFA000 100%)' }}>
                            <svg viewBox="0 0 24 24" width="24" height="24" fill="white">
                                <path d="M3.89 15.673L6.255.461A.542.542 0 0 1 7.27.289l2.543 4.771zm16.794 3.692l-2.25-14a.54.54 0 0 0-.919-.295L3.316 19.365l7.856 4.427a1.621 1.621 0 0 0 1.588 0zM14.3 7.148l-1.82-3.482a.542.542 0 0 0-.96 0L3.53 17.984z" />
                            </svg>
                        </div>
                        <div>
                            <h2 className="heading-md">{title}</h2>
                            <div className="text-sm text-sec">Browse and select files from Firebase Storage</div>
                        </div>
                    </div>
                    <button onClick={onClose} className="btn-icon">
                        <X size={24} />
                    </button>
                </div>

                {/* Breadcrumb & Search */}
                <div className="p-4" style={{ borderBottom: `1px solid ${isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)'}` }}>
                    <div className="flex items-center gap-3 mb-3">
                        <button
                            onClick={handleGoBack}
                            disabled={!currentPath}
                            className="btn-icon"
                            style={{ opacity: currentPath ? 1 : 0.4 }}
                        >
                            <ChevronLeft size={20} />
                        </button>
                        <div className="flex items-center gap-1 flex-wrap text-sm">
                            <button
                                onClick={() => { setCurrentPath(''); setSelectedFile(null); }}
                                className="text-sec hover:text-primary transition-colors cursor-pointer bg-transparent border-none"
                            >
                                Root
                            </button>
                            {pathParts.map((part, i) => (
                                <React.Fragment key={i}>
                                    <ChevronRight size={14} className="text-sec" />
                                    <button
                                        onClick={() => setCurrentPath(pathParts.slice(0, i + 1).join('/'))}
                                        className="text-sec hover:text-primary transition-colors cursor-pointer bg-transparent border-none"
                                    >
                                        {part}
                                    </button>
                                </React.Fragment>
                            ))}
                        </div>
                    </div>
                    <div className="relative">
                        <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-sec" />
                        <input
                            type="text"
                            placeholder="Search files..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="input-field w-full"
                            style={{ paddingLeft: '40px' }}
                        />
                    </div>
                </div>

                <div className="flex-1 overflow-y-auto p-4 relative">
                    <AnimatePresence>
                        {isLoading && (
                            <motion.div
                                initial={{ opacity: 0 }}
                                animate={{ opacity: 1 }}
                                exit={{ opacity: 0 }}
                                transition={{ duration: 0.2 }}
                                className="absolute inset-0 flex items-center justify-center bg-black/[0.1] dark:bg-white/[0.05] backdrop-blur-[4px] z-10 rounded-lg"
                            >
                                <Spinner />
                            </motion.div>
                        )}
                    </AnimatePresence>

                    {filteredFiles.length === 0 && !isLoading ? (
                        <div className="text-center py-12 text-sec">
                            {searchQuery ? 'No files match your search' : 'No files in this folder'}
                        </div>
                    ) : (
                        <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))' }}>
                            {filteredFiles.map((file, i) => (
                                <div
                                    key={i}
                                    onClick={() => handleFileClick(file)}
                                    className={`p-3 rounded-lg cursor-pointer transition-all ${selectedFile?.fullPath === file.fullPath ? 'ring-2 ring-blue-500' : ''}`}
                                    style={{
                                        backgroundColor: isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.03)',
                                        border: `1px solid ${selectedFile?.fullPath === file.fullPath ? 'rgb(59, 130, 246)' : 'transparent'}`
                                    }}
                                >
                                    <div className="flex flex-col items-center gap-2">
                                        {file.isFolder ? (
                                            <Folder size={48} className="text-yellow-500" />
                                        ) : file.url ? (
                                            <div className="w-12 h-12 rounded-lg overflow-hidden flex items-center justify-center" style={{ backgroundColor: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.05)' }}>
                                                <img
                                                    src={file.url}
                                                    alt={file.name}
                                                    className="max-w-full max-h-full object-contain"
                                                    onError={(e) => {
                                                        (e.target as HTMLImageElement).style.display = 'none';
                                                    }}
                                                />
                                            </div>
                                        ) : (
                                            <FileImage size={48} className="text-sec" />
                                        )}
                                        <span className="text-xs text-center text-primary truncate w-full" title={file.name}>
                                            {file.name.length > 15 ? file.name.slice(0, 12) + '...' : file.name}
                                        </span>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                {/* Preview & Actions */}
                {selectedFile && !selectedFile.isFolder && (
                    <div className="p-4" style={{ borderTop: `1px solid ${isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)'}` }}>
                        <div className="flex items-center gap-4">
                            {previewUrl && (
                                <div className="w-16 h-16 rounded-lg overflow-hidden flex items-center justify-center" style={{ backgroundColor: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.05)' }}>
                                    <img src={previewUrl} alt="Preview" className="max-w-full max-h-full object-contain" />
                                </div>
                            )}
                            <div className="flex-1">
                                <div className="font-semibold text-primary">{selectedFile.name}</div>
                                <div className="text-xs text-sec">{selectedFile.fullPath}</div>
                            </div>
                            <button
                                onClick={handleSelect}
                                className="btn btn-primary"
                            >
                                Select
                            </button>
                        </div>
                    </div>
                )}

                {/* Close Button */}
                {(!selectedFile || selectedFile.isFolder) && (
                    <div className="p-4 flex justify-end" style={{ borderTop: `1px solid ${isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)'}` }}>
                        <button onClick={onClose} className="btn btn-secondary">
                            Cancel
                        </button>
                    </div>
                )}
            </div>
        </div>
        , document.body);
};

export default MFirebaseStorage;
