import { useEffect, useRef, useState, useCallback } from 'react';
import { enter } from '../entrance';
import { handwrite } from '../../lib/handwrite';
import { Chars } from '../../ui/Chars';
import { Activity, Flame, FolderGit2 } from 'lucide-react';
import GitHubCommitsGraph from './GitHubCommitsGraph';
import StreakCircle from './StreakCircle';
import FeaturedRepos from './FeaturedRepos';
import GitHubStats from './GitHubStats';

/* ──────────────────────────────────────────────────────────────
   Eyebrow section label: a small, consistent header used above
   every block so the whole section reads with one clear rhythm.
   Light by design (no heavy cards) to keep the layout simple.
   ────────────────────────────────────────────────────────────── */
interface SectionLabelProps {
    icon: React.ReactNode;
    label: string;
    hint?: string;
    centered?: boolean;
}

// Monochrome eyebrow label: a muted icon + uppercase muted text. No accent colors,
// keeping the whole section neutral so the fire is the only point of colour.
const SectionLabel = ({ icon, label, hint, centered = false }: SectionLabelProps) => (
    <div
        style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            marginBottom: 18,
            ...(centered ? { justifyContent: 'center' } : {}),
        }}
    >
        <span style={{ display: 'inline-flex', color: 'var(--text-muted)', flexShrink: 0 }}>
            {icon}
        </span>
        <span
            className="font-inter"
            style={{
                fontSize: '0.75rem',
                fontWeight: 700,
                letterSpacing: '0.12em',
                textTransform: 'uppercase',
                color: 'var(--text-muted)',
            }}
        >
            {label}
        </span>
        {hint && !centered && (
            <span style={{ marginLeft: 'auto', fontSize: '0.72rem', color: 'var(--text-muted)', opacity: 0.7, fontWeight: 500 }}>
                {hint}
            </span>
        )}
    </div>
);

/** `active`: as on Projects, the entrance plays each time the section is shown. */
const Developer = ({ active = true }: { active?: boolean }) => {
    const handwritingRef = useRef<HTMLDivElement>(null);
    const titleRef = useRef<HTMLHeadingElement>(null);
    const taglineRef = useRef<HTMLParagraphElement>(null);
    const statsRef = useRef<HTMLDivElement>(null);
    const activityRef = useRef<HTMLDivElement>(null);
    const bottomRef = useRef<HTMLDivElement>(null);

    const [streak, setStreak] = useState<number>(0);
    const [streakLoading, setStreakLoading] = useState(true);

    const handleStreakCalculated = useCallback((s: number) => {
        setStreak(s);
        setStreakLoading(false);
    }, []);

    // Staggered entrance: instances captured + paused on unmount (no detached-DOM churn)
    useEffect(() => {
        if (!active) return;
        const ink = handwrite(handwritingRef.current, { show: true });
        const instances = [
            enter(titleRef.current, { x: -30 }, { duration: 800, delay: 150 }),
            enter(taglineRef.current, { y: 10 }, { duration: 700, delay: 280 }),
            enter(statsRef.current, { y: 20 }, { duration: 700, delay: 400 }),
            enter(activityRef.current, { y: 24 }, { duration: 750, delay: 540 }),
            enter(bottomRef.current, { y: 24 }, { duration: 750, delay: 680 }),
        ];
        return () => { ink.forEach(a => a.cancel()); instances.forEach(inst => inst?.stop()); };
    }, [active]);

    return (
        <div className="min-h-screen bg-primary transition-colors duration-300 pt-32 pb-48">
            <div className="page-padding">

                {/* ── Header ── */}
                <header style={{ marginBottom: 44 }}>
                    <div
                        ref={handwritingRef}
                        className="text-5xl opacity-0 ml-2.5"
                        aria-hidden="true"
                        data-write
                        style={{
                            fontFamily: 'var(--font-caveat), cursive',
                            color: 'var(--accent)',
                            marginBottom: -20,
                        }}
                    >
                        <Chars text="Open Source" />
                    </div>
                    <h2
                        ref={titleRef}
                        className="text-5xl md:text-7xl lg:text-8xl font-black text-primary opacity-0 font-inter"
                        style={{ margin: 0, letterSpacing: '-0.04em' }}
                    >
                        Developer
                    </h2>
                    <p
                        ref={taglineRef}
                        className="opacity-0"
                        style={{
                            marginTop: 14,
                            maxWidth: 540,
                            fontSize: '0.95rem',
                            lineHeight: 1.6,
                            color: 'var(--text-muted)',
                            fontWeight: 500,
                        }}
                    >
                        Building, breaking, and shipping in public. A live snapshot of my
                        contributions, momentum, and favourite projects on GitHub.
                    </p>
                </header>

                {/* ── Overview stats ── */}
                <section ref={statsRef} className="opacity-0" style={{ marginBottom: 44 }}>
                    <GitHubStats />
                </section>

                {/* ── Contribution activity (borderless graph) ── */}
                <section ref={activityRef} className="opacity-0" style={{ marginBottom: 44 }}>
                    <SectionLabel
                        icon={<Activity size={14} strokeWidth={2.5} />}
                        label="Contribution Activity"
                        hint="Year by year"
                    />
                    <GitHubCommitsGraph onStreakCalculated={handleStreakCalculated} />
                </section>

                {/* ── Streak + Featured projects ── */}
                <div ref={bottomRef} className="opacity-0 dev-bottom-row">
                    {/* Streak: label + bare fire (StreakCircle kept exactly as-is) */}
                    <div className="dev-streak-col" style={{ flexShrink: 0 }}>
                        <SectionLabel
                            icon={<Flame size={14} strokeWidth={2.5} />}
                            label="Streak"
                            centered
                        />
                        <StreakCircle streak={streak} isLoading={streakLoading} />
                    </div>

                    {/* Featured projects: label + repo grid (no outer card; each repo is already carded) */}
                    <div style={{ flex: 1, minWidth: 0 }}>
                        <SectionLabel
                            icon={<FolderGit2 size={14} strokeWidth={2.5} />}
                            label="Featured Projects"
                            hint="Handpicked from GitHub"
                        />
                        <FeaturedRepos />
                    </div>
                </div>
            </div>
        </div>
    );
};

export default Developer;
