import { useEffect, useRef, useCallback } from 'react';
import { doc, getDoc, updateDoc, increment, collection, getDocs, setDoc } from 'firebase/firestore';
import { db } from '../lib/firebase';
import Alert from './Alert';
import useSafeAlert from '../hooks/useSafeAlert';

interface AlgorithmProps {
    currentSection: string;
    isContactOpen: boolean;
    // parameter name intentionally unused in the type signature
    onNavigate: (_section: 'home' | 'stack' | 'projects' | 'secret' | 'dashboard' | 'view_link') => void;
}

interface ProjectStats {
    views: number;
    duration: number; // seconds
}

export const Algorithm = ({ currentSection, isContactOpen, onNavigate }: AlgorithmProps) => {
    const { alert, showAlert, hideAlert } = useSafeAlert(4000);

    // Session Start
    const sessionStart = useRef(Date.now());

    // Metrics Refs
    const metrics = useRef({
        stackTime: 0, // seconds
        contactOpens: 0,
        projectStats: {} as Record<string, ProjectStats>,
        activeProjectId: null as string | null,
        projectOpenTime: 0,
        socialStats: {} as Record<string, { views: number; duration: number }>,
        isSyncing: false,
        baseMetrics: null as string | null,
    });

    // Tracking active section time
    const lastSectionCheck = useRef(Date.now());

    // Contact Open Tracking
    const prevContactOpen = useRef(isContactOpen);

    // 1. Track Section Time & Contact Clicks
    useEffect(() => {
        const interval = setInterval(() => {
            const now = Date.now();
            const elapsed = (now - lastSectionCheck.current) / 1000;

            if (currentSection === 'stack') {
                metrics.current.stackTime += elapsed;
            }

            // Update project time if one is open
            if (metrics.current.activeProjectId) {
                const pid = metrics.current.activeProjectId;
                if (!metrics.current.projectStats[pid]) {
                    metrics.current.projectStats[pid] = { views: 0, duration: 0 };
                }
                metrics.current.projectStats[pid].duration += elapsed;
            }

            lastSectionCheck.current = now;
        }, 1000);

        // Stop tracking if we enter admin sections
        if (currentSection === 'dashboard' || currentSection === 'secret') {
            sessionStorage.removeItem('revil_link_id');
            metrics.current.baseMetrics = null;
        }

        return () => clearInterval(interval);
    }, [currentSection]);

    // Track Contact Opens
    useEffect(() => {
        if (isContactOpen && !prevContactOpen.current) {
            metrics.current.contactOpens += 1;
        }
        prevContactOpen.current = isContactOpen;
    }, [isContactOpen]);

    // 1.5 Helper to increment specific daily stats in Firestore
    const incrementDailyStat = useCallback(async (field: 'projectViews' | 'socialClicks') => {
        try {
            const today = new Date().toISOString().split('T')[0];
            const dailyRef = doc(db, 'Settings', 'Views', 'Analysis', 'Daily');
            const mainRef = doc(db, 'Settings', 'Views', 'Analysis', 'Main');

            // Map the field to the corresponding Main document field
            const mainField = field === 'projectViews' ? 'Total Project Views' : 'Total Social Clicks';

            // Update Daily
            await setDoc(dailyRef, {
                [today]: {
                    [field]: increment(1)
                }
            }, { merge: true });

            // Update Main
            await setDoc(mainRef, {
                [mainField]: increment(1)
            }, { merge: true });

        } catch (error) {
            console.error(`Error incrementing daily ${field}:`, error);
        }
    }, []);

    // 2. Listen for Project Events & Social Events
    useEffect(() => {
        const handleProjectOpen = (e: CustomEvent) => {
            const { id } = e.detail;
            metrics.current.activeProjectId = id;
            metrics.current.projectOpenTime = Date.now();

            if (!metrics.current.projectStats[id]) {
                metrics.current.projectStats[id] = { views: 0, duration: 0 };
            }
            metrics.current.projectStats[id].views += 1;
            incrementDailyStat('projectViews');
        };

        const handleProjectClose = () => {
            metrics.current.activeProjectId = null;
        };

        const handleSocialClick = (e: CustomEvent) => {
            const { name } = e.detail;
            if (!metrics.current.socialStats[name]) {
                metrics.current.socialStats[name] = { views: 0, duration: 0 };
            }
            metrics.current.socialStats[name].views += 1;
            incrementDailyStat('socialClicks');
        };

        const handleSocialReturn = (e: CustomEvent) => {
            const { name, duration } = e.detail;
            // duration comes in ms from hook, convert to seconds
            const durationSec = duration / 1000;
            if (!metrics.current.socialStats[name]) {
                metrics.current.socialStats[name] = { views: 0, duration: 0 };
            }
            metrics.current.socialStats[name].duration += durationSec;
        };

        window.addEventListener('revil:project_open', handleProjectOpen as EventListener);
        window.addEventListener('revil:project_close', handleProjectClose as EventListener);
        window.addEventListener('revil:social_click', handleSocialClick as EventListener);
        window.addEventListener('revil:social_return', handleSocialReturn as EventListener);

        return () => {
            window.removeEventListener('revil:project_open', handleProjectOpen as EventListener);
            window.removeEventListener('revil:project_close', handleProjectClose as EventListener);
            window.removeEventListener('revil:social_click', handleSocialClick as EventListener);
            window.removeEventListener('revil:social_return', handleSocialReturn as EventListener);
        };
    }, [incrementDailyStat]);

    // 2.5 Global Analytics Tracking
    const hasTrackedVisit = useRef(false);
    useEffect(() => {
        const trackGlobalVisit = async () => {
            if (hasTrackedVisit.current || currentSection === 'dashboard' || currentSection === 'secret') return;
            hasTrackedVisit.current = true;

            try {
                const mainRef = doc(db, 'Settings', 'Views', 'Analysis', 'Main');
                const dailyRef = doc(db, 'Settings', 'Views', 'Analysis', 'Daily');
                const today = new Date().toISOString().split('T')[0];

                const hasVisitedToday = localStorage.getItem(`revil_visitor_today_${today}`);

                // Get Main analytics
                const mainSnap = await getDoc(mainRef);
                const mainData = mainSnap.exists() ? mainSnap.data() : {};

                // Get Daily analytics
                const dailySnap = await getDoc(dailyRef);
                const dailyData = dailySnap.exists() ? dailySnap.data() : {};

                const todayData = dailyData[today] || { total: 0, unique: 0 };

                // Update counters for Main
                const currentTotal = typeof mainData["Total Reach"] === 'number' ? mainData["Total Reach"] : parseInt(mainData["Total Reach"] || '0');
                const newTodayTotal = (todayData.total || 0) + 1;

                // Calculate Daily Unique
                let newUniqueToday = todayData.unique || 0;
                if (!hasVisitedToday) {
                    newUniqueToday += 1;
                    localStorage.setItem(`revil_visitor_today_${today}`, 'true');
                }

                // Update Main document
                await setDoc(mainRef, {
                    "Total Reach": currentTotal + 1,
                    "Today's Viewers": newTodayTotal,
                    "Reach (Per Device)": newUniqueToday,
                    "Total Project Views": mainData["Total Project Views"] || 0,
                    "Total Social Clicks": mainData["Total Social Clicks"] || 0
                }, { merge: true });

                // Update Daily map in Daily document
                await setDoc(dailyRef, {
                    [today]: {
                        total: newTodayTotal,
                        unique: newUniqueToday,
                        // Initialize these if it's the first visit of the day
                        projectViews: todayData.projectViews || 0,
                        socialClicks: todayData.socialClicks || 0
                    }
                }, { merge: true });
            } catch (error) {
                console.error("Global Analytics Error:", error);
            }
        };

        trackGlobalVisit();
    }, [currentSection]);

    // 2.6 Initial Link Recording & Verification
    const hasRecordedRef = useRef(false);
    useEffect(() => {
        const recordLink = async () => {
            if (hasRecordedRef.current) return;

            const path = window.location.pathname;
            const pathParts = path.split('/').filter(Boolean);
            const baseParts = import.meta.env.BASE_URL.split('/').filter(Boolean);
            const code = pathParts.length > baseParts.length ? pathParts[pathParts.length - 1] : '';

            if (!code) return;
            hasRecordedRef.current = true;

            try {
                // Get all links from Settings/Views/Links collection
                const linksSnap = await getDocs(collection(db, 'Settings', 'Views', 'Links'));
                let foundId: string | null = null;
                let existingRec = '';
                for (const linkDoc of linksSnap.docs) {
                    const item = linkDoc.data() as Record<string, unknown>;
                    const itemCode = typeof item['Code'] === 'string' ? String(item['Code']) : '';
                    const itemRec = typeof item['Rec_CLI'] === 'string' ? String(item['Rec_CLI']) : '';
                    if (itemCode === code || itemRec === code) {
                        foundId = linkDoc.id;
                        existingRec = itemRec || '';
                        break;
                    }
                }

                if (!foundId) {
                    return;
                }

                sessionStorage.setItem('revil_link_id', foundId);
                metrics.current.baseMetrics = existingRec;

                // Check for Interviewer Mode
                const linkDoc = linksSnap.docs.find(d => d.id === foundId);
                if (linkDoc) {
                    const linkData = linkDoc.data() as Record<string, unknown>;
                    const isInterviewer = !!linkData && (linkData['Interviewer'] === true);
                    if (isInterviewer) {
                        sessionStorage.setItem('revil_interviewer_mode', 'true');
                    } else {
                        sessionStorage.removeItem('revil_interviewer_mode');
                    }

                    // Increment view count in Settings/Views/Links/{foundId}
                    const docRef = doc(db, 'Settings', 'Views', 'Links', foundId);
                    await updateDoc(docRef, {
                        Views: increment(1)
                    });
                }

                // Always redirect home after processing code
                if (onNavigate) {
                    setTimeout(() => onNavigate('home'), 500);
                }
            } catch {
                showAlert({ type: 'error', message: 'Failed to record link activity.' });
                if (onNavigate) {
                    setTimeout(() => onNavigate('home'), 500);
                }
            }
        };

        recordLink();
    }, [onNavigate, showAlert]);

    // 3. Sync to Firestore (Final Push with Accumulation)
    const syncData = useCallback(async () => {
        const linkId = sessionStorage.getItem('revil_link_id');
        if (!linkId || metrics.current.isSyncing) return;

        const totalSessionSeconds = Math.floor((Date.now() - sessionStart.current) / 1000);
        const m = metrics.current;

        // Prevent syncing if session is too short and has no activity
        if (totalSessionSeconds < 5 && m.contactOpens === 0 && Object.keys(m.projectStats).length === 0 && Object.keys(m.socialStats).length === 0) {
            return;
        }

        metrics.current.isSyncing = true;

        // Helper to parse time strings into total seconds
        const parseToSecs = (raw: string | null, label: string) => {
            if (!raw) return 0;
            try {
                const regex = new RegExp(`${label}:\\s*(.*?)(?:,|]|$)`);
                const match = raw.match(regex);
                if (!match) return 0;
                const timeStr = match[1];

                const msMatch = timeStr.match(/(\d+)m\s*(\d+)s/);
                if (msMatch) return (parseInt(msMatch[1]) * 60) + parseInt(msMatch[2]);

                const mMatch = timeStr.match(/([\d.]+)m/);
                if (mMatch) return Math.floor(parseFloat(mMatch[1]) * 60);
            } catch (e) {
                console.error(`Error parsing ${label} seconds:`, e);
            }
            return 0;
        };

        const parseProjects = (raw: string | null) => {
            const pMap: Record<string, { seconds: number; views: number }> = {};
            if (!raw) return pMap;
            try {
                const pStr = raw.match(/Projects:\[(.*?)\]/)?.[1] || raw.match(/P:\[(.*?)\]/)?.[1] || '';
                if (pStr) {
                    pStr.split('|').forEach(item => {
                        const parts = item.split(':');
                        if (parts.length >= 2) {
                            const id = parts[0];
                            const timePart = parts[1];
                            const viewsMatch = item.match(/\((\d+)x\)$/) || item.match(/:(\d+)v$/);
                            const views = viewsMatch ? parseInt(viewsMatch[1]) : 0;

                            let seconds = 0;
                            const msMatch = timePart.match(/(\d+)m\s*(\d+)s/);
                            const mMatch = timePart.match(/([\d.]+)m/);
                            if (msMatch) seconds = (parseInt(msMatch[1]) * 60) + parseInt(msMatch[2]);
                            else if (mMatch) seconds = Math.floor(parseFloat(mMatch[1]) * 60);

                            pMap[id] = { seconds, views };
                        }
                    });
                }
            } catch (e) {
                console.error("Error parsing projects:", e);
            }
            return pMap;
        };

        const parseSocials = (raw: string | null) => {
            const sMap: Record<string, { seconds: number; views: number }> = {};
            if (!raw) return sMap;
            try {
                const sStr = raw.match(/Socials:\[(.*?)\]/)?.[1] || '';
                if (sStr) {
                    sStr.split('|').forEach(item => {
                        const parts = item.split(':');
                        if (parts.length >= 2) {
                            const id = parts[0];
                            const timePart = parts[1];
                            const viewsMatch = item.match(/\((\d+)x\)$/);
                            const views = viewsMatch ? parseInt(viewsMatch[1]) : 0;

                            let seconds = 0;
                            const msMatch = timePart.match(/(\d+)m\s*(\d+)s/);
                            if (msMatch) seconds = (parseInt(msMatch[1]) * 60) + parseInt(msMatch[2]);

                            sMap[id] = { seconds, views };
                        }
                    });
                }
            } catch (e) {
                console.error("Error parsing socials:", e);
            }
            return sMap;
        };

        let baseTotalSecs = 0;
        let baseStackSecs = 0;
        let baseContact = 0;
        let baseProjects = {} as Record<string, { seconds: number; views: number }>;
        let baseSocials = {} as Record<string, { seconds: number; views: number }>;

        try {
            baseTotalSecs = parseToSecs(metrics.current.baseMetrics, 'Session') || parseToSecs(metrics.current.baseMetrics, 'T');
            baseStackSecs = parseToSecs(metrics.current.baseMetrics, 'Stack') || parseToSecs(metrics.current.baseMetrics, 'S');
            baseContact = parseInt(metrics.current.baseMetrics?.match(/Contact:(\d+)/)?.[1] || metrics.current.baseMetrics?.match(/C:(\d+)/)?.[1] || '0');
            baseProjects = parseProjects(metrics.current.baseMetrics);
            baseSocials = parseSocials(metrics.current.baseMetrics);
        } catch (e) {
            console.error("Critical parsing error in syncData, using fallbacks:", e);
        }

        const finalTotalSecs = baseTotalSecs + totalSessionSeconds;
        const finalStackSecs = baseStackSecs + m.stackTime;
        const finalContact = baseContact + m.contactOpens;

        const formatTime = (s: number) => {
            const mins = Math.floor(s / 60);
            const secs = Math.floor(s % 60);
            return `${mins}m ${secs}s`;
        };

        // Merge project stats
        const mergedProjects = { ...baseProjects };
        Object.entries(m.projectStats).forEach(([id, stats]) => {
            if (!mergedProjects[id]) mergedProjects[id] = { seconds: 0, views: 0 };
            mergedProjects[id].seconds += stats.duration;
            mergedProjects[id].views += stats.views;
        });

        const projStr = Object.entries(mergedProjects).map(([id, stats]) => {
            return `${id}:${formatTime(stats.seconds)}(${stats.views}x)`;
        }).join('|');

        // Merge social stats
        const mergedSocials = { ...baseSocials };
        Object.entries(m.socialStats).forEach(([id, stats]) => {
            if (!mergedSocials[id]) mergedSocials[id] = { seconds: 0, views: 0 };
            mergedSocials[id].seconds += stats.duration;
            mergedSocials[id].views += stats.views;
        });

        const socialStr = Object.entries(mergedSocials).map(([id, stats]) => {
            return `${id}:${formatTime(stats.seconds)}(${stats.views}x)`;
        }).join('|');

        const recString = `Session:${formatTime(finalTotalSecs)}, Stack:${formatTime(finalStackSecs)}, Contact:${finalContact}, Projects:[${projStr}], Socials:[${socialStr}]`;

        try {
            const docRef = doc(db, 'Settings', 'Views', 'Links', linkId);
            await updateDoc(docRef, {
                Rec_CLI: recString
            });
        } catch {
            showAlert({ type: 'error', message: 'Final sync failed. Some activity might not be saved.' });
        } finally {
            metrics.current.isSyncing = false;
        }
    }, [showAlert]);

    // Only Sync at the very end
    useEffect(() => {
        const handleFinalSync = () => {
            syncData();
        };

        window.addEventListener('beforeunload', handleFinalSync);
        window.addEventListener('pagehide', handleFinalSync);

        return () => {
            window.removeEventListener('beforeunload', handleFinalSync);
            window.removeEventListener('pagehide', handleFinalSync);
        };
    }, [syncData]);

    return (
        <>
            {alert?.show && (
                <Alert
                    type={alert.type}
                    message={alert.message}
                    onClose={() => hideAlert()}
                    duration={alert.duration ?? 4000}
                />
            )}
        </>
    );
};
