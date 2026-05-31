import { useEffect, useRef, useCallback } from 'react';
import { doc, getDoc, updateDoc, increment, collection, getDocs, setDoc, serverTimestamp } from 'firebase/firestore';
import { getToken } from 'firebase/app-check';
import { db, appCheck } from '../lib/firebase';
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

// Analytics writes hit rate-limited Firestore docs. A `permission-denied` (rule
// rejected the write because the cooldown hasn't elapsed) or an offline failure is
// expected and harmless — analytics are best-effort. Treat those as benign so they
// don't show up as scary console errors; real bugs still surface.
const isBenignAnalyticsError = (error: unknown): boolean => {
    const code = (error as { code?: string } | null)?.code ?? '';
    const msg = error instanceof Error ? error.message : String(error ?? '');
    return code === 'permission-denied'
        || code === 'unavailable'
        || /permission|insufficient|offline|unavailable/i.test(msg);
};

export const Algorithm = ({ currentSection, isContactOpen, onNavigate }: AlgorithmProps) => {
    const { alert, showAlert, hideAlert } = useSafeAlert(4000);

    // Session Start
    const sessionStart = useRef(0);

    // Cached App Check token. syncSession is an HTTP function with enforceAppCheck,
    // so its raw fetch() must send an X-Firebase-AppCheck header. We can't reliably
    // await getToken() during page-unload, so we keep a fresh token here and attach
    // it synchronously. Refreshed on mount + every 20 min (tokens last ~1h).
    const appCheckToken = useRef('');

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
    const lastSectionCheck = useRef(0);

    // Initialize time refs on mount (avoids calling Date.now() during render)
    useEffect(() => {
        sessionStart.current = Date.now();
        lastSectionCheck.current = Date.now();
    }, []);

    // Warm + refresh the App Check token for the syncSession HTTP call.
    useEffect(() => {
        const ac = appCheck;
        if (!ac) return;
        let active = true;
        const refresh = async () => {
            try {
                const { token } = await getToken(ac, false);
                if (active) appCheckToken.current = token;
            } catch { /* offline / reCAPTCHA hiccup — fetch just omits the header */ }
        };
        refresh();
        const id = setInterval(refresh, 20 * 60 * 1000);
        return () => { active = false; clearInterval(id); };
    }, []);

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

            // Update Daily (lastWrite satisfies rate-limit rule)
            await setDoc(dailyRef, {
                [today]: {
                    [field]: increment(1)
                },
                lastWrite: serverTimestamp()
            }, { merge: true });

            // Update Main
            await setDoc(mainRef, {
                [mainField]: increment(1),
                lastWrite: serverTimestamp()
            }, { merge: true });

        } catch (error) {
            // permission-denied here is benign: the analytics docs are rate-limited by
            // Firestore rules (1 write / cooldown). When the app writes again inside that
            // window (e.g. visit + a quick project click), the rule rejects it. Analytics
            // are best-effort, so swallow that case quietly and only surface real errors.
            if (!isBenignAnalyticsError(error)) {
                console.error(`Error incrementing daily ${field}:`, error);
            }
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

                // Update Main document (lastWrite satisfies rate-limit rule)
                await setDoc(mainRef, {
                    "Total Reach": currentTotal + 1,
                    "Today's Viewers": newTodayTotal,
                    "Reach (Per Device)": newUniqueToday,
                    "Total Project Views": mainData["Total Project Views"] || 0,
                    "Total Social Clicks": mainData["Total Social Clicks"] || 0,
                    lastWrite: serverTimestamp()
                }, { merge: true });

                // Update Daily map in Daily document
                await setDoc(dailyRef, {
                    [today]: {
                        total: newTodayTotal,
                        unique: newUniqueToday,
                        // Initialize these if it's the first visit of the day
                        projectViews: todayData.projectViews || 0,
                        socialClicks: todayData.socialClicks || 0
                    },
                    lastWrite: serverTimestamp()
                }, { merge: true });
            } catch (error) {
                // Benign rate-limit rejection (see incrementDailyStat note) — analytics
                // are best-effort, so don't spam the console with permission-denied.
                if (!isBenignAnalyticsError(error)) {
                    console.error("Global Analytics Error:", error);
                }
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
            const baseParts = "/".split('/').filter(Boolean);
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
                        Views: increment(1),
                        lastWrite: serverTimestamp()
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

    // Only Sync at the very end — using keepalive fetch for reliability
    useEffect(() => {
        const handleFinalSync = () => {
            const linkId = sessionStorage.getItem('revil_link_id');
            if (!linkId || metrics.current.isSyncing) return;

            const totalSessionSeconds = Math.floor((Date.now() - sessionStart.current) / 1000);
            const m = metrics.current;

            // Skip if no meaningful activity
            if (totalSessionSeconds < 5 && m.contactOpens === 0 && Object.keys(m.projectStats).length === 0 && Object.keys(m.socialStats).length === 0) {
                return;
            }

            metrics.current.isSyncing = true;

            // Build the rec string synchronously
            const formatTime = (s: number) => {
                const mins = Math.floor(s / 60);
                const secs = Math.floor(s % 60);
                return `${mins}m ${secs}s`;
            };

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
                } catch { /* swallow */ }
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
                                const msM = timePart.match(/(\d+)m\s*(\d+)s/);
                                const mM = timePart.match(/([\d.]+)m/);
                                if (msM) seconds = (parseInt(msM[1]) * 60) + parseInt(msM[2]);
                                else if (mM) seconds = Math.floor(parseFloat(mM[1]) * 60);
                                pMap[id] = { seconds, views };
                            }
                        });
                    }
                } catch { /* swallow */ }
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
                                const msM = timePart.match(/(\d+)m\s*(\d+)s/);
                                if (msM) seconds = (parseInt(msM[1]) * 60) + parseInt(msM[2]);
                                sMap[id] = { seconds, views };
                            }
                        });
                    }
                } catch { /* swallow */ }
                return sMap;
            };

            const baseTotalSecs = parseToSecs(m.baseMetrics, 'Session') || parseToSecs(m.baseMetrics, 'T');
            const baseStackSecs = parseToSecs(m.baseMetrics, 'Stack') || parseToSecs(m.baseMetrics, 'S');
            const baseContact = parseInt(m.baseMetrics?.match(/Contact:(\d+)/)?.[1] || m.baseMetrics?.match(/C:(\d+)/)?.[1] || '0');
            const baseProjects = parseProjects(m.baseMetrics);
            const baseSocials = parseSocials(m.baseMetrics);

            const finalTotalSecs = baseTotalSecs + totalSessionSeconds;
            const finalStackSecs = baseStackSecs + m.stackTime;
            const finalContact = baseContact + m.contactOpens;

            const mergedProjects = { ...baseProjects };
            Object.entries(m.projectStats).forEach(([id, stats]) => {
                if (!mergedProjects[id]) mergedProjects[id] = { seconds: 0, views: 0 };
                mergedProjects[id].seconds += stats.duration;
                mergedProjects[id].views += stats.views;
            });
            const projStr = Object.entries(mergedProjects).map(([id, stats]) => `${id}:${formatTime(stats.seconds)}(${stats.views}x)`).join('|');

            const mergedSocials = { ...baseSocials };
            Object.entries(m.socialStats).forEach(([id, stats]) => {
                if (!mergedSocials[id]) mergedSocials[id] = { seconds: 0, views: 0 };
                mergedSocials[id].seconds += stats.duration;
                mergedSocials[id].views += stats.views;
            });
            const socialStr = Object.entries(mergedSocials).map(([id, stats]) => `${id}:${formatTime(stats.seconds)}(${stats.views}x)`).join('|');

            const recString = `Session:${formatTime(finalTotalSecs)}, Stack:${formatTime(finalStackSecs)}, Contact:${finalContact}, Projects:[${projStr}], Socials:[${socialStr}]`;
            
            // Truncate to avoid 64KB keepalive limit
            const finalRecString = new Blob([recString]).size > 60000 
                ? recString.substring(0, Math.floor(60000 / 4)) + "...(truncated)"
                : recString;

            // Use Cloud Function with keepalive: true for reliable delivery on page unload.
            // The function validates server-side and writes with admin privileges.
            // Configurable via NEXT_PUBLIC_SYNC_SESSION_URL (defaults to the temrevil1 prod URL).
            const cfUrl = process.env.NEXT_PUBLIC_SYNC_SESSION_URL
                || 'https://us-central1-temrevil1.cloudfunctions.net/syncSession';
            const body = JSON.stringify({ linkId, recCli: finalRecString });

            // syncSession enforces App Check, so attach the X-Firebase-AppCheck header
            // from the token warmed on mount (can't await getToken() during unload).
            const headers: Record<string, string> = { 'Content-Type': 'application/json' };
            if (appCheckToken.current) headers['X-Firebase-AppCheck'] = appCheckToken.current;

            fetch(cfUrl, {
                method: 'POST',
                headers,
                body,
                keepalive: true
            }).catch(() => {
                // Silent fail — page is already closing
            });

            // Do NOT reset isSyncing — this is a one-shot per page lifetime. Resetting it
            // synchronously let both `beforeunload` and `pagehide` (which commonly both fire
            // on close/navigation) send the session POST twice, double-counting the visit.
        };

        window.addEventListener('beforeunload', handleFinalSync);
        window.addEventListener('pagehide', handleFinalSync);

        return () => {
            window.removeEventListener('beforeunload', handleFinalSync);
            window.removeEventListener('pagehide', handleFinalSync);
        };
    }, []);

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
