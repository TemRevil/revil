import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from '../lib/firebase';

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
    /** Settings/Account — shared across Hero, Stack, SecretPage */
    account: AccountData | null;
    /** True until the first snapshot resolves (for loading states) */
    accountLoading: boolean;
}

// ── Context ────────────────────────────────────────────────────────────

const SettingsContext = createContext<SettingsContextValue>({
    account: null,
    accountLoading: true,
});

// ── Provider ───────────────────────────────────────────────────────────

export const SettingsProvider = ({ children }: { children: ReactNode }) => {
    const [account, setAccount] = useState<AccountData | null>(null);
    const [accountLoading, setAccountLoading] = useState(true);

    useEffect(() => {
        const unsub = onSnapshot(
            doc(db, 'Settings', 'Account'),
            (snap) => {
                if (snap.exists()) {
                    setAccount(snap.data() as AccountData);
                }
                setAccountLoading(false);
            },
            (error) => {
                const status = navigator.onLine ? 'Service Blocked (ISP/Firewall)' : 'Offline';
                console.warn(`[SettingsContext] Account sync: ${status}`, error);
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
