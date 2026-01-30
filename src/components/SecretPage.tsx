import React, { useState, useEffect } from 'react';
import { User } from 'lucide-react';
import { getAuth, GoogleAuthProvider, signInWithPopup as authSignInWithPopup, deleteUser, getAdditionalUserInfo } from 'firebase/auth';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from '../lib/firebase';

type SecretNavigate = (section: 'home' | 'stack' | 'projects' | 'secret' | 'dashboard' | 'view_link') => void;

interface SecretPageProps {
    onNavigate?: SecretNavigate;
}

const SecretPage = ({ onNavigate }: SecretPageProps) => {
    const [isDark, setIsDark] = useState(false);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [profile, setProfile] = useState<{ imageUrl?: string; name?: string; title?: string }>({
        imageUrl: '',
        name: 'Action Center',
        title: 'Authorized Revil Only'
    });
    const auth = getAuth();
    const provider = new GoogleAuthProvider();
    provider.setCustomParameters({ prompt: 'select_account' });

    useEffect(() => {
        const checkTheme = () => setIsDark(document.documentElement.classList.contains('dark'));
        checkTheme();
        const observer = new MutationObserver(checkTheme);
        observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
        return () => observer.disconnect();
    }, []);

    useEffect(() => {
        const unsub = onSnapshot(doc(db, 'Settings', 'Account'), (docSnap) => {
            if (docSnap.exists()) {
                const data = docSnap.data();
                setProfile({
                    imageUrl: data.imageUrl || '',
                    name: data.name || 'Action Center',
                    title: data.title || 'Authorized Revil Only'
                });
            }
        });
        return () => unsub();
    }, []);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');
        setLoading(true);

        try {
            const result = await authSignInWithPopup(auth, provider);
            const details = getAdditionalUserInfo(result);

            if (details?.isNewUser) {
                await deleteUser(result.user);
                setError('Wrong Shot.');
                return;
            }

            if (onNavigate) {
                onNavigate('dashboard');
            }
        } catch (err: unknown) {
            const e = err as { code?: string; message?: string };
            if (e.code === 'auth/popup-closed-by-user') {
                setError('Sign-in was cancelled.');
            } else {
                setError(e.message || 'An error occurred');
            }
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="w-full h-screen flex items-center justify-center p-5">
            <div className="glass-panel p-10 w-full max-w-md flex flex-col items-center gap-6 animate-fade-in">
                <div className="relative w-30 h-30 rounded-full overflow-hidden mb-2" style={{
                    boxShadow: isDark ? '0 8px 24px rgba(0, 0, 0, 0.5)' : '0 8px 24px rgba(0, 0, 0, 0.2)',
                    border: `4px solid ${isDark ? '#ffffff20' : '#ffffff80'}`
                }}>
                    {profile.imageUrl ? (
                        <img
                            src={profile.imageUrl}
                            alt={profile.name}
                            className="w-full h-full object-cover"
                        />
                    ) : (
                        <div className="w-full h-full flex items-center justify-center bg-zinc-900/50">
                            <User size={48} className="text-zinc-500/30" />
                        </div>
                    )}
                </div>

                <div className="text-center flex flex-col gap-1.5">
                    <h2 className="text-2xl font-black tracking-tighter uppercase leading-none">
                        Identity Verification
                    </h2>
                    <p className="text-[10px] font-black uppercase tracking-[0.5em] opacity-30">
                        Encrypted Data Protocol
                    </p>
                </div>

                <form onSubmit={handleSubmit} className="w-full flex flex-col gap-4 mt-2">
                    {error && (
                        <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-sm text-center">
                            {error}
                        </div>
                    )}
                    <button
                        type="submit"
                        disabled={loading}
                        className={`btn btn-primary w-full flex items-center justify-center gap-3 ${loading ? 'opacity-70 cursor-wait' : ''}`}
                    >
                        <img src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg" alt="Google" className="w-5 h-5 bg-white rounded-full p-0.5" />
                        {loading ? 'Authorizing...' : 'Authorize Access'}
                    </button>

                    <p className="text-xs text-center text-sec opacity-50 mt-2">
                        Protected by Firebase Security.
                    </p>
                </form>
            </div>
        </div>
    );
};

export default SecretPage;
