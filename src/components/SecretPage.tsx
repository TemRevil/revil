import React, { useState, useEffect } from 'react';
import { User } from 'lucide-react';
import { GoogleAuthProvider, signInWithPopup as authSignInWithPopup, deleteUser, getAdditionalUserInfo } from 'firebase/auth';
import { httpsCallable, getFunctions } from 'firebase/functions';
import app from '../lib/firebase';
import { appAuth } from '../lib/appAuth';
import { useSettings } from '../contexts/SettingsContext';

type SecretNavigate = (section: 'home' | 'stack' | 'projects' | 'secret' | 'dashboard' | 'view_link') => void;

interface SecretPageProps {
    onNavigate?: SecretNavigate;
}

const SecretPage = ({ onNavigate }: SecretPageProps) => {
    const [isDark, setIsDark] = useState(false);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const auth = appAuth();
    const provider = new GoogleAuthProvider();
    provider.setCustomParameters({ prompt: 'select_account' });

    // Shared Settings/Account listener (single Firestore connection for all components)
    const { account } = useSettings();
    const profile = {
        imageUrl: account?.imageUrl || '',
        name: account?.name || 'Action Center',
        title: account?.title || 'Authorized Revil Only'
    };

    useEffect(() => {
        const checkTheme = () => setIsDark(document.documentElement.classList.contains('dark'));
        checkTheme();
        const observer = new MutationObserver(checkTheme);
        observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
        return () => observer.disconnect();
    }, []);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');
        setLoading(true);

        try {
            const result = await authSignInWithPopup(auth, provider);
            const details = getAdditionalUserInfo(result);

            // LOGIN-ONLY: Reject any account that doesn't already exist in Firebase Auth.
            // signInWithPopup auto-creates accounts for OAuth providers, so we detect
            // new users via getAdditionalUserInfo and immediately delete + sign out.
            if (details?.isNewUser) {
                try {
                    await deleteUser(result.user);
                } catch {
                    // delete can fail (needs-recent-login / token issues) — ensure we never
                    // leave an unrecognized account signed in regardless.
                } finally {
                    await auth.signOut();
                }
                setError('Access denied — account not recognized.');
                return;
            }

            // Force-refresh the ID token so a freshly-minted `admin` custom claim is
            // picked up immediately (otherwise it only applies on the next token refresh,
            // and all admin Firestore/Storage writes would be rejected this session).
            try { await result.user.getIdToken(true); } catch { /* non-fatal */ }

            // Fire-and-forget login alert email
            const notifyLogin = httpsCallable(getFunctions(app), 'notifyLogin');
            notifyLogin({
                userAgent: navigator.userAgent,
                provider: result.user.providerData?.[0]?.providerId || 'google.com',
            }).catch(() => {}); // Silent — don't block login

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
