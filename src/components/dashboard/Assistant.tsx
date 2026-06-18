import { useState, useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import anime from 'animejs';
import { Sparkles, X, Send, Settings2, Loader2, MousePointer2, Check, Database, ArrowRight, Zap, HelpCircle, Mic, Volume2, VolumeX, Brain } from 'lucide-react';
import { doc, collection, getDoc, getDocs, setDoc, deleteDoc, serverTimestamp } from 'firebase/firestore';
import { onAuthStateChanged } from 'firebase/auth';
import { db } from '../../lib/firebase';
import { appAuth } from '../../lib/appAuth';
import {
    chat, getApiKey, setKeyOverride, getModel, setModel, detectProvider, listModels,
    userMessage, toolResultMessage, PROVIDER_LABEL, ToolCall, ToolResult,
} from '../../lib/llm';
import ScrollMenu from './ScrollMenu';
import Markdown from './Markdown';

type Status = 'idle' | 'connecting' | 'thinking' | 'acting' | 'speaking' | 'error';

// Each status animates the spark through its OWN set of colors - not one generic
// hue. e.g. thinking = violet→pink→indigo shimmer; acting = amber→green hustle.
const PALETTES: Record<Status, string[]> = {
    idle: ['#94a3b8', '#cbd5e1', '#a5b4fc'],
    connecting: ['#06b6d4', '#3b82f6', '#0ea5e9'],
    thinking: ['#8b5cf6', '#ec4899', '#6366f1', '#a855f7'],
    acting: ['#f59e0b', '#22c55e', '#10b981', '#eab308'],
    speaking: ['#22c55e', '#34d399', '#10b981'],
    error: ['#f43f5e', '#ef4444', '#fb7185'],
};
const STATUS_LABEL: Record<Status, string> = {
    idle: 'Ready', connecting: 'Connecting…', thinking: 'Thinking…', acting: 'Working…', speaking: 'Done', error: 'Oops',
};

interface DisplayMsg { role: 'user' | 'assistant' | 'tool'; text: string; }
interface PendingConfirm { desc: string; detail?: string; resolve: (ok: boolean) => void; }
interface Quiz { question: string; options: string[]; multi: boolean; resolve: (answer: string) => void; }

// Client-side safety limits for the agent.
const MIN_SEND_GAP_MS = 1500;        // anti-spam between messages
const MAX_MSGS_PER_MIN = 15;         // rolling rate cap
const MAX_ROUNDS = 25;                // max LLM round-trips per turn (lets it self-drive multi-step tasks)
const MAX_TOOLS_PER_ROUND = 8;        // cap tool fan-out per round
const TURN_BUDGET_MS = 180_000;       // wall-clock safety budget for one turn (3 min)
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type NativeMsg = any;

// Minimal Web Speech typing (vendor-prefixed, not in lib.dom everywhere).
type SpeechRec = { start: () => void; stop: () => void; lang: string; interimResults: boolean; continuous: boolean; onresult: ((e: { results: { 0: { transcript: string } }[] }) => void) | null; onend: (() => void) | null; onerror: (() => void) | null; };

const PAGES = ['projects', 'tags', 'views', 'developer', 'treasury', 'settings', 'canary'];

// Spark's own persistent memory (separate admin-only collection): the user's
// name, her editable standing instructions, and saved facts.
const MEMORY_DOC = doc(db, 'Spark', 'Memory');
interface SparkMemory { userName?: string; instructions?: string; facts?: string[]; }

// Firestore paths backing each dashboard page - what read_screen pulls so Spark
// can "see" whatever the user is currently looking at.
const PAGE_SOURCES: Record<string, string[]> = {
    treasury: ['Treasury/projects', 'Treasury/income', 'Treasury/spendings', 'Treasury/settings'],
    views: ['Settings/Views/Analysis/Main', 'Settings/Views/Analysis/Daily', 'Settings/Views/Links', 'Settings/Views/Socials'],
    projects: ['Projects'],
    tags: ['Tags'],
    developer: ['Settings/Developer'],
    settings: ['Settings/Account', 'Settings/Availability', 'Settings/HandledProjects', 'Settings/Tech Stack'],
    canary: ['Settings/Canary'],
};
const PAGE_LABEL: Record<string, string> = {
    treasury: 'Treasury', views: 'Views & analytics', projects: 'Projects', tags: 'Tags',
    developer: 'Developer', settings: 'Settings', canary: 'Canary (visitor inbox)',
};

const Assistant = ({ onNavigate, currentPage }: { onNavigate: (page: string) => void; currentPage: string }) => {
    const [isDark, setIsDark] = useState(false);
    const [open, setOpen] = useState(false);
    const pageRef = useRef(currentPage);
    useEffect(() => { pageRef.current = currentPage; }, [currentPage]);
    const [showSettings, setShowSettings] = useState(false);
    const [status, setStatus] = useState<Status>('idle');
    const [messages, setMessages] = useState<DisplayMsg[]>([]);
    const [input, setInput] = useState('');
    const [busy, setBusy] = useState(false);
    const [pending, setPending] = useState<PendingConfirm | null>(null);
    const [quiz, setQuiz] = useState<Quiz | null>(null);
    const [quizSel, setQuizSel] = useState<string[]>([]);
    const [quizCustom, setQuizCustom] = useState('');
    const lastSend = useRef(0);
    const callWindow = useRef<number[]>([]);
    const [autoMode, setAutoMode] = useState(() => typeof window !== 'undefined' && localStorage.getItem('llm_auto') === '1');
    const autoRef = useRef(autoMode);
    useEffect(() => { autoRef.current = autoMode; }, [autoMode]);
    const toggleAuto = () => setAutoMode(v => { const next = !v; try { localStorage.setItem('llm_auto', next ? '1' : '0'); } catch { /* ignore */ } return next; });

    // Voice: hands-free conversation (continuous listen ↔ speak) + voice picker.
    const [listening, setListening] = useState(false);
    const recRef = useRef<SpeechRec | null>(null);
    const [convoMode, setConvoMode] = useState(false);
    const convoRef = useRef(false);
    const speakingRef = useRef(false);
    const busyRef = useRef(false);
    const spokeTurnRef = useRef(false); // this turn was started by voice → speak the reply
    const [voiceOut, setVoiceOut] = useState(() => typeof window !== 'undefined' && localStorage.getItem('llm_voice') === '1');
    const voiceOutRef = useRef(voiceOut);
    useEffect(() => { voiceOutRef.current = voiceOut; }, [voiceOut]);
    const toggleVoiceOut = () => setVoiceOut(v => {
        const next = !v;
        try { localStorage.setItem('llm_voice', next ? '1' : '0'); } catch { /* ignore */ }
        if (!next && typeof window !== 'undefined') window.speechSynthesis?.cancel();
        return next;
    });

    // Available system voices + the chosen one (persisted). Voices load async.
    const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
    const [voiceName, setVoiceName] = useState(() => (typeof window !== 'undefined' && localStorage.getItem('llm_voice_name')) || '');
    useEffect(() => {
        if (typeof window === 'undefined' || !window.speechSynthesis) return;
        const load = () => { const vs = window.speechSynthesis.getVoices(); if (vs.length) setVoices(vs); };
        load();
        window.speechSynthesis.onvoiceschanged = load;
        return () => { if (window.speechSynthesis) window.speechSynthesis.onvoiceschanged = null; };
    }, []);
    const enVoices = voices.filter(v => /^en/i.test(v.lang));
    const pickVoice = (): SpeechSynthesisVoice | null => {
        if (voiceName) { const v = voices.find(v => v.name === voiceName); if (v) return v; }
        // Prefer the most natural-sounding English voices available.
        return enVoices.find(v => /natural|aria|jenny|libby|sonia|google us english|samantha|serena|allison/i.test(v.name))
            || enVoices.find(v => /google/i.test(v.name))
            || enVoices[0] || null;
    };

    const quizRef = useRef<Quiz | null>(null);

    // Low-level: one recognition utterance → onText(transcript); onIdle when it ends.
    const beginRec = (onText: (t: string) => void, onIdle?: () => void) => {
        if (recRef.current || speakingRef.current) return;
        const SR = (window as unknown as { SpeechRecognition?: new () => SpeechRec; webkitSpeechRecognition?: new () => SpeechRec });
        const Ctor = SR.SpeechRecognition || SR.webkitSpeechRecognition;
        if (!Ctor) { push({ role: 'assistant', text: "Voice isn't supported in this browser - try Chrome or Edge." }); setConvoMode(false); convoRef.current = false; return; }
        const rec = new Ctor();
        rec.lang = 'en-US'; rec.interimResults = false; rec.continuous = false;
        rec.onresult = (e) => { const t = e.results[0][0].transcript; if (t.trim()) onText(t.trim()); };
        rec.onend = () => { recRef.current = null; setListening(false); onIdle?.(); };
        rec.onerror = () => { recRef.current = null; setListening(false); onIdle?.(); };
        recRef.current = rec; setListening(true);
        try { rec.start(); } catch { recRef.current = null; setListening(false); }
    };

    const speak = (text: string, after?: () => void) => {
        if (typeof window === 'undefined' || !window.speechSynthesis) { after?.(); return; }
        const clean = text.replace(/```[\s\S]*?```/g, ' code block ').replace(/\[(.*?)\]\(.*?\)/g, '$1').replace(/[*_`#>~|]/g, '').replace(/\s+/g, ' ').trim();
        const resume = () => { speakingRef.current = false; if (after) after(); else if (convoRef.current && !busyRef.current && !quizRef.current) startListening(); };
        if (!clean) { resume(); return; }
        try {
            window.speechSynthesis.cancel();
            const u = new SpeechSynthesisUtterance(clean.slice(0, 700));
            const v = pickVoice();
            if (v) { u.voice = v; u.lang = v.lang; } else u.lang = 'en-US';
            u.rate = 1.02; u.pitch = 1.02;
            speakingRef.current = true;
            u.onend = resume; u.onerror = resume;
            window.speechSynthesis.speak(u);
        } catch { speakingRef.current = false; after?.(); }
    };

    // ── continuous voice chat: listen → send ─────────────────────────────────
    const startListening = () => {
        if (busyRef.current || speakingRef.current || quizRef.current) return;
        beginRec(
            t => { spokeTurnRef.current = true; send(t); },
            () => { if (convoRef.current && !busyRef.current && !speakingRef.current && !quizRef.current) setTimeout(startListening, 400); },
        );
    };

    // ── listen for a spoken answer to an ask_user quiz ───────────────────────
    const handleQuizVoice = (t: string) => {
        const q = quizRef.current;
        if (!q) return;
        const low = t.toLowerCase();
        const match = q.options.find(o => low.includes(o.toLowerCase()) || o.toLowerCase().includes(low));
        answerQuiz(match || t);
    };
    const startQuizListening = () => {
        beginRec(handleQuizVoice, () => { if (quizRef.current && convoRef.current && !speakingRef.current) setTimeout(startQuizListening, 400); });
    };

    const stopVoice = () => {
        try { recRef.current?.stop?.(); } catch { /* ignore */ }
        recRef.current = null; setListening(false);
        if (typeof window !== 'undefined') window.speechSynthesis?.cancel();
        speakingRef.current = false;
    };
    const toggleConvo = () => setConvoMode(v => {
        const next = !v;
        convoRef.current = next;
        if (next) { try { window.speechSynthesis?.cancel(); } catch { /* ignore */ } startListening(); }
        else stopVoice();
        return next;
    });

    // When Spark asks a question: speak it; in voice-chat mode, listen for the answer.
    useEffect(() => {
        quizRef.current = quiz;
        if (!quiz) return;
        if (convoRef.current) {
            try { recRef.current?.stop?.(); } catch { /* ignore */ }
            speak(`${quiz.question} You can say: ${quiz.options.join(', ')}. Or give your own answer.`, startQuizListening);
        } else if (voiceOutRef.current) {
            speak(`${quiz.question} Options: ${quiz.options.join(', ')}.`);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [quiz]);

    // Stop voice when the panel closes or the component unmounts.
    useEffect(() => { if (!open) { convoRef.current = false; setConvoMode(false); stopVoice(); } }, [open]);
    useEffect(() => () => { convoRef.current = false; stopVoice(); }, []);

    // Spark's persistent memory (Firestore: Spark/Memory). Loaded once authed.
    const [memory, setMemory] = useState<SparkMemory>({});
    const memoryRef = useRef<SparkMemory>(memory);
    useEffect(() => { memoryRef.current = memory; }, [memory]);
    useEffect(() => {
        const off = onAuthStateChanged(appAuth(), user => {
            if (!user) return;
            getDoc(MEMORY_DOC).then(s => { if (s.exists()) setMemory(s.data() as SparkMemory); }).catch(() => { });
        });
        return () => off();
    }, []);
    const saveMemory = async (patch: SparkMemory) => {
        const next = { ...memoryRef.current, ...patch };
        setMemory(next); memoryRef.current = next;
        await setDoc(MEMORY_DOC, { ...next, updatedAt: serverTimestamp() }, { merge: true });
    };

    // settings
    const [keyInput, setKeyInput] = useState('');
    const [models, setModels] = useState<string[]>([]);
    const [model, setModelState] = useState(getModel());
    const [loadingModels, setLoadingModels] = useState(false);
    const [settingsMsg, setSettingsMsg] = useState('');

    const iconRef = useRef<SVGSVGElement>(null);
    const cursorRef = useRef<HTMLDivElement>(null);
    const nativeRef = useRef<NativeMsg[]>([]);
    const scrollRef = useRef<HTMLDivElement>(null);

    const key = getApiKey();
    const provider = detectProvider(key);

    useEffect(() => {
        const check = () => setIsDark(document.documentElement.classList.contains('dark'));
        check();
        const obs = new MutationObserver(check);
        obs.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
        return () => obs.disconnect();
    }, []);

    // ── orb: animate the spark through the current status palette ────────────
    useEffect(() => {
        const el = iconRef.current;
        if (!el) return;
        anime.remove(el);
        const pal = PALETTES[status];
        const per = status === 'thinking' ? 320 : status === 'acting' ? 260 : status === 'connecting' ? 520 : status === 'error' ? 360 : 1100;
        const anim = anime({
            targets: el,
            keyframes: [...pal, pal[0]].map(c => ({ color: c })),
            duration: per * pal.length,
            loop: true,
            easing: 'easeInOutSine',
        });
        const scalePulse = (status === 'acting' || status === 'thinking')
            ? anime({ targets: el, scale: [1, 1.18], direction: 'alternate', loop: true, duration: 600, easing: 'easeInOutQuad' })
            : null;
        return () => { anim.pause(); scalePulse?.pause(); anime.remove(el); };
    }, [status, open]);

    useEffect(() => {
        if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }, [messages, pending, quiz]);

    const push = (m: DisplayMsg) => setMessages(prev => [...prev, m]);

    // ── human-like cursor: glide to a point, then a click pulse ─────────────
    const moveCursor = (x: number, y: number) => new Promise<void>(resolve => {
        const el = cursorRef.current;
        if (!el) { resolve(); return; }
        el.style.opacity = '1';
        anime.remove(el);
        anime({
            targets: el, left: x, top: y,
            duration: 700, easing: 'easeInOutCubic',
            complete: () => {
                anime({ targets: el.querySelector('.cursor-pulse'), scale: [0, 2.4], opacity: [0.5, 0], duration: 450, easing: 'easeOutQuad' });
                setTimeout(resolve, 200);
            },
        });
    });

    const elLabel = (e: HTMLElement) => (e.textContent || e.getAttribute('aria-label') || '').replace(/\s+/g, ' ').trim();
    const isVisible = (e: HTMLElement) => !!(e.offsetParent || e.getClientRects().length);

    // Every visible button/link label currently on screen - the ground truth for
    // what Spark can actually click (so it never invents a target).
    const visibleClickables = (): string[] => {
        const seen = new Set<string>();
        Array.from(document.querySelectorAll<HTMLElement>('button, a, [role="button"]')).forEach(e => {
            if (!isVisible(e)) return;
            const l = elLabel(e);
            if (l && l.length <= 40) seen.add(l);
        });
        return Array.from(seen);
    };

    const findClickable = (text: string): HTMLElement | null => {
        const t = text.toLowerCase().trim();
        const els = Array.from(document.querySelectorAll<HTMLElement>('button, a, [role="button"]')).filter(isVisible);
        // Prefer an exact label match, then a "starts/contains" match.
        return els.find(e => elLabel(e).toLowerCase() === t)
            || els.find(e => { const l = elLabel(e).toLowerCase(); return l && (l.includes(t) || t.includes(l)); })
            || null;
    };

    // ── Firestore path helpers ──────────────────────────────────────────────
    const readPath = async (path: string): Promise<string> => {
        const segs = path.split('/').filter(Boolean);
        if (segs.length % 2 === 0) {
            const snap = await getDoc(doc(db, path));
            return snap.exists() ? JSON.stringify({ id: snap.id, ...snap.data() }) : `No document at ${path}`;
        }
        const snap = await getDocs(collection(db, path));
        const rows = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        return JSON.stringify(rows);
    };

    const execTool = useCallback(async (tc: ToolCall): Promise<string> => {
        try {
            const a = tc.args as Record<string, string & Record<string, unknown>>;
            switch (tc.name) {
                case 'navigate': {
                    const page = String(a.page || '').toLowerCase();
                    if (!PAGES.includes(page)) return `Invalid page. Use: ${PAGES.join(', ')}`;
                    // Glide the cursor to the matching sidebar item (human-like) before switching.
                    const navEl = findClickable(page.charAt(0).toUpperCase() + page.slice(1));
                    if (navEl) { const r = navEl.getBoundingClientRect(); await moveCursor(r.left + r.width / 2, r.top + r.height / 2); }
                    onNavigate(page);
                    return `Navigated to ${page}`;
                }
                case 'click': {
                    const el = findClickable(String(a.text || ''));
                    if (!el) {
                        const opts = visibleClickables();
                        return `No clickable matching "${a.text}". Don't guess - click one of these EXACT on-screen labels: ${opts.map(o => `"${o}"`).join(', ') || '(none found)'}`;
                    }
                    const r = el.getBoundingClientRect();
                    await moveCursor(r.left + r.width / 2, r.top + r.height / 2);
                    el.click();
                    return `Clicked "${elLabel(el).slice(0, 40)}"`;
                }
                case 'list_clickables': {
                    const opts = visibleClickables();
                    return opts.length ? `Clickable now: ${opts.map(o => `"${o}"`).join(', ')}` : 'No clickable elements visible.';
                }
                case 'set_memory': {
                    const patch: SparkMemory = {};
                    if (typeof a.userName === 'string' && a.userName.trim()) patch.userName = a.userName.trim();
                    if (typeof a.instructions === 'string') patch.instructions = a.instructions.trim();
                    if (typeof a.addFact === 'string' && a.addFact.trim()) patch.facts = [...(memoryRef.current.facts || []), a.addFact.trim()].slice(-50);
                    if (!Object.keys(patch).length) return 'Nothing to remember.';
                    try { await saveMemory(patch); return 'Memory updated.'; }
                    catch (e) { return `Couldn't save memory: ${(e as Error).message}`; }
                }
                case 'read_data': {
                    const out = await readPath(String(a.path || ''));
                    return out.length > 4000 ? out.slice(0, 4000) + '…(truncated)' : out;
                }
                case 'read_screen': {
                    const page = pageRef.current;
                    const sources = PAGE_SOURCES[page] || [];
                    if (!sources.length) return `User is on the "${page}" page; no readable data source is mapped for it.`;
                    const parts: string[] = [];
                    for (const path of sources) {
                        try { parts.push(`${path}: ${await readPath(path)}`); }
                        catch (e) { parts.push(`${path}: error ${(e as Error).message}`); }
                    }
                    let joined = `Current page: ${PAGE_LABEL[page] || page}\n${parts.join('\n')}`;
                    if (joined.length > 6000) joined = joined.slice(0, 6000) + '…(truncated)';
                    return joined;
                }
                case 'write_data': {
                    const path = String(a.path || '');
                    const data = (a.data || {}) as Record<string, unknown>;
                    const merge = !!a.merge;
                    let ok = true;
                    if (!autoRef.current) {
                        ok = await new Promise<boolean>(res => setPending({ desc: `Write to ${path}${merge ? ' (merge)' : ''}`, detail: JSON.stringify(data).slice(0, 300), resolve: res }));
                        setPending(null);
                    }
                    if (!ok) return 'User declined the write.';
                    await setDoc(doc(db, path), data, { merge });
                    return `Wrote ${path}`;
                }
                case 'delete_data': {
                    const path = String(a.path || '');
                    let ok = true;
                    if (!autoRef.current) {
                        ok = await new Promise<boolean>(res => setPending({ desc: `Delete ${path}`, resolve: res }));
                        setPending(null);
                    }
                    if (!ok) return 'User declined the delete.';
                    await deleteDoc(doc(db, path));
                    return `Deleted ${path}`;
                }
                case 'ask_user': {
                    const question = String(tc.args.question || '');
                    const options = Array.isArray(tc.args.options) ? (tc.args.options as unknown[]).map(String).slice(0, 6) : [];
                    const multi = !!tc.args.allow_multiple;
                    if (!options.length) return 'No options were provided.';
                    setQuizSel([]); setQuizCustom('');
                    setStatus('idle'); // stop the "working" pulse while waiting on the human
                    const answer = await new Promise<string>(res => setQuiz({ question, options, multi, resolve: res }));
                    setQuiz(null);
                    setStatus('thinking');
                    return answer ? `User chose: ${answer}` : 'User dismissed the question.';
                }
                default: return `Unknown tool ${tc.name}`;
            }
        } catch (e) {
            return `Error: ${(e as Error).message}`;
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [onNavigate]);

    // ── chat loop ───────────────────────────────────────────────────────────
    const send = async (override?: string) => {
        const text = (override ?? input).trim();
        if (!text || busy) return;
        if (!key || !provider) { setShowSettings(true); push({ role: 'assistant', text: 'Add an API key in settings first - the gear, top-right.' }); return; }
        if (!model) { setShowSettings(true); push({ role: 'assistant', text: 'Pick a model in settings first.' }); return; }

        // ── rate limiting (anti-spam + rolling cap) ──────────────────────────
        const now = Date.now();
        if (now - lastSend.current < MIN_SEND_GAP_MS) { push({ role: 'assistant', text: 'Give it a second between messages.' }); return; }
        callWindow.current = callWindow.current.filter(t => now - t < 60_000);
        if (callWindow.current.length >= MAX_MSGS_PER_MIN) { push({ role: 'assistant', text: `Rate limit - max ${MAX_MSGS_PER_MIN} messages/min. Take a breath.` }); return; }
        lastSend.current = now; callWindow.current.push(now);

        setInput('');
        push({ role: 'user', text });
        setBusy(true); busyRef.current = true;
        // Don't let an in-progress reply talk over the new turn.
        try { window.speechSynthesis?.cancel(); } catch { /* ignore */ }
        speakingRef.current = false;
        setStatus('connecting');
        nativeRef.current.push(userMessage(provider, text));

        const turnStart = Date.now();
        let finalText = '';
        try {
            let guard = 0;
            while (guard++ < MAX_ROUNDS) {
                if (Date.now() - turnStart > TURN_BUDGET_MS) {
                    push({ role: 'assistant', text: 'That ran long, so I stopped. Try a narrower ask.' });
                    setStatus('error');
                    break;
                }
                setStatus('thinking');
                const mem = memoryRef.current;
                const memCtx = `YOUR MEMORY (persists across sessions; update via set_memory): `
                    + `${mem.userName ? `The user's name is ${mem.userName}. ` : "You don't know the user's name yet - ask once, then set_memory. "}`
                    + `${mem.instructions ? `Standing instructions from the user: ${mem.instructions} ` : ''}`
                    + `${mem.facts?.length ? `Saved facts: ${mem.facts.join('; ')}. ` : ''}`;
                const screenCtx = `${memCtx}\nCURRENT SCREEN: the user is viewing the "${PAGE_LABEL[pageRef.current] || pageRef.current}" page (id: ${pageRef.current}). Call read_screen to read what's on it.`;
                const res = await chat(key, model, nativeRef.current, screenCtx);
                nativeRef.current.push(res.assistant);
                if (res.text) { push({ role: 'assistant', text: res.text }); finalText = res.text; }
                if (!res.toolCalls.length) { setStatus('speaking'); break; }
                if (guard === MAX_ROUNDS) { push({ role: 'assistant', text: 'Hit my step limit for one turn - ask me to continue if needed.' }); setStatus('error'); break; }

                setStatus('acting');
                const results: ToolResult[] = [];
                for (const tc of res.toolCalls.slice(0, MAX_TOOLS_PER_ROUND)) {
                    push({ role: 'tool', text: `${tc.name}(${Object.values(tc.args).map(String).join(', ').slice(0, 50)})` });
                    const output = await execTool(tc);
                    results.push({ id: tc.id, name: tc.name, output });
                }
                const trm = toolResultMessage(provider, results);
                if (Array.isArray(trm)) nativeRef.current.push(...trm);
                else nativeRef.current.push(trm);
            }
        } catch (e) {
            setStatus('error');
            push({ role: 'assistant', text: `Error: ${(e as Error).message}` });
        } finally {
            setBusy(false); busyRef.current = false;
            if (cursorRef.current) cursorRef.current.style.opacity = '0';
            setTimeout(() => setStatus('idle'), 1600);
            const willSpeak = !!finalText && (voiceOutRef.current || spokeTurnRef.current);
            spokeTurnRef.current = false;
            // Speak the final reply once (speak() resumes listening when done);
            // if there's nothing to speak, resume the loop directly.
            if (willSpeak) speak(finalText);
            else if (convoRef.current && !speakingRef.current) setTimeout(startListening, 250);
        }
    };

    // Resolve an ask_user quiz: echo the choice as a user bubble, then continue.
    const answerQuiz = (val: string) => {
        if (!quiz) return;
        const r = quiz.resolve;
        push({ role: 'user', text: val });
        r(val);
    };
    const toggleQuiz = (o: string) => setQuizSel(s => s.includes(o) ? s.filter(x => x !== o) : [...s, o]);

    // ── settings actions ─────────────────────────────────────────────────────
    const loadModels = async () => {
        const k = keyInput.trim() || key;
        if (!k) { setSettingsMsg('No key set (env or pasted).'); return; }
        if (keyInput.trim()) setKeyOverride(keyInput.trim());
        setLoadingModels(true); setSettingsMsg('');
        try {
            const list = await listModels(k);
            setModels(list);
            setSettingsMsg(`${list.length} models from ${PROVIDER_LABEL[detectProvider(k)!]}`);
        } catch (e) {
            setSettingsMsg(`Failed: ${(e as Error).message}`);
        } finally {
            setLoadingModels(false);
        }
    };
    const chooseModel = (m: string) => { setModel(m); setModelState(m); };

    const maskedKey = key ? `${key.slice(0, 7)}…${key.slice(-4)}` : 'none';

    // ── render ───────────────────────────────────────────────────────────────
    const bubble = (m: DisplayMsg, i: number) => {
        if (m.role === 'tool') return (
            <div key={i} className="flex items-center gap-2 text-[11px] text-sec font-mono pl-1 py-0.5"><ArrowRight size={11} className="text-blue-400" /> {m.text}</div>
        );
        const me = m.role === 'user';
        return (
            <div key={i} className={`flex ${me ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[85%] px-3.5 py-2.5 rounded-2xl text-sm ${me ? 'bg-blue-500 text-white rounded-br-md' : isDark ? 'bg-white/10 text-white rounded-bl-md' : 'bg-black/[0.05] text-gray-900 rounded-bl-md'}`}>
                    {me ? m.text : <Markdown>{m.text}</Markdown>}
                </div>
            </div>
        );
    };

    return (
        <>
            {/* Floating orb */}
            <button
                onClick={() => setOpen(o => !o)}
                aria-label="AI assistant"
                className={`fixed bottom-5 right-5 z-[1200] w-14 h-14 rounded-full flex items-center justify-center shadow-2xl border transition-transform active:scale-90 hover:scale-105 ${isDark ? 'bg-[#15151c]/90 border-white/10' : 'bg-white/90 border-black/10'} backdrop-blur-xl`}
                style={{ boxShadow: '0 10px 40px rgba(0,0,0,0.25)' }}
            >
                <Sparkles ref={iconRef} size={26} style={{ filter: 'drop-shadow(0 0 7px)' }} />
            </button>

            {/* Human-like cursor */}
            {createPortal(
                <div ref={cursorRef} className="fixed z-[2000] pointer-events-none" style={{ left: 0, top: 0, opacity: 0, transform: 'translate(-2px,-2px)' }}>
                    <div className="cursor-pulse absolute -left-2 -top-2 w-8 h-8 rounded-full bg-blue-400/40" style={{ opacity: 0 }} />
                    <MousePointer2 size={24} className="text-blue-500 fill-blue-500/30" style={{ filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.3))' }} />
                </div>,
                document.body
            )}

            {/* Chat modal */}
            {open && createPortal(
                <div className="fixed bottom-24 right-5 z-[1300] w-[min(420px,calc(100vw-2.5rem))] flex flex-col rounded-3xl border shadow-2xl overflow-hidden" style={{ maxHeight: 'min(640px, calc(100vh - 8rem))', background: isDark ? 'rgba(15,15,20,0.96)' : 'rgba(255,255,255,0.97)', borderColor: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.08)', backdropFilter: 'blur(20px)' }}>
                    {/* Header */}
                    <div className="flex items-center justify-between gap-2 p-4 border-b border-[var(--section-border)]">
                        <div className="flex items-center gap-2.5 min-w-0">
                            <Sparkles size={18} className="text-blue-400" />
                            <div className="min-w-0">
                                <div className="text-sm font-bold text-primary leading-tight">Spark</div>
                                <div className="text-[11px] text-sec leading-tight flex items-center gap-1.5">
                                    <span className="w-1.5 h-1.5 rounded-full" style={{ background: PALETTES[status][0] }} />{STATUS_LABEL[status]}
                                    {model && <span className="truncate">· {model}</span>}
                                </div>
                            </div>
                        </div>
                        <div className="flex items-center gap-1 flex-shrink-0">
                            <button onClick={toggleVoiceOut} title={voiceOut ? 'Voice replies ON - Spark speaks answers' : 'Voice replies OFF'} className={`p-2 rounded-lg transition-colors ${voiceOut ? 'text-emerald-500 bg-emerald-500/15' : 'text-sec hover:text-primary hover:bg-black/5 dark:hover:bg-white/10'}`}>{voiceOut ? <Volume2 size={17} /> : <VolumeX size={17} />}</button>
                            <button onClick={toggleAuto} title={autoMode ? 'Auto mode ON - acts without asking' : 'Auto mode OFF - confirms writes & deletes'} className={`p-2 rounded-lg transition-colors ${autoMode ? 'text-amber-500 bg-amber-500/15' : 'text-sec hover:text-primary hover:bg-black/5 dark:hover:bg-white/10'}`}><Zap size={17} className={autoMode ? 'fill-amber-500/40' : ''} /></button>
                            <button onClick={() => setShowSettings(s => !s)} className={`p-2 rounded-lg transition-colors ${showSettings ? 'text-blue-500 bg-blue-500/10' : 'text-sec hover:text-primary hover:bg-black/5 dark:hover:bg-white/10'}`}><Settings2 size={17} /></button>
                            <button onClick={() => setOpen(false)} className="p-2 rounded-lg text-sec hover:text-primary hover:bg-black/5 dark:hover:bg-white/10 transition-colors"><X size={17} /></button>
                        </div>
                    </div>

                    {/* Settings panel */}
                    {showSettings && (
                        <div className="p-4 flex flex-col gap-3 border-b border-[var(--section-border)] bg-black/[0.015] dark:bg-white/[0.02]">
                            <div>
                                <label className="text-[11px] font-semibold text-sec uppercase tracking-wider mb-1.5 block">API key (this browser)</label>
                                <input value={keyInput} onChange={e => setKeyInput(e.target.value)} type="password" placeholder={`active: ${maskedKey}`} className={`w-full px-3 py-2 rounded-xl border text-sm outline-none ${isDark ? 'bg-white/5 border-white/10' : 'bg-black/[0.03] border-black/10'} text-primary`} />
                                <p className="text-[10px] text-sec mt-1">Primary key comes from <code>NEXT_PUBLIC_LLM_API_KEY</code> (.env.local / Hostinger secret). Pasting here overrides it locally for testing. {provider ? `Detected: ${PROVIDER_LABEL[provider]}.` : ''}</p>
                            </div>
                            <div className="flex items-end gap-2">
                                <div className="flex-1">
                                    <label className="text-[11px] font-semibold text-sec uppercase tracking-wider mb-1.5 block">Model</label>
                                    <ScrollMenu value={model} options={models} onChange={chooseModel} isDark={isDark} placeholder={models.length ? 'Choose a model' : 'Load models first'} />
                                </div>
                                <button onClick={loadModels} disabled={loadingModels} className="px-3 py-2.5 rounded-xl text-sm font-semibold text-blue-500 border border-blue-500/20 bg-blue-500/5 hover:bg-blue-500/10 transition-all disabled:opacity-50 flex items-center gap-1.5">
                                    {loadingModels ? <Loader2 size={15} className="animate-spin" /> : 'Load'}
                                </button>
                            </div>
                            {settingsMsg && <p className="text-[11px] text-sec">{settingsMsg}</p>}
                            <div className="flex items-end gap-2">
                                <div className="flex-1">
                                    <label className="text-[11px] font-semibold text-sec uppercase tracking-wider mb-1.5 block">Voice</label>
                                    <ScrollMenu
                                        value={voiceName || (pickVoice()?.name ?? '')}
                                        options={enVoices.map(v => v.name)}
                                        onChange={(name) => { setVoiceName(name); try { localStorage.setItem('llm_voice_name', name); } catch { /* ignore */ } }}
                                        isDark={isDark}
                                        placeholder={enVoices.length ? 'Choose a voice' : 'No voices found'}
                                    />
                                </div>
                                <button onClick={() => speak('Hey, this is how I sound. Pick the voice you like best.')} className="px-3 py-2.5 rounded-xl text-sm font-semibold text-emerald-500 border border-emerald-500/20 bg-emerald-500/5 hover:bg-emerald-500/10 transition-all flex items-center gap-1.5"><Volume2 size={15} /> Test</button>
                            </div>
                            <p className="text-[10px] text-sec -mt-1">Tip: voices with “Natural”, “Google”, or “Online” in the name sound the most human. The mic button starts a hands-free voice chat.</p>

                            {/* Memory - persists in Firestore (Spark/Memory); Spark can also edit this herself */}
                            <div className="pt-2 border-t border-[var(--section-border)] flex flex-col gap-2">
                                <div className="flex items-center gap-1.5 text-[11px] font-semibold text-sec uppercase tracking-wider"><Brain size={13} /> Memory</div>
                                <input value={memory.userName || ''} onChange={e => setMemory(m => ({ ...m, userName: e.target.value }))} placeholder="Your name" className={`w-full px-3 py-2 rounded-xl border text-sm outline-none ${isDark ? 'bg-white/5 border-white/10' : 'bg-black/[0.03] border-black/10'} text-primary placeholder:text-sec`} />
                                <textarea value={memory.instructions || ''} onChange={e => setMemory(m => ({ ...m, instructions: e.target.value }))} rows={3} placeholder="Standing instructions for Spark (how she should behave, tone, defaults)…" className={`w-full px-3 py-2 rounded-xl border text-sm outline-none resize-none ${isDark ? 'bg-white/5 border-white/10' : 'bg-black/[0.03] border-black/10'} text-primary placeholder:text-sec`} />
                                <button onClick={() => saveMemory({ userName: memory.userName, instructions: memory.instructions }).then(() => setSettingsMsg('Memory saved')).catch(() => setSettingsMsg('Save failed'))} className="self-end px-4 py-2 rounded-xl text-sm font-bold text-white bg-blue-500 hover:bg-blue-600 transition-all active:scale-95">Save memory</button>
                            </div>
                        </div>
                    )}

                    {/* Messages */}
                    <div ref={scrollRef} className="flex-1 overflow-y-auto custom-scrollbar p-4 flex flex-col gap-2.5 min-h-[160px]">
                        {messages.length === 0 ? (
                            <div className="flex-1 flex flex-col items-center justify-center text-center text-sec gap-2 py-8">
                                <Sparkles size={28} className="text-blue-400/60" />
                                <p className="text-sm font-medium text-primary">Hey, I'm Spark</p>
                                <p className="text-xs max-w-[260px]">Ask me to navigate, click buttons, or read/change your data. e.g. "open treasury", "how many projects do I have?", "add a tag called VIP".</p>
                            </div>
                        ) : messages.map(bubble)}

                        {/* Confirm card */}
                        {pending && (
                            <div className={`rounded-2xl border p-3.5 flex flex-col gap-2.5 ${isDark ? 'bg-amber-500/10 border-amber-500/30' : 'bg-amber-50 border-amber-300'}`}>
                                <div className="flex items-center gap-2 text-sm font-bold text-primary"><Database size={15} className="text-amber-500" /> Confirm action</div>
                                <p className="text-sm text-primary">{pending.desc}</p>
                                {pending.detail && <pre className="text-[11px] text-sec bg-black/5 dark:bg-white/5 rounded-lg p-2 overflow-x-auto whitespace-pre-wrap">{pending.detail}</pre>}
                                <div className="flex gap-2 justify-end">
                                    <button onClick={() => pending.resolve(false)} className="px-3.5 py-1.5 rounded-lg text-sm font-semibold text-sec hover:bg-black/5 dark:hover:bg-white/10">Cancel</button>
                                    <button onClick={() => pending.resolve(true)} className="px-4 py-1.5 rounded-lg text-sm font-bold text-white bg-amber-500 hover:bg-amber-600 flex items-center gap-1.5"><Check size={15} /> Do it</button>
                                </div>
                            </div>
                        )}

                        {/* ask_user quiz */}
                        {quiz && (
                            <div className={`rounded-2xl border p-3.5 flex flex-col gap-3 ${isDark ? 'bg-blue-500/10 border-blue-500/30' : 'bg-blue-50 border-blue-300'}`}>
                                <div className="flex items-center gap-2 text-sm font-bold text-primary"><HelpCircle size={15} className="text-blue-500" /> Quick question</div>
                                <p className="text-sm text-primary">{quiz.question}</p>
                                <div className="flex flex-col gap-2">
                                    {quiz.options.map((o, i) => {
                                        const sel = quizSel.includes(o);
                                        return (
                                            <button
                                                key={i}
                                                onClick={() => quiz.multi ? toggleQuiz(o) : answerQuiz(o)}
                                                className={`w-full text-left px-3.5 py-2.5 rounded-xl border text-sm font-medium transition-all flex items-center gap-2.5
                                                    ${sel ? 'bg-blue-500 text-white border-blue-500' : isDark ? 'bg-white/5 border-white/10 text-primary hover:border-blue-400/50' : 'bg-white border-black/10 text-primary hover:border-blue-400/50'}`}
                                            >
                                                {quiz.multi && <span className={`w-4 h-4 rounded border flex items-center justify-center flex-shrink-0 ${sel ? 'bg-white/20 border-white/50' : 'border-current opacity-50'}`}>{sel && <Check size={12} />}</span>}
                                                <span>{o}</span>
                                            </button>
                                        );
                                    })}
                                </div>
                                {quiz.multi && (
                                    <button onClick={() => answerQuiz(quizSel.join(', '))} disabled={!quizSel.length} className="self-end px-4 py-1.5 rounded-lg text-sm font-bold text-white bg-blue-500 hover:bg-blue-600 disabled:opacity-40 flex items-center gap-1.5"><Check size={15} /> Submit</button>
                                )}
                                {/* Own answer - when none of the choices fit */}
                                <div className="flex items-center gap-1.5 pt-1">
                                    <div className="flex-1 h-px bg-[var(--input-border)]" />
                                    <span className="text-[10px] uppercase tracking-wider text-sec font-semibold">or your own</span>
                                    <div className="flex-1 h-px bg-[var(--input-border)]" />
                                </div>
                                <div className="flex items-center gap-2">
                                    <input
                                        value={quizCustom}
                                        onChange={e => setQuizCustom(e.target.value)}
                                        onKeyDown={e => { if (e.key === 'Enter' && quizCustom.trim()) answerQuiz(quizCustom.trim()); }}
                                        placeholder="Type your own answer…"
                                        className={`flex-1 px-3 py-2 rounded-xl border text-sm outline-none ${isDark ? 'bg-white/5 border-white/10' : 'bg-white border-black/10'} text-primary placeholder:text-sec`}
                                    />
                                    <button onClick={() => quizCustom.trim() && answerQuiz(quizCustom.trim())} disabled={!quizCustom.trim()} className="p-2 rounded-xl bg-blue-500 text-white hover:bg-blue-600 disabled:opacity-40 transition-all active:scale-95"><Send size={16} /></button>
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Input */}
                    <div className="p-3 border-t border-[var(--section-border)] flex items-center gap-2">
                        <input value={input} onChange={e => setInput(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') send(); }} disabled={busy} placeholder={busy ? 'Working…' : listening ? 'Listening…' : 'Ask Spark…'} className={`flex-1 px-3.5 py-2.5 rounded-xl border text-sm outline-none ${isDark ? 'bg-white/5 border-white/10' : 'bg-black/[0.03] border-black/10'} text-primary placeholder:text-sec disabled:opacity-60`} />
                        <button onClick={toggleConvo} title={convoMode ? 'Stop voice chat' : 'Start hands-free voice chat'} className={`p-2.5 rounded-xl transition-all flex-shrink-0 active:scale-95 ${convoMode ? (listening ? 'bg-red-500 text-white animate-pulse' : 'bg-emerald-500 text-white') : 'text-sec hover:text-primary hover:bg-black/5 dark:hover:bg-white/10'}`}><Mic size={18} /></button>
                        <button onClick={() => send()} disabled={busy || !input.trim()} className="p-2.5 rounded-xl bg-blue-500 text-white hover:bg-blue-600 disabled:opacity-40 transition-all active:scale-95">
                            {busy ? <Loader2 size={18} className="animate-spin" /> : <Send size={18} />}
                        </button>
                    </div>
                </div>,
                document.body
            )}
        </>
    );
};

export default Assistant;
