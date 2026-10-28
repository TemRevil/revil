/**
 * Mail the functions gave up on. Every notification and acknowledgement is queued as a
 * MailJobs/{id} document and retried with backoff; after the last attempt it stays as
 * `failed` with a short reason (functions/src/outbox.ts). The dashboard lists those so a
 * lost booking or contact notification is seen, and can send one again through the
 * admin-only retryMailJob callable, which takes only the job id.
 */
export interface FailedMail {
    id: string;
    /** A few words saying what it was: "Contact notification", "Booking acknowledgement". */
    label: string;
    lastError: string;
    attempts: number;
    createdAt: number;
}

/** Failed jobs from MailJobs documents, newest first. Missing fields read as blanks. */
export function failedMail(docs: { id: string; data: Record<string, unknown> }[]): FailedMail[] {
    return docs
        .filter(d => d.data.status === 'failed')
        .map(({ id, data }) => ({
            id,
            label: typeof data.label === 'string' && data.label.trim() ? data.label.trim() : 'Email',
            lastError: typeof data.lastError === 'string' ? data.lastError : '',
            attempts: typeof data.attempts === 'number' ? data.attempts : 0,
            createdAt: typeof data.createdAt === 'number' ? data.createdAt : 0,
        }))
        .sort((a, b) => b.createdAt - a.createdAt);
}
