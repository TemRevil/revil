import { useState, useMemo, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
    ChevronLeft,
    ChevronRight,
    Calendar as CalendarIcon,
    Clock,
    Edit2,
    X,
    Check,
    Plus,
    Trash2,
    AlertCircle
} from 'lucide-react';
import { doc, onSnapshot, updateDoc, deleteField } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import MContact from '../M-Contact';
import Alert, { AlertType } from '../Alert';
import MConfirmModal from './M-ConfirmModal';

const GOOGLE_SCRIPT_URL = "https://script.google.com/macros/s/AKfycbzJZ8765KTWuky_Gg6ZiRXFGm1EFs0_a-IHUkz2MYvBepPp2VE9CnWKVaJ1Q-xArAk/exec";

interface Meeting {
    id: string;
    title: string;
    time: string;
    date: Date;
    email?: string;
    link?: string;
    reason?: string;
    userTimezone?: number;
}



const TIME_OPTIONS = [
    "09:00 AM", "10:00 AM", "11:00 AM", "12:00 PM",
    "02:00 PM", "03:00 PM", "04:00 PM", "05:00 PM"
];

const MONTHS = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December"
];

const DCanary = () => {
    const [isDark, setIsDark] = useState(false);
    const [viewDate, setViewDate] = useState(new Date());
    const [selectedDate, setSelectedDate] = useState<Date>(new Date());
    const [direction, setDirection] = useState(0);

    const [editingMeeting, setEditingMeeting] = useState<Meeting | null>(null);
    const [isBookingOpen, setIsBookingOpen] = useState(false);
    const [modalDirection, setModalDirection] = useState(0);
    const [modalViewDate, setModalViewDate] = useState(new Date());
    const [windowWidth, setWindowWidth] = useState(typeof window !== 'undefined' ? window.innerWidth : 1200);
    const [meetings, setMeetings] = useState<Meeting[]>([]);
    const [alert, setAlert] = useState<{ type: AlertType; message: string } | null>(null);
    const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

    // Firestore Integration
    useEffect(() => {
        const unsubscribe = onSnapshot(doc(db, 'Settings', 'Canary'), (snapshot) => {
            if (snapshot.exists()) {
                const data = snapshot.data();
                const meetingsMap = data.Meetings || {};
                const meetingsList: Meeting[] = Object.entries(meetingsMap).map(([id, m]: [string, any]) => {
                    const [d, mon, y] = m.Date.split('/').map(Number);
                    const reason = m["What For"] || '';

                    return {
                        id,
                        title: m.Name || 'Untitled Session',
                        time: m.Time,
                        date: new Date(y, mon - 1, d),
                        email: m.Email,
                        link: m.MeetingLink,
                        reason: m["What For"],
                        userTimezone: m.UserTimezone || -(new Date().getTimezoneOffset() / 60)
                    };
                });
                setMeetings(meetingsList);
            }
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

    const calendarDays = useMemo(() => {
        const year = viewDate.getFullYear();
        const month = viewDate.getMonth();
        const firstDayOfMonth = new Date(year, month, 1).getDay();
        const daysInMonth = new Date(year, month + 1, 0).getDate();
        const days = [];
        for (let i = 0; i < firstDayOfMonth; i++) { days.push(null); }
        for (let i = 1; i <= daysInMonth; i++) { days.push(new Date(year, month, i)); }

        // Pad to ensure exactly 42 days (6 rows)
        while (days.length < 42) { days.push(null); }
        return days;
    }, [viewDate]);

    const changeMonth = (delta: number) => {
        setDirection(delta);
        setViewDate(new Date(viewDate.getFullYear(), viewDate.getMonth() + delta, 1));
    };

    const handleMonthSelect = (monthIdx: number) => {
        setDirection(monthIdx > viewDate.getMonth() ? 1 : -1);
        setViewDate(new Date(viewDate.getFullYear(), monthIdx, 1));
    };

    const handleYearSelect = (year: number) => {
        setDirection(year > viewDate.getFullYear() ? 1 : -1);
        setViewDate(new Date(year, viewDate.getMonth(), 1));
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
        try {
            // 1. Delete from Firestore
            const docRef = doc(db, 'Settings', 'Canary');
            await updateDoc(docRef, {
                [`Meetings.${id}`]: deleteField()
            });

            // 2. Sync with Google Calendar (Async)
            if (meeting?.email && meeting?.date && meeting?.time) {
                const tz = meeting.userTimezone ?? -(new Date().getTimezoneOffset() / 60);
                const timeParts = meeting.time.split(' ');
                const [hStr, mStr] = timeParts[0].split(':');
                let h = parseInt(hStr);
                if (timeParts[1] === 'PM' && h !== 12) h += 12;
                if (timeParts[1] === 'AM' && h === 12) h = 0;

                const start = new Date(Date.UTC(meeting.date.getFullYear(), meeting.date.getMonth(), meeting.date.getDate(), h, parseInt(mStr)) - (tz * 3600000));

                fetch(GOOGLE_SCRIPT_URL, {
                    method: "POST",
                    body: JSON.stringify({
                        action: 'cancel',
                        email: meeting.email,
                        startTime: start.toISOString()
                    })
                }).catch(err => console.error("Google Sync Delete Error:", err));
            }

            setAlert({ type: 'success', message: 'Session cancelled successfully' });
        } catch (error) {
            console.error(error);
            setAlert({ type: 'error', message: 'Failed to cancel session' });
        }
    };

    const handleSaveMeeting = async () => {
        if (!editingMeeting) return;

        // 0. Find Original Meeting (for Google Sync and Change Detection)
        const originalMeeting = meetings.find(m => m.id === editingMeeting.id);
        if (!originalMeeting) return;

        // Check if anything actually changed
        const isTimeChanged = editingMeeting.time !== originalMeeting.time;
        const isDateChanged = editingMeeting.date.toDateString() !== originalMeeting.date.toDateString();
        const isTitleChanged = editingMeeting.title !== originalMeeting.title;

        if (!isTimeChanged && !isDateChanged && !isTitleChanged) {
            setEditingMeeting(null);
            return;
        }

        // Collision Check (only if date or time changed)
        if (isTimeChanged || isDateChanged) {
            const isOccupied = meetings.some(m =>
                m.id !== editingMeeting.id &&
                m.date.toDateString() === editingMeeting.date.toDateString() &&
                m.time === editingMeeting.time
            );

            if (isOccupied) {
                setAlert({ type: 'warning', message: 'This time slot is already occupied.' });
                return;
            }
        }

        try {
            // 1. Update Firestore
            const docRef = doc(db, 'Settings', 'Canary');
            const day = editingMeeting.date.getDate().toString().padStart(2, '0');
            const mon = (editingMeeting.date.getMonth() + 1).toString().padStart(2, '0');
            const y = editingMeeting.date.getFullYear();
            const dateStr = `${day}/${mon}/${y}`;

            await updateDoc(docRef, {
                [`Meetings.${editingMeeting.id}.Date`]: dateStr,
                [`Meetings.${editingMeeting.id}.Time`]: editingMeeting.time,
                [`Meetings.${editingMeeting.id}.Name`]: editingMeeting.title
            });

            // 2. Sync with Google Calendar (Delete and Create for reliability)
            if (editingMeeting.email) {
                const tz = editingMeeting.userTimezone ?? -(new Date().getTimezoneOffset() / 60);

                // --- 1. DELETE OLD VERSION ---
                const oldTimeParts = originalMeeting.time.split(' ');
                const [oldHStr, oldMStr] = oldTimeParts[0].split(':');
                let oldH = parseInt(oldHStr);
                if (oldTimeParts[1] === 'PM' && oldH !== 12) oldH += 12;
                if (oldTimeParts[1] === 'AM' && oldH === 12) oldH = 0;
                const oldStart = new Date(Date.UTC(originalMeeting.date.getFullYear(), originalMeeting.date.getMonth(), originalMeeting.date.getDate(), oldH, parseInt(oldMStr)) - (tz * 3600000));

                fetch(GOOGLE_SCRIPT_URL, {
                    method: "POST",
                    body: JSON.stringify({
                        action: 'cancel',
                        email: editingMeeting.email,
                        startTime: oldStart.toISOString()
                    })
                }).then(() => {
                    // --- 2. CREATE NEW VERSION (After delete attempt) ---
                    const timeParts = editingMeeting.time.split(' ');
                    const [hStr, mStr] = timeParts[0].split(':');
                    let h = parseInt(hStr);
                    if (timeParts[1] === 'PM' && h !== 12) h += 12;
                    if (timeParts[1] === 'AM' && h === 12) h = 0;

                    const start = new Date(Date.UTC(editingMeeting.date.getFullYear(), editingMeeting.date.getMonth(), editingMeeting.date.getDate(), h, parseInt(mStr)) - (tz * 3600000));
                    const end = new Date(start.getTime() + 3600000);

                    fetch(GOOGLE_SCRIPT_URL, {
                        method: "POST",
                        body: JSON.stringify({
                            name: editingMeeting.title,
                            email: editingMeeting.email,
                            reason: editingMeeting.reason || '',
                            startTime: start.toISOString(),
                            endTime: end.toISOString()
                        })
                    }).catch(err => console.error("Google Create Sync Error:", err));
                }).catch(err => console.error("Google Cancel Sync Error:", err));
            }

            setEditingMeeting(null);
            setAlert({ type: 'success', message: 'Session rescheduled successfully' });
        } catch (error) {
            console.error(error);
            setAlert({ type: 'error', message: 'Failed to update session' });
        }
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

        // Pad to ensure exactly 42 days (6 rows)
        while (days.length < 42) { days.push(null); }
        return days;
    }, [modalViewDate]);

    const variants = {
        enter: (d: number) => ({ x: d > 0 ? '50%' : '-50%', opacity: 0 }),
        center: { x: 0, opacity: 1 },
        exit: (d: number) => ({ x: d > 0 ? '-50%' : '50%', opacity: 0 })
    };

    const containerBg = isDark ? '#00000040' : '#ffffff59';

    return (
        <div className="w-full" style={{ opacity: 1 }}>
            <div className="grid grid-cols-1 min-[960px]:grid-cols-[1.8fr_1fr] gap-8">
                {/* Left: Calendar Component */}
                <div className="w-full h-full min-h-[500px] min-[960px]:min-h-[700px] flex flex-col gap-4 min-[460px]:gap-6 p-4 min-[460px]:p-8 rounded-[24px] min-[460px]:rounded-[32px] border shadow-sm relative overflow-visible"
                    style={{
                        backgroundColor: containerBg,
                        borderColor: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.05)',
                        backdropFilter: 'blur(20px)'
                    }}>
                    <div className="absolute top-0 right-0 w-64 h-64 bg-blue-500/5 blur-[100px] rounded-full" />

                    {/* Integrated Navigation Inside Box */}
                    <div className="flex items-center justify-between relative z-10 mb-4">
                        <div className="flex flex-col">
                            <span className="text-[10px] font-black uppercase tracking-[0.25em] text-blue-500/80 mb-2">Calendar Navigation</span>
                            <div className="flex items-center gap-4">
                                <h3 className="text-2xl font-bold m-0" style={{ color: isDark ? '#fff' : '#000' }}>
                                    {MONTHS[viewDate.getMonth()]} {viewDate.getFullYear()}
                                </h3>
                                <div className="flex items-center gap-1 p-1 rounded-xl bg-black/5 dark:bg-white/5 border border-white/5">
                                    <select
                                        value={viewDate.getMonth()}
                                        onChange={(e) => handleMonthSelect(parseInt(e.target.value))}
                                        className="bg-transparent border-none font-bold text-[10px] uppercase tracking-wider text-center outline-none cursor-pointer appearance-none px-2"
                                        style={{ color: isDark ? 'rgba(255,255,255,0.4)' : 'rgba(0,0,0,0.4)' }}
                                    >
                                        {MONTHS.map((m, i) => (
                                            <option key={m} value={i} style={{ backgroundColor: isDark ? '#1a1a1a' : '#fff' }}>{m.substring(0, 3)}</option>
                                        ))}
                                    </select>
                                    <div className="w-[1px] h-3 bg-white/10" />
                                    <select
                                        value={viewDate.getFullYear()}
                                        onChange={(e) => handleYearSelect(parseInt(e.target.value))}
                                        className="bg-transparent border-none font-bold text-[10px] uppercase tracking-wider text-center outline-none cursor-pointer appearance-none px-2"
                                        style={{ color: isDark ? 'rgba(255,255,255,0.4)' : 'rgba(0,0,0,0.4)' }}
                                    >
                                        {[2024, 2025, 2026, 2027, 2028].map(y => (
                                            <option key={y} value={y} style={{ backgroundColor: isDark ? '#1a1a1a' : '#fff' }}>{y}</option>
                                        ))}
                                    </select>
                                </div>
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
                <div className="flex flex-col gap-4 min-[460px]:gap-6 p-4 min-[460px]:p-8 rounded-[24px] min-[460px]:rounded-[32px] border shadow-sm h-full min-h-[500px] min-[960px]:min-h-[700px]"
                    style={{
                        backgroundColor: containerBg,
                        borderColor: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.05)',
                        backdropFilter: 'blur(20px)'
                    }}>
                    <div className="flex flex-col gap-2">
                        <span className="text-[10px] font-black uppercase tracking-[0.25em] text-blue-500/80">Selected Schedule</span>
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
                                    className="p-4 rounded-2xl border transition-all hover:translate-x-1"
                                    style={{
                                        borderColor: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.05)',
                                        backgroundColor: isDark ? 'rgba(0,0,0,0.2)' : 'rgba(255,255,255,0.4)'
                                    }}
                                >
                                    <div className="flex items-start justify-between">
                                        <div className="flex items-center gap-3">
                                            <div className="flex flex-col gap-1">
                                                <h4 className="text-sm font-bold m-0" style={{ color: isDark ? '#fff' : '#000' }}>{meeting.title}</h4>
                                                <div className="flex items-center gap-2 text-[11px] font-medium" style={{ color: isDark ? 'rgba(255,255,255,0.5)' : 'rgba(0,0,0,0.5)' }}>
                                                    <div className="flex items-center gap-1.5 p-1 rounded-md bg-black/5 dark:bg-white/5">
                                                        <Clock size={12} className="opacity-70" />
                                                        <span>{meeting.time}</span>
                                                    </div>
                                                    <span className="opacity-40 italic font-normal line-clamp-1">{meeting.reason || 'No description'}</span>
                                                </div>
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-1">
                                            <button
                                                onClick={() => handleReschedule(meeting)}
                                                className="p-2 hover:bg-black/5 dark:hover:bg-white/5 rounded-lg transition-all"
                                                style={{ color: isDark ? 'rgba(255,255,255,0.4)' : 'rgba(0,0,0,0.4)' }}
                                            >
                                                <Edit2 size={14} />
                                            </button>
                                            <button
                                                onClick={() => setConfirmDelete(meeting.id)}
                                                className="p-2 hover:bg-red-500/10 rounded-lg transition-all group"
                                            >
                                                <Trash2 size={14} className="text-red-500/60 group-hover:text-red-500" />
                                            </button>
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

            {/* Modal */}
            {typeof document !== 'undefined' && createPortal(
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
            )}


            {/* Confirmation & Feedback */}
            {alert && <Alert type={alert.type} message={alert.message} onClose={() => setAlert(null)} />}
            <MConfirmModal
                isOpen={!!confirmDelete}
                title="Cancel Session"
                message="Are you sure you want to cancel this session? This action cannot be undone."
                type="danger"
                confirmText="Cancel Session"
                onConfirm={() => {
                    if (confirmDelete) {
                        const meeting = meetings.find(m => m.id === confirmDelete);
                        handleDelete(confirmDelete, meeting);
                        setConfirmDelete(null);
                        setEditingMeeting(null); // Close modal after confirming delete
                    }
                }}
                onClose={() => setConfirmDelete(null)}
            />

            {/* Specialized Booking Modal */}
            <AnimatePresence>
                {isBookingOpen && (
                    <MContact
                        onClose={() => setIsBookingOpen(false)}
                        initialTab="meeting"
                        hideTabs={true}
                    />
                )}
            </AnimatePresence>
        </div>
    );
};

export default DCanary;