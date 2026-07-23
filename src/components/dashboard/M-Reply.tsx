import { useState, useMemo, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { motion } from 'motion/react';
import { X, Check, Reply, Paperclip, Send, FileText, ImageIcon, Video } from 'lucide-react';
import app from '../../lib/firebase';
import { buildReplyHtml, DEFAULT_REPLY_SUBJECT } from '../../lib/replyEmail';

interface ReplyTarget {
    id: string;
    name: string;
    email: string;
    message: string;
    timestamp: number;
}

interface MReplyProps {
    email: ReplyTarget;
    isDark: boolean;
    onClose: () => void;
    /** Called after a successful send (e.g. to mark the message replied). */
    onSent?: () => void;
    /** Toast/alert bridge to the parent. */
    notify: (message: string, type: 'success' | 'error' | 'warning') => void;
}

const MAX_TOTAL_BYTES = 20 * 1024 * 1024; // Resend caps ~40MB/email; stay well under.

function iconFor(name: string) {
    if (/\.(jpg|jpeg|png|gif|webp|bmp)$/i.test(name)) return <ImageIcon size={14} />;
    if (/\.(mp4|webm|ogg|mov)$/i.test(name)) return <Video size={14} />;
    return <FileText size={14} />;
}

function humanSize(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function MReply({ email, isDark, onClose, onSent, notify }: MReplyProps) {
    const [subject, setSubject] = useState(DEFAULT_REPLY_SUBJECT);
    const [body, setBody] = useState('');
    const [files, setFiles] = useState<File[]>([]);
    const [includeQuote, setIncludeQuote] = useState(true);
    const [sending, setSending] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);

    // Live preview: build the exact HTML the recipient will receive.
    const html = useMemo(() => buildReplyHtml({
        toName: email.name,
        bodyText: body,
        quote: includeQuote ? { name: email.name, message: email.message, at: email.timestamp } : undefined,
        attachmentNames: files.map(f => f.name),
    }), [email, body, includeQuote, files]);

    // Scale the 600px-wide email to fit the preview column width (keeps text readable,
    // single vertical scroll for long messages). natH tracks the email's real height so
    // nothing gets clipped.
    const boxRef = useRef<HTMLDivElement>(null);
    const iframeRef = useRef<HTMLIFrameElement>(null);
    const [scale, setScale] = useState(1);
    const [natH, setNatH] = useState(400);
    useEffect(() => {
        const measure = () => {
            const w = boxRef.current?.clientWidth ?? 600;
            setScale(Math.min(1, (w - 4) / 600));
        };
        measure();
        const ro = new ResizeObserver(measure);
        if (boxRef.current) ro.observe(boxRef.current);
        return () => ro.disconnect();
    }, []);
    const measureHeight = () => {
        const doc = iframeRef.current?.contentDocument;
        if (doc?.body) setNatH(Math.max(240, doc.documentElement.scrollHeight));
    };

    const totalBytes = files.reduce((s, f) => s + f.size, 0);
    const canSend = subject.trim().length > 0 && body.trim().length > 0 && !sending;

    const pickFiles = (list: FileList | null) => {
        if (!list) return;
        const incoming = Array.from(list);
        const merged = [...files];
        for (const f of incoming) {
            if (!merged.some(m => m.name === f.name && m.size === f.size)) merged.push(f);
        }
        if (merged.reduce((s, f) => s + f.size, 0) > MAX_TOTAL_BYTES) {
            notify('Attachments exceed the 20 MB total limit.', 'warning');
            return;
        }
        setFiles(merged);
    };

    const removeFile = (name: string, size: number) =>
        setFiles(files.filter(f => !(f.name === name && f.size === size)));

    const send = async () => {
        if (!canSend) return;
        setSending(true);
        try {
            const attachments: { name: string; url: string }[] = [];
            if (files.length) {
                const { getStorage, ref, uploadBytes, getDownloadURL } = await import('firebase/storage');
                const storage = getStorage(app);
                const folder = `${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
                for (const f of files) {
                    const r = ref(storage, `replies/${folder}/${f.name}`);
                    const snap = await uploadBytes(r, f);
                    attachments.push({ name: f.name, url: await getDownloadURL(snap.ref) });
                }
            }
            const { httpsCallable, getFunctions } = await import('firebase/functions');
            const fn = httpsCallable(getFunctions(app, 'us-central1'), 'sendReply');
            await fn({
                to: email.email,
                subject: subject.trim(),
                html,
                attachments,
                meta: { emailId: email.id, name: email.name },
            });
            notify(`Reply sent to ${email.email}`, 'success');
            onSent?.();
            onClose();
        } catch (e) {
            notify((e as { message?: string })?.message || 'Failed to send the reply.', 'error');
        } finally {
            setSending(false);
        }
    };

    const labelCls = 'block text-[11px] font-bold uppercase tracking-wider text-sec mb-1.5';
    const inputCls = `w-full rounded-xl border px-3.5 py-2.5 text-sm outline-none transition-colors ${isDark ? 'bg-white/5 border-white/10 focus:border-blue-400/60' : 'bg-black/[0.03] border-black/10 focus:border-blue-400/60'} text-primary`;

    return createPortal(
        <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.2 }}
            className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
            onClick={onClose}
        >
            <motion.div
                initial={{ scale: 0.95, opacity: 0, y: 15 }} animate={{ scale: 1, opacity: 1, y: 0 }} exit={{ scale: 0.95, opacity: 0, y: 15 }}
                transition={{ type: 'spring', damping: 25, stiffness: 350 }}
                onClick={e => e.stopPropagation()}
                className={`w-full max-w-4xl max-h-[90vh] flex flex-col rounded-3xl border shadow-2xl overflow-hidden ${isDark ? 'bg-[#0f0f14] border-white/10' : 'bg-white border-black/5'}`}
            >
                {/* Header */}
                <div className="flex items-center justify-between p-5 border-b border-[var(--section-border)]">
                    <div className="flex items-center gap-3 min-w-0">
                        <div className="w-9 h-9 rounded-xl flex items-center justify-center bg-blue-500/10 text-blue-500 shrink-0"><Reply size={18} /></div>
                        <div className="min-w-0">
                            <h3 className="text-lg font-bold text-primary font-inter m-0 leading-tight">Reply</h3>
                            <p className="text-xs text-sec m-0 truncate">to {email.name} &middot; {email.email}</p>
                        </div>
                    </div>
                    <button onClick={onClose} className="p-2 rounded-lg text-sec hover:text-primary hover:bg-black/5 dark:hover:bg-white/10 transition-all shrink-0"><X size={18} /></button>
                </div>

                {/* Body: compose | preview */}
                <div className="flex-1 min-h-0 flex flex-col md:flex-row">
                    {/* Compose */}
                    <div className="md:w-[380px] shrink-0 p-5 flex flex-col gap-4 overflow-y-auto custom-scrollbar border-b md:border-b-0 md:border-r border-[var(--section-border)]">
                        <div>
                            <label className={labelCls}>Subject</label>
                            <input value={subject} onChange={e => setSubject(e.target.value)} className={inputCls} placeholder="Subject" />
                        </div>

                        <div className="flex-1 flex flex-col min-h-[160px]">
                            <label className={labelCls}>Message</label>
                            <textarea
                                value={body}
                                onChange={e => setBody(e.target.value)}
                                placeholder={`Write your reply to ${email.name}...`}
                                className={`${inputCls} flex-1 resize-none leading-relaxed min-h-[160px]`}
                            />
                        </div>

                        {/* Attachments */}
                        <div>
                            <label className={labelCls}>Attachments</label>
                            <input
                                ref={fileInputRef}
                                type="file"
                                multiple
                                className="hidden"
                                onChange={e => { pickFiles(e.target.files); e.target.value = ''; }}
                            />
                            <button
                                type="button"
                                onClick={() => fileInputRef.current?.click()}
                                className={`w-full flex items-center justify-center gap-2 rounded-xl border border-dashed px-3 py-2.5 text-sm font-medium transition-colors ${isDark ? 'border-white/15 text-sec hover:border-blue-400/50 hover:text-primary' : 'border-black/15 text-sec hover:border-blue-400/50 hover:text-primary'}`}
                            >
                                <Paperclip size={15} /> Attach files
                            </button>
                            {files.length > 0 && (
                                <div className="mt-2 flex flex-col gap-1.5">
                                    {files.map(f => (
                                        <div key={`${f.name}_${f.size}`} className={`flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-xs ${isDark ? 'bg-white/5' : 'bg-black/[0.04]'}`}>
                                            <span className="text-blue-500 shrink-0">{iconFor(f.name)}</span>
                                            <span className="truncate flex-1 text-primary">{f.name}</span>
                                            <span className="text-sec shrink-0">{humanSize(f.size)}</span>
                                            <button onClick={() => removeFile(f.name, f.size)} className="text-sec hover:text-red-500 transition-colors shrink-0"><X size={13} /></button>
                                        </div>
                                    ))}
                                    <span className={`text-[11px] ${totalBytes > MAX_TOTAL_BYTES ? 'text-red-500' : 'text-sec'}`}>{humanSize(totalBytes)} of 20 MB</span>
                                </div>
                            )}
                        </div>

                        <label className="flex items-center gap-2.5 cursor-pointer select-none">
                            <input type="checkbox" checked={includeQuote} onChange={e => setIncludeQuote(e.target.checked)} className="sr-only peer" />
                            <span className={`w-4 h-4 rounded border flex items-center justify-center transition-colors ${includeQuote ? 'bg-blue-500 border-blue-500' : isDark ? 'border-white/25' : 'border-black/25'}`}>
                                {includeQuote && <Check size={11} className="text-white" strokeWidth={3} />}
                            </span>
                            <span className="text-xs text-sec">Quote their original message</span>
                        </label>
                    </div>

                    {/* Preview */}
                    <div className="flex-1 min-w-0 flex flex-col bg-black/[0.03] dark:bg-black/20">
                        <div className="px-5 pt-4 pb-2 text-[11px] font-bold uppercase tracking-wider text-sec">Preview</div>
                        <div ref={boxRef} className="flex-1 min-h-[240px] overflow-y-auto overflow-x-hidden custom-scrollbar px-5 pb-5">
                            <div style={{ width: 600 * scale, height: natH * scale }}>
                                <iframe
                                    ref={iframeRef}
                                    title="reply-preview"
                                    srcDoc={html}
                                    onLoad={() => { measureHeight(); setTimeout(measureHeight, 60); }}
                                    className="border-0 rounded-xl bg-white block"
                                    style={{ width: 600, height: natH, transform: `scale(${scale})`, transformOrigin: 'top left', pointerEvents: 'none' }}
                                />
                            </div>
                        </div>
                    </div>
                </div>

                {/* Footer */}
                <div className="flex items-center justify-between gap-3 p-4 border-t border-[var(--section-border)]">
                    <span className="text-xs text-sec truncate">From hello@temrevil.com &middot; you get a bcc copy</span>
                    <div className="flex items-center gap-2 shrink-0">
                        <button onClick={onClose} className="px-4 py-2 rounded-xl text-sm font-semibold text-sec hover:text-primary hover:bg-black/5 dark:hover:bg-white/10 transition-all">Cancel</button>
                        <button
                            onClick={send}
                            disabled={!canSend}
                            className="px-5 py-2 rounded-xl bg-blue-500 text-white text-sm font-bold shadow-lg shadow-blue-500/20 hover:bg-blue-600 active:scale-95 transition-all flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed disabled:active:scale-100"
                        >
                            <Send size={15} /> {sending ? 'Sending...' : 'Send reply'}
                        </button>
                    </div>
                </div>
            </motion.div>
        </motion.div>,
        document.body
    );
}
