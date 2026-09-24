import { useEffect, useMemo, useRef, useState } from 'react';
import { doc, onSnapshot } from 'firebase/firestore';
import { Calendar, Clock, Video, Check, ChevronLeft, ChevronRight, Globe, Loader2 } from 'lucide-react';
import { db } from '../../lib/firebase';
import Alert from '../Alert';
import Select from '../Select';
import CustomTimePicker from '../CustomTimePicker';
import HintTooltip from '../HintTooltip';
import useSafeAlert from '../../hooks/useSafeAlert';
import useTheme from '../../hooks/useTheme';
import useMeetingBooking, { getDaysInMonth } from '../../hooks/useMeetingBooking';
import { DEFAULT_BOOK_PAGE, parseBookPage, introRuns, linksFromAccount, type BookLink, type BookPageConfig } from '../../utils/bookPage';
import { availabilityStatus, utcOffsetHours } from '../../utils/availability';
import { paintBook, startBoil } from './brushes';
import useBookTrail from './useBookTrail';
import { analytics } from '../../lib/analytics/collector';
import './book.css';

const NAME_LINES = ['TEM', 'REVIL'];

/** "01:00 PM" -> "1:00 PM" for display; the stored value keeps the hook's format. */
const shortTime = (t: string) => t.replace(/^0/, '');

/** Break a handwritten line at the space nearest its middle, so two short lines stack. */
function splitSlogan(s: string): string[] {
    if (s.length <= 12 || !s.includes(' ')) return [s];
    const mid = s.length / 2;
    let best = -1;
    for (let i = 0; i < s.length; i++) if (s[i] === ' ' && (best < 0 || Math.abs(i - mid) < Math.abs(best - mid))) best = i;
    return [s.slice(0, best), s.slice(best + 1)];
}

const Chars = ({ text, className }: { text: string; className: string }) => (
    <>{[...text].map((ch, i) => <span key={i} className={className}>{ch === ' ' ? ' ' : ch}</span>)}</>
);

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

/** The owner's local time, from the zone set in Settings/Availability ("Current Time"). */
const useHostClock = (tz: string) => {
    const offset = utcOffsetHours(tz);
    const fmt = () => new Date(Date.now() + offset * 3600000).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone: 'UTC' });
    const [now, setNow] = useState(fmt);
    useEffect(() => {
        const tick = () => setNow(new Date(Date.now() + offset * 3600000).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone: 'UTC' }));
        tick();
        const id = window.setInterval(tick, 15000);
        return () => window.clearInterval(id);
    }, [offset]);
    return now;
};

export default function BookPage() {
    const isDark = useTheme();
    const rootRef = useRef<HTMLDivElement>(null);
    const boilRef = useRef<SVGFETurbulenceElement>(null);
    const { alert, showAlert, hideAlert } = useSafeAlert(4000);
    const b = useMeetingBooking({ showAlert, via: 'book' });
    useBookTrail();
    const clock = useHostClock(b.hostTimezoneString);
    const status = availabilityStatus(b.hostAvailability);

    // What the page says about the owner, edited from the dashboard (Canary → Options).
    const [content, setContent] = useState<BookPageConfig>(DEFAULT_BOOK_PAGE);
    const [contentLoaded, setContentLoaded] = useState(false);
    useEffect(() => onSnapshot(doc(db, 'Settings', 'BookPage'),
        (snap) => { setContent(parseBookPage(snap.exists() ? snap.data() : null)); setContentLoaded(true); },
        () => setContentLoaded(true)), []);

    // Links are the site's own (dashboard Settings → Social Links + contact email).
    const [links, setLinks] = useState<BookLink[]>(() => linksFromAccount(null));
    useEffect(() => onSnapshot(doc(db, 'Settings', 'Account'),
        (snap) => setLinks(linksFromAccount(snap.exists() ? snap.data() : null)),
        () => { /* offline / blocked: keep the portfolio link */ }), []);

    // ---- paint: first draw animates once the photo, fonts and content are in; later
    // draws (resize, a live content edit that moves the text) land without animation.
    const painted = useRef(false);
    const [ready, setReady] = useState(false);
    useEffect(() => {
        const root = rootRef.current;
        const img = root?.querySelector<HTMLImageElement>('.stage img');
        let alive = true;
        const timeout = new Promise(r => setTimeout(r, 1500));
        Promise.all([document.fonts.ready, img?.decode().catch(() => { }), Promise.race([timeout, new Promise<void>(r => { if (contentLoaded) r(); })])])
            .then(() => { if (alive) setReady(true); });
        // Failsafe: never leave the page hidden if the photo or fonts hang.
        const failsafe = window.setTimeout(() => { if (root && !painted.current) root.dataset.intro = 'done'; }, 4000);
        return () => { alive = false; window.clearTimeout(failsafe); };
    }, [contentLoaded]);

    useEffect(() => {
        const root = rootRef.current;
        if (!ready || !root) return;
        const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        paintBook(root, !painted.current && !reduce);
        painted.current = true;
    }, [ready, content, links]);

    useEffect(() => {
        const root = rootRef.current;
        if (!root) return;
        let w = root.clientWidth, t = 0;
        const ro = new ResizeObserver(() => {
            // Width only: a phone's URL bar changing the height must not repaint.
            if (!painted.current || Math.abs(root.clientWidth - w) < 40) return;
            w = root.clientWidth;
            window.clearTimeout(t);
            t = window.setTimeout(() => paintBook(root, false), 200);
        });
        ro.observe(root);
        return () => { ro.disconnect(); window.clearTimeout(t); };
    }, []);

    useEffect(() => {
        const turb = boilRef.current;
        if (!turb || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
        return startBoil(turb);
    }, []);

    // ---- booking view data
    const { days, firstDay } = getDaysInMonth(b.calendarDate);
    const sel = b.selectedDate;
    const dayOpen = !!sel && b.isDayBookable(sel);
    const pickedLabel = sel && b.selectedTime
        ? `Book ${sel.toLocaleDateString('en-US', { weekday: 'short' })} ${sel.getDate()} ${sel.toLocaleDateString('en-US', { month: 'short' })} at ${shortTime(b.selectedTime)}`
        : 'Pick a time';
    const canSubmit = !b.isSubmitting && !!sel && !!b.selectedTime && !!b.meetingData.name.trim() && !!b.meetingData.email.trim() && !!b.meetingData.reason.trim();
    const tzOptions = useMemo(() => b.tzOptions.map(t => ({ value: String(t.value), label: t.label })), [b.tzOptions]);
    const sloganLines = splitSlogan(content.slogan);

    return (
        <div ref={rootRef} className="bp">
            {alert?.show && <Alert type={alert.type} message={alert.message} onClose={() => hideAlert()} duration={alert.duration ?? 4000} />}
            <svg width="0" height="0" style={{ position: 'absolute' }} aria-hidden="true">
                <defs>
                    <filter id="bp-rag" x="-5%" y="-5%" width="110%" height="110%">
                        <feTurbulence ref={boilRef} type="fractalNoise" baseFrequency="0.05" numOctaves={2} seed={4} result="w" />
                        <feDisplacementMap in="SourceGraphic" in2="w" scale={6} xChannelSelector="R" yChannelSelector="G" />
                    </filter>
                    <filter id="bp-fabric" x="-10%" y="-10%" width="120%" height="120%">
                        <feTurbulence type="fractalNoise" baseFrequency="0.02 0.06" numOctaves={2} seed={9} result="f" />
                        <feDisplacementMap in="SourceGraphic" in2="f" scale={6} xChannelSelector="R" yChannelSelector="G" />
                    </filter>
                    <filter id="bp-soft" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation={10} /></filter>
                </defs>
            </svg>
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
                            <div className="cal">
                                {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((d, i) => <div key={i} className="dow" aria-hidden="true">{d}</div>)}
                                {Array.from({ length: firstDay }).map((_, i) => <span key={`e${i}`} />)}
                                {Array.from({ length: days }).map((_, i) => {
                                    const date = new Date(b.calendarDate.getFullYear(), b.calendarDate.getMonth(), i + 1);
                                    const open = b.isDayBookable(date);
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
                                ) : !dayOpen ? (
                                    <p className="empty">Nothing open on this day. Pick a date that isn&apos;t greyed out.</p>
                                ) : (
                                    <>
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
                                                <input id="bp-name" required autoComplete="name" placeholder="Your name" value={b.meetingData.name}
                                                    onChange={e => b.setMeetingData({ ...b.meetingData, name: e.target.value })} />
                                            </div>
                                            <div className="fld">
                                                <label className="label-help" htmlFor="bp-email">Email *</label>
                                                <input id="bp-email" type="email" required autoComplete="email" placeholder="The Meet link goes here" value={b.meetingData.email}
                                                    onChange={e => b.setMeetingData({ ...b.meetingData, email: e.target.value })} />
                                            </div>
                                            <div className="fld">
                                                <label className="label-help" htmlFor="bp-about">What&apos;s it about? *</label>
                                                <textarea id="bp-about" required rows={1} placeholder="A project, a role, a podcast..." value={b.meetingData.reason}
                                                    onChange={e => b.setMeetingData({ ...b.meetingData, reason: e.target.value })} />
                                            </div>
                                        </div>
                                        <button type="submit" className="btn-book" disabled={!canSubmit}>
                                            {b.isSubmitting ? <><Loader2 size={16} className="spin" aria-hidden="true" />Booking...</> : pickedLabel}
                                        </button>
                                    </>
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
