import { useEffect, useState } from 'react';
import { motion } from 'motion/react';
import { Star, GitFork, ArrowUpRight, GitBranch } from 'lucide-react';
import { watchDoc } from '../lib/liveDoc';
import { cachedDoc, type Data } from '../lib/dataCache';
import { cachedJson, fetchJson, GITHUB_URLS, GITHUB_USERNAME } from '../lib/githubData';

// Rank watermark numbers only - kept monochrome (no gold/silver/bronze) so the
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
            {/* Rank watermark - big faded number in corner (neutral) */}
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

                {/* Language label (neutral - no per-language colours) */}
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

/** The three most-starred repos, leaving out the profile repo, forks and archived ones (as GitHubStats does). */
const topThree = (repos: RepoData[]) => repos
    .filter(r => r.name !== GITHUB_USERNAME && !r.fork && !r.archived)
    .sort((a, b) => b.stargazers_count - a.stargazers_count)
    .slice(0, 3);

/** The owner's picks (Settings/Developer), in their order. */
const featuredNames = (doc: Data | null | undefined) => ((doc?.featuredRepos ?? []) as string[]).filter(Boolean);

/** Keeps the repos that answered as the name asked for; a missing or renamed one drops out. */
const inOrder = (names: string[], found: Array<RepoData | null | undefined>) =>
    found.filter((r, i): r is RepoData => !!r && r.name === names[i]);

/** The picks (or the top three when there are none) as this device last saw them. */
const cachedRepos = (names: string[]): RepoData[] => names.length > 0
    ? inOrder(names, names.map(n => cachedJson<RepoData>(GITHUB_URLS.repo(n))))
    : topThree(cachedJson<RepoData[]>(GITHUB_URLS.repos) ?? []);

const readRepos = async (names: string[]): Promise<RepoData[]> => names.length > 0
    ? inOrder(names, await Promise.all(names.map(n => fetchJson<RepoData>(GITHUB_URLS.repo(n)).catch(() => null))))
    : topThree(await fetchJson<RepoData[]>(GITHUB_URLS.repos));

/* ── main component ── */
const FeaturedRepos = () => {
    // This device's last copy at once (lib/githubData); a new one replaces it when it lands.
    const [repos, setRepos] = useState<RepoData[]>(() => cachedRepos(featuredNames(cachedDoc(['Settings', 'Developer']))));
    const [isLoading, setIsLoading] = useState(() => repos.length === 0);

    useEffect(() => {
        let alive = true;
        // A newer list of picks supersedes a read still on its way for the old one.
        let latest = 0;
        const show = (names: string[]) => {
            const mine = ++latest;
            const known = cachedRepos(names);
            if (known.length > 0) setRepos(known);
            readRepos(names)
                .then((data) => { if (alive && mine === latest && data.length > 0) setRepos(data); })
                .catch(() => { /* offline / rate-limited: keep what is shown */ })
                .finally(() => { if (alive && mine === latest) setIsLoading(false); });
        };
        const stop = watchDoc(['Settings', 'Developer'], (doc) => show(featuredNames(doc)), (err) => {
            console.warn('[FeaturedRepos] Firestore read error:', err);
            show([]);
        });
        return () => { alive = false; stop(); };
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
                Couldn&apos;t load repositories right now - GitHub may be rate-limiting. Try again shortly.
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
