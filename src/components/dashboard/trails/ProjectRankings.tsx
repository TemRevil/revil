/** Trails' project leaderboard, ranked by weighted views, live, GitHub and download clicks. */
import { useMemo } from 'react';
import { Eye, Trophy, Github, ExternalLink, Download } from 'lucide-react';
import FileImage from '../../FileImage';

// --- Project ranking ------------------------------------------------------
// Each project tracks four interaction types in Firestore (Views map). They are
// not equal signals: a page view is passive, while opening the demo, repo, or
// hitting download shows progressively stronger intent. We rank by a weighted
// engagement score so high-intent projects rise above merely-seen ones, and
// surface a conversion rate (actions per view) as a quality tie-breaker.
export const RANK_WEIGHTS = { view: 1, live: 4, github: 3, download: 6 } as const;

export interface RankInput {
    id: string;
    name: string;
    icon: string;
    views: number;
    liveViews: number;
    githubViews: number;
    downloadViews: number;
}

export interface RankedProject extends RankInput {
    score: number;
    conversion: number; // actions / views, 0..1
}

export const ProjectRankings = ({ projects, isDark }: { projects: RankInput[]; isDark: boolean }) => {
    const ranked = useMemo<RankedProject[]>(() => {
        return projects
            .map(p => {
                const score =
                    p.views * RANK_WEIGHTS.view +
                    p.liveViews * RANK_WEIGHTS.live +
                    p.githubViews * RANK_WEIGHTS.github +
                    p.downloadViews * RANK_WEIGHTS.download;
                const actions = p.liveViews + p.githubViews + p.downloadViews;
                const conversion = p.views > 0 ? actions / p.views : 0;
                return { ...p, score, conversion };
            })
            .filter(p => p.score > 0)
            .sort((a, b) => b.score - a.score || b.views - a.views);
    }, [projects]);

    const topScore = ranked[0]?.score || 1;

    // Medal accents for the podium (gold / silver / bronze), neutral after.
    const medalColor = (i: number): string | null =>
        i === 0 ? '#F59E0B' : i === 1 ? '#94A3B8' : i === 2 ? '#D97706' : null;

    const stat = (icon: React.ReactNode, value: number, color: string, label: string) => (
        <div className="flex items-center gap-1" title={`${label}: ${value.toLocaleString()}`}>
            <span style={{ color }}>{icon}</span>
            <span className={`text-[11px] font-bold tabular-nums ${isDark ? 'text-white/70' : 'text-slate-600'}`}>
                {value.toLocaleString()}
            </span>
        </div>
    );

    return (
        <div className={`w-full ${isDark ? 'bg-[#0C0C0C] border-white/[0.06]' : 'bg-white border-black/[0.06] shadow-sm'} rounded-[28px] p-5 sm:p-8 md:p-10 relative overflow-hidden border transition-all duration-300`}>
            {/* Header */}
            <div className="flex flex-wrap items-start justify-between gap-4 mb-6">
                <div className="flex items-center gap-3">
                    <div className={`${isDark ? 'bg-amber-500/10 text-amber-400' : 'bg-amber-100 text-amber-600'} w-10 h-10 flex items-center justify-center rounded-xl`}>
                        <Trophy size={20} />
                    </div>
                    <div>
                        <h3 className={`${isDark ? 'text-white' : 'text-slate-900'} text-xl sm:text-2xl font-black tracking-[-0.02em] leading-none`}>
                            Project Rankings
                        </h3>
                        <p className={`${isDark ? 'text-[#666]' : 'text-slate-400'} text-[10px] font-bold uppercase tracking-[0.15em] mt-1.5`}>
                            Weighted engagement score
                        </p>
                    </div>
                </div>
                {/* Weight legend */}
                <div className={`hidden sm:flex items-center gap-3 px-3.5 py-2 rounded-xl border text-[10px] font-bold ${isDark ? 'bg-white/[0.03] border-white/[0.06] text-white/40' : 'bg-slate-50 border-black/5 text-slate-400'}`}>
                    <span className="flex items-center gap-1"><Eye size={12} className="text-blue-500" />×{RANK_WEIGHTS.view}</span>
                    <span className="flex items-center gap-1"><ExternalLink size={12} className="text-emerald-500" />×{RANK_WEIGHTS.live}</span>
                    <span className="flex items-center gap-1"><Github size={12} className="text-purple-500" />×{RANK_WEIGHTS.github}</span>
                    <span className="flex items-center gap-1"><Download size={12} className="text-amber-500" />×{RANK_WEIGHTS.download}</span>
                </div>
            </div>

            {/* List */}
            {ranked.length === 0 ? (
                <div className={`text-center py-12 text-sm italic ${isDark ? 'text-white/30' : 'text-slate-400'}`}>
                    No engagement recorded yet.
                </div>
            ) : (
                <div className="flex flex-col gap-2">
                    {ranked.map((p, i) => {
                        const accent = medalColor(i);
                        const barPct = Math.max(4, Math.round((p.score / topScore) * 100));
                        return (
                            <div
                                key={p.id}
                                className={`relative flex items-center gap-4 sm:gap-6 px-4 sm:px-5 py-4 rounded-2xl border transition-colors ${isDark ? 'bg-white/[0.02] border-white/[0.06] hover:bg-white/[0.04]' : 'bg-slate-50 border-black/[0.04] hover:bg-slate-100'}`}
                            >
                                {/* Rank */}
                                <div
                                    className="shrink-0 w-8 h-8 sm:w-9 sm:h-9 rounded-xl flex items-center justify-center font-black text-sm tabular-nums"
                                    style={{
                                        backgroundColor: accent ? `${accent}1f` : (isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)'),
                                        color: accent || (isDark ? 'rgba(255,255,255,0.5)' : '#64748b')
                                    }}
                                >
                                    {i + 1}
                                </div>

                                {/* Icon */}
                                <div className="shrink-0 w-9 h-9 sm:w-10 sm:h-10 rounded-lg overflow-hidden flex items-center justify-center" style={{ backgroundColor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)' }}>
                                    {p.icon ? (
                                        <FileImage src={p.icon} alt={p.name} className="w-full h-full object-cover" />
                                    ) : (
                                        <div className="w-full h-full bg-blue-500 text-white flex items-center justify-center font-bold">{p.name.charAt(0).toUpperCase()}</div>
                                    )}
                                </div>

                                {/* Name + breakdown + bar */}
                                <div className="flex-1 min-w-0">
                                    <div className="flex items-center justify-between gap-3">
                                        <span className={`font-bold text-sm truncate ${isDark ? 'text-white' : 'text-slate-900'}`} title={p.name}>{p.name}</span>
                                        <span className={`shrink-0 text-sm font-black tabular-nums ${isDark ? 'text-white' : 'text-slate-900'}`}>
                                            {p.score.toLocaleString()}
                                            <span className={`font-bold text-[9px] uppercase tracking-wider ml-1 ${isDark ? 'text-white/30' : 'text-slate-400'}`}>pts</span>
                                        </span>
                                    </div>
                                    {/* Relative score bar */}
                                    <div className={`h-1.5 rounded-full mt-3 overflow-hidden ${isDark ? 'bg-white/[0.06]' : 'bg-black/[0.05]'}`}>
                                        <div
                                            className="h-full rounded-full transition-all duration-500"
                                            style={{ width: `${barPct}%`, backgroundColor: accent || '#3B82F6' }}
                                        />
                                    </div>
                                    {/* Breakdown */}
                                    <div className="flex items-center flex-wrap gap-x-4 gap-y-1.5 mt-3">
                                        {stat(<Eye size={12} />, p.views, '#3B82F6', 'Views')}
                                        {stat(<ExternalLink size={12} />, p.liveViews, '#10B981', 'Demo opens')}
                                        {stat(<Github size={12} />, p.githubViews, '#8B5CF6', 'Repo opens')}
                                        {stat(<Download size={12} />, p.downloadViews, '#F59E0B', 'Downloads')}
                                        <span
                                            className={`ml-auto text-[10px] font-bold px-2 py-0.5 rounded-md ${isDark ? 'bg-white/[0.05] text-white/50' : 'bg-black/[0.04] text-slate-500'}`}
                                            title="Conversion - actions per view"
                                        >
                                            {Math.round(p.conversion * 100)}% conv
                                        </span>
                                    </div>
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
};
