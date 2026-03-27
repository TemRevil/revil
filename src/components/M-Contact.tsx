import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Send, Paperclip, User, Phone, MessageSquare, Check, Mail, Calendar, Clock, ChevronLeft, ChevronRight, AlertCircle, Globe } from 'lucide-react';
import { doc, updateDoc, onSnapshot, getDoc } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { httpsCallable } from 'firebase/functions';
import { db, storage, functions } from '../lib/firebase';
import Alert from './Alert'; // Import Custom Alert
import useSafeAlert from '../hooks/useSafeAlert';

interface Meeting {
  Date: string;
  Time: string;
  Name: string;
  Email: string;
  Reason?: string;
  "What For"?: string;
  dateObj: Date;
  MeetingLink?: string;
  GoogleEventId?: string;
  UserLocalTime?: string;
  UserTimezone?: number;
  timestamp?: number;
}

interface MeetingFunctionResponse {
  status: string;
  message?: string;
  link?: string;
  id?: string;
}

const timezones = [
  { label: 'UTC-12:00', value: -12 },
  { label: 'UTC-11:00', value: -11 },
  { label: 'UTC-10:00', value: -10 },
  { label: 'UTC-09:00', value: -9 },
  { label: 'UTC-08:00 (PST)', value: -8 },
  { label: 'UTC-07:00 (MST)', value: -7 },
  { label: 'UTC-06:00 (CST)', value: -6 },
  { label: 'UTC-05:00 (EST)', value: -5 },
  { label: 'UTC-04:00', value: -4 },
  { label: 'UTC-03:00', value: -3 },
  { label: 'UTC-02:00', value: -2 },
  { label: 'UTC-01:00', value: -1 },
  { label: 'UTC+00:00 (GMT)', value: 0 },
  { label: 'UTC+01:00 (CET)', value: 1 },
  { label: 'UTC+02:00 (EET)', value: 2 },
  { label: 'UTC+03:00 (MSK)', value: 3 },
  { label: 'UTC+04:00', value: 4 },
  { label: 'UTC+05:00', value: 5 },
  { label: 'UTC+05:30 (IST)', value: 5.5 },
  { label: 'UTC+06:00', value: 6 },
  { label: 'UTC+07:00', value: 7 },
  { label: 'UTC+08:00 (CST)', value: 8 },
  { label: 'UTC+09:00 (JST)', value: 9 },
  { label: 'UTC+10:00 (AEST)', value: 10 },
  { label: 'UTC+11:00', value: 11 },
  { label: 'UTC+12:00 (NZST)', value: 12 },
];

interface MContactProps {
  isOpen: boolean;
  onClose: () => void;
  initialTab?: 'message' | 'meeting';
  hideTabs?: boolean;
}

const MContact = ({ onClose, initialTab = 'meeting', hideTabs = false }: Omit<MContactProps, 'isOpen'>) => {
  const [isDark, setIsDark] = useState(false);
  const [formData, setFormData] = useState({
    name: '',
    email: '', // Added email field for message form
    number: '',
    hasWhatsapp: false,
    message: '',
    attachments: [] as File[],
  });

  // Meeting State
  const [activeTab, setActiveTab] = useState<'message' | 'meeting'>(initialTab);
  const [calendarDate, setCalendarDate] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState<Date | null>(new Date());
  const [selectedTime, setSelectedTime] = useState<string | null>(null);
  const [direction, setDirection] = useState(0);
  const [meetingData, setMeetingData] = useState({
    name: '',
    email: '',
    reason: ''
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [existingMeetings, setExistingMeetings] = useState<Meeting[]>([]);
  const [bookingSuccess, setBookingSuccess] = useState<{ date: string, time: string, link: string } | null>(null);
  const [showNameTooltip, setShowNameTooltip] = useState(false);
  const [showEmailTooltip, setShowEmailTooltip] = useState(false);
  const { alert, showAlert, hideAlert } = useSafeAlert(4000);
  const [isMobile, setIsMobile] = useState(window.innerWidth < 768);

  // Timezone States
  const [hostTimezoneString, setHostTimezoneString] = useState('UTC+02:00 (EET)'); // Default
  const [userTimezone, setUserTimezone] = useState<number>(() => {
    // Detect system timezone offset in hours
    return -(new Date().getTimezoneOffset() / 60);
  });
  const [isTimezoneDropdownOpen, setIsTimezoneDropdownOpen] = useState(false);
  const [showTzTooltip, setShowTzTooltip] = useState(false);
  const tzRef = useRef<HTMLDivElement>(null);

  // Close timezone dropdown on click outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (tzRef.current && !tzRef.current.contains(e.target as Node)) {
        setIsTimezoneDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Auto-clear success message when date changes
  useEffect(() => {
    // Clear any previous booking success when date changes
    setBookingSuccess(null);
  }, [selectedDate]);

  // Calendar Helpers
  const getDaysInMonth = (date: Date) => {
    const year = date.getFullYear();
    const month = date.getMonth();
    const days = new Date(year, month + 1, 0).getDate();
    const firstDay = new Date(year, month, 1).getDay();
    return { days, firstDay };
  };

  const timeSlots = useMemo(() => [
    '09:00 AM', '10:00 AM', '11:00 AM', '12:00 PM',
    '02:00 PM', '03:00 PM', '04:00 PM', '05:00 PM'
  ], []);

  // Sync Host Availability & Timezone
  useEffect(() => {
    const unsubscribeAvailability = onSnapshot(doc(db, 'Settings', 'Availability'), (snap) => {
      if (snap.exists()) {
        const data = snap.data();
        if (data['Current Time']) {
          setHostTimezoneString(data['Current Time']);
        }
      }
    });

    const unsubscribeMeetings = onSnapshot(doc(db, 'Settings', 'Canary'), (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data();
        const meetingsMap = (data.Meetings || {}) as Record<string, Partial<Meeting>>;
        const meetingsList = Object.values(meetingsMap).map((m): Meeting => ({
          Date: m.Date || '',
          Time: m.Time || '',
          Name: m.Name || '',
          Email: m.Email || '',
          Reason: m.Reason || m["What For"] || '',
          dateObj: new Date(m.Date || Date.now()),
          MeetingLink: m.MeetingLink,
          GoogleEventId: m.GoogleEventId,
          UserLocalTime: m.UserLocalTime,
          UserTimezone: m.UserTimezone,
          timestamp: m.timestamp
        }));
        setExistingMeetings(meetingsList);
      }
    });

    return () => {
      unsubscribeAvailability();
      unsubscribeMeetings();
    };
  }, []);

  const formatDateDDMMYYYY = useCallback((date: Date) => {
    const day = date.getDate().toString().padStart(2, '0');
    const month = (date.getMonth() + 1).toString().padStart(2, '0');
    const year = date.getFullYear();
    return `${day}/${month}/${year}`;
  }, []);

  const getMeetingsForDate = useCallback((date: Date) => {
    const dateStr = formatDateDDMMYYYY(date);
    return existingMeetings.filter(m => m.Date === dateStr);
  }, [existingMeetings, formatDateDDMMYYYY]);

  // Time Helpers
  const getOffsetFromUTCString = (tzStr: string) => {
    const match = tzStr.match(/UTC([+-]\d{2}):(\d{2})/);
    if (!match) return 0;
    const hours = parseInt(match[1]);
    const minutes = parseInt(match[2]);
    return hours + (minutes / 60) * (hours < 0 ? -1 : 1);
  };

  const hostOffset = getOffsetFromUTCString(hostTimezoneString);
  const offsetDiff = userTimezone - hostOffset;

  // Convert "09:00 AM" strings to User's Perspective
  const convertTimeToUser = (hostTimeStr: string) => {
    const [time, period] = hostTimeStr.split(' ');
    const [h, mins] = time.split(':').map(Number);
    let hour = Number.isNaN(h) ? 0 : h;
    const minute = Number.isNaN(mins) ? 0 : mins;
    if (period === 'PM' && hour !== 12) hour += 12;
    if (period === 'AM' && hour === 12) hour = 0;

    let totalMinutes = hour * 60 + minute + offsetDiff * 60;
    // Normalize to 24h
    totalMinutes = (totalMinutes + 1440) % 1440;

    const newH = Math.floor(totalMinutes / 60);
    const newM = totalMinutes % 60;
    const newPeriod = newH >= 12 ? 'PM' : 'AM';
    const displayH = newH % 12 || 12;
    return `${displayH.toString().padStart(2, '0')}:${newM.toString().padStart(2, '0')} ${newPeriod}`;
  };

  // Convert User's Selected Slot back to Host's Perspective for Saving/Checking
  const convertTimeToHost = (userTimeStr: string) => {
    const [time, period] = userTimeStr.split(' ');
    const [h, mins] = time.split(':').map(Number);
    let hour = Number.isNaN(h) ? 0 : h;
    const minute = Number.isNaN(mins) ? 0 : mins;
    if (period === 'PM' && hour !== 12) hour += 12;
    if (period === 'AM' && hour === 12) hour = 0;

    let totalMinutes = hour * 60 + minute - offsetDiff * 60;
    totalMinutes = (totalMinutes + 1440) % 1440;

    const newH = Math.floor(totalMinutes / 60);
    const newM = totalMinutes % 60;
    const newPeriod = newH >= 12 ? 'PM' : 'AM';
    const displayH = newH % 12 || 12;
    return `${displayH.toString().padStart(2, '0')}:${newM.toString().padStart(2, '0')} ${newPeriod}`;
  };

  const convertTimeToUserCb = useCallback(convertTimeToUser, [offsetDiff]);

  // Converted slots for the UI
  const convertedSlots = useMemo(() => timeSlots.map(convertTimeToUserCb), [timeSlots, convertTimeToUserCb]);

  // Check if a time slot has already passed
  const isTimePassed = useCallback((date: Date, hostTimeStr: string) => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const checkDate = new Date(date);
    checkDate.setHours(0, 0, 0, 0);

    if (checkDate > today) return false;
    if (checkDate < today) return true;

    // It's today, check the hour
    const [time, period] = hostTimeStr.split(' ');
    let [h] = time.split(':').map(Number);
    if (period === 'PM' && h !== 12) h += 12;
    if (period === 'AM' && h === 12) h = 0;

    // Get current time in host's perspective
    const now = new Date();
    const utc = now.getTime() + (now.getTimezoneOffset() * 60000);
    const hostNow = new Date(utc + (3600000 * hostOffset));

    const slotTime = h * 60 + (typeof (time.split(':').map(Number)[1]) === 'number' ? time.split(':').map(Number)[1] : 0);
    const currentTime = hostNow.getHours() * 60 + hostNow.getMinutes();

    // Add 30 mins buffer so they don't book a meeting starting "right now"
    return currentTime + 30 > slotTime;
  }, [hostOffset]);

  // Automatically find the next available day ONCE on initialization or when switching to meeting tab
  const hasAutoMoved = useRef(false);
  useEffect(() => {
    if (!selectedDate || activeTab !== 'meeting' || hasAutoMoved.current) return;

    const checkAvailable = (date: Date) => {
      return timeSlots.some((hostTime) => {
        const isBusy = getMeetingsForDate(date).some(m => m.Time === hostTime);
        const passed = isTimePassed(date, hostTime);
        return !isBusy && !passed;
      });
    };

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    if (selectedDate < today || !checkAvailable(selectedDate)) {
      let searchDate = new Date(selectedDate);
      if (searchDate < today) searchDate = new Date(today);

      let found = false;
      for (let i = 0; i < 30; i++) {
        if (checkAvailable(searchDate)) {
          found = true;
          break;
        }
        searchDate.setDate(searchDate.getDate() + 1);
      }

      if (found && searchDate.toDateString() !== selectedDate.toDateString()) {
        setSelectedDate(searchDate);
        setCalendarDate(searchDate);
      }
    }
    hasAutoMoved.current = true;
  }, [existingMeetings, hostTimezoneString, selectedDate, timeSlots, getMeetingsForDate, isTimePassed, activeTab]);

  // Reset auto-move flag when modal closes (if it was an external state) or handle it inside the component
  useEffect(() => {
    return () => { hasAutoMoved.current = false; };
  }, []);

  // --- THIS IS THE FIXED FUNCTION ---
  const handleMeetingSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // Basic Validation
    if (!selectedDate || !selectedTime) return;
    if (!meetingData.email || !meetingData.email.includes('@')) {
      showAlert({ type: 'error', message: "Please enter a valid email address." }); // Custom Alert
      return;
    }

    setIsSubmitting(true);

    try {
      // 1. Calculate Timestamps (UTC Based on Selected Timezone)
      const timeParts = selectedTime.split(' ');
      const [hoursStr, minutesStr] = timeParts[0].split(':');
      let hours = parseInt(hoursStr);
      const minutes = parseInt(minutesStr);
      const isPM = timeParts[1] === 'PM';

      if (isPM && hours !== 12) hours += 12;
      if (!isPM && hours === 12) hours = 0;

      // Construct a Date object in UTC
      // selectedDate is local Date, we only need y/m/d from it
      const y = selectedDate.getFullYear();
      const m = selectedDate.getMonth();
      const d = selectedDate.getDate();

      // Start time in UTC = (local hours - userOffset)
      const startDateUTC = new Date(Date.UTC(y, m, d, hours, minutes) - (userTimezone * 3600000));
      const endDateUTC = new Date(startDateUTC.getTime() + 3600000); // 1 hour later

      // 2. Call Firebase Function
      const syncMeeting = httpsCallable(functions, 'syncMeeting');
      const response = await syncMeeting({
        name: meetingData.name,
        email: meetingData.email.trim(), // Trim whitespace!
        reason: meetingData.reason,
        startTime: startDateUTC.toISOString(),
        endTime: endDateUTC.toISOString()
      });

      const result = response.data as MeetingFunctionResponse;

      if (result.status === 'error') {
        throw new Error(result.message);
      }

      // 3. Get the Meet Link and Event ID
      const meetLink = result.link;
      const googleEventId = result.id;

      // 4. Save to Firebase
      const docRef = doc(db, 'Settings', 'Canary');
      const docSnap = await getDoc(docRef);

      let nextId = "1";
      if (docSnap.exists()) {
        const data = docSnap.data();
        const meetings = data.Meetings || {};
        const keys = Object.keys(meetings).map(k => parseInt(k, 10)).filter(k => !isNaN(k));
        if (keys.length > 0) nextId = (Math.max(...keys) + 1).toString();
      }

      const dateStr = formatDateDDMMYYYY(selectedDate);
      // Save it in the host's perspective so they see it in their local time in their dashboard
      const hostPerspecTime = convertTimeToHost(selectedTime);

      const payload = {
        Date: dateStr,
        Time: hostPerspecTime,
        UserLocalTime: selectedTime,
        UserTimezone: userTimezone,
        Email: meetingData.email.trim(),
        "What For": meetingData.reason,
        Name: meetingData.name,
        timestamp: Date.now(),
        MeetingLink: meetLink,
        GoogleEventId: googleEventId // Store the ID for reliable deletion/updates
      };


      await updateDoc(docRef, { [`Meetings.${nextId}`]: payload });

      setBookingSuccess({ date: dateStr, time: selectedTime || '', link: meetLink || '' });
      setMeetingData({ name: '', email: '', reason: '' });

    } catch (error: unknown) {
      console.error("Booking Error", error);
      // Clean up error message for UI
      const err = error as { message?: string };
      const msg = err.message?.includes("Invalid attendee email")
        ? "Invalid Email Address provided."
        : (err.message || "Could not book meeting");
      showAlert({ type: 'error', message: msg });
    } finally {
      setIsSubmitting(false);
    }
  };

  useEffect(() => {
    const checkTheme = () => {
      setIsDark(document.documentElement.classList.contains('dark'));
    };
    checkTheme();
    const observer = new MutationObserver(checkTheme);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
    return () => observer.disconnect();
  }, []);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      const newFiles = Array.from(e.target.files);
      setFormData(prev => ({
        ...prev,
        attachments: [...prev.attachments, ...newFiles]
      }));
    }
  };

  const removeFile = (index: number) => {
    setFormData(prev => ({
      ...prev,
      attachments: prev.attachments.filter((_, i) => i !== index)
    }));
  };

  // Updated Message Submit Handler
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // Validate
    if (!formData.name || !formData.email || !formData.message) {
      showAlert({ type: 'warning', message: "Please fill in all required fields (Name, Email, Message)." });
      return;
    }
    if (!formData.email.includes('@')) {
      showAlert({ type: 'warning', message: "Please enter a valid email address." });
      return;
    }

    setIsSubmitting(true);

    try {
      const docRef = doc(db, 'Settings', 'Canary');
      const docSnap = await getDoc(docRef);

      let nextId = "1";
      if (docSnap.exists()) {
        const data = docSnap.data();
        const emails = data.Emails || {};
        const keys = Object.keys(emails).map(k => parseInt(k, 10)).filter(k => !isNaN(k));
        if (keys.length > 0) nextId = (Math.max(...keys) + 1).toString();
      }

      // Handle File Uploads
      const uploadedFiles = [];
      if (formData.attachments.length > 0) {
        for (const file of formData.attachments) {
          const fileRef = ref(storage, `emails/${nextId}/${file.name}`);
          const snapshot = await uploadBytes(fileRef, file);
          const downloadURL = await getDownloadURL(snapshot.ref);
          uploadedFiles.push({ name: file.name, url: downloadURL });
        }
      }

      const payload = {
        Name: formData.name,
        Email: formData.email,
        "Files Attached": uploadedFiles,
        Message: formData.message,
        Number: formData.number,
        Whatsapp: formData.hasWhatsapp,
        Timestamp: Date.now()
      };

      await updateDoc(docRef, { [`Emails.${nextId}`]: payload });

      showAlert({ type: 'success', message: "Message sent! I'll get back to you soon." });
      setFormData({
        name: '',
        email: '',
        number: '',
        hasWhatsapp: false,
        message: '',
        attachments: [],
      });
      setTimeout(onClose, 2000);

    } catch (error) {
      console.error("Error sending message:", error);
      showAlert({ type: 'error', message: "Failed to send message. Please try again." });
    } finally {
      setIsSubmitting(false);
    }
  };

  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    document.addEventListener('keydown', handleEscape);
    document.body.style.overflow = 'hidden';

    return () => {
      document.removeEventListener('keydown', handleEscape);
      document.body.style.overflow = 'unset';
    };
  }, [onClose]);


  return createPortal(
    <>
      {alert?.show && <Alert type={alert.type} message={alert.message} onClose={() => hideAlert()} duration={alert.duration ?? 4000} />}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.2, ease: [0.4, 0, 0.2, 1] }}
        style={{
          position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.3)', // Slightly lighter overlay
          backdropFilter: 'blur(8px)', WebkitBackdropFilter: 'blur(8px)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1400, padding: '1rem',
        }} onClick={onClose}>
        <motion.div
          initial={{ opacity: 0, scale: 0.3, y: 400 }}
          animate={{
            opacity: 1,
            scale: 1,
            y: 0,
            width: isMobile ? '90vw' : (activeTab === 'meeting' ? '1100px' : '600px'),
            height: isMobile ? '90dvh' : (activeTab === 'meeting' ? '720px' : '680px'),
          }}
          exit={{ opacity: 0, scale: 0.3, y: 400 }}
          transition={{
            type: 'spring',
            damping: 30,
            stiffness: 350,
            mass: 1,
            // Allow width and height to have a slightly smoother transition if desired
            width: { duration: 0.4, ease: [0.4, 0, 0.2, 1] },
            height: { duration: 0.4, ease: [0.4, 0, 0.2, 1] }
          }}
          className="glass-panel-deep"
          style={{
            maxWidth: isMobile ? '90vw' : '95vw',
            maxHeight: isMobile ? '90dvh' : '92vh',
            transformOrigin: 'bottom center',
            overflow: 'hidden',
            borderRadius: isMobile ? '0' : '24px',
            display: 'flex',
            flexDirection: 'column',
            pointerEvents: 'auto'
          }}
          onClick={(e) => e.stopPropagation()}
        >
          {/* Internal background elements */}
          <div className="absolute inset-0 bg-gradient-to-b from-black/[0.04] dark:from-white/[0.04] to-transparent pointer-events-none -z-10" />

          {/* Main Content Wrapper (Fixed Header/Tabs, Internal Scroll) */}
          <div className="flex flex-col flex-1 overflow-hidden" style={{ overscrollBehavior: 'contain' }}>

            {/* Header & Tabs */}
            <div className="p-6 pb-0 flex flex-col gap-4">
              <div className="flex-row-between mb-6">
                <div className="flex items-center gap-3">
                  <motion.div
                    layoutId="contact-icon"
                    className="flex items-center justify-center"
                    transition={{
                      type: 'spring',
                      damping: 30,
                      stiffness: 350,
                      mass: 1
                    }}
                  >
                    <Mail size={24} strokeWidth={2} />
                  </motion.div>
                  <h2 className="heading-md m-0 font-bold" style={{ fontSize: '1.5rem' }}>
                    Contact Me
                  </h2>
                </div>
                <button
                  onClick={onClose}
                  className="btn-icon rounded-full"
                  onMouseEnter={(e) => {
                    e.currentTarget.style.backgroundColor = isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0, 0, 0, 0.05)';
                    e.currentTarget.style.color = 'var(--text-primary)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.backgroundColor = 'transparent';
                    e.currentTarget.style.color = 'var(--text-muted)';
                  }}
                >
                  <X size={20} />
                </button>
              </div>

              {/* Tabs */}
              {!hideTabs && (
                <div className="tabs-container mb-6">
                  <button
                    onClick={() => setActiveTab('meeting')}
                    className={`tab-item ${activeTab === 'meeting' ? 'active' : ''}`}
                  >
                    <Calendar size={16} /> Book a Call
                  </button>
                  <button
                    onClick={() => setActiveTab('message')}
                    className={`tab-item ${activeTab === 'message' ? 'active' : ''}`}
                  >
                    <MessageSquare size={16} /> Message
                  </button>
                </div>
              )}
            </div>

            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
              <AnimatePresence mode="wait">
                {activeTab === 'meeting' ? (
                  <motion.div
                    key="meeting"
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -10 }}
                    transition={{ duration: 0.2 }}
                    style={{ flex: 1, display: isMobile ? 'flex' : 'grid', flexDirection: isMobile ? 'column' : 'row', gridTemplateColumns: isMobile ? 'none' : 'minmax(300px, 1.2fr) minmax(300px, 1fr)', gap: isMobile ? '40px' : '32px', overflowY: isMobile ? 'auto' : 'hidden', padding: isMobile ? '0 16px 40px' : '0 24px 24px' }}
                    className={isMobile ? "custom-scrollbar" : ""}
                  >

                    {/* Left Column: Calendar (Fixed) */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
                      {/* Calendar Header with No Scrollbar style */}
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <h3 style={{ fontSize: '1.1rem', fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>
                          <AnimatePresence mode="wait">
                            <motion.span
                              key={calendarDate.toISOString()}
                              initial={{ opacity: 0, y: -10 }}
                              animate={{ opacity: 1, y: 0 }}
                              exit={{ opacity: 0, y: 10 }}
                              transition={{ duration: 0.2 }}
                            >
                              {calendarDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
                            </motion.span>
                          </AnimatePresence>
                        </h3>
                        <div style={{ display: 'flex', gap: '8px' }}>
                          <button
                            onClick={() => {
                              setDirection(-1);
                              setCalendarDate(new Date(calendarDate.setMonth(calendarDate.getMonth() - 1)));
                            }}
                            style={{ padding: '8px', borderRadius: '10px', border: 'none', background: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.05)', color: 'var(--text-primary)', cursor: 'pointer' }}>
                            <ChevronLeft size={16} />
                          </button>
                          <button
                            onClick={() => {
                              setDirection(1);
                              setCalendarDate(new Date(calendarDate.setMonth(calendarDate.getMonth() + 1)));
                            }}
                            style={{ padding: '8px', borderRadius: '10px', border: 'none', background: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.05)', color: 'var(--text-primary)', cursor: 'pointer' }}>
                            <ChevronRight size={16} />
                          </button>
                        </div>
                      </div>

                      {/* Calendar Grid - Hiding Overflow Check */}
                      <div style={{ overflow: 'hidden' }}>
                        <AnimatePresence mode="popLayout" initial={false} custom={direction}>
                          <motion.div
                            key={calendarDate.toISOString()}
                            custom={direction}
                            variants={{
                              enter: (direction: number) => ({ x: direction > 0 ? '100%' : '-100%', opacity: 0 }),
                              center: { x: 0, opacity: 1 },
                              exit: (direction: number) => ({ x: direction > 0 ? '-100%' : '100%', opacity: 0 })
                            }}
                            initial="enter"
                            animate="center"
                            exit="exit"
                            transition={{ type: "spring", stiffness: 300, damping: 30 }}
                            style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '10px', textAlign: 'center' }}
                          >
                            {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((d, i) => (
                              <div key={`${d}-${i}`} style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)' }}>{d}</div>
                            ))}
                            {Array.from({ length: getDaysInMonth(calendarDate).firstDay }).map((_, i) => (
                              <div key={`empty-${i}`} />
                            ))}

                            {/* Days Generation */}
                            {Array.from({ length: getDaysInMonth(calendarDate).days }).map((_, i) => {
                              const day = i + 1;
                              const date = new Date(calendarDate.getFullYear(), calendarDate.getMonth(), day);
                              const isSelected = selectedDate?.toDateString() === date.toDateString();
                              const meetingsForDay = getMeetingsForDate(date);
                              const hasMeetings = meetingsForDay.length > 0;
                              const today = new Date();
                              today.setHours(0, 0, 0, 0);
                              const isPast = date < today;
                              const hasFreeSlots = timeSlots.some((hostTime) => {
                                const isBusy = getMeetingsForDate(date).some(m => m.Time === hostTime);
                                const passed = isTimePassed(date, hostTime);
                                return !isBusy && !passed;
                              });

                              const isBookable = !isPast && hasFreeSlots;

                              return (
                                <div
                                  key={day}
                                  onClick={() => setSelectedDate(date)}
                                  style={{
                                    aspectRatio: '1',
                                    display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                                    borderRadius: '14px',
                                    cursor: 'pointer',
                                    position: 'relative',
                                    opacity: isBookable ? 1 : 0.4,
                                  }}
                                >
                                  {isSelected && (
                                    <motion.div
                                      layoutId="selected-day-bg"
                                      style={{
                                        position: 'absolute', inset: 0, borderRadius: '14px',
                                        backgroundColor: 'rgb(59, 130, 246)', zIndex: 0
                                      }}
                                    />
                                  )}
                                  <span style={{
                                    position: 'relative', zIndex: 1,
                                    color: isSelected ? 'white' : (isPast ? 'var(--text-muted)' : 'var(--text-primary)'),
                                    fontWeight: isSelected ? 700 : 500
                                  }}>
                                    {day}
                                  </span>

                                  {/* Meeting Indicators on Calendar */}
                                  {hasMeetings && !isSelected && (
                                    <div style={{ display: 'flex', gap: '2px', justifyContent: 'center', marginTop: '4px' }}>
                                      {meetingsForDay.slice(0, 3).map((m: Meeting, idx) => (
                                        <div key={idx} title={`${m.Time} - ${m.Name}`} style={{
                                          width: '4px', height: '4px', borderRadius: '50%',
                                          background: m.Email === 'temrevil@gmail.com' ? '#f59e0b' : '#10b981', // Host meetings orange, others green
                                          position: 'relative', zIndex: 1
                                        }} />
                                      ))}
                                    </div>
                                  )}
                                </div>
                              );
                            })}
                          </motion.div>
                        </AnimatePresence>
                      </div>
                    </div>

                    {/* Right Column: Details & Agenda (Scrollable) */}
                    <div className={!isMobile ? "custom-scrollbar" : ""} style={{ flex: 1, overflowY: isMobile ? 'visible' : 'auto', display: 'flex', flexDirection: 'column', gap: '24px', borderLeft: isMobile ? 'none' : `1px solid ${isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.05)'}`, borderTop: isMobile ? `1px solid ${isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.05)'}` : 'none', paddingLeft: isMobile ? '0' : '32px', paddingRight: '8px', paddingTop: isMobile ? '40px' : '0', willChange: 'transform' }}>
                      <AnimatePresence mode="wait">
                        <motion.div
                          key={bookingSuccess ? 'success' : (selectedDate?.toISOString() || 'no-date')}
                          initial={{ opacity: 0, x: 20 }}
                          animate={{ opacity: 1, x: 0 }}
                          exit={{ opacity: 0, x: -20 }}
                          transition={{ duration: 0.2 }}
                          style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}
                        >
                          {/* ... (Success View Logic Same as before, just ensuring wrapper closes correctly) ... */}

                          {/* Re-inserting the Booking Success / Agenda View Logic here for completeness of the visual block */}
                          {bookingSuccess ? (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '24px', alignItems: 'center', textAlign: 'center', height: '100%', justifyContent: 'center', paddingTop: '40px' }}>
                              <div style={{ width: '64px', height: '64px', borderRadius: '50%', background: '#10b981', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white' }}>
                                <Check size={32} />
                              </div>
                              <div>
                                <h3 style={{ fontSize: '1.5rem', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '8px' }}>Booking Confirmed!</h3>
                                <p style={{ color: 'var(--text-muted)' }}>You are scheduled for {bookingSuccess.date} at {bookingSuccess.time}.</p>
                              </div>
                              {bookingSuccess.link && bookingSuccess.link.startsWith('http') ? (
                                <div style={{ padding: '16px', background: isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)', borderRadius: '12px', width: '100%' }}>
                                  <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '8px' }}>Google Meet Link</div>
                                  <a href={bookingSuccess.link} target="_blank" rel="noreferrer" style={{ color: 'rgb(59, 130, 246)', fontWeight: 600, wordBreak: 'break-all', textDecoration: 'none' }}>
                                    {bookingSuccess.link}
                                  </a>
                                </div>
                              ) : null}
                              <button onClick={() => { setBookingSuccess(null); onClose(); }} style={{ marginTop: 'auto', padding: '12px 32px', borderRadius: '12px', border: 'none', backgroundColor: 'var(--text-primary)', color: 'var(--bg-primary)', fontWeight: 600, cursor: 'pointer' }}>Done</button>
                            </div>
                          ) : (
                            <>
                              {/* Agenda View */}
                              <div>
                                <h4 style={{ fontSize: '0.9rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '16px' }}>
                                  {selectedDate ? selectedDate.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' }) : 'Select a Date'}
                                </h4>
                                {/* List of Meetings for that Day */}
                                <div className="glass-surface" style={{ minHeight: '100px', borderRadius: '20px', padding: '20px', display: 'flex', flexDirection: 'column', gap: '12px', background: isDark ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.03)', border: `1px solid ${isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.05)'}` }}>
                                  {selectedDate && getMeetingsForDate(selectedDate).length > 0 ? (
                                    getMeetingsForDate(selectedDate).map((m: Meeting, i) => (
                                      <div key={i} className="flex items-center gap-3 py-1" style={{ borderBottom: i === getMeetingsForDate(selectedDate).length - 1 ? 'none' : (isDark ? '1px solid rgba(255,255,255,0.05)' : '1px solid rgba(0,0,0,0.05)') }}>
                                        <div style={{ width: '6px', height: '6px', borderRadius: '50%', background: 'rgb(59, 130, 246)', boxShadow: '0 0 8px rgba(59, 130, 246, 0.5)' }} />
                                        <div className="flex-1">
                                          <div className="text-sm font-semibold text-primary">{convertTimeToUser(m.Time)} - <span style={{ opacity: 0.7 }}>{m.Name}</span></div>
                                        </div>
                                      </div>
                                    ))
                                  ) : (
                                    <div className="flex-1 flex items-center justify-center text-muted text-sm italic">No meetings scheduled.</div>
                                  )}
                                </div>
                              </div>

                              {/* Time Slots & Form */}
                              {selectedDate && (() => {
                                const isPast = selectedDate < new Date(new Date().setHours(0, 0, 0, 0));
                                const hasFreeSlots = timeSlots.some((hostTime) => {
                                  const isBusy = getMeetingsForDate(selectedDate).some(m => m.Time === hostTime);
                                  const passed = isTimePassed(selectedDate, hostTime);
                                  return !isBusy && !passed;
                                });
                                return !isPast && hasFreeSlots;
                              })() && (
                                  <>
                                    {/* Timezone Selection (Before Available Slots) */}
                                    <div ref={tzRef} style={{ position: 'relative', marginBottom: '24px' }}>
                                      <div style={{ position: 'relative' }}>
                                        <label
                                          onMouseEnter={() => setShowTzTooltip(true)}
                                          onMouseLeave={() => setShowTzTooltip(false)}
                                          className="label-help flex items-center gap-2 mb-2"
                                          style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-muted)' }}
                                        >
                                          <Globe size={14} className="opacity-70" /> User Timezone <AlertCircle size={14} className="opacity-70" />
                                        </label>

                                        <AnimatePresence>
                                          {showTzTooltip && (
                                            <motion.div
                                              initial={{ opacity: 0, y: 10, scale: 0.95 }}
                                              animate={{ opacity: 1, y: 0, scale: 1 }}
                                              exit={{ opacity: 0, y: 5, scale: 0.95 }}
                                              transition={{ duration: 0.2, ease: "easeOut" }}
                                              className="tooltip-glass"
                                              style={{
                                                position: 'absolute',
                                                bottom: '100%',
                                                left: '0',
                                                marginBottom: '10px',
                                                width: '280px',
                                                zIndex: 200,
                                                pointerEvents: 'none'
                                              }}
                                            >
                                              We've detected your timezone automatically, but you can adjust it here. Available slots will update to match your local area's time.
                                              <div style={{
                                                position: 'absolute',
                                                top: '100%',
                                                left: '12px',
                                                width: '0',
                                                height: '0',
                                                borderLeft: '6px solid transparent',
                                                borderRight: '6px solid transparent',
                                                borderTop: `6px solid ${isDark ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0,0,0,0.8)'}`
                                              }} />
                                            </motion.div>
                                          )}
                                        </AnimatePresence>
                                      </div>

                                      <button
                                        type="button"
                                        onClick={() => setIsTimezoneDropdownOpen(!isTimezoneDropdownOpen)}
                                        className="dashboard-input flex justify-between items-center text-left"
                                        style={{ borderRadius: '12px', width: '100%', cursor: 'pointer' }}
                                      >
                                        <span style={{ fontSize: '0.85rem' }}>
                                          {timezones.find(t => t.value === userTimezone)?.label || `UTC${userTimezone >= 0 ? '+' : ''}${userTimezone}:00`}
                                        </span>
                                        <ChevronRight size={16} style={{
                                          transform: isTimezoneDropdownOpen ? 'rotate(90deg)' : 'none',
                                          transition: 'transform 0.2s',
                                          opacity: 0.5
                                        }} />
                                      </button>
                                      <AnimatePresence>
                                        {isTimezoneDropdownOpen && (
                                          <motion.div
                                            initial={{ opacity: 0, y: -10 }}
                                            animate={{ opacity: 1, y: 0 }}
                                            exit={{ opacity: 0, y: -5 }}
                                            className="dropdown-glass custom-scrollbar"
                                            style={{
                                              position: 'absolute', top: '100%', left: 0, right: 0,
                                              marginTop: '8px', maxHeight: '200px', overflowY: 'auto',
                                              zIndex: 100, borderRadius: '14px', padding: '8px'
                                            }}
                                          >
                                            {timezones.map(tz => (
                                              <button
                                                key={tz.value}
                                                type="button"
                                                onClick={() => { setUserTimezone(tz.value); setIsTimezoneDropdownOpen(false); }}
                                                style={{
                                                  width: '100%', padding: '10px 12px', borderRadius: '8px', border: 'none',
                                                  background: userTimezone === tz.value ? 'rgba(59, 130, 246, 0.1)' : 'transparent',
                                                  color: userTimezone === tz.value ? 'rgb(59, 130, 246)' : 'var(--text-primary)',
                                                  fontSize: '0.8rem', fontWeight: userTimezone === tz.value ? 700 : 500,
                                                  textAlign: 'left', cursor: 'pointer', transition: 'all 0.2s'
                                                }}
                                                onMouseEnter={e => { if (userTimezone !== tz.value) e.currentTarget.style.background = isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)'; }}
                                                onMouseLeave={e => { if (userTimezone !== tz.value) e.currentTarget.style.background = 'transparent'; }}
                                              >
                                                {tz.label}
                                              </button>
                                            ))}
                                          </motion.div>
                                        )}
                                      </AnimatePresence>
                                    </div>

                                    <div>
                                      <h3 className="heading-sm mb-3 flex items-center gap-2"><Clock size={16} /> Available Slots</h3>
                                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '8px', marginBottom: '16px' }}>
                                        {convertedSlots.map((time, idx) => {
                                          const hostTime = timeSlots[idx];
                                          const isBusy = getMeetingsForDate(selectedDate).some(m => m.Time === hostTime);
                                          const passed = isTimePassed(selectedDate, hostTime);
                                          const isDisabled = isBusy || passed;
                                          return (
                                            <button key={time} onClick={() => setSelectedTime(time)} disabled={isDisabled}
                                              style={{
                                                padding: '10px 8px', borderRadius: '12px',
                                                border: `1px solid ${selectedTime === time ? 'rgb(59, 130, 246)' : (isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.08)')}`,
                                                background: selectedTime === time ? 'rgba(59, 130, 246, 0.12)' : (isDark ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.03)'),
                                                color: selectedTime === time ? 'rgb(59, 130, 246)' : 'var(--text-primary)',
                                                fontSize: '0.75rem', fontWeight: 600, cursor: 'pointer', transition: 'all 0.2s',
                                                opacity: isDisabled ? 0.3 : 1,
                                                textDecoration: isDisabled ? 'line-through' : 'none'
                                              }}
                                              onMouseEnter={(e) => {
                                                if (selectedTime !== time && !isDisabled) {
                                                  e.currentTarget.style.borderColor = 'rgba(59, 130, 246, 0.4)';
                                                  e.currentTarget.style.background = isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)';
                                                }
                                              }}
                                              onMouseLeave={(e) => {
                                                if (selectedTime !== time && !isDisabled) {
                                                  e.currentTarget.style.borderColor = isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.08)';
                                                  e.currentTarget.style.background = isDark ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.03)';
                                                }
                                              }}
                                            >{time}</button>
                                          );
                                        })}
                                      </div>
                                    </div>

                                    <div className="flex flex-col gap-3">
                                      <div>
                                        <div style={{ position: 'relative' }}>
                                          <label
                                            onMouseEnter={() => setShowNameTooltip(true)}
                                            onMouseLeave={() => setShowNameTooltip(false)}
                                            className="label-help"
                                          >
                                            Name * <AlertCircle size={14} className="opacity-60" />
                                          </label>

                                          <AnimatePresence>
                                            {showNameTooltip && (
                                              <motion.div
                                                initial={{ opacity: 0, y: 10, scale: 0.95 }}
                                                animate={{ opacity: 1, y: 0, scale: 1 }}
                                                exit={{ opacity: 0, y: 5, scale: 0.95 }}
                                                transition={{ duration: 0.2, ease: "easeOut" }}
                                                className="tooltip-glass"
                                              >
                                                Warning: your name will show in the calendar, if you want to hide it, please use a nickname.
                                                <div style={{
                                                  position: 'absolute',
                                                  top: '100%',
                                                  left: '12px',
                                                  width: '0',
                                                  height: '0',
                                                  borderLeft: '6px solid transparent',
                                                  borderRight: '6px solid transparent',
                                                  borderTop: `6px solid ${isDark ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0,0,0,0.8)'}`
                                                }} />
                                              </motion.div>
                                            )}
                                          </AnimatePresence>
                                        </div>
                                        <input className="dashboard-input" style={{ borderRadius: '12px' }} placeholder="Your Name" value={meetingData.name} onChange={e => setMeetingData({ ...meetingData, name: e.target.value })} />
                                      </div>
                                      <div>
                                        <div style={{ position: 'relative' }}>
                                          <label
                                            onMouseEnter={() => setShowEmailTooltip(true)}
                                            onMouseLeave={() => setShowEmailTooltip(false)}
                                            className="label-help"
                                          >
                                            Email * <AlertCircle size={14} className="opacity-60" />
                                          </label>

                                          <AnimatePresence>
                                            {showEmailTooltip && (
                                              <motion.div
                                                initial={{ opacity: 0, y: 10, scale: 0.95 }}
                                                animate={{ opacity: 1, y: 0, scale: 1 }}
                                                exit={{ opacity: 0, y: 5, scale: 0.95 }}
                                                transition={{ duration: 0.2, ease: "easeOut" }}
                                                className="tooltip-glass"
                                              >
                                                Please use a correct email address. I will send the Google Calendar invitation and meeting link directly to this inbox.
                                                <div style={{
                                                  position: 'absolute',
                                                  top: '100%',
                                                  left: '12px',
                                                  width: '0',
                                                  height: '0',
                                                  borderLeft: '6px solid transparent',
                                                  borderRight: '6px solid transparent',
                                                  borderTop: `6px solid ${isDark ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0,0,0,0.8)'}`
                                                }} />
                                              </motion.div>
                                            )}
                                          </AnimatePresence>
                                        </div>
                                        <input type="email" className="dashboard-input" style={{ borderRadius: '12px' }} placeholder="Your Email" value={meetingData.email} onChange={e => setMeetingData({ ...meetingData, email: e.target.value })} />
                                      </div>
                                      <div>
                                        <label className="input-label font-semibold">Reason *</label>
                                        <textarea className="dashboard-textarea" style={{ minHeight: '80px', borderRadius: '12px' }} placeholder="What's this meeting for?" rows={2} value={meetingData.reason} onChange={e => setMeetingData({ ...meetingData, reason: e.target.value })} />
                                      </div>
                                    </div>
                                    <button onClick={handleMeetingSubmit} disabled={isSubmitting || !selectedDate || !selectedTime || !meetingData.email} className="btn-primary btn w-full" style={{ padding: '14px', borderRadius: '14px', opacity: (isSubmitting || !selectedDate || !selectedTime || !meetingData.email) ? 0.5 : 1 }}>
                                      {isSubmitting ? (
                                        <>
                                          <motion.div
                                            animate={{ rotate: 360 }}
                                            transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
                                            style={{ display: 'flex' }}
                                          >
                                            <Clock size={16} />
                                          </motion.div>
                                          Booking...
                                        </>
                                      ) : (
                                        'Confirm Booking'
                                      )}
                                    </button>
                                  </>
                                )}
                            </>
                          )}
                        </motion.div>
                      </AnimatePresence>
                    </div>

                  </motion.div>
                ) : (
                  <motion.div
                    key="message"
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -10 }}
                    transition={{ duration: 0.2 }}
                    style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}
                  >
                    <form onSubmit={handleSubmit} className="custom-scrollbar" style={{ display: 'flex', flexDirection: 'column', gap: '20px', overflowY: 'auto', flex: 1, padding: isMobile ? '0 16px 40px' : '0 24px 24px', willChange: 'transform' }}>

                      {/* Message Form Fields */}
                      <div>
                        <label className="input-label font-semibold">Name *</label>
                        <div className="input-container">
                          <User size={18} className="input-icon" />
                          <input name="name" value={formData.name} onChange={handleInputChange} required className="input-with-icon" placeholder="Full Name" />
                        </div>
                      </div>

                      <div>
                        <label className="input-label font-semibold">Email *</label>
                        <div className="input-container">
                          <Mail size={18} className="input-icon" />
                          <input type="email" name="email" value={formData.email} onChange={handleInputChange} required className="input-with-icon" placeholder="name@example.com" />
                        </div>
                      </div>

                      <div>
                        <label className="input-label font-semibold">Phone Number *</label>
                        <div className="input-container">
                          <Phone size={18} className="input-icon" />
                          <input type="tel" name="number" value={formData.number} onChange={handleInputChange} required className="input-with-icon" placeholder="+1 (555) 123-4567" />
                        </div>
                      </div>

                      <div className="toggle-container">
                        <div className="flex items-center gap-2 font-semibold text-sm">
                          <MessageSquare size={16} />
                          WhatsApp Available
                        </div>
                        <div
                          onClick={() => setFormData(prev => ({ ...prev, hasWhatsapp: !prev.hasWhatsapp }))}
                          className={`toggle-switch ${formData.hasWhatsapp ? 'active' : ''}`}
                        >
                          <div className="toggle-knob">
                            {formData.hasWhatsapp && <Check size={12} className="text-info" />}
                          </div>
                        </div>
                      </div>

                      <div>
                        <label className="input-label font-semibold">Message *</label>
                        <textarea name="message" value={formData.message} onChange={handleInputChange} required rows={4} className="dashboard-textarea" placeholder="How can I help you?" />
                      </div>

                      {/* Attachments */}
                      <div>
                        <div className="flex-row-between mb-3">
                          <label className="input-label font-semibold m-0">Attachments</label>
                          <label className="flex items-center gap-1 text-sm text-info cursor-pointer font-medium">
                            <Paperclip size={16} /> Add Files
                            <input type="file" multiple onChange={handleFileChange} className="hidden" />
                          </label>
                        </div>
                        {formData.attachments.length > 0 && (
                          <div className="flex flex-wrap gap-2">
                            {formData.attachments.map((file, i) => (
                              <div key={i} className="attachment-item">
                                <span className="max-w-[150px] overflow-hidden truncate">{file.name}</span>
                                <button type="button" onClick={() => removeFile(i)} className="btn-icon p-0 h-auto w-auto opacity-70 hover:opacity-100">
                                  <X size={14} />
                                </button>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>

                      <button type="submit" disabled={isSubmitting} className="btn-primary btn w-full" style={{ opacity: isSubmitting ? 0.7 : 1 }}>
                        {isSubmitting ? (
                          <>
                            <motion.div
                              animate={{ rotate: 360 }}
                              transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
                              className="flex"
                            >
                              <Clock size={18} />
                            </motion.div>
                            Sending...
                          </>
                        ) : (
                          <>
                            <Send size={18} /> Send Message
                          </>
                        )}
                      </button>

                    </form>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>
        </motion.div>
      </motion.div>
    </>,
    document.body
  );
};

export default MContact;
