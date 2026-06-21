import { useEffect, useState } from 'react';
import { Plug, Copy, Check, ShieldAlert, RotateCcw } from 'lucide-react';
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

/**
 * Settings panel for the remote MCP server (agentic portfolio access). Reads/writes
 * the Settings/MCP config doc directly — the OAuth + protocol live in the `mcp`
 * Cloud Function; this panel only flips switches the function reads each request.
 */
const DMcpPanel = ({ isDark }: { isDark: boolean }) => {
    const [cfg, setCfg] = useState<McpConfig>({ enabled: true, writesEnabled: false, url: '' });
    const [urlDraft, setUrlDraft] = useState('');
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
            setUrlDraft(next.url);
        }, () => { /* admin-only; ignore */ });
        return () => unsub();
    }, []);

    const patch = async (data: Partial<McpConfig>, okMsg?: string) => {
        try {
            await setDoc(doc(db, 'Settings', 'MCP'), data, { merge: true });
            if (okMsg) showAlert({ type: 'success', message: okMsg });
        } catch {
            showAlert({ type: 'error', message: 'Failed to save — are you signed in as admin?' });
        }
    };

    const copyUrl = async () => {
        if (!cfg.url) return;
        try {
            await navigator.clipboard.writeText(cfg.url);
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
            style={{ width: 44, height: 26, background: on ? 'var(--accent)' : (isDark ? 'rgba(255,255,255,0.15)' : 'rgba(0,0,0,0.15)') }}
        >
            <span
                className="absolute top-[3px] rounded-full bg-white transition-all"
                style={{ width: 20, height: 20, left: on ? 21 : 3 }}
            />
        </button>
    );

    return (
        <div className="settings-panel glass-panel p-6 flex flex-col gap-5">
            {alert?.show && <Alert type={alert.type} message={alert.message} onClose={hideAlert} duration={alert.duration} />}

            <div>
                <h3 className="heading-md text-base sm:text-lg md:text-xl flex items-center mb-2">
                    <Plug size={22} className="mr-3" />
                    MCP — Agentic Access
                </h3>
                <p className="text-muted text-xs leading-relaxed">
                    Connect an AI client (e.g. Claude) over OAuth so it can read and manage your
                    portfolio — bookings, messages, treasury and projects — without opening the dashboard.
                </p>
            </div>

            {/* Server URL to paste into the client */}
            <div className="flex flex-col gap-2">
                <label className="dashboard-label">Server URL</label>
                <div className="flex gap-2">
                    <input
                        className="dashboard-input flex-1"
                        placeholder="https://us-central1-<project>.cloudfunctions.net/mcp"
                        value={urlDraft}
                        onChange={(e) => setUrlDraft(e.target.value)}
                        onBlur={() => { if (urlDraft.trim() !== cfg.url) patch({ url: urlDraft.trim() }, 'Server URL saved'); }}
                    />
                    <button
                        type="button"
                        onClick={copyUrl}
                        disabled={!cfg.url}
                        className="inline-flex items-center gap-2 px-4 rounded-xl text-sm font-bold cursor-pointer disabled:opacity-40"
                        style={{ border: '1px solid var(--section-border)' }}
                    >
                        {copied ? <Check size={16} /> : <Copy size={16} />}
                        {copied ? 'Copied' : 'Copy'}
                    </button>
                </div>
                <p className="text-muted text-[11px] leading-relaxed">
                    In Claude: Settings → Connectors → Add custom connector, paste this URL, then sign in with your admin Google account.
                </p>
            </div>

            {/* Enable */}
            <div className="flex items-center justify-between gap-4">
                <div>
                    <div className="text-sm font-bold text-primary">Enable MCP server</div>
                    <div className="text-muted text-[11px]">When off, all connected clients are refused.</div>
                </div>
                {toggle(cfg.enabled, () => patch({ enabled: !cfg.enabled }), 'Enable MCP server')}
            </div>

            {/* Allow writes */}
            <div className="flex items-center justify-between gap-4">
                <div>
                    <div className="text-sm font-bold text-primary flex items-center gap-2">
                        Allow writes
                        {cfg.writesEnabled && <ShieldAlert size={14} style={{ color: 'var(--warning)' }} />}
                    </div>
                    <div className="text-muted text-[11px]">Lets the AI add / edit / delete (projects, expenses, income). Reads always work.</div>
                </div>
                {toggle(cfg.writesEnabled, () => patch({ writesEnabled: !cfg.writesEnabled }), 'Allow writes')}
            </div>

            {/* Revoke */}
            <div className="flex items-center justify-between gap-4 pt-2" style={{ borderTop: '1px solid var(--section-border)' }}>
                <div>
                    <div className="text-sm font-bold text-primary">Revoke all access</div>
                    <div className="text-muted text-[11px]">Invalidates every issued token. The client must sign in again.</div>
                </div>
                <button
                    type="button"
                    onClick={() => patch({ revokedBefore: Date.now() }, 'All MCP access revoked')}
                    className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold cursor-pointer"
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
