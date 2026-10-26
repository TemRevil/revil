import { useEffect, useState } from 'react';
import { Star, GitFork, Package, Users } from 'lucide-react';
import { cachedJson, fetchJson, GITHUB_URLS } from '../lib/githubData';

interface Stats {
    followers: number;
    totalStars: number;
    totalForks: number;
    repoCount: number;
}

const StatCard = ({
    icon: Icon,
    label,
    value,
    delay,
    isLoading,
}: {
    icon: typeof Star;
    label: string;
    /** null: GitHub didn't answer and there is no copy, so there is no number to show. */
    value: number | null;
    delay: number;
    isLoading: boolean;
}) => (
    <div
        className="github-stat-card"
        style={{
            position: 'relative',
            padding: '14px 16px',
            borderRadius: 14,
            overflow: 'hidden',
            animationDelay: `${delay}s`,
        }}
    >
        <div
            style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                marginBottom: 8,
                position: 'relative',
            }}
        >
            <div
                style={{
                    width: 28,
                    height: 28,
                    borderRadius: 8,
                    background: 'rgba(128,128,128,0.08)',
                    border: '1px solid var(--section-border)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: 'var(--text-secondary)',
                }}
            >
                <Icon size={14} strokeWidth={2.4} />
            </div>
        </div>

        <div
            style={{
                fontSize: '1.5rem',
                fontWeight: 900,
                lineHeight: 1,
                color: 'var(--text-primary)',
                letterSpacing: '-0.03em',
                fontFamily: 'var(--font-inter)',
                marginBottom: 2,
                minHeight: 24,
                position: 'relative',
            }}
        >
            {isLoading ? (
                <span style={{ color: 'var(--text-muted)', opacity: 0.5 }}>·</span>
            ) : (
                value === null ? '-' : value.toLocaleString()
            )}
        </div>
        <div
            style={{
                fontSize: '0.65rem',
                fontWeight: 700,
                color: 'var(--text-muted)',
                textTransform: 'uppercase',
                letterSpacing: '0.1em',
                position: 'relative',
            }}
        >
            {label}
        </div>
    </div>
);

type Repo = { stargazers_count: number; forks_count: number; fork: boolean };

/** The four numbers, from the user record and the repo list (forks left out). */
const statsOf = (user: { followers?: number }, repos: Repo[]): Stats => {
    const ownRepos = repos.filter((r) => !r.fork);
    return {
        followers: user.followers || 0,
        totalStars: ownRepos.reduce((sum, r) => sum + r.stargazers_count, 0),
        totalForks: ownRepos.reduce((sum, r) => sum + r.forks_count, 0),
        repoCount: ownRepos.length,
    };
};

const cachedStats = (): Stats | null => {
    const user = cachedJson<{ followers?: number }>(GITHUB_URLS.user);
    const repos = cachedJson<Repo[]>(GITHUB_URLS.repos);
    return user && Array.isArray(repos) ? statsOf(user, repos) : null;
};

const GitHubStats = () => {
    // This visit's read when it already landed (lib/githubData prefetches it), else read now.
    const [stats, setStats] = useState<Stats | null>(cachedStats);
    const [isLoading, setIsLoading] = useState(() => stats === null);

    useEffect(() => {
        let alive = true;
        Promise.all([fetchJson<{ followers?: number }>(GITHUB_URLS.user), fetchJson<Repo[]>(GITHUB_URLS.repos)])
            .then(([user, repos]) => { if (alive) setStats(statsOf(user, repos)); })
            .catch(() => { /* offline / rate-limited: keep what is shown */ })
            .finally(() => { if (alive) setIsLoading(false); });
        return () => { alive = false; };
    }, []);

    return (
        <div className="dev-stats-grid">
            <StatCard icon={Star} label="Total Stars" value={stats?.totalStars ?? null} delay={0.15} isLoading={isLoading} />
            <StatCard icon={GitFork} label="Total Forks" value={stats?.totalForks ?? null} delay={0.22} isLoading={isLoading} />
            <StatCard icon={Package} label="Repositories" value={stats?.repoCount ?? null} delay={0.29} isLoading={isLoading} />
            <StatCard icon={Users} label="Followers" value={stats?.followers ?? null} delay={0.36} isLoading={isLoading} />
        </div>
    );
};

export default GitHubStats;
