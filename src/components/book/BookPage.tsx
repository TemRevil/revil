import { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { Calendar, Clock, Video, Check, ChevronLeft, ChevronRight, Globe, Loader2 } from 'lucide-react';
import { deferFirebase, watchDoc } from '../../lib/liveDoc';
import useSafeAlert from '../../hooks/useSafeAlert';
import useTheme from '../../hooks/useTheme';
import useMeetingBooking, { getDaysInMonth } from '../../hooks/useMeetingBooking';
import { parseBookPage, introRuns, linksFromAccount, type BookLink } from '../../utils/bookPage';
import { availabilityStatus } from '../../utils/availability';
import { Chars, PaintDefs, splitSlogan, useHostClock, usePaint } from './paintKit';
import useBookTrail from './useBookTrail';
import { analytics } from '../../lib/analytics/collector';
import bookSnapshot from '../../data/book.snapshot.json';
import './book.css';

// The alert and the day's form (the time zone list, the custom time picker, the hints) are
// the only parts that need motion / anime.js, and none of them is on the first screen: the
// alert follows an action, the form waits for the owner's hours. They load as their own
// chunks once the page has painted.
const loadAlert = () => import('../Alert');
const loadSelect = () => import('../Select');
const loadTimePicker = () => import('../CustomTimePicker');
const loadHint = () => import('../HintTooltip');
const Alert = lazy(loadAlert);
const Select = lazy(loadSelect);
const CustomTimePicker = lazy(loadTimePicker);
const HintTooltip = lazy(loadHint);

// This page's chunk arrives after the window's load event, so Firebase would otherwise start
// loading (with App Check's ~350KB reCAPTCHA) while the photo and fonts are still coming in.
// It waits for the entrance instead: see the photo's fade-in below.
let photoShowing: () => void = () => { };
deferFirebase(new Promise<void>((resolve) => { photoShowing = resolve; }));

const NAME_LINES = ['TEM', 'REVIL'];

// The page draws before Firebase has loaded, with what it said last time in this browser,
// else the build's snapshot (scripts/sync-projects.mjs). The live documents replace it as
// soon as they arrive.
const PAGE_KEY = 'revil_book_page';
const LINKS_KEY = 'revil_book_links';
function seed(key: string, fallback: Record<string, unknown>): Record<string, unknown> {
    try {
        const cached = JSON.parse(localStorage.getItem(key) || 'null');
        if (cached && typeof cached === 'object') return cached;
    } catch { /* ignore */ }
    return fallback;
}
const remember = (key: string, value: unknown) => { try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* ignore */ } };

/** The day's panel while the owner's hours (or the form's chunk) are on their way. */
const DayLoading = () => (
    <p className="empty loading" role="status"><Loader2 size={16} className="spin" aria-hidden="true" />Loading open times...</p>
);

/** "01:00 PM" -> "1:00 PM" for display; the stored value keeps the hook's format. */
const shortTime = (t: string) => t.replace(/^0/, '');

const LinkIcon = ({ kind }: { kind: BookLink['kind'] }) => {
    switch (kind) {
        case 'email': return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="3" y="5" width="18" height="14" rx="2" /><path d="M3 7l9 6 9-6" /></svg>;
        case 'github': return <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 2a10 10 0 0 0-3.2 19.5c.5.1.7-.2.7-.5v-1.7c-2.8.6-3.4-1.3-3.4-1.3-.5-1.2-1.1-1.5-1.1-1.5-.9-.6.1-.6.1-.6 1 .1 1.5 1 1.5 1 .9 1.6 2.4 1.1 3 .9.1-.7.4-1.1.6-1.4-2.2-.3-4.6-1.1-4.6-5a3.9 3.9 0 0 1 1-2.7c-.1-.3-.5-1.3.1-2.7 0 0 .8-.3 2.8 1a9.6 9.6 0 0 1 5 0c2-1.3 2.8-1 2.8-1 .6 1.4.2 2.4.1 2.7a3.9 3.9 0 0 1 1 2.7c0 3.9-2.4 4.7-4.6 5 .4.3.7.9.7 1.9V21c0 .3.2.6.7.5A10 10 0 0 0 12 2z" /></svg>;
        case 'linkedin': return <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M4.98 3.5a2.5 2.5 0 1 1 0 5 2.5 2.5 0 0 1 0-5zM3 9.5h4V21H3zM9.5 9.5h3.8v1.6h.1c.5-1 1.8-2 3.8-2 4 0 4.8 2.6 4.8 6V21h-4v-5.2c0-1.2 0-2.8-1.7-2.8s-2 1.3-2 2.7V21h-4z" /></svg>;
        case 'instagram': return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="5" /><circle cx="12" cy="12" r="4" /><circle cx="17.5" cy="6.5" r="1" fill="currentColor" /></svg>;
        case 'portfolio': return null;
        default: return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.7 1.7" /><path d="M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7l1.7-1.7" /></svg>;
    }
};

export default function BookPage() {
    const isDark = useTheme();
    const rootRef = useRef<HTMLDivElement>(null);
    const { alert, showAlert, hideAlert } = useSafeAlert(4000);
    const b = useMeetingBooking({ showAlert, via: 'book' });
    useBookTrail();
    const clock = useHostClock(b.hostTimezoneString);
    const status = availabilityStatus(b.hostAvailability);

    // What the page says about the owner, edited from the dashboard (Canary → Options).
    // Seeded (see seed()), so the first paint never waits for Firestore.
    const [content, setContent] = useState(() => parseBookPage(seed(PAGE_KEY, bookSnapshot.page)));
    useEffect(() => watchDoc(['Settings', 'BookPage'],
        (data) => { setContent(parseBookPage(data)); remember(PAGE_KEY, data ?? {}); },
        () => { /* offline / blocked: keep the seeded copy */ }), []);

    // Links are the site's own (dashboard Settings → Social Links + contact email).
    const [links, setLinks] = useState<BookLink[]>(() => linksFromAccount(seed(LINKS_KEY, bookSnapshot.account)));
    useEffect(() => watchDoc(['Settings', 'Account'],
        (data) => { setLinks(linksFromAccount(data)); remember(LINKS_KEY, { Email: data?.Email, 'Social Links': data?.['Social Links'] }); },
        () => { /* offline / blocked: keep the seeded links */ }), []);

    // ---- paint: first draw animates once the photo and fonts are in; later draws
    // (resize, a live content edit that moves the text) land without animation.
    const [ready, setReady] = useState(false);
    const { boilRef, painted } = usePaint(rootRef, ready, [content, links]);
    useEffect(() => {
        const root = rootRef.current;
        const img = root?.querySelector<HTMLImageElement>('.stage img');
        let alive = true;
        Promise.all([document.fonts.ready, img?.decode().catch(() => { })])
            .then(() => { if (alive) setReady(true); });
        // Failsafe: never leave the page hidden if the photo or fonts hang.
        const failsafe = window.setTimeout(() => {
            if (root && !painted.current) root.dataset.intro = 'done';
            photoShowing();
        }, 4000);
        return () => { alive = false; window.clearTimeout(failsafe); };
    }, [painted]);
    // Once the photo has faded in (the page's largest paint; textIn in brushes.ts runs it
    // from 600ms to 1.8s into the entrance), let Firebase and the deferred chunks load: the
    // reCAPTCHA script alone is ~350KB to parse, and on a phone that stalls the entrance.
    // usePaint's effect has already started the entrance by the time this runs.
    useEffect(() => {
        if (!ready) return;
        let released = false;
        const release = () => {
            if (released) return;
            released = true;
            photoShowing();
            void Promise.all([loadAlert(), loadSelect(), loadTimePicker(), loadHint()]).catch(() => { /* lazy() retries on render */ });
        };
        const fades = rootRef.current?.querySelector('.stage img')?.getAnimations() ?? [];
        Promise.all(fades.map(a => a.finished)).then(release, release);
        // A background tab doesn't run the fade; don't hold the booking back for it.
        const t = window.setTimeout(release, 3000);
        return () => window.clearTimeout(t);
    }, [ready]);

    // ---- booking view data
    const { days, firstDay } = getDaysInMonth(b.calendarDate);
    const sel = b.selectedDate;
    // Until the owner's hours and booked slots arrive, no day is offered: the defaults
    // would open the wrong days and then take them back.
    const isOpen = (date: Date) => b.loaded && b.isDayBookable(date);
    const dayOpen = !!sel && isOpen(sel);
    const pickedLabel = sel && b.selectedTime
        ? `Book ${sel.toLocaleDateString('en-US', { weekday: 'short' })} ${sel.getDate()} ${sel.toLocaleDateString('en-US', { month: 'short' })} at ${shortTime(b.selectedTime)}`
        : 'Pick a time';
    const canSubmit = !b.isSubmitting && !!sel && !!b.selectedTime && !!b.meetingData.name.trim() && !!b.meetingData.email.trim() && !!b.meetingData.reason.trim();
    const tzOptions = useMemo(() => b.tzOptions.map(t => ({ value: String(t.value), label: t.label })), [b.tzOptions]);
    const sloganLines = splitSlogan(content.slogan);

    return (
        <div ref={rootRef} className="bp">
            {alert?.show && <Suspense fallback={null}><Alert type={alert.type} message={alert.message} onClose={() => hideAlert()} duration={alert.duration ?? 4000} /></Suspense>}
            <PaintDefs boilRef={boilRef} />
            <div className="wall" aria-hidden="true" />
            <svg className="paint-bg" aria-hidden="true" />

            <div className="layout">
                <section className="hero">
                    <div className="this-is" aria-hidden="true" data-write><Chars text="THIS IS" className="ch" /></div>
                    <h1 className="name">
                        <span className="sr-only">Tem Revil, {content.slogan}</span>
                        {NAME_LINES.map(line => <span key={line} aria-hidden="true"><Chars text={line} className="name-char" /></span>)}
                    </h1>
                    <div className="stage stage-back" aria-hidden="true"><svg className="ring-back" /></div>
                    <div className="stage">
                        <img alt="Tem Revil" src="/book/tem-cutout.webp" width={920} height={1286} fetchPriority="high" decoding="async" />
                        <svg className="shirt" aria-hidden="true" />
                        <svg className="ring-front" aria-hidden="true" />
                    </div>
                    <div className="slogan" aria-hidden="true" data-write>
                        {sloganLines.map((line, i) => <span key={i}>{i > 0 && <br />}<Chars text={line} className="ch" /></span>)}
                    </div>
                    <div className="pills">
                        <span className="pill"><span className="dot" aria-hidden="true" style={{ '--dot': status.color } as React.CSSProperties}><i /><i /></span>{status.label}</span>
                        <span className="pill">{clock}<span className="zone">{b.hostTimezoneString.split(' ')[0]}</span></span>
                    </div>
                </section>

                <section className="side">
                    {content.intro.trim() && (
                        <p className="pitch">{introRuns(content.intro).map((r, i) => r.bold ? <b key={i}>{r.text}</b> : <span key={i}>{r.text}</span>)}</p>
                    )}
                    {content.tags.length > 0 && (
                        <ul className="builds" aria-label="What I build">{content.tags.map(t => <li key={t}>{t}</li>)}</ul>
                    )}

                    <form className="booking glass" onSubmit={b.handleMeetingSubmit} aria-labelledby="bp-title">
                        <div className="cal-card">
                            <div className="box-head">
                                <Calendar size={22} aria-hidden="true" />
                                <h2 id="bp-title">Book a call</h2>
                            </div>
                            <ul className="meta">
                                <li><Clock size={15} aria-hidden="true" />30 minutes</li>
                                <li><Video size={15} aria-hidden="true" />Google Meet</li>
                                <li><Check size={15} aria-hidden="true" />Free</li>
                            </ul>
                            <div className="month">
                                <h3>{b.calendarDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}</h3>
                                <div>
                                    <button type="button" aria-label="Previous month" disabled={b.isPrevMonthDisabled}
                                        onClick={() => b.setCalendarDate(new Date(b.calendarDate.getFullYear(), b.calendarDate.getMonth() - 1, 1))}>
                                        <ChevronLeft size={16} strokeWidth={2.5} />
                                    </button>
                                    <button type="button" aria-label="Next month" disabled={b.isNextMonthDisabled}
                                        onClick={() => b.setCalendarDate(new Date(b.calendarDate.getFullYear(), b.calendarDate.getMonth() + 1, 1))}>
                                        <ChevronRight size={16} strokeWidth={2.5} />
                                    </button>
                                </div>
                            </div>
                            <div className="cal" aria-busy={!b.loaded}>
                                {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((d, i) => <div key={i} className="dow" aria-hidden="true">{d}</div>)}
                                {Array.from({ length: firstDay }).map((_, i) => <span key={`e${i}`} />)}
                                {Array.from({ length: days }).map((_, i) => {
                                    const date = new Date(b.calendarDate.getFullYear(), b.calendarDate.getMonth(), i + 1);
                                    const open = isOpen(date);
                                    const isSel = sel?.toDateString() === date.toDateString();
                                    const booked = b.getMeetingsForDate(date).length;
                                    return (
                                        <button key={i} type="button" disabled={!open} aria-pressed={isSel}
                                            aria-label={date.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' }) + (open ? '' : ', unavailable')}
                                            onClick={() => b.setSelectedDate(date)}>
                                            <span>{i + 1}</span>
                                            {open && booked > 0 && !isSel && <span className="booked" aria-hidden="true">{Array.from({ length: Math.min(3, booked) }).map((_, k) => <i key={k} />)}</span>}
                                        </button>
                                    );
                                })}
                            </div>
                        </div>

                        <div className="day-card">
                            <div className="day-head">
                                <h3>{sel ? sel.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' }) : 'Pick a date'}</h3>
                            </div>
                            <div className="day-body">
                                {b.bookingSuccess ? (
                                    <div className="done" role="status">
                                        <span className="tick"><Check size={30} /></span>
                                        <h3>You&apos;re booked</h3>
                                        <p>{b.bookingSuccess.date} at {shortTime(b.bookingSuccess.time)}, your time. The invite is on its way to your inbox.</p>
                                        {b.bookingSuccess.link.startsWith('http') && (
                                            <div className="meet">Google Meet link<a href={b.bookingSuccess.link} target="_blank" rel="noopener noreferrer">{b.bookingSuccess.link}</a></div>
                                        )}
                                        <button type="button" className="again" onClick={() => b.setBookingSuccess(null)}>Book another call</button>
                                    </div>
                                ) : !b.loaded ? (
                                    <DayLoading />
                                ) : !dayOpen ? (
                                    <p className="empty">Nothing open on this day. Pick a date that isn&apos;t greyed out.</p>
                                ) : (
                                    <Suspense fallback={<DayLoading />}>
                                        <div>
                                            <div className="label-help muted"><Globe size={14} aria-hidden="true" />Your time zone
                                                <HintTooltip text="Detected automatically. Change it and the times below follow." isDark={isDark} />
                                            </div>
                                            <Select value={String(b.userTimezone)} options={tzOptions} onChange={(v) => b.setUserTimezone(Number(v))} isDark={isDark} searchable aria-label="Your time zone" />
                                        </div>
                                        <div>
                                            <h4 className="slots-title"><Clock size={16} aria-hidden="true" />Available slots</h4>
                                            <div className="slots">
                                                {b.convertedSlots.map((time, idx) => {
                                                    const hostTime = b.timeSlots[idx];
                                                    const off = b.getMeetingsForDate(sel).some(m => m.Time === hostTime) || b.isTimePassed(sel, hostTime);
                                                    return (
                                                        <button key={time} type="button" disabled={off} aria-pressed={b.selectedTime === time && !b.isCustomTime}
                                                            aria-label={`${shortTime(time)} your time${off ? ', unavailable' : ''}`}
                                                            onClick={() => { b.setSelectedTime(time); b.setIsCustomTime(false); }}>
                                                            {shortTime(time)}
                                                        </button>
                                                    );
                                                })}
                                                <CustomTimePicker
                                                    isDark={isDark}
                                                    active={b.isCustomTime}
                                                    value={b.selectedTime}
                                                    validate={b.validateCustomTime}
                                                    isUnavailable={b.isCustomTimeUnavailable}
                                                    onError={(msg) => showAlert({ type: 'warning', message: msg })}
                                                    onApply={(t) => { b.setSelectedTime(t); b.setIsCustomTime(!b.convertedSlots.includes(t)); }}
                                                />
                                            </div>
                                        </div>
                                        <div className="fields">
                                            <div className="fld">
                                                <label className="label-help" htmlFor="bp-name">Name *
                                                    <HintTooltip text="Your name shows on the calendar invite. A nickname is fine." isDark={isDark} />
                                                </label>
                                                <input id="bp-name" name="name" required autoComplete="name" placeholder="Your name" value={b.meetingData.name}
                                                    onChange={e => b.setMeetingData({ ...b.meetingData, name: e.target.value })} />
                                            </div>
                                            <div className="fld">
                                                <label className="label-help" htmlFor="bp-email">Email *</label>
                                                <input id="bp-email" name="email" type="email" required autoComplete="email" placeholder="The Meet link goes here" value={b.meetingData.email}
                                                    onChange={e => b.setMeetingData({ ...b.meetingData, email: e.target.value })} />
                                            </div>
                                            <div className="fld">
                                                <label className="label-help" htmlFor="bp-about">What&apos;s it about? *</label>
                                                <textarea id="bp-about" name="reason" required rows={1} placeholder="A project, a role, a podcast..." value={b.meetingData.reason}
                                                    onChange={e => b.setMeetingData({ ...b.meetingData, reason: e.target.value })} />
                                            </div>
                                        </div>
                                        <button type="submit" className="btn-book" disabled={!canSubmit}>
                                            {b.isSubmitting ? <><Loader2 size={16} className="spin" aria-hidden="true" />Booking...</> : pickedLabel}
                                        </button>
                                    </Suspense>
                                )}
                            </div>
                        </div>
                    </form>

                    {links.length > 0 && (
                        <nav className="reach" aria-label="Reach me">
                            {links.map(l => {
                                const external = /^https?:/i.test(l.url);
                                return (
                                    <a key={l.id} href={l.url} className={l.kind === 'portfolio' ? 'full' : undefined}
                                        onClick={() => { if (l.kind !== 'portfolio') analytics.socialClick(l.kind === 'email' ? 'Email' : l.label); }}
                                        {...(external ? { target: '_blank', rel: 'noopener noreferrer' } : {})}>
                                        <LinkIcon kind={l.kind} /><span>{l.label}</span>
                                    </a>
                                );
                            })}
                        </nav>
                    )}
                </section>
            </div>
        </div>
    );
}
