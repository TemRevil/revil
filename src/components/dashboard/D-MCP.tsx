import { useEffect, useState } from 'react';
import { Plug, Copy, Check, ShieldAlert, RotateCcw, ShieldCheck, Power } from 'lucide-react';
import { doc, onSnapshot, setDoc } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import Alert from '../Alert';
import useSafeAlert from '../../hooks/useSafeAlert';

interface McpConfig {
    enabled: boolean;
    writesEnabled: boolean;
    url: string;
    revokedBefore?: number;
}

// The deployed function URL — shown by default so the field is never empty.
const DEFAULT_URL = 'https://us-central1-temrevil1.cloudfunctions.net/mcp';

/**
 * Settings panel for the remote MCP server (agentic portfolio access). Reads/writes
 * the Settings/MCP config doc directly — the OAuth + protocol live in the `mcp`
 * Cloud Function; this panel only flips switches the function reads each request.
 */
const DMcpPanel = ({ isDark }: { isDark: boolean }) => {
    const [cfg, setCfg] = useState<McpConfig>({ enabled: true, writesEnabled: false, url: '' });
    const [urlDraft, setUrlDraft] = useState(DEFAULT_URL);
    const [copied, setCopied] = useState(false);
    const { alert, showAlert, hideAlert } = useSafeAlert();

    useEffect(() => {
        const unsub = onSnapshot(doc(db, 'Settings', 'MCP'), (snap) => {
            const d = (snap.exists() ? snap.data() : {}) as Partial<McpConfig>;
            const next: McpConfig = {
                enabled: d.enabled !== false,
                writesEnabled: d.writesEnabled === true,
                url: d.url || '',
                revokedBefore: d.revokedBefore || 0,
            };
            setCfg(next);
            setUrlDraft(next.url || DEFAULT_URL);
        }, () => { /* admin-only; ignore */ });
        return () => unsub();
    }, []);

    const effectiveUrl = cfg.url || DEFAULT_URL;

    const patch = async (data: Partial<McpConfig>, okMsg?: string) => {
        try {
            await setDoc(doc(db, 'Settings', 'MCP'), data, { merge: true });
            if (okMsg) showAlert({ type: 'success', message: okMsg });
        } catch {
            showAlert({ type: 'error', message: 'Failed to save — are you signed in as admin?' });
        }
    };

    const copyUrl = async () => {
        try {
            await navigator.clipboard.writeText(effectiveUrl);
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
        } catch { /* clipboard blocked */ }
    };

    const toggle = (on: boolean, onClick: () => void, label: string) => (
        <button
            type="button"
            onClick={onClick}
            role="switch"
            aria-checked={on}
            aria-label={label}
            className="relative shrink-0 rounded-full transition-colors"
            style={{ width: 46, height: 28, background: on ? 'var(--accent)' : (isDark ? 'rgba(255,255,255,0.15)' : 'rgba(0,0,0,0.15)') }}
        >
            <span className="absolute top-[3px] rounded-full bg-white shadow-sm transition-all" style={{ width: 22, height: 22, left: on ? 21 : 3 }} />
        </button>
    );

    const card = 'rounded-2xl p-4 sm:p-5 flex items-center justify-between gap-4';
    const cardStyle = { border: '1px solid var(--section-border)', background: isDark ? 'rgba(255,255,255,0.02)' : 'rgba(0,0,0,0.015)' } as const;

    return (
        <div className="glass-panel p-6 sm:p-8 flex flex-col gap-7 w-full">
            {alert?.show && <Alert type={alert.type} message={alert.message} onClose={hideAlert} duration={alert.duration} />}

            {/* Header + status */}
            <div className="flex items-start justify-between gap-4 flex-wrap">
                <div className="flex items-start gap-4 min-w-0">
                    <span className="grid place-items-center shrink-0 rounded-2xl" style={{ width: 48, height: 48, background: 'rgba(51,149,255,0.12)', color: 'var(--accent)' }}>
                        <Plug size={24} />
                    </span>
                    <div className="min-w-0">
                        <h3 className="heading-md text-lg sm:text-xl m-0">MCP — Agentic Access</h3>
                        <p className="text-muted text-xs sm:text-sm leading-relaxed mt-1 max-w-2xl">
                            Connect an AI client (e.g. Claude) over OAuth so it can read and manage your portfolio —
                            bookings, messages, treasury and projects — without opening the dashboard.
                        </p>
                    </div>
                </div>
                <span
                    className="inline-flex items-center gap-1.5 shrink-0 px-3 py-1.5 rounded-full text-xs font-bold"
                    style={cfg.enabled
                        ? { background: 'rgba(34,197,94,0.12)', color: '#22c55e' }
                        : { background: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.05)', color: 'var(--text-muted)' }}
                >
                    <span className="w-1.5 h-1.5 rounded-full" style={{ background: 'currentColor' }} />
                    {cfg.enabled ? 'Active' : 'Disabled'}
                </span>
            </div>

            {/* Server URL */}
            <div className="flex flex-col gap-2">
                <label className="dashboard-label">Server URL</label>
                <div className="flex flex-col sm:flex-row gap-2">
                    <input
                        className="dashboard-input flex-1 font-mono text-sm"
                        spellCheck={false}
                        value={urlDraft}
                        onChange={(e) => setUrlDraft(e.target.value)}
                        onBlur={() => { const v = urlDraft.trim(); if (v && v !== cfg.url) patch({ url: v }, 'Server URL saved'); }}
                    />
                    <button
                        type="button"
                        onClick={copyUrl}
                        className="btn-primary inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl text-sm font-bold cursor-pointer shrink-0"
                    >
                        {copied ? <Check size={16} /> : <Copy size={16} />}
                        {copied ? 'Copied' : 'Copy URL'}
                    </button>
                </div>
                <p className="text-muted text-xs leading-relaxed">
                    In Claude: <strong>Settings → Connectors → Add custom connector</strong>, paste this URL, then sign in with your admin Google account.
                </p>
            </div>

            {/* Toggles */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <div className={card} style={cardStyle}>
                    <div className="flex items-start gap-3 min-w-0">
                        <Power size={18} className="mt-0.5 shrink-0" style={{ color: cfg.enabled ? 'var(--accent)' : 'var(--text-muted)' }} />
                        <div className="min-w-0">
                            <div className="text-sm font-bold text-primary">Enable MCP server</div>
                            <div className="text-muted text-xs mt-0.5">When off, all connected clients are refused.</div>
                        </div>
                    </div>
                    {toggle(cfg.enabled, () => patch({ enabled: !cfg.enabled }), 'Enable MCP server')}
                </div>

                <div className={card} style={cardStyle}>
                    <div className="flex items-start gap-3 min-w-0">
                        {cfg.writesEnabled
                            ? <ShieldAlert size={18} className="mt-0.5 shrink-0" style={{ color: 'var(--warning)' }} />
                            : <ShieldCheck size={18} className="mt-0.5 shrink-0 text-muted" />}
                        <div className="min-w-0">
                            <div className="text-sm font-bold text-primary">Allow writes</div>
                            <div className="text-muted text-xs mt-0.5">Lets the AI add / edit / delete. Reads always work.</div>
                        </div>
                    </div>
                    {toggle(cfg.writesEnabled, () => patch({ writesEnabled: !cfg.writesEnabled }), 'Allow writes')}
                </div>
            </div>

            {/* Revoke */}
            <div className="flex items-center justify-between gap-4 flex-wrap pt-5" style={{ borderTop: '1px solid var(--section-border)' }}>
                <div>
                    <div className="text-sm font-bold text-primary">Revoke all access</div>
                    <div className="text-muted text-xs mt-0.5">Invalidates every issued token. The client must sign in again.</div>
                </div>
                <button
                    type="button"
                    onClick={() => patch({ revokedBefore: Date.now() }, 'All MCP access revoked')}
                    className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-bold cursor-pointer transition-colors"
                    style={{ border: '1px solid rgba(var(--danger-rgb),0.4)', color: 'var(--danger)' }}
                >
                    <RotateCcw size={16} />
                    Revoke
                </button>
            </div>
        </div>
    );
};

export default DMcpPanel;
