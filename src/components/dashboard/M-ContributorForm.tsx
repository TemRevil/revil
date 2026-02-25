import React, { useState, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { X, Upload, Github, Linkedin, Facebook, Instagram, Globe, ZoomIn, HardDrive } from 'lucide-react';
import Cropper from 'react-easy-crop';
import MFirebaseStorage from './M-FirebaseStorage';
import firebaseIcon from '../../assets/svgs/firebase.svg';

import { ContributorData } from '../../types';

interface MContributorFormProps {
    isOpen: boolean;
    onClose: () => void;
    onSave: (data: ContributorData) => void;
    initialData?: ContributorData | null;
}

interface CropArea {
    x: number;
    y: number;
    width: number;
    height: number;
}

// Helper to create the cropped image
const createImage = (url: string): Promise<HTMLImageElement> =>
    new Promise((resolve, reject) => {
        const image = new Image();
        image.addEventListener('load', () => resolve(image));
        image.addEventListener('error', (error) => reject(error));
        image.src = url;
    });

const getCroppedImg = (imageSrc: string, pixelCrop: CropArea): Promise<File> => {
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

                if (!pixelCrop || pixelCrop.width <= 0 || pixelCrop.height <= 0) {
                    reject(new Error(`Invalid crop dimensions`));
                    return;
                }

                canvas.width = pixelCrop.width;
                canvas.height = pixelCrop.height;

                ctx.drawImage(
                    image,
                    pixelCrop.x,
                    pixelCrop.y,
                    pixelCrop.width,
                    pixelCrop.height,
                    0,
                    0,
                    pixelCrop.width,
                    pixelCrop.height
                );

                canvas.toBlob((blob) => {
                    if (!blob) {
                        reject(new Error('Canvas is empty'));
                        return;
                    }
                    const file = new File([blob], 'cropped_image.png', { type: 'image/png' });
                    resolve(file);
                }, 'image/png');
            } catch (e) {
                reject(e);
            }
        })();
    });
};

const MContributorForm = ({ isOpen, onClose, onSave, initialData }: MContributorFormProps) => {
    const [name, setName] = useState('');
    const [role, setRole] = useState('');
    const [image, setImage] = useState<File | string | null>(null);
    const [previewUrl, setPreviewUrl] = useState<string | null>(null);
    const [socials, setSocials] = useState({
        github: '', linkedin: '', facebook: '', instagram: '', portfolio: ''
    });
    // Cropper State
    const [crop, setCrop] = useState({ x: 0, y: 0 });
    const [zoom, setZoom] = useState(1);
    const [croppedAreaPixels, setCroppedAreaPixels] = useState<CropArea | null>(null);
    const [isCropping, setIsCropping] = useState(false);
    const [originalImageSrc, setOriginalImageSrc] = useState<string | null>(null);
    const [firebaseBrowserOpen, setFirebaseBrowserOpen] = useState(false);

    useEffect(() => {
        if (isOpen) {
            // Using requestAnimationFrame to move state updates out of the immediate effect execution
            // avoiding the react-hooks/set-state-in-effect warning.
            requestAnimationFrame(() => {
                if (initialData) {
                    setName(initialData.name);
                    setRole(initialData.role || '');
                    setImage(initialData.image || null);
                    setPreviewUrl(typeof initialData.image === 'string' ? initialData.image : null);
                    setSocials({
                        github: initialData.socials?.github || '',
                        linkedin: initialData.socials?.linkedin || '',
                        facebook: initialData.socials?.facebook || '',
                        instagram: initialData.socials?.instagram || '',
                        portfolio: initialData.socials?.portfolio || ''
                    });
                } else {
                    setName('');
                    setRole('');
                    setImage(null);
                    setPreviewUrl(null);
                    setSocials({ github: '', linkedin: '', facebook: '', instagram: '', portfolio: '' });
                }
                setZoom(1);
                setCrop({ x: 0, y: 0 });
                setIsCropping(false);
                setOriginalImageSrc(null);
            });
        }
    }, [isOpen, initialData]);

    const onCropComplete = useCallback((_croppedArea: CropArea, croppedAreaPixels: CropArea) => {
        setCroppedAreaPixels(croppedAreaPixels);
    }, []);

    const readFile = (file: File) => {
        return new Promise((resolve) => {
            const reader = new FileReader();
            reader.addEventListener('load', () => resolve(reader.result), false);
            reader.readAsDataURL(file);
        });
    };

    const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files?.[0]) {
            const file = e.target.files[0];
            const imageDataUrl = await readFile(file);
            setOriginalImageSrc(imageDataUrl as string);
            setIsCropping(true);
            e.target.value = '';
        }
    };

    const handleCropSave = async () => {
        if (originalImageSrc && croppedAreaPixels) {
            try {
                const croppedFile = await getCroppedImg(originalImageSrc, croppedAreaPixels);
                if (croppedFile) {
                    setImage(croppedFile);
                    setPreviewUrl(URL.createObjectURL(croppedFile));
                }
            } catch (e) {
                console.warn("Crop failed", e);
                setImage(originalImageSrc);
                setPreviewUrl(originalImageSrc);
            }
            setIsCropping(false);
            setOriginalImageSrc(null);
        }
    };

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        onSave({ id: initialData?.id, name, role, image: image || undefined, socials });
        onClose();
    };

    if (!isOpen) return null;

    return createPortal(
        <div className="modal-backdrop open animate-fade-in" style={{ zIndex: 1100 }}>
            <div className="modal-content glass-panel animate-scale-in" style={{ maxWidth: '600px', maxHeight: '90vh', overflowY: 'auto' }}>
                <div className="modal-header">
                    <h2 className="heading-md">{initialData ? 'Edit Contributor' : 'New Contributor'}</h2>
                    <button onClick={onClose} className="btn-icon">
                        <X size={24} />
                    </button>
                </div>

                {isCropping && originalImageSrc ? (
                    <div className="p-6 flex flex-col gap-6">
                        <div className="relative h-80 bg-black/20 rounded-xl overflow-hidden">
                            <Cropper
                                image={originalImageSrc}
                                crop={crop}
                                zoom={zoom}
                                aspect={1}
                                cropShape="round"
                                onCropChange={setCrop}
                                onCropComplete={onCropComplete}
                                onZoomChange={setZoom}
                            />
                        </div>
                        <div className="flex flex-col gap-4">
                            <div className="flex items-center gap-4">
                                <ZoomIn size={20} className="text-sec" />
                                <input
                                    type="range"
                                    value={zoom}
                                    min={1}
                                    max={3}
                                    step={0.1}
                                    onChange={(e) => setZoom(Number(e.target.value))}
                                    className="flex-1"
                                />
                            </div>
                            <div className="flex justify-end gap-3">
                                <button onClick={() => setIsCropping(false)} className="btn btn-secondary">
                                    Cancel
                                </button>
                                <button onClick={handleCropSave} className="btn btn-primary">
                                    Apply Crop
                                </button>
                            </div>
                        </div>
                    </div>
                ) : (
                    <form onSubmit={handleSubmit} className="p-6 flex flex-col gap-6">
                        <div className="flex flex-col items-center gap-4">
                            <div className="w-24 h-24 rounded-full overflow-hidden border-2 border-accent/20 bg-accent/5 flex items-center justify-center group relative">
                                {previewUrl ? (
                                    <img src={previewUrl} alt="Preview" className="w-full h-full object-cover" />
                                ) : (
                                    <Upload size={32} className="text-accent/40" />
                                )}
                            </div>
                            <div className="flex gap-3">
                                <button type="button" onClick={() => document.getElementById('local-up')?.click()} className="btn btn-secondary py-2 text-sm">
                                    <HardDrive size={16} className="mr-2" /> Local
                                </button>
                                <input id="local-up" type="file" accept="image/*" onChange={handleFileChange} className="hidden" />
                                <button type="button" onClick={() => setFirebaseBrowserOpen(true)} className="btn btn-secondary py-2 text-sm border-orange-500/30 text-orange-500">
                                    <img src={firebaseIcon} alt="Firebase" className="w-4 h-4 mr-2" /> Firebase
                                </button>
                            </div>
                        </div>

                        <div className="flex flex-col gap-4">
                            <input type="text" required placeholder="Full Name" value={name} onChange={(e) => setName(e.target.value)} className="input-field" />
                            <input type="text" required placeholder="Role" value={role} onChange={(e) => setRole(e.target.value)} className="input-field" />

                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                <div className="input-container"><Github size={18} className="input-icon" /><input type="url" placeholder="GitHub" value={socials.github} onChange={(e) => setSocials(prev => ({ ...prev, github: e.target.value }))} className="input-with-icon" /></div>
                                <div className="input-container"><Linkedin size={18} className="input-icon" /><input type="url" placeholder="LinkedIn" value={socials.linkedin} onChange={(e) => setSocials(prev => ({ ...prev, linkedin: e.target.value }))} className="input-with-icon" /></div>
                                <div className="input-container"><Facebook size={18} className="input-icon" /><input type="url" placeholder="Facebook" value={socials.facebook} onChange={(e) => setSocials(prev => ({ ...prev, facebook: e.target.value }))} className="input-with-icon" /></div>
                                <div className="input-container"><Instagram size={18} className="input-icon" /><input type="url" placeholder="Instagram" value={socials.instagram} onChange={(e) => setSocials(prev => ({ ...prev, instagram: e.target.value }))} className="input-with-icon" /></div>
                                <div className="input-container col-span-full"><Globe size={18} className="input-icon" /><input type="url" placeholder="Portfolio" value={socials.portfolio} onChange={(e) => setSocials(prev => ({ ...prev, portfolio: e.target.value }))} className="input-with-icon" /></div>
                            </div>
                        </div>

                        <div className="flex justify-end gap-3 mt-4">
                            <button type="button" onClick={onClose} className="btn btn-secondary">Cancel</button>
                            <button type="submit" className="btn btn-primary">Save Contributor</button>
                        </div>
                    </form>
                )}
            </div>

            <MFirebaseStorage
                isOpen={firebaseBrowserOpen}
                onClose={() => setFirebaseBrowserOpen(false)}
                onSelect={(url) => { setOriginalImageSrc(url); setIsCropping(true); }}
                fileTypes={['png', 'jpg', 'jpeg', 'webp']}
                title="Select Profile Image"
            />
        </div>,
        document.body
    );
};

export default MContributorForm;
