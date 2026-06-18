import { useState, useEffect, useCallback } from 'react';
import { doc, updateDoc, runTransaction, serverTimestamp } from 'firebase/firestore';
import { db } from '../lib/firebase';

// Convert milliseconds to seconds
const msToSeconds = (ms: number) => Math.round(ms / 1000 * 10) / 10; // Round to 1 decimal

// Format timestamp to DD/MM/YYYY-H:MMPM format
const formatTimestamp = (ms: number) => {
    const date = new Date(ms);
    const day = String(date.getDate()).padStart(2, '0');
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const year = date.getFullYear();
    let hours = date.getHours();
    const minutes = String(date.getMinutes()).padStart(2, '0');
    const period = hours >= 12 ? 'PM' : 'AM';
    hours = hours % 12 || 12; // Convert to 12-hour format
    return `${day}/${month}/${year}-${hours}:${minutes}${period}`;
};

export const useSocialTracker = () => {
    const [pendingVisit, setPendingVisit] = useState<{ linkName: string; clickId: string; clickTime: number } | null>(null);

    const trackClick = useCallback(async (linkName: string) => {
            const clickTime = Date.now();
            let clickKey = '';

            // Always notify Algorithm.tsx for in-app session recording, regardless of
            // whether the remote Firestore write succeeds (offline / rate-limited / rejected).
            const notifyInApp = () => window.dispatchEvent(new CustomEvent('revil:social_click', {
                detail: { name: linkName },
            }));

            // The Socials/{name} create rule requires this exact charset; if the name
            // doesn't match, the write would be rejected - skip the remote write but
            // still fire the in-app event so the click is counted locally.
            if (!/^[a-zA-Z0-9_-]{1,40}$/.test(linkName)) {
                notifyInApp();
                return;
            }

            try {
                const socialRef = doc(db, 'Settings', 'Views', 'Socials', linkName);

                // Use transaction to avoid lost-updates if two users click at exact same time
                await runTransaction(db, async (transaction) => {
                    const socialSnap = await transaction.get(socialRef);
                    let nextClickNum = 1;

                    if (socialSnap.exists()) {
                        const data = socialSnap.data();
                        // Find highest numeric key
                        const existingKeys = Object.keys(data)
                            .map(key => parseInt(key))
                            .filter(num => !isNaN(num));
                        if (existingKeys.length > 0) {
                            nextClickNum = Math.max(...existingKeys) + 1;
                        }
                    }

                    clickKey = nextClickNum.toString();
                    transaction.set(socialRef, {
                        [clickKey]: {
                            timestamp: formatTimestamp(clickTime),
                            duration: null // Will be updated on return
                        },
                        lastWrite: serverTimestamp() // required by rate-limit rule
                    }, { merge: true });
                });

                if (clickKey) {
                    // Set pending state for duration tracking
                    setPendingVisit({ linkName, clickId: clickKey, clickTime });
                }
            } catch (error) {
                console.error('Error tracking social click:', error);
            } finally {
                // Fire the in-app event even if the Firestore write failed, so the
                // session recorder + analytics never silently undercount a real click.
                notifyInApp();
            }
    }, []);

    useEffect(() => {
        const handleVisibilityChange = async () => {
            if (document.visibilityState === 'visible' && pendingVisit) {
                const endTime = Date.now();
                const durationMs = endTime - pendingVisit.clickTime;
                const durationSec = msToSeconds(durationMs);

                try {
                    // Update duration for this click as a string
                    const socialRef = doc(db, 'Settings', 'Views', 'Socials', pendingVisit.linkName);
                    await updateDoc(socialRef, {
                        [`${pendingVisit.clickId}.duration`]: durationSec.toString(),
                        lastWrite: serverTimestamp() // required by rate-limit rule
                    });

                    // Dispatch Global Event for Algorithm.tsx (Session Recording)
                    window.dispatchEvent(new CustomEvent('revil:social_return', {
                        detail: { name: pendingVisit.linkName, duration: durationMs }
                    }));

                } catch (error) {
                    console.error('Error tracking social return:', error);
                } finally {
                    setPendingVisit(null);
                }
            }
        };

        document.addEventListener('visibilitychange', handleVisibilityChange);
        return () => {
            document.removeEventListener('visibilitychange', handleVisibilityChange);
        };
    }, [pendingVisit]);

    return { trackClick };
};
