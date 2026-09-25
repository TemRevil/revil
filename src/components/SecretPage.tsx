import React, { useState, useEffect, useRef } from 'react';
import { User } from 'lucide-react';
import { GoogleAuthProvider, signInWithPopup as authSignInWithPopup } from 'firebase/auth';
import { httpsCallable, getFunctions } from 'firebase/functions';
import app from '../lib/firebase';
import { appAuth } from '../lib/appAuth';
import { useSettings } from '../contexts/SettingsContext';
import { PaintDefs, usePaint } from './book/paintKit';
import './book/book.css';

type SecretNavigate = (section: 'home' | 'stack' | 'projects' | 'secret' | 'dashboard' | 'view_link') => void;

interface SecretPageProps {
    onNavigate?: SecretNavigate;
}

const SecretPage = ({ onNavigate }: SecretPageProps) => {
    const [isDark, setIsDark] = useState(false);
    // The /book brushes from the page edges, faded out under the card ([data-paint-clear]).
    const rootRef = useRef<HTMLDivElement>(null);
    const [fontsReady, setFontsReady] = useState(false);
    useEffect(() => { let alive = true; document.fonts.ready.then(() => { if (alive) setFontsReady(true); }); return () => { alive = false; }; }, []);
    const { boilRef } = usePaint(rootRef, fontsReady);
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
            // Only the owner may sign in. A new or unknown account is refused below: the
            // server deletes it (a client-side delete can fail and leave it behind).
            // Force-refresh the ID token so a freshly-minted `admin` custom claim is
            // picked up immediately (otherwise it only applies on the next token refresh,
            // and all admin Firestore/Storage writes would be rejected this session).
            let isAdmin = false;
            try { isAdmin = (await result.user.getIdTokenResult(true)).claims.admin === true; } catch { /* treated as not admin */ }

            // Login alert. For anyone but the owner the server refuses the sign-in,
            // deletes the account and alerts the owner instead.
            const notifyLogin = httpsCallable(getFunctions(app), 'notifyLogin');
            const alert = notifyLogin({
                userAgent: navigator.userAgent,
                provider: result.user.providerData?.[0]?.providerId || 'google.com',
            });
            if (!isAdmin) {
                await alert.catch(() => {});
                await auth.signOut();
                setError('Access denied - account not recognized.');
                return;
            }
            alert.catch(() => {}); // Silent - don't block the owner's login

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
        <div ref={rootRef} className="bp bp-secret">
            <PaintDefs boilRef={boilRef} />
            <div className="wall" aria-hidden="true" />
            <svg className="paint-bg" aria-hidden="true" />
        <div className="relative z-[1] w-full h-screen flex items-center justify-center p-5">
            <div data-paint-clear className="glass-panel p-10 w-full max-w-md flex flex-col items-center gap-6 animate-fade-in">
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
        </div>
    );
};

export default SecretPage;
