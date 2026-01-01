import { useEffect } from 'react';
import { Bird, Zap, Radio, Activity } from 'lucide-react';

const DCanary = () => {
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
            <div style={{
                width: '80px',
                height: '80px',
                borderRadius: '24px',
                backgroundColor: 'rgba(234, 179, 8, 0.1)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#eab308',
                marginBottom: '8px'
            }}>
                <Bird size={40} />
            </div>

            <div style={{ textAlign: 'center' }}>
                <h2 style={{
                    fontSize: '1.5rem',
                    fontWeight: 700,
                    color: 'var(--text-primary)',
                    marginBottom: '8px'
                }}>
                    Canary Deployment Center
                </h2>
                <p style={{ maxWidth: '400px', margin: '0 auto', lineHeight: '1.6' }}>
                    Monitor experimental features, traffic splitting, and real-time system performance.
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
                    <Zap size={16} />
                    <span>Real-time Metrics</span>
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
                    <Radio size={16} />
                    <span>Signal Strength</span>
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
                    <Activity size={16} />
                    <span>Health Check</span>
                </div>
            </div>
        </div>
    );
};

export default DCanary;
