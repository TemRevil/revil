import { useEffect } from 'react';
import { Lock, Shield, Key } from 'lucide-react';
import Loader from '../reactbits/Loader';

const DPasswords = () => {
    const [isLoading, setIsLoading] = useState(false);
    useEffect(() => {
        const checkTheme = () => { };
        checkTheme();
        const observer = new MutationObserver(checkTheme);
        observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
        return () => observer.disconnect();
    }, []);

    return (
        <div style={{
            width: '100%',
            height: '100%',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            color: 'var(--text-secondary)',
            fontFamily: "'Inter', sans-serif",
            gap: '24px',
            padding: '40px'
        }}>
            <Loader isOpen={isLoading} isFullScreen={true} />
            <div style={{
                width: '80px',
                height: '80px',
                borderRadius: '24px',
                backgroundColor: 'rgba(59, 130, 246, 0.1)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#3b82f6',
                marginBottom: '8px'
            }}>
                <Lock size={40} />
            </div>

            <div style={{ textAlign: 'center' }}>
                <h2 style={{
                    fontSize: '1.5rem',
                    fontWeight: 700,
                    color: 'var(--text-primary)',
                    marginBottom: '8px'
                }}>
                    Password Management
                </h2>
                <p style={{ maxWidth: '400px', margin: '0 auto', lineHeight: '1.6' }}>
                    This section will allow you to manage sensitive credentials and API keys securely.
                </p>
            </div>

            <div style={{
                display: 'flex',
                gap: '12px',
                flexWrap: 'wrap',
                justifyContent: 'center'
            }}>
                <div style={{
                    padding: '12px 20px',
                    borderRadius: '12px',
                    backgroundColor: 'var(--card-bg)',
                    border: '1px solid var(--navbar-border)',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '10px',
                    fontSize: '0.9rem'
                }}>
                    <Shield size={16} />
                    <span>AES-256 Encryption Ready</span>
                </div>
                <div style={{
                    padding: '12px 20px',
                    borderRadius: '12px',
                    backgroundColor: 'var(--card-bg)',
                    border: '1px solid var(--navbar-border)',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '10px',
                    fontSize: '0.9rem'
                }}>
                    <Key size={16} />
                    <span>Multi-factor Auth</span>
                </div>
            </div>
        </div>
    );
};

export default DPasswords;
