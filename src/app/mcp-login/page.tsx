'use client';

import { useEffect, useState } from 'react';
import { GoogleAuthProvider, signInWithPopup } from 'firebase/auth';
import { appAuth } from '../../lib/appAuth';

/**
 * MCP login bridge. An MCP client (e.g. Claude) is redirected here by the `mcp`
 * Cloud Function's /authorize. We sign the admin in with the portfolio's existing
 * Google auth, get a Firebase ID token, and POST it back to the function's
 * callback (a cross-origin form POST → the function verifies + redirects back to
 * the client). This reuses the site's Firebase Auth — no separate OAuth client.
 */
type State = { phase: 'loading' | 'idle' | 'working' | 'error'; message: string; s: string; cb: string };

export default function McpLogin() {
    const [state, setState] = useState<State>({ phase: 'loading', message: '', s: '', cb: '' });
    const { phase, message } = state;

    useEffect(() => {
        const sp = new URLSearchParams(window.location.search);
        const s = sp.get('s') || '';
        const cb = sp.get('cb') || '';
        const valid = !!(s && cb);
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setState({
            phase: valid ? 'idle' : 'error',
            message: valid ? '' : 'This link is missing its login parameters. Start again from your MCP client.',
            s, cb,
        });
    }, []);

    const connect = async () => {
        if (!state.s || !state.cb) return;
        setState(prev => ({ ...prev, phase: 'working', message: 'Opening Google sign-in…' }));
        try {
            const provider = new GoogleAuthProvider();
            provider.setCustomParameters({ prompt: 'select_account' });
            const res = await signInWithPopup(appAuth(), provider);
            const idToken = await res.user.getIdToken();

            setState(prev => ({ ...prev, message: 'Authorizing your AI client…' }));
            // Top-level cross-origin form POST: the function reads the body, verifies
            // the token, and 302-redirects the browser back to the MCP client.
            const form = document.createElement('form');
            form.method = 'POST';
            form.action = state.cb;
            const addField = (name: string, value: string) => {
                const input = document.createElement('input');
                input.type = 'hidden';
                input.name = name;
                input.value = value;
                form.appendChild(input);
            };
            addField('s', state.s);
            addField('id_token', idToken);
            document.body.appendChild(form);
            form.submit();
        } catch {
            setState(prev => ({ ...prev, phase: 'error', message: 'Sign-in was cancelled or failed. Close this tab and try again from your MCP client.' }));
        }
    };

    return (
        <div className="w-full min-h-dvh flex items-center justify-center p-5 bg-primary">
            <div className="glass-panel p-8 sm:p-10 w-full max-w-md flex flex-col items-center gap-5 text-center">
                <div className="w-14 h-14 rounded-2xl flex items-center justify-center" style={{ background: 'rgba(51,149,255,0.12)', color: 'var(--accent)' }}>
                    <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 2v6m6-6v6M5 8h14a1 1 0 0 1 1 1v3a7 7 0 0 1-14 0V9a1 1 0 0 1 1-1Z" /><path d="M12 19v3" /></svg>
                </div>

                <div>
                    <h1 className="text-2xl font-extrabold text-primary m-0">Connect your AI</h1>
                    <p className="text-sm text-muted mt-2 leading-relaxed">
                        Sign in to authorize an MCP client to act on your portfolio. Only the portfolio admin account is allowed.
                    </p>
                </div>

                {phase === 'error' ? (
                    <div className="w-full p-3 rounded-xl text-sm" style={{ border: '1px solid rgba(var(--danger-rgb),0.3)', background: 'rgba(var(--danger-rgb),0.06)', color: 'var(--danger)' }}>
                        {message}
                    </div>
                ) : (
                    <button
                        type="button"
                        onClick={connect}
                        disabled={phase === 'loading' || phase === 'working'}
                        className="btn btn-primary w-full flex items-center justify-center gap-3 disabled:opacity-70"
                    >
                        <img src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg" alt="" className="w-5 h-5 bg-white rounded-full p-0.5" />
                        {phase === 'working' ? (message || 'Working…') : 'Continue with Google'}
                    </button>
                )}

                <p className="text-[11px] text-muted opacity-60 mt-1">You can revoke access anytime from Dashboard → Settings → MCP.</p>
            </div>
        </div>
    );
}
