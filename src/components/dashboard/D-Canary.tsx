import { useState, useMemo, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import anime from 'animejs';
import { motion, AnimatePresence } from 'motion/react';
import { ChevronLeft, ChevronRight, Calendar as CalendarIcon, Clock, Edit2, X, Check, Plus, Trash2, Mail, Phone, FileText, ExternalLink, Video, ImageIcon, Paperclip, MoreVertical, Reply } from 'lucide-react';
import { doc, onSnapshot, updateDoc, deleteField, setDoc } from 'firebase/firestore';
import { httpsCallable, getFunctions } from 'firebase/functions';
import app, { db } from '../../lib/firebase';
import { AvailabilityConfig, DEFAULT_AVAILABILITY, WEEKDAY_LABELS, ALL_HOURS, parseAvailabilityConfig, buildHostSlots, formatHourSlot } from '../../utils/availability';
// Local Functions handle (lazy Dashboard chunk) - keeps firebase/functions out of eager.
const functions = getFunctions(app);

import Alert from '../Alert';
import useSafeAlert from '../../hooks/useSafeAlert';
import MConfirmModal from './M-ConfirmModal';
import MContact from '../M-Contact';
import MReply from './M-Reply';
import CustomTimePicker from '../CustomTimePicker';
import Loader from '../reactbits/Loader';

interface Attachment {
    name: string;
    url: string;
}

interface Meeting {
    id: string;
    title: string;
    time: string;
    date: Date;
    email?: string;
    link?: string;
    reason?: string;
    userTimezone?: number;
    googleEventId?: string;
}

interface Email {
    id: string;
    name: string;
    email: string;
    message: string;
    number: string;
    whatsapp: boolean;
    timestamp: number;
    attachments: Attachment[];
    repliedAt?: number;
}

interface MeetingData {
    Name?: string;
    Time: string;
    Date: string;
    Email?: string;
    MeetingLink?: string;
    "What For"?: string;
    UserTimezone?: number;
    GoogleEventId?: string;
}

interface EmailData {
    Name: string;
    Email: string;
    Message: string;
    Number: string;
    Whatsapp: boolean;
    Timestamp: number;
    "Files Attached"?: Attachment[];
    RepliedAt?: number;
}

const TIME_OPTIONS = [
    "09:00 AM", "10:00 AM", "11:00 AM", "12:00 PM",
    "02:00 PM", "03:00 PM", "04:00 PM", "05:00 PM"
];

const MONTHS = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December"
];

// Parse the host's UTC offset (in hours) from the "Current Time" string stored in
// Settings/Availability (e.g. "... UTC+03:00"). Mirrors the parser in M-Contact so
// the dashboard and the public booking modal agree on the host's timezone.
const getOffsetFromUTCString = (tzStr: string) => {
    const match = (tzStr || '').match(/UTC([+-]\d{2}):(\d{2})/);
    if (!match) return 0;
    const hours = parseInt(match[1], 10);
    const minutes = parseInt(match[2], 10);
    return hours + (minutes / 60) * (hours < 0 ? -1 : 1);
};

const DCanary = () => {
    const [isDark, setIsDark] = useState(false);
    const [viewDate, setViewDate] = useState(new Date());
    const [selectedDate, setSelectedDate] = useState<Date>(new Date());
    const [direction, setDirection] = useState(0);
    const [isLoading, setIsLoading] = useState(false);

    const [editingMeeting, setEditingMeeting] = useState<Meeting | null>(null);
    const [viewingMeeting, setViewingMeeting] = useState<Meeting | null>(null);
    const [isBookingOpen, setIsBookingOpen] = useState(false);
    const [modalDirection, setModalDirection] = useState(0);
    const [modalViewDate, setModalViewDate] = useState(new Date());
    const [windowWidth, setWindowWidth] = useState(typeof window !== 'undefined' ? window.innerWidth : 1200);
    const [meetings, setMeetings] = useState<Meeting[]>([]);
    const [hostTimezoneString, setHostTimezoneString] = useState('');
    const { alert, showAlert, hideAlert } = useSafeAlert(4000);
    const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
    const [previewAttachment, setPreviewAttachment] = useState<Attachment | null>(null);

    // Section state
    const [activeSection, setActiveSection] = useState<'bookings' | 'mails' | 'hours'>('bookings');
    // Working-hours editor state (Hours tab). availDirtyRef guards the live snapshot
    // from clobbering in-progress edits before they're saved.
    const [availDraft, setAvailDraft] = useState<AvailabilityConfig>(DEFAULT_AVAILABILITY);
    const [availDirty, setAvailDirty] = useState(false);
    const availDirtyRef = useRef(false);
    const [availSaving, setAvailSaving] = useState(false);
    const [emails, setEmails] = useState<Email[]>([]);
    const [selectedEmail, setSelectedEmail] = useState<Email | null>(null);
    const [replyTo, setReplyTo] = useState<Email | null>(null);
    const [openOptionsId, setOpenOptionsId] = useState<string | null>(null);
    const [menuPos, setMenuPos] = useState({ top: 0, right: 0 });

    // Animation state
    const [isTransitioning, setIsTransitioning] = useState(false);
    const directionRef = useRef(0);
    const hasAnimatedRef = useRef<'bookings' | 'mails' | 'hours' | null>(null);

    // Firestore Integration
    useEffect(() => {
        const unsubscribe = onSnapshot(doc(db, 'Settings', 'Canary'), (snapshot) => {
            if (snapshot.exists()) {
                const data = snapshot.data();
                const meetingsMap = (data.Meetings || {}) as Record<string, MeetingData>;
                const meetingsList: Meeting[] = Object.entries(meetingsMap)
                    .map(([id, m]): Meeting | null => {
                        // Guard untrusted Firestore data: a meeting written without a valid
                        // DD/MM/YYYY Date string would throw on .split and blank the whole list.
                        const parts = (m.Date || '').split('/').map(Number);
                        if (parts.length !== 3 || parts.some(Number.isNaN)) return null;
                        const [d, mon, y] = parts;
                        return {
                            id,
                            title: m.Name || 'Untitled Session',
                            time: m.Time,
                            date: new Date(y, mon - 1, d),
                            email: m.Email,
                            link: m.MeetingLink,
                            reason: m["What For"],
                            userTimezone: m.UserTimezone || -(new Date().getTimezoneOffset() / 60),
                            googleEventId: m.GoogleEventId
                        };
                    })
                    .filter((m): m is Meeting => m !== null);
                setMeetings(meetingsList);

                const emailsMap = (data.Emails || {}) as Record<string, EmailData>;
                const emailsList: Email[] = Object.entries(emailsMap).map(([id, e]) => ({
                    id,
                    name: e.Name,
                    email: e.Email,
                    message: e.Message,
                    number: e.Number,
                    whatsapp: e.Whatsapp,
                    timestamp: e.Timestamp,
                    attachments: e["Files Attached"] || [],
                    repliedAt: e.RepliedAt
                })).sort((a, b) => b.timestamp - a.timestamp);
                setEmails(emailsList);
            }
        }, (err) => {
            console.warn("[Connection] Canary sync error:", err);
            if (!navigator.onLine) console.warn("User is offline");
        });
        return () => unsubscribe();
    }, []);

    useEffect(() => {
        const handleResize = () => setWindowWidth(window.innerWidth);
        window.addEventListener('resize', handleResize);
        return () => window.removeEventListener('resize', handleResize);
    }, []);

    useEffect(() => {
        const checkTheme = () => setIsDark(document.documentElement.classList.contains('dark'));
        checkTheme();
        const observer = new MutationObserver(checkTheme);
        observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
        return () => observer.disconnect();
    }, []);

    // Track the host's timezone so reschedules reconstruct the correct UTC instant.
    useEffect(() => {
        const unsub = onSnapshot(doc(db, 'Settings', 'Availability'), (snap) => {
            const data = snap.exists() ? snap.data() : undefined;
            const ct = data ? data['Current Time'] : undefined;
            if (ct) setHostTimezoneString(ct);
            // Load the working-days/hours config, but don't clobber unsaved edits.
            if (!availDirtyRef.current) setAvailDraft(parseAvailabilityConfig(data));
        });
        return () => unsub();
    }, []);

    // Meeting Time fields are stored in the HOST's wall clock, so the UTC instant is
    // (host wall clock − host offset). Falls back to the dashboard machine's own
    // offset if Availability hasn't loaded yet.
    const hostOffset = hostTimezoneString
        ? getOffsetFromUTCString(hostTimezoneString)
        : -(new Date().getTimezoneOffset() / 60);

    const handleTabChange = (newTab: 'bookings' | 'mails' | 'hours') => {
        if (newTab === activeSection || isTransitioning) return;

        hasAnimatedRef.current = null;
        const indices = { bookings: 0, mails: 1, hours: 2 };
        const direction = indices[newTab] > indices[activeSection] ? 1 : -1;
        directionRef.current = direction;
        setIsTransitioning(true);

        anime({
            targets: '.canary-section',
            translateX: [0, -direction * 30],
            opacity: [1, 0],
            duration: 150,
            easing: 'easeInQuad',
            complete: () => {
                setActiveSection(newTab);
            }
        });
    };

    useEffect(() => {
        const runAnimation = () => {
            const targets = document.querySelectorAll('.canary-section');
            if (targets.length === 0) return;
            if (hasAnimatedRef.current === activeSection) return;

            hasAnimatedRef.current = activeSection;

            const timeline = anime.timeline({
                easing: 'easeOutExpo',
                complete: () => {
                    setIsTransitioning(false);
                }
            });

            timeline.add({
                targets: '.canary-section',
                opacity: [0, 1],
                translateX: [directionRef.current * 50, 0],
                duration: 300
            }, 0);

            timeline.add({
                targets: '.canary-panel',
                opacity: [0, 1],
                translateY: [20, 0],
                scale: [0.99, 1],
                delay: anime.stagger(30, { start: 20 }),
                duration: 450
            }, 0);
        };

        const tid = setTimeout(runAnimation, 30);
        return () => clearTimeout(tid);
    }, [activeSection]);

    const calendarDays = useMemo(() => {
        const year = viewDate.getFullYear();
        const month = viewDate.getMonth();
        const firstDayOfMonth = new Date(year, month, 1).getDay();
        const daysInMonth = new Date(year, month + 1, 0).getDate();
        const days = [];
        for (let i = 0; i < firstDayOfMonth; i++) { days.push(null); }
        for (let i = 1; i <= daysInMonth; i++) { days.push(new Date(year, month, i)); }
        while (days.length < 42) { days.push(null); }
        return days;
    }, [viewDate]);

    const changeMonth = (delta: number) => {
        setDirection(delta);
        setViewDate(new Date(viewDate.getFullYear(), viewDate.getMonth() + delta, 1));
    };

    const changeModalMonth = (delta: number) => {
        setModalDirection(delta);
        setModalViewDate(new Date(modalViewDate.getFullYear(), modalViewDate.getMonth() + delta, 1));
    };

    const selectedDayMeetings = useMemo(() => {
        return meetings.filter(m => m.date.toDateString() === selectedDate.toDateString());
    }, [meetings, selectedDate]);

    const handleReschedule = (meeting: Meeting) => {
        setEditingMeeting({ ...meeting, date: new Date(meeting.date) });
        setModalViewDate(new Date(meeting.date.getFullYear(), meeting.date.getMonth(), 1));
    };

    const handleDelete = async (id: string, meeting?: Meeting) => {
        setIsLoading(true);
        try {
            // 1. Sync with Google Calendar FIRST (before deleting from DB)
            if (meeting?.email && meeting?.date && meeting?.time) {
                // Calculate time for legacy search (Crucial for fallback deletion).
                // meeting.time is host wall clock → UTC = wall clock − host offset.
                // (Previously used the guest offset, which made the fallback search
                // target the wrong instant and could miss the event to cancel.)
                const timeParts = meeting.time.split(' ');
                const [hStr, mStr] = timeParts[0].split(':');
                let h = parseInt(hStr);
                if (timeParts[1] === 'PM' && h !== 12) h += 12;
                if (timeParts[1] === 'AM' && h === 12) h = 0;

                // Construct the UTC date object
                const start = new Date(Date.UTC(meeting.date.getFullYear(), meeting.date.getMonth(), meeting.date.getDate(), h, parseInt(mStr)) - (hostOffset * 3600000));

                try {
                    const syncMeeting = httpsCallable(functions, 'syncMeeting');

                    // Call backend to cancel event
                    await syncMeeting({
                        action: 'cancel',
                        eventId: meeting.googleEventId, // Priority 1: Try ID
                        email: meeting.email,           // Priority 2: Search by Email
                        name: meeting.title,            // Priority 3: Search by Client Name (Title)
                        startTime: start.toISOString()  // Used to find the specific Day
                    });


                } catch (syncErr) {
                    console.error("Google Sync Delete Error:", syncErr);
                    showAlert({ type: 'warning', message: 'Deleted from app, but calendar sync failed.' });
                }
            }

            // 2. Delete from Firestore
            const docRef = doc(db, 'Settings', 'Canary');
            await updateDoc(docRef, {
                [`Meetings.${id}`]: deleteField()
            });

            showAlert({ type: 'success', message: 'Session cancelled successfully' });
        } catch (error) {
            console.error(error);
            showAlert({ type: 'error', message: 'Failed to cancel session' });
        } finally {
            setIsLoading(false);
        }
    };

    const handleSaveMeeting = async () => {
        if (!editingMeeting) return;

        const originalMeeting = meetings.find(m => m.id === editingMeeting.id);
        if (!originalMeeting) return;

        const isTimeChanged = editingMeeting.time !== originalMeeting.time;
        const isDateChanged = editingMeeting.date.toDateString() !== originalMeeting.date.toDateString();
        const isTitleChanged = editingMeeting.title !== originalMeeting.title;

        if (!isTimeChanged && !isDateChanged && !isTitleChanged) {
            setEditingMeeting(null);
            return;
        }

        if (isTimeChanged || isDateChanged) {
            const isOccupied = meetings.some(m =>
                m.id !== editingMeeting.id &&
                m.date.toDateString() === editingMeeting.date.toDateString() &&
                m.time === editingMeeting.time
            );

            if (isOccupied) {
                showAlert({ type: 'warning', message: 'This time slot is already occupied.' });
                return;
            }
        }

        setIsLoading(true);
        try {
            // editingMeeting.time is in the HOST's wall clock, so the UTC instant is
            // (host wall clock − host offset). Using the guest's offset here was the
            // reschedule bug: it shifted invites by (hostOffset − guestOffset) hours.
            const timeParts = editingMeeting.time.split(' ');
            const [hStr, mStr] = timeParts[0].split(':');
            let h = parseInt(hStr);
            if (timeParts[1] === 'PM' && h !== 12) h += 12;
            if (timeParts[1] === 'AM' && h === 12) h = 0;

            const start = new Date(Date.UTC(editingMeeting.date.getFullYear(), editingMeeting.date.getMonth(), editingMeeting.date.getDate(), h, parseInt(mStr)) - (hostOffset * 3600000));
            const end = new Date(start.getTime() + 3600000);

            let newGoogleId = editingMeeting.googleEventId; // --- GOOGLE CALENDAR SYNC ---
            if (editingMeeting.email) {
                const syncMeeting = httpsCallable(functions, 'syncMeeting');
                if (editingMeeting.googleEventId) {
                    await syncMeeting({
                        action: 'update',
                        eventId: editingMeeting.googleEventId,
                        name: editingMeeting.title,
                        email: editingMeeting.email,
                        reason: editingMeeting.reason || '',
                        startTime: start.toISOString(),
                        endTime: end.toISOString()
                    });
                } else {
                    const oldTimeParts = originalMeeting.time.split(' ');
                    const [oldHStr, oldMStr] = oldTimeParts[0].split(':');
                    let oldH = parseInt(oldHStr);
                    if (oldTimeParts[1] === 'PM' && oldH !== 12) oldH += 12;
                    if (oldTimeParts[1] === 'AM' && oldH === 12) oldH = 0;

                    const oldStart = new Date(Date.UTC(originalMeeting.date.getFullYear(), originalMeeting.date.getMonth(), originalMeeting.date.getDate(), oldH, parseInt(oldMStr)) - (hostOffset * 3600000));

                    await syncMeeting({
                        action: 'cancel',
                        email: originalMeeting.email,
                        startTime: oldStart.toISOString()
                    });

                    const response = await syncMeeting({
                        action: 'create',
                        name: editingMeeting.title,
                        email: editingMeeting.email,
                        reason: editingMeeting.reason || '',
                        startTime: start.toISOString(),
                        endTime: end.toISOString()
                    });

                    const resData = response.data as { status?: string; id?: string };
                    if (resData.status === 'success' && resData.id) {
                        newGoogleId = resData.id;
                    }
                }
            }

            const docRef = doc(db, 'Settings', 'Canary');
            const day = editingMeeting.date.getDate().toString().padStart(2, '0');
            const mon = (editingMeeting.date.getMonth() + 1).toString().padStart(2, '0');
            const y = editingMeeting.date.getFullYear();
            const dateStr = `${day}/${mon}/${y}`;

            const updatePayload: Record<string, string> = {
                [`Meetings.${editingMeeting.id}.Date`]: dateStr,
                [`Meetings.${editingMeeting.id}.Time`]: editingMeeting.time,
                [`Meetings.${editingMeeting.id}.Name`]: editingMeeting.title
            };

            if (newGoogleId) {
                updatePayload[`Meetings.${editingMeeting.id}.GoogleEventId`] = newGoogleId;
            }

            await updateDoc(docRef, updatePayload);

            setEditingMeeting(null);
            showAlert({ type: 'success', message: 'Session rescheduled successfully' });
        } catch (error) {
            console.error(error);
            showAlert({ type: 'error', message: 'Failed to update session' });
        } finally {
            setIsLoading(false);
        }
    };

    const handleDeleteEmail = async (emailId: string) => {
        setConfirmDelete(null);
        setOpenOptionsId(null);
        try {
            await updateDoc(doc(db, 'Settings', 'Canary'), {
                [`Emails.${emailId}`]: deleteField()
            });
            if (selectedEmail?.id === emailId) {
                setSelectedEmail(null);
            }
            showAlert({ type: 'success', message: 'Email deleted successfully' });
        } catch (error) {
            console.error("Error deleting email:", error);
            showAlert({ type: 'error', message: 'Failed to delete email' });
        }
    };

    const handleReplyEmail = (email: Email) => {
        setReplyTo(email);
        setOpenOptionsId(null);
    };

    // Mark a message replied after a reply is sent (Canary is admin-writable here).
    const markReplied = async (emailId: string) => {
        const at = Date.now();
        try {
            await updateDoc(doc(db, 'Settings', 'Canary'), { [`Emails.${emailId}.RepliedAt`]: at });
        } catch (error) {
            console.error('Failed to mark message replied:', error);
        }
        setEmails(prev => prev.map(e => e.id === emailId ? { ...e, repliedAt: at } : e));
        setSelectedEmail(prev => prev && prev.id === emailId ? { ...prev, repliedAt: at } : prev);
    };

    const handleAddNew = () => {
        setIsBookingOpen(true);
    };

    const modalCalendarDays = useMemo(() => {
        const year = modalViewDate.getFullYear();
        const month = modalViewDate.getMonth();
        const firstDayOfMonth = new Date(year, month, 1).getDay();
        const daysInMonth = new Date(year, month + 1, 0).getDate();
        const days = [];
        for (let i = 0; i < firstDayOfMonth; i++) { days.push(null); }
        for (let i = 1; i <= daysInMonth; i++) { days.push(new Date(year, month, i)); }
        while (days.length < 42) { days.push(null); }
        return days;
    }, [modalViewDate]);

    const variants = {
        enter: (d: number) => ({ x: d > 0 ? '50%' : '-50%', opacity: 0 }),
        center: { x: 0, opacity: 1 },
        exit: (d: number) => ({ x: d > 0 ? '-50%' : '50%', opacity: 0 })
    };

    const containerBg = isDark ? '#00000040' : '#ffffff59';

    const renderAttachmentCard = (file: Attachment) => {
        const isImage = /\.(jpg|jpeg|png|gif|webp)$/i.test(file.name);
        const isVideo = /\.(mp4|webm|ogg)$/i.test(file.name);

        return (
            <button
                key={file.url}
                onClick={() => setPreviewAttachment(file)}
                className="group relative flex items-center gap-3 px-3 py-3 rounded-xl border transition-all hover:scale-[1.02] active:scale-[0.98] text-left overflow-hidden min-w-[200px]"
                style={{
                    backgroundColor: isDark ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.03)',
                    borderColor: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)'
                }}
            >
                <div className="w-8 h-8 rounded-lg bg-blue-500/10 flex items-center justify-center shrink-0 text-blue-500">
                    {isImage ? <ImageIcon size={16} /> : isVideo ? <Video size={16} /> : <FileText size={16} />}
                </div>

                <div className="flex flex-col gap-0.5 overflow-hidden flex-1">
                    <span className="text-xs font-bold truncate w-full" style={{ color: isDark ? '#fff' : '#000' }}>{file.name}</span>
                    <span className="text-[10px] opacity-40 uppercase tracking-wider font-bold">
                        {isImage ? 'Image' : isVideo ? 'Video' : 'Document'}
                    </span>
                </div>

                <div className="opacity-0 group-hover:opacity-100 transition-opacity">
                    <ExternalLink size={14} className="opacity-40" />
                </div>
            </button>
        );
    };

    // ── Working-hours editor (Hours tab) ──────────────────────────────
    const patchAvail = (patch: Partial<AvailabilityConfig>) => {
        availDirtyRef.current = true;
        setAvailDirty(true);
        setAvailDraft(prev => ({ ...prev, ...patch }));
    };
    const toggleWorkDay = (d: number) => {
        const has = availDraft.workingDays.includes(d);
        patchAvail({
            workingDays: has
                ? availDraft.workingDays.filter(x => x !== d)
                : [...availDraft.workingDays, d].sort((a, b) => a - b),
        });
    };
    const toggleHour = (h: number) => {
        const has = availDraft.hours.includes(h);
        patchAvail({
            hours: has
                ? availDraft.hours.filter(x => x !== h)
                : [...availDraft.hours, h].sort((a, b) => a - b),
        });
    };
    const saveAvailability = async () => {
        setAvailSaving(true);
        try {
            await setDoc(doc(db, 'Settings', 'Availability'), {
                workingDays: availDraft.workingDays,
                hours: availDraft.hours,
            }, { merge: true });
            availDirtyRef.current = false;
            setAvailDirty(false);
            showAlert({ type: 'success', message: 'Working hours saved' });
        } catch {
            showAlert({ type: 'error', message: 'Failed to save - are you signed in as admin?' });
        } finally {
            setAvailSaving(false);
        }
    };
    const previewSlots = buildHostSlots(availDraft);

    const hoursEditor = (
        <div className="canary-section w-full">
            <div
                className="canary-panel w-full max-w-2xl flex flex-col gap-7 p-6 min-[460px]:p-8 rounded-[24px] min-[460px]:rounded-[32px] border shadow-sm"
                style={{ backgroundColor: containerBg, borderColor: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.05)' }}
            >
                <div className="flex items-start gap-4">
                    <span className="grid place-items-center shrink-0 rounded-2xl" style={{ width: 48, height: 48, background: 'rgba(59,130,246,0.12)', color: '#3b82f6' }}>
                        <Clock size={24} />
                    </span>
                    <div>
                        <h3 className="text-lg sm:text-xl font-bold m-0" style={{ color: isDark ? '#fff' : '#000' }}>Working hours &amp; days</h3>
                        <p className="text-sm mt-1 max-w-xl" style={{ color: 'var(--text-muted)' }}>
                            Pick exactly which days and hours guests can book - toggle any hour on or off individually, gaps in the middle included. These drive the public booking calendar; off-days and unpicked hours are hidden from guests.
                        </p>
                    </div>
                </div>

                {/* Working days */}
                <div className="flex flex-col gap-3">
                    <label className="text-sm font-bold" style={{ color: isDark ? '#fff' : '#000' }}>Working days</label>
                    <div className="flex flex-wrap gap-2">
                        {WEEKDAY_LABELS.map((label, d) => {
                            const on = availDraft.workingDays.includes(d);
                            return (
                                <button
                                    key={label}
                                    type="button"
                                    onClick={() => toggleWorkDay(d)}
                                    aria-pressed={on}
                                    className="px-4 py-2 rounded-xl text-sm font-bold border transition-colors cursor-pointer"
                                    style={on
                                        ? { background: '#3b82f6', color: '#fff', borderColor: '#3b82f6' }
                                        : { background: 'transparent', color: 'var(--text-muted)', borderColor: isDark ? 'rgba(255,255,255,0.15)' : 'rgba(0,0,0,0.12)' }}
                                >
                                    {label}
                                </button>
                            );
                        })}
                    </div>
                    {availDraft.workingDays.length === 0 && (
                        <p className="text-sm" style={{ color: '#ef4444' }}>No working days selected - guests won&apos;t be able to book any day.</p>
                    )}
                </div>

                {/* Working hours (individually toggleable) */}
                <div className="flex flex-col gap-3">
                    <div className="flex items-center justify-between gap-3">
                        <label className="text-sm font-bold" style={{ color: isDark ? '#fff' : '#000' }}>Working hours</label>
                        <span className="text-xs" style={{ color: 'var(--text-muted)' }}>{availDraft.hours.length} selected</span>
                    </div>
                    <div className="grid grid-cols-3 min-[460px]:grid-cols-4 sm:grid-cols-6 gap-2">
                        {ALL_HOURS.map(h => {
                            const on = availDraft.hours.includes(h);
                            return (
                                <button
                                    key={h}
                                    type="button"
                                    onClick={() => toggleHour(h)}
                                    aria-pressed={on}
                                    className="px-2 py-2 rounded-xl text-xs font-bold border transition-colors cursor-pointer text-center"
                                    style={on
                                        ? { background: '#3b82f6', color: '#fff', borderColor: '#3b82f6' }
                                        : { background: 'transparent', color: 'var(--text-muted)', borderColor: isDark ? 'rgba(255,255,255,0.15)' : 'rgba(0,0,0,0.12)' }}
                                >
                                    {formatHourSlot(h)}
                                </button>
                            );
                        })}
                    </div>
                    {availDraft.hours.length === 0 && (
                        <p className="text-sm" style={{ color: '#ef4444' }}>No hours selected - guests won&apos;t be able to book any time.</p>
                    )}
                </div>

                {/* Preview */}
                {previewSlots.length > 0 && (
                    <div className="flex flex-col gap-2">
                        <label className="text-sm font-bold" style={{ color: isDark ? '#fff' : '#000' }}>What guests will see</label>
                        <div className="flex flex-wrap gap-2">
                            {previewSlots.map(s => (
                                <span key={s} className="px-3 py-1.5 rounded-lg text-xs font-semibold" style={{ background: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.05)', color: 'var(--text-muted)' }}>{s}</span>
                            ))}
                        </div>
                    </div>
                )}

                {/* Save */}
                <div className="flex justify-end">
                    <button
                        type="button"
                        onClick={saveAvailability}
                        disabled={!availDirty || availSaving}
                        className="inline-flex items-center gap-2 px-6 py-2.5 rounded-xl text-sm font-bold cursor-pointer transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                        style={{ background: '#3b82f6', color: '#fff' }}
                    >
                        <Check size={16} />
                        {availSaving ? 'Saving…' : 'Save hours'}
                    </button>
                </div>
            </div>
        </div>
    );

    return (
        <div className="w-full h-full flex flex-col gap-6" style={{ opacity: 1 }}>
            <Loader isOpen={isLoading} isFullScreen={true} />
            {/* Header Navbar */}
            <div className="glass-surface p-1.5 rounded-xl flex gap-2 overflow-x-auto shrink-0 w-fit self-center min-[960px]:self-start">
                <button
                    onClick={() => handleTabChange('bookings')}
                    className={`
                        flex items-center gap-2 px-5 py-2.5 rounded-lg border-none cursor-pointer font-sans font-bold text-sm whitespace-nowrap transition-all
                        ${activeSection === 'bookings' ? 'bg-blue-500/15 text-blue-500' : 'bg-transparent text-gray-500 hover:bg-blue-500/10 hover:text-blue-500 dark:text-gray-400 dark:hover:text-blue-400'}
                    `}
                >
                    <CalendarIcon size={16} />
                    <span className="hidden sm:inline">Bookings</span>
                </button>
                <button
                    onClick={() => handleTabChange('mails')}
                    className={`
                        flex items-center gap-2 px-5 py-2.5 rounded-lg border-none cursor-pointer font-sans font-bold text-sm whitespace-nowrap transition-all
                        ${activeSection === 'mails' ? 'bg-blue-500/15 text-blue-500' : 'bg-transparent text-gray-500 hover:bg-blue-500/10 hover:text-blue-500 dark:text-gray-400 dark:hover:text-blue-400'}
                    `}
                >
                    <Mail size={16} />
                    <span className="hidden sm:inline">Mails</span>
                    {emails.length > 0 && (
                        <span className={`px-1.5 py-0.5 rounded-md text-[10px] font-black ${activeSection === 'mails' ? 'bg-blue-500 text-white' : 'bg-gray-200 text-gray-600 dark:bg-white/20 dark:text-white'}`}>
                            {emails.length}
                        </span>
                    )}
                </button>
                <button
                    onClick={() => handleTabChange('hours')}
                    className={`
                        flex items-center gap-2 px-5 py-2.5 rounded-lg border-none cursor-pointer font-sans font-bold text-sm whitespace-nowrap transition-all
                        ${activeSection === 'hours' ? 'bg-blue-500/15 text-blue-500' : 'bg-transparent text-gray-500 hover:bg-blue-500/10 hover:text-blue-500 dark:text-gray-400 dark:hover:text-blue-400'}
                    `}
                >
                    <Clock size={16} />
                    <span className="hidden sm:inline">Hours</span>
                </button>
            </div>

            {activeSection === 'hours' ? hoursEditor : activeSection === 'bookings' ? (
                <div className="canary-section grid grid-cols-1 lg:grid-cols-canary gap-8 items-start lg:items-stretch">
                    {/* Left: Calendar Component */}
                    <div className="canary-panel w-full h-fit flex flex-col gap-4 min-[460px]:gap-6 p-4 min-[460px]:p-8 rounded-[24px] min-[460px]:rounded-[32px] border shadow-sm relative overflow-visible"
                        style={{
                            backgroundColor: containerBg,
                            borderColor: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.05)',
                            backdropFilter: 'blur(20px)'
                        }}>
                        <div className="absolute top-0 right-0 w-64 h-64 bg-blue-500/5 blur-[100px] rounded-full" />

                        {/* Integrated Navigation Inside Box */}
                        <div className="flex items-center justify-between relative z-10 mb-4">
                            <div className="flex flex-col">
                                <div className="flex items-center gap-4">
                                    <h3 className="text-2xl font-bold m-0" style={{ color: isDark ? '#fff' : '#000' }}>
                                        {MONTHS[viewDate.getMonth()]} {viewDate.getFullYear()}
                                    </h3>

                                </div>
                            </div>

                            <div className="flex items-center gap-2">
                                <button onClick={() => changeMonth(-1)} className="w-8 h-8 flex items-center justify-center hover:bg-black/5 dark:hover:bg-white/5 rounded-lg transition-all border border-transparent hover:border-white/5" style={{ color: isDark ? 'rgba(255,255,255,0.4)' : 'rgba(0,0,0,0.4)' }}>
                                    <ChevronLeft size={16} />
                                </button>
                                <button onClick={() => changeMonth(1)} className="w-8 h-8 flex items-center justify-center hover:bg-black/5 dark:hover:bg-white/5 rounded-lg transition-all border border-transparent hover:border-white/5" style={{ color: isDark ? 'rgba(255,255,255,0.4)' : 'rgba(0,0,0,0.4)' }}>
                                    <ChevronRight size={16} />
                                </button>
                            </div>
                        </div>

                        {/* Day Headers */}
                        <div className="grid grid-cols-7 gap-1 md:gap-2">
                            {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((day, idx) => (
                                <div key={idx} className="text-center text-[10px] md:text-[11px] font-bold tracking-widest opacity-40" style={{ color: isDark ? '#fff' : '#000' }}>
                                    {day}
                                </div>
                            ))}
                        </div>

                        {/* Calendar Grid */}
                        <div className="relative mt-4">
                            <AnimatePresence mode="popLayout" initial={false} custom={direction}>
                                <motion.div
                                    key={viewDate.toISOString()}
                                    custom={direction}
                                    variants={variants}
                                    initial="enter"
                                    animate="center"
                                    exit="exit"
                                    transition={{ type: "spring", stiffness: 300, damping: 30 }}
                                    className="grid grid-cols-7 gap-1 md:gap-3 w-full"
                                >
                                    {calendarDays.map((date, idx) => {
                                        const isSelected = date?.toDateString() === selectedDate.toDateString();
                                        const isToday = date?.toDateString() === new Date().toDateString();
                                        const dayMeetings = date ? meetings.filter(m => m.date.toDateString() === date.toDateString()) : [];

                                        return (
                                            <div
                                                key={idx}
                                                onClick={() => date && setSelectedDate(date)}
                                                className={`relative aspect-square rounded-xl md:rounded-2xl transition-all duration-200 cursor-pointer flex flex-col items-center justify-center gap-0.5 md:gap-1
                                                ${date ? 'hover:scale-[1.02] active:scale-95' : 'opacity-0 pointer-events-none'}
                                                ${!isSelected ? 'hover:bg-black/5 dark:hover:bg-white/5' : ''}
                                            `}
                                            >
                                                {isSelected && date && (
                                                    <motion.div
                                                        layoutId="main-selected-day-bg"
                                                        initial={false}
                                                        transition={{ type: "spring", stiffness: 500, damping: 40, mass: 1 }}
                                                        style={{
                                                            position: 'absolute', inset: 0,
                                                            borderRadius: 12,
                                                            backgroundColor: 'rgb(59, 130, 246)',
                                                            boxShadow: '0 4px 12px -2px rgba(59, 130, 246, 0.5)',
                                                            zIndex: 0
                                                        }}
                                                    />
                                                )}
                                                {date && (
                                                    <>
                                                        <span className={`text-sm md:text-lg font-bold relative z-10 ${isSelected ? 'text-white' : isToday ? 'text-blue-500' : ''}`} style={{ color: !isSelected && !isToday ? (isDark ? '#fff' : '#000') : undefined }}>
                                                            {date.getDate()}
                                                        </span>

                                                        <div className="flex gap-0.5 md:gap-1 justify-center relative z-10">
                                                            {dayMeetings.slice(0, windowWidth < 420 ? 1 : 3).map((m) => (
                                                                <div
                                                                    key={m.id}
                                                                    className="w-1 h-1 rounded-full"
                                                                    style={{ backgroundColor: isSelected ? 'rgba(255,255,255,0.5)' : 'rgb(59, 130, 246)' }}
                                                                />
                                                            ))}
                                                        </div>
                                                    </>
                                                )}
                                            </div>
                                        );
                                    })}
                                </motion.div>
                            </AnimatePresence>
                        </div>
                    </div>

                    {/* Meeting List - Right Panel */}
                    <div className="canary-panel flex flex-col gap-4 min-[460px]:gap-6 p-4 min-[460px]:p-8 rounded-[24px] min-[460px]:rounded-[32px] border shadow-sm lg:h-full h-fit"
                        style={{
                            backgroundColor: containerBg,
                            borderColor: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.05)',
                            backdropFilter: 'blur(20px)'
                        }}>
                        <div className="flex flex-col gap-2">

                            <h3 className="text-2xl font-bold m-0" style={{ color: isDark ? '#fff' : '#000' }}>
                                {selectedDate.toLocaleDateString('default', { weekday: 'long', day: 'numeric', month: 'short' })}
                            </h3>
                        </div>

                        <div className="flex-1 overflow-y-auto flex flex-col gap-3 pr-2" style={{
                            scrollbarWidth: 'thin',
                            scrollbarColor: isDark ? 'rgba(255,255,255,0.2) transparent' : 'rgba(0,0,0,0.1) transparent'
                        }}>
                            {selectedDayMeetings.length > 0 ? (
                                selectedDayMeetings.map((meeting) => (
                                    <div
                                        key={meeting.id}
                                        role="button"
                                        tabIndex={0}
                                        onClick={() => setViewingMeeting(meeting)}
                                        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setViewingMeeting(meeting); } }}
                                        className="group p-4 rounded-2xl border transition-all hover:translate-x-1 cursor-pointer"
                                        style={{
                                            borderColor: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.05)',
                                            backgroundColor: isDark ? 'rgba(0,0,0,0.2)' : 'rgba(255,255,255,0.4)'
                                        }}
                                    >
                                        <div className="flex items-start justify-between gap-3">
                                            <div className="flex flex-col gap-1.5 min-w-0 flex-1">
                                                <h4 className="text-sm font-bold m-0 truncate" style={{ color: isDark ? '#fff' : '#000' }}>{meeting.title}</h4>
                                                {meeting.email && (
                                                    <div className="flex items-center gap-1.5 min-w-0" style={{ color: isDark ? 'rgba(255,255,255,0.55)' : 'rgba(0,0,0,0.55)' }}>
                                                        <Mail size={11} className="opacity-60 shrink-0" />
                                                        <span className="text-[11px] truncate">{meeting.email}</span>
                                                    </div>
                                                )}
                                                <div className="flex items-center gap-2 text-[11px] font-medium flex-wrap" style={{ color: isDark ? 'rgba(255,255,255,0.5)' : 'rgba(0,0,0,0.5)' }}>
                                                    <div className="flex items-center gap-1.5 p-1 rounded-md bg-black/5 dark:bg-white/5">
                                                        <Clock size={12} className="opacity-70" />
                                                        <span>{meeting.time}</span>
                                                    </div>
                                                    {meeting.link && (
                                                        <div className="flex items-center gap-1.5 p-1 rounded-md text-blue-500 bg-blue-500/10">
                                                            <Video size={12} />
                                                            <span className="font-semibold">Meet link</span>
                                                        </div>
                                                    )}
                                                </div>
                                                <span className="text-[11px] opacity-40 italic font-normal line-clamp-1">{meeting.reason || 'No description'}</span>
                                            </div>
                                            <div className="flex items-center gap-1 shrink-0" onClick={(e) => e.stopPropagation()}>
                                                <button
                                                    onClick={() => setConfirmDelete(meeting.id)}
                                                    className="p-2 hover:bg-red-500/10 rounded-lg transition-all group/del"
                                                    aria-label="Delete session"
                                                >
                                                    <Trash2 size={14} className="text-red-500/60 group-hover/del:text-red-500" />
                                                </button>
                                                <ChevronRight size={16} className="opacity-30 group-hover:opacity-70 group-hover:translate-x-0.5 transition-all" style={{ color: isDark ? 'rgba(255,255,255,0.5)' : 'rgba(0,0,0,0.5)' }} />
                                            </div>
                                        </div>
                                    </div>
                                ))
                            ) : (
                                <div className="flex-1 flex flex-col items-center justify-center opacity-30 gap-3">
                                    <CalendarIcon size={28} />
                                    <span className="text-[10px] md:text-xs font-bold uppercase tracking-widest">No Sessions</span>
                                </div>
                            )}
                        </div>

                        <button
                            onClick={handleAddNew}
                            className="w-full py-3 md:py-4 rounded-xl font-bold text-white text-xs md:text-sm flex items-center justify-center gap-2 shadow-lg transition-all hover:scale-[1.02] active:scale-[0.98]"
                            style={{ background: 'linear-gradient(135deg, #1A1A1A 0%, #333333 100%)', boxShadow: '0 8px 30px rgba(0,0,0,0.2)' }}
                        >
                            <Plus size={16} />
                            CREATE NEW SESSION
                        </button>
                    </div>
                </div>
            ) : (
                /* Mails Section */
                <div className="canary-section grid grid-cols-1 lg:grid-cols-mail gap-6 md:gap-8 h-full min-h-[600px] max-h-[900px]">
                    {/* Left: Mails List */}
                    <div className="canary-panel flex flex-col gap-4 p-6 md:p-8 rounded-[24px] md:rounded-[32px] border shadow-sm h-full overflow-hidden"
                        style={{
                            backgroundColor: containerBg,
                            borderColor: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.05)',
                            backdropFilter: 'blur(20px)'
                        }}>
                        <div className="flex flex-col gap-2">

                            <h3 className="text-2xl font-bold m-0" style={{ color: isDark ? '#fff' : '#000' }}>Inbox</h3>
                        </div>

                        <div className="flex-1 overflow-y-auto flex flex-col gap-3 pr-1 mr-1 custom-scrollbar">
                            {emails.length > 0 ? (
                                emails.map((email) => (
                                    <div
                                        key={email.id}
                                        onClick={() => setSelectedEmail(email)}
                                        className={`group relative p-3 md:p-4 rounded-xl md:rounded-2xl border transition-all cursor-pointer ${selectedEmail?.id === email.id ? 'shadow-md' : 'hover:translate-x-1 hover:border-gray-300 dark:hover:border-white/20'}`}
                                        style={{
                                            borderColor: selectedEmail?.id === email.id ? 'rgb(59, 130, 246)' : (isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)'),
                                            backgroundColor: selectedEmail?.id === email.id ? (isDark ? 'rgba(59, 130, 246, 0.2)' : 'rgba(59, 130, 246, 0.1)') : (isDark ? 'rgba(0,0,0,0.2)' : 'rgba(255,255,255,0.4)')
                                        }}
                                    >
                                        <div className="flex items-start justify-between gap-3">
                                            <div className="flex flex-col gap-1 overflow-hidden flex-1 min-w-0">
                                                <h4 className="text-sm font-bold m-0 truncate" style={{ color: isDark ? '#fff' : '#000' }}>{email.name}</h4>
                                                <div className="flex items-center gap-1.5 min-w-0">
                                                    <Mail size={11} className="opacity-50 shrink-0" />
                                                    <span className="text-[11px] opacity-70 truncate select-all">{email.email}</span>
                                                </div>
                                                {email.number && (
                                                    <div className="flex items-center gap-1.5 min-w-0">
                                                        <Phone size={11} className="opacity-50 shrink-0" />
                                                        <span className="text-[11px] opacity-70 truncate select-all">{email.number}</span>
                                                        {email.whatsapp && (
                                                            <span className="text-[9px] font-bold text-green-500 bg-green-500/10 px-1.5 py-0.5 rounded-full shrink-0">WhatsApp</span>
                                                        )}
                                                    </div>
                                                )}
                                                <p className="m-0 text-[11px] opacity-60 line-clamp-1 mt-0.5">{email.message}</p>
                                                <div className="flex items-center gap-2 mt-1">
                                                    <span className="text-[9px] font-bold opacity-40">{new Date(email.timestamp).toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' })}</span>
                                                    {email.attachments.length > 0 && (
                                                        <div className="flex items-center gap-1 text-[9px] font-bold text-blue-500">
                                                            <Paperclip size={10} />
                                                            <span>{email.attachments.length}</span>
                                                        </div>
                                                    )}
                                                </div>
                                            </div>

                                            {/* Options Menu Button */}
                                            <div className="shrink-0" onClick={(e) => e.stopPropagation()}>
                                                <button
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        const rect = e.currentTarget.getBoundingClientRect();
                                                        setMenuPos({
                                                            top: rect.bottom + 4,
                                                            right: window.innerWidth - rect.right
                                                        });
                                                        setOpenOptionsId(openOptionsId === email.id ? null : email.id);
                                                    }}
                                                    className={`p-1.5 rounded-lg border-none bg-transparent cursor-pointer transition-all ${openOptionsId === email.id ? 'text-blue-500 bg-blue-500/10' : 'opacity-0 group-hover:opacity-100 hover:bg-black/5 dark:hover:bg-white/5'}`}
                                                >
                                                    <MoreVertical size={16} />
                                                </button>
                                            </div>
                                        </div>
                                    </div>
                                ))
                            ) : (
                                <div className="flex-1 flex flex-col items-center justify-center opacity-30 gap-3">
                                    <Mail size={28} />
                                    <span className="text-[10px] font-bold uppercase tracking-widest">No Messages</span>
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Right: Mail View */}
                    <div className="canary-panel flex flex-col gap-6 p-6 md:p-8 rounded-[24px] md:rounded-[32px] border shadow-sm h-full overflow-hidden"
                        style={{
                            backgroundColor: containerBg,
                            borderColor: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.05)',
                            backdropFilter: 'blur(20px)'
                        }}>
                        {selectedEmail ? (
                            <AnimatePresence mode="wait">
                                <motion.div
                                    key={selectedEmail.id}
                                    initial={{ opacity: 0, x: 20 }}
                                    animate={{ opacity: 1, x: 0 }}
                                    exit={{ opacity: 0, x: -20 }}
                                    transition={{ type: 'spring', stiffness: 300, damping: 30 }}
                                    className="flex flex-col gap-6 h-full overflow-y-auto pr-2 custom-scrollbar"
                                >
                                    {/* Header & Actions */}
                                    <div className="flex flex-col gap-6">
                                        <div className="flex items-start justify-between gap-4">
                                            <div className="flex items-center gap-4">

                                                <div className="flex flex-col gap-1">
                                                    <h2 className="text-xl md:text-2xl font-bold m-0 leading-tight" style={{ color: isDark ? '#fff' : '#000' }}>
                                                        {selectedEmail.name}
                                                    </h2>
                                                    <div className="flex items-center gap-2 text-xs font-medium opacity-50">
                                                        <span>{new Date(selectedEmail.timestamp).toLocaleDateString('en-GB', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</span>
                                                        <span>•</span>
                                                        <span>{new Date(selectedEmail.timestamp).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}</span>
                                                        {selectedEmail.repliedAt && (
                                                            <>
                                                                <span>•</span>
                                                                <span className="inline-flex items-center gap-1 text-emerald-500 opacity-100">
                                                                    <Check size={12} /> Replied
                                                                </span>
                                                            </>
                                                        )}
                                                    </div>
                                                </div>
                                            </div>

                                            <div className="flex items-center gap-2">
                                                <button
                                                    onClick={() => handleReplyEmail(selectedEmail)}
                                                    className="p-2.5 md:px-4 md:py-2 rounded-xl bg-blue-500 text-white shadow-lg shadow-blue-500/20 hover:bg-blue-600 active:scale-95 transition-all flex items-center gap-2"
                                                    title="Reply"
                                                >
                                                    <Reply size={18} />
                                                    <span className="hidden md:inline font-bold text-sm">{selectedEmail.repliedAt ? 'Reply again' : 'Reply'}</span>
                                                </button>
                                                <button
                                                    onClick={() => setConfirmDelete(selectedEmail.id)}
                                                    className="p-2.5 rounded-xl bg-red-500/10 text-red-500 hover:bg-red-500/20 active:scale-95 transition-all border border-transparent hover:border-red-500/20"
                                                    title="Delete Message"
                                                >
                                                    <Trash2 size={18} />
                                                </button>
                                            </div>
                                        </div>

                                        {/* Metadata Card */}
                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 p-4 rounded-2xl border"
                                            style={{
                                                backgroundColor: isDark ? 'rgba(0,0,0,0.2)' : 'rgba(255,255,255,0.5)',
                                                borderColor: isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)'
                                            }}
                                        >
                                            <div className="flex items-center gap-3">
                                                <div className="w-8 h-8 rounded-lg flex items-center justify-center bg-black/5 dark:bg-white/5 opacity-70">
                                                    <Mail size={14} />
                                                </div>
                                                <div className="flex flex-col">
                                                    <span className="text-[10px] uppercase font-bold opacity-40">Email Address</span>
                                                    <span className="text-sm font-semibold select-all" style={{ color: isDark ? '#fff' : '#000' }}>{selectedEmail.email}</span>
                                                </div>
                                            </div>

                                            {selectedEmail.number && (
                                                <div className="flex items-center gap-3">
                                                    <div className="w-8 h-8 rounded-lg flex items-center justify-center bg-black/5 dark:bg-white/5 opacity-70">
                                                        <Clock size={14} className="rotate-0" />
                                                    </div>
                                                    <div className="flex flex-col">
                                                        <span className="text-[10px] uppercase font-bold opacity-40">Phone Number</span>
                                                        <div className="flex items-center gap-2">
                                                            <span className="text-sm font-semibold select-all" style={{ color: isDark ? '#fff' : '#000' }}>{selectedEmail.number}</span>
                                                            {selectedEmail.whatsapp && (
                                                                <a
                                                                    href={`https://wa.me/${selectedEmail.number.replace(/\D/g, '')}`}
                                                                    target="_blank"
                                                                    rel="noopener noreferrer"
                                                                    className="px-1.5 py-0.5 rounded bg-green-500/15 text-green-500 text-[9px] font-black uppercase tracking-wider border border-green-500/20 hover:bg-green-500/25 transition-colors cursor-pointer no-underline"
                                                                    title="Chat on WhatsApp"
                                                                >
                                                                    WA
                                                                </a>
                                                            )}
                                                        </div>
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    </div>

                                    <div className="my-2 h-[1px] w-full bg-gradient-to-r from-transparent via-black/5 dark:via-white/10 to-transparent" />

                                    {/* Message Body */}
                                    <div className="flex flex-col gap-2">
                                        <span className="text-[10px] font-black uppercase tracking-[0.2em] opacity-40 ml-1">Message Content</span>
                                        <div className="p-4 md:p-6 rounded-[24px]" style={{ backgroundColor: isDark ? 'rgba(255,255,255,0.02)' : 'rgba(0,0,0,0.02)' }}>
                                            <p className="m-0 text-sm md:text-base leading-loose whitespace-pre-wrap font-medium opacity-90" style={{ color: isDark ? 'rgba(255,255,255,0.9)' : 'rgba(0,0,0,0.8)' }}>
                                                {selectedEmail.message}
                                            </p>
                                        </div>
                                    </div>

                                    {/* Attachments */}
                                    {selectedEmail.attachments.length > 0 && (
                                        <div className="flex flex-col gap-4 mt-2">
                                            <div className="flex items-center justify-between pb-2 border-b border-dashed" style={{ borderColor: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)' }}>
                                                <div className="flex items-center gap-2">
                                                    <Paperclip size={16} className="text-blue-500" />
                                                    <span className="text-xs font-black uppercase tracking-widest opacity-60">
                                                        Attachments ({selectedEmail.attachments.length})
                                                    </span>
                                                </div>
                                            </div>
                                            <div className="flex flex-wrap gap-3">
                                                {selectedEmail.attachments.map(renderAttachmentCard)}
                                            </div>
                                        </div>
                                    )}
                                </motion.div>
                            </AnimatePresence>
                        ) : (
                            <div className="flex-1 flex flex-col items-center justify-center opacity-30 gap-3">
                                <Mail size={48} />
                                <span className="text-sm font-bold uppercase tracking-widest">Select a message to view</span>
                            </div>
                        )}
                    </div>
                </div>
            )
            }

            {/* Meeting details (info-first; Edit hands off to the edit modal) */}
            {
                typeof document !== 'undefined' && createPortal(
                    <AnimatePresence mode="wait">
                        {viewingMeeting && (
                            <motion.div
                                key="canary-view-overlay"
                                initial={{ opacity: 0 }}
                                animate={{ opacity: 1 }}
                                exit={{ opacity: 0 }}
                                className="fixed inset-0 z-[2000] flex items-center justify-center bg-black/40 backdrop-blur-sm p-2 md:p-4"
                            >
                                <div className="absolute inset-0" onClick={() => setViewingMeeting(null)} />
                                <motion.div
                                    key="canary-view-content"
                                    initial={{ scale: 0.9, opacity: 0, y: 20 }}
                                    animate={{ scale: 1, opacity: 1, y: 0 }}
                                    exit={{ scale: 0.9, opacity: 0, y: 20 }}
                                    className="relative w-full max-w-lg rounded-2xl md:rounded-[32px] overflow-hidden flex flex-col shadow-2xl max-h-[95vh]"
                                    style={{ backgroundColor: isDark ? 'rgba(0,0,0,0.95)' : 'rgba(255,255,255,0.95)', border: `1px solid ${isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)'}` }}
                                >
                                    {/* Header */}
                                    <div className="p-5 md:p-6 border-b flex items-center justify-between gap-3" style={{ borderColor: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)' }}>
                                        <div className="flex items-center gap-3 min-w-0">
                                            <span className="grid place-items-center shrink-0 rounded-2xl" style={{ width: 44, height: 44, background: 'rgba(59,130,246,0.12)', color: '#3b82f6' }}>
                                                <CalendarIcon size={22} />
                                            </span>
                                            <div className="min-w-0">
                                                <h3 className="text-lg font-bold m-0 truncate" style={{ color: isDark ? '#fff' : '#000' }}>{viewingMeeting.title}</h3>
                                                <p className="text-[11px] font-semibold uppercase tracking-wider m-0" style={{ color: 'var(--text-muted)' }}>Booking details</p>
                                            </div>
                                        </div>
                                        <button onClick={() => setViewingMeeting(null)} className="p-2 hover:bg-black/5 dark:hover:bg-white/5 rounded-lg transition-colors shrink-0" style={{ color: isDark ? 'rgba(255,255,255,0.6)' : 'rgba(0,0,0,0.6)' }} aria-label="Close">
                                            <X size={18} />
                                        </button>
                                    </div>

                                    {/* Body */}
                                    <div className="p-5 md:p-6 flex flex-col gap-5 overflow-y-auto custom-scrollbar">
                                        {viewingMeeting.email && (
                                            <div className="flex flex-col gap-1">
                                                <span className="text-[11px] font-bold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>Email</span>
                                                <a href={`mailto:${viewingMeeting.email}`} className="text-sm font-semibold hover:text-blue-500 transition-colors break-all select-all inline-flex items-center gap-2" style={{ color: isDark ? '#fff' : '#000' }}>
                                                    <Mail size={14} className="opacity-60 shrink-0" />
                                                    {viewingMeeting.email}
                                                </a>
                                            </div>
                                        )}
                                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                                            <div className="flex flex-col gap-1">
                                                <span className="text-[11px] font-bold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>Date</span>
                                                <span className="text-sm font-semibold" style={{ color: isDark ? '#fff' : '#000' }}>{viewingMeeting.date.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}</span>
                                            </div>
                                            <div className="flex flex-col gap-1">
                                                <span className="text-[11px] font-bold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>Time</span>
                                                <span className="text-sm font-semibold inline-flex items-center gap-2" style={{ color: isDark ? '#fff' : '#000' }}><Clock size={14} className="opacity-60 shrink-0" />{viewingMeeting.time}</span>
                                            </div>
                                        </div>
                                        <div className="flex flex-col gap-1">
                                            <span className="text-[11px] font-bold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>What it&apos;s for</span>
                                            <span className="text-sm leading-relaxed" style={{ color: isDark ? 'rgba(255,255,255,0.85)' : 'rgba(0,0,0,0.85)' }}>{viewingMeeting.reason || 'No description provided.'}</span>
                                        </div>
                                        {viewingMeeting.link && (
                                            <a href={viewingMeeting.link} target="_blank" rel="noopener noreferrer" className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold transition-colors self-start no-underline" style={{ background: 'rgba(59,130,246,0.12)', color: '#3b82f6' }}>
                                                <Video size={16} /> Join meeting
                                            </a>
                                        )}
                                    </div>

                                    {/* Footer actions */}
                                    <div className="p-5 md:p-6 border-t flex items-center justify-between gap-3" style={{ borderColor: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)' }}>
                                        <button
                                            type="button"
                                            onClick={() => { const id = viewingMeeting.id; setViewingMeeting(null); setConfirmDelete(id); }}
                                            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold cursor-pointer transition-colors"
                                            style={{ border: '1px solid rgba(239,68,68,0.4)', color: '#ef4444' }}
                                        >
                                            <Trash2 size={16} /> Delete
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => { const m = viewingMeeting; setViewingMeeting(null); handleReschedule(m); }}
                                            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-bold cursor-pointer transition-all"
                                            style={{ background: '#3b82f6', color: '#fff' }}
                                        >
                                            <Edit2 size={16} /> Edit
                                        </button>
                                    </div>
                                </motion.div>
                            </motion.div>
                        )}
                    </AnimatePresence>,
                    document.body
                )
            }

            {/* Modal */}
            {
                typeof document !== 'undefined' && createPortal(
                    <AnimatePresence mode="wait">
                        {editingMeeting && (
                            <motion.div
                                key="canary-modal-overlay"
                                initial={{ opacity: 0 }}
                                animate={{ opacity: 1 }}
                                exit={{ opacity: 0 }}
                                className="fixed inset-0 z-[2000] flex items-center justify-center bg-black/40 backdrop-blur-sm p-2 md:p-4"
                            >
                                <div className="absolute inset-0" onClick={() => setEditingMeeting(null)} />

                                <motion.div
                                    key="canary-modal-content"
                                    initial={{ scale: 0.9, opacity: 0, y: 20 }}
                                    animate={{ scale: 1, opacity: 1, y: 0 }}
                                    exit={{ scale: 0.9, opacity: 0, y: 20 }}
                                    className="relative w-full max-w-2xl rounded-2xl md:rounded-[32px] overflow-hidden flex flex-col shadow-2xl max-h-[95vh]"
                                    style={{ backgroundColor: isDark ? 'rgba(0,0,0,0.95)' : 'rgba(255,255,255,0.95)', border: `1px solid ${isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)'}` }}
                                >
                                    <div className="p-4 md:p-6 border-b flex items-center justify-end" style={{ borderColor: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)' }}>
                                        <button onClick={() => setEditingMeeting(null)} className="p-2 hover:bg-black/5 dark:hover:bg-white/5 rounded-lg transition-colors" style={{ color: isDark ? 'rgba(255,255,255,0.6)' : 'rgba(0,0,0,0.6)' }}>
                                            <X size={20} />
                                        </button>
                                    </div>

                                    <div className="p-4 md:p-8 flex flex-col gap-6 md:gap-8 overflow-y-auto" style={{
                                        scrollbarWidth: 'thin',
                                        scrollbarColor: isDark ? 'rgba(255,255,255,0.2) transparent' : 'rgba(0,0,0,0.2) transparent'
                                    }}>
                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 md:gap-8">
                                            <div className="flex flex-col gap-6 md:gap-8">
                                                <div className="flex flex-col gap-2">
                                                    <label className="text-[10px] md:text-xs font-bold uppercase tracking-widest opacity-60" style={{ color: isDark ? '#fff' : '#000' }}>Session Title</label>
                                                    <input
                                                        type="text"
                                                        className="w-full h-10 md:h-12 rounded-xl border px-3 md:px-4 font-medium transition-all focus:border-blue-500 outline-none text-sm md:text-base"
                                                        style={{ backgroundColor: isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)', borderColor: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)', color: isDark ? '#fff' : '#000' }}
                                                        value={editingMeeting.title}
                                                        onChange={(e) => setEditingMeeting({ ...editingMeeting, title: e.target.value })}
                                                        placeholder="Meeting purpose..."
                                                    />
                                                </div>

                                                <div className="flex flex-col gap-3">
                                                    <h3 className="text-[10px] md:text-xs font-bold uppercase tracking-widest opacity-60 flex items-center gap-2" style={{ color: isDark ? '#fff' : '#000' }}><Clock size={14} /> Available Slots</h3>
                                                    <div className="grid grid-cols-2 gap-2">
                                                        {TIME_OPTIONS.map((time) => {
                                                            const isTaken = meetings.some(m =>
                                                                m.id !== editingMeeting.id &&
                                                                m.date.toDateString() === editingMeeting.date.toDateString() &&
                                                                m.time === time
                                                            );
                                                            return (
                                                                <button
                                                                    key={time}
                                                                    disabled={isTaken}
                                                                    onClick={() => setEditingMeeting({ ...editingMeeting, time })}
                                                                    style={{
                                                                        padding: '8px', borderRadius: '12px',
                                                                        border: `1px solid ${editingMeeting.time === time ? 'rgb(59, 130, 246)' : (isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.08)')}`,
                                                                        background: editingMeeting.time === time ? 'rgba(59, 130, 246, 0.12)' : (isDark ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.03)'),
                                                                        color: editingMeeting.time === time ? 'rgb(59, 130, 246)' : (isDark ? '#fff' : '#000'),
                                                                        fontSize: '0.7rem', fontWeight: 600, cursor: isTaken ? 'not-allowed' : 'pointer', transition: 'all 0.2s',
                                                                        opacity: isTaken ? 0.3 : 1
                                                                    }}
                                                                    title={isTaken ? 'This slot is already booked' : ''}
                                                                >
                                                                    {time}
                                                                </button>
                                                            );
                                                        })}

                                                        {/* Custom (free) slot: the chip morphs into a glassy picker so
                                                            you can reschedule to any time, not just the fixed hours.
                                                            zIndex clears this modal's own z-[2000]. */}
                                                        <CustomTimePicker
                                                            isDark={isDark}
                                                            active={!!editingMeeting.time && !TIME_OPTIONS.includes(editingMeeting.time)}
                                                            value={editingMeeting.time}
                                                            zIndex={2100}
                                                            validate={(t) => {
                                                                const taken = meetings.some(m =>
                                                                    m.id !== editingMeeting.id &&
                                                                    m.date.toDateString() === editingMeeting.date.toDateString() &&
                                                                    m.time === t
                                                                );
                                                                return taken ? 'That time is already booked, pick another.' : null;
                                                            }}
                                                            onError={(msg) => showAlert({ type: 'warning', message: msg })}
                                                            onApply={(t) => setEditingMeeting({ ...editingMeeting, time: t })}
                                                        />
                                                    </div>
                                                </div>
                                            </div>

                                            <div className="flex flex-col gap-4">
                                                <div className="flex items-center justify-between pb-2">
                                                    <h3 style={{ fontSize: '0.9rem', fontWeight: 700, color: isDark ? '#fff' : '#000', margin: 0 }}>
                                                        {modalViewDate.toLocaleDateString('default', { month: 'long', year: 'numeric' })}
                                                    </h3>
                                                    <div style={{ display: 'flex', gap: '4px' }}>
                                                        <button onClick={() => changeModalMonth(-1)} style={{ padding: '6px', borderRadius: '8px', border: 'none', background: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.05)', color: isDark ? '#fff' : '#000', cursor: 'pointer' }}><ChevronLeft size={14} /></button>
                                                        <button onClick={() => changeModalMonth(1)} style={{ padding: '6px', borderRadius: '8px', border: 'none', background: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.05)', color: isDark ? '#fff' : '#000', cursor: 'pointer' }}><ChevronRight size={14} /></button>
                                                    </div>
                                                </div>

                                                <div className="grid grid-cols-7 gap-1 text-center mb-2">
                                                    {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((d, idx) => (
                                                        <div key={idx} style={{ fontSize: '0.65rem', fontWeight: 600, color: isDark ? 'rgba(255,255,255,0.6)' : 'rgba(0,0,0,0.6)' }}>{d}</div>
                                                    ))}
                                                </div>

                                                <div className="overflow-hidden relative">
                                                    <AnimatePresence mode="popLayout" initial={false} custom={modalDirection}>
                                                        <motion.div
                                                            key={modalViewDate.toISOString()}
                                                            custom={modalDirection}
                                                            variants={variants}
                                                            initial="enter"
                                                            animate="center"
                                                            exit="exit"
                                                            transition={{ type: "spring", stiffness: 300, damping: 30 }}
                                                            className="grid grid-cols-7 gap-1 md:gap-2"
                                                        >
                                                            {modalCalendarDays.map((date, idx) => {
                                                                const isSelected = date?.toDateString() === editingMeeting.date.toDateString();
                                                                return (
                                                                    <div
                                                                        key={idx}
                                                                        onClick={() => date && setEditingMeeting({ ...editingMeeting, date })}
                                                                        style={{
                                                                            aspectRatio: '1', borderRadius: '12px', cursor: 'pointer', position: 'relative',
                                                                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                                            opacity: date ? 1 : 0
                                                                        }}
                                                                        className={date && !isSelected ? 'hover:bg-black/5 dark:hover:bg-white/5' : ''}
                                                                    >
                                                                        {isSelected && date && (
                                                                            <motion.div
                                                                                layoutId="modal-selected-day-bg"
                                                                                initial={false}
                                                                                transition={{ type: "spring", stiffness: 500, damping: 40, mass: 1 }}
                                                                                style={{
                                                                                    position: 'absolute', inset: 0,
                                                                                    borderRadius: 12,
                                                                                    backgroundColor: 'rgb(59, 130, 246)',
                                                                                    boxShadow: '0 8px 20px -4px rgba(59, 130, 246, 0.5)',
                                                                                    zIndex: 0
                                                                                }}
                                                                            />
                                                                        )}
                                                                        <span style={{
                                                                            position: 'relative', zIndex: 1,
                                                                            color: isSelected ? 'white' : (isDark ? '#fff' : '#000'),
                                                                            fontWeight: isSelected ? 700 : 500,
                                                                            fontSize: '0.8rem'
                                                                        }}>
                                                                            {date?.getDate()}
                                                                        </span>
                                                                    </div>
                                                                );
                                                            })}
                                                        </motion.div>
                                                    </AnimatePresence>
                                                </div>
                                            </div>
                                        </div>
                                    </div>

                                    {/* Modal Footer */}
                                    <div className="p-4 md:p-6 border-t flex items-center justify-between" style={{ borderColor: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)', backgroundColor: isDark ? 'rgba(255,255,255,0.02)' : 'rgba(0,0,0,0.02)' }}>
                                        <div className="flex items-center gap-3">
                                            <button
                                                onClick={() => setConfirmDelete(editingMeeting.id)}
                                                className="px-4 md:px-5 py-2 md:py-2.5 rounded-xl transition-all text-xs md:text-sm font-bold flex items-center gap-2 text-red-500 hover:bg-red-500/10 border border-transparent hover:border-red-500/20"
                                            >
                                                <Trash2 size={16} />
                                                Cancel
                                            </button>
                                            <button
                                                onClick={() => setEditingMeeting(null)}
                                                className="px-4 md:px-5 py-2 md:py-2.5 rounded-xl font-bold text-xs md:text-sm transition-all hover:bg-black/5 dark:hover:bg-white/5"
                                                style={{ color: isDark ? 'rgba(255,255,255,0.6)' : 'rgba(0,0,0,0.6)' }}
                                            >
                                                Close
                                            </button>
                                        </div>
                                        <div className="flex items-center gap-4">
                                            <button
                                                onClick={handleSaveMeeting}
                                                className="px-5 md:px-6 py-2 md:py-2.5 rounded-xl text-white font-bold text-xs md:text-sm shadow-xl transition-all hover:scale-[1.02] active:scale-[0.98] flex items-center gap-2"
                                                style={{ background: 'linear-gradient(135deg, #1A1A1A 0%, #333333 100%)' }}
                                            >
                                                <Check size={18} strokeWidth={2.5} />
                                                Reschedule
                                            </button>
                                        </div>
                                    </div>
                                </motion.div>
                            </motion.div>
                        )}
                    </AnimatePresence>,
                    document.body
                )
            }

            {/* Confirmation & Feedback */}
            {alert && <Alert type={alert.type} message={alert.message} onClose={() => hideAlert()} duration={alert.duration ?? 4000} />}
            <MConfirmModal
                isOpen={!!confirmDelete}
                title={activeSection === 'mails' ? "Delete Message" : "Cancel Session"}
                message={activeSection === 'mails'
                    ? "Are you sure you want to delete this message? This action cannot be undone."
                    : "Are you sure you want to cancel this session? This action cannot be undone."
                }
                type="danger"
                confirmText={activeSection === 'mails' ? "Delete Message" : "Cancel Session"}
                onConfirm={() => {
                    if (confirmDelete) {
                        if (activeSection === 'mails') {
                            handleDeleteEmail(confirmDelete);
                        } else {
                            const meeting = meetings.find(m => m.id === confirmDelete);
                            handleDelete(confirmDelete, meeting);
                            setConfirmDelete(null);
                            setEditingMeeting(null);
                        }
                    }
                }}
                onClose={() => setConfirmDelete(null)}
            />

            {/* Specialized Booking Modal */}
            {isBookingOpen && (
                <MContact
                    onClose={() => setIsBookingOpen(false)}
                    initialTab="meeting"
                    hideTabs={true}
                />
            )}

            <AnimatePresence>
                {replyTo && (
                    <MReply
                        email={replyTo}
                        isDark={isDark}
                        onClose={() => setReplyTo(null)}
                        onSent={() => markReplied(replyTo.id)}
                        notify={(message, type) => showAlert({ type, message })}
                    />
                )}
            </AnimatePresence>

            {/* Email Options Menu Portal & Attachment Preview (Omitted for brevity as they are unchanged) */}
            {
                openOptionsId && createPortal(
                    <>
                        <div
                            className="fixed inset-0 z-[999]"
                            onClick={() => setOpenOptionsId(null)}
                        />
                        <div className="fixed z-[1000] glass-panel min-w-[140px] p-2 animate-pop flex flex-col gap-1 shadow-2xl" style={{
                            top: `${menuPos.top}px`,
                            right: `${menuPos.right}px`,
                            borderRadius: '16px',
                            backgroundColor: isDark ? 'rgba(10, 10, 12, 0.95)' : 'rgba(255, 255, 255, 0.95)',
                            border: isDark ? '1px solid rgba(255,255,255,0.1)' : '1px solid rgba(0,0,0,0.1)',
                            backdropFilter: 'blur(20px)'
                        }}>
                            <button
                                onClick={(e) => {
                                    e.stopPropagation();
                                    const email = emails.find(e => e.id === openOptionsId);
                                    if (email) handleReplyEmail(email);
                                }}
                                className="w-full text-left flex items-center gap-2 bg-transparent border-none cursor-pointer rounded-lg text-sm p-2.5 transition-colors"
                                style={{
                                    color: isDark ? '#60a5fa' : '#2563eb',
                                    fontFamily: "'Inter', sans-serif"
                                }}
                                onMouseEnter={(e) => e.currentTarget.style.backgroundColor = isDark ? 'rgba(59, 130, 246, 0.1)' : 'rgba(37, 99, 235, 0.05)'}
                                onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                            >
                                <Reply size={16} /> Reply
                            </button>

                            <div className="mx-2 my-0.5 h-[1px]" style={{ backgroundColor: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)' }} />

                            <button
                                onClick={(e) => {
                                    e.stopPropagation();
                                    setConfirmDelete(openOptionsId);
                                    setOpenOptionsId(null);
                                }}
                                className="w-full text-left flex items-center gap-2 bg-transparent border-none cursor-pointer rounded-lg text-sm p-2.5 transition-colors"
                                style={{
                                    color: 'rgb(239, 68, 68)',
                                    fontFamily: "'Inter', sans-serif"
                                }}
                                onMouseEnter={(e) => e.currentTarget.style.backgroundColor = isDark ? 'rgba(239, 68, 68, 0.1)' : 'rgba(239, 68, 68, 0.05)'}
                                onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                            >
                                <Trash2 size={16} /> Delete
                            </button>
                        </div>
                    </>,
                    document.body
                )
            }

            {
                typeof document !== 'undefined' && createPortal(
                    <AnimatePresence>
                        {previewAttachment && (
                            <motion.div
                                initial={{ opacity: 0 }}
                                animate={{ opacity: 1 }}
                                exit={{ opacity: 0 }}
                                onClick={() => setPreviewAttachment(null)}
                                className="fixed inset-0 z-[2000] flex items-center justify-center bg-black/80 backdrop-blur-md p-4 sm:p-8"
                            >
                                <div
                                    className="relative max-w-5xl max-h-full w-full rounded-2xl overflow-hidden shadow-2xl bg-black"
                                    onClick={(e) => e.stopPropagation()}
                                >
                                    <button
                                        onClick={() => setPreviewAttachment(null)}
                                        className="absolute top-4 right-4 z-50 p-2 rounded-full bg-black/50 hover:bg-black/80 text-white backdrop-blur-md transition-colors"
                                    >
                                        <X size={24} />
                                    </button>

                                    <div className="flex w-full h-full items-center justify-center bg-zinc-900">
                                        {/\.(jpg|jpeg|png|gif|webp)$/i.test(previewAttachment.name) ? (
                                            <img
                                                src={previewAttachment.url}
                                                alt={previewAttachment.name}
                                                className="max-w-full max-h-[85vh] object-contain"
                                            />
                                        ) : /\.(mp4|webm|ogg)$/i.test(previewAttachment.name) ? (
                                            <video
                                                controls
                                                autoPlay
                                                src={previewAttachment.url}
                                                className="max-w-full max-h-[85vh]"
                                            />
                                        ) : (
                                            <iframe
                                                src={previewAttachment.url}
                                                title={previewAttachment.name}
                                                className="w-full h-[85vh] bg-white"
                                            />
                                        )}
                                    </div>

                                    <div className="absolute bottom-0 left-0 right-0 p-4 bg-gradient-to-t from-black/80 to-transparent text-white">
                                        <div className="flex items-center justify-between">
                                            <span className="font-bold truncate">{previewAttachment.name}</span>
                                            <a
                                                href={previewAttachment.url}
                                                target="_blank"
                                                rel="noreferrer"
                                                className="px-4 py-2 rounded-lg bg-white/10 hover:bg-white/20 transition-colors flex items-center gap-2 text-sm font-bold"
                                            >
                                                <ExternalLink size={14} /> Open Original
                                            </a>
                                        </div>
                                    </div>
                                </div>
                            </motion.div>
                        )}
                    </AnimatePresence>,
                    document.body
                )
            }
        </div >
    );
};

export default DCanary;
