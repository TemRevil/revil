import { describe, it, expect } from 'vitest';
import { mustConfirm, isRiskyClick, trimHistory, memoryDiff, labelsMatch } from './guard';

describe('mustConfirm', () => {
    it('always asks before a delete, auto mode or not', () => {
        expect(mustConfirm({ kind: 'delete', path: 'Projects/A' }, true)).toBe(true);
        expect(mustConfirm({ kind: 'delete', path: 'Projects/A' }, false)).toBe(true);
    });

    it('always asks before a whole-document replace, even in auto mode', () => {
        expect(mustConfirm({ kind: 'write', path: 'TreasuryIncome/inc_1', merge: false }, true)).toBe(true);
    });

    it('lets auto mode skip a routine merge write, and asks for it otherwise', () => {
        expect(mustConfirm({ kind: 'write', path: 'TreasuryIncome/inc_1', merge: true }, true)).toBe(false);
        expect(mustConfirm({ kind: 'write', path: 'TreasuryIncome/inc_1', merge: true }, false)).toBe(true);
    });

    it('always asks before a memory change, through either tool', () => {
        expect(mustConfirm({ kind: 'memory' }, true)).toBe(true);
        expect(mustConfirm({ kind: 'write', path: 'Spark/Memory', merge: true }, true)).toBe(true);
        expect(mustConfirm({ kind: 'write', path: '/Spark//Memory/', merge: true }, true)).toBe(true);
    });

    it('asks before a risky click in auto mode and lets a plain one through', () => {
        expect(mustConfirm({ kind: 'click', risky: true }, true)).toBe(true);
        expect(mustConfirm({ kind: 'click', risky: false }, true)).toBe(false);
    });
});

describe('isRiskyClick', () => {
    const plain = { label: 'Money', inDialog: false, isSubmit: false, stateful: false };

    it('treats a sub-tab as plain navigation', () => {
        expect(isRiskyClick(plain)).toBe(false);
    });

    it.each(['Delete', 'Delete Message', 'Cancel Session', 'Remove link', 'Send', 'Send receipt', 'Confirm', 'Do it', 'Save hours', 'Apply', 'Reopen', 'Closed', 'Sign out'])(
        'flags "%s"',
        label => expect(isRiskyClick({ ...plain, label })).toBe(true),
    );

    it('flags anything inside a confirm dialog, a submit button and a toggle', () => {
        expect(isRiskyClick({ ...plain, inDialog: true })).toBe(true);
        expect(isRiskyClick({ ...plain, isSubmit: true })).toBe(true);
        expect(isRiskyClick({ ...plain, stateful: true })).toBe(true);
    });
});

describe('labelsMatch', () => {
    it('matches the exact label, ignoring case and spacing', () => {
        expect(labelsMatch('  delete   message ', 'Delete Message')).toBe(true);
    });

    it('never matches a label that only contains the request, or the reverse', () => {
        // The old fuzzy match read "Do not delete" as a request for the "Delete" button.
        expect(labelsMatch('Do not delete', 'Delete')).toBe(false);
        expect(labelsMatch('Delete', 'Delete Message')).toBe(false);
    });
});

describe('trimHistory', () => {
    const turn = (n: number) => [
        { role: 'user', content: `question ${n}` },
        { role: 'assistant', content: [{ type: 'tool_use', id: `t${n}`, name: 'read_data', input: {} }] },
        { role: 'user', content: [{ type: 'tool_result', tool_use_id: `t${n}`, content: 'x'.repeat(50) }] },
        { role: 'assistant', content: [{ type: 'text', text: `answer ${n}` }] },
    ];

    it('keeps only the last turns, cutting at a turn start', () => {
        const msgs = [1, 2, 3, 4, 5].flatMap(turn);
        const out = trimHistory(msgs, { maxTurns: 2, maxChars: 1e9 });
        expect(out).toEqual([4, 5].flatMap(turn));
    });

    it('drops old turns to fit the size budget but never the newest one', () => {
        const msgs = [1, 2, 3].flatMap(turn);
        const one = JSON.stringify(turn(3)).length;
        expect(trimHistory(msgs, { maxTurns: 99, maxChars: one + 10 })).toEqual(turn(3));
        expect(trimHistory(msgs, { maxTurns: 99, maxChars: 1 })).toEqual(turn(3));
    });

    it('never treats a tool result as a turn start (OpenAI and Gemini shapes too)', () => {
        const openai = [
            { role: 'user', content: 'q1' },
            { role: 'assistant', content: null, tool_calls: [{ id: 'a' }] },
            { role: 'tool', tool_call_id: 'a', content: 'r' },
            { role: 'user', content: 'q2' },
        ];
        expect(trimHistory(openai, { maxTurns: 1, maxChars: 1e9 })).toEqual([{ role: 'user', content: 'q2' }]);
        const gemini = [
            { role: 'user', parts: [{ text: 'q1' }] },
            { role: 'model', parts: [{ functionCall: { name: 'x', args: {} } }] },
            { role: 'user', parts: [{ functionResponse: { name: 'x', response: {} } }] },
            { role: 'model', parts: [{ text: 'a1' }] },
        ];
        expect(trimHistory(gemini, { maxTurns: 1, maxChars: 1e9 })).toEqual(gemini);
    });
});

describe('memoryDiff', () => {
    it('lists what changes and leaves out what stays', () => {
        const diff = memoryDiff(
            { userName: 'Sam', instructions: 'be brief', facts: ['a'] },
            { instructions: 'be very brief', facts: ['a', 'b'] },
        );
        expect(diff).toContain('instructions: "be brief" -> "be very brief"');
        expect(diff).toContain('add fact: "b"');
        expect(diff).not.toContain('userName');
    });
});
