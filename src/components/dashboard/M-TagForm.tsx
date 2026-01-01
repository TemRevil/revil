import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { X, Check, HardDrive } from 'lucide-react';
import MFirebaseStorage from './M-FirebaseStorage';
import firebaseIcon from '../../assets/svgs/firebase.svg';

export interface TagData {
    id?: string;
    name: string;
    color: string;
    iconSvg?: string; // SVG string content
    iconFile?: File;
}

interface MTagFormProps {
    isOpen: boolean;
    onClose: () => void;
    onSave: (data: TagData) => void;
    initialData?: TagData | null;
}

const MTagForm = ({ isOpen, onClose, onSave, initialData }: MTagFormProps) => {
    const [name, setName] = useState('');
    const [color, setColor] = useState('#3b82f6');
    const [iconSvg, setIconSvg] = useState<string>('');
    const [iconFile, setIconFile] = useState<File | null>(null);
    const [isDark, setIsDark] = useState(false);
    const [firebaseBrowserOpen, setFirebaseBrowserOpen] = useState(false);

    useEffect(() => {
        if (isOpen) {
            if (initialData) {
                setName(initialData.name);
                setColor(initialData.color);
                setIconSvg(initialData.iconSvg || '');
                setIconFile(null); // Reset file on open
            } else {
                setName('');
                setColor('#3b82f6');
                setIconSvg('');
                setIconFile(null);
            }
        }
    }, [isOpen, initialData]);

    useEffect(() => {
        const checkTheme = () => setIsDark(document.documentElement.classList.contains('dark'));
        checkTheme();
        const observer = new MutationObserver(checkTheme);
        observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
        return () => observer.disconnect();
    }, []);

    if (!isOpen) return null;

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file && file.type === 'image/svg+xml') {
            setIconFile(file);
            const reader = new FileReader();
            reader.onload = (event) => {
                setIconSvg(event.target?.result as string);
            };
            reader.readAsText(file);
        }
    };

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        onSave({
            id: initialData?.id,
            name,
            color,
            iconSvg,
            iconFile: iconFile || undefined
        });
        onClose();
    };

    if (!isOpen) return null;

    return createPortal(
        <div style={{
            position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh',
            backgroundColor: 'rgba(0, 0, 0, 0.4)',
            backdropFilter: 'blur(8px)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            zIndex: 1100,
            animation: 'fadeIn 0.2s ease-out'
        }}>
            <div style={{
                width: '90%', maxWidth: '500px',
                backgroundColor: isDark ? 'rgba(20, 20, 20, 0.85)' : 'rgba(255, 255, 255, 0.85)',
                backdropFilter: 'blur(12px)',
                WebkitBackdropFilter: 'blur(12px)',
                borderRadius: '24px',
                boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
                border: `1px solid ${isDark ? 'rgba(255,255,255,0.15)' : 'rgba(0,0,0,0.1)'}`,
                overflow: 'hidden',
                animation: 'scaleIn 0.2s ease-out'
            }}>
                <div style={{
                    padding: '24px',
                    borderBottom: `1px solid ${isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)'}`,
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center'
                }}>
                    <h2 style={{ margin: 0, fontSize: '1.25rem', color: 'var(--text-primary)' }}>
                        {initialData ? 'Edit Tag' : 'New Tag'}
                    </h2>
                    <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer' }}>
                        <X size={24} />
                    </button>
                </div>

                <form onSubmit={handleSubmit} style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '24px' }}>
                    {/* Preview */}
                    <div style={{ display: 'flex', justifyContent: 'center', padding: '12px' }}>
                        <div style={{
                            padding: '8px 16px',
                            borderRadius: '24px',
                            backgroundColor: `${color}20`,
                            color: color,
                            display: 'flex', alignItems: 'center', gap: '8px',
                            fontSize: '1rem', fontWeight: 600,
                            border: `1px solid ${color}40`
                        }}>
                            {iconSvg ? (
                                iconSvg.trim().startsWith('http') ? (
                                    <img src={iconSvg} alt="" style={{ width: '18px', height: '18px', objectFit: 'contain' }} />
                                ) : (
                                    <div
                                        style={{ width: '18px', height: '18px', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', color: 'inherit' }}
                                        dangerouslySetInnerHTML={{ __html: iconSvg }}
                                    />
                                )
                            ) : (
                                <span style={{ width: '18px', height: '18px', borderRadius: '4px', backgroundColor: `${color}40` }} />
                            )}
                            {name || 'Tag Name'}
                        </div>
                    </div>

                    {/* Name Input */}
                    <div>
                        <label style={{ display: 'block', marginBottom: '8px', color: 'var(--text-secondary)', fontSize: '0.9rem' }}>Tag Name</label>
                        <input
                            type="text"
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            required
                            placeholder="e.g. React"
                            style={{
                                width: '100%', padding: '12px', borderRadius: '12px',
                                backgroundColor: isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)',
                                border: 'none', color: 'var(--text-primary)', outline: 'none'
                            }}
                        />
                    </div>

                    {/* Color Picker */}
                    <div>
                        <label style={{ display: 'block', marginBottom: '8px', color: 'var(--text-secondary)', fontSize: '0.9rem' }}>Color</label>
                        <div style={{ display: 'flex', alignItems: 'center' }}>
                            <input
                                type="text"
                                value={color}
                                onChange={(e) => {
                                    let val = e.target.value;
                                    if (!val.startsWith('#')) val = '#' + val;
                                    if (/^#[0-9A-Fa-f]{0,6}$/.test(val)) setColor(val);
                                }}
                                placeholder="#3b82f6"
                                style={{
                                    flex: 1,
                                    padding: '12px',
                                    borderRadius: '12px 0 0 12px',
                                    backgroundColor: isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)',
                                    border: 'none',
                                    color: 'var(--text-primary)',
                                    outline: 'none',
                                    fontFamily: 'monospace',
                                    fontSize: '0.95rem'
                                }}
                            />
                            <div style={{ position: 'relative' }}>
                                <input
                                    type="color"
                                    value={color.length === 7 ? color : '#3b82f6'}
                                    onChange={(e) => setColor(e.target.value)}
                                    style={{
                                        position: 'absolute',
                                        width: '100%',
                                        height: '100%',
                                        opacity: 0,
                                        cursor: 'pointer'
                                    }}
                                />
                                <div style={{
                                    width: '48px',
                                    height: '48px',
                                    borderRadius: '0 12px 12px 0',
                                    backgroundColor: color.length === 7 ? color : '#3b82f6',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    cursor: 'pointer',
                                    border: `1px solid ${isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)'}`
                                }}>
                                    <Check size={20} color="white" style={{ opacity: 0.8 }} />
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Icon Upload */}
                    <div>
                        <label style={{ display: 'block', marginBottom: '8px', color: 'var(--text-secondary)', fontSize: '0.9rem' }}>Icon (SVG)</label>

                        {/* Preview */}
                        {iconSvg && (
                            <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '12px' }}>
                                <div style={{ width: '64px', height: '64px', borderRadius: '12px', backgroundColor: isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.03)', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
                                    {iconSvg.trim().startsWith('http') ? (
                                        <img src={iconSvg} alt="Preview" style={{ width: '48px', height: '48px', objectFit: 'contain' }} />
                                    ) : (
                                        <div
                                            style={{ width: '48px', height: '48px', color: color, display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}
                                            dangerouslySetInnerHTML={{ __html: iconSvg }}
                                        />
                                    )}
                                </div>
                            </div>
                        )}

                        {/* Upload Buttons */}
                        <div style={{ display: 'flex', gap: '12px' }}>
                            {/* Local Upload */}
                            <div
                                onClick={() => document.getElementById('tagIconUpload')?.click()}
                                style={{
                                    flex: 1,
                                    border: `2px dashed ${isDark ? 'rgba(255,255,255,0.2)' : 'rgba(0,0,0,0.2)'}`,
                                    borderRadius: '12px',
                                    padding: '16px',
                                    textAlign: 'center',
                                    cursor: 'pointer',
                                    backgroundColor: isDark ? 'rgba(255,255,255,0.02)' : 'rgba(0,0,0,0.02)',
                                    display: 'flex',
                                    flexDirection: 'column',
                                    alignItems: 'center',
                                    gap: '8px',
                                    transition: 'all 0.2s'
                                }}
                            >
                                <HardDrive size={24} style={{ color: 'var(--text-secondary)' }} />
                                <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Local File</span>
                                <input
                                    id="tagIconUpload"
                                    type="file"
                                    accept=".svg"
                                    onChange={handleFileChange}
                                    style={{ display: 'none' }}
                                />
                            </div>

                            {/* Firebase Storage */}
                            <div
                                onClick={() => setFirebaseBrowserOpen(true)}
                                style={{
                                    flex: 1,
                                    border: '2px dashed rgba(255, 160, 0, 0.4)',
                                    borderRadius: '12px',
                                    padding: '16px',
                                    textAlign: 'center',
                                    cursor: 'pointer',
                                    backgroundColor: 'rgba(255, 160, 0, 0.05)',
                                    display: 'flex',
                                    flexDirection: 'column',
                                    alignItems: 'center',
                                    gap: '8px',
                                    transition: 'all 0.2s'
                                }}
                            >
                                <img src={firebaseIcon} alt="Firebase" style={{ width: '24px', height: '24px' }} />
                                <span style={{ fontSize: '0.8rem', color: '#FFA000' }}>Firebase Storage</span>
                            </div>
                        </div>
                    </div>

                    {/* Firebase Storage Browser */}
                    <MFirebaseStorage
                        isOpen={firebaseBrowserOpen}
                        onClose={() => setFirebaseBrowserOpen(false)}
                        onSelect={(url) => { setIconSvg(url); setIconFile(null); }}
                        fileTypes={['svg', 'png', 'jpg', 'jpeg', 'gif', 'webp']}
                        title="Select Icon from Firebase"
                    />

                    <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px', marginTop: '12px' }}>
                        <button type="button" onClick={onClose} style={{
                            padding: '12px 24px', borderRadius: '12px', border: 'none', background: 'transparent',
                            color: 'var(--text-secondary)', cursor: 'pointer', fontWeight: 500
                        }}>
                            Cancel
                        </button>
                        <button type="submit" style={{
                            padding: '12px 24px', borderRadius: '12px', border: 'none',
                            backgroundColor: color, color: 'white', cursor: 'pointer', fontWeight: 600,
                            boxShadow: `0 4px 12px ${color}40`
                        }}>
                            Save Tag
                        </button>
                    </div>
                </form>
            </div>
        </div>,
        document.body
    );
};

export default MTagForm;
