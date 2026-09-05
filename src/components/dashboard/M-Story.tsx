import { useMemo } from 'react';
import { createPortal } from 'react-dom';
import { motion } from 'motion/react';
import {
    X, Monitor, Smartphone, Tablet, Clock, Gauge, MousePointer2, Trash2,
    ArrowDownWideNarrow, Link2, Zap, Radio,
} from 'lucide-react';
import { EVENT_LABEL, formatMs, type SessionDoc, type SessionEvent } from '../../lib/analytics/types';

/**
 * One visit, end to end.
 *
 * The left column is the story in order; the right is everything we know about
 * whoever was reading. It follows the booking editor's shape on purpose - same
 * modal chrome, same two-column split, same footer - so nothing here has to be
 * learned twice.
 */

/** "EG" -> the flag. A datum about the visitor, not an icon standing in for one. */
export const flagOf = (code?: string): string => {
    if (!code || code.length !== 2) return '';
    try {
        return String.fromCodePoint(...[...code.toUpperCase()].map(c => 127397 + c.charCodeAt(0)));
    } catch {
        return '';
    }
};

/** A visit is live if it has not ended and we heard from it inside a minute. */
export const isLive = (s: SessionDoc): boolean =>
    !s.Ended && Date.now() - (s.LastSeenAt || 0) < 60_000;

const EVENT_COLOR: Record<string, string> = {
    section: '#3b82f6',
    project: '#10b981',
    project_end: '#10b98166',
    out: '#14b8a6',
    social: '#8b5cf6',
    social_back: '#8b5cf666',
    cv: '#f59e0b',
    contact: '#ec4899',
    contact_tab: '#ec489988',
    contact_sent: '#22c55e',
    copy: '#f59e0b',
    scroll: '#64748b',
    idle: '#64748b',
    wake: '#64748b',
    hide: '#64748b',
    show: '#64748b',
    rage: '#ef4444',
    print: '#f59e0b',
    end: '#64748b',
};

export const DeviceIcon = ({ type, size = 16 }: { type?: string; size?: number }) => {
    if (type === 'phone') return <Smartphone size={size} />;
    if (type === 'tablet') return <Tablet size={size} />;
    return <Monitor size={size} />;
};

/** Turn one event into the sentence it deserves. */
function describe(e: SessionEvent): string {
    const label = EVENT_LABEL[e.k] || e.k;
    if (!e.v) return label;
    if (e.k === 'out') {
        const [id, kind] = e.v.split(':');
        const what = kind === 'live' ? 'the live demo' : kind === 'github' ? 'the repo' : 'the download';
        return `Followed ${what} on ${id}`;
    }
    if (e.k === 'scroll') {
        const [section, pct] = e.v.split(':');
        return `Read ${pct}% down ${section}`;
    }
    if (e.k === 'rage') {
        return e.v === 'dead' ? 'Clicked something that does nothing' : 'Clicked the same spot over and over';
    }
    if (e.k === 'copy') return `Copied ${e.v === 'text' ? 'some text' : `your ${e.v}`}`;
    return `${label} ${e.v}`;
}

const Fact = ({ label, value, isDark }: { label: string; value: string; isDark: boolean }) => (
    <div className="flex items-baseline justify-between gap-3 py-2" style={{ borderBottom: `1px solid ${isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)'}` }}>
        <span className="text-[10px] font-bold uppercase tracking-[0.12em] shrink-0" style={{ color: 'var(--text-muted)' }}>{label}</span>
        <span className="text-xs font-semibold text-right break-words" style={{ color: isDark ? '#fff' : '#000' }}>{value || '-'}</span>
    </div>
);

const Bar = ({ label, value, max, color, suffix, isDark }: {
    label: string; value: number; max: number; color: string; suffix: string; isDark: boolean;
}) => (
    <div className="flex flex-col gap-1.5">
        <div className="flex items-center justify-between gap-3">
            <span className="text-xs font-bold truncate" style={{ color: isDark ? '#fff' : '#000' }}>{label}</span>
            <span className="text-[11px] font-bold tabular-nums shrink-0" style={{ color: 'var(--text-muted)' }}>{suffix}</span>
        </div>
        <div className="h-1.5 rounded-full overflow-hidden" style={{ background: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.05)' }}>
            <div className="h-full rounded-full" style={{ width: `${Math.max(3, Math.round((value / (max || 1)) * 100))}%`, background: color, transition: 'width 220ms ease-out' }} />
        </div>
    </div>
);

interface MStoryProps {
    story: SessionDoc | null;
    isDark: boolean;
    windowWidth: number;
    onClose: () => void;
    onDelete: (id: string) => void;
}

const MStory = ({ story, isDark, windowWidth, onClose, onDelete }: MStoryProps) => {
    const wide = windowWidth >= 900;

    const sections = useMemo(() => {
        if (!story) return [];
        return Object.entries(story.Sections || {})
            .filter(([, ms]) => ms > 0)
            .sort((a, b) => b[1] - a[1]);
    }, [story]);

    const projects = useMemo(() => {
        if (!story) return [];
        return Object.entries(story.Projects || {}).sort((a, b) => (b[1].Ms || 0) - (a[1].Ms || 0));
    }, [story]);

    const socials = useMemo(() => {
        if (!story) return [];
        return Object.entries(story.Socials || {}).sort((a, b) => (b[1].Clicks || 0) - (a[1].Clicks || 0));
    }, [story]);

    const deepest = useMemo(() => {
        if (!story) return 0;
        return Object.values(story.Scroll || {}).reduce((top, pct) => Math.max(top, pct), 0);
    }, [story]);

    if (!story) return null;

    const live = isLive(story);
    const device = story.Device || ({} as SessionDoc['Device']);
    const entry = story.Entry || ({} as SessionDoc['Entry']);
    const started = story.StartedAt ? new Date(story.StartedAt) : null;
    const utm = Object.entries(entry.Utm || {});
    const events = story.Events || [];
    const sectionMax = sections[0]?.[1] || 1;

    const summary = [
        story.Contact?.Sent ? `sent a ${story.Contact.Sent === 'meeting' ? 'booking' : 'message'}`
            : story.Contact?.Opens ? 'opened contact but left'
                : null,
        projects.length ? `${projects.length} project${projects.length === 1 ? '' : 's'}` : null,
        story.Cv?.Opens ? 'read the CV' : null,
        story.Visit > 1 ? `visit #${story.Visit}` : 'first time',
    ].filter(Boolean).join(' · ');

    return createPortal(
        <div
            className="fixed inset-0 z-[99999] flex items-center justify-center p-3 sm:p-4 bg-black/50 backdrop-blur-md animate-fade-in"
            onClick={onClose}
        >
            <motion.div
                initial={{ opacity: 0, scale: 0.97, y: 8 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
                className="glass-panel w-full max-w-4xl flex flex-col overflow-hidden shadow-2xl"
                style={{ maxHeight: '90vh' }}
                onClick={e => e.stopPropagation()}
            >
                {/* ── header ─────────────────────────────────────────────── */}
                <div className="flex items-start gap-4 p-5 sm:p-6 border-b" style={{ borderColor: 'var(--card-border)' }}>
                    <div className="w-11 h-11 rounded-2xl grid place-items-center shrink-0 text-xl"
                        style={{ background: isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.04)' }}>
                        {flagOf(story.Geo?.Code) || <DeviceIcon type={device.Type} size={20} />}
                    </div>
                    <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                            <h2 className="heading-sm m-0 truncate">
                                {story.Geo?.Country || 'Somewhere'}
                            </h2>
                            {live && (
                                <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-bold"
                                    style={{ background: 'rgba(34,197,94,0.14)', color: '#22c55e' }}>
                                    <Radio size={10} className="animate-pulse" /> READING NOW
                                </span>
                            )}
                            {story.Link && (
                                <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-bold"
                                    style={{ background: 'rgba(168,85,247,0.14)', color: '#a855f7' }}>
                                    <Link2 size={10} /> {story.Link.Name}
                                </span>
                            )}
                            {story.Legacy && (
                                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold"
                                    style={{ background: isDark ? 'rgba(255,255,255,0.07)' : 'rgba(0,0,0,0.06)', color: 'var(--text-muted)' }}>
                                    BEFORE THE REWRITE
                                </span>
                            )}
                        </div>
                        <p className="text-xs mt-1 truncate" style={{ color: 'var(--text-muted)' }}>
                            {started ? started.toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : 'Date unknown'}
                            {summary ? ` · ${summary}` : ''}
                        </p>
                    </div>
                    <button onClick={onClose} aria-label="Close" className="w-9 h-9 grid place-items-center rounded-xl cursor-pointer transition-colors hover:bg-black/5 dark:hover:bg-white/10 shrink-0" style={{ color: 'var(--text-muted)' }}>
                        <X size={18} />
                    </button>
                </div>

                {/* ── stat strip ─────────────────────────────────────────── */}
                <div className="grid gap-px px-5 sm:px-6 py-4" style={{
                    gridTemplateColumns: `repeat(${windowWidth < 560 ? 2 : 4}, minmax(0, 1fr))`,
                    borderBottom: '1px solid var(--card-border)',
                }}>
                    {[
                        { icon: <Zap size={14} />, label: 'Active', value: formatMs(story.ActiveMs || 0), tint: '#22c55e' },
                        { icon: <Clock size={14} />, label: 'Tab open', value: formatMs(story.OpenMs || 0), tint: '#3b82f6' },
                        { icon: <ArrowDownWideNarrow size={14} />, label: 'Read down', value: `${deepest}%`, tint: '#8b5cf6' },
                        { icon: <MousePointer2 size={14} />, label: 'Events', value: String(events.length), tint: '#f59e0b' },
                    ].map(stat => (
                        <div key={stat.label} className="flex flex-col gap-1 px-1">
                            <span className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.12em]" style={{ color: stat.tint }}>
                                {stat.icon}{stat.label}
                            </span>
                            <span className="text-lg font-black tabular-nums" style={{ color: isDark ? '#fff' : '#000' }}>{stat.value}</span>
                        </div>
                    ))}
                </div>

                {/* ── body ───────────────────────────────────────────────── */}
                <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar">
                    <div className="grid" style={{
                        gridTemplateColumns: wide ? 'minmax(0, 1fr) 296px' : 'minmax(0, 1fr)',
                        gap: wide ? '0' : '0',
                    }}>
                        {/* the story itself */}
                        <div className="p-5 sm:p-6 flex flex-col gap-6">
                            <div className="flex flex-col gap-1">
                                <span className="text-[10px] font-black uppercase tracking-[0.18em]" style={{ color: 'var(--text-muted)' }}>What they did</span>
                                {events.length === 0 && (
                                    <p className="text-sm mt-2" style={{ color: 'var(--text-muted)' }}>
                                        {story.Legacy
                                            ? 'This one predates per-visit recording, so only the totals survived.'
                                            : 'They left before anything happened.'}
                                    </p>
                                )}
                            </div>

                            {events.length > 0 && (
                                <ol className="flex flex-col m-0 p-0 list-none">
                                    {events.map((e, i) => (
                                        <li key={`${e.t}-${i}`} className="flex gap-3 items-start group">
                                            <div className="flex flex-col items-center self-stretch shrink-0">
                                                <span className="w-2 h-2 rounded-full mt-1.5" style={{ background: EVENT_COLOR[e.k] || '#64748b' }} />
                                                {i < events.length - 1 && (
                                                    <span className="w-px flex-1 min-h-3" style={{ background: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.07)' }} />
                                                )}
                                            </div>
                                            <div className="flex items-baseline justify-between gap-3 flex-1 pb-3 min-w-0">
                                                <span className="text-sm" style={{ color: isDark ? 'rgba(255,255,255,0.86)' : 'rgba(0,0,0,0.82)' }}>
                                                    {describe(e)}
                                                </span>
                                                <span className="text-[10px] font-bold tabular-nums shrink-0" style={{ color: 'var(--text-muted)' }}>
                                                    {formatMs(e.t)}
                                                </span>
                                            </div>
                                        </li>
                                    ))}
                                </ol>
                            )}

                            {story.EventsCut && (
                                <p className="text-[11px]" style={{ color: 'var(--text-muted)' }}>
                                    The timeline hit its 500-event cap; the totals above still count everything.
                                </p>
                            )}

                            {sections.length > 0 && (
                                <div className="flex flex-col gap-3">
                                    <span className="text-[10px] font-black uppercase tracking-[0.18em]" style={{ color: 'var(--text-muted)' }}>Where the time went</span>
                                    {sections.map(([name, ms]) => (
                                        <Bar key={name} label={name} value={ms} max={sectionMax} color="#3b82f6" suffix={formatMs(ms)} isDark={isDark} />
                                    ))}
                                </div>
                            )}

                            {projects.length > 0 && (
                                <div className="flex flex-col gap-3">
                                    <span className="text-[10px] font-black uppercase tracking-[0.18em]" style={{ color: 'var(--text-muted)' }}>Projects</span>
                                    {projects.map(([id, p]) => {
                                        const outbound = [
                                            p.Live ? `${p.Live}x demo` : '',
                                            p.Github ? `${p.Github}x repo` : '',
                                            p.Download ? `${p.Download}x download` : '',
                                        ].filter(Boolean).join(' · ');
                                        return (
                                            <div key={id} className="flex flex-col gap-1">
                                                <Bar label={id} value={p.Ms || 0} max={projects[0][1].Ms || 1} color="#10b981"
                                                    suffix={`${formatMs(p.Ms || 0)} · ${p.Opens}x`} isDark={isDark} />
                                                {outbound && (
                                                    <span className="text-[10px] font-semibold" style={{ color: '#14b8a6' }}>{outbound}</span>
                                                )}
                                            </div>
                                        );
                                    })}
                                </div>
                            )}

                            {socials.length > 0 && (
                                <div className="flex flex-col gap-3">
                                    <span className="text-[10px] font-black uppercase tracking-[0.18em]" style={{ color: 'var(--text-muted)' }}>Left for</span>
                                    {socials.map(([name, s]) => (
                                        <Bar key={name} label={name} value={s.AwayMs || 0} max={socials[0][1].AwayMs || 1} color="#8b5cf6"
                                            suffix={`${s.Clicks}x · away ${formatMs(s.AwayMs || 0)}`} isDark={isDark} />
                                    ))}
                                </div>
                            )}
                        </div>

                        {/* who they were */}
                        <div className="p-5 sm:p-6 flex flex-col gap-1"
                            style={{
                                background: isDark ? 'rgba(255,255,255,0.02)' : 'rgba(0,0,0,0.015)',
                                borderLeft: wide ? '1px solid var(--card-border)' : 'none',
                                borderTop: wide ? 'none' : '1px solid var(--card-border)',
                            }}>
                            <span className="text-[10px] font-black uppercase tracking-[0.18em] mb-2" style={{ color: 'var(--text-muted)' }}>Who was reading</span>
                            <Fact label="Their clock" value={device.LocalTime ? `${device.LocalTime} local` : ''} isDark={isDark} />
                            <Fact label="Timezone" value={device.Timezone} isDark={isDark} />
                            <Fact label="Device" value={[device.Type, device.OS].filter(Boolean).join(' · ')} isDark={isDark} />
                            <Fact label="Browser" value={device.Browser} isDark={isDark} />
                            <Fact label="Screen" value={device.Screen} isDark={isDark} />
                            <Fact label="Window" value={device.Viewport} isDark={isDark} />
                            <Fact label="Language" value={device.Language} isDark={isDark} />
                            <Fact label="Theme" value={device.Theme} isDark={isDark} />
                            <Fact label="Came from" value={story.Source?.Name || entry.Ref || 'Direct'} isDark={isDark} />
                            <Fact label="Landed on" value={entry.Section} isDark={isDark} />
                            <Fact label="Left from" value={story.Exit?.Section || ''} isDark={isDark} />
                            <Fact label="Idle" value={formatMs(story.IdleMs || 0)} isDark={isDark} />
                            {story.Rage > 0 && <Fact label="Frustration" value={`${story.Rage} dead clicks`} isDark={isDark} />}
                            {story.Copies > 0 && <Fact label="Copied" value={`${story.Copies}x`} isDark={isDark} />}
                            {story.Prints > 0 && <Fact label="Printed" value={`${story.Prints}x`} isDark={isDark} />}
                            {story.Perf?.LoadMs ? (
                                <Fact label="Page load" value={`${(story.Perf.LoadMs / 1000).toFixed(1)}s${story.Perf.LcpMs ? ` · LCP ${(story.Perf.LcpMs / 1000).toFixed(1)}s` : ''}`} isDark={isDark} />
                            ) : null}

                            {utm.length > 0 && (
                                <div className="flex flex-wrap gap-1.5 pt-3">
                                    {utm.map(([k, v]) => (
                                        <span key={k} className="px-2 py-0.5 rounded-md text-[10px] font-bold"
                                            style={{ background: 'rgba(59,130,246,0.12)', color: '#3b82f6' }}>
                                            {k}: {v}
                                        </span>
                                    ))}
                                </div>
                            )}

                            <div className="flex items-center gap-2 pt-4 text-[10px] font-semibold" style={{ color: 'var(--text-muted)' }}>
                                <Gauge size={12} />
                                {story.Flushes || 0} check-ins · id {story.Id.slice(0, 12)}
                            </div>
                        </div>
                    </div>
                </div>

                {/* ── footer ─────────────────────────────────────────────── */}
                <div className="flex items-center justify-between gap-3 px-5 sm:px-6 py-4 border-t" style={{ borderColor: 'var(--card-border)' }}>
                    <button
                        type="button"
                        onClick={() => onDelete(story.Id)}
                        className="inline-flex items-center gap-2 px-3 h-10 rounded-xl text-xs font-bold cursor-pointer transition-colors text-red-500/80 hover:text-red-500 hover:bg-red-500/10"
                    >
                        <Trash2 size={14} /> Delete this visit
                    </button>
                    <button type="button" onClick={onClose} className="btn btn-secondary !px-6 !py-2.5">Close</button>
                </div>
            </motion.div>
        </div>,
        document.body,
    );
};

export default MStory;
