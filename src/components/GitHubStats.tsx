import { useEffect, useState } from 'react';
import { motion } from 'motion/react';
import { Star, GitFork, Package, Users } from 'lucide-react';

const GITHUB_USERNAME = 'TemRevil';

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
    value: number;
    delay: number;
    isLoading: boolean;
}) => (
    <motion.div
        initial={{ opacity: 0, y: 14 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay, ease: [0.16, 1, 0.3, 1] }}
        className="github-stat-card"
        style={{
            position: 'relative',
            padding: '14px 16px',
            borderRadius: 14,
            overflow: 'hidden',
            transition: 'border-color 0.25s ease, transform 0.25s ease, box-shadow 0.25s ease',
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
                value.toLocaleString()
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
    </motion.div>
);

const GitHubStats = () => {
    const [stats, setStats] = useState<Stats>({
        followers: 0,
        totalStars: 0,
        totalForks: 0,
        repoCount: 0,
    });
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        const CACHE_KEY = 'gh_stats_overview';
        const CACHE_TTL = 30 * 60 * 1000; // 30 min

        const applyStats = (s: Stats) => {
            setStats(s);
            setIsLoading(false);
            try {
                localStorage.setItem(CACHE_KEY, JSON.stringify({ data: s, ts: Date.now() }));
            } catch { /* quota */ }
        };

        const fetchFromApi = async (showLoading: boolean) => {
            if (showLoading) setIsLoading(true);
            try {
                const controller = new AbortController();
                const tid = setTimeout(() => controller.abort(), 10_000);

                const [userRes, reposRes] = await Promise.all([
                    fetch(`https://api.github.com/users/${GITHUB_USERNAME}`, {
                        signal: controller.signal,
                    }),
                    fetch(
                        `https://api.github.com/users/${GITHUB_USERNAME}/repos?per_page=100`,
                        { signal: controller.signal },
                    ),
                ]);
                clearTimeout(tid);

                if (userRes.ok && reposRes.ok) {
                    const user = await userRes.json();
                    const repos: Array<{
                        stargazers_count: number;
                        forks_count: number;
                        fork: boolean;
                    }> = await reposRes.json();

                    const ownRepos = repos.filter((r) => !r.fork);
                    const totalStars = ownRepos.reduce(
                        (sum, r) => sum + r.stargazers_count,
                        0,
                    );
                    const totalForks = ownRepos.reduce(
                        (sum, r) => sum + r.forks_count,
                        0,
                    );

                    applyStats({
                        followers: user.followers || 0,
                        totalStars,
                        totalForks,
                        repoCount: ownRepos.length,
                    });
                }
            } catch {
                if (showLoading) setIsLoading(false);
            }
        };

        // Try cache first
        try {
            const raw = localStorage.getItem(CACHE_KEY);
            if (raw) {
                const { data, ts } = JSON.parse(raw);
                if (Date.now() - ts < CACHE_TTL && data) {
                    // eslint-disable-next-line react-hooks/set-state-in-effect -- hydrating from localStorage cache on mount (synchronizing external state)
                    setStats(data);
                    setIsLoading(false);
                    // Refresh in background
                    fetchFromApi(false);
                    return;
                }
            }
        } catch { /* bad cache */ }

        fetchFromApi(true);
    }, []);

    return (
        <div className="dev-stats-grid">
            <StatCard icon={Star} label="Total Stars" value={stats.totalStars} delay={0.15} isLoading={isLoading} />
            <StatCard icon={GitFork} label="Total Forks" value={stats.totalForks} delay={0.22} isLoading={isLoading} />
            <StatCard icon={Package} label="Repositories" value={stats.repoCount} delay={0.29} isLoading={isLoading} />
            <StatCard icon={Users} label="Followers" value={stats.followers} delay={0.36} isLoading={isLoading} />
        </div>
    );
};

export default GitHubStats;
