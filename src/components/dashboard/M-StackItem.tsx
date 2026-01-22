import { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { X, Save, Code, HardDrive } from 'lucide-react';
import MFirebaseStorage from './M-FirebaseStorage';
import firebaseIcon from '../../assets/svgs/firebase.svg';

export interface StackItemData {
    id?: string;
    name: string;
    icon: string;
    iconFile?: File | null;
    percentage: number;
    information?: string;
}

interface MStackItemProps {
    isOpen: boolean;
    onClose: () => void;
    onSave: (data: StackItemData) => void;
    initialData?: StackItemData | null;
}

const MStackItem = ({ isOpen, onClose, onSave, initialData }: MStackItemProps) => {
    const [name, setName] = useState('');
    const [icon, setIcon] = useState('');
    const [iconFile, setIconFile] = useState<File | null>(null);
    const [percentage, setPercentage] = useState(50);
    const [information, setInformation] = useState('');
    const [firebaseBrowserOpen, setFirebaseBrowserOpen] = useState(false);
    const iconInputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        if (initialData) {
            setName(initialData.name);
            setIcon(initialData.icon);
            setIconFile(null);
            setPercentage(initialData.percentage);
            setInformation(initialData.information || '');
        } else {
            setName('');
            setIcon('');
            setIconFile(null);
            setPercentage(50);
            setInformation('');
        }
    }, [initialData, isOpen]);

    const handleIconUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file && file.type === 'image/svg+xml') {
            setIconFile(file);
            const reader = new FileReader();
            reader.onload = (event) => setIcon(event.target?.result as string);
            reader.readAsDataURL(file);
        }
    };

    if (!isOpen) return null;

    return createPortal(
        <>
            <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-[1100] flex items-center justify-center animate-fade-in p-4">
                <div className="glass-panel w-full max-w-[500px] overflow-hidden animate-scale-in">
                    <div className="p-6 border-b border-gray-500/10 flex justify-between items-center">
                        <h2 className="heading-md text-base sm:text-lg md:text-xl">{initialData ? 'Edit Stack' : 'Add Stack'}</h2>
                        <button onClick={onClose} className="btn-icon"><X size={24} /></button>
                    </div>
                    <div className="p-6 flex flex-col gap-4">
                        <div>
                            <label className="input-label">Technology Name</label>
                            <input
                                type="text"
                                value={name}
                                onChange={(e) => setName(e.target.value)}
                                placeholder="e.g., React, Node.js..."
                                className="input-field"
                            />
                        </div>
                        <div>
                            <label className="input-label">SVG Icon</label>
                            <div className="flex flex-col sm:flex-row gap-4">
                                {/* Preview */}
                                <div className="flex-shrink-0 mx-auto sm:mx-0">
                                    <div className={`w-24 h-24 rounded-xl border-2 border-dashed ${icon ? 'border-blue-500 bg-blue-500/5' : 'border-gray-500/20'} flex items-center justify-center p-2 relative group`}>
                                        {icon ? (
                                            <>
                                                <img src={icon} alt="Icon" className="w-full h-full object-contain" />
                                                <div className="absolute inset-0 bg-black/40 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center cursor-pointer" onClick={() => { setIcon(''); setIconFile(null); }}>
                                                    <X size={20} className="text-white" />
                                                </div>
                                            </>
                                        ) : (
                                            <Code size={32} className="text-sec opacity-50" />
                                        )}
                                    </div>
                                </div>

                                {/* Upload Options */}
                                <div className="flex-1 grid grid-cols-2 sm:grid-cols-1 gap-3 content-center">
                                    {/* Local Upload */}
                                    <div
                                        onClick={() => iconInputRef.current?.click()}
                                        className="p-3 rounded-lg border border-gray-500/20 hover:bg-gray-500/5 cursor-pointer flex items-center justify-center sm:justify-start gap-3 transition-colors"
                                    >
                                        <div className="p-1.5 rounded-md bg-gray-500/10">
                                            <HardDrive size={16} className="text-sec" />
                                        </div>
                                        <span className="text-xs text-sec font-medium">Upload Local File</span>
                                        <input ref={iconInputRef} type="file" accept=".svg,image/svg+xml" onChange={handleIconUpload} style={{ display: 'none' }} />
                                    </div>

                                    {/* Firebase Selection */}
                                    <div
                                        onClick={() => setFirebaseBrowserOpen(true)}
                                        className="p-3 rounded-lg border border-orange-500/20 bg-orange-500/5 hover:bg-orange-500/10 cursor-pointer flex items-center justify-center sm:justify-start gap-3 transition-colors"
                                    >
                                        <div className="p-1.5 rounded-md bg-orange-500/10">
                                            <img src={firebaseIcon} alt="Firebase" className="w-4 h-4" />
                                        </div>
                                        <span className="text-xs text-orange-500 font-medium">Select from Firebase</span>
                                    </div>
                                </div>
                            </div>
                            <p className="text-center sm:text-left text-muted text-[10px] mt-1 pl-1">SVG files recommended for best quality</p>
                        </div>
                        <div>
                            <label className="input-label">Information</label>
                            <textarea
                                value={information}
                                onChange={(e) => setInformation(e.target.value)}
                                placeholder="Add some details about this technology..."
                                className="input-field h-20 resize-y"
                            />
                        </div>
                        <div>
                            <div className="flex-row-between mb-2">
                                <label className="input-label mb-0">Proficiency Level</label>
                                <span className="font-bold text-blue-500">{percentage}%</span>
                            </div>
                            <input
                                type="range"
                                min="0"
                                max="100"
                                value={percentage}
                                onChange={(e) => setPercentage(Number(e.target.value))}
                                className="w-full cursor-pointer accent-blue-500"
                            />
                        </div>
                        <div className="flex justify-end gap-3">
                            <button onClick={onClose} className="btn btn-secondary">Cancel</button>
                            <button
                                onClick={() => onSave({ id: initialData?.id, name, icon, iconFile, percentage, information })}
                                disabled={!name.trim() || !icon}
                                className="btn btn-primary"
                            >
                                <Save size={18} /> {initialData ? 'Save' : 'Add'}
                            </button>
                        </div>
                    </div>
                </div>
            </div>

            <MFirebaseStorage
                isOpen={firebaseBrowserOpen}
                onClose={() => setFirebaseBrowserOpen(false)}
                onSelect={(url) => {
                    setIcon(url);
                    setIconFile(null);
                    setFirebaseBrowserOpen(false);
                }}
                fileTypes={['svg']}
                title="Select Stack Icon"
            />
        </>,
        document.body
    );
};

export default MStackItem;
