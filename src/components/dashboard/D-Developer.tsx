import { useState, useEffect, useMemo, useCallback } from 'react';
import { Trash2, GripVertical, Github, Save, X, Search, Star, GitFork, Loader2, ListChecks, Check, ArrowUp, ArrowDown, RefreshCw } from 'lucide-react';
import { doc, onSnapshot, setDoc } from 'firebase/firestore';
import { Reorder, motion, useReducedMotion } from 'motion/react';
import { db } from '../../lib/firebase';
import Alert from '../Alert';
import useSafeAlert from '../../hooks/useSafeAlert';

const GITHUB_USERNAME = 'TemRevil';
const MAX_FEATURED = 3;

interface GhRepo {
    name: string;
    description: string | null;
    language: string | null;
    stargazers_count: number;
    forks_count: number;
    updated_at: string;
    fork: boolean;
    archived: boolean;
}

const DDeveloper = () => {
    const [repos, setRepos] = useState<string[]>([]);
    const [firestoreRepos, setFirestoreRepos] = useState<string[]>([]);
    const [allRepos, setAllRepos] = useState<GhRepo[]>([]);
    const [reposLoading, setReposLoading] = useState(true);
    const [reposError, setReposError] = useState<string | null>(null);
    const [search, setSearch] = useState('');
    const [isSaving, setIsSaving] = useState(false);
    const [hasChanges, setHasChanges] = useState(false);
    const [reloadKey, setReloadKey] = useState(0);
    const { alert, showAlert, hideAlert } = useSafeAlert();
    const reduceMotion = useReducedMotion();

    // Real-time Firestore sync (selected repos)
    useEffect(() => {
        const unsub = onSnapshot(doc(db, 'Settings', 'Developer'), (snap) => {
            if (snap.exists()) {
                const r: string[] = snap.data().featuredRepos || [];
                setRepos(r);
                setFirestoreRepos(r);
            }
        }, (err) => console.warn('[D-Developer] Firestore listener error:', err));
        return () => unsub();
    }, []);

    // Fetch all repos from GitHub
    useEffect(() => {
        const controller = new AbortController();
        let ignore = false;
        const fetchAll = async () => {
            setReposLoading(true);
            setReposError(null);
            const tid = setTimeout(() => controller.abort(), 10_000);
            try {
                const res = await fetch(
                    `https://api.github.com/users/${GITHUB_USERNAME}/repos?sort=updated&per_page=100`,
                    { signal: controller.signal },
                );
                clearTimeout(tid);
                if (ignore) return;
                if (res.ok) {
                    const data: GhRepo[] = await res.json();
                    data.sort(
                        (a, b) =>
                            b.stargazers_count - a.stargazers_count ||
                            new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime(),
                    );
                    setAllRepos(data);
                } else {
                    setReposError(`GitHub API error (${res.status})`);
                }
            } catch (e) {
                clearTimeout(tid);
                if (!ignore) setReposError(e instanceof Error ? e.message : 'Failed to load repos');
            } finally {
                if (!ignore) setReposLoading(false);
            }
        };
        fetchAll();
        return () => { ignore = true; controller.abort(); };
    }, [reloadKey]);

    useEffect(() => {
        setHasChanges(JSON.stringify(repos) !== JSON.stringify(firestoreRepos));
    }, [repos, firestoreRepos]);

    const toggleRepo = (name: string) => {
        if (repos.includes(name)) {
            setRepos(prev => prev.filter(r => r !== name));
        } else {
            if (repos.length >= MAX_FEATURED) {
                showAlert({ type: 'error', message: `Max ${MAX_FEATURED} featured repos. Remove one first.` });
                return;
            }
            setRepos(prev => [...prev, name]);
        }
    };

    const removeRepo = (name: string) => setRepos(prev => prev.filter(r => r !== name));

    // Keyboard-accessible reordering (drag is mouse/touch only).
    const moveRepo = useCallback((name: string, dir: -1 | 1) => {
        setRepos(prev => {
            const from = prev.indexOf(name);
            const to = from + dir;
            if (from < 0 || to < 0 || to >= prev.length) return prev;
            const next = [...prev];
            [next[from], next[to]] = [next[to], next[from]];
            return next;
        });
    }, []);

    const save = async () => {
        setIsSaving(true);
        try {
            await setDoc(doc(db, 'Settings', 'Developer'), { featuredRepos: repos }, { merge: true });
            showAlert({ type: 'success', message: 'Featured repos updated' });
        } catch {
            showAlert({ type: 'error', message: 'Failed to save' });
        }
        setIsSaving(false);
    };

    const filteredRepos = useMemo(() => {
        const q = search.trim().toLowerCase();
        if (!q) return allRepos;
        return allRepos.filter(
            r =>
                r.name.toLowerCase().includes(q) ||
                (r.description?.toLowerCase().includes(q) ?? false) ||
                (r.language?.toLowerCase().includes(q) ?? false),
        );
    }, [allRepos, search]);

    return (
        <motion.div
            initial={reduceMotion ? false : { opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={reduceMotion ? { duration: 0 } : { duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
            className="grid grid-cols-1 md:grid-cols-12 gap-6 items-start"
        >
            {alert?.show && <Alert message={alert.message} type={alert.type} onClose={hideAlert} />}

            {/* ── Left panel: Featured (selected) ── */}
            <div className="md:col-span-5 glass-panel p-6 flex flex-col gap-4">
                <div>
                    <h3 className="heading-md text-base sm:text-lg md:text-xl flex items-center mb-2">
                        <Github size={22} className="mr-3" />
                        Featured Repos
                    </h3>
                    <p className="text-muted text-xs leading-relaxed">
                        Pick up to {MAX_FEATURED} repos from <strong>@{GITHUB_USERNAME}</strong> to showcase on the
                        public Developer page. Drag to reorder.
                    </p>
                </div>

                <div>
                    <label className="dashboard-label">Selected ({repos.length}/{MAX_FEATURED})</label>
                    {repos.length > 0 ? (
                        <Reorder.Group
                            axis="y"
                            values={repos}
                            onReorder={setRepos}
                            className="flex flex-col gap-2 list-none p-0 m-0"
                        >
                            {repos.map((name, i) => (
                                <Reorder.Item
                                    key={name}
                                    value={name}
                                    tabIndex={0}
                                    role="listitem"
                                    aria-label={`${name}, position ${i + 1} of ${repos.length}. Use arrow up or down to reorder.`}
                                    onKeyDown={(e) => {
                                        if (e.key === 'ArrowUp') { e.preventDefault(); moveRepo(name, -1); }
                                        else if (e.key === 'ArrowDown') { e.preventDefault(); moveRepo(name, 1); }
                                    }}
                                    className="flex items-center gap-3 px-3 py-2.5 rounded-xl cursor-grab active:cursor-grabbing"
                                    style={{
                                        background: 'rgba(51,149,255,0.06)',
                                        border: '1px solid rgba(51,149,255,0.22)',
                                    }}
                                >
                                    <GripVertical size={15} className="text-muted shrink-0" aria-hidden />
                                    <span
                                        className="grid place-items-center shrink-0 text-[0.65rem] font-black"
                                        style={{
                                            width: 22, height: 22, borderRadius: 6,
                                            background: 'rgba(51,149,255,0.16)',
                                            border: '1px solid rgba(51,149,255,0.35)',
                                            color: 'var(--accent)',
                                        }}
                                    >
                                        {i + 1}
                                    </span>
                                    <span className="flex-1 text-sm font-bold text-primary truncate">{name}</span>
                                    {/* Keyboard-accessible reorder controls (drag is pointer-only) */}
                                    <button
                                        onClick={() => moveRepo(name, -1)}
                                        disabled={i === 0}
                                        aria-label={`Move ${name} up`}
                                        className="grid place-items-center shrink-0 rounded-lg text-muted transition-colors disabled:opacity-30 disabled:cursor-not-allowed hover:text-primary"
                                        style={{ width: 44, height: 44 }}
                                    >
                                        <ArrowUp size={15} />
                                    </button>
                                    <button
                                        onClick={() => moveRepo(name, 1)}
                                        disabled={i === repos.length - 1}
                                        aria-label={`Move ${name} down`}
                                        className="grid place-items-center shrink-0 rounded-lg text-muted transition-colors disabled:opacity-30 disabled:cursor-not-allowed hover:text-primary"
                                        style={{ width: 44, height: 44 }}
                                    >
                                        <ArrowDown size={15} />
                                    </button>
                                    <button
                                        onClick={() => removeRepo(name)}
                                        aria-label={`Remove ${name}`}
                                        className="grid place-items-center shrink-0 rounded-lg text-muted transition-colors"
                                        style={{ width: 44, height: 44 }}
                                        onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--danger)'; e.currentTarget.style.background = 'rgba(var(--danger-rgb),0.1)'; }}
                                        onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--text-muted)'; e.currentTarget.style.background = 'transparent'; }}
                                    >
                                        <Trash2 size={15} />
                                    </button>
                                </Reorder.Item>
                            ))}
                        </Reorder.Group>
                    ) : (
                        <div
                            className="flex flex-col items-center justify-center text-center gap-2 py-8 px-4 rounded-xl text-muted"
                            style={{ border: '2px dashed var(--section-border)' }}
                        >
                            <ListChecks size={22} className="opacity-40" />
                            <span className="text-xs">Select repos from the list to feature them</span>
                        </div>
                    )}
                </div>

                {/* Save / Discard */}
                {hasChanges && (
                    <div className="flex gap-2 pt-4" style={{ borderTop: '1px solid var(--section-border)' }}>
                        <button
                            onClick={save}
                            disabled={isSaving}
                            className="btn-primary inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl text-sm font-bold cursor-pointer"
                        >
                            <Save size={16} />
                            {isSaving ? 'Saving…' : 'Save Changes'}
                        </button>
                        <button
                            onClick={() => setRepos(firestoreRepos)}
                            className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl text-sm font-bold bg-transparent cursor-pointer transition-colors text-muted"
                            style={{ border: '1px solid var(--section-border)' }}
                        >
                            <X size={16} />
                            Discard
                        </button>
                    </div>
                )}
            </div>

            {/* ── Right panel: All repositories ── */}
            <div className="md:col-span-7 glass-panel p-6 flex flex-col gap-4">
                <div className="flex items-center justify-between gap-3 flex-wrap">
                    <h3 className="heading-md text-base sm:text-lg md:text-xl flex items-center">
                        <Search size={22} className="mr-3" />
                        All Repositories
                        {!reposLoading && (
                            <span className="ml-2 text-xs font-semibold text-muted">({filteredRepos.length})</span>
                        )}
                    </h3>
                </div>

                {/* Search */}
                <div className="relative">
                    <Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted pointer-events-none" />
                    <input
                        type="text"
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        placeholder="Search repositories…"
                        aria-label="Search repositories"
                        className="dashboard-input"
                        style={{ paddingLeft: 40 }}
                    />
                </div>

                {/* Repo list */}
                {reposLoading ? (
                    <div className="flex items-center justify-center gap-2 py-12 text-muted text-sm">
                        <Loader2 size={16} className="animate-spin" />
                        Loading repositories…
                    </div>
                ) : reposError ? (
                    <div
                        role="alert"
                        className="flex flex-col items-center gap-3 py-5 px-4 rounded-xl text-center text-sm"
                        style={{ border: '1px solid rgba(var(--danger-rgb),0.3)', background: 'rgba(var(--danger-rgb),0.05)', color: 'var(--danger)' }}
                    >
                        <span>{reposError}</span>
                        <button
                            onClick={() => setReloadKey(k => k + 1)}
                            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-bold cursor-pointer transition-colors"
                            style={{ border: '1px solid rgba(var(--danger-rgb),0.4)', color: 'var(--danger)' }}
                        >
                            <RefreshCw size={14} />
                            Retry
                        </button>
                    </div>
                ) : filteredRepos.length === 0 ? (
                    <div
                        className="py-8 px-4 rounded-xl text-center text-muted text-sm"
                        style={{ border: '2px dashed var(--section-border)' }}
                    >
                        No repositories match &ldquo;{search}&rdquo;
                    </div>
                ) : (
                    <div
                        className="grid gap-3 overflow-y-auto custom-scrollbar pr-1"
                        style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(230px, 1fr))', maxHeight: 460 }}
                    >
                        {filteredRepos.map((repo) => {
                            const rank = repos.indexOf(repo.name);
                            const selected = rank >= 0;
                            return (
                                <button
                                    key={repo.name}
                                    onClick={() => toggleRepo(repo.name)}
                                    aria-pressed={selected}
                                    aria-label={selected ? `${repo.name}, featured at position ${rank + 1}. Activate to remove.` : `${repo.name}. Activate to feature.`}
                                    className="flex items-start gap-3 p-3 rounded-xl cursor-pointer text-left transition-colors"
                                    style={{
                                        background: selected ? 'rgba(51,149,255,0.06)' : 'rgba(128,128,128,0.03)',
                                        border: `1px solid ${selected ? 'rgba(51,149,255,0.35)' : 'var(--section-border)'}`,
                                    }}
                                >
                                    {/* Selection indicator — shows a check + rank when featured (not color-only) */}
                                    <span
                                        className="grid place-items-center shrink-0 mt-0.5 text-[0.6rem] font-black"
                                        style={{
                                            width: 20, height: 20, borderRadius: 6,
                                            background: selected ? 'rgba(51,149,255,0.18)' : 'transparent',
                                            border: `1.5px solid ${selected ? 'var(--accent)' : 'var(--input-border)'}`,
                                            color: 'var(--accent)',
                                        }}
                                    >
                                        {selected ? <Check size={12} strokeWidth={3.5} /> : ''}
                                    </span>
                                    {selected && (
                                        <span className="sr-only">Featured, position {rank + 1}</span>
                                    )}

                                    {/* Info */}
                                    <div className="flex-1 min-w-0">
                                        <div className="text-sm font-bold text-primary truncate">
                                            {repo.name}
                                            {repo.fork && (
                                                <span className="ml-1.5 align-middle text-[0.58rem] font-semibold px-1.5 py-0.5 rounded text-muted" style={{ background: 'rgba(128,128,128,0.12)' }}>fork</span>
                                            )}
                                            {repo.archived && (
                                                <span className="ml-1.5 align-middle text-[0.58rem] font-semibold px-1.5 py-0.5 rounded text-muted" style={{ background: 'rgba(128,128,128,0.12)' }}>archived</span>
                                            )}
                                        </div>
                                        {repo.description && (
                                            <p
                                                className="text-[0.7rem] text-muted mt-0.5 mb-1"
                                                style={{ display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden', lineHeight: 1.4 }}
                                            >
                                                {repo.description}
                                            </p>
                                        )}
                                        <div className="flex items-center gap-3 text-[0.65rem] text-muted">
                                            {repo.language && <span className="font-semibold">{repo.language}</span>}
                                            <span className="flex items-center gap-1"><Star size={10} />{repo.stargazers_count}</span>
                                            {repo.forks_count > 0 && (
                                                <span className="flex items-center gap-1"><GitFork size={10} />{repo.forks_count}</span>
                                            )}
                                        </div>
                                    </div>
                                </button>
                            );
                        })}
                    </div>
                )}
            </div>
        </motion.div>
    );
};

export default DDeveloper;
