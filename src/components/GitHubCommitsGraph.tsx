import { useEffect, useState, useRef, useMemo, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';

interface ContributionDay {
    date: string;
    count: number;
    level: number; // 0-4
}

interface GitHubCommitsGraphProps {
    username?: string;
    onStreakCalculated?: (streak: number) => void;
}

/** Count consecutive contribution days ending today (or yesterday if today is empty).
 *  Uses UTC date formatting to match the API + cell rendering, which also use UTC.
 *  This avoids off-by-one errors near midnight in non-UTC timezones. */
function calculateStreak(yearlyData: Record<number, ContributionDay[]>): number {
    const countByDate = new Map<string, number>();
    Object.values(yearlyData).forEach(days =>
        days.forEach(d => { if (d.count >= 0) countByDate.set(d.date, d.count); }),
    );

    // UTC-based YYYY-MM-DD — matches what the API returns and what we render
    const fmt = (d: Date) =>
        `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;

    const today = new Date();
    const check = new Date(today);

    // If today has no contributions yet, start counting from yesterday
    if ((countByDate.get(fmt(today)) || 0) === 0) {
        check.setUTCDate(check.getUTCDate() - 1);
    }

    let streak = 0;
    while ((countByDate.get(fmt(check)) || 0) > 0) {
        streak++;
        check.setUTCDate(check.getUTCDate() - 1);
    }
    return streak;
}

const GITHUB_USERNAME = 'TemRevil';

// Mock data fallback for multiple years
const generateMockData = (): { yearly: Record<number, ContributionDay[]>; totals: Record<number, number> } => {
    const now = new Date();
    const currentYear = now.getFullYear();
    const yearly: Record<number, ContributionDay[]> = {};
    const totals: Record<number, number> = {};

    for (let y = currentYear - 3; y <= currentYear; y++) {
        const days: ContributionDay[] = [];
        const start = new Date(y, 0, 1);
        const end = y === currentYear ? now : new Date(y, 11, 31);
        let total = 0;

        for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
            const dow = d.getDay();
            let prob = dow === 0 || dow === 6 ? 0.25 : 0.55;
            if (Math.random() > 0.7) prob += 0.2;
            let count = 0;
            if (Math.random() < prob) {
                const r = Math.random();
                if (r < 0.4) count = Math.floor(Math.random() * 3) + 1;
                else if (r < 0.7) count = Math.floor(Math.random() * 5) + 3;
                else if (r < 0.9) count = Math.floor(Math.random() * 8) + 5;
                else count = Math.floor(Math.random() * 15) + 8;
            }
            const level = count === 0 ? 0 : count <= 2 ? 1 : count <= 5 ? 2 : count <= 10 ? 3 : 4;
            days.push({ date: new Date(d).toISOString().split('T')[0], count, level });
            total += count;
        }
        yearly[y] = days;
        totals[y] = total;
    }
    return { yearly, totals };
};

const GitHubCommitsGraph = ({ username = GITHUB_USERNAME, onStreakCalculated }: GitHubCommitsGraphProps) => {
    const thisYear = new Date().getFullYear();

    const [yearlyData, setYearlyData] = useState<Record<number, ContributionDay[]>>({});
    const [yearlyTotals, setYearlyTotals] = useState<Record<number, number>>({});
    const [availableYears, setAvailableYears] = useState<number[]>([thisYear]);
    const [currentYear, setCurrentYear] = useState<number>(thisYear);

    // Computed once per render — used inside the cell map below
    // UTC to match the API's date format (avoids off-by-one near midnight in non-UTC zones)
    const todayStr = useMemo(() => {
        const today = new Date();
        return `${today.getUTCFullYear()}-${String(today.getUTCMonth() + 1).padStart(2, '0')}-${String(today.getUTCDate()).padStart(2, '0')}`;
    }, []);
    const [slideDir, setSlideDir] = useState<number>(0); // -1 = left (older), 1 = right (newer)
    const [isLoading, setIsLoading] = useState(true);
    const [hasAppeared, setHasAppeared] = useState(false);
    const [hoveredDay, setHoveredDay] = useState<ContributionDay | null>(null);
    const [tooltipPos, setTooltipPos] = useState({ x: 0, y: 0 });
    const containerRef = useRef<HTMLDivElement>(null);
    const graphRef = useRef<HTMLDivElement>(null);
    const [containerWidth, setContainerWidth] = useState(0);

    // Wheel / touch navigation refs
    const lastNavTime = useRef(0);
    const touchStartX = useRef(0);

    // ── Fetch all years at once (with timeout + localStorage cache + unmount guard) ──
    useEffect(() => {
        const CACHE_KEY = `gh_contrib_${username}`;
        let ignore = false;
        const controller = new AbortController();

        /** Shared logic: turn raw API JSON into component state. */
        const applyData = (data: { contributions?: unknown[]; total?: Record<string, unknown> }) => {
            if (ignore) return false;
            if (!data.contributions || !Array.isArray(data.contributions)) return false;

            const byYear: Record<number, ContributionDay[]> = {};
            data.contributions.forEach((day: unknown) => {
                if (!day || typeof day !== 'object') return;
                const d = day as { date?: unknown; count?: unknown; level?: unknown };
                if (typeof d.date !== 'string') return;
                const count = typeof d.count === 'number' ? d.count : 0;
                const level = typeof d.level === 'number' ? d.level : 0;
                const y = parseInt(d.date.split('-')[0], 10);
                if (isNaN(y)) return;
                if (!byYear[y]) byYear[y] = [];
                byYear[y].push({ date: d.date, count, level });
            });

            const tots: Record<number, number> = {};
            if (data.total) {
                Object.entries(data.total).forEach(([k, v]) => {
                    const y = parseInt(k, 10);
                    if (!isNaN(y) && typeof v === 'number') tots[y] = v;
                });
            }
            Object.entries(byYear).forEach(([ys, days]) => {
                const y = parseInt(ys, 10);
                if (!(y in tots)) tots[y] = (days as ContributionDay[]).reduce((s, d) => s + d.count, 0);
            });

            const years = Object.keys(byYear).map(Number).sort((a, b) => a - b);
            if (ignore || years.length === 0) return false;
            setYearlyData(byYear);
            setYearlyTotals(tots);
            setAvailableYears(years);
            setCurrentYear(years[years.length - 1]);
            setIsLoading(false);

            // Report streak (guarded — parent may have unmounted)
            if (!ignore) onStreakCalculated?.(calculateStreak(byYear));
            return true;
        };

        const fetchAll = async () => {
            // 1) Try the API with a 10-second timeout (uses master controller — aborts on unmount)
            const tid = setTimeout(() => controller.abort(), 10_000);
            try {
                const res = await fetch(
                    `https://github-contributions-api.jogruber.de/v4/${username}`,
                    { signal: controller.signal },
                );
                clearTimeout(tid);
                if (ignore) return;

                if (res.ok) {
                    const json = await res.json();
                    if (ignore) return;
                    if (applyData(json)) {
                        try { localStorage.setItem(CACHE_KEY, JSON.stringify(json)); } catch { /* quota */ }
                        return;
                    }
                }
            } catch { clearTimeout(tid); /* timeout or network error — fall through */ }

            if (ignore) return;

            // 2) Try localStorage cache
            try {
                const cached = localStorage.getItem(CACHE_KEY);
                if (cached && applyData(JSON.parse(cached))) return;
            } catch { /* corrupt cache */ }

            if (ignore) return;

            // 3) Final fallback: deterministic mock data
            const mock = generateMockData();
            const years = Object.keys(mock.yearly).map(Number).sort((a, b) => a - b);
            setYearlyData(mock.yearly);
            setYearlyTotals(mock.totals);
            setAvailableYears(years);
            setCurrentYear(years[years.length - 1]);
            setIsLoading(false);
            onStreakCalculated?.(0);
        };

        fetchAll();

        return () => {
            ignore = true;
            controller.abort();
        };
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [username]);

    // ── Cascade animation on load & year change ──
    useEffect(() => {
        if (!isLoading && yearlyData[currentYear]?.length > 0) {
            const t = setTimeout(() => setHasAppeared(true), 60);
            return () => clearTimeout(t);
        }
    }, [isLoading, currentYear, yearlyData]);

    // ── Measure container width ──
    useEffect(() => {
        const el = graphRef.current;
        if (!el) return;
        const obs = new ResizeObserver(entries => {
            for (const entry of entries) setContainerWidth(entry.contentRect.width);
        });
        obs.observe(el);
        setContainerWidth(el.clientWidth);
        return () => obs.disconnect();
    }, []);

    // ── Year navigation ──
    const yearIdx = availableYears.indexOf(currentYear);
    const canGoOlder = yearIdx > 0;
    const canGoNewer = yearIdx < availableYears.length - 1;

    const navigateYear = useCallback((dir: number) => {
        const now = Date.now();
        if (now - lastNavTime.current < 600) return; // cooldown
        lastNavTime.current = now;
        setHoveredDay(null);
        setHasAppeared(false);

        setSlideDir(dir);
        setCurrentYear(prev => {
            const idx = availableYears.indexOf(prev);
            const next = idx + dir;
            if (next >= 0 && next < availableYears.length) return availableYears[next];
            return prev;
        });
    }, [availableYears]);

    // ── Wheel handler (horizontal scroll → year nav) ──
    useEffect(() => {
        const el = graphRef.current;
        if (!el) return;
        const handler = (e: WheelEvent) => {
            // Use horizontal scroll for year nav; let vertical scroll pass through
            const absX = Math.abs(e.deltaX);
            const absY = Math.abs(e.deltaY);
            if (absX > absY && absX > 30) {
                e.preventDefault();
                navigateYear(e.deltaX > 0 ? 1 : -1);
            }
        };
        el.addEventListener('wheel', handler, { passive: false });
        return () => el.removeEventListener('wheel', handler);
    }, [navigateYear]);

    // ── Touch swipe handlers (distinguish from page-level swipe) ──
    const touchStartY = useRef(0);
    const touchClaimed = useRef(false); // true once we decide this gesture is ours

    useEffect(() => {
        const el = graphRef.current;
        if (!el) return;

        const onStart = (e: TouchEvent) => {
            touchStartX.current = e.touches[0].clientX;
            touchStartY.current = e.touches[0].clientY;
            touchClaimed.current = false;
        };

        const onMove = (e: TouchEvent) => {
            const dx = Math.abs(e.touches[0].clientX - touchStartX.current);
            const dy = Math.abs(e.touches[0].clientY - touchStartY.current);

            // If the swipe is clearly horizontal (2× more X than Y) and past threshold,
            // claim this gesture so the page-level swipe doesn't fire
            if (dx > 20 && dx > dy * 2 && !touchClaimed.current) {
                touchClaimed.current = true;
            }

            if (touchClaimed.current) {
                e.preventDefault();
                e.stopPropagation();
            }
        };

        const onEnd = (e: TouchEvent) => {
            if (!touchClaimed.current) return; // not our gesture — let page handle it

            e.stopPropagation();
            const dx = e.changedTouches[0].clientX - touchStartX.current;
            if (Math.abs(dx) > 60) navigateYear(dx < 0 ? 1 : -1);
        };

        el.addEventListener('touchstart', onStart, { passive: true });
        el.addEventListener('touchmove', onMove, { passive: false });
        el.addEventListener('touchend', onEnd, { passive: true });
        return () => {
            el.removeEventListener('touchstart', onStart);
            el.removeEventListener('touchmove', onMove);
            el.removeEventListener('touchend', onEnd);
        };
    }, [navigateYear]);

    // ── Current year's contribution data ──
    const contributions = useMemo(() => yearlyData[currentYear] || [], [yearlyData, currentYear]);
    const totalContributions = yearlyTotals[currentYear] || 0;

    const weeks = useMemo(() => {
        if (contributions.length === 0) return [];
        const result: ContributionDay[][] = [];
        let week: ContributionDay[] = [];

        // UTC weekday — the API date strings are UTC midnight; using local getDay()
        // shifts the whole grid by one row for visitors west of UTC.
        const startDay = new Date(contributions[0].date).getUTCDay();
        for (let i = 0; i < startDay; i++) week.push({ date: '', count: -1, level: -1 });

        contributions.forEach(day => {
            week.push(day);
            if (week.length === 7) { result.push(week); week = []; }
        });
        if (week.length > 0) result.push(week);
        return result;
    }, [contributions]);

    const monthLabels = useMemo(() => {
        if (weeks.length === 0) return [];
        const labels: { label: string; weekIndex: number }[] = [];
        const names = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
        let last = -1;
        weeks.forEach((w, wi) => {
            const valid = w.find(d => d.date && d.count >= 0);
            if (valid) {
                const m = new Date(valid.date).getUTCMonth();
                if (m !== last) { labels.push({ label: names[m], weekIndex: wi }); last = m; }
            }
        });
        return labels;
    }, [weeks]);

    // ── Tooltip positioning ──
    const handleCellHover = useCallback((day: ContributionDay, e: React.MouseEvent<HTMLDivElement>) => {
        if (day.count < 0) return;
        const cell = e.currentTarget;
        const cont = containerRef.current;
        if (!cell || !cont) return;
        const cr = cell.getBoundingClientRect();
        const br = cont.getBoundingClientRect();
        setTooltipPos({ x: cr.left + cr.width / 2 - br.left, y: cr.top - br.top - 8 });
        setHoveredDay(day);
    }, []);
    const handleCellLeave = useCallback(() => { setHoveredDay(null); }, []);

    // ── Dynamic cell sizing ──
    const NUM_WEEKS = weeks.length || 52;
    const GAP = 3; // Increased gap for better clarity
    const CELL = containerWidth > 0
        ? Math.max(10, Math.floor((containerWidth - (NUM_WEEKS - 1) * GAP) / NUM_WEEKS))
        : 12;

    const formatDate = (dateStr: string) => {
        const d = new Date(dateStr);
        return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
    };

    // ── Chevron button style ── 44×44 min target on mobile for thumb tap (WCAG 2.5.5)
    const chevronBtn = (enabled: boolean): React.CSSProperties => ({
        background: 'none', border: 'none', padding: '10px 12px',
        minWidth: 44, minHeight: 44,
        cursor: enabled ? 'pointer' : 'default',
        color: enabled ? 'var(--accent)' : 'var(--text-muted)', opacity: enabled ? 1 : 0.3,
        transition: 'opacity 0.2s, color 0.2s', fontSize: '0.75rem', fontWeight: 700,
        display: 'flex', alignItems: 'center', justifyContent: 'center', lineHeight: 1,
        borderRadius: 8,
    });

    // ── Slide animation variants ──
    const slideVariants = {
        enter: (dir: number) => ({ x: dir > 0 ? 60 : -60, opacity: 0 }),
        center: { x: 0, opacity: 1 },
        exit: (dir: number) => ({ x: dir > 0 ? -60 : 60, opacity: 0 }),
    };

    return (
        <div ref={containerRef} style={{ position: 'relative' }}>
            {/* ── Header ── */}
            <motion.div
                initial={{ opacity: 0, y: -6 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
                style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}
            >
                {/* Left: icon + count */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <div style={{
                        width: 24, height: 24, borderRadius: 6, background: 'var(--accent)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                    }}>
                        <svg width="14" height="14" viewBox="0 0 16 16" fill="white">
                            <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z" />
                        </svg>
                    </div>
                    <div>
                        <span style={{ fontSize: '0.8rem', fontWeight: 800, color: 'var(--text-primary)', letterSpacing: '-0.01em' }}>
                            {isLoading ? '—' : totalContributions.toLocaleString()}
                        </span>
                        <span style={{ fontSize: '0.7rem', fontWeight: 500, color: 'var(--text-muted)', marginLeft: 5 }}>
                            contributions
                        </span>
                    </div>
                </div>

                {/* Center: year navigator */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 2, userSelect: 'none' }}>
                    <button onClick={() => canGoOlder && navigateYear(-1)} style={chevronBtn(canGoOlder)} aria-label="Previous year">
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6" /></svg>
                    </button>
                    <AnimatePresence mode="wait" custom={slideDir}>
                        <motion.span
                            key={currentYear}
                            custom={slideDir}
                            initial={{ opacity: 0, y: slideDir >= 0 ? 8 : -8 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: slideDir >= 0 ? -8 : 8 }}
                            transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
                            style={{
                                fontSize: '0.78rem', fontWeight: 800, color: 'var(--text-primary)',
                                minWidth: 38, textAlign: 'center', display: 'inline-block',
                                letterSpacing: '-0.01em',
                            }}
                        >
                            {currentYear}
                        </motion.span>
                    </AnimatePresence>
                    <button onClick={() => canGoNewer && navigateYear(1)} style={chevronBtn(canGoNewer)} aria-label="Next year">
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6" /></svg>
                    </button>
                </div>

                {/* Right: profile link */}
                <a href={`https://github.com/${username}`} target="_blank" rel="noopener noreferrer"
                    style={{
                        fontSize: '0.65rem', fontWeight: 700, color: 'var(--accent)', textDecoration: 'none',
                        opacity: 0.8, transition: 'opacity 0.2s', letterSpacing: '0.04em', textTransform: 'uppercase',
                    }}
                    onMouseEnter={e => (e.currentTarget.style.opacity = '1')}
                    onMouseLeave={e => (e.currentTarget.style.opacity = '0.8')}
                >@{username}</a>
            </motion.div>

            {/* ── Graph ── */}
            <div ref={graphRef} style={{ overflow: 'hidden', paddingBottom: 2 }}>
                <AnimatePresence mode="wait" custom={slideDir}>
                    <motion.div
                        key={currentYear}
                        custom={slideDir}
                        variants={slideVariants}
                        initial="enter"
                        animate="center"
                        exit="exit"
                        transition={{ duration: 0.28, ease: [0.16, 1, 0.3, 1] }}
                        style={{ position: 'relative', paddingTop: 16 }}
                    >
                        {/* Month Labels */}
                        <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 14 }}>
                            {monthLabels.map((m, i) => (
                                <span key={i} style={{
                                    position: 'absolute', left: m.weekIndex * (CELL + GAP),
                                    fontSize: '0.6rem', fontWeight: 600, color: 'var(--text-muted)',
                                    userSelect: 'none', lineHeight: 1,
                                }}>{m.label}</span>
                            ))}
                        </div>

                        {/* Grid */}
                        <div style={{ display: 'flex', gap: GAP }}>
                            {isLoading ? (
                                Array.from({ length: 52 }).map((_, wi) => (
                                    <div key={wi} style={{ display: 'flex', flexDirection: 'column', gap: GAP }}>
                                        {Array.from({ length: 7 }).map((_, di) => (
                                            <div key={di} className="commits-cell-skeleton" style={{
                                                width: CELL, height: CELL, borderRadius: 3,
                                                animationDelay: `${(wi + di) * 20}ms`,
                                            }} />
                                        ))}
                                    </div>
                                ))
                            ) : (
                                weeks.map((week, wi) => (
                                    <div key={wi} style={{ display: 'flex', flexDirection: 'column', gap: GAP }}>
                                        {week.map((day, di) => {
                                            const isEmpty = day.count < 0;
                                            const isHovered = hoveredDay?.date === day.date && !isEmpty;
                                            const isToday = day.date === todayStr;
                                            
                                            const staggerDelay = (wi * 0.006) + (di * 0.012);
                                            
                                            return (
                                                <motion.div
                                                    key={di}
                                                    initial={{ opacity: 0, scale: 0 }}
                                                    animate={hasAppeared ? { 
                                                        opacity: isEmpty ? 0 : 1, 
                                                        scale: isEmpty ? 0 : 1,
                                                        ...(isToday ? {
                                                            boxShadow: [
                                                                '0 0 5px var(--accent)',
                                                                '0 0 15px var(--accent)',
                                                                '0 0 5px var(--accent)'
                                                            ]
                                                        } : {})
                                                    } : {}}
                                                    transition={isToday ? {
                                                        boxShadow: {
                                                            repeat: Infinity,
                                                            duration: 2,
                                                            ease: "easeInOut"
                                                        },
                                                        default: { duration: 0.3, delay: staggerDelay, ease: [0.34, 1.56, 0.64, 1] }
                                                    } : { duration: 0.3, delay: staggerDelay, ease: [0.34, 1.56, 0.64, 1] }}
                                                    onMouseEnter={(e) => handleCellHover(day, e)}
                                                    onMouseLeave={handleCellLeave}
                                                    style={{
                                                        width: CELL, height: CELL, borderRadius: 3,
                                                        background: isEmpty ? 'transparent' : (isToday ? 'var(--accent)' : `var(--commits-l${day.level})`),
                                                        cursor: isEmpty ? 'default' : 'pointer',
                                                        transition: 'transform 0.18s cubic-bezier(0.34,1.56,0.64,1), box-shadow 0.18s ease, border 0.2s ease',
                                                        transform: isHovered ? 'scale(1.3)' : 'scale(1)',
                                                        boxShadow: isHovered && day.level > 0 
                                                            ? `0 0 8px var(--commits-l${day.level})` 
                                                            : 'none',
                                                        border: isToday ? '2px solid white' : 'none',
                                                        zIndex: (isHovered || isToday) ? 10 : 1, 
                                                        position: 'relative',
                                                    }}
                                                />
                                            );
                                        })}
                                    </div>
                                ))
                            )}
                        </div>
                    </motion.div>
                </AnimatePresence>
            </div>

            {/* ── Legend ── */}
            <motion.div
                initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                transition={{ duration: 0.5, delay: 0.6 }}
                style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 3, marginTop: 10 }}
            >
                <span style={{ fontSize: '0.58rem', color: 'var(--text-muted)', marginRight: 4, fontWeight: 600, letterSpacing: '0.02em' }}>Less</span>
                {[0, 1, 2, 3, 4].map(level => (
                    <div key={level} style={{
                        width: CELL, height: CELL, borderRadius: 3,
                        background: `var(--commits-l${level})`, transition: 'transform 0.2s ease',
                    }}
                        onMouseEnter={e => (e.currentTarget.style.transform = 'scale(1.3)')}
                        onMouseLeave={e => (e.currentTarget.style.transform = 'scale(1)')}
                    />
                ))}
                <span style={{ fontSize: '0.58rem', color: 'var(--text-muted)', marginLeft: 4, fontWeight: 600, letterSpacing: '0.02em' }}>More</span>
            </motion.div>

            {/* ── Tooltip ── */}
            <AnimatePresence>
                {hoveredDay && hoveredDay.count >= 0 && (
                    <div style={{
                        position: 'absolute', left: tooltipPos.x, top: tooltipPos.y,
                        pointerEvents: 'none', zIndex: 200, transform: 'translate(-50%, -100%)',
                    }}>
                        <motion.div
                            key={hoveredDay.date}
                            initial={{ opacity: 0, y: 4, scale: 0.9 }}
                            animate={{ opacity: 1, y: 0, scale: 1 }}
                            exit={{ opacity: 0, y: 3, scale: 0.95 }}
                            transition={{ duration: 0.15, ease: [0.16, 1, 0.3, 1] }}
                        >
                            <div style={{
                                background: 'var(--tooltip-bg)', backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)',
                                color: 'var(--tooltip-text)', padding: '7px 11px', borderRadius: 8,
                                fontSize: '0.7rem', fontWeight: 600, whiteSpace: 'nowrap',
                                boxShadow: '0 6px 20px rgba(0,0,0,0.12), 0 2px 6px rgba(0,0,0,0.08)',
                                border: '1px solid var(--section-border)', lineHeight: 1.45, textAlign: 'center',
                            }}>
                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5 }}>
                                    <span style={{ display: 'inline-block', width: 7, height: 7, borderRadius: 2, background: hoveredDay.level > 0 ? `var(--commits-l${hoveredDay.level})` : 'var(--commits-l0)', flexShrink: 0 }} />
                                    <span><strong style={{ fontWeight: 800 }}>{hoveredDay.count}</strong> contribution{hoveredDay.count !== 1 ? 's' : ''}</span>
                                </div>
                                <div style={{ fontSize: '0.58rem', fontWeight: 500, color: 'var(--text-muted)', marginTop: 2 }}>
                                    {formatDate(hoveredDay.date)}
                                </div>
                            </div>
                            <div style={{
                                width: 7, height: 7, background: 'var(--tooltip-bg)',
                                border: '1px solid var(--section-border)', borderTop: 'none', borderLeft: 'none',
                                transform: 'rotate(45deg)', position: 'absolute', bottom: -3, left: '50%', marginLeft: -3.5,
                            }} />
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>
        </div>
    );
};

export default GitHubCommitsGraph;
