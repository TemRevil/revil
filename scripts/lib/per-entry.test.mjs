import { describe, expect, it } from 'vitest';
import {
    convertMeeting, hostZoneOf, idProblem, legacyDay, legacyMinutes, legacyStart, planMigration, sameData,
    backupStamp, cleanupProblems, toJson, OLD_DOCS,
} from './per-entry.mjs';
import { dayIndex, hostTimeToInstant, hostZone } from '../../src/utils/bookingRules';

const iso = (ms) => new Date(ms).toISOString();

describe('the old meeting strings', () => {
    it('reads a real DD/MM/YYYY day and nothing else', () => {
        expect(legacyDay('02/11/2026')).toBe(Math.round(Date.UTC(2026, 10, 2) / 86_400_000));
        for (const bad of ['31/02/2026', '2/11/2026', '2026-11-02', '', undefined, null, 7]) expect(legacyDay(bad)).toBeNull();
    });

    it('reads "hh:mm AM/PM", midnight and noon included', () => {
        expect(legacyMinutes('09:30 AM')).toBe(570);
        expect(legacyMinutes('12:00 AM')).toBe(0);
        expect(legacyMinutes('12:15 PM')).toBe(735);
        expect(legacyMinutes('02:00 pm')).toBe(840);
        for (const bad of ['13:00 PM', '00:30 AM', '9:60 AM', '14:00', 'later', undefined]) expect(legacyMinutes(bad)).toBeNull();
    });
});

describe('legacyStart', () => {
    it('reads the owner wall clock in a named zone, daylight saving included', () => {
        // Cairo: UTC+3 on summer time, UTC+2 after 30/10/2026.
        expect(iso(legacyStart({ Date: '15/07/2026', Time: '10:00 AM' }, 'Africa/Cairo'))).toBe('2026-07-15T07:00:00.000Z');
        expect(iso(legacyStart({ Date: '15/12/2026', Time: '10:00 AM' }, 'Africa/Cairo'))).toBe('2026-12-15T08:00:00.000Z');
    });

    it('reads a fixed offset as it is', () => {
        expect(iso(legacyStart({ Date: '15/07/2026', Time: '10:00 AM' }, 2))).toBe('2026-07-15T08:00:00.000Z');
        expect(iso(legacyStart({ Date: '01/01/2027', Time: '11:30 PM' }, -5))).toBe('2027-01-02T04:30:00.000Z');
    });

    it('gives the same instant as the booking rules the site and functions use', () => {
        const cases = [
            ['05/03/2027', '02:30 PM', 'Europe/Berlin'], ['28/03/2027', '02:30 AM', 'Europe/Berlin'],
            ['31/10/2026', '11:00 PM', 'Africa/Cairo'], ['15/01/2027', '09:00 AM', 3], ['15/01/2027', '09:00 AM', 5.5],
        ];
        for (const [d, t, zone] of cases) {
            const [dd, mm, yyyy] = d.split('/').map(Number);
            expect(legacyStart({ Date: d, Time: t }, zone)).toBe(hostTimeToInstant(dayIndex(yyyy, mm - 1, dd), t, zone));
        }
    });
});

describe('hostZoneOf', () => {
    it('uses the named zone when Availability has one', () => {
        expect(hostZoneOf({ timeZone: 'Africa/Cairo', 'Current Time': 'UTC+02:00 (Cairo)' })).toEqual({ zone: 'Africa/Cairo', named: true });
    });

    it('falls back to the old fixed offset only when no real zone is set', () => {
        expect(hostZoneOf({ 'Current Time': 'UTC+03:00 (EEST)' })).toEqual({ zone: 3, named: false });
        expect(hostZoneOf({ timeZone: 'Not/AZone', 'Current Time': 'UTC-05:30 (X)' })).toEqual({ zone: -5.5, named: false });
        expect(hostZoneOf(undefined)).toEqual({ zone: 2, named: false });
    });

    it('agrees with the booking rules', () => {
        for (const a of [{ timeZone: 'Asia/Tokyo' }, { 'Current Time': 'UTC+03:00 (EEST)' }, {}, { timeZone: 'nope' }]) {
            expect(hostZoneOf(a).zone).toBe(hostZone(a));
        }
    });
});

describe('convertMeeting', () => {
    const meeting = { Name: 'Guest', Email: 'g@example.com', Date: '15/07/2026', Time: '10:00 AM', MeetingLink: 'https://meet.google.com/x', Category: 'cat_1' };

    it('replaces Date and Time with the instant and the clock it was read on, keeping every other field', () => {
        const { data, status } = convertMeeting(meeting, { zone: 'Africa/Cairo', named: true });
        expect(status).toBe('converted');
        expect(data).toEqual({
            Name: 'Guest', Email: 'g@example.com', MeetingLink: 'https://meet.google.com/x', Category: 'cat_1',
            start: '2026-07-15T07:00:00.000Z', timeZone: 'Africa/Cairo', utcOffset: null, migratedFrom: 'Settings/Canary',
        });
    });

    it('marks a meeting read on the fixed-offset fallback', () => {
        const { data, status } = convertMeeting(meeting, { zone: 2, named: false });
        expect(status).toBe('fallback');
        expect(data).toMatchObject({ start: '2026-07-15T08:00:00.000Z', timeZone: null, utcOffset: 2 });
    });

    it('copies a meeting it cannot read unchanged, without inventing a start', () => {
        const odd = { Name: 'Odd', Date: '31/02/2026', Time: '10:00 AM' };
        const { data, status } = convertMeeting(odd, { zone: 'Africa/Cairo', named: true });
        expect(status).toBe('unconverted');
        expect(data).toEqual({ ...odd, migratedFrom: 'Settings/Canary' });
    });
});

describe('idProblem', () => {
    it('accepts the ids the entries always had', () => {
        for (const id of ['1781234567890_ab12cd3', 'proj_x1y2z3', 'inc_AbC-_123', 'cat.with.dots']) expect(idProblem(id)).toBeNull();
    });

    it('refuses what Firestore cannot use as a document id', () => {
        for (const id of ['', 'a/b', '.', '..', '__name__', 'x'.repeat(1501)]) expect(idProblem(id)).not.toBeNull();
    });
});

describe('planMigration', () => {
    const old = {
        'Settings/Canary': {
            Emails: { m1: { Name: 'A', Message: 'hi', Timestamp: 1 }, 'bad/id': { Name: 'B' } },
            Meetings: { b1: { Name: 'G', Date: '15/07/2026', Time: '10:00 AM' }, b2: { Name: 'H', Date: 'soon', Time: '?' }, b3: null },
            Categories: { cat_1: { Name: 'Client' } },
        },
        'Treasury/projects': { entries: { p1: { name: 'P', order: 0 } }, lastWrite: 'x' },
        'Treasury/income': { entries: { i1: { amount: 5, currency: 'USD', date: '2026-10-01' } } },
        // Treasury/spendings, accounts and receipts missing entirely.
    };

    it('writes one document per entry under its old key and reports what it could not move', () => {
        const { writes, report } = planMigration(old, { timeZone: 'Africa/Cairo' });
        expect(writes.map((w) => `${w.collection}/${w.id}`)).toEqual([
            'CanaryMessages/m1', 'CanaryMeetings/b1', 'CanaryMeetings/b2', 'TreasuryProjects/p1', 'TreasuryIncome/i1',
        ]);
        expect(writes[0].data).toEqual({ Name: 'A', Message: 'hi', Timestamp: 1, migratedFrom: 'Settings/Canary' });
        expect(writes[1].data.start).toBe('2026-07-15T07:00:00.000Z');
        expect(writes[3].data).toEqual({ name: 'P', order: 0 }); // treasury entries are exact copies
        expect(report.counts).toEqual({
            CanaryMessages: 1, CanaryMeetings: 2, TreasuryProjects: 1, TreasuryIncome: 1,
            TreasurySpendings: 0, TreasuryAccounts: 0, TreasuryReceipts: 0,
        });
        expect(report.unconverted).toEqual(['b2']);
        expect(report.fallback).toEqual([]);
        expect(report.badIds).toEqual(['Settings/Canary.Emails.bad/id (contains "/")']);
        expect(report.notObjects).toEqual(['Settings/Canary.Meetings.b3']);
    });

    it('reports every converted meeting as a fallback when Availability names no zone', () => {
        const { report } = planMigration(old, { 'Current Time': 'UTC+03:00 (EEST)' });
        expect(report.fallback).toEqual(['b1']);
        expect(report.host).toEqual({ zone: 3, named: false });
    });

    it('reads every old document it plans from', () => {
        expect(OLD_DOCS).toEqual(['Settings/Canary', 'Treasury/projects', 'Treasury/income', 'Treasury/spendings', 'Treasury/accounts', 'Treasury/receipts']);
    });
});

describe('sameData and the backup format', () => {
    const ts = { toMillis: () => 0, toDate: () => new Date(0) };

    it('compares data whatever order the keys are in', () => {
        expect(sameData({ a: 1, b: { c: [1, 2] } }, { b: { c: [1, 2] }, a: 1 })).toBe(true);
        expect(sameData({ a: 1 }, { a: 1, b: 2 })).toBe(false);
        expect(sameData({ a: [1, 2] }, { a: [2, 1] })).toBe(false);
    });

    it('writes Firestore timestamps as readable ISO strings', () => {
        expect(toJson({ lastWrite: ts, n: 1 })).toEqual({ lastWrite: { __timestamp: '1970-01-01T00:00:00.000Z' }, n: 1 });
    });

    it('names a backup folder by the time, safely for any filesystem', () => {
        expect(backupStamp(Date.UTC(2026, 9, 28, 14, 5, 9, 123))).toBe('2026-10-28T14-05-09Z');
    });
});

describe('migration cleanup gate', () => {
    const writes = [{ collection: 'TreasuryIncome', id: 'i1', data: { amount: 500 } }];
    const report = { unconverted: [], badIds: [], notObjects: [] };

    it('allows cleanup only when the full copied record agrees', () => {
        const current = { TreasuryIncome: new Map([['i1', { amount: 500 }]]) };
        expect(cleanupProblems(writes, current, report)).toEqual({ missing: [], differs: [], unconverted: [], invalid: [] });
    });

    it('blocks a changed payment even when the copied id exists', () => {
        const current = { TreasuryIncome: new Map([['i1', { amount: 100 }]]) };
        expect(cleanupProblems(writes, current, report).differs).toEqual(['TreasuryIncome/i1']);
    });

    it('blocks missing copies and meetings that would disappear from the new calendar', () => {
        const result = cleanupProblems(writes, {}, { ...report, unconverted: ['meeting-1'] });
        expect(result.missing).toEqual(['TreasuryIncome/i1']);
        expect(result.unconverted).toEqual(['meeting-1']);
    });

    it('blocks skipped invalid source records', () => {
        expect(cleanupProblems([], {}, { ...report, badIds: ['bad/id'], notObjects: ['invalid'] }).invalid).toEqual(['bad/id', 'invalid']);
    });
});
