import { useEffect, useRef, useState } from 'react';
import { doc, onSnapshot, setDoc } from 'firebase/firestore';
import { BookOpen, Check, Plus, Trash2, X, ExternalLink, Eye, EyeOff, ArrowUp, ArrowDown } from 'lucide-react';
import { db } from '../../lib/firebase';
import type { AlertType } from '../Alert';
import {
    DEFAULT_BOOK_PAGE, parseBookPage, isSafeLinkUrl, introRuns,
    MAX_TAGS, MAX_TAG_LENGTH, MAX_INTRO_LENGTH, MAX_SLOGAN_LENGTH, MAX_LINKS,
    type BookPageConfig, type BookLink,
} from '../../utils/bookPage';

interface Props {
    isDark: boolean;
    containerBg: string;
    showAlert: (a: { type: AlertType; message: string; duration?: number }) => void;
}

/**
 * Canary → Options: what the public /book page says. Title, intro, tags, status pill
 * and which links show, saved to Settings/BookPage (public read, admin write). The page
 * listens live, so a save shows up for open visitors without a redeploy.
 */
const BookPageEditor = ({ isDark, containerBg, showAlert }: Props) => {
    const [draft, setDraft] = useState<BookPageConfig>(DEFAULT_BOOK_PAGE);
    const [dirty, setDirty] = useState(false);
    const dirtyRef = useRef(false);
    const [saving, setSaving] = useState(false);
    const [newTag, setNewTag] = useState('');
    const [newLink, setNewLink] = useState({ label: '', url: '' });

    // Live doc, but never stomp an edit in progress.
    useEffect(() => onSnapshot(doc(db, 'Settings', 'BookPage'), (snap) => {
        if (!dirtyRef.current) setDraft(parseBookPage(snap.exists() ? snap.data() : null));
    }, () => { /* offline / blocked: keep the defaults on screen */ }), []);

    const patch = (p: Partial<BookPageConfig>) => {
        dirtyRef.current = true;
        setDirty(true);
        setDraft(prev => ({ ...prev, ...p }));
    };
    const patchLink = (id: string, p: Partial<BookLink>) => patch({ links: draft.links.map(l => l.id === id ? { ...l, ...p } : l) });
    const moveLink = (i: number, by: number) => {
        const links = [...draft.links];
        const j = i + by;
        if (j < 0 || j >= links.length) return;
        [links[i], links[j]] = [links[j], links[i]];
        patch({ links });
    };

    const addTag = () => {
        const t = newTag.trim().slice(0, MAX_TAG_LENGTH);
        if (!t) return;
        if (draft.tags.some(x => x.toLowerCase() === t.toLowerCase())) { showAlert({ type: 'warning', message: 'That tag is already there' }); return; }
        if (draft.tags.length >= MAX_TAGS) { showAlert({ type: 'warning', message: `Up to ${MAX_TAGS} tags` }); return; }
        patch({ tags: [...draft.tags, t] });
        setNewTag('');
    };

    const addLink = () => {
        const label = newLink.label.trim(), url = newLink.url.trim();
        if (!label || !url) return;
        if (!isSafeLinkUrl(url)) { showAlert({ type: 'error', message: 'Use a full https:// link, a mailto: address, or a site path like /' }); return; }
        if (draft.links.length >= MAX_LINKS) { showAlert({ type: 'warning', message: `Up to ${MAX_LINKS} links` }); return; }
        patch({ links: [...draft.links, { id: `link-${crypto.randomUUID().slice(0, 8)}`, kind: 'link', label, url, show: true }] });
        setNewLink({ label: '', url: '' });
    };

    const save = async () => {
        const bad = draft.links.find(l => !l.label.trim() || !isSafeLinkUrl(l.url));
        if (bad) { showAlert({ type: 'error', message: `Fix the link "${bad.label || bad.url || 'untitled'}" first: it needs a name and an https://, mailto: or / address` }); return; }
        setSaving(true);
        try {
            await setDoc(doc(db, 'Settings', 'BookPage'), {
                slogan: draft.slogan.trim(),
                intro: draft.intro.trim(),
                tags: draft.tags,
                status: draft.status.trim(),
                links: draft.links.map(l => ({ ...l, label: l.label.trim(), url: l.url.trim() })),
            });
            dirtyRef.current = false;
            setDirty(false);
            showAlert({ type: 'success', message: 'Book page saved' });
        } catch {
            showAlert({ type: 'error', message: 'Failed to save - are you signed in as admin?' });
        } finally {
            setSaving(false);
        }
    };

    const reset = () => {
        dirtyRef.current = true;
        setDirty(true);
        setDraft(DEFAULT_BOOK_PAGE);
    };

    const fg = isDark ? '#fff' : '#000';
    const inputStyle = { backgroundColor: isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.04)', borderColor: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)', color: fg };
    const inputCls = 'w-full min-w-0 h-11 rounded-xl border px-4 text-sm font-medium outline-none focus:border-blue-500 transition-colors';
    const chipBg = isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.05)';
    const iconBtn = 'grid place-items-center w-9 h-9 rounded-lg cursor-pointer transition-colors disabled:opacity-30 disabled:cursor-not-allowed shrink-0';

    return (
        <div
            className="canary-panel w-full flex flex-col gap-7 p-6 min-[460px]:p-8 rounded-[24px] min-[460px]:rounded-[32px] border shadow-sm"
            style={{ backgroundColor: containerBg, borderColor: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.05)', gridColumn: '1 / -1' }}
        >
            <div className="flex items-start gap-4">
                <span className="grid place-items-center shrink-0 rounded-2xl" style={{ width: 48, height: 48, background: 'rgba(59,130,246,0.12)', color: '#3b82f6' }}>
                    <BookOpen size={24} />
                </span>
                <div className="flex-1 min-w-0">
                    <h3 className="text-lg sm:text-xl font-bold m-0" style={{ color: fg }}>Book page</h3>
                    <p className="text-sm mt-1 max-w-xl" style={{ color: 'var(--text-muted)' }}>
                        What temrevil.com/book says about you. Changes go live for visitors the moment you save.
                    </p>
                </div>
                <a href="/book" target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 text-sm font-bold shrink-0" style={{ color: '#3b82f6' }}>
                    Open <ExternalLink size={14} />
                </a>
            </div>

            <div className="grid gap-7" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))' }}>
                {/* Words */}
                <div className="flex flex-col gap-5">
                    <div className="flex flex-col gap-2">
                        <label htmlFor="bp-slogan" className="text-sm font-bold" style={{ color: fg }}>Handwritten title</label>
                        <input id="bp-slogan" className={inputCls} style={inputStyle} maxLength={MAX_SLOGAN_LENGTH} value={draft.slogan}
                            placeholder={DEFAULT_BOOK_PAGE.slogan} onChange={e => patch({ slogan: e.target.value })} />
                        <span className="text-xs" style={{ color: 'var(--text-muted)' }}>Written in marker next to your name.</span>
                    </div>

                    <div className="flex flex-col gap-2">
                        <div className="flex items-center justify-between gap-3">
                            <label htmlFor="bp-intro" className="text-sm font-bold" style={{ color: fg }}>Intro</label>
                            <span className="text-xs tabular-nums" style={{ color: 'var(--text-muted)' }}>{draft.intro.length}/{MAX_INTRO_LENGTH}</span>
                        </div>
                        <textarea id="bp-intro" rows={4} maxLength={MAX_INTRO_LENGTH} value={draft.intro} onChange={e => patch({ intro: e.target.value })}
                            className="w-full rounded-xl border px-4 py-3 text-sm font-medium outline-none focus:border-blue-500 transition-colors resize-y leading-relaxed" style={inputStyle} />
                        <span className="text-xs" style={{ color: 'var(--text-muted)' }}>Wrap words in **double asterisks** to make them bold.</span>
                        {draft.intro.trim() && (
                            <p className="text-sm leading-relaxed m-0 px-4 py-3 rounded-xl" style={{ background: chipBg, color: 'var(--text-secondary)' }}>
                                {introRuns(draft.intro).map((r, i) => r.bold ? <b key={i} style={{ color: fg }}>{r.text}</b> : <span key={i}>{r.text}</span>)}
                            </p>
                        )}
                    </div>

                    <div className="flex flex-col gap-2">
                        <label htmlFor="bp-status" className="text-sm font-bold" style={{ color: fg }}>Status pill</label>
                        <input id="bp-status" className={inputCls} style={inputStyle} maxLength={40} value={draft.status}
                            placeholder="Leave empty to hide it" onChange={e => patch({ status: e.target.value })} />
                        <span className="text-xs" style={{ color: 'var(--text-muted)' }}>Shown with the green dot, like &quot;Available now&quot;. Empty hides it.</span>
                    </div>

                    <div className="flex flex-col gap-3">
                        <div className="flex items-center justify-between gap-3">
                            <label htmlFor="bp-new-tag" className="text-sm font-bold" style={{ color: fg }}>What you build (tags)</label>
                            <span className="text-xs tabular-nums" style={{ color: 'var(--text-muted)' }}>{draft.tags.length}/{MAX_TAGS}</span>
                        </div>
                        <div className="flex flex-wrap gap-2">
                            {draft.tags.map((t, i) => (
                                <span key={t} className="inline-flex items-center gap-1 pl-3 pr-1 h-8 rounded-lg text-xs font-semibold" style={{ background: chipBg, color: fg }}>
                                    {t}
                                    <button type="button" aria-label={`Remove ${t}`} onClick={() => patch({ tags: draft.tags.filter((_, k) => k !== i) })}
                                        className="grid place-items-center w-6 h-6 rounded-md cursor-pointer opacity-60 hover:opacity-100">
                                        <X size={13} />
                                    </button>
                                </span>
                            ))}
                            {draft.tags.length === 0 && <span className="text-sm" style={{ color: 'var(--text-muted)' }}>No tags, the row is hidden.</span>}
                        </div>
                        <div className="flex items-center gap-2">
                            <input id="bp-new-tag" className={inputCls} style={inputStyle} maxLength={MAX_TAG_LENGTH} value={newTag} placeholder="Add a tag"
                                onChange={e => setNewTag(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addTag(); } }} />
                            <button type="button" onClick={addTag} disabled={!newTag.trim()}
                                className="inline-flex items-center justify-center gap-2 px-5 h-11 rounded-xl text-sm font-bold cursor-pointer transition-colors disabled:opacity-40 disabled:cursor-not-allowed shrink-0"
                                style={{ background: '#3b82f6', color: '#fff' }}>
                                <Plus size={16} /> Add
                            </button>
                        </div>
                    </div>
                </div>

                {/* Links */}
                <div className="flex flex-col gap-3">
                    <div className="flex items-center justify-between gap-3">
                        <span className="text-sm font-bold" style={{ color: fg }}>Links</span>
                        <span className="text-xs" style={{ color: 'var(--text-muted)' }}>{draft.links.filter(l => l.show).length} shown</span>
                    </div>
                    <div className="flex flex-col gap-2">
                        {draft.links.map((l, i) => (
                            <div key={l.id} className="flex flex-col gap-2 p-3 rounded-xl" style={{ background: isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.03)', opacity: l.show ? 1 : 0.6 }}>
                                <div className="flex items-center gap-2">
                                    <input aria-label="Link name" className={inputCls} style={{ ...inputStyle, height: 36 }} value={l.label} maxLength={60}
                                        onChange={e => patchLink(l.id, { label: e.target.value })} />
                                    <button type="button" className={iconBtn} aria-label={l.show ? `Hide ${l.label}` : `Show ${l.label}`} aria-pressed={l.show}
                                        title={l.show ? 'Shown on the page' : 'Hidden'}
                                        onClick={() => patchLink(l.id, { show: !l.show })} style={{ color: l.show ? '#3b82f6' : 'var(--text-muted)' }}>
                                        {l.show ? <Eye size={16} /> : <EyeOff size={16} />}
                                    </button>
                                    <button type="button" className={iconBtn} aria-label={`Move ${l.label} up`} disabled={i === 0} onClick={() => moveLink(i, -1)} style={{ color: 'var(--text-muted)' }}><ArrowUp size={15} /></button>
                                    <button type="button" className={iconBtn} aria-label={`Move ${l.label} down`} disabled={i === draft.links.length - 1} onClick={() => moveLink(i, 1)} style={{ color: 'var(--text-muted)' }}><ArrowDown size={15} /></button>
                                    <button type="button" className={iconBtn} aria-label={`Delete ${l.label}`} onClick={() => patch({ links: draft.links.filter(x => x.id !== l.id) })} style={{ color: '#ef4444' }}><Trash2 size={15} /></button>
                                </div>
                                <input aria-label={`${l.label} address`} className={inputCls} style={{ ...inputStyle, height: 36, fontSize: 12, borderColor: isSafeLinkUrl(l.url) ? inputStyle.borderColor : '#ef4444' }}
                                    value={l.url} onChange={e => patchLink(l.id, { url: e.target.value })} />
                            </div>
                        ))}
                        {draft.links.length === 0 && <p className="text-sm m-0" style={{ color: 'var(--text-muted)' }}>No links, the row is hidden.</p>}
                    </div>
                    <div className="flex flex-col gap-2 pt-1">
                        <label htmlFor="bp-new-link" className="text-sm font-bold" style={{ color: fg }}>New link</label>
                        <input id="bp-new-link" className={inputCls} style={inputStyle} placeholder="Name, e.g. YouTube" maxLength={60} value={newLink.label}
                            onChange={e => setNewLink({ ...newLink, label: e.target.value })} />
                        <div className="flex items-center gap-2">
                            <input aria-label="New link address" className={inputCls} style={inputStyle} placeholder="https://..." value={newLink.url}
                                onChange={e => setNewLink({ ...newLink, url: e.target.value })} onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addLink(); } }} />
                            <button type="button" onClick={addLink} disabled={!newLink.label.trim() || !newLink.url.trim()}
                                className="inline-flex items-center justify-center gap-2 px-5 h-11 rounded-xl text-sm font-bold cursor-pointer transition-colors disabled:opacity-40 disabled:cursor-not-allowed shrink-0"
                                style={{ background: '#3b82f6', color: '#fff' }}>
                                <Plus size={16} /> Add
                            </button>
                        </div>
                    </div>
                </div>
            </div>

            <div className="flex items-center justify-between gap-3 flex-wrap">
                <button type="button" onClick={reset} className="text-sm font-bold cursor-pointer" style={{ color: 'var(--text-muted)' }}>
                    Restore the original text
                </button>
                <button
                    type="button"
                    onClick={save}
                    disabled={!dirty || saving}
                    className="inline-flex items-center gap-2 px-6 py-2.5 rounded-xl text-sm font-bold cursor-pointer transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                    style={{ background: '#3b82f6', color: '#fff' }}
                >
                    <Check size={16} />
                    {saving ? 'Saving…' : 'Save book page'}
                </button>
            </div>
        </div>
    );
};

export default BookPageEditor;
