import { useEffect, useState } from 'react';
import { motion } from 'motion/react';
import { Star, GitFork, ArrowUpRight, GitBranch } from 'lucide-react';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from '../lib/firebase';

const GITHUB_USERNAME = 'TemRevil';

// Rank watermark numbers only — kept monochrome (no gold/silver/bronze) so the
// section stays neutral.
const RANKS = ['01', '02', '03'];

interface RepoData {
    name: string;
    description: string | null;
    language: string | null;
    stargazers_count: number;
    forks_count: number;
    html_url: string;
    fork?: boolean;
    archived?: boolean;
}

/* ── single repo card ── */
const RepoCard = ({ repo, rank, delay }: { repo: RepoData; rank: string; delay: number }) => {
    return (
        <motion.a
            href={repo.html_url}
            target="_blank"
            rel="noopener noreferrer"
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay, ease: [0.16, 1, 0.3, 1] }}
            className="featured-repo-card"
            style={{
                position: 'relative',
                display: 'flex',
                flexDirection: 'column',
                padding: '18px 18px 14px',
                borderRadius: 16,
                textDecoration: 'none',
                background: 'transparent',
                border: '1px solid var(--section-border)',
                transition: 'background 0.2s ease, border-color 0.2s ease, transform 0.25s ease, box-shadow 0.25s ease',
                boxShadow: '0 1px 4px rgba(0,0,0,0.04)',
                cursor: 'pointer',
                overflow: 'hidden',
            }}
        >
            {/* Rank watermark — big faded number in corner (neutral) */}
            <div
                aria-hidden
                className="repo-rank-watermark"
                style={{
                    position: 'absolute',
                    top: -6,
                    right: 10,
                    fontSize: '4.5rem',
                    fontWeight: 900,
                    fontFamily: 'var(--font-inter)',
                    color: 'var(--text-primary)',
                    opacity: 0.05,
                    lineHeight: 1,
                    letterSpacing: '-0.04em',
                    pointerEvents: 'none',
                    transition: 'opacity 0.25s ease',
                    userSelect: 'none',
                }}
            >
                {rank}
            </div>

            {/* Top row: icon + arrow */}
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 10 }}>
                <div
                    style={{
                        width: 34,
                        height: 34,
                        borderRadius: 10,
                        background: 'rgba(128,128,128,0.08)',
                        border: '1px solid var(--section-border)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        color: 'var(--text-secondary)',
                        flexShrink: 0,
                    }}
                >
                    <GitBranch size={16} strokeWidth={2.2} />
                </div>
                <div
                    className="repo-arrow-box"
                    style={{
                        width: 26,
                        height: 26,
                        borderRadius: 8,
                        background: 'transparent',
                        border: '1px solid transparent',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        transition: 'all 0.2s ease',
                    }}
                >
                    <ArrowUpRight
                        size={14}
                        className="repo-arrow-icon"
                        style={{
                            color: 'var(--text-muted)',
                            transition: 'transform 0.2s ease, color 0.2s ease',
                        }}
                    />
                </div>
            </div>

            {/* Repo name */}
            <div
                style={{
                    fontSize: '0.9rem',
                    fontWeight: 800,
                    color: 'var(--text-primary)',
                    letterSpacing: '-0.015em',
                    marginBottom: 5,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                    fontFamily: 'var(--font-inter)',
                }}
            >
                {repo.name}
            </div>

            {/* Description */}
            <p
                style={{
                    fontSize: '0.72rem',
                    color: 'var(--text-muted)',
                    margin: '0 0 auto 0',
                    lineHeight: 1.5,
                    display: '-webkit-box',
                    WebkitLineClamp: 2,
                    WebkitBoxOrient: 'vertical',
                    overflow: 'hidden',
                    fontWeight: 500,
                    minHeight: '2.2em',
                }}
            >
                {repo.description ?? 'No description'}
            </p>

            {/* Footer: stats + language */}
            <div
                style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    marginTop: 14,
                    paddingTop: 12,
                    borderTop: '1px solid var(--section-border)',
                    gap: 8,
                }}
            >
                {/* Stars + forks (neutral) */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 4, color: 'var(--text-muted)' }}>
                        <Star size={12} />
                        <span style={{ fontSize: '0.75rem', fontWeight: 800, color: 'var(--text-primary)' }}>
                            {repo.stargazers_count}
                        </span>
                    </div>
                    {repo.forks_count > 0 && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 4, color: 'var(--text-muted)' }}>
                            <GitFork size={12} />
                            <span style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                                {repo.forks_count}
                            </span>
                        </div>
                    )}
                </div>

                {/* Language label (neutral — no per-language colours) */}
                {repo.language && (
                    <span style={{ fontSize: '0.68rem', fontWeight: 600, color: 'var(--text-muted)', flexShrink: 0 }}>
                        {repo.language}
                    </span>
                )}
            </div>
        </motion.a>
    );
};

/* ── skeleton card ── */
const SkeletonCard = ({ delay }: { delay: number }) => (
    <div
        className="commits-cell-skeleton"
        style={{
            height: 160,
            borderRadius: 16,
            animationDelay: `${delay}ms`,
        }}
    />
);

/* ── main component ── */
const FeaturedRepos = () => {
    const [repos, setRepos] = useState<RepoData[]>([]);
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        const CACHE_KEY = 'gh_featured_repos';
        const CACHE_TTL = 30 * 60 * 1000;
        let isMounted = true;
        // Track latest fetch generation so stale Firestore updates don't clobber fresh data
        let fetchGen = 0;
        // Top-level abort controller — fires on unmount to cancel all in-flight requests
        const masterController = new AbortController();

        // Per-request fetch with isolated 10s timeout (single slow repo won't kill siblings)
        const fetchOne = async (url: string): Promise<RepoData | null> => {
            const controller = new AbortController();
            const tid = setTimeout(() => controller.abort(), 10_000);
            // Also bail if the master (unmount) signal fires
            const onMasterAbort = () => controller.abort();
            masterController.signal.addEventListener('abort', onMasterAbort);
            try {
                const res = await fetch(url, { signal: controller.signal });
                if (res.ok) return (await res.json()) as RepoData;
            } catch { /* per-request fail */ }
            finally {
                clearTimeout(tid);
                masterController.signal.removeEventListener('abort', onMasterAbort);
            }
            return null;
        };

        const fetchReposByNames = async (names: string[]) => {
            const results = await Promise.all(
                names.map(name => fetchOne(`https://api.github.com/repos/${GITHUB_USERNAME}/${name}`)),
            );
            return results;
        };

        const fetchTop3 = async (): Promise<RepoData[]> => {
            const controller = new AbortController();
            const tid = setTimeout(() => controller.abort(), 10_000);
            const onMasterAbort = () => controller.abort();
            masterController.signal.addEventListener('abort', onMasterAbort);
            try {
                const res = await fetch(
                    `https://api.github.com/users/${GITHUB_USERNAME}/repos?per_page=100`,
                    { signal: controller.signal },
                );
                if (res.ok) {
                    const data: RepoData[] = await res.json();
                    return data
                        // Exclude the profile repo, forks, and archived repos so the
                        // featured set matches GitHubStats (which also excludes forks).
                        .filter(r => r.name !== GITHUB_USERNAME && !r.fork && !r.archived)
                        .sort((a, b) => b.stargazers_count - a.stargazers_count)
                        .slice(0, 3);
                }
            } catch { /* timeout / network */ }
            finally {
                clearTimeout(tid);
                masterController.signal.removeEventListener('abort', onMasterAbort);
            }
            return [];
        };

        const apply = (data: RepoData[]) => {
            if (!isMounted) return;
            setRepos(data);
            setIsLoading(false);
            try { localStorage.setItem(CACHE_KEY, JSON.stringify({ data, ts: Date.now() })); } catch { /* quota */ }
        };

        const load = async (names: string[]) => {
            try {
                const raw = localStorage.getItem(CACHE_KEY);
                if (raw) {
                    const { data, ts } = JSON.parse(raw);
                    if (Date.now() - ts < CACHE_TTL && Array.isArray(data) && data.length > 0) {
                        if (!isMounted) return;
                        setRepos(data); setIsLoading(false);
                        refresh(names, false); return;
                    }
                }
            } catch { /* bad cache */ }
            await refresh(names, true);
        };

        const refresh = async (names: string[], showLoading: boolean) => {
            const myGen = ++fetchGen;
            if (showLoading && isMounted) setIsLoading(true);

            const fetched = names.length > 0
                ? await fetchReposByNames(names)
                : (await fetchTop3()).map(r => r);

            // Drop result if a newer fetch superseded this one (Firestore updated mid-fetch)
            if (myGen !== fetchGen || !isMounted) return;

            let data: RepoData[];
            if (names.length > 0) {
                // Preserve Firestore order; nulls (failed/missing repos) keep their slot intentionally dropped
                data = names
                    .map((n, i) => {
                        const r = fetched[i];
                        return r && r.name === n ? r : null;
                    })
                    .filter((r): r is RepoData => r !== null);
            } else {
                data = fetched.filter((r): r is RepoData => r !== null);
            }

            if (data.length > 0) apply(data);
            else if (showLoading && isMounted) setIsLoading(false);
        };

        const unsubFirestore = onSnapshot(
            doc(db, 'Settings', 'Developer'),
            (snap) => {
                const names: string[] = snap.exists() ? (snap.data().featuredRepos ?? []) : [];
                load(names);
            },
            (err) => { console.warn('[FeaturedRepos] Firestore listener error:', err); },
        );

        return () => {
            isMounted = false;
            masterController.abort();
            unsubFirestore();
        };
    }, []);

    // Empty/error state: not loading and nothing came back (rate-limited / offline / no repos)
    if (!isLoading && repos.length === 0) {
        return (
            <div
                style={{
                    padding: '20px 16px',
                    borderRadius: 14,
                    border: '1px dashed var(--section-border)',
                    background: 'var(--section-bg)',
                    textAlign: 'center',
                    fontSize: '0.8rem',
                    color: 'var(--text-muted)',
                }}
            >
                Couldn&apos;t load repositories right now — GitHub may be rate-limiting. Try again shortly.
            </div>
        );
    }

    return (
        <div className="dev-repos-grid">
            {isLoading
                ? [0, 1, 2].map((i) => <SkeletonCard key={i} delay={i * 80} />)
                : repos.slice(0, 3).map((repo, i) => (
                      <RepoCard
                          key={repo.name}
                          repo={repo}
                          rank={RANKS[i] ?? RANKS[0]}
                          delay={0.1 + i * 0.08}
                      />
                  ))}
        </div>
    );
};

export default FeaturedRepos;
