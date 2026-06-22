'use client';

import { useEffect, useRef, useState } from 'react';
import { GoogleAuthProvider, signInWithPopup } from 'firebase/auth';
import { Plug, ShieldCheck, Lock, Loader2 } from 'lucide-react';
import { appAuth } from '../../lib/appAuth';
import Alert from '../../components/Alert';
import useSafeAlert from '../../hooks/useSafeAlert';

/**
 * MCP login bridge. An MCP client (e.g. Claude) is redirected here by the `mcp`
 * Cloud Function's /authorize. We sign the admin in with the portfolio's existing
 * Google auth, get a Firebase ID token, and POST it back to the function's
 * callback (a cross-origin form POST → the function verifies + 302-redirects back
 * to the client). This reuses the site's Firebase Auth — no separate OAuth client.
 */
type Phase = 'loading' | 'idle' | 'working' | 'invalid';

type State = { phase: Phase; s: string; cb: string };

export default function McpLogin() {
    const [state, setState] = useState<State>({ phase: 'loading', s: '', cb: '' });
    const { phase } = state;
    const [idToken, setIdToken] = useState('');
    const formRef = useRef<HTMLFormElement>(null);
    const { alert, showAlert, hideAlert } = useSafeAlert();

    // Read the one-time login parameters the function handed us in the URL.
    useEffect(() => {
        const sp = new URLSearchParams(window.location.search);
        const s = sp.get('s') || '';
        const cb = sp.get('cb') || '';
        const valid = !!(s && cb);
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setState({ phase: valid ? 'idle' : 'invalid', s, cb });
        if (!valid) {
            showAlert({
                type: 'error',
                message: 'This link is missing its login parameters. Start again from your MCP client.',
                duration: 0,
            });
        }
    }, [showAlert]);

    // Once we have an ID token, submit the (declarative) cross-origin form so the
    // browser follows the function's 302 back to the MCP client.
    useEffect(() => {
        if (idToken && formRef.current) formRef.current.submit();
    }, [idToken]);

    const connect = async () => {
        if (state.phase !== 'idle') return;
        setState(prev => ({ ...prev, phase: 'working' }));
        try {
            const provider = new GoogleAuthProvider();
            provider.setCustomParameters({ prompt: 'select_account' });
            const res = await signInWithPopup(appAuth(), provider);
            const token = await res.user.getIdToken();
            setIdToken(token); // triggers the form submit effect
        } catch {
            setState(prev => ({ ...prev, phase: 'idle' }));
            showAlert({
                type: 'error',
                message: 'Sign-in was cancelled or failed. Please try again.',
            });
        }
    };

    const busy = phase === 'working';
    const buttonLabel = busy
        ? (idToken ? 'Authorizing your AI client…' : 'Opening Google sign-in…')
        : 'Continue with Google';

    return (
        <main className="w-full min-h-dvh flex items-center justify-center p-5 bg-primary">
            {alert?.show && (
                <Alert type={alert.type} message={alert.message} onClose={hideAlert} duration={alert.duration} />
            )}

            <section className="glass-panel w-full max-w-md p-8 sm:p-10 flex flex-col items-center gap-7 text-center">
                {/* Brand mark */}
                <span
                    className="grid place-items-center rounded-3xl shrink-0"
                    style={{ width: 64, height: 64, background: 'rgba(51,149,255,0.12)', color: 'var(--accent)' }}
                >
                    <Plug size={30} />
                </span>

                <header className="flex flex-col gap-2">
                    <h1 className="heading-md text-2xl sm:text-3xl m-0">Connect your AI</h1>
                    <p className="text-muted text-sm leading-relaxed max-w-sm">
                        Authorize an MCP client to act on your portfolio — read bookings, messages and
                        treasury, and manage projects. Only the portfolio admin can connect.
                    </p>
                </header>

                {/* Primary action */}
                <button
                    type="button"
                    onClick={connect}
                    disabled={phase !== 'idle'}
                    className="btn-primary w-full inline-flex items-center justify-center gap-3 px-5 py-3 rounded-xl text-sm font-bold cursor-pointer disabled:opacity-70 disabled:cursor-not-allowed"
                >
                    {busy ? (
                        <Loader2 size={18} className="animate-spin" />
                    ) : (
                        <img
                            src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg"
                            alt=""
                            aria-hidden="true"
                            className="w-5 h-5 bg-white rounded-full p-0.5"
                        />
                    )}
                    {buttonLabel}
                </button>

                {/* Trust row */}
                <div className="flex items-center justify-center gap-5 text-muted text-[11px]">
                    <span className="inline-flex items-center gap-1.5">
                        <ShieldCheck size={13} style={{ color: 'var(--accent)' }} />
                        Admin-only access
                    </span>
                    <span className="inline-flex items-center gap-1.5">
                        <Lock size={13} style={{ color: 'var(--accent)' }} />
                        Revocable anytime
                    </span>
                </div>

                <p className="text-muted text-[11px] opacity-60">
                    Manage from Dashboard → Settings → MCP.
                </p>
            </section>

            {/* Declarative cross-origin bridge form. Hidden; submitted via ref once the
                Firebase ID token is ready — the function verifies it and redirects back. */}
            <form ref={formRef} method="POST" action={state.cb} className="hidden" aria-hidden="true">
                <input type="hidden" name="s" value={state.s} readOnly />
                <input type="hidden" name="id_token" value={idToken} readOnly />
            </form>
        </main>
    );
}
