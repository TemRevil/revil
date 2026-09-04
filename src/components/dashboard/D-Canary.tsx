import { useState, useMemo, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import anime from 'animejs';
import { motion, AnimatePresence, useReducedMotion } from 'motion/react';
import { ChevronLeft, ChevronRight, Calendar as CalendarIcon, Clock, Edit2, X, Check, Plus, Trash2, Mail, Phone, FileText, ExternalLink, Video, ImageIcon, Paperclip, MoreVertical, Reply, Tags } from 'lucide-react';
import { doc, onSnapshot, updateDoc, deleteField, setDoc } from 'firebase/firestore';
import { httpsCallable, getFunctions } from 'firebase/functions';
import app, { db } from '../../lib/firebase';
import { AvailabilityConfig, DEFAULT_AVAILABILITY, WEEKDAY_LABELS, ALL_HOURS, parseAvailabilityConfig, buildHostSlots, formatHourSlot } from '../../utils/availability';
import { MeetingCategory, PERSONAL_CATEGORY, CATEGORY_COLORS, MAX_CATEGORY_NAME, categoryKey, parseCategories, findCategory } from '../../utils/categories';
// Local Functions handle (lazy Dashboard chunk) - keeps firebase/functions out of eager.
const functions = getFunctions(app);

import Alert from '../Alert';
import useSafeAlert from '../../hooks/useSafeAlert';
import MConfirmModal from './M-ConfirmModal';
import MContact from '../M-Contact';
import MReply from './M-Reply';
import CustomTimePicker from '../CustomTimePicker';
import Select from '../Select';
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
    /** Category id. Absent = Personal, which is where every guest booking lands. */
    category?: string;
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
    Category?: string;
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

// True when `d` falls on a day that has already passed (midnight-to-midnight, local).
// Rescheduling into one is allowed here - a session can genuinely be logged after the
// fact - but it goes through a confirmation first, since it is never what a misclick
// on the month arrows was meant to do.
const isPastDay = (d: Date) => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const day = new Date(d);
    day.setHours(0, 0, 0, 0);
    return day < today;
};

/** The colour picker shared by the add and rename rows of the categories panel. */
const ColorSwatches = ({ value, onPick, isDark }: { value: string; onPick: (c: string) => void; isDark: boolean }) => (
    <div className="flex items-center gap-1.5 flex-wrap" role="radiogroup" aria-label="Category colour">
        {CATEGORY_COLORS.map(c => {
            const on = value === c;
            return (
                <button
                    key={c}
                    type="button"
                    role="radio"
                    aria-checked={on}
                    aria-label={`Colour ${c}`}
                    onClick={() => onPick(c)}
                    // The ring sits outside the dot so picking one doesn't resize it.
                    className="w-7 h-7 grid place-items-center rounded-full cursor-pointer transition-shadow"
                    style={{ boxShadow: on ? `0 0 0 2px ${isDark ? '#0b0b0f' : '#fff'}, 0 0 0 4px ${c}` : 'none' }}
                >
                    <span className="w-5 h-5 rounded-full" style={{ background: c }} />
                </button>
            );
        })}
    </div>
);

/** Small coloured pill naming a booking's category - list rows and details view. */
const CategoryBadge = ({ cat, size = 'sm' }: { cat: MeetingCategory; size?: 'sm' | 'md' }) => (
    <span
        className={`inline-flex items-center gap-1.5 rounded-md font-semibold ${size === 'md' ? 'px-2.5 py-1 text-xs' : 'p-1 px-1.5 text-[11px]'}`}
        style={{ background: `${cat.color}1f`, color: cat.color }}
    >
        <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: cat.color }} />
        {cat.name}
    </span>
);

const DCanary = () => {
    // Everything below that animates layout falls back to an instant change here.
    const reduceMotion = useReducedMotion();
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
    // Owner-defined meeting categories (Options tab) + the filter over the bookings
    // list. Personal is not in here - it's the built-in fallback for an unset one.
    const [categories, setCategories] = useState<MeetingCategory[]>([]);
    const [categoryFilter, setCategoryFilter] = useState<string>('all');
    const [newCatName, setNewCatName] = useState('');
    const [newCatColor, setNewCatColor] = useState<string>(CATEGORY_COLORS[1]);
    const [editingCatId, setEditingCatId] = useState<string | null>(null);
    const [editCatName, setEditCatName] = useState('');
    const [editCatColor, setEditCatColor] = useState<string>(CATEGORY_COLORS[1]);
    const [catBusy, setCatBusy] = useState(false);
    const [confirmDeleteCat, setConfirmDeleteCat] = useState<MeetingCategory | null>(null);
    // Set when a reschedule lands on a day that has already passed: holds the save until
    // the owner confirms it, so a stray click on a past day can't silently move a session.
    const [confirmPastSave, setConfirmPastSave] = useState(false);
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
                            googleEventId: m.GoogleEventId,
                            category: typeof m.Category === 'string' ? m.Category : undefined
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

                setCategories(parseCategories(data.Categories));
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

    // Personal first, then the owner's own, in the order they were added.
    const allCategories = useMemo(() => [PERSONAL_CATEGORY, ...categories], [categories]);
    const categoryOf = (m: Meeting) => findCategory(categories, m.category);

    // The filter drives BOTH the calendar dots and the day list, so a filtered month
    // reads honestly. It falls back to 'all' on its own if the category it points at
    // was just deleted, rather than showing an empty calendar with no explanation.
    const activeFilter = categoryFilter !== 'all' && !allCategories.some(c => c.id === categoryFilter) ? 'all' : categoryFilter;
    const visibleMeetings = useMemo(() => (
        activeFilter === 'all'
            ? meetings
            : meetings.filter(m => (m.category || PERSONAL_CATEGORY.id) === activeFilter)
    ), [meetings, activeFilter]);

    const selectedDayMeetings = useMemo(() => {
        return visibleMeetings.filter(m => m.date.toDateString() === selectedDate.toDateString());
    }, [visibleMeetings, selectedDate]);

    const handleReschedule = (meeting: Meeting) => {
        setEditingMeeting({ ...meeting, date: new Date(meeting.date) });
        setModalViewDate(new Date(meeting.date.getFullYear(), meeting.date.getMonth(), 1));
    };

    // What the booking looked like before this edit - drives the modal's summary line
    // and keeps Save inert until something actually changed.
    const editOriginal = editingMeeting ? meetings.find(m => m.id === editingMeeting.id) : undefined;
    const editDirty = !!(editingMeeting && editOriginal && (
        editingMeeting.title !== editOriginal.title
        || editingMeeting.time !== editOriginal.time
        || editingMeeting.date.toDateString() !== editOriginal.date.toDateString()
        || (editingMeeting.category || '') !== (editOriginal.category || '')
    ));

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

    const handleSaveMeeting = async (pastConfirmed = false) => {
        if (!editingMeeting) return;

        const originalMeeting = meetings.find(m => m.id === editingMeeting.id);
        if (!originalMeeting) return;

        const isTimeChanged = editingMeeting.time !== originalMeeting.time;
        const isDateChanged = editingMeeting.date.toDateString() !== originalMeeting.date.toDateString();
        const isTitleChanged = editingMeeting.title !== originalMeeting.title;
        const isCategoryChanged = (editingMeeting.category || '') !== (originalMeeting.category || '');

        if (!isTimeChanged && !isDateChanged && !isTitleChanged && !isCategoryChanged) {
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

            // Moving the session onto a day that is already over: legitimate (recording a
            // call that happened, fixing a wrong date) but always deliberate, so ask once.
            // Confirming re-enters here with pastConfirmed and falls straight through.
            if (!pastConfirmed && isPastDay(editingMeeting.date)) {
                setConfirmPastSave(true);
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

            const updatePayload: Record<string, unknown> = {
                [`Meetings.${editingMeeting.id}.Date`]: dateStr,
                [`Meetings.${editingMeeting.id}.Time`]: editingMeeting.time,
                [`Meetings.${editingMeeting.id}.Name`]: editingMeeting.title
            };

            // Personal is the absence of a category, so picking it deletes the field
            // rather than storing the sentinel id - keeps one representation, not two.
            if (isCategoryChanged) {
                updatePayload[`Meetings.${editingMeeting.id}.Category`] = editingMeeting.category ?? deleteField();
            }

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

    // ── Categories ────────────────────────────────────────────────────────
    // Written straight through on every add/rename/delete rather than batched behind
    // a Save: they're independent of the working-hours draft above, and a half-typed
    // category is never something you want held hostage by an unsaved hours edit.
    const canaryRef = () => doc(db, 'Settings', 'Canary');

    /** Rejects blanks, over-long names, and anything colliding with an existing name. */
    const validateCatName = (name: string, ignoreId?: string): string | null => {
        const trimmed = name.trim();
        if (!trimmed) return 'Give the category a name first.';
        if (trimmed.length > MAX_CATEGORY_NAME) return `Keep it under ${MAX_CATEGORY_NAME} characters.`;
        const key = categoryKey(trimmed);
        if (key === categoryKey(PERSONAL_CATEGORY.name)) return 'Personal is the built-in category - pick another name.';
        if (categories.some(c => c.id !== ignoreId && categoryKey(c.name) === key)) return 'You already have a category with that name.';
        return null;
    };

    const addCategory = async () => {
        const problem = validateCatName(newCatName);
        if (problem) { showAlert({ type: 'warning', message: problem }); return; }
        setCatBusy(true);
        try {
            const id = `cat_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
            await updateDoc(canaryRef(), {
                [`Categories.${id}`]: { Name: newCatName.trim(), Color: newCatColor, Created: Date.now() },
            });
            setNewCatName('');
            showAlert({ type: 'success', message: 'Category added' });
        } catch {
            showAlert({ type: 'error', message: 'Failed to add the category - are you signed in as admin?' });
        } finally {
            setCatBusy(false);
        }
    };

    const startEditCategory = (cat: MeetingCategory) => {
        setEditingCatId(cat.id);
        setEditCatName(cat.name);
        setEditCatColor(cat.color);
    };

    const saveCategoryEdit = async () => {
        if (!editingCatId) return;
        const problem = validateCatName(editCatName, editingCatId);
        if (problem) { showAlert({ type: 'warning', message: problem }); return; }
        setCatBusy(true);
        try {
            await updateDoc(canaryRef(), {
                [`Categories.${editingCatId}.Name`]: editCatName.trim(),
                [`Categories.${editingCatId}.Color`]: editCatColor,
            });
            setEditingCatId(null);
            showAlert({ type: 'success', message: 'Category updated' });
        } catch {
            showAlert({ type: 'error', message: 'Failed to update the category' });
        } finally {
            setCatBusy(false);
        }
    };

    /** Deleting a category also clears it off its bookings, which drop back to Personal. */
    const deleteCategory = async (cat: MeetingCategory) => {
        setCatBusy(true);
        try {
            const payload: Record<string, unknown> = { [`Categories.${cat.id}`]: deleteField() };
            meetings.filter(m => m.category === cat.id).forEach(m => {
                payload[`Meetings.${m.id}.Category`] = deleteField();
            });
            await updateDoc(canaryRef(), payload);
            if (editingCatId === cat.id) setEditingCatId(null);
            if (categoryFilter === cat.id) setCategoryFilter('all');
            showAlert({ type: 'success', message: 'Category deleted' });
        } catch {
            showAlert({ type: 'error', message: 'Failed to delete the category' });
        } finally {
            setCatBusy(false);
        }
    };

    const categoriesEditor = (
        <div
            className="canary-panel w-full flex flex-col gap-6 p-6 min-[460px]:p-8 rounded-[24px] min-[460px]:rounded-[32px] border shadow-sm"
            style={{ backgroundColor: containerBg, borderColor: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.05)' }}
        >
            <div className="flex items-start gap-4">
                <span className="grid place-items-center shrink-0 rounded-2xl" style={{ width: 48, height: 48, background: 'rgba(59,130,246,0.12)', color: '#3b82f6' }}>
                    <Tags size={24} />
                </span>
                <div>
                    <h3 className="text-lg sm:text-xl font-bold m-0" style={{ color: isDark ? '#fff' : '#000' }}>Categories</h3>
                    <p className="text-sm mt-1" style={{ color: 'var(--text-muted)' }}>
                        Sort bookings into buckets of your own. You set them when you edit a booking, or the assistant does over MCP - guests are never asked, so anything booked from the site arrives as Personal.
                    </p>
                </div>
            </div>

            <motion.div layout={!reduceMotion} className="flex flex-col gap-1.5">
                {/* Personal is the floor of the list, not an entry you can act on. */}
                <div className="flex items-center gap-3 px-3.5 h-12 rounded-xl" style={{ background: isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.03)' }}>
                    <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: PERSONAL_CATEGORY.color }} />
                    <span className="text-sm font-bold" style={{ color: isDark ? '#fff' : '#000' }}>{PERSONAL_CATEGORY.name}</span>
                    <span className="ml-auto text-[11px] font-bold px-2 py-1 rounded-md shrink-0" style={{ background: isDark ? 'rgba(255,255,255,0.07)' : 'rgba(0,0,0,0.05)', color: 'var(--text-muted)' }}>
                        Default
                    </span>
                </div>

                {categories.map(cat => {
                    const used = meetings.filter(m => m.category === cat.id).length;
                    const editing = editingCatId === cat.id;
                    return (
                        // One box per category that MORPHS: layout animates the row growing
                        // into the editor (and back), while the two contents cross-fade
                        // inside it - rather than one element vanishing and another
                        // appearing in its place.
                        <motion.div
                            key={cat.id}
                            layout
                            transition={reduceMotion ? { duration: 0 } : { layout: { type: 'spring', stiffness: 460, damping: 40, mass: 0.8 } }}
                            className="rounded-xl overflow-hidden"
                            style={{
                                background: editing
                                    ? (isDark ? 'rgba(59,130,246,0.06)' : 'rgba(59,130,246,0.04)')
                                    : (isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.03)'),
                                border: `1px solid ${editing ? '#3b82f6' : 'transparent'}`,
                            }}
                        >
                            <AnimatePresence mode="popLayout" initial={false}>
                                {editing ? (
                                    <motion.div
                                        key="edit"
                                        layout="position"
                                        initial={{ opacity: 0 }}
                                        animate={{ opacity: 1 }}
                                        exit={{ opacity: 0 }}
                                        transition={{ duration: reduceMotion ? 0 : 0.14 }}
                                        className="flex flex-col gap-3 p-3"
                                    >
                                        <input
                                            type="text"
                                            autoFocus
                                            value={editCatName}
                                            maxLength={MAX_CATEGORY_NAME}
                                            onChange={(e) => setEditCatName(e.target.value)}
                                            onKeyDown={(e) => { if (e.key === 'Enter') saveCategoryEdit(); if (e.key === 'Escape') setEditingCatId(null); }}
                                            className="w-full h-10 rounded-lg border px-3 text-sm font-semibold outline-none focus:border-blue-500 transition-colors"
                                            style={{ backgroundColor: isDark ? 'rgba(255,255,255,0.05)' : '#fff', borderColor: isDark ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.1)', color: isDark ? '#fff' : '#000' }}
                                        />
                                        <div className="flex items-center justify-between gap-3 flex-wrap">
                                            <ColorSwatches value={editCatColor} onPick={setEditCatColor} isDark={isDark} />
                                            <div className="flex items-center gap-1 ml-auto">
                                                <button type="button" onClick={() => setEditingCatId(null)} className="px-3 h-9 rounded-lg text-xs font-bold cursor-pointer transition-colors hover:bg-black/5 dark:hover:bg-white/10" style={{ color: 'var(--text-muted)' }}>Cancel</button>
                                                <button type="button" onClick={saveCategoryEdit} disabled={catBusy} className="inline-flex items-center gap-1.5 px-3 h-9 rounded-lg text-xs font-bold cursor-pointer transition-colors disabled:opacity-50" style={{ background: '#3b82f6', color: '#fff' }}>
                                                    <Check size={14} /> Save
                                                </button>
                                            </div>
                                        </div>
                                    </motion.div>
                                ) : (
                                    <motion.div
                                        key="view"
                                        layout="position"
                                        initial={{ opacity: 0 }}
                                        animate={{ opacity: 1 }}
                                        exit={{ opacity: 0 }}
                                        transition={{ duration: reduceMotion ? 0 : 0.14 }}
                                        className="group flex items-center gap-3 px-3.5 h-12"
                                    >
                                        <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: cat.color }} />
                                        <span className="text-sm font-bold truncate" style={{ color: isDark ? '#fff' : '#000' }}>{cat.name}</span>
                                        <span className="text-xs shrink-0" style={{ color: 'var(--text-muted)' }}>
                                            {used === 0 ? 'unused' : `${used} booking${used === 1 ? '' : 's'}`}
                                        </span>
                                        {/* Actions stay reachable by keyboard; the mouse only reveals them. */}
                                        <div className="ml-auto flex items-center gap-0.5 shrink-0 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity">
                                            <button type="button" onClick={() => startEditCategory(cat)} aria-label={`Rename ${cat.name}`} className="w-8 h-8 grid place-items-center rounded-lg hover:bg-black/5 dark:hover:bg-white/10 transition-colors cursor-pointer" style={{ color: 'var(--text-muted)' }}>
                                                <Edit2 size={14} />
                                            </button>
                                            <button type="button" onClick={() => setConfirmDeleteCat(cat)} aria-label={`Delete ${cat.name}`} className="w-8 h-8 grid place-items-center rounded-lg hover:bg-red-500/10 transition-colors cursor-pointer text-red-500/70 hover:text-red-500">
                                                <Trash2 size={14} />
                                            </button>
                                        </div>
                                    </motion.div>
                                )}
                            </AnimatePresence>
                        </motion.div>
                    );
                })}

                {categories.length === 0 && (
                    <p className="text-sm px-1 pt-1" style={{ color: 'var(--text-muted)' }}>
                        No categories yet. Add one below and it becomes pickable on every booking.
                    </p>
                )}
            </motion.div>

            {/* New category */}
            <div className="flex flex-col gap-3 pt-1">
                <label htmlFor="new-category" className="text-sm font-bold" style={{ color: isDark ? '#fff' : '#000' }}>New category</label>
                <div className="flex items-center gap-2">
                    <input
                        id="new-category"
                        type="text"
                        value={newCatName}
                        maxLength={MAX_CATEGORY_NAME}
                        placeholder="Category name"
                        onChange={(e) => setNewCatName(e.target.value)}
                        onKeyDown={(e) => { if (e.key === 'Enter') addCategory(); }}
                        className="flex-1 min-w-0 h-11 rounded-xl border px-4 text-sm font-medium outline-none focus:border-blue-500 transition-colors"
                        style={{ backgroundColor: isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.04)', borderColor: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)', color: isDark ? '#fff' : '#000' }}
                    />
                    <button
                        type="button"
                        onClick={addCategory}
                        disabled={catBusy || !newCatName.trim()}
                        className="inline-flex items-center justify-center gap-2 px-5 h-11 rounded-xl text-sm font-bold cursor-pointer transition-colors disabled:opacity-40 disabled:cursor-not-allowed shrink-0"
                        style={{ background: '#3b82f6', color: '#fff' }}
                    >
                        <Plus size={16} /> Add
                    </button>
                </div>
                <ColorSwatches value={newCatColor} onPick={setNewCatColor} isDark={isDark} />
            </div>
        </div>
    );

    const hoursEditor = (
        // auto-fit rather than a breakpoint: the two panels pair up as soon as there is
        // room for both and fall back to one column when there isn't, with no dead rail
        // down the side of the tab at any width.
        <div className="canary-section w-full" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(420px, 1fr))', gap: '1.5rem', alignItems: 'start' }}>
            <div
                className="canary-panel w-full flex flex-col gap-7 p-6 min-[460px]:p-8 rounded-[24px] min-[460px]:rounded-[32px] border shadow-sm"
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
                    <div className="gap-2" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(92px, 1fr))' }}>
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

            {categoriesEditor}
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
                    <span className="hidden sm:inline">Options</span>
                </button>
            </div>

            {activeSection === 'hours' ? hoursEditor : activeSection === 'bookings' ? (
                // alignItems is set here rather than through lg:items-stretch so the
                // bookings column always matches the calendar beside it. The calendar is
                // a fixed 6-row month, so that height never moves - which is what stops
                // the panel growing and shrinking as you step between an empty day and a
                // busy one. Inline because this file's responsive variants lose to their
                // own base class (see the grid-cols note in the modal).
                <div className="canary-section grid grid-cols-1 lg:grid-cols-canary gap-8" style={{ alignItems: windowWidth >= 1024 ? 'stretch' : 'start' }}>
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
                                        const dayMeetings = date ? visibleMeetings.filter(m => m.date.toDateString() === date.toDateString()) : [];

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
                                                                    style={{ backgroundColor: isSelected ? 'rgba(255,255,255,0.5)' : categoryOf(m).color }}
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
                    <div className="canary-panel flex flex-col gap-4 min-[460px]:gap-6 p-4 min-[460px]:p-8 rounded-[24px] min-[460px]:rounded-[32px] border shadow-sm min-h-0"
                        style={{
                            backgroundColor: containerBg,
                            borderColor: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.05)',
                            backdropFilter: 'blur(20px)'
                        }}>
                        <div className="flex flex-col gap-3">

                            <h3 className="text-2xl font-bold m-0" style={{ color: isDark ? '#fff' : '#000' }}>
                                {selectedDate.toLocaleDateString('default', { weekday: 'long', day: 'numeric', month: 'short' })}
                            </h3>

                            {/* Only worth showing once there's something to filter BY. */}
                            {categories.length > 0 && (
                                <div className="flex items-center gap-1.5 flex-wrap">
                                    {[{ id: 'all', name: 'All', color: PERSONAL_CATEGORY.color }, ...allCategories].map(c => {
                                        const on = activeFilter === c.id;
                                        return (
                                            <button
                                                key={c.id}
                                                type="button"
                                                onClick={() => setCategoryFilter(c.id)}
                                                className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-bold cursor-pointer transition-colors"
                                                style={on
                                                    ? { background: `${c.color}26`, color: c.color }
                                                    : { background: isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.04)', color: 'var(--text-muted)' }}
                                            >
                                                {c.id !== 'all' && <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: c.color }} />}
                                                {c.name}
                                            </button>
                                        );
                                    })}
                                </div>
                            )}
                        </div>

                        <div className="flex-1 min-h-0 overflow-y-auto flex flex-col gap-3 pr-2" style={{
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
                                                    {meeting.category && <CategoryBadge cat={categoryOf(meeting)} />}
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
                                        <div className="flex flex-col gap-1.5 items-start">
                                            <span className="text-[11px] font-bold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>Category</span>
                                            <CategoryBadge cat={categoryOf(viewingMeeting)} size="md" />
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
                                    className="relative w-full max-w-3xl rounded-2xl md:rounded-[28px] overflow-hidden flex flex-col shadow-2xl max-h-[92vh]"
                                    style={{ backgroundColor: isDark ? 'rgba(10,10,14,0.97)' : 'rgba(255,255,255,0.97)', border: `1px solid ${isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.08)'}` }}
                                >
                                    {/* Header: says what this is and which booking, so the fields
                                        below don't have to carry that job on their own. */}
                                    <div className="px-5 md:px-7 py-4 md:py-5 border-b flex items-start justify-between gap-3" style={{ borderColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.07)' }}>
                                        <div className="flex items-center gap-3 min-w-0">
                                            <span className="grid place-items-center shrink-0 rounded-2xl" style={{ width: 42, height: 42, background: 'rgba(59,130,246,0.12)', color: '#3b82f6' }}>
                                                <Edit2 size={20} />
                                            </span>
                                            <div className="min-w-0">
                                                <h3 className="text-base md:text-lg font-bold m-0 leading-tight" style={{ color: isDark ? '#fff' : '#000' }}>Edit booking</h3>
                                                <p className="text-xs m-0 mt-0.5 truncate" style={{ color: 'var(--text-muted)' }}>
                                                    {editOriginal
                                                        ? `Booked for ${editOriginal.date.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })} at ${editOriginal.time}`
                                                        : 'Booking details'}
                                                    {editingMeeting.email ? ` · ${editingMeeting.email}` : ''}
                                                </p>
                                            </div>
                                        </div>
                                        <button onClick={() => setEditingMeeting(null)} aria-label="Close" className="w-9 h-9 grid place-items-center shrink-0 hover:bg-black/5 dark:hover:bg-white/10 rounded-lg transition-colors cursor-pointer" style={{ color: isDark ? 'rgba(255,255,255,0.6)' : 'rgba(0,0,0,0.5)' }}>
                                            <X size={18} />
                                        </button>
                                    </div>

                                    <div className="px-5 md:px-7 py-5 md:py-6 overflow-y-auto custom-scrollbar">
                                        {/* Explicit columns rather than a md: variant: responsive grid-cols
                                            variants do not survive this file's class ordering (the base
                                            grid-cols wins), and windowWidth is already tracked here. */}
                                        <div style={{ display: 'grid', gridTemplateColumns: windowWidth >= 820 ? '1fr 264px' : '1fr', gap: windowWidth >= 820 ? '2rem' : '1.5rem' }}>
                                            {/* Left: what the booking IS */}
                                            <div className="flex flex-col gap-5 min-w-0">
                                                <div className="flex flex-col gap-2">
                                                    <label htmlFor="booking-title" className="text-[11px] font-bold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>Booked by</label>
                                                    <input
                                                        id="booking-title"
                                                        type="text"
                                                        className="w-full h-11 rounded-xl border px-3.5 text-sm font-medium transition-colors focus:border-blue-500 outline-none"
                                                        style={{ backgroundColor: isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.03)', borderColor: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)', color: isDark ? '#fff' : '#000' }}
                                                        value={editingMeeting.title}
                                                        onChange={(e) => setEditingMeeting({ ...editingMeeting, title: e.target.value })}
                                                        placeholder="Guest or meeting name"
                                                    />
                                                </div>

                                                <div className="flex flex-col gap-2">
                                                    <label className="text-[11px] font-bold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>Category</label>
                                                    <div className="flex items-center gap-2">
                                                        {/* The swatch is the only place the colour appears in this
                                                            modal, so the pick reads at a glance next to the name. */}
                                                        <span className="w-11 h-11 grid place-items-center rounded-xl shrink-0" style={{ background: `${categoryOf(editingMeeting).color}1f` }}>
                                                            <span className="w-3 h-3 rounded-full" style={{ background: categoryOf(editingMeeting).color }} />
                                                        </span>
                                                        <div className="flex-1 min-w-0">
                                                            <Select
                                                                value={editingMeeting.category || PERSONAL_CATEGORY.id}
                                                                options={allCategories.map(c => ({
                                                                    value: c.id,
                                                                    label: c.name,
                                                                    hint: c.id === PERSONAL_CATEGORY.id ? 'Default' : undefined,
                                                                }))}
                                                                // Personal is stored as no category at all, hence the undefined.
                                                                onChange={(v) => setEditingMeeting({ ...editingMeeting, category: v === PERSONAL_CATEGORY.id ? undefined : v })}
                                                                isDark={isDark}
                                                                aria-label="Booking category"
                                                            />
                                                        </div>
                                                    </div>
                                                </div>

                                                <div className="flex flex-col gap-2">
                                                    <div className="flex items-baseline justify-between gap-3">
                                                        <label className="text-[11px] font-bold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>Time</label>
                                                        <span className="text-[11px]" style={{ color: 'var(--text-muted)' }}>host time</span>
                                                    </div>
                                                    <div className="gap-1.5" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(88px, 1fr))' }}>
                                                        {TIME_OPTIONS.map((time) => {
                                                            const isTaken = meetings.some(m =>
                                                                m.id !== editingMeeting.id &&
                                                                m.date.toDateString() === editingMeeting.date.toDateString() &&
                                                                m.time === time
                                                            );
                                                            const on = editingMeeting.time === time;
                                                            return (
                                                                <button
                                                                    key={time}
                                                                    type="button"
                                                                    disabled={isTaken}
                                                                    onClick={() => setEditingMeeting({ ...editingMeeting, time })}
                                                                    className="h-9 rounded-lg text-[11px] font-bold border transition-colors disabled:cursor-not-allowed cursor-pointer"
                                                                    style={on
                                                                        ? { background: '#3b82f6', color: '#fff', borderColor: '#3b82f6' }
                                                                        : { background: 'transparent', color: isTaken ? 'var(--text-muted)' : (isDark ? '#fff' : '#000'), borderColor: isDark ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.1)', opacity: isTaken ? 0.35 : 1 }}
                                                                    title={isTaken ? 'Already booked' : undefined}
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

                                                {editingMeeting.reason && (
                                                    <div className="flex flex-col gap-1.5">
                                                        <span className="text-[11px] font-bold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>What it&apos;s for</span>
                                                        <p className="text-sm leading-relaxed m-0" style={{ color: isDark ? 'rgba(255,255,255,0.75)' : 'rgba(0,0,0,0.7)' }}>{editingMeeting.reason}</p>
                                                    </div>
                                                )}
                                            </div>

                                            {/* Right: when */}
                                            <div className="flex flex-col gap-3 min-w-0">
                                                <div className="flex items-center justify-between gap-2">
                                                    <span className="text-sm font-bold" style={{ color: isDark ? '#fff' : '#000' }}>
                                                        {modalViewDate.toLocaleDateString('default', { month: 'long', year: 'numeric' })}
                                                    </span>
                                                    <div className="flex items-center gap-1">
                                                        <button type="button" onClick={() => changeModalMonth(-1)} aria-label="Previous month" className="w-7 h-7 grid place-items-center rounded-lg cursor-pointer transition-colors hover:bg-black/5 dark:hover:bg-white/10" style={{ color: isDark ? 'rgba(255,255,255,0.65)' : 'rgba(0,0,0,0.55)' }}><ChevronLeft size={15} /></button>
                                                        <button type="button" onClick={() => changeModalMonth(1)} aria-label="Next month" className="w-7 h-7 grid place-items-center rounded-lg cursor-pointer transition-colors hover:bg-black/5 dark:hover:bg-white/10" style={{ color: isDark ? 'rgba(255,255,255,0.65)' : 'rgba(0,0,0,0.55)' }}><ChevronRight size={15} /></button>
                                                    </div>
                                                </div>

                                                <div className="grid grid-cols-7 gap-1 text-center">
                                                    {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((d, idx) => (
                                                        <div key={idx} className="text-[10px] font-bold" style={{ color: 'var(--text-muted)' }}>{d}</div>
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
                                                            className="grid grid-cols-7 gap-1"
                                                        >
                                                            {modalCalendarDays.map((date, idx) => {
                                                                const isSelected = date?.toDateString() === editingMeeting.date.toDateString();
                                                                const isToday = date?.toDateString() === new Date().toDateString();
                                                                // Past days stay selectable (unlike the public booking calendar) - they
                                                                // just sit back visually, and saving onto one asks for confirmation.
                                                                const isPast = !!date && isPastDay(date);
                                                                return (
                                                                    <button
                                                                        key={idx}
                                                                        type="button"
                                                                        disabled={!date}
                                                                        onClick={() => date && setEditingMeeting({ ...editingMeeting, date })}
                                                                        title={isPast ? 'This day has already passed' : undefined}
                                                                        className={`relative grid place-items-center aspect-square rounded-lg border-none bg-transparent p-0 ${date ? 'cursor-pointer' : 'pointer-events-none'} ${date && !isSelected ? 'hover:bg-black/5 dark:hover:bg-white/10' : ''}`}
                                                                        style={{ opacity: date ? (isPast && !isSelected ? 0.4 : 1) : 0 }}
                                                                    >
                                                                        {isSelected && date && (
                                                                            <motion.span
                                                                                layoutId="modal-selected-day-bg"
                                                                                initial={false}
                                                                                transition={{ type: "spring", stiffness: 500, damping: 40, mass: 1 }}
                                                                                style={{ position: 'absolute', inset: 0, borderRadius: 8, backgroundColor: '#3b82f6', zIndex: 0 }}
                                                                            />
                                                                        )}
                                                                        <span className="relative z-10 text-xs" style={{
                                                                            color: isSelected ? '#fff' : (isToday ? '#3b82f6' : (isDark ? '#fff' : '#000')),
                                                                            fontWeight: isSelected || isToday ? 700 : 500,
                                                                        }}>
                                                                            {date?.getDate()}
                                                                        </span>
                                                                    </button>
                                                                );
                                                            })}
                                                        </motion.div>
                                                    </AnimatePresence>
                                                </div>

                                                {/* Where this edit actually lands, spelled out. */}
                                                <div className="rounded-xl px-3 py-2.5 mt-auto" style={{ background: isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.03)' }}>
                                                    <div className="text-[11px] font-bold uppercase tracking-wider mb-1" style={{ color: 'var(--text-muted)' }}>Moving to</div>
                                                    <div className="text-sm font-bold leading-snug" style={{ color: isDark ? '#fff' : '#000' }}>
                                                        {editingMeeting.date.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })}
                                                    </div>
                                                    <div className="text-sm font-semibold" style={{ color: '#3b82f6' }}>{editingMeeting.time}</div>
                                                    {isPastDay(editingMeeting.date) && (
                                                        <div className="text-[11px] font-semibold mt-1.5" style={{ color: '#f59e0b' }}>That day has already passed.</div>
                                                    )}
                                                </div>
                                            </div>
                                        </div>
                                    </div>

                                    {/* Footer: the destructive action kept apart from the two safe ones. */}
                                    <div className="px-5 md:px-7 py-4 border-t flex items-center justify-between gap-3 flex-wrap" style={{ borderColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.07)', backgroundColor: isDark ? 'rgba(255,255,255,0.02)' : 'rgba(0,0,0,0.015)' }}>
                                        <button
                                            type="button"
                                            onClick={() => setConfirmDelete(editingMeeting.id)}
                                            className="inline-flex items-center gap-2 px-3 h-10 rounded-xl text-sm font-bold cursor-pointer transition-colors text-red-500 hover:bg-red-500/10"
                                        >
                                            <Trash2 size={16} />
                                            Cancel session
                                        </button>
                                        <div className="flex items-center gap-2 ml-auto">
                                            <button
                                                type="button"
                                                onClick={() => setEditingMeeting(null)}
                                                className="px-4 h-10 rounded-xl font-bold text-sm cursor-pointer transition-colors hover:bg-black/5 dark:hover:bg-white/10"
                                                style={{ color: 'var(--text-muted)' }}
                                            >
                                                Discard
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => handleSaveMeeting()}
                                                disabled={!editDirty}
                                                className="inline-flex items-center gap-2 px-5 h-10 rounded-xl text-white font-bold text-sm cursor-pointer transition-all hover:brightness-110 active:scale-[0.98] disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:brightness-100"
                                                style={{ background: '#3b82f6' }}
                                            >
                                                <Check size={17} strokeWidth={2.5} />
                                                Save changes
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
            {/* Guard on .show, not on the object: useSafeAlert keeps the last alert in state
                and only flips `show` to false, so `{alert && ...}` left the toast mounted for
                good - and a mounted toast keeps re-running its own exit animation. */}
            {alert?.show && <Alert type={alert.type} message={alert.message} onClose={() => hideAlert()} duration={alert.duration ?? 4000} />}
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

            <MConfirmModal
                isOpen={!!confirmDeleteCat}
                title="Delete category"
                message={confirmDeleteCat
                    ? `Delete "${confirmDeleteCat.name}"? ${meetings.filter(m => m.category === confirmDeleteCat.id).length} booking(s) using it will go back to Personal. The bookings themselves are kept.`
                    : ''}
                type="danger"
                confirmText="Delete category"
                onConfirm={() => {
                    if (confirmDeleteCat) deleteCategory(confirmDeleteCat);
                    setConfirmDeleteCat(null);
                }}
                onClose={() => setConfirmDeleteCat(null)}
            />

            {/* Rescheduling backwards in time - allowed, but never by accident. */}
            <MConfirmModal
                isOpen={confirmPastSave}
                title="Reschedule to a past date"
                message={editingMeeting
                    ? `${editingMeeting.date.toLocaleDateString('default', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })} at ${editingMeeting.time} has already passed. Save this session there anyway?`
                    : ''}
                type="warning"
                confirmText="Reschedule anyway"
                onConfirm={() => {
                    setConfirmPastSave(false);
                    handleSaveMeeting(true);
                }}
                onClose={() => setConfirmPastSave(false)}
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
