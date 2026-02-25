import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { X, Save } from 'lucide-react';


export interface HandlingProject {
    id: string;
    name: string;
    description?: string;
    status: 'active' | 'pending' | 'completed';
}

interface MHandlingProjectProps {
    isOpen: boolean;
    onClose: () => void;
    onSave: (name: string, description: string, status: 'active' | 'pending' | 'completed') => void;
    initialData?: HandlingProject | null;
}

const MHandlingProject = ({ isOpen, onClose, onSave, initialData }: MHandlingProjectProps) => {
    const [name, setName] = useState('');
    const [description, setDescription] = useState('');
    const [status, setStatus] = useState<'active' | 'pending' | 'completed'>('active');

    useEffect(() => {
        if (isOpen) {
            requestAnimationFrame(() => {
                if (initialData) {
                    setName(initialData.name);
                    setDescription(initialData.description || '');
                    setStatus(initialData.status);
                } else {
                    setName('');
                    setDescription('');
                    setStatus('active');
                }
            });
        }
    }, [initialData, isOpen]);

    if (!isOpen) return null;

    return createPortal(
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-[1100] flex items-center justify-center animate-fade-in p-4">
            <div className="glass-panel w-full max-w-[500px] overflow-hidden animate-scale-in">
                <div className="p-6 border-b border-gray-500/10 flex justify-between items-center">
                    <h2 className="heading-md text-base sm:text-lg md:text-xl">{initialData ? 'Edit Project' : 'Add Project'}</h2>
                    <button onClick={onClose} className="btn-icon"><X size={24} /></button>
                </div>
                <div className="p-6 flex flex-col gap-4">
                    <div>
                        <label className="input-label">Project Name *</label>
                        <input
                            type="text"
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            placeholder="Enter project name..."
                            className="input-field"
                        />
                    </div>
                    <div>
                        <label className="input-label">Description (optional)</label>
                        <textarea
                            value={description}
                            onChange={(e) => setDescription(e.target.value)}
                            placeholder="Brief description..."
                            className="input-field h-24 resize-y"
                        />
                    </div>
                    <div>
                        <label className="input-label">Status</label>
                        <div className="flex gap-2 flex-wrap">
                            {(['active', 'pending', 'completed'] as const).map(s => (
                                <button
                                    key={s}
                                    onClick={() => setStatus(s)}
                                    className={`px-4 py-2 rounded-md border text-sm font-medium cursor-pointer transition-all ${status === s ? 'border-blue-500 bg-blue-500/10 text-blue-500' : 'border-gray-500/20 bg-transparent text-sec hover:bg-gray-500/5'}`}
                                >
                                    {s.charAt(0).toUpperCase() + s.slice(1)}
                                </button>
                            ))}
                        </div>
                    </div>
                    <div className="flex justify-end gap-3">
                        <button onClick={onClose} className="btn btn-secondary">Cancel</button>
                        <button
                            onClick={() => onSave(name, description, status)}
                            disabled={!name.trim()}
                            className="btn btn-primary"
                        >
                            <Save size={18} /> {initialData ? 'Save' : 'Add'}
                        </button>
                    </div>
                </div>
            </div>
        </div>,
        document.body
    );
};

export default MHandlingProject;
