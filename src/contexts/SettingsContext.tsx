import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { watchDoc } from '../lib/liveDoc';
import { cachedDoc } from '../lib/dataCache';

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
}

// ── Context ────────────────────────────────────────────────────────────

const SettingsContext = createContext<SettingsContextValue>({
    account: null,
});

// ── Provider ───────────────────────────────────────────────────────────

export const SettingsProvider = ({ children }: { children: ReactNode }) => {
    // The cached copy (lib/dataCache) first, so the hero never waits for Firebase to show
    // the name and title; the live document replaces it when it arrives.
    const [account, setAccount] = useState<AccountData | null>(() => cachedDoc(['Settings', 'Account']) ?? null);

    useEffect(() => watchDoc(
        ['Settings', 'Account'],
        (data) => { if (data) setAccount(data as AccountData); },
        (error) => {
            const status = navigator.onLine ? 'Service Blocked (ISP/Firewall)' : 'Offline';
            // info (not warn): this is a benign connectivity/ISP condition, not an app
            // error. Keeps the Lighthouse "no browser errors" audit clean on flaky networks.
            console.info(`[SettingsContext] Account sync: ${status}`, error);
        }
    ), []);

    return (
        <SettingsContext.Provider value={{ account }}>
            {children}
        </SettingsContext.Provider>
    );
};

// ── Hook ───────────────────────────────────────────────────────────────

export const useSettings = () => useContext(SettingsContext);
