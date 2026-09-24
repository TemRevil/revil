import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import type React from 'react';
import { doc, onSnapshot, updateDoc, serverTimestamp } from 'firebase/firestore';
// firebase/functions is dynamic-imported inside the submit handler (not statically) so
// it stays OUT of the eager first-paint bundle - M-Contact is imported eagerly by App.tsx.
import app, { db } from '../lib/firebase';
import type { AlertType } from '../components/Alert';
import { AvailabilityConfig, DEFAULT_AVAILABILITY, parseAvailabilityConfig, buildHostSlots, isWorkingDay } from '../utils/availability';
import { timezoneOptions, localOffset } from '../utils/timezones';

/** Pragmatic email validator: requires local@domain.tld and rejects whitespace.
 *  Not RFC 5322 perfect, but rejects 99% of typos / pasted junk. */
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
export const isValidEmail = (s: string) => EMAIL_RE.test(s.trim());

export interface Meeting {
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

type ShowAlert = (next: { type: AlertType; message: string; duration?: number }) => void;

const getOffsetFromUTCString = (tzStr: string) => {
  const match = tzStr.match(/UTC([+-]\d{2}):(\d{2})/);
  if (!match) return 0;
  const hours = parseInt(match[1]);
  const minutes = parseInt(match[2]);
  return hours + (minutes / 60) * (hours < 0 ? -1 : 1);
};

export const getDaysInMonth = (date: Date) => {
  const year = date.getFullYear();
  const month = date.getMonth();
  const days = new Date(year, month + 1, 0).getDate();
  const firstDay = new Date(year, month, 1).getDay();
  return { days, firstDay };
};

/**
 * The public "book a 30 minute call" flow: host availability + booked slots from
 * Firestore, time-zone conversion, the calendar's bookable days, and the submit
 * (Calendar event via the syncMeeting function, then the Settings/Canary write).
 * Shared by the contact modal (M-Contact) and the standalone /book page, so both
 * book through exactly the same rules.
 *
 * `enabled` gates the one-time move to the next open day (the modal only wants it
 * while its meeting tab is showing).
 */
export default function useMeetingBooking({ showAlert, enabled = true }: { showAlert: ShowAlert; enabled?: boolean }) {
  const [calendarDate, setCalendarDate] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState<Date | null>(new Date());
  const [selectedTime, setSelectedTime] = useState<string | null>(null);
  // A custom (free) slot the visitor picked themselves, rather than one of the host's
  // fixed hours. When true, selectedTime holds that user-perspective time and the
  // "must be one of the offered slots" submit guard is relaxed for it. The picker UI +
  // its open state live in <CustomTimePicker>.
  const [isCustomTime, setIsCustomTime] = useState(false);
  const [meetingData, setMeetingData] = useState({ name: '', email: '', reason: '' });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [existingMeetings, setExistingMeetings] = useState<Meeting[]>([]);
  const [bookingSuccess, setBookingSuccess] = useState<{ date: string, time: string, link: string } | null>(null);

  const today = useMemo(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  }, []);

  const limitDate = useMemo(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() + 45); // 1.5 months limit
    return d;
  }, []);

  const isPrevMonthDisabled = useMemo(() => {
    const prevM = new Date(calendarDate.getFullYear(), calendarDate.getMonth() - 1, 1);
    const currentMStart = new Date(today.getFullYear(), today.getMonth(), 1);
    return prevM < currentMStart;
  }, [calendarDate, today]);

  const isNextMonthDisabled = useMemo(() => {
    const nextM = new Date(calendarDate.getFullYear(), calendarDate.getMonth() + 1, 1);
    return nextM > limitDate;
  }, [calendarDate, limitDate]);

  const isFutureMonth = useMemo(() => {
    return calendarDate.getFullYear() > today.getFullYear() ||
      (calendarDate.getFullYear() === today.getFullYear() && calendarDate.getMonth() > today.getMonth());
  }, [calendarDate, today]);

  // Timezone States
  const [hostTimezoneString, setHostTimezoneString] = useState('UTC+02:00 (EET)'); // Default
  // The owner's "Current Availability" percent, for pages that show the status pill.
  const [hostAvailability, setHostAvailability] = useState<unknown>(undefined);
  const [userTimezone, setUserTimezone] = useState<number>(localOffset);
  // The visitor's own row is named after their city rather than a stand-in
  // abbreviation, so someone in Cairo is not told they are on Moscow time.
  const tzOptions = useMemo(() => timezoneOptions(), []);

  // Resets below are adjusted during render (React's documented pattern) rather than in
  // effects, so the stale value never paints for a frame before being cleared.

  // New day: drop the previous booking success and clear the picked time - a slot chosen
  // on one day may be booked/passed on another (which would otherwise submit an invalid slot).
  const [prevDate, setPrevDate] = useState(selectedDate);
  if (prevDate !== selectedDate) {
    setPrevDate(selectedDate);
    setBookingSuccess(null);
    setSelectedTime(null);
    setIsCustomTime(false);
  }

  // Timezone switch: the stored time string no longer matches any visible button.
  const [prevTimezone, setPrevTimezone] = useState(userTimezone);
  if (prevTimezone !== userTimezone) {
    setPrevTimezone(userTimezone);
    setSelectedTime(null);
    setIsCustomTime(false);
  }

  // Host working days + hours (edited from the dashboard → Canary → Hours). The slot
  // list is derived from it, so the times are no longer hardcoded. Defaults preserve
  // the historic 09:00–17:00 schedule until the owner configures their own.
  const [availConfig, setAvailConfig] = useState<AvailabilityConfig>(DEFAULT_AVAILABILITY);
  // Whether the public availability + booked-slots snapshots have fired at least once.
  // The auto-move-to-the-next-open-day MUST wait for these: until they load, availConfig
  // is still the hardcoded 9-17 default, so moving early picks the next day off stale
  // hours instead of the owner's real ones - and since the move latches (runs once), it
  // never self-corrects when the real config arrives a moment later.
  const [availLoaded, setAvailLoaded] = useState(false);
  const [slotsLoaded, setSlotsLoaded] = useState(false);
  const timeSlots = useMemo(() => buildHostSlots(availConfig), [availConfig]);

  // Sync Host Availability & Timezone
  useEffect(() => {
    const unsubscribeAvailability = onSnapshot(doc(db, 'Settings', 'Availability'), (snap) => {
      if (snap.exists()) {
        const data = snap.data();
        if (data['Current Time']) {
          setHostTimezoneString(data['Current Time']);
        }
        setHostAvailability(data['Current Availability']);
        setAvailConfig(parseAvailabilityConfig(data));
      } else {
        setAvailConfig(DEFAULT_AVAILABILITY);
      }
      setAvailLoaded(true);
    }, () => {
      // On a read error keep the default and still mark loaded, so the auto-move isn't
      // stuck forever (it just falls back to the historic hours, as it did before).
      setAvailConfig(DEFAULT_AVAILABILITY);
      setAvailLoaded(true);
    });

    // Read busy slots from the sanitized public mirror (Settings/BookedSlots),
    // NOT Settings/Canary - Canary holds visitor PII and is admin-read-only.
    // BookedSlots carries only { Date, Time } per booking, which is all the public
    // calendar needs to grey out taken slots. A Cloud Function keeps it in sync.
    const unsubscribeMeetings = onSnapshot(doc(db, 'Settings', 'BookedSlots'), (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data();
        const slots = (data.Slots || []) as Array<{ Date?: string; Time?: string }>;
        const meetingsList = slots
          .filter((s) => s && s.Date && s.Time)
          .map((s): Meeting => ({
            Date: s.Date || '',
            Time: s.Time || '',
            Name: '',
            Email: '',
            dateObj: new Date(s.Date || Date.now()),
          }));
        setExistingMeetings(meetingsList);
      } else {
        setExistingMeetings([]);
      }
      setSlotsLoaded(true);
    }, () => {
      setExistingMeetings([]);
      setSlotsLoaded(true);
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

  const hostOffset = getOffsetFromUTCString(hostTimezoneString);
  const offsetDiff = userTimezone - hostOffset;

  // Convert "09:00 AM" strings to User's Perspective. Memoized on offsetDiff (its only
  // dependency) so the derived slot list below has a stable input.
  const convertTimeToUser = useCallback((hostTimeStr: string) => {
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
  }, [offsetDiff]);

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

  // Converted slots for the UI
  const convertedSlots = useMemo(() => timeSlots.map(convertTimeToUser), [timeSlots, convertTimeToUser]);

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

  /** At least one host slot on this day is neither booked nor already passed. */
  const hasFreeSlots = useCallback((date: Date) => timeSlots.some((hostTime) => {
    const isBusy = getMeetingsForDate(date).some(m => m.Time === hostTime);
    return !isBusy && !isTimePassed(date, hostTime);
  }), [timeSlots, getMeetingsForDate, isTimePassed]);

  /** A day the visitor can pick: inside the booking window, a working day, with a free slot. */
  const isDayBookable = useCallback((date: Date) =>
    date >= today && date <= limitDate && hasFreeSlots(date) && isWorkingDay(availConfig, date),
  [today, limitDate, hasFreeSlots, availConfig]);

  // Automatically find the next available day ONCE, when the booking view first shows
  const hasAutoMoved = useRef(false);
  useEffect(() => {
    // Wait for the real availability + booked slots before choosing the next open day,
    // otherwise it moves off the stale 9-17 default and latches on the wrong day.
    if (!selectedDate || !enabled || hasAutoMoved.current || !availLoaded || !slotsLoaded) return;

    const checkAvailable = (date: Date) => isWorkingDay(availConfig, date) && hasFreeSlots(date);

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
        // Must stay in an effect: it reacts to availability + booked slots arriving from
        // Firestore, and runs once (hasAutoMoved). It cannot be derived during render.
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setSelectedDate(searchDate);
        setCalendarDate(searchDate);
      }
    }
    hasAutoMoved.current = true;
  }, [selectedDate, hasFreeSlots, enabled, availConfig, availLoaded, slotsLoaded]);

  useEffect(() => {
    return () => { hasAutoMoved.current = false; };
  }, []);

  const handleMeetingSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // Basic Validation
    if (!selectedDate || !selectedTime) return;
    // Guard: the selected slot must still be a currently-offered, non-passed, and
    // still-free slot (defends against a slot that became unavailable after
    // selection - e.g. another visitor booked it while this view was open, in
    // which case the button greys out but selectedTime persists).
    // isTimePassed/busy checks take the host-perspective time - convert first.
    const selectedHostTime = convertTimeToHost(selectedTime);
    const slotNowBusy = getMeetingsForDate(selectedDate).some(m => m.Time === selectedHostTime);
    // Fixed slots must still be one of the currently-offered times; a custom (free)
    // slot is exempt from that membership check, but both must be non-passed and free.
    const notOffered = !isCustomTime && !convertedSlots.includes(selectedTime);
    if (notOffered || isTimePassed(selectedDate, selectedHostTime) || slotNowBusy) {
      setSelectedTime(null);
      setIsCustomTime(false);
      showAlert({ type: 'warning', message: 'That time slot is no longer available. Please pick another.' });
      return;
    }
    if (!meetingData.email || !isValidEmail(meetingData.email)) {
      showAlert({ type: 'error', message: "Please enter a valid email address." });
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

      // selectedDate is a local Date, only y/m/d are used from it
      const y = selectedDate.getFullYear();
      const m = selectedDate.getMonth();
      const d = selectedDate.getDate();

      // Start time in UTC = (local hours - userOffset)
      const startDateUTC = new Date(Date.UTC(y, m, d, hours, minutes) - (userTimezone * 3600000));
      const endDateUTC = new Date(startDateUTC.getTime() + 3600000); // 1 hour later

      // 2. Call Firebase Function (firebase/functions loaded on demand)
      const { httpsCallable, getFunctions } = await import('firebase/functions');
      const syncMeeting = httpsCallable(getFunctions(app), 'syncMeeting');
      const response = await syncMeeting({
        name: meetingData.name,
        email: meetingData.email.trim(),
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

      // 4. Save to Firebase.
      // Canary is admin-read-only, so the public client can't read it to compute a
      // sequential ID. We use a collision-resistant client-generated ID and a blind
      // updateDoc (matches the rate-limited public-update rule) - no read of Canary
      // required. IDs are opaque map keys; nothing depends on them being sequential.
      const docRef = doc(db, 'Settings', 'Canary');
      const meetingId = `${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;

      // Derive the stored host-perspective Date + Time from the SAME UTC instant the
      // calendar event was created at (startDateUTC), shifted into the host's zone.
      // Computing them independently from selectedDate/selectedTime drops the day on a
      // cross-midnight timezone wrap, which would store the meeting on the wrong day
      // and free the genuinely-taken slot in the public BookedSlots mirror.
      const hostInstant = new Date(startDateUTC.getTime() + hostOffset * 3600000);
      const hY = hostInstant.getUTCFullYear();
      const hMo = hostInstant.getUTCMonth();
      const hD = hostInstant.getUTCDate();
      const hH = hostInstant.getUTCHours();
      const hMin = hostInstant.getUTCMinutes();
      const dateStr = `${hD.toString().padStart(2, '0')}/${(hMo + 1).toString().padStart(2, '0')}/${hY}`;
      const hostPeriod = hH >= 12 ? 'PM' : 'AM';
      const hostDisplayH = hH % 12 || 12;
      const hostPerspecTime = `${hostDisplayH.toString().padStart(2, '0')}:${hMin.toString().padStart(2, '0')} ${hostPeriod}`;

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

      try {
        await updateDoc(docRef, { [`Meetings.${meetingId}`]: payload, lastMeetingWrite: serverTimestamp() });
        window.dispatchEvent(new CustomEvent('revil:contact_sent', { detail: { kind: 'meeting' } }));
      } catch (writeErr) {
        // The calendar event + guest invite already exist, but persisting the meeting
        // to Firestore failed - most commonly the rules' 300s global booking cooldown
        // rejecting a second booking made site-wide within 5 minutes. Roll the event
        // back so we don't leave an orphaned invite for a slot the public mirror never
        // marks busy (which a later visitor could then double-book).
        if (googleEventId) {
          try {
            await syncMeeting({
              action: 'cancel',
              eventId: googleEventId,
              email: meetingData.email.trim(),
              name: meetingData.name,
              startTime: startDateUTC.toISOString(),
            });
          } catch { /* best-effort rollback; the host can still cancel from the dashboard */ }
        }
        if ((writeErr as { code?: string })?.code === 'permission-denied') {
          throw new Error('Another booking just came in - please wait a few minutes and try again.');
        }
        throw writeErr;
      }

      // Confirm to the GUEST in their own perspective (their picked day + local time).
      setBookingSuccess({ date: formatDateDDMMYYYY(selectedDate), time: selectedTime || '', link: meetLink || '' });
      setMeetingData({ name: '', email: '', reason: '' });

    } catch (error: unknown) {
      console.error("Booking Error", error);
      const err = error as { message?: string };
      const msg = err.message?.includes("Invalid attendee email")
        ? "Invalid Email Address provided."
        : (err.message || "Could not book meeting");
      showAlert({ type: 'error', message: msg });
    } finally {
      setIsSubmitting(false);
    }
  };

  // Validate a proposed custom (free) time with the SAME passed/busy checks the fixed
  // slots get (in the host's perspective). Returns an error message, or null to allow.
  const validateCustomTime = (t: string): string | null => {
    if (!selectedDate) return null;
    const hostT = convertTimeToHost(t);
    if (isTimePassed(selectedDate, hostT)) return 'That time has already passed, pick a later one.';
    if (getMeetingsForDate(selectedDate).some(m => m.Time === hostT)) return 'That time overlaps an existing booking, pick another.';
    return null;
  };

  // Same rule as validateCustomTime, as a boolean: the picker greys these out so a passed
  // or already-booked time can't be composed at all, instead of only being rejected on Set.
  const isCustomTimeUnavailable = useCallback((t: string): boolean => {
    if (!selectedDate) return false;
    const hostT = convertTimeToHost(t);
    return isTimePassed(selectedDate, hostT)
      || getMeetingsForDate(selectedDate).some(m => m.Time === hostT);
    // convertTimeToHost/getMeetingsForDate are recreated each render; the picker only
    // reads this while open, so the extra identity churn is harmless.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedDate, isTimePassed, offsetDiff, existingMeetings]);

  return {
    today, limitDate,
    calendarDate, setCalendarDate, isPrevMonthDisabled, isNextMonthDisabled, isFutureMonth,
    selectedDate, setSelectedDate, selectedTime, setSelectedTime, isCustomTime, setIsCustomTime,
    meetingData, setMeetingData, isSubmitting, bookingSuccess, setBookingSuccess,
    userTimezone, setUserTimezone, tzOptions, hostTimezoneString, hostAvailability,
    availConfig, timeSlots, convertedSlots,
    getMeetingsForDate, convertTimeToUser, isTimePassed, hasFreeSlots, isDayBookable,
    handleMeetingSubmit, validateCustomTime, isCustomTimeUnavailable,
  };
}
