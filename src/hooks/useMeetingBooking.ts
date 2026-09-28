import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import type React from 'react';
// Firebase is reached only through lib/liveDoc: the listeners attach once it has loaded
// off the first paint, and the submit handler imports Functions on demand, so
// /book draws without waiting for the SDK (or App Check's reCAPTCHA).
import { loadFirebase, watchDoc } from '../lib/liveDoc';
import type { AlertType } from '../components/Alert';
import { AvailabilityConfig, DEFAULT_AVAILABILITY, parseAvailabilityConfig } from '../utils/availability';
import {
  BOOKING_WINDOW_DAYS, DAY_MS, DEFAULT_HOST_TZ, type DayContext, type PresetSlot,
  bookingRefusal, customTimeRefusal, dayIndex, dayIndexAt, isDayOpen, meetingInstant,
  presetSlotsForDay, utcOffsetHours, visitorTimeToInstant, wallClock,
} from '../utils/bookingRules';
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

interface BookMeetingResponse {
  link?: string;
}

type ShowAlert = (next: { type: AlertType; message: string; duration?: number }) => void;

/** The calendar's day cells are local Dates; only their y/m/d matter (the visitor's day). */
const dayOf = (date: Date) => dayIndex(date.getFullYear(), date.getMonth(), date.getDate());
const dateOfDay = (day: number) => {
  const u = new Date(day * DAY_MS);
  return new Date(u.getUTCFullYear(), u.getUTCMonth(), u.getUTCDate());
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
 * (the bookMeeting function creates the Calendar event and records the meeting).
 * Shared by the contact modal (M-Contact) and the standalone /book page, so both
 * book through exactly the same rules.
 *
 * `enabled` gates the one-time move to the next open day (the modal only wants it
 * while its meeting tab is showing).
 *
 * `via` says which of the two booked it. It is stored on the meeting (`Via`) so Canary
 * can show where a booking came from, and sent with the analytics event so Trails can.
 */
export type BookingVia = 'book' | 'contact';

export default function useMeetingBooking({ showAlert, enabled = true, via = 'contact' }: { showAlert: ShowAlert; enabled?: boolean; via?: BookingVia }) {
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

  // Timezone States
  const [hostTimezoneString, setHostTimezoneString] = useState(DEFAULT_HOST_TZ);
  // The owner's "Current Availability" percent, for pages that show the status pill.
  const [hostAvailability, setHostAvailability] = useState<unknown>(undefined);
  const [userTimezone, setUserTimezone] = useState<number>(localOffset);
  // The visitor's own row is named after their city rather than a stand-in
  // abbreviation, so someone in Cairo is not told they are on Moscow time.
  const tzOptions = useMemo(() => timezoneOptions(), []);

  // The visitor's today, in the timezone they picked - the same "today" bookMeeting
  // measures the 45-day window from.
  const [openedAt] = useState(() => Date.now());
  const today = useMemo(() => dateOfDay(dayIndexAt(openedAt, userTimezone)), [openedAt, userTimezone]);

  const limitDate = useMemo(() => {
    const d = new Date(today);
    d.setDate(d.getDate() + BOOKING_WINDOW_DAYS); // 1.5 months limit
    return d;
  }, [today]);

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

  // Sync Host Availability & Timezone
  useEffect(() => {
    const unsubscribeAvailability = watchDoc(['Settings', 'Availability'], (data) => {
      if (data) {
        if (typeof data['Current Time'] === 'string' && data['Current Time']) {
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
    const unsubscribeMeetings = watchDoc(['Settings', 'BookedSlots'], (data) => {
      if (data) {
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

  const hostOffset = utcOffsetHours(hostTimezoneString);

  // Everything the booking rules need, read fresh on each call so "passed" and "today"
  // follow the clock while the page stays open.
  const dayContext = useCallback((): DayContext => ({
    nowMs: Date.now(), userTimezone, hostOffset, cfg: availConfig, meetings: existingMeetings,
  }), [userTimezone, hostOffset, availConfig, existingMeetings]);

  /** Bookings that start on this visitor day (the calendar's "booked" dots). */
  const getMeetingsForDate = useCallback((date: Date) => {
    const day = dayOf(date);
    return existingMeetings.filter((m) => {
      const at = meetingInstant(m, hostOffset);
      return at !== null && dayIndexAt(at, userTimezone) === day;
    });
  }, [existingMeetings, hostOffset, userTimezone]);

  /** A booked meeting's start time, as the visitor sees it. */
  const meetingTimeForVisitor = useCallback((m: Meeting) => {
    const at = meetingInstant(m, hostOffset);
    return at === null ? m.Time : wallClock(at, userTimezone).time;
  }, [hostOffset, userTimezone]);

  /** The owner's preset slots that fall on this visitor day, each marked taken/passed. */
  const daySlots = useCallback((date: Date): PresetSlot[] => presetSlotsForDay(dayOf(date), dayContext()), [dayContext]);

  // The selected day's preset times, as the visitor sees them.
  const convertedSlots = useMemo(() => (selectedDate ? daySlots(selectedDate).map(s => s.label) : []), [selectedDate, daySlots]);

  /** A day the visitor can pick: inside the booking window, with a preset slot still free. */
  const isDayBookable = useCallback((date: Date) => isDayOpen(dayOf(date), dayContext()), [dayContext]);

  // Automatically find the next available day ONCE, when the booking view first shows
  const hasAutoMoved = useRef(false);
  useEffect(() => {
    // Wait for the real availability + booked slots before choosing the next open day,
    // otherwise it moves off the stale 9-17 default and latches on the wrong day.
    if (!selectedDate || !enabled || hasAutoMoved.current || !availLoaded || !slotsLoaded) return;

    const checkAvailable = isDayBookable;

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
  }, [selectedDate, isDayBookable, today, enabled, availLoaded, slotsLoaded]);

  useEffect(() => {
    return () => { hasAutoMoved.current = false; };
  }, []);

  const handleMeetingSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // Basic Validation
    if (!selectedDate || !selectedTime) return;
    // Guard: the selected slot must still be on offer (defends against a slot that
    // became unavailable after selection - e.g. another visitor booked it while this
    // view was open, in which case the button greys out but selectedTime persists).
    // A preset time must still be one of the day's slots; a custom time is exempt
    // from that, and both go through the same rules bookMeeting enforces.
    const startMs = visitorTimeToInstant(dayOf(selectedDate), selectedTime, userTimezone);
    const notOffered = !isCustomTime && !convertedSlots.includes(selectedTime);
    const refusal = startMs === null ? 'Invalid meeting time.' : bookingRefusal(startMs, dayContext());
    if (notOffered || refusal || startMs === null) {
      setSelectedTime(null);
      setIsCustomTime(false);
      showAlert({ type: 'warning', message: refusal || 'That time slot is no longer available. Please pick another.' });
      return;
    }
    if (!meetingData.email || !isValidEmail(meetingData.email)) {
      showAlert({ type: 'error', message: "Please enter a valid email address." });
      return;
    }

    setIsSubmitting(true);

    try {
      // 1. The instant the visitor picked: their day + time, in the timezone they chose.
      const startDateUTC = new Date(startMs);

      // 2. Book it. The bookMeeting function validates the request, checks the slot
      // is still free, creates the Calendar event + Meet link and records the meeting
      // (host Date/Time are derived server-side from the same UTC instant). Visitors
      // cannot write Settings/Canary themselves. Firebase loads after the first paint.
      const [{ default: app }, { httpsCallable, getFunctions }] = await Promise.all([
        loadFirebase(), import('firebase/functions'),
      ]);
      const bookMeeting = httpsCallable(getFunctions(app), 'bookMeeting');
      const response = await bookMeeting({
        name: meetingData.name,
        email: meetingData.email.trim(),
        reason: meetingData.reason,
        startTime: startDateUTC.toISOString(),
        userLocalTime: selectedTime,
        userTimezone,
        via,
      });
      const meetLink = (response.data as BookMeetingResponse)?.link || '';
      window.dispatchEvent(new CustomEvent('revil:contact_sent', { detail: { kind: 'meeting', via } }));

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

  // Validate a proposed custom (free) time with the same rules bookMeeting applies:
  // 30+ minutes away, on one of the owner's working days, not already taken. Returns an
  // error message, or null to allow.
  const validateCustomTime = useCallback((t: string): string | null => {
    if (!selectedDate) return null;
    const at = visitorTimeToInstant(dayOf(selectedDate), t, userTimezone);
    return at === null ? 'Invalid time.' : customTimeRefusal(at, dayContext());
  }, [selectedDate, userTimezone, dayContext]);

  // Same rule as a boolean: the picker greys these out so an unavailable time can't be
  // composed at all, instead of only being rejected on Set.
  const isCustomTimeUnavailable = useCallback((t: string): boolean => validateCustomTime(t) !== null, [validateCustomTime]);

  return {
    today, limitDate,
    calendarDate, setCalendarDate, isPrevMonthDisabled, isNextMonthDisabled, isFutureMonth,
    selectedDate, setSelectedDate, selectedTime, setSelectedTime, isCustomTime, setIsCustomTime,
    meetingData, setMeetingData, isSubmitting, bookingSuccess, setBookingSuccess,
    userTimezone, setUserTimezone, tzOptions, hostTimezoneString, hostAvailability,
    availConfig, convertedSlots, daySlots,
    // Wait for real availability and booked slots before choosing an open day.
    loaded: availLoaded && slotsLoaded,
    getMeetingsForDate, meetingTimeForVisitor, isDayBookable,
    handleMeetingSubmit, validateCustomTime, isCustomTimeUnavailable,
  };
}
