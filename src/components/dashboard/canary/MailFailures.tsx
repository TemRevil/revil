/**
 * A quiet strip on the Canary tab listing mail the functions could not deliver, with a
 * Retry for each. It renders nothing while every email has gone out.
 */
import { useEffect, useState } from 'react';
import { collection, onSnapshot, query, where } from 'firebase/firestore';
import { httpsCallable, getFunctions } from 'firebase/functions';
import { motion, AnimatePresence } from 'motion/react';
import { MailWarning, RotateCw, ChevronDown } from 'lucide-react';
import app, { db } from '../../../lib/firebase';
import { EASE } from '../motion';
import { failedMail, type FailedMail } from './mailJobs';
import { callableErrorText } from './meetings';

type Notify = (a: { type: 'success' | 'error'; message: string }) => void;

const MailFailures = ({ isDark, showAlert }: { isDark: boolean; showAlert: Notify }) => {
    const [jobs, setJobs] = useState<FailedMail[]>([]);
    const [open, setOpen] = useState(false);
    const [busy, setBusy] = useState<string | null>(null);

    useEffect(() => {
        const failed = query(collection(db, 'MailJobs'), where('status', '==', 'failed'));
        return onSnapshot(failed,
            snap => setJobs(failedMail(snap.docs.map(d => ({ id: d.id, data: d.data() })))),
            err => { if ((err as { code?: string }).code !== 'permission-denied') console.warn('[Canary] mail jobs', err); });
    }, []);

    const retry = async (job: FailedMail) => {
        setBusy(job.id);
        try {
            await httpsCallable(getFunctions(app), 'retryMailJob')({ id: job.id });
            showAlert({ type: 'success', message: `${job.label}: sending again.` });
        } catch (err) {
            console.error('retryMailJob failed', err);
            showAlert({ type: 'error', message: `${job.label} not resent: ${callableErrorText(err, 'The mail service could not be reached.')}` });
        } finally {
            setBusy(null);
        }
    };

    if (!jobs.length) return null;
    const count = `${jobs.length} email${jobs.length === 1 ? '' : 's'} didn't send`;

    return (
        <section aria-label="Undelivered email" className={`rounded-2xl border px-4 py-3 text-sm ${isDark ? 'border-amber-400/20 bg-amber-400/[0.06]' : 'border-amber-500/20 bg-amber-500/[0.05]'}`}>
            <button type="button" onClick={() => setOpen(o => !o)} aria-expanded={open}
                className="w-full flex items-center gap-2.5 bg-transparent border-none p-0 cursor-pointer text-left text-primary">
                <MailWarning size={16} className="text-amber-500 shrink-0" />
                <span className="font-semibold">{count}</span>
                <span className="text-sec hidden sm:inline">- the notification was given up on after its retries.</span>
                <ChevronDown size={16} className={`ml-auto text-sec transition-transform duration-300 ${open ? 'rotate-180' : ''}`} />
            </button>
            <AnimatePresence initial={false}>
                {open && (
                    <motion.ul
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.35, ease: EASE.inOutCubic }}
                        className="overflow-hidden list-none m-0 p-0 flex flex-col"
                    >
                        {jobs.map(job => (
                            <li key={job.id} className={`flex items-start gap-3 pt-3 mt-3 border-t ${isDark ? 'border-white/10' : 'border-black/5'}`}>
                                <div className="min-w-0 flex-1">
                                    <div className="font-semibold text-primary truncate">{job.label}</div>
                                    <div className="text-xs text-sec">
                                        {job.createdAt ? new Date(job.createdAt).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : 'Unknown time'}
                                        {' · '}{job.attempts} {job.attempts === 1 ? 'try' : 'tries'}
                                    </div>
                                    {job.lastError && <div className="mt-1 text-xs font-mono text-sec break-words">{job.lastError}</div>}
                                </div>
                                <button type="button" onClick={() => retry(job)} disabled={busy !== null}
                                    aria-label={`Retry ${job.label}`}
                                    className="shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-lg border-none text-xs font-bold cursor-pointer bg-blue-500/10 text-blue-500 hover:bg-blue-500/20 transition-colors disabled:opacity-50 disabled:cursor-default">
                                    <RotateCw size={13} className={busy === job.id ? 'animate-spin' : ''} />
                                    {busy === job.id ? 'Sending...' : 'Retry'}
                                </button>
                            </li>
                        ))}
                    </motion.ul>
                )}
            </AnimatePresence>
        </section>
    );
};

export default MailFailures;
