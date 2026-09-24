import { useEffect, useRef, useState } from 'react';
import { doc, onSnapshot, setDoc } from 'firebase/firestore';
import { BookOpen, Check, Plus, X, ExternalLink, Link2, Mail, Settings2 } from 'lucide-react';
import { db } from '../../lib/firebase';
import type { AlertType } from '../Alert';
import {
    DEFAULT_BOOK_PAGE, parseBookPage, linksFromAccount,
    MAX_TAGS, MAX_TAG_LENGTH, MAX_INTRO_LENGTH, MAX_SLOGAN_LENGTH,
    type BookPageConfig, type BookLink,
} from '../../utils/bookPage';

const INTRO_TYPE = 'text-sm font-medium leading-relaxed px-4 py-3 whitespace-pre-wrap break-words';

/**
 * A textarea that shows **bold** as you type. The typed text is transparent and sits
 * exactly over a mirror that renders the same characters, with each closed **pair**
 * drawn bold and its asterisks dimmed. Bold is a text stroke rather than a heavier
 * weight on purpose: a real bold is wider and would push the mirror out of line with
 * the caret. The mirror sits in the flow, so the field grows with its text.
 */
const FormattedTextarea = ({ id, value, onChange, maxLength, placeholder, fg, inputStyle }: {
    id: string; value: string; onChange: (v: string) => void; maxLength: number; placeholder: string;
    fg: string; inputStyle: { backgroundColor: string; borderColor: string; color: string };
}) => (
    <div className="relative rounded-xl border transition-colors focus-within:!border-blue-500" style={{ backgroundColor: inputStyle.backgroundColor, borderColor: inputStyle.borderColor }}>
        <div aria-hidden="true" className={`${INTRO_TYPE} min-h-[7.5rem]`} style={{ color: fg }}>
            {value.split(/(\*\*[^*\n]+\*\*)/g).map((part, i) =>
                part.length > 4 && part.startsWith('**') && part.endsWith('**') ? (
                    <span key={i}>
                        <span style={{ opacity: 0.35 }}>**</span>
                        <span style={{ WebkitTextStroke: '0.65px currentColor' }}>{part.slice(2, -2)}</span>
                        <span style={{ opacity: 0.35 }}>**</span>
                    </span>
                ) : <span key={i} style={{ opacity: 0.82 }}>{part}</span>)}
            {/* keeps a trailing newline's empty line, so the field grows under the caret */}
            {'\u200b'}
        </div>
        <textarea
            id={id}
            value={value}
            maxLength={maxLength}
            placeholder={placeholder}
            spellCheck
            onChange={e => onChange(e.target.value)}
            className={`${INTRO_TYPE} absolute inset-0 w-full h-full resize-none overflow-hidden bg-transparent outline-none placeholder:text-[var(--text-muted)]`}
            style={{ color: 'transparent', caretColor: fg, outline: 'none' }}
        />
    </div>
);

interface Props {
    isDark: boolean;
    containerBg: string;
    showAlert: (a: { type: AlertType; message: string; duration?: number }) => void;
}

/**
 * Canary → Options: what the public /book page says. Title, intro and tags, saved to
 * Settings/BookPage (public read, admin write). The page listens live, so a save shows
 * up for open visitors without a redeploy. Its links are the site's own, edited in
 * dashboard Settings → Social Links; they are listed here read-only.
 */
const BookPageEditor = ({ isDark, containerBg, showAlert }: Props) => {
    const [draft, setDraft] = useState<BookPageConfig>(DEFAULT_BOOK_PAGE);
    const [dirty, setDirty] = useState(false);
    const dirtyRef = useRef(false);
    const [saving, setSaving] = useState(false);
    const [newTag, setNewTag] = useState('');
    const [links, setLinks] = useState<BookLink[]>(() => linksFromAccount(null));

    // Live doc, but never stomp an edit in progress.
    useEffect(() => onSnapshot(doc(db, 'Settings', 'BookPage'), (snap) => {
        if (!dirtyRef.current) setDraft(parseBookPage(snap.exists() ? snap.data() : null));
    }, () => { /* offline / blocked: keep the defaults on screen */ }), []);
    useEffect(() => onSnapshot(doc(db, 'Settings', 'Account'),
        (snap) => setLinks(linksFromAccount(snap.exists() ? snap.data() : null)), () => { }), []);

    const patch = (p: Partial<BookPageConfig>) => {
        dirtyRef.current = true;
        setDirty(true);
        setDraft(prev => ({ ...prev, ...p }));
    };
    const addTag = () => {
        const t = newTag.trim().slice(0, MAX_TAG_LENGTH);
        if (!t) return;
        if (draft.tags.some(x => x.toLowerCase() === t.toLowerCase())) { showAlert({ type: 'warning', message: 'That tag is already there' }); return; }
        if (draft.tags.length >= MAX_TAGS) { showAlert({ type: 'warning', message: `Up to ${MAX_TAGS} tags` }); return; }
        patch({ tags: [...draft.tags, t] });
        setNewTag('');
    };

    const save = async () => {
        setSaving(true);
        try {
            await setDoc(doc(db, 'Settings', 'BookPage'), {
                slogan: draft.slogan.trim(),
                intro: draft.intro.trim(),
                tags: draft.tags,
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

    const fg = isDark ? '#fff' : '#000';
    const inputStyle = { backgroundColor: isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.04)', borderColor: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)', color: fg };
    const inputCls = 'w-full min-w-0 h-11 rounded-xl border px-4 text-sm font-medium outline-none focus:border-blue-500 transition-colors';
    const chipBg = isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.05)';

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
                        <FormattedTextarea id="bp-intro" value={draft.intro} maxLength={MAX_INTRO_LENGTH} onChange={v => patch({ intro: v })}
                            fg={fg} inputStyle={inputStyle} placeholder="I'm **your name**. What you build, and what a call is for." />
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

                {/* Links: the site's own, read-only here */}
                <div className="flex flex-col gap-3">
                    <div className="flex items-center justify-between gap-3">
                        <span className="text-sm font-bold" style={{ color: fg }}>Links</span>
                        <span className="text-xs" style={{ color: 'var(--text-muted)' }}>From Settings</span>
                    </div>
                    <ul className="flex flex-col gap-1.5 m-0 p-0 list-none">
                        {links.map(l => (
                            <li key={l.id} className="flex items-center gap-3 h-12 px-3 rounded-xl" style={{ background: isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.03)' }}>
                                <span className="grid place-items-center w-7 h-7 rounded-lg shrink-0" style={{ background: 'rgba(59,130,246,0.12)', color: '#3b82f6' }}>
                                    {l.kind === 'email' ? <Mail size={14} /> : <Link2 size={14} />}
                                </span>
                                <span className="text-sm font-bold truncate shrink-0 max-w-[45%]" style={{ color: fg }}>{l.label}</span>
                                <span className="text-xs truncate min-w-0" style={{ color: 'var(--text-muted)' }}>{l.url.replace(/^mailto:/, '')}</span>
                            </li>
                        ))}
                    </ul>
                    <p className="flex items-start gap-2 text-xs leading-relaxed m-0" style={{ color: 'var(--text-muted)' }}>
                        <Settings2 size={14} className="shrink-0 mt-px" />
                        The same links as the rest of the site. Change them, and the email, in Settings → Social Links.
                    </p>
                </div>
            </div>

            <div className="flex items-center justify-end gap-3 flex-wrap">
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
