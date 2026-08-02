import { useState, useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { Plus, Trash2, Edit2, X, Save, Upload, User, Sliders, Code, Clock, HardDrive, ZoomIn, Link, Sun, Moon, Plug } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
const DEFAULT_HERO_URL = "https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?auto=format&fit=crop&w=1200&q=80";
import Cropper from 'react-easy-crop';
import MFirebaseStorage from './M-FirebaseStorage';
import { doc, onSnapshot, setDoc, updateDoc, deleteField, getDoc } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL, getMetadata, getStorage } from 'firebase/storage';
import app, { db } from '../../lib/firebase';
// Local Storage handle (lazy Dashboard chunk) - keeps firebase/storage out of eager.
const storage = getStorage(app);
import Alert, { AlertType } from '../Alert';
import MStackItem, { StackItemData } from './M-StackItem';
import DMcpPanel from './D-MCP';
import Select from '../Select';
import SaveBar from './SaveBar';
import Loader from '../reactbits/Loader';
import MConfirmModal from './M-ConfirmModal';
// Replaced failing ui-avatars.com with a local icon-based placeholder logic


interface StackItem {
    id: string;
    name: string;
    icon: string;
}


const timezones = [
    { label: 'UTC-12:00', value: -12 },
    { label: 'UTC-11:00', value: -11 },
    { label: 'UTC-10:00', value: -10 },
    { label: 'UTC-09:00', value: -9 },
    { label: 'UTC-08:00 (PST)', value: -8 },
    { label: 'UTC-07:00 (MST)', value: -7 },
    { label: 'UTC-06:00 (CST)', value: -6 },
    { label: 'UTC-05:00 (EST)', value: -5 },
    { label: 'UTC-04:00', value: -4 },
    { label: 'UTC-03:00', value: -3 },
    { label: 'UTC-02:00', value: -2 },
    { label: 'UTC-01:00', value: -1 },
    { label: 'UTC+00:00 (GMT)', value: 0 },
    { label: 'UTC+01:00 (CET)', value: 1 },
    { label: 'UTC+02:00 (EET)', value: 2 },
    { label: 'UTC+03:00 (MSK)', value: 3 },
    { label: 'UTC+04:00', value: 4 },
    { label: 'UTC+05:00', value: 5 },
    { label: 'UTC+05:30 (IST)', value: 5.5 },
    { label: 'UTC+06:00', value: 6 },
    { label: 'UTC+07:00', value: 7 },
    { label: 'UTC+08:00 (CST)', value: 8 },
    { label: 'UTC+09:00 (JST)', value: 9 },
    { label: 'UTC+10:00 (AEST)', value: 10 },
    { label: 'UTC+11:00', value: 11 },
    { label: 'UTC+12:00 (NZST)', value: 12 },
];

// Helper to create the cropped image
const createImage = (url: string, useCrossOrigin: boolean = true): Promise<HTMLImageElement> =>
    new Promise((resolve, reject) => {
        const image = new Image();
        if (useCrossOrigin && url.startsWith('http')) {
            image.setAttribute('crossOrigin', 'anonymous');
        }
        image.addEventListener('load', () => resolve(image));
        image.addEventListener('error', (error) => reject(error));
        // Add a timestamp to bypass local cache which might have stored a non-CORS response
        const cacheBuster = url.includes('?') ? `&t=${Date.now()}` : `?t=${Date.now()}`;
        const finalUrl = url.startsWith('http') ? (url + cacheBuster) : url;
        image.src = finalUrl;
    });

const getCroppedImg = (imageSrc: string, pixelCrop: unknown): Promise<File> => {
    return new Promise((resolve, reject) => {
        (async () => {
            try {
                const image = await createImage(imageSrc);

                const canvas = document.createElement('canvas');
                const ctx = canvas.getContext('2d');

                if (!ctx) {
                    reject(new Error('No 2d context'));
                    return;
                }

                const pc = pixelCrop as { width?: number; height?: number; x?: number; y?: number } | null;
                if (!pc || pc.width === undefined || pc.height === undefined || pc.width <= 0 || pc.height <= 0) {
                    reject(new Error(`Invalid crop dimensions: ${JSON.stringify(pixelCrop)}`));
                    return;
                }
                canvas.width = pc.width as number;
                canvas.height = pc.height as number;

                ctx.drawImage(
                    image,
                    pc.x as number,
                    pc.y as number,
                    pc.width as number,
                    pc.height as number,
                    0,
                    0,
                    pc.width as number,
                    pc.height as number
                );

                canvas.toBlob((blob) => {
                    if (!blob) {
                        console.error('[getCroppedImg] canvas.toBlob returned null');
                        reject(new Error('Canvas is empty'));
                        return;
                    }

                    const file = new File([blob], 'cropped.webp', { type: 'image/webp' });
                    resolve(file);
                }, 'image/webp');
            } catch (e) {
                reject(e);
            }
        })();
    });
};

/* "Projects Being Handled" is now managed in the Treasury page (D-Treasury),
   which mirrors the public subset into Settings/Availability. */


export default function DSettings() {
    const [isLoading, setIsLoading] = useState(false);

    const [activeTab, setActiveTab] = useState<'availability' | 'stack' | 'account' | 'mcp'>('availability');
    const [availability, setAvailability] = useState(75);
    const [selectedTimezone, setSelectedTimezone] = useState(2);
    const [currentTime, setCurrentTime] = useState('');

    // Stack state
    const [stackItems, setStackItems] = useState<StackItem[]>([]);
    const [stackModalOpen, setStackModalOpen] = useState(false);
    const [editingStack, setEditingStack] = useState<StackItem | null>(null);
    const [firebaseBrowserOpen, setFirebaseBrowserOpen] = useState(false);
    const [firebaseSelectTarget, setFirebaseSelectTarget] = useState<'hero' | 'heroDark' | 'profile' | null>(null);

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

    const [heroImagePreview, setHeroImagePreview] = useState<string>(DEFAULT_HERO_URL);
    const [heroImageFile, setHeroImageFile] = useState<File | null>(null);
    const [heroImageDirty, setHeroImageDirty] = useState(false);
    const heroImageInputRef = useRef<HTMLInputElement>(null);

    // Dark mode hero image
    const [heroImagePreviewDark, setHeroImagePreviewDark] = useState<string>('');
    const [heroImageFileDark, setHeroImageFileDark] = useState<File | null>(null);
    const [heroImageDirtyDark, setHeroImageDirtyDark] = useState(false);
    const heroImageInputRefDark = useRef<HTMLInputElement>(null);

    // Which hero image the single uploader is currently editing (light / dark)
    const [heroImageMode, setHeroImageMode] = useState<'light' | 'dark'>('light');

    // Max upload size for hero images (matches "Max 2MB" helper text)
    const HERO_MAX_BYTES = 2 * 1024 * 1024;

    const [profileImagePreview, setProfileImagePreview] = useState<string>('');
    const [profileImageFile, setProfileImageFile] = useState<File | null>(null);
    const profileImageInputRef = useRef<HTMLInputElement>(null);

    // Profile info state (editable)
    const [profileName, setProfileName] = useState<string>('Your Name');
    const [profileTitle, setProfileTitle] = useState<string>('Job Title');
    const [socialLinks, setSocialLinks] = useState<{ name: string; url: string }[]>([]);
    const [newLinkName, setNewLinkName] = useState('');
    const [newLinkUrl, setNewLinkUrl] = useState('');
    const [isEditingProfile, setIsEditingProfile] = useState(false);

    // For immediate revert on Cancel
    const [profileBackup, setProfileBackup] = useState<{ name: string; title: string } | null>(null);

    // Profile image resolution & size display (same behavior as hero)
    const [profileImageResolution, setProfileImageResolution] = useState<string>('');
    const [profileImageSize, setProfileImageSize] = useState<string>('');
    const [profileImageSizeLoading, setProfileImageSizeLoading] = useState(false);

    // Backup & upload state for profile image (supports immediate revert / save)
    const [profileImageBackupPreview, setProfileImageBackupPreview] = useState<string | null>(null);
    const [profileImageBackupFile, setProfileImageBackupFile] = useState<File | null>(null);
    const [profileImageDirty, setProfileImageDirty] = useState(false);
    const [profileInfoDirty, setProfileInfoDirty] = useState(false);
    const [profileImageUploading, setProfileImageUploading] = useState(false);

    // Hero image resolution & size display
    const [heroImageResolution, setHeroImageResolution] = useState<string>('');
    const [heroImageSize, setHeroImageSize] = useState<string>('');
    const [heroImageSizeLoading, setHeroImageSizeLoading] = useState(false);

    // Dark hero image resolution & size display
    const [heroImageResolutionDark, setHeroImageResolutionDark] = useState<string>('');
    const [heroImageSizeDark, setHeroImageSizeDark] = useState<string>('');
    const [heroImageSizeLoadingDark, setHeroImageSizeLoadingDark] = useState(false);

    const handleTabChange = (newTab: 'availability' | 'stack' | 'account' | 'mcp') => {
        setActiveTab(newTab);
    };

    const formatBytes = (bytes: number) => {
        if (bytes === 0) return '0 B';
        const k = 1024;
        const sizes = ['B', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    };

    const sizeFromDataUrl = (dataUrl: string) => {
        // data:[<mediatype>][;base64],<data>
        const base64 = dataUrl.split(',')[1] || '';
        const padding = (base64.match(/=+$/) || [''])[0].length;
        const base64Length = base64.length;
        const bytes = Math.round((base64Length * 3) / 4) - padding;
        return bytes;
    };

    // Clear the measured values the moment the preview changes (including to none), during
    // render rather than in the effect below - that way stale numbers from the previous
    // image never show while the new one is being measured asynchronously.
    const [measuredHeroPreview, setMeasuredHeroPreview] = useState(heroImagePreview);
    if (measuredHeroPreview !== heroImagePreview) {
        setMeasuredHeroPreview(heroImagePreview);
        setHeroImageResolution('');
        setHeroImageSize('');
    }

    useEffect(() => {
        if (!heroImagePreview) return;

        // resolution check (try without crossOrigin first to avoid noise)
        const checkRes = async () => {
            try {
                const img = await createImage(heroImagePreview, false);
                setHeroImageResolution(`${img.naturalWidth}×${img.naturalHeight}`);
            } catch {
                setHeroImageResolution('');
            }
        };
        checkRes();

        // size
        (async () => {
            setHeroImageSizeLoading(true);
            try {
                if (heroImageFile) {
                    setHeroImageSize(formatBytes(heroImageFile.size));
                } else if (heroImagePreview.startsWith('data:')) {
                    const bytes = sizeFromDataUrl(heroImagePreview);
                    setHeroImageSize(formatBytes(bytes));
                } else if (heroImagePreview.startsWith('http')) {
                    // try to get metadata which is safer than fetch() for CORS
                    try {
                        // Only try getMetadata if it looks like a Firebase URL
                        if (heroImagePreview.includes('firebasestorage.googleapis.com')) {
                            const fileRef = ref(storage, heroImagePreview);
                            const metadata = await getMetadata(fileRef);
                            setHeroImageSize(formatBytes(metadata.size));
                        } else {
                            // Fallback to fetch for non-firebase URLs
                            throw new Error('Not a firebase URL');
                        }
                    } catch {
                        // Only try fetch if getMetadata failed and it's not a local file
                        try {
                            const res = await fetch(heroImagePreview, { method: 'GET' });
                            if (res.ok) {
                                const blob = await res.blob();
                                setHeroImageSize(formatBytes(blob.size));
                            }
                        } catch {
                            setHeroImageSize('');
                        }
                    }
                } else {
                    setHeroImageSize('');
                }
            } catch {
                // ignore errors, just don't show size
                setHeroImageSize('');
            } finally {
                setHeroImageSizeLoading(false);
            }
        })();

        return () => {
        };
    }, [heroImagePreview, heroImageFile]);

    // Dark hero: resolution & size display (cleared during render, measured in the effect)
    const [measuredHeroPreviewDark, setMeasuredHeroPreviewDark] = useState(heroImagePreviewDark);
    if (measuredHeroPreviewDark !== heroImagePreviewDark) {
        setMeasuredHeroPreviewDark(heroImagePreviewDark);
        setHeroImageResolutionDark('');
        setHeroImageSizeDark('');
    }

    useEffect(() => {
        if (!heroImagePreviewDark) return;

        const checkRes = async () => {
            try {
                const img = await createImage(heroImagePreviewDark, false);
                setHeroImageResolutionDark(`${img.naturalWidth}×${img.naturalHeight}`);
            } catch {
                setHeroImageResolutionDark('');
            }
        };
        checkRes();

        (async () => {
            setHeroImageSizeLoadingDark(true);
            try {
                if (heroImageFileDark) {
                    setHeroImageSizeDark(formatBytes(heroImageFileDark.size));
                } else if (heroImagePreviewDark.startsWith('data:')) {
                    const bytes = sizeFromDataUrl(heroImagePreviewDark);
                    setHeroImageSizeDark(formatBytes(bytes));
                } else if (heroImagePreviewDark.startsWith('http')) {
                    try {
                        if (heroImagePreviewDark.includes('firebasestorage.googleapis.com')) {
                            const fileRef = ref(storage, heroImagePreviewDark);
                            const metadata = await getMetadata(fileRef);
                            setHeroImageSizeDark(formatBytes(metadata.size));
                        } else {
                            throw new Error('Not a firebase URL');
                        }
                    } catch {
                        try {
                            const res = await fetch(heroImagePreviewDark, { method: 'GET' });
                            if (res.ok) {
                                const blob = await res.blob();
                                setHeroImageSizeDark(formatBytes(blob.size));
                            }
                        } catch {
                            setHeroImageSizeDark('');
                        }
                    }
                } else {
                    setHeroImageSizeDark('');
                }
            } catch {
                setHeroImageSizeDark('');
            } finally {
                setHeroImageSizeLoadingDark(false);
            }
        })();
    }, [heroImagePreviewDark, heroImageFileDark]);

    // profile image resolution & size (cleared during render, measured in the effect)
    const [measuredProfilePreview, setMeasuredProfilePreview] = useState(profileImagePreview);
    if (measuredProfilePreview !== profileImagePreview) {
        setMeasuredProfilePreview(profileImagePreview);
        setProfileImageResolution('');
        setProfileImageSize('');
    }

    useEffect(() => {
        if (!profileImagePreview) return;

        // resolution check (try without crossOrigin first to avoid noise)
        const checkRes = async () => {
            try {
                const img = await createImage(profileImagePreview, false);
                setProfileImageResolution(`${img.naturalWidth}×${img.naturalHeight}`);
            } catch {
                setProfileImageResolution('');
            }
        };
        checkRes();

        (async () => {
            setProfileImageSizeLoading(true);
            try {
                if (profileImageFile) {
                    setProfileImageSize(formatBytes(profileImageFile.size));
                } else if (profileImagePreview.startsWith('data:')) {
                    const bytes = sizeFromDataUrl(profileImagePreview);
                    setProfileImageSize(formatBytes(bytes));
                } else if (profileImagePreview.startsWith('http')) {
                    // try to get metadata which is safer than fetch() for CORS
                    try {
                        // Only try getMetadata if it looks like a Firebase URL
                        if (profileImagePreview.includes('firebasestorage.googleapis.com')) {
                            const fileRef = ref(storage, profileImagePreview);
                            const metadata = await getMetadata(fileRef);
                            setProfileImageSize(formatBytes(metadata.size));
                        } else {
                            // Fallback to fetch for non-firebase URLs
                            throw new Error('Not a firebase URL');
                        }
                    } catch {
                        try {
                            const res = await fetch(profileImagePreview, { method: 'GET' });
                            if (res.ok) {
                                const blob = await res.blob();
                                setProfileImageSize(formatBytes(blob.size));
                            }
                        } catch {
                            setProfileImageSize('');
                        }
                    }
                } else {
                    setProfileImageSize('');
                }
            } catch {
                setProfileImageSize('');
            } finally {
                setProfileImageSizeLoading(false);
            }
        })();

        return () => {
        };
    }, [profileImagePreview, profileImageFile]);

    // Load profile and hero info from Firestore.
    // Dirty flags (heroImageDirty / heroImageDirtyDark) prevent the snapshot from
    // clobbering unsaved local changes - including changes made via the Firebase browser
    // (where heroImageFile is null but a new URL was selected).
    useEffect(() => {
        const unsubscribe = onSnapshot(doc(db, 'Settings', 'Account'), (snap) => {
            if (snap.exists()) {
                const data = snap.data();
                if (data.imageUrl && !profileImageDirty) setProfileImagePreview(data.imageUrl);
                if (data.heroImageUrl && !heroImageDirty) setHeroImagePreview(data.heroImageUrl);
                if (data.heroImageUrlDark !== undefined && !heroImageDirtyDark) {
                    setHeroImagePreviewDark(data.heroImageUrlDark || '');
                }
                if (data.name && !isEditingProfile && !profileInfoDirty) setProfileName(data.name);
                if (data.title && !isEditingProfile && !profileInfoDirty) setProfileTitle(data.title);
                if (data['Social Links'] && !isEditingProfile && !profileInfoDirty) {
                    const links = Object.entries(data['Social Links']).map(([name, url]) => ({
                        name,
                        url: url as string
                    }));
                    setSocialLinks(links);
                }
            }
        }, (err) => {
            console.error('Error fetching account settings', err);
        });
        return () => unsubscribe();
    }, [profileImageDirty, isEditingProfile, profileInfoDirty, heroImageDirty, heroImageDirtyDark]);

    // Cropper State
    const [crop, setCrop] = useState({ x: 0, y: 0 });
    const [zoom, setZoom] = useState(1);
    const [croppedAreaPixels, setCroppedAreaPixels] = useState<{ width: number; height: number; x: number; y: number } | null>(null);
    const [isCropping, setIsCropping] = useState(false);
    const [originalImageSrc, setOriginalImageSrc] = useState<string | null>(null);

    // Detect dark mode to adjust cropper background
    const [isDark, setIsDark] = useState(false);
    useEffect(() => {
        const checkTheme = () => setIsDark(document.documentElement.classList.contains('dark'));
        checkTheme();
        const observer = new MutationObserver(checkTheme);
        observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
        return () => observer.disconnect();
    }, []);

    // Custom Alert State
    const [alert, setAlert] = useState<{ show: boolean; type: AlertType; message: string }>({
        show: false,
        type: 'success',
        message: ''
    });

    // Guard to prevent duplicate alerts from rapidly repeating
    const lastAlertRef = useRef<{ message: string; type: AlertType; t: number } | null>(null);
    const safeSetAlert = (next: { show: boolean; type: AlertType; message: string; duration?: number }) => {
        const duration = typeof next.duration === 'number' ? next.duration : 4000; // default 4s
        if (next.show) {
            // If an alert is already visible, suppress new alerts to ensure only one is shown
            if (alert.show) return;

            const last = lastAlertRef.current;
            if (last && last.message === next.message && last.type === next.type && (Date.now() - last.t) < duration) {
                return; // duplicate within cooldown, ignore
            }
            lastAlertRef.current = { message: next.message, type: next.type, t: Date.now() };
            setAlert({ show: true, type: next.type, message: next.message });
            if (duration > 0) {
                setTimeout(() => {
                    setAlert(prev => ({ ...prev, show: false }));
                    lastAlertRef.current = null;
                }, duration);
            }
        } else {
            // explicit hide - clear ref and state
            lastAlertRef.current = null;
            setAlert({ show: false, type: next.type, message: next.message });
        }
    };

    // Track unsaved changes
    const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);

    const handleSaveAvailability = async () => {
        try {
            const selectedTz = timezones.find(tz => tz.value === selectedTimezone);

            // Calculate timezone offset string correctly (handling .5 offsets)
            const absOffset = Math.abs(selectedTimezone);
            const hours = Math.floor(absOffset);
            const minutes = Math.round((absOffset % 1) * 60);
            const fallbackTzStr = `UTC${selectedTimezone >= 0 ? '+' : '-'}${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;

            const payload = {
                'Current Availability': `${availability}%`,
                'Current Time': selectedTz ? selectedTz.label : fallbackTzStr,
                // Add raw values for easier parsing and consistency
                'availabilityPercent': availability,
                'timezoneOffset': selectedTimezone
            };

            // merge:true so the 'Projects Being Handled' map - now owned and
            // mirrored by the Treasury page - survives an availability save.
            await setDoc(doc(db, 'Settings', 'Availability'), payload, { merge: true });
        } catch (error) {
            console.error("Error saving availability:", error);
            safeSetAlert({ show: true, type: 'error', message: 'Failed to save availability settings' });
        }
    };

    const handleSaveHeroImage = async (silent = false) => {
        // Only save if the user actually changed it
        if (!heroImageDirty) return;
        if (!heroImageFile && !heroImagePreview) return;

        try {
            setIsLoading(true);

            if (heroImageFile) {
                const fileExtension = heroImageFile.name.split('.').pop();
                const fileName = `Hero.image.${fileExtension}`;
                const storageRef = ref(storage, `src/imgs/Settings/${fileName}`);
                await uploadBytes(storageRef, heroImageFile);
                const downloadURL = await getDownloadURL(storageRef);

                await setDoc(doc(db, 'Settings', 'Account'), { heroImageUrl: downloadURL }, { merge: true });
                setHeroImageFile(null);
            } else if (heroImagePreview && heroImagePreview.startsWith('http')) {
                // Selected from Firebase / remote URL - just persist the URL
                await setDoc(doc(db, 'Settings', 'Account'), { heroImageUrl: heroImagePreview }, { merge: true });
            } else {
                // Local data URL without a file - nothing to upload to storage
                return;
            }

            setHeroImageDirty(false);
            if (!silent) safeSetAlert({ show: true, type: 'success', message: 'Hero image updated!', duration: 3000 });
        } catch (error) {
            console.error("Error updating hero image:", error);
            safeSetAlert({ show: true, type: 'error', message: 'Failed to update hero image.' });
        } finally {
            setIsLoading(false);
        }
    };

    const handleSaveHeroImageDark = async (silent = false) => {
        if (!heroImageDirtyDark) return;

        // Allow saving even if empty (user wants to clear the dark variant)
        if (!heroImageFileDark && !heroImagePreviewDark) {
            try {
                // setDoc + merge is safer than updateDoc - works even if the field
                // or doc didn't exist before. deleteField() removes the value.
                await setDoc(
                    doc(db, 'Settings', 'Account'),
                    { heroImageUrlDark: deleteField() },
                    { merge: true },
                );
                setHeroImageDirtyDark(false);
                if (!silent) safeSetAlert({ show: true, type: 'success', message: 'Dark hero image cleared.', duration: 3000 });
            } catch (error) {
                console.error('Error clearing dark hero image:', error);
                safeSetAlert({ show: true, type: 'error', message: 'Failed to clear dark hero image.' });
            }
            return;
        }

        try {
            setIsLoading(true);

            if (heroImageFileDark) {
                const fileExtension = heroImageFileDark.name.split('.').pop();
                const fileName = `Hero.image.dark.${fileExtension}`;
                const storageRef = ref(storage, `src/imgs/Settings/${fileName}`);
                await uploadBytes(storageRef, heroImageFileDark);
                const downloadURL = await getDownloadURL(storageRef);

                await setDoc(doc(db, 'Settings', 'Account'), { heroImageUrlDark: downloadURL }, { merge: true });
                setHeroImageFileDark(null);
            } else if (heroImagePreviewDark && heroImagePreviewDark.startsWith('http')) {
                await setDoc(doc(db, 'Settings', 'Account'), { heroImageUrlDark: heroImagePreviewDark }, { merge: true });
            } else {
                return;
            }

            setHeroImageDirtyDark(false);
            if (!silent) safeSetAlert({ show: true, type: 'success', message: 'Dark hero image updated!', duration: 3000 });
        } catch (error) {
            console.error("Error updating dark hero image:", error);
            safeSetAlert({ show: true, type: 'error', message: 'Failed to update dark hero image.' });
        } finally {
            setIsLoading(false);
        }
    };

    const handleApplyAll = async () => {
        setIsLoading(true);
        try {
            // If user is still cropping, finalize the crop first
            if (isCropping) {
                await handleCropSave();
            }

            await Promise.all([
                handleSaveAvailability(),
                handleSaveHeroImage(true),
                handleSaveHeroImageDark(true),
                handleSaveProfileImage(true),
                handleSaveProfileInfo(true)
            ]);

            setProfileInfoDirty(false);
            setHasUnsavedChanges(false);
            safeSetAlert({ show: true, type: 'success', message: 'All settings applied successfully!', duration: 3000 });
        } catch (error) {
            console.error("Error applying all settings:", error);
            safeSetAlert({ show: true, type: 'error', message: 'Failed to apply some settings.' });
        } finally {
            setIsLoading(false);
        }
    };

    const handleCancelAll = async () => {
        // Close any open cropper
        if (isCropping) {
            setIsCropping(false);
            setOriginalImageSrc(null);
        }

        setIsLoading(true);
        try {
            const profileSnap = await getDoc(doc(db, 'Settings', 'Account'));
            if (profileSnap.exists()) {
                const data = profileSnap.data();
                setProfileName(data.name ?? 'Your Name');
                setProfileTitle(data.title ?? 'Job Title');
                setProfileImagePreview(data.imageUrl ?? '');
                setProfileImageFile(null);
                setProfileImageBackupPreview(null);
                setProfileImageBackupFile(null);
                setProfileImageDirty(false);
                setProfileInfoDirty(false);
            }

            const heroSnap = await getDoc(doc(db, 'Settings', 'Account'));
            if (heroSnap.exists()) {
                const heroData = heroSnap.data();
                setHeroImagePreview(heroData.heroImageUrl ?? DEFAULT_HERO_URL);
                setHeroImageFile(null);
                setHeroImageDirty(false);
                setHeroImagePreviewDark(heroData.heroImageUrlDark ?? '');
                setHeroImageFileDark(null);
                setHeroImageDirtyDark(false);
            } else {
                // Even if doc fetch failed, reset dirty flags so user isn't stuck thinking changes still apply
                setHeroImageDirty(false);
                setHeroImageDirtyDark(false);
            }

            const availSnap = await getDoc(doc(db, 'Settings', 'Availability'));
            if (availSnap.exists()) {
                const availData = availSnap.data();
                if (availData.availabilityPercent !== undefined) {
                    setAvailability(availData.availabilityPercent);
                } else if (availData['Current Availability']) {
                    const percentage = parseInt(availData['Current Availability'].replace('%', ''));
                    if (!isNaN(percentage)) setAvailability(percentage);
                }

                if (availData.timezoneOffset !== undefined) {
                    setSelectedTimezone(availData.timezoneOffset);
                }
            }

            setHasUnsavedChanges(false);
            safeSetAlert({ show: true, type: 'info', message: 'All staged changes canceled.' });
        } catch (err) {
            console.error('Error cancelling changes', err);
            // Even on Firestore failure, clear dirty flags + uploads so the user
            // isn't left in a stuck "unsaved" state. The UI will sync next snapshot.
            setHeroImageDirty(false);
            setHeroImageDirtyDark(false);
            setHeroImageFile(null);
            setHeroImageFileDark(null);
            setProfileImageDirty(false);
            setProfileInfoDirty(false);
            setHasUnsavedChanges(false);
            safeSetAlert({ show: true, type: 'error', message: 'Cancel failed to reach Firestore. Local edits cleared.' });
        } finally {
            setIsLoading(false);
        }
    };





    // Update current time based on selected timezone
    useEffect(() => {
        const updateTime = () => {
            const now = new Date();
            const utcTime = now.getTime() + now.getTimezoneOffset() * 60000;
            const localTime = new Date(utcTime + selectedTimezone * 3600000);
            setCurrentTime(localTime.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true }));
        };
        updateTime();
        const interval = setInterval(updateTime, 1000);
        return () => clearInterval(interval);
    }, [selectedTimezone]);

    useEffect(() => {
        const unsubscribe = onSnapshot(doc(db, 'Settings', 'Availability'), (docSnapshot) => {
            if (docSnapshot.exists()) {
                const data = docSnapshot.data();

                // Parse and set availability
                if (data.availabilityPercent !== undefined) {
                    setAvailability(data.availabilityPercent);
                } else {
                    const availabilityString = data['Current Availability'] as string;
                    if (availabilityString) {
                        const percentage = parseInt(availabilityString.replace('%', ''));
                        if (!isNaN(percentage)) {
                            setAvailability(percentage);
                        }
                    }
                }

                // Parse and set timezone
                if (data.timezoneOffset !== undefined) {
                    setSelectedTimezone(data.timezoneOffset);
                } else {
                    const timezoneString = data['Current Time'] as string;
                    if (timezoneString) {
                        // Capture the minutes too so half-hour zones (e.g. UTC+05:30)
                        // round-trip as 5.5 instead of being truncated to 5 by parseInt.
                        const offsetMatch = timezoneString.match(/UTC([+-])(\d{2}):(\d{2})/);
                        if (offsetMatch) {
                            const sign = offsetMatch[1] === '-' ? -1 : 1;
                            const hours = parseInt(offsetMatch[2], 10);
                            const minutes = parseInt(offsetMatch[3], 10);
                            setSelectedTimezone(sign * (hours + minutes / 60));
                        }
                    }
                }
            }
        }, (err) => {
            const status = navigator.onLine ? "Service Blocked (ISP/Firewall)" : "Offline";
            console.warn(`[Connection] Settings sync: ${status}. Check diagnostic in lib/firebase.ts`, err);
        });
        return () => unsubscribe();
    }, []);

    // Fetch Stack Data
    useEffect(() => {
        const unsubscribe = onSnapshot(doc(db, 'Settings', 'Tech Stack'), (docSnapshot) => {
            if (docSnapshot.exists()) {
                const data = docSnapshot.data();
                const items: StackItem[] = [];
                Object.entries(data).forEach(([key, value]: [string, unknown]) => {
                    const v = value as Record<string, unknown>;
                    items.push({
                        id: key,
                        name: typeof v.Name === 'string' ? v.Name : (v.name as string) || 'Untitled',
                        icon: typeof v.Icon === 'string' ? v.Icon : (v.icon as string) || ''
                    });
                });
                // Sort by ID (assuming numeric IDs)
                items.sort((a, b) => parseInt(a.id) - parseInt(b.id));
                setStackItems(items);
            }
        }, (err) => {
            const status = navigator.onLine ? "Service Blocked (ISP/Firewall)" : "Offline";
            console.warn(`[Connection] Tech Stack sync: ${status}. Check diagnostic in lib/firebase.ts`, err);
        });
        return () => unsubscribe();
    }, []);

    const getAvailabilityColor = (value: number) => {
        const red = Math.round(255 * (1 - value / 100));
        const green = Math.round(255 * (value / 100));
        return `rgb(${red}, ${green}, 50)`;
    };

    const handleSaveStack = async (data: StackItemData) => {
        if (!data.name.trim() || !data.icon) return;
        setIsLoading(true);

        try {
            let id = data.id || '';
            if (!id) {
                const ids = stackItems.map(i => parseInt(i.id)).filter(n => !isNaN(n));
                const nextId = ids.length > 0 ? Math.max(...ids) + 1 : 1;
                id = nextId.toString();
            }

            let iconUrl = data.icon;
            if (data.iconFile) {
                const storageRef = ref(storage, `src/svgs/${data.iconFile.name}`);
                await uploadBytes(storageRef, data.iconFile);
                iconUrl = await getDownloadURL(storageRef);
            }

            const payload = {
                Name: data.name,
                Icon: iconUrl
            };

            await setDoc(doc(db, 'Settings', 'Tech Stack'), { [id]: payload }, { merge: true });

            setStackModalOpen(false);
            setEditingStack(null);
            safeSetAlert({ show: true, type: 'success', message: 'Stack item saved!', duration: 3000 });
        } catch (error) {
            console.error("Error saving stack:", error);
            safeSetAlert({ show: true, type: 'error', message: 'Failed to save stack item' });
        } finally {
            setIsLoading(false);
        }
    };

    const handleDeleteStack = (id: string) => {
        const item = stackItems.find(i => i.id === id);
        setConfirmConfig({
            isOpen: true,
            title: 'Delete Stack Item',
            message: `Are you sure you want to delete "${item?.name || id}" from your tech stack?`,
            type: 'danger',
            onConfirm: async () => {
                setIsLoading(true);
                try {
                    await updateDoc(doc(db, 'Settings', 'Tech Stack'), { [id]: deleteField() });
                    safeSetAlert({ show: true, type: 'success', message: 'Stack item deleted', duration: 3000 });
                } catch (error) {
                    console.error("Error deleting stack:", error);
                } finally {
                    setIsLoading(false);
                }
            }
        });
    };

    const closeStackModal = () => {
        setStackModalOpen(false);
        setEditingStack(null);
    };

    // Account handlers
    const handleHeroImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        // Always reset so the user can re-pick the same file later
        e.target.value = '';
        if (!file) return;
        if (!file.type.startsWith('image/')) {
            safeSetAlert({ show: true, type: 'error', message: 'Please pick an image file.' });
            return;
        }
        if (file.size > HERO_MAX_BYTES) {
            safeSetAlert({ show: true, type: 'error', message: `Image too large (${formatBytes(file.size)}). Max ${formatBytes(HERO_MAX_BYTES)}.` });
            return;
        }
        setHeroImageFile(file);
        setHeroImageDirty(true);
        const reader = new FileReader();
        reader.onload = (event) => {
            setHeroImagePreview(event.target?.result as string);
            setHasUnsavedChanges(true);
        };
        reader.readAsDataURL(file);
    };

    const handleHeroImageUploadDark = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        e.target.value = '';
        if (!file) return;
        if (!file.type.startsWith('image/')) {
            safeSetAlert({ show: true, type: 'error', message: 'Please pick an image file.' });
            return;
        }
        if (file.size > HERO_MAX_BYTES) {
            safeSetAlert({ show: true, type: 'error', message: `Image too large (${formatBytes(file.size)}). Max ${formatBytes(HERO_MAX_BYTES)}.` });
            return;
        }
        setHeroImageFileDark(file);
        setHeroImageDirtyDark(true);
        const reader = new FileReader();
        reader.onload = (event) => {
            setHeroImagePreviewDark(event.target?.result as string);
            setHasUnsavedChanges(true);
        };
        reader.readAsDataURL(file);
    };

    const handleClearHeroImageDark = () => {
        setHeroImagePreviewDark('');
        setHeroImageFileDark(null);
        setHeroImageDirtyDark(true);
        setHasUnsavedChanges(true);
    };

    const handleProfileImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files?.[0]) {
            // keep a backup so Cancel can restore instantly
            if (!profileImageBackupPreview) {
                setProfileImageBackupPreview(profileImagePreview);
                setProfileImageBackupFile(profileImageFile);
            }

            const file = e.target.files[0];
            const imageDataUrl = await readFile(file);
            setOriginalImageSrc(imageDataUrl as string);
            setIsCropping(true);
            e.target.value = '';
        }
    };

    const readFile = (file: File) => {
        return new Promise((resolve) => {
            const reader = new FileReader();
            reader.addEventListener('load', () => resolve(reader.result), false);
            reader.readAsDataURL(file);
        });
    };

    const onCropComplete = useCallback((_croppedArea: unknown, croppedAreaPixels: unknown) => {
        setCroppedAreaPixels(croppedAreaPixels as { width: number; height: number; x: number; y: number });
    }, []);

    const handleCropSave = async () => {
        if (originalImageSrc && croppedAreaPixels) {
            try {
                setIsLoading(true);
                const croppedFile = await getCroppedImg(originalImageSrc, croppedAreaPixels);
                if (croppedFile) {
                    // Perform immediate upload to Firebase
                    const storageRef = ref(storage, `src/imgs/Settings/Profile_${Date.now()}_cropped.webp`);
                    await uploadBytes(storageRef, croppedFile);
                    const downloadURL = await getDownloadURL(storageRef);

                    // Update Firestore immediately
                    await setDoc(doc(db, 'Settings', 'Account'), { imageUrl: downloadURL }, { merge: true });

                    setProfileImagePreview(downloadURL);
                    setProfileImageFile(null);
                    setProfileImageDirty(false);
                    
                    safeSetAlert({ show: true, type: 'success', message: 'Profile image cropped and saved!', duration: 3000 });
                }
            } catch (e) {
                console.error("Crop/Save failed", e);
                safeSetAlert({ show: true, type: 'error', message: 'Failed to save cropped image.' });
            } finally {
                setIsLoading(false);
                setIsCropping(false);
                setOriginalImageSrc(null);
            }
        }
    };

    const handleSkipCrop = () => {
        if (originalImageSrc) {
            setProfileImagePreview(originalImageSrc);
            setProfileImageFile(null); // It's a remote URL, no local file to upload
            setProfileImageDirty(true);
            setHasUnsavedChanges(true);
            setIsCropping(false);
            setOriginalImageSrc(null);
        }
    };

    const handleCropCancel = () => {
        setIsCropping(false);
        setOriginalImageSrc(null);
    };

    const handleCancelProfileImageChange = () => {
        if (profileImageBackupPreview) {
            setProfileImagePreview(profileImageBackupPreview);
            setProfileImageFile(profileImageBackupFile);
        }
        setProfileImageBackupPreview(null);
        setProfileImageBackupFile(null);
        setProfileImageDirty(false);
        setHasUnsavedChanges(false);
    };

    // Persist profile name/title/links to Firestore (used by Apply All)
    const handleSaveProfileInfo = async (silent = false) => {
        try {
            const linksMap = socialLinks.reduce((acc, link) => {
                acc[link.name] = link.url;
                return acc;
            }, {} as Record<string, string>);

            await setDoc(doc(db, 'Settings', 'Account'), {
                name: profileName,
                title: profileTitle,
                'Social Links': linksMap
            }, { merge: true });

            if (!silent) safeSetAlert({ show: true, type: 'success', message: 'Profile updated!', duration: 3000 });
        } catch (err) {
            console.error('Error saving profile info', err);
            safeSetAlert({ show: true, type: 'error', message: 'Failed to update profile.' });
        }
    };

    const handleSaveProfileImage = async (silent = false) => {
        if (!profileImageFile && !profileImagePreview) return;

        try {
            setProfileImageUploading(true);
            setIsLoading(true);

            if (profileImageFile) {
                const storageRef = ref(storage, `src/imgs/Settings/Profile_${Date.now()}_cropped.webp`);
                await uploadBytes(storageRef, profileImageFile);
                const downloadURL = await getDownloadURL(storageRef);

                await setDoc(doc(db, 'Settings', 'Account'), { imageUrl: downloadURL }, { merge: true });
            } else if (profileImagePreview && profileImagePreview.startsWith('http')) {
                // Selected from Firebase / remote URL - just persist the URL
                await setDoc(doc(db, 'Settings', 'Account'), { imageUrl: profileImagePreview }, { merge: true });
            } else {
                // Local data URL without a file - nothing to upload to storage
                return;
            }

            if (!silent) safeSetAlert({ show: true, type: 'success', message: 'Profile image updated!', duration: 3000 });

            // clear temporary states
            setProfileImageDirty(false);
            setProfileImageBackupPreview(null);
            setProfileImageBackupFile(null);
            setProfileImageFile(null);
            setHasUnsavedChanges(false);
        } catch (error) {
            console.error("Error updating profile image:", error);
            safeSetAlert({ show: true, type: 'error', message: 'Failed to update profile image.' });
        } finally {
            setProfileImageUploading(false);
            setIsLoading(false);
        }
    };

    // Tabs definition
    const tabs = [
        { id: 'availability', label: 'Availability', icon: Sliders },
        { id: 'stack', label: 'Tech Stack', icon: Code },
        { id: 'account', label: 'Account', icon: User },
        { id: 'mcp', label: 'MCP', icon: Plug },
    ] as const;

    if (isCropping && originalImageSrc) {
        return createPortal(
            <div className="fixed inset-0 bg-black/60 backdrop-blur-md z-[3000] flex items-center justify-center p-4 animate-fade-in">
                <div className="w-full max-w-lg">
                    <div className={`glass-panel overflow-hidden rounded-2xl border ${isDark ? 'border-white/10 bg-zinc-900/90' : 'border-black/5 bg-white/90'}`}>
                        {/* Header */}
                        <div className="flex items-center justify-between p-5 border-b border-white/5">
                            <div className="flex items-center gap-3">
                                <div className="p-2 rounded-lg bg-blue-500/10 text-blue-500">
                                    <ZoomIn size={20} />
                                </div>
                                <div>
                                    <h3 className="font-bold text-base leading-none">Crop Photo</h3>
                                    <p className="text-[11px] text-muted mt-1 uppercase tracking-wider font-medium opacity-60">Adjust your profile image</p>
                                </div>
                            </div>
                            <button 
                                onClick={handleCropCancel}
                                className="p-2 rounded-full hover:bg-white/5 text-muted transition-colors"
                            >
                                <X size={20} />
                            </button>
                        </div>

                        {/* Cropper Area */}
                        <div className="relative h-[400px] w-full bg-black/20">
                            <Cropper
                                image={originalImageSrc}
                                crop={crop}
                                zoom={zoom}
                                aspect={1}
                                cropShape="round"
                                showGrid={false}
                                onCropChange={setCrop}
                                onCropComplete={onCropComplete}
                                onZoomChange={setZoom}
                                style={{
                                    containerStyle: { background: 'transparent' },
                                    cropAreaStyle: {
                                        border: '2px solid white',
                                        boxShadow: '0 0 0 9999px rgba(0, 0, 0, 0.5)'
                                    }
                                }}
                            />
                        </div>

                        {/* Controls */}
                        <div className="p-6 flex flex-col gap-6">
                            <div className="flex items-center gap-4">
                                <span className="text-xs font-semibold text-muted w-10">Zoom</span>
                                <input
                                    type="range"
                                    value={zoom}
                                    min={1}
                                    max={3}
                                    step={0.01}
                                    onChange={(e) => setZoom(Number(e.target.value))}
                                    className="flex-1 h-1.5 bg-gray-500/20 rounded-lg appearance-none cursor-pointer accent-blue-500"
                                />
                                <span className="text-xs font-mono text-blue-500 w-10 text-right font-bold">
                                    {Math.round(zoom * 100)}%
                                </span>
                            </div>

                            <div className="flex flex-wrap items-center justify-between gap-4">
                                <div className="text-[11px] text-muted max-w-[200px]">
                                    <span className="opacity-60">Drag to move. Scroll or use slider to zoom.</span>
                                </div>
                                
                                <div className="flex items-center gap-2">
                                    <button
                                        type="button"
                                        onClick={handleCropCancel}
                                        className="btn btn-secondary text-xs px-4 py-2"
                                    >
                                        Cancel
                                    </button>
                                    
                                    {originalImageSrc.startsWith('http') && (
                                        <button
                                            type="button"
                                            onClick={handleSkipCrop}
                                            className="btn btn-secondary text-xs px-4 py-2 bg-blue-500/5 border-blue-500/10 text-blue-500 hover:bg-blue-500/10"
                                        >
                                            Skip
                                        </button>
                                    )}

                                    <button
                                        type="button"
                                        onClick={handleCropSave}
                                        className="btn btn-primary text-xs px-6 py-2 shadow-lg shadow-blue-500/20"
                                    >
                                        Save Changes
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>,
            document.body
        );
    }

    return (
        <div className="h-[85vh] flex flex-col gap-6 relative">
            <Loader isOpen={isLoading} isFullScreen={true} />
            {/* Custom Alert */}
            {alert.show && (
                <Alert
                    type={alert.type}
                    message={alert.message}
                    onClose={() => safeSetAlert({ show: false, type: alert.type, message: alert.message })}
                />
            )}

            {/* Tabs */}
            <div className="glass-surface p-1.5 rounded-xl flex gap-2 overflow-x-auto shrink-0">
                {tabs.map(tab => {
                    const Icon = tab.icon;
                    const isActive = activeTab === tab.id;
                    return (
                        <button
                            key={tab.id}
                            onClick={() => handleTabChange(tab.id)}
                            className={`
                                settings-tab-btn flex items-center gap-2 px-5 py-3 rounded-lg border-none cursor-pointer font-sans font-semibold text-sm whitespace-nowrap transition-all
                                ${isActive ? 'tab-active bg-blue-500/15 text-blue-500' : 'bg-transparent text-gray-500 hover:bg-blue-500/10 hover:text-blue-500 dark:text-gray-400 dark:hover:text-blue-400'}
                            `}
                        >
                            <Icon size={18} />
                            <span className="hidden sm:inline">{tab.label}</span>
                        </button>
                    );
                })}
            </div>

            {/* Content Container with overflow-x-hidden for clean transitions */}
            <div className="flex-1 overflow-y-auto overflow-x-hidden flex flex-col gap-6 p-4 custom-scrollbar">
                <AnimatePresence mode="wait">
                    {activeTab === 'availability' && (
                        <motion.div
                            key="availability"
                            initial={{ opacity: 0, y: 6 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -6 }}
                            transition={{ duration: 0.15, ease: 'easeInOut' }}
                            className="settings-section flex flex-col gap-6"
                        >
                            {/* Availability Settings */}
                            <div className="settings-panel glass-panel p-6 flex flex-col gap-6 relative z-10">
                            <h3 className="heading-md text-base sm:text-lg md:text-xl">Availability Settings</h3>
                            <div className="flex flex-col gap-6">
                                {/* Current Availability Slider */}
                                <div>
                                    <div className="flex-row-between">
                                        <label className="text-sec text-sm">Current Availability</label>
                                        <span className="font-bold text-sm" style={{ color: getAvailabilityColor(availability) }}>{availability}%</span>
                                    </div>
                                    <div className="h-2 bg-gray-500/10 overflow-hidden relative">
                                        <div className="absolute left-0 top-0 h-full" style={{ width: `${availability}%`, background: 'linear-gradient(to right, rgb(239, 68, 68), rgb(234, 179, 8), rgb(34, 197, 94))' }} />
                                    </div>
                                    <input
                                        type="range"
                                        min="0"
                                        max="100"
                                        value={availability}
                                        onChange={(e) => { setAvailability(Number(e.target.value)); setHasUnsavedChanges(true); }}
                                        className="w-full cursor-pointer"
                                        style={{ accentColor: getAvailabilityColor(availability) }}
                                    />
                                    <div className="flex justify-between text-xs sm:text-sm">
                                        <span className="text-red-500">Not Available</span>
                                        <span className="text-green-500">Available</span>
                                    </div>
                                </div>

                                {/* Current Time / Timezone */}
                                <div>
                                    <div className="flex-row-between stack-on-small">
                                        <label className="text-sec text-sm sm:text-base md:text-lg flex items-center gap-2">
                                            <Clock size={16} />
                                            Current Time
                                        </label>
                                        <div className="text-right">
                                            <span className="text-lg sm:text-xl md:text-2xl font-bold text-blue-500 font-mono">{currentTime}</span>
                                        </div>
                                    </div>
                                    <div className="flex flex-col sm:flex-row gap-3">
                                        {/* Timezone (reusable blurry Select) */}
                                        <div className="flex-1 min-w-[140px]">
                                            <Select
                                                value={String(selectedTimezone)}
                                                options={timezones.map(tz => ({ value: String(tz.value), label: tz.label }))}
                                                onChange={(v) => { setSelectedTimezone(Number(v)); setHasUnsavedChanges(true); }}
                                                isDark={isDark}
                                                searchable
                                                aria-label="Timezone"
                                            />
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>

                    </motion.div>
                )}

                    {activeTab === 'stack' && (
                        <motion.div
                            key="stack"
                            initial={{ opacity: 0, y: 6 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -6 }}
                            transition={{ duration: 0.15, ease: 'easeInOut' }}
                            className="settings-section flex flex-col gap-6"
                        >
                            <div className="settings-panel glass-panel p-3 sm:p-4 md:p-6 flex-1 flex flex-col gap-3 sm:gap-4 md:gap-6">
                            <div className="flex-row-between">
                                <h3 className="heading-md text-base sm:text-lg md:text-xl">Tech Stack</h3>
                                <button onClick={() => setStackModalOpen(true)} className="btn btn-primary" aria-label="Add stack">
                                    <Plus size={18} /> <span className="hidden sm:inline">Add Stack</span>
                                </button>
                            </div>
                            <div className="flex-1 overflow-y-auto grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3 sm:gap-4 md:gap-6 content-start">
                                {stackItems.length === 0 ? (
                                    <div className="col-span-full text-center p-12 text-sec">No stack items. Add your tech stack!</div>
                                ) : stackItems.map(item => (
                                    <div key={item.id} className="p-3 sm:p-4 md:p-6 rounded-xl sm:rounded-2xl bg-gray-500/5 border border-gray-500/5 flex flex-col gap-2 sm:gap-3 md:gap-3.5 relative min-w-0">
                                        <div className="absolute top-2 right-2 sm:top-3 sm:right-3 md:top-4 md:right-4 flex gap-0.5 sm:gap-1">
                                            <button onClick={() => { setEditingStack(item); setStackModalOpen(true); }} className="btn-icon p-1 sm:p-1.5"><Edit2 size={14} className="sm:w-4 sm:h-4" /></button>
                                            <button onClick={() => handleDeleteStack(item.id)} className="btn-icon p-1 sm:p-1.5 text-red-500 hover:bg-red-500/10"><Trash2 size={14} className="sm:w-4 sm:h-4" /></button>
                                        </div>
                                        {item.icon ? <img src={item.icon} alt={item.name} className="w-10 h-10 sm:w-12 sm:h-12 md:w-16 md:h-16 opacity-90 object-contain" /> : <Code size={40} className="text-gray-500/50 sm:w-12 sm:h-12 md:w-[60px] md:h-[60px]" />}
                                        <h4 className="heading-sm text-xs sm:text-sm md:text-base truncate">{item.name}</h4>

                                    </div>
                                ))}
                            </div>
                        </div>
                    </motion.div>
                )}

                    {activeTab === 'account' && (
                        <motion.div
                            key="account"
                            initial={{ opacity: 0, y: 6 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -6 }}
                            transition={{ duration: 0.15, ease: 'easeInOut' }}
                            className="settings-section grid grid-cols-1 md:grid-cols-12 gap-6 items-start"
                        >
                            <div className="settings-panel md:col-span-4 glass-panel p-6 flex flex-col gap-5">
                            <div className="flex items-center justify-between gap-3">
                                <h3 className="heading-md text-base sm:text-lg md:text-xl flex items-center mb-0">
                                    <User size={22} className="mr-3" />
                                    Hero Section Images
                                </h3>
                                {heroImageMode === 'dark' && heroImagePreviewDark && (
                                    <button
                                        onClick={handleClearHeroImageDark}
                                        className="text-[10px] uppercase tracking-wider text-red-400/70 hover:text-red-400 transition shrink-0"
                                        title="Clear dark hero image"
                                    >
                                        Clear
                                    </button>
                                )}
                            </div>

                            {/* Light / Dark toggle - one uploader, switch which image you're editing */}
                            <div
                                role="tablist"
                                aria-label="Hero image mode"
                                className="grid grid-cols-2 gap-1 p-1 rounded-xl"
                                style={{ background: 'rgba(128,128,128,0.06)', border: '1px solid var(--section-border)' }}
                            >
                                {(['light', 'dark'] as const).map((mode) => {
                                    const active = heroImageMode === mode;
                                    const isLight = mode === 'light';
                                    const missing = !isLight && !heroImagePreviewDark;
                                    return (
                                        <button
                                            key={mode}
                                            role="tab"
                                            aria-selected={active}
                                            onClick={() => setHeroImageMode(mode)}
                                            className="flex items-center justify-center gap-2 py-2 rounded-lg text-sm font-semibold transition-colors cursor-pointer"
                                            style={active
                                                ? { background: 'var(--accent)', color: '#fff', boxShadow: '0 1px 4px rgba(0,0,0,0.12)' }
                                                : { background: 'transparent', color: 'var(--text-muted)' }}
                                        >
                                            {isLight ? <Sun size={15} /> : <Moon size={15} />}
                                            {isLight ? 'Light' : 'Dark'}
                                            {missing && (
                                                <span
                                                    className="w-1.5 h-1.5 rounded-full"
                                                    style={{ background: 'currentColor', opacity: 0.45 }}
                                                    title="No dark image set"
                                                />
                                            )}
                                        </button>
                                    );
                                })}
                            </div>

                            {/* Active uploader, bound to the selected mode */}
                            {(() => {
                                const isLight = heroImageMode === 'light';
                                const preview = isLight ? heroImagePreview : heroImagePreviewDark;
                                const resolution = isLight ? heroImageResolution : heroImageResolutionDark;
                                const fileSize = isLight ? heroImageSize : heroImageSizeDark;
                                const sizeLoading = isLight ? heroImageSizeLoading : heroImageSizeLoadingDark;
                                const onUpload = () => (isLight ? heroImageInputRef : heroImageInputRefDark).current?.click();
                                const onBrowse = () => { setFirebaseSelectTarget(isLight ? 'hero' : 'heroDark'); setFirebaseBrowserOpen(true); };
                                return (
                                    <div className="flex flex-col gap-2">
                                        <div className="group relative overflow-hidden w-full max-w-full mx-auto md:mx-0 rounded-md bg-[var(--input-bg)] flex items-center justify-center border border-[var(--section-border)]" style={{ paddingTop: '133%' }}>
                                            {preview ? (
                                                <img src={preview} alt={isLight ? 'Hero Light Preview' : 'Hero Dark Preview'} className="absolute inset-0 w-full h-full object-cover rounded-md" />
                                            ) : (
                                                <div className="absolute inset-0 flex flex-col items-center justify-center text-muted gap-2">
                                                    {isLight ? <User size={48} className="opacity-20" /> : <Moon size={40} className="opacity-20" />}
                                                    <span className="text-xs font-semibold uppercase tracking-widest opacity-30">{isLight ? 'No Image' : 'No Dark Image'}</span>
                                                    {!isLight && <span className="text-[10px] text-muted opacity-70 px-4 text-center">Falls back to light image if empty</span>}
                                                </div>
                                            )}

                                            <div className="absolute inset-0 bg-white/10 backdrop-blur-sm flex items-center justify-center gap-3 opacity-0 group-hover:opacity-100 transition-opacity rounded-md">
                                                <button
                                                    onClick={onUpload}
                                                    aria-label={isLight ? 'Upload light hero image' : 'Upload dark hero image'}
                                                    className="inline-flex items-center gap-3 px-4 py-2 rounded-md bg-blue-500/10 border border-blue-500/20 text-blue-400 font-semibold hover:bg-blue-500/20 transition"
                                                >
                                                    <span className="p-1.5 rounded-full bg-blue-500/10 flex items-center justify-center border border-blue-500/10">
                                                        <Upload size={16} className="text-blue-400" />
                                                    </span>
                                                    <span className="hidden sm:inline text-blue-400 tracking-wide font-semibold">Upload</span>
                                                </button>

                                                <button
                                                    onClick={onBrowse}
                                                    className="inline-flex items-center gap-2 px-4 py-2 rounded-md bg-orange-400/10 border border-orange-400/20 text-orange-400 font-semibold hover:bg-orange-400/20 transition"
                                                >
                                                    <HardDrive size={16} className="text-orange-400" />
                                                    <span className="text-orange-400">Browse</span>
                                                </button>
                                            </div>
                                        </div>
                                        {resolution ? (
                                            <p className="text-muted text-xs">
                                                Resolution: <span className="font-mono text-xs">{resolution}</span>
                                                {fileSize && <span className="text-muted"> &nbsp;•&nbsp; <span className="font-mono text-xs">{fileSize}</span></span>}
                                                {sizeLoading && <span className="text-muted"> &nbsp;•&nbsp; <span className="text-xs">checking...</span></span>}
                                            </p>
                                        ) : (
                                            <p className="text-muted text-xs">{isLight ? 'JPG, PNG or WebP. Max 2MB' : 'Optional · shown only in dark mode'}</p>
                                        )}
                                    </div>
                                );
                            })()}

                            {/* Hidden file inputs kept always-mounted so the refs never detach */}
                            <input ref={heroImageInputRef} type="file" accept="image/*" onChange={handleHeroImageUpload} style={{ display: 'none' }} />
                            <input ref={heroImageInputRefDark} type="file" accept="image/*" onChange={handleHeroImageUploadDark} style={{ display: 'none' }} />
                        </div>

                        <div className="md:col-span-8 flex flex-col gap-6">
                            {/* Profile */}
                            <div className="settings-panel glass-panel p-6 flex flex-col gap-4">
                                <h3 className="heading-md text-base sm:text-lg md:text-xl flex items-center mb-2">
                                    <User size={22} className="mr-3" />
                                    Profile
                                </h3>
                                <div className="flex flex-col md:flex-row items-center gap-6">
                                    <div className="group relative flex-shrink-0">
                                        <div className="w-28 h-28 sm:w-32 sm:h-32 md:w-36 md:h-36 rounded-full overflow-hidden border-2 border-blue-400 p-0.5 flex-shrink-0 mx-auto sm:mx-0 bg-[var(--input-bg)] flex items-center justify-center">
                                            {profileImagePreview ? (
                                                <img src={profileImagePreview} alt="Profile Preview" className="w-full h-full object-cover rounded-full" />
                                            ) : (
                                                <User size={40} className="text-muted opacity-40" />
                                            )}
                                        </div>

                                        <div className="absolute inset-0 flex items-center justify-center gap-3 opacity-0 group-hover:opacity-100 transition-opacity bg-white/10 backdrop-blur-sm rounded-full">
                                            <button
                                                aria-label="Upload profile image"
                                                onClick={() => profileImageInputRef.current?.click()}
                                                className="w-10 h-10 rounded-full bg-blue-500/10 border border-blue-500/20 text-blue-400 flex items-center justify-center hover:bg-blue-500/20 transition"
                                            >
                                                <Upload size={16} />
                                            </button>

                                            <button
                                                aria-label="Browse profile image"
                                                onClick={() => { setFirebaseSelectTarget('profile'); setFirebaseBrowserOpen(true); }}
                                                className="w-10 h-10 rounded-full bg-orange-400/10 border border-orange-400/20 text-orange-400 flex items-center justify-center hover:bg-orange-400/20 transition"
                                            >
                                                <HardDrive size={16} />
                                            </button>
                                        </div>
                                    </div>

                                    <div className="w-full flex-1">
                                        <div className="flex flex-col sm:flex-row gap-3 w-full">
                                            <div className="sm:text-left flex-1">
                                                {!isEditingProfile ? (
                                                    <>
                                                        <div className="font-bold">{profileName}</div>
                                                        <div className="text-sec text-sm opacity-70">{profileTitle}</div>
                                                        {profileImageResolution ? (
                                                            <p className="text-muted text-xs mt-1">
                                                                Resolution: <span className="font-mono text-xs">{profileImageResolution}</span>
                                                                {profileImageSize && <span className="text-muted"> &nbsp;•&nbsp; <span className="font-mono text-xs">{profileImageSize}</span></span>}
                                                                {profileImageSizeLoading && <span className="text-muted"> &nbsp;•&nbsp; <span className="text-xs">checking...</span></span>}
                                                            </p>
                                                        ) : null}
                                                        <p className="text-muted text-xs mt-2">Profile image is used across the site</p>
                                                    </>
                                                ) : (
                                                    <div className="flex flex-col gap-2">
                                                        <input className="input-field" value={profileName} onChange={(e) => { setProfileName(e.target.value); setHasUnsavedChanges(true); }} placeholder="Full name" />
                                                        <input className="input-field" value={profileTitle} onChange={(e) => { setProfileTitle(e.target.value); setHasUnsavedChanges(true); }} placeholder="Job title" />
                                                    </div>
                                                )}

                                            </div>

                                            <div className="flex items-center gap-2 self-start sm:self-auto">
                                                {!isEditingProfile ? (
                                                    <button onClick={() => { setProfileBackup({ name: profileName, title: profileTitle }); setIsEditingProfile(true); }} className="btn btn-secondary px-3 py-2">
                                                        <Edit2 size={16} />
                                                        <span className="hidden sm:inline ml-2">Edit</span>
                                                    </button>
                                                ) : (
                                                    <>
                                                        <button onClick={() => {
                                                            // Stage changes locally; Apply Changes will persist to Firebase
                                                            setHasUnsavedChanges(true);
                                                            setProfileInfoDirty(true);
                                                            setIsEditingProfile(false);
                                                            setProfileBackup(null);
                                                            safeSetAlert({ show: true, type: 'success', message: 'Profile changes staged. Click Apply Changes at the bottom of the page to save permanently.', duration: 3000 });
                                                        }} className="btn btn-primary px-3 py-2"><Save size={16} /><span className="hidden sm:inline ml-2">Save</span>
                                                        </button>
                                                        <button onClick={() => {
                                                            if (profileBackup) {
                                                                setProfileName(profileBackup.name);
                                                                setProfileTitle(profileBackup.title);
                                                                setProfileBackup(null);
                                                            }
                                                            setIsEditingProfile(false);
                                                        }} className="btn btn-secondary px-3 py-2"><X size={16} /><span className="hidden sm:inline ml-2">Cancel</span></button>
                                                    </>
                                                )}
                                            </div>
                                        </div>

                                        <div className="mt-3 flex items-center justify-between">
                                            <div className="flex gap-2 items-center">
                                                {profileImageDirty ? (
                                                    <>
                                                        <button onClick={() => {
                                                            // Stage upload - actual upload will happen when Apply Changes is clicked
                                                            setHasUnsavedChanges(true);
                                                            safeSetAlert({ show: true, type: 'success', message: 'Profile image staged. Click Apply Changes to save to Firebase.', duration: 3000 });
                                                        }} className="btn btn-primary px-3 py-2" disabled={profileImageUploading}>{profileImageUploading ? 'Saving...' : (<><Save size={16} /><span className="hidden sm:inline ml-2">Save Image</span></>)}</button>
                                                        <button onClick={handleCancelProfileImageChange} className="btn btn-secondary px-3 py-2"><X size={16} /><span className="hidden sm:inline ml-2">Cancel</span></button>
                                                    </>
                                                ) : null}
                                            </div>

                                            <input ref={profileImageInputRef} type="file" accept="image/*" onChange={handleProfileImageUpload} style={{ display: 'none' }} />
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* Social Links Editor */}
                            <div className="settings-panel glass-panel p-6 flex flex-col gap-4">
                                <h3 className="heading-md text-base sm:text-lg md:text-xl flex items-center mb-2">
                                    <Link size={22} className="mr-3" />
                                    Social Links
                                </h3>
                                <div className="flex flex-col gap-4">
                                    <div className="grid grid-cols-1 sm:grid-cols-12 gap-3 items-end">
                                        <div className="sm:col-span-4">
                                            <label className="text-xs text-muted mb-1 block">Platform Name</label>
                                            <input
                                                className="input-field w-full"
                                                placeholder="e.g. GitHub"
                                                value={newLinkName}
                                                onChange={(e) => setNewLinkName(e.target.value)}
                                            />
                                        </div>
                                        <div className="sm:col-span-6">
                                            <label className="text-xs text-muted mb-1 block">URL</label>
                                            <input
                                                className="input-field w-full"
                                                placeholder="https://..."
                                                value={newLinkUrl}
                                                onChange={(e) => setNewLinkUrl(e.target.value)}
                                            />
                                        </div>
                                        <div className="sm:col-span-2">
                                            <button
                                                className="btn btn-primary w-full justify-center"
                                                disabled={socialLinks.length >= 5 || !newLinkName || !newLinkUrl}
                                                onClick={() => {
                                                    if (socialLinks.length < 5 && newLinkName && newLinkUrl) {
                                                        setSocialLinks([...socialLinks, { name: newLinkName, url: newLinkUrl }]);
                                                        setNewLinkName('');
                                                        setNewLinkUrl('');
                                                        setHasUnsavedChanges(true);
                                                    }
                                                }}
                                            >
                                                <Plus size={18} /> <span className="hidden sm:inline">Add</span>
                                            </button>
                                        </div>
                                    </div>

                                    {socialLinks.length > 0 ? (
                                        <div className="flex flex-col gap-2 mt-2">
                                            {socialLinks.map((link, index) => (
                                                <div key={index} className="flex items-center justify-between p-3 rounded-lg bg-white/5 border border-white/10">
                                                    <div className="flex items-center gap-3 overflow-hidden">
                                                        <div className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center shrink-0">
                                                            <Link size={14} className="text-primary" />
                                                        </div>
                                                        <div className="flex flex-col overflow-hidden">
                                                            <span className="font-bold text-sm truncate">{link.name}</span>
                                                            <span className="text-xs text-muted truncate">{link.url}</span>
                                                        </div>
                                                    </div>
                                                    <button
                                                        className="p-2 text-red-400 hover:bg-red-500/10 rounded-lg transition-colors"
                                                        onClick={() => {
                                                            const newLinks = [...socialLinks];
                                                            newLinks.splice(index, 1);
                                                            setSocialLinks(newLinks);
                                                            setHasUnsavedChanges(true);
                                                        }}
                                                    >
                                                        <Trash2 size={16} />
                                                    </button>
                                                </div>
                                            ))}
                                        </div>
                                    ) : (
                                        <div className="text-center p-6 border border-dashed border-white/10 rounded-xl text-muted text-sm">
                                            No social links added yet. Add up to 5 links.
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>
                    </motion.div>
                    )}

                    {activeTab === 'mcp' && (
                        <motion.div
                            key="mcp"
                            initial={{ opacity: 0, y: 6 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -6 }}
                            transition={{ duration: 0.15, ease: 'easeInOut' }}
                            className="settings-section"
                        >
                            <DMcpPanel isDark={isDark} />
                        </motion.div>
                    )}
                </AnimatePresence>
            </div>

            {/* Stack Modal */}
            <MStackItem
                isOpen={stackModalOpen}
                onClose={closeStackModal}
                onSave={handleSaveStack}
                initialData={editingStack}
            />

            {/* Sticky Action Bar (shared component) */}
            <SaveBar show={hasUnsavedChanges} onApply={handleApplyAll} onCancel={handleCancelAll} isDark={isDark} />

            {/* Firebase Browser */}
            <MFirebaseStorage
                isOpen={firebaseBrowserOpen}
                onClose={() => { setFirebaseBrowserOpen(false); setFirebaseSelectTarget(null); }}
                onSelect={(url) => {
                    if (firebaseSelectTarget === 'hero') {
                        setHeroImagePreview(url);
                        setHeroImageFile(null);
                        setHeroImageDirty(true);
                        setHasUnsavedChanges(true);
                    } else if (firebaseSelectTarget === 'heroDark') {
                        setHeroImagePreviewDark(url);
                        setHeroImageFileDark(null);
                        setHeroImageDirtyDark(true);
                        setHasUnsavedChanges(true);
                    } else if (firebaseSelectTarget === 'profile') {
                        // Backup current profile if not already backed up
                        if (!profileImageBackupPreview) {
                            setProfileImageBackupPreview(profileImagePreview);
                            setProfileImageBackupFile(profileImageFile);
                        }
                        setOriginalImageSrc(url);
                        setIsCropping(true);
                    }
                    setFirebaseSelectTarget(null);
                    setFirebaseBrowserOpen(false);
                }}
                fileTypes={['svg', 'png', 'jpg', 'jpeg', 'webp']}
                title={
                    firebaseSelectTarget === 'hero' ? 'Select Light Hero Image' :
                    firebaseSelectTarget === 'heroDark' ? 'Select Dark Hero Image' :
                    firebaseSelectTarget === 'profile' ? 'Select Profile Image' :
                    'Select File'
                }
            />

            <MConfirmModal
                isOpen={confirmConfig.isOpen}
                title={confirmConfig.title}
                message={confirmConfig.message}
                type={confirmConfig.type}
                onConfirm={confirmConfig.onConfirm}
                onClose={() => setConfirmConfig(prev => ({ ...prev, isOpen: false }))}
                confirmText="Confirm"
            />

        </div >
    );
};

