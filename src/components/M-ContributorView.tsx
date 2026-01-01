import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { X, Github, Linkedin, Globe } from 'lucide-react';

export interface Contributor {
    name: string;
    role: string;     // Role in the specific project
    jobTitle: string; // Global job title (e.g. Front-End Developer)
    image: string;
    links: {
        github?: string;
        linkedin?: string;
        website?: string;
    };
}

interface MContributorViewProps {
    contributor: Contributor;
    onClose: () => void;
}

const MContributorView = ({ contributor, onClose }: MContributorViewProps) => {
    const [isDark, setIsDark] = useState(false);

    useEffect(() => {
        const checkTheme = () => setIsDark(document.documentElement.classList.contains('dark'));
        checkTheme();
        const observer = new MutationObserver(checkTheme);
        observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
        return () => observer.disconnect();
    }, []);

    return createPortal(
        <div style={{
            position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh',
            backgroundColor: 'rgba(0, 0, 0, 0.4)',
            backdropFilter: 'blur(8px)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            zIndex: 1200,
            animation: 'fadeIn 0.2s ease-out'
        }}>
            <div style={{
                width: '90%', maxWidth: '400px',
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
                        Contributor Details
                    </h2>
                    <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer' }}>
                        <X size={24} />
                    </button>
                </div>

                <div style={{ padding: '24px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '20px' }}>
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '16px' }}>
                        <img src={contributor.image} alt={contributor.name} style={{
                            width: '120px', height: '120px', borderRadius: '50%', objectFit: 'cover',
                            border: `4px solid ${isDark ? 'rgba(255,255,255,0.3)' : 'rgba(0,0,0,0.2)'}`
                        }} />
                        <div style={{ textAlign: 'center' }}>
                            <h3 style={{ margin: '0 0 8px 0', color: 'var(--text-primary)', fontSize: '1.75rem', fontWeight: 'bold' }}>
                                {contributor.name}
                            </h3>
                            <p style={{
                                margin: 0, color: 'rgb(59, 130, 246)', fontSize: '1.1rem', fontWeight: '600',
                                backgroundColor: 'rgba(59, 130, 246, 0.1)', padding: '4px 12px', borderRadius: '20px'
                            }}>
                                {contributor.jobTitle || contributor.role}
                            </p>
                        </div>
                    </div>

                    <div style={{ width: '100%', textAlign: 'center' }}>
                        <h4 style={{ margin: '0 0 12px 0', color: 'var(--text-primary)', fontSize: '1.1rem' }}>Connect</h4>
                        <div style={{ display: 'flex', justifyContent: 'center', gap: '16px' }}>
                            {contributor.links.github && (
                                <a href={contributor.links.github} target="_blank" rel="noopener noreferrer"
                                    style={{
                                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                                        width: '48px', height: '48px', borderRadius: '50%',
                                        backgroundColor: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)',
                                        color: 'var(--text-secondary)', transition: 'all 0.2s',
                                        textDecoration: 'none'
                                    }}
                                    onMouseEnter={(e) => {
                                        e.currentTarget.style.backgroundColor = 'rgb(59, 130, 246)';
                                        e.currentTarget.style.color = 'white';
                                    }}
                                    onMouseLeave={(e) => {
                                        e.currentTarget.style.backgroundColor = isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)';
                                        e.currentTarget.style.color = 'var(--text-secondary)';
                                    }}>
                                    <Github size={24} />
                                </a>
                            )}
                            {contributor.links.linkedin && (
                                <a href={contributor.links.linkedin} target="_blank" rel="noopener noreferrer"
                                    style={{
                                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                                        width: '48px', height: '48px', borderRadius: '50%',
                                        backgroundColor: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)',
                                        color: 'var(--text-secondary)', transition: 'all 0.2s',
                                        textDecoration: 'none'
                                    }}
                                    onMouseEnter={(e) => {
                                        e.currentTarget.style.backgroundColor = 'rgb(59, 130, 246)';
                                        e.currentTarget.style.color = 'white';
                                    }}
                                    onMouseLeave={(e) => {
                                        e.currentTarget.style.backgroundColor = isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)';
                                        e.currentTarget.style.color = 'var(--text-secondary)';
                                    }}>
                                    <Linkedin size={24} />
                                </a>
                            )}
                            {contributor.links.website && (
                                <a href={contributor.links.website} target="_blank" rel="noopener noreferrer"
                                    style={{
                                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                                        width: '48px', height: '48px', borderRadius: '50%',
                                        backgroundColor: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)',
                                        color: 'var(--text-secondary)', transition: 'all 0.2s',
                                        textDecoration: 'none'
                                    }}
                                    onMouseEnter={(e) => {
                                        e.currentTarget.style.backgroundColor = 'rgb(59, 130, 246)';
                                        e.currentTarget.style.color = 'white';
                                    }}
                                    onMouseLeave={(e) => {
                                        e.currentTarget.style.backgroundColor = isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)';
                                        e.currentTarget.style.color = 'var(--text-secondary)';
                                    }}>
                                    <Globe size={24} />
                                </a>
                            )}
                        </div>
                    </div>
                </div>
            </div>
        </div>,
        document.body
    );
};

export default MContributorView;
