import React, { useState, useEffect } from 'react';
import userImage from '../assets/imgs/user.jpg';
import { getAuth, GoogleAuthProvider, signInWithPopup, deleteUser, getAdditionalUserInfo } from 'firebase/auth';

interface SecretPageProps {
    onNavigate?: (section: any) => void;
}

const SecretPage = ({ onNavigate }: SecretPageProps) => {
    const [isDark, setIsDark] = useState(false);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const auth = getAuth();
    const provider = new GoogleAuthProvider();
    provider.setCustomParameters({ prompt: 'select_account' });

    useEffect(() => {
        const checkTheme = () => {
            setIsDark(document.documentElement.classList.contains('dark'));
        };

        checkTheme();
        const observer = new MutationObserver(checkTheme);
        observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });

        return () => {
            observer.disconnect();
        };
    }, []);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');
        setLoading(true);

        try {
            const result = await signInWithPopup(auth, provider);
            const details = getAdditionalUserInfo(result);

            // Check if user is new (not in Firebase Auth)
            if (details?.isNewUser) {
                // New user detected. Since we only want to allow existing users,
                // we delete this new account immediately so it's not recorded.
                await deleteUser(result.user);
                setError('Wrong Shot.');
                return;
            }

            // Navigate to dashboard
            if (onNavigate) {
                onNavigate('dashboard');
            }

            // Existing user, navigate
            if (onNavigate) {
                onNavigate('dashboard');
            }
        } catch (err: any) {
            if (err.code === 'auth/popup-closed-by-user') {
                setError('Sign-in was cancelled.');
            } else {
                setError(err.message || 'An error occurred');
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
                    <img
                        src={userImage}
                        alt="User"
                        className="w-full h-full object-cover"
                    />
                </div>

                <div className="text-center">
                    <h2 className="heading-lg mb-2">
                        Action Center
                    </h2>
                    <p className="text-sec">
                        Authorized Revil Only
                    </p>
                </div>

                <form onSubmit={handleSubmit} className="w-full flex flex-col gap-3">
                    {error && (
                        <div className="mb-8 p-3 bg-red-500/10 text-red-500 rounded-lg text-sm text-center">
                            {error}
                        </div>
                    )}

                    <button
                        type="submit"
                        disabled={loading}
                        className={`btn btn-primary w-full flex items-center justify-center gap-2 ${loading ? 'opacity-60 cursor-not-allowed' : ''}`}
                        style={{
                            backgroundColor: loading ? 'rgb(156, 163, 175)' : '#4285f4',
                            boxShadow: loading ? 'none' : '0 4px 12px rgba(66, 133, 244, 0.3)'
                        }}
                    >
                        {loading ? 'Loging in...' : 'Login with Google'}
                    </button>
                </form>

            </div>
        </div>
    );
};

export default SecretPage;
