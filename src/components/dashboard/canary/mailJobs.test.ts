import { describe, expect, it } from 'vitest';
import { failedMail } from './mailJobs';

describe('failedMail', () => {
    it('lists only failed jobs, newest first, with their reason and tries', () => {
        const list = failedMail([
            { id: 'a', data: { status: 'failed', label: 'Contact notification', lastError: '550: mailbox unavailable', attempts: 6, createdAt: 100 } },
            { id: 'b', data: { status: 'sent', label: 'Booking acknowledgement', attempts: 1, createdAt: 300 } },
            { id: 'c', data: { status: 'failed', label: 'Booking notification', lastError: 'ETIMEDOUT: timeout', attempts: 6, createdAt: 200 } },
            { id: 'd', data: { status: 'pending', attempts: 2, createdAt: 400 } },
        ]);
        expect(list.map(j => j.id)).toEqual(['c', 'a']);
        expect(list[1]).toEqual({ id: 'a', label: 'Contact notification', lastError: '550: mailbox unavailable', attempts: 6, createdAt: 100 });
    });

    it('reads a job with missing fields without breaking', () => {
        expect(failedMail([{ id: 'x', data: { status: 'failed' } }])).toEqual([
            { id: 'x', label: 'Email', lastError: '', attempts: 0, createdAt: 0 },
        ]);
    });
});
