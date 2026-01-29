import { useEffect, useRef, useState } from 'react';
import { doc, getDoc, updateDoc } from 'firebase/firestore';
import { db } from '../lib/firebase';
import Alert, { AlertType } from './Alert';

interface AlgorithmProps {
    currentSection: string;
    isContactOpen: boolean;
    onNavigate: (section: any) => void;
}

interface ProjectStats {
    views: number;
    duration: number; // seconds
}

export const Algorithm = ({ currentSection, isContactOpen, onNavigate }: AlgorithmProps) => {
    const [alert, setAlert] = useState<{ show: boolean; type: AlertType; message: string }>({
        show: false,
        type: 'success',
        message: ''
    });

    // Session Start
    const sessionStart = useRef(Date.now());

    // Metrics Refs (Using refs to avoid interval re-renders)
    const metrics = useRef({
        stackTime: 0, // seconds
        contactOpens: 0,
        projectStats: {} as Record<string, ProjectStats>,
        activeProjectId: null as string | null,
        projectOpenTime: 0,
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

    // 2. Listen for Project Events
    useEffect(() => {
        const handleProjectOpen = (e: CustomEvent) => {
            const { id } = e.detail;
            metrics.current.activeProjectId = id;
            metrics.current.projectOpenTime = Date.now();

            if (!metrics.current.projectStats[id]) {
                metrics.current.projectStats[id] = { views: 0, duration: 0 };
            }
            metrics.current.projectStats[id].views += 1;
        };

        const handleProjectClose = () => {
            metrics.current.activeProjectId = null;
        };

        window.addEventListener('revil:project_open', handleProjectOpen as EventListener);
        window.addEventListener('revil:project_close', handleProjectClose as EventListener);

        return () => {
            window.removeEventListener('revil:project_open', handleProjectOpen as EventListener);
            window.removeEventListener('revil:project_close', handleProjectClose as EventListener);
        };
    }, []);

    // 2.5 Global Analytics Tracking
    useEffect(() => {
        const trackGlobalVisit = async () => {
            // Avoid tracking site visits when in dashboard or secret pages
            if (currentSection === 'dashboard' || currentSection === 'secret') return;

            try {
                const docRef = doc(db, 'Settings', 'Views');
                const docSnap = await getDoc(docRef);

                const hasVisited = localStorage.getItem('revil_visitor_active');
                const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD

                let currentTotal = 0;
                let currentUnique = 0;
                let daily = {} as any;

                if (docSnap.exists()) {
                    const data = docSnap.data();
                    const main = data.Main || {};
                    currentTotal = parseInt(main["Total Reach"] || '0');
                    currentUnique = parseInt(main["Reach (Per Device)"] || '0');
                    daily = data.Daily || {};
                }

                const newTotal = currentTotal + 1;
                const todayStats = daily[today] || { total: 0, unique: 0 };
                const newTodayTotal = todayStats.total + 1;
                let newUnique = currentUnique;
                let newTodayUnique = todayStats.unique;

                if (!hasVisited) {
                    newUnique = currentUnique + 1;
                    newTodayUnique = todayStats.unique + 1;
                    localStorage.setItem('revil_visitor_active', 'true');
                }

                const updateData: any = {
                    "Main.Total Reach": String(newTotal),
                    "Main.Reach (Per Device)": String(newUnique),
                    "Main.Today's Viewers": String(newTodayTotal),
                    [`Daily.${today}.total`]: newTodayTotal,
                    [`Daily.${today}.unique`]: newTodayUnique
                };

                await updateDoc(docRef, updateData);
            } catch (error) {
                console.error("Global Analytics Error:", error);
            }
        };

        trackGlobalVisit();
    }, []);

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
                const docRef = doc(db, 'Settings', 'Views');
                const docSnap = await getDoc(docRef);

                if (docSnap.exists()) {
                    const data = docSnap.data();
                    let foundId: string | null = null;
                    let currentViews = 0;
                    let existingRec = '';

                    for (const [key, value] of Object.entries(data)) {
                        const item = value as any;
                        if (item.Code === code || item.Rec_CLI === code) {
                            foundId = key;
                            currentViews = item.Views || 0;
                            existingRec = item.Rec_CLI || '';
                            break;
                        }
                    }

                    if (foundId) {
                        sessionStorage.setItem('revil_link_id', foundId);
                        metrics.current.baseMetrics = existingRec;

                        // Check for Interviewer Mode
                        const linkData = data[foundId] as any;
                        if (linkData?.Interviewer) {
                            sessionStorage.setItem('revil_interviewer_mode', 'true');
                        } else {
                            sessionStorage.removeItem('revil_interviewer_mode');
                        }

                        await updateDoc(docRef, {
                            [`${foundId}.Views`]: currentViews + 1
                        });
                    }
                }

                // Always redirect home after processing code
                setTimeout(() => onNavigate('home'), 500);
            } catch (error) {
                setAlert({ show: true, type: 'error', message: 'Failed to record link activity.' });
                setTimeout(() => onNavigate('home'), 500);
            }
        };

        recordLink();
    }, [onNavigate]);

    // 3. Sync to Firestore (Final Push with Accumulation)
    const syncData = async () => {
        const linkId = sessionStorage.getItem('revil_link_id');
        if (!linkId || metrics.current.isSyncing) return;

        const totalSessionSeconds = Math.floor((Date.now() - sessionStart.current) / 1000);
        const m = metrics.current;

        // Prevent syncing if session is too short and has no activity (e.g. accidental bot hit or quick refresh)
        if (totalSessionSeconds < 5 && m.contactOpens === 0 && Object.keys(m.projectStats).length === 0) {
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

                // Match 'Xm Ys'
                const msMatch = timeStr.match(/(\d+)m\s*(\d+)s/);
                if (msMatch) return (parseInt(msMatch[1]) * 60) + parseInt(msMatch[2]);

                // Match 'X.Ym'
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

        let baseTotalSecs = 0;
        let baseStackSecs = 0;
        let baseContact = 0;
        let baseProjects = {} as Record<string, { seconds: number; views: number }>;

        try {
            baseTotalSecs = parseToSecs(metrics.current.baseMetrics, 'Session') || parseToSecs(metrics.current.baseMetrics, 'T');
            baseStackSecs = parseToSecs(metrics.current.baseMetrics, 'Stack') || parseToSecs(metrics.current.baseMetrics, 'S');
            baseContact = parseInt(metrics.current.baseMetrics?.match(/Contact:(\d+)/)?.[1] || metrics.current.baseMetrics?.match(/C:(\d+)/)?.[1] || '0');
            baseProjects = parseProjects(metrics.current.baseMetrics);
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

        const recString = `Session:${formatTime(finalTotalSecs)}, Stack:${formatTime(finalStackSecs)}, Contact:${finalContact}, Projects:[${projStr}]`;

        try {
            const docRef = doc(db, 'Settings', 'Views');
            await updateDoc(docRef, {
                [`${linkId}.Rec_CLI`]: recString
            });
        } catch (err) {
            setAlert({ show: true, type: 'error', message: 'Final sync failed. Some activity might not be saved.' });
        } finally {
            metrics.current.isSyncing = false;
        }
    };

    // Only Sync at the very end to avoid Firestore usage/quota issues
    useEffect(() => {
        const handleFinalSync = () => {
            // This is the "at once" push when user leaves the page
            syncData();
        };

        // Standard event for desktop exit
        window.addEventListener('beforeunload', handleFinalSync);
        // Reliable event for mobile exit and tab closing
        window.addEventListener('pagehide', handleFinalSync);

        return () => {
            window.removeEventListener('beforeunload', handleFinalSync);
            window.removeEventListener('pagehide', handleFinalSync);
        };
    }, []);

    return (
        <>
            {alert.show && (
                <Alert
                    type={alert.type}
                    message={alert.message}
                    onClose={() => setAlert(prev => ({ ...prev, show: false }))}
                />
            )}
        </>
    );
};
