
import { useState, useEffect, useCallback } from 'react';
import { doc, setDoc, increment, collection, addDoc, updateDoc } from 'firebase/firestore';
import { db } from '../lib/firebase';

export const useSocialTracker = () => {
    const [pendingVisit, setPendingVisit] = useState<{ linkName: string; visitId: string; clickTime: number } | null>(null);

    const trackClick = useCallback(async (linkName: string) => {
        const clickTime = Date.now();
        try {
            // 1. Create a visit record
            const visitRef = await addDoc(collection(db, 'Analytics', 'Socials', 'Links', linkName, 'Visits'), {
                clickTime,
                duration: null, // pending return
                status: 'clicked'
            });

            // 2. Update stats
            const statsRef = doc(db, 'Analytics', 'Socials', 'Links', linkName);
            await setDoc(statsRef, {
                clicks: increment(1),
                lastClick: clickTime,
                name: linkName
            }, { merge: true });

            // 3. Set pending state for return tracking
            setPendingVisit({ linkName, visitId: visitRef.id, clickTime });

            // 4. Dispatch Global Event for Algorithm.tsx (Session Recording)
            window.dispatchEvent(new CustomEvent('revil:social_click', {
                detail: { name: linkName }
            }));

        } catch (error) {
            console.error('Error tracking social click:', error);
        }
    }, []);

    useEffect(() => {
        const handleVisibilityChange = async () => {
            if (document.visibilityState === 'visible' && pendingVisit) {
                const endTime = Date.now();
                const duration = endTime - pendingVisit.clickTime;

                // Only record meaningful durations (e.g. > 1 second)
                // Filter out accidental switches that are too fast?
                // User asked for "how many minutes outside", so duration is key.

                try {
                    // 1. Update the specific visit record
                    const visitRef = doc(db, 'Analytics', 'Socials', 'Links', pendingVisit.linkName, 'Visits', pendingVisit.visitId);
                    await updateDoc(visitRef, {
                        duration,
                        returnTime: endTime,
                        status: 'returned'
                    });

                    // 2. Update aggregate stats
                    const statsRef = doc(db, 'Analytics', 'Socials', 'Links', pendingVisit.linkName);
                    await updateDoc(statsRef, {
                        totalDuration: increment(duration),
                        returns: increment(1)
                    });

                    // 3. Dispatch Global Event for Algorithm.tsx (Session Recording)
                    window.dispatchEvent(new CustomEvent('revil:social_return', {
                        detail: { name: pendingVisit.linkName, duration }
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
