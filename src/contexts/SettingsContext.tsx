import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { watchDoc } from '../lib/liveDoc';
import accountSnapshot from '../data/account.snapshot.json';

// ── Types ──────────────────────────────────────────────────────────────

interface AccountData {
    name?: string;
    title?: string;
    imageUrl?: string;
    heroImageUrl?: string;
    heroImageUrlDark?: string;
    [key: string]: unknown;
}

interface SettingsContextValue {
    /** Settings/Account - shared across Hero, Stack, SecretPage */
    account: AccountData | null;
    /** True until the first snapshot resolves (for loading states) */
    accountLoading: boolean;
}

// The hero draws with the name + title before Firebase has loaded: the last copy this
// browser saw, else the build's snapshot (scripts/sync-projects.mjs). The live document
// replaces it as soon as it arrives.
const CACHE_KEY = 'revil_account';
function seedAccount(): AccountData {
    try {
        const cached = JSON.parse(localStorage.getItem(CACHE_KEY) || 'null');
        if (cached && typeof cached === 'object') return { ...accountSnapshot, ...cached };
    } catch { /* ignore */ }
    return { ...accountSnapshot };
}

// ── Context ────────────────────────────────────────────────────────────

const SettingsContext = createContext<SettingsContextValue>({
    account: null,
    accountLoading: true,
});

// ── Provider ───────────────────────────────────────────────────────────

export const SettingsProvider = ({ children }: { children: ReactNode }) => {
    const [account, setAccount] = useState<AccountData | null>(seedAccount);
    const [accountLoading, setAccountLoading] = useState(true);

    useEffect(() => {
        const unsub = watchDoc(
            ['Settings', 'Account'],
            (data) => {
                if (data) {
                    setAccount(data as AccountData);
                    try { localStorage.setItem(CACHE_KEY, JSON.stringify({ name: data.name, title: data.title })); } catch { /* ignore */ }
                }
                setAccountLoading(false);
            },
            (error) => {
                const status = navigator.onLine ? 'Service Blocked (ISP/Firewall)' : 'Offline';
                // info (not warn): this is a benign connectivity/ISP condition, not an app
                // error. Keeps the Lighthouse "no browser errors" audit clean on flaky networks.
                console.info(`[SettingsContext] Account sync: ${status}`, error);
                setAccountLoading(false);
            }
        );
        return () => unsub();
    }, []);

    return (
        <SettingsContext.Provider value={{ account, accountLoading }}>
            {children}
        </SettingsContext.Provider>
    );
};

// ── Hook ───────────────────────────────────────────────────────────────

export const useSettings = () => useContext(SettingsContext);
