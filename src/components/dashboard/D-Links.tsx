import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Link2, Copy, Check, RefreshCw, ExternalLink, MoreVertical, Edit2, Trash2, Eye, EyeOff } from 'lucide-react';
import anime from 'animejs';
import Loader from '../reactbits/Loader';

interface GeneratedLink {
    id: string;
    name: string;
    forField: string;
    code: string;
    fullLink: string;
    viewed: boolean;
    counts: number;
    createdAt: Date;
}

const DLinks = () => {
    const [isLoading, setIsLoading] = useState(false);
    const [isDark, setIsDark] = useState(false);
    const [windowWidth, setWindowWidth] = useState(window.innerWidth);
    const [name, setName] = useState('');
    const [forField, setForField] = useState('');
    const [generatedLinks, setGeneratedLinks] = useState<GeneratedLink[]>([]);
    const [copied, setCopied] = useState<string | null>(null);
    const [activeMenu, setActiveMenu] = useState<string | null>(null);
    const [menuPos, setMenuPos] = useState({ top: 0, right: 0 });
    const [editingLink, setEditingLink] = useState<GeneratedLink | null>(null);
    const [editName, setEditName] = useState('');
    const [editFor, setEditFor] = useState('');
    const [revealed, setRevealed] = useState(false);

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

    useEffect(() => {
        if (generatedLinks.length > 0) {
            anime({
                targets: '.links-row',
                opacity: [0, 1],
                translateX: [10, 0],
                delay: anime.stagger(20),
                duration: 300,
                easing: 'easeOutExpo',
                complete: () => setRevealed(true)
            });
        } else {
            setRevealed(true);
        }
    }, [generatedLinks.length]);

    useEffect(() => {
        // Entrance animation for the container
        anime({
            targets: '.links-section-container',
            opacity: [0, 1],
            translateY: [15, 0],
            duration: 500,
            easing: 'easeOutExpo'
        });
    }, []);

    const generateCode = () => {
        if (!name.trim() || !forField.trim()) return;

        setIsLoading(true);
        // Generate a random alphanumeric code
        const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
        let code = '';
        for (let i = 0; i < 8; i++) {
            code += chars.charAt(Math.floor(Math.random() * chars.length));
        }

        const domain = window.location.origin;
        const fullLink = `${domain}/${code}`;

        setTimeout(() => {
            const newLink: GeneratedLink = {
                id: Date.now().toString(),
                name: name.trim(),
                forField: forField.trim(),
                code,
                fullLink,
                viewed: false,
                counts: 0,
                createdAt: new Date()
            };
            setGeneratedLinks(prev => [newLink, ...prev]);
            setName('');
            setForField('');
            setIsLoading(false);
        }, 300);
    };

    const copyToClipboard = async (link: string, id: string) => {
        try {
            await navigator.clipboard.writeText(link);
            setCopied(id);
            setTimeout(() => setCopied(null), 2000);
        } catch (err) {
            console.error('Failed to copy:', err);
        }
    };

    const handleDeleteLink = (id: string) => {
        setGeneratedLinks(prev => prev.filter(l => l.id !== id));
        setActiveMenu(null);
    };

    const handleEditClick = (link: GeneratedLink) => {
        setEditingLink(link);
        setEditName(link.name);
        setEditFor(link.forField);
        setActiveMenu(null);
    };

    const handleSaveEdit = () => {
        if (!editingLink || !editName.trim() || !editFor.trim()) return;

        setGeneratedLinks(prev => prev.map(l =>
            l.id === editingLink.id
                ? { ...l, name: editName.trim(), forField: editFor.trim() }
                : l
        ));
        setEditingLink(null);
        setEditName('');
        setEditFor('');
    };

    const handleMenuClick = (e: React.MouseEvent<HTMLButtonElement>, linkId: string) => {
        e.stopPropagation();
        const rect = e.currentTarget.getBoundingClientRect();
        // Position below the button, right-aligned with it
        // using documentElement.clientWidth to exclude scrollbar width for accurate right positioning
        setMenuPos({ top: rect.bottom + 2, right: document.documentElement.clientWidth - rect.right });
        setActiveMenu(activeMenu === linkId ? null : linkId);

        if (activeMenu !== linkId) {
            setTimeout(() => {
                anime({
                    targets: '.links-options-menu',
                    opacity: [0, 1],
                    scale: [0.98, 1],
                    translateX: [10, 0],
                    duration: 200,
                    easing: 'easeOutExpo'
                });
            }, 0);
        }
    };

    // Responsive sizing
    const containerPadding = isExtraSmall ? '16px' : (isSmall ? '20px' : '32px');
    const containerRadius = isExtraSmall ? '16px' : '24px';
    const iconBoxSize = isExtraSmall ? '40px' : '48px';
    const titleSize = isExtraSmall ? '1.1rem' : (isSmall ? '1.25rem' : '1.5rem');
    const subtitleSize = isExtraSmall ? '0.8rem' : '0.9rem';
    const iconSize = isExtraSmall ? 20 : 24;
    const inputPadding = isExtraSmall ? '12px 14px' : '14px 18px';
    const inputFontSize = isExtraSmall ? '0.85rem' : '0.95rem';
    const buttonPadding = isExtraSmall ? '12px 20px' : '14px 28px';
    const buttonFontSize = isExtraSmall ? '0.85rem' : '0.95rem';
    const gap = isExtraSmall ? '16px' : '24px';

    const inputStyle = {
        width: '100%',
        padding: inputPadding,
        backgroundColor: isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)',
        border: `1px solid ${isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)'}`,
        borderRadius: isExtraSmall ? '10px' : '12px',
        color: 'var(--text-primary)',
        fontFamily: "'Inter', sans-serif",
        fontSize: inputFontSize,
        outline: 'none',
        transition: 'border-color 0.2s, background-color 0.2s',
        boxSizing: 'border-box' as const
    };

    return (
        <div className="links-section-container" style={{ height: '90%', display: 'flex', flexDirection: 'column', gap: gap, opacity: 0 }}>
            <Loader isOpen={isLoading} isFullScreen={true} />
            {/* Link Generator Section */}
            <div style={{
                backgroundColor: isDark ? '#00000040' : '#ffffff59',
                backdropFilter: 'blur(12px)',
                borderRadius: containerRadius,
                border: `1px solid ${isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.05)'}`,
                padding: containerPadding,
            }}>
                <div style={{
                    display: 'flex',
                    alignItems: isExtraSmall ? 'flex-start' : 'center',
                    gap: '12px',
                    marginBottom: isExtraSmall ? '16px' : '24px',
                    flexDirection: isExtraSmall ? 'column' : 'row'
                }}>
                    <div style={{
                        width: iconBoxSize,
                        height: iconBoxSize,
                        minWidth: iconBoxSize,
                        borderRadius: isExtraSmall ? '10px' : '12px',
                        background: 'linear-gradient(135deg, rgb(59, 130, 246), rgb(147, 51, 234))',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        boxShadow: '0 4px 12px rgba(59, 130, 246, 0.3)'
                    }}>
                        <Link2 size={iconSize} color="white" />
                    </div>
                    <div>
                        <h2 style={{
                            margin: 0,
                            fontSize: titleSize,
                            fontWeight: 700,
                            color: 'var(--text-primary)',
                            fontFamily: "'Inter', sans-serif"
                        }}>
                            Link Generator
                        </h2>
                        <p style={{
                            margin: 0,
                            fontSize: subtitleSize,
                            color: 'var(--text-secondary)',
                            fontFamily: "'Inter', sans-serif",
                            display: isExtraSmall ? 'none' : 'block'
                        }}>
                            Generate unique shareable links for your projects
                        </p>
                    </div>
                </div>

                {/* Input Fields */}
                <div style={{
                    display: 'flex',
                    gap: isExtraSmall ? '12px' : '16px',
                    marginBottom: isExtraSmall ? '16px' : '20px',
                    flexDirection: isExtraSmall ? 'column' : 'row',
                    flexWrap: 'wrap'
                }}>
                    <div style={{ flex: 1, minWidth: isExtraSmall ? '100%' : '200px' }}>
                        <label style={{
                            display: 'block',
                            marginBottom: isExtraSmall ? '6px' : '8px',
                            color: 'var(--text-secondary)',
                            fontSize: isExtraSmall ? '0.8rem' : '0.85rem',
                            fontWeight: 500,
                            fontFamily: "'Inter', sans-serif"
                        }}>
                            Name
                        </label>
                        <input
                            type="text"
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            placeholder="Enter link name..."
                            style={inputStyle}
                        />
                    </div>
                    <div style={{ flex: 1, minWidth: isExtraSmall ? '100%' : '200px' }}>
                        <label style={{
                            display: 'block',
                            marginBottom: isExtraSmall ? '6px' : '8px',
                            color: 'var(--text-secondary)',
                            fontSize: isExtraSmall ? '0.8rem' : '0.85rem',
                            fontWeight: 500,
                            fontFamily: "'Inter', sans-serif"
                        }}>
                            For
                        </label>
                        <input
                            type="text"
                            value={forField}
                            onChange={(e) => setForField(e.target.value)}
                            placeholder="What is this link for..."
                            style={inputStyle}
                        />
                    </div>
                </div>

                {/* Generate Button */}
                <button
                    onClick={generateCode}
                    disabled={!name.trim() || !forField.trim()}
                    style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: isExtraSmall ? '8px' : '10px',
                        padding: buttonPadding,
                        width: isExtraSmall ? '100%' : 'auto',
                        backgroundColor: (!name.trim() || !forField.trim())
                            ? (isDark ? 'rgba(59, 130, 246, 0.3)' : 'rgba(59, 130, 246, 0.5)')
                            : 'rgb(59, 130, 246)',
                        color: 'white',
                        border: 'none',
                        borderRadius: isExtraSmall ? '10px' : '12px',
                        fontFamily: "'Inter', sans-serif",
                        fontWeight: 600,
                        fontSize: buttonFontSize,
                        cursor: (!name.trim() || !forField.trim()) ? 'not-allowed' : 'pointer',
                        boxShadow: (!name.trim() || !forField.trim()) ? 'none' : '0 4px 12px rgba(59, 130, 246, 0.3)',
                        transition: 'all 0.2s ease',
                        opacity: (!name.trim() || !forField.trim()) ? 0.6 : 1
                    }}
                    onMouseEnter={(e) => {
                        if (name.trim() && forField.trim()) {
                            e.currentTarget.style.backgroundColor = 'rgb(37, 99, 235)';
                            e.currentTarget.style.transform = 'translateY(-1px)';
                        }
                    }}
                    onMouseLeave={(e) => {
                        if (name.trim() && forField.trim()) {
                            e.currentTarget.style.backgroundColor = 'rgb(59, 130, 246)';
                        }
                        e.currentTarget.style.transform = 'translateY(0)';
                    }}
                >
                    <RefreshCw size={18} />
                    Generate Link
                </button>
            </div>

            {/* Generated Links Table */}
            <div style={{
                flex: 1,
                backgroundColor: isDark ? '#00000040' : '#ffffff59',
                backdropFilter: 'blur(12px)',
                borderRadius: containerRadius,
                border: `1px solid ${isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.05)'}`,
                display: 'flex',
                flexDirection: 'column',
                overflow: 'hidden'
            }}>
                {/* Scrollable Table Container */}
                <div style={{
                    flex: 1,
                    overflowX: 'auto',
                    overflowY: 'auto'
                }}>
                    {/* Table with minimum width */}
                    <div style={{ minWidth: '800px' }}>
                        {/* Table Header */}
                        <div style={{
                            display: 'grid',
                            gridTemplateColumns: 'minmax(150px, 1fr) minmax(150px, 1fr) minmax(280px, 1.5fr) 100px 80px 60px',
                            padding: '16px 24px',
                            borderBottom: `1px solid ${isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.05)'}`,
                            color: 'var(--text-secondary)',
                            fontWeight: 600,
                            fontSize: '0.9rem',
                            fontFamily: "'Inter', sans-serif",
                            position: 'sticky',
                            top: 0,
                            backgroundColor: isDark ? 'rgba(0,0,0,0.6)' : 'rgba(255,255,255,0.8)',
                            backdropFilter: 'blur(12px)',
                            zIndex: 1
                        }}>
                            <div>Name</div>
                            <div>For</div>
                            <div>Link</div>
                            <div style={{ textAlign: 'center' }}>Viewed</div>
                            <div style={{ textAlign: 'center' }}>Counts</div>
                            <div style={{ textAlign: 'right' }}>Actions</div>
                        </div>

                        {/* Table Body */}
                        <div>
                            {generatedLinks.length === 0 ? (
                                <div style={{
                                    padding: '48px',
                                    textAlign: 'center',
                                    color: 'var(--text-secondary)',
                                    fontFamily: "'Inter', sans-serif"
                                }}>
                                    No links generated yet. Fill in the name and purpose above to create one.
                                </div>
                            ) : (
                                generatedLinks.map((link) => (
                                    <div key={link.id} className="links-row" style={{
                                        display: 'grid',
                                        gridTemplateColumns: 'minmax(150px, 1fr) minmax(150px, 1fr) minmax(280px, 1.5fr) 100px 80px 60px',
                                        padding: '16px 24px',
                                        borderBottom: `1px solid ${isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)'}`,
                                        alignItems: 'center',
                                        transition: 'background-color 0.2s',
                                        opacity: revealed ? 1 : 0
                                    }}
                                        onMouseEnter={(e) => e.currentTarget.style.backgroundColor = isDark ? 'rgba(255,255,255,0.02)' : 'rgba(0,0,0,0.02)'}
                                        onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                                    >
                                        {/* Name */}
                                        <div style={{
                                            fontWeight: 600,
                                            color: 'var(--text-primary)',
                                            fontFamily: "'Inter', sans-serif",
                                            overflow: 'hidden',
                                            textOverflow: 'ellipsis',
                                            whiteSpace: 'nowrap'
                                        }}>
                                            {link.name}
                                        </div>

                                        {/* For */}
                                        <div style={{
                                            color: 'var(--text-secondary)',
                                            fontFamily: "'Inter', sans-serif",
                                            fontSize: '0.9rem',
                                            overflow: 'hidden',
                                            textOverflow: 'ellipsis',
                                            whiteSpace: 'nowrap'
                                        }}>
                                            {link.forField}
                                        </div>

                                        {/* Link */}
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                            <code style={{
                                                flex: 1,
                                                padding: '8px 12px',
                                                backgroundColor: isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)',
                                                borderRadius: '8px',
                                                fontSize: '0.8rem',
                                                color: 'var(--text-primary)',
                                                fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
                                                overflow: 'hidden',
                                                textOverflow: 'ellipsis',
                                                whiteSpace: 'nowrap'
                                            }}>
                                                {link.fullLink}
                                            </code>
                                            <button
                                                onClick={() => copyToClipboard(link.fullLink, link.id)}
                                                style={{
                                                    padding: '8px',
                                                    borderRadius: '8px',
                                                    border: 'none',
                                                    backgroundColor: copied === link.id
                                                        ? 'rgb(34, 197, 94)'
                                                        : (isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.05)'),
                                                    color: copied === link.id ? 'white' : 'var(--text-secondary)',
                                                    cursor: 'pointer',
                                                    transition: 'all 0.2s ease',
                                                    display: 'flex',
                                                    alignItems: 'center',
                                                    justifyContent: 'center',
                                                    flexShrink: 0
                                                }}
                                            >
                                                {copied === link.id ? <Check size={14} /> : <Copy size={14} />}
                                            </button>
                                            <a
                                                href={link.fullLink}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                style={{
                                                    padding: '8px',
                                                    borderRadius: '8px',
                                                    backgroundColor: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.05)',
                                                    color: 'var(--text-secondary)',
                                                    display: 'flex',
                                                    alignItems: 'center',
                                                    justifyContent: 'center',
                                                    textDecoration: 'none',
                                                    flexShrink: 0
                                                }}
                                            >
                                                <ExternalLink size={14} />
                                            </a>
                                        </div>

                                        {/* Viewed */}
                                        <div style={{
                                            display: 'flex',
                                            justifyContent: 'center',
                                            alignItems: 'center'
                                        }}>
                                            <span style={{
                                                display: 'flex',
                                                alignItems: 'center',
                                                gap: '4px',
                                                padding: '4px 10px',
                                                borderRadius: '20px',
                                                fontSize: '0.75rem',
                                                fontWeight: 600,
                                                backgroundColor: link.viewed
                                                    ? 'rgba(34, 197, 94, 0.15)'
                                                    : 'rgba(239, 68, 68, 0.15)',
                                                color: link.viewed
                                                    ? 'rgb(34, 197, 94)'
                                                    : 'rgb(239, 68, 68)',
                                                whiteSpace: 'nowrap'
                                            }}>
                                                {link.viewed ? <Eye size={12} /> : <EyeOff size={12} />}
                                                {link.viewed ? 'Yes' : 'No'}
                                            </span>
                                        </div>

                                        {/* Counts */}
                                        <div style={{
                                            textAlign: 'center',
                                            fontWeight: 600,
                                            color: 'var(--text-primary)',
                                            fontFamily: "'Inter', sans-serif"
                                        }}>
                                            {link.counts}
                                        </div>

                                        {/* Actions */}
                                        <div style={{ textAlign: 'right' }}>
                                            <button
                                                onClick={(e) => handleMenuClick(e, link.id)}
                                                style={{
                                                    padding: '8px',
                                                    borderRadius: '8px',
                                                    border: 'none',
                                                    backgroundColor: 'transparent',
                                                    cursor: 'pointer',
                                                    color: 'var(--text-secondary)'
                                                }}
                                            >
                                                <MoreVertical size={18} />
                                            </button>
                                        </div>
                                    </div>
                                ))
                            )}
                        </div>
                    </div>
                </div>
            </div>

            {/* Options Menu */}
            {activeMenu && createPortal(
                <>
                    <div
                        style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, zIndex: 999 }}
                        onClick={() => setActiveMenu(null)}
                    />
                    <div className="links-options-menu" style={{
                        position: 'fixed',
                        top: `${menuPos.top}px`,
                        right: `${menuPos.right}px`,
                        zIndex: 1000,
                        backgroundColor: isDark ? 'rgba(20, 20, 20, 0.85)' : 'rgba(255, 255, 255, 0.85)',
                        backdropFilter: 'blur(12px)',
                        WebkitBackdropFilter: 'blur(12px)',
                        borderRadius: '16px',
                        boxShadow: '0 8px 32px rgba(0,0,0,0.2)',
                        border: `1px solid ${isDark ? 'rgba(255,255,255,0.15)' : 'rgba(0,0,0,0.1)'}`,
                        minWidth: '140px',
                        padding: '8px',
                        opacity: 0,
                        transformOrigin: 'top right'
                    }}>
                        <button
                            onClick={() => {
                                const link = generatedLinks.find(l => l.id === activeMenu);
                                if (link) handleEditClick(link);
                            }}
                            style={{
                                width: '100%',
                                textAlign: 'left',
                                padding: '10px 12px',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '8px',
                                backgroundColor: 'transparent',
                                border: 'none',
                                color: 'var(--text-primary)',
                                cursor: 'pointer',
                                borderRadius: '8px',
                                fontSize: '0.9rem',
                                fontFamily: "'Inter', sans-serif"
                            }}
                            onMouseEnter={(e) => e.currentTarget.style.backgroundColor = isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.05)'}
                            onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                        >
                            <Edit2 size={16} /> Edit
                        </button>
                        <button
                            onClick={() => handleDeleteLink(activeMenu)}
                            style={{
                                width: '100%',
                                textAlign: 'left',
                                padding: '10px 12px',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '8px',
                                backgroundColor: 'transparent',
                                border: 'none',
                                color: 'rgb(239, 68, 68)',
                                cursor: 'pointer',
                                borderRadius: '8px',
                                fontSize: '0.9rem',
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

            {/* Edit Modal */}
            {editingLink && createPortal(
                <div style={{
                    position: 'fixed',
                    top: 0,
                    left: 0,
                    width: '100vw',
                    height: '100vh',
                    backgroundColor: 'rgba(0, 0, 0, 0.4)',
                    backdropFilter: 'blur(8px)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    zIndex: 99999,
                    animation: 'fadeIn 0.2s ease-out'
                }}>
                    <div style={{
                        width: '90%',
                        maxWidth: '500px',
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
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center'
                        }}>
                            <h2 style={{
                                margin: 0,
                                fontSize: '1.25rem',
                                color: 'var(--text-primary)',
                                fontFamily: "'Inter', sans-serif"
                            }}>
                                Edit Link
                            </h2>
                        </div>

                        <div style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
                            <div>
                                <label style={{
                                    display: 'block',
                                    marginBottom: '8px',
                                    color: 'var(--text-secondary)',
                                    fontSize: '0.85rem',
                                    fontWeight: 500,
                                    fontFamily: "'Inter', sans-serif"
                                }}>
                                    Name
                                </label>
                                <input
                                    type="text"
                                    value={editName}
                                    onChange={(e) => setEditName(e.target.value)}
                                    style={{
                                        width: '100%',
                                        padding: '14px 18px',
                                        backgroundColor: isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)',
                                        border: `1px solid ${isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)'}`,
                                        borderRadius: '12px',
                                        color: 'var(--text-primary)',
                                        fontFamily: "'Inter', sans-serif",
                                        fontSize: '0.95rem',
                                        outline: 'none',
                                        boxSizing: 'border-box'
                                    }}
                                />
                            </div>
                            <div>
                                <label style={{
                                    display: 'block',
                                    marginBottom: '8px',
                                    color: 'var(--text-secondary)',
                                    fontSize: '0.85rem',
                                    fontWeight: 500,
                                    fontFamily: "'Inter', sans-serif"
                                }}>
                                    For
                                </label>
                                <input
                                    type="text"
                                    value={editFor}
                                    onChange={(e) => setEditFor(e.target.value)}
                                    style={{
                                        width: '100%',
                                        padding: '14px 18px',
                                        backgroundColor: isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)',
                                        border: `1px solid ${isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)'}`,
                                        borderRadius: '12px',
                                        color: 'var(--text-primary)',
                                        fontFamily: "'Inter', sans-serif",
                                        fontSize: '0.95rem',
                                        outline: 'none',
                                        boxSizing: 'border-box'
                                    }}
                                />
                            </div>

                            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px', marginTop: '8px' }}>
                                <button
                                    onClick={() => {
                                        setEditingLink(null);
                                        setEditName('');
                                        setEditFor('');
                                    }}
                                    style={{
                                        padding: '12px 24px',
                                        borderRadius: '12px',
                                        border: 'none',
                                        background: 'transparent',
                                        color: 'var(--text-secondary)',
                                        cursor: 'pointer',
                                        fontWeight: 500,
                                        fontFamily: "'Inter', sans-serif"
                                    }}
                                >
                                    Cancel
                                </button>
                                <button
                                    onClick={handleSaveEdit}
                                    disabled={!editName.trim() || !editFor.trim()}
                                    style={{
                                        padding: '12px 24px',
                                        borderRadius: '12px',
                                        border: 'none',
                                        backgroundColor: (!editName.trim() || !editFor.trim())
                                            ? 'rgba(59, 130, 246, 0.5)'
                                            : 'rgb(59, 130, 246)',
                                        color: 'white',
                                        cursor: (!editName.trim() || !editFor.trim()) ? 'not-allowed' : 'pointer',
                                        fontWeight: 600,
                                        fontFamily: "'Inter', sans-serif",
                                        boxShadow: '0 4px 12px rgba(59, 130, 246, 0.3)'
                                    }}
                                >
                                    Save Changes
                                </button>
                            </div>
                        </div>
                    </div>
                </div>,
                document.body
            )}

            <style>{`
                @keyframes spin {
                    from { transform: rotate(0deg); }
                    to { transform: rotate(360deg); }
                }
                @keyframes fadeIn {
                    from { opacity: 0; }
                    to { opacity: 1; }
                }
                @keyframes scaleIn {
                    from { transform: scale(0.95); opacity: 0; }
                    to { transform: scale(1); opacity: 1; }
                }
            `}</style>
        </div>
    );
};

export default DLinks;
