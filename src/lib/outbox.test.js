import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createOutbox, retryDelay, REFUSED_AFTER, MAX_AGE } from './outbox';
import { outcome, overlayScores, pendingMatchValue } from './saves';

const OK = { ok: true };
const OFFLINE = { ok: false, refused: false, message: 'Failed to fetch' };
const REFUSED = { ok: false, refused: true, code: 'ZERO_ROWS', message: 'no rows' };

// A sender that answers from a script, then succeeds. Records every op it was asked to send.
function scripted(...results) {
    const sent = [];
    const send = vi.fn(async (op) => {
        sent.push(op);
        return results.length ? results.shift() : OK;
    });
    return { send, sent };
}

function memoryStorage(initial = {}) {
    const data = { ...initial };
    return {
        data,
        getItem: (k) => (k in data ? data[k] : null),
        setItem: (k, v) => { data[k] = v; },
    };
}

// Let the queue's awaits settle without moving the clock.
const settle = () => vi.advanceTimersByTimeAsync(0);

beforeEach(() => { vi.useFakeTimers(); });
afterEach(() => { vi.useRealTimers(); });

describe('retryDelay', () => {
    it('doubles from one second and stops growing at thirty', () => {
        expect([1, 2, 3, 4, 5, 6, 7].map(n => retryDelay(n, false)))
            .toEqual([1000, 2000, 4000, 8000, 16000, 30000, 30000]);
    });

    it('waits a minute between tries once a save is flagged as refused', () => {
        expect(retryDelay(3, true)).toBe(60000);
    });
});

describe('outbox', () => {
    it('sends a save and forgets it once confirmed', async () => {
        const { send, sent } = scripted();
        const box = createOutbox({ send });

        box.enqueue('a', { v: 1 });
        await settle();

        expect(sent).toEqual([{ v: 1 }]);
        expect(box.status()).toEqual({ pending: 0, retrying: 0, refused: 0 });
    });

    it('keeps resending after a failed send until it lands', async () => {
        const { send, sent } = scripted(OFFLINE, OFFLINE);
        const box = createOutbox({ send });

        box.enqueue('a', { v: 1 });
        await settle();
        expect(box.status()).toEqual({ pending: 1, retrying: 1, refused: 0 });

        await vi.advanceTimersByTimeAsync(1000);
        expect(sent).toHaveLength(2);
        expect(box.status().pending).toBe(1);

        await vi.advanceTimersByTimeAsync(2000);
        expect(sent).toHaveLength(3);
        expect(box.status()).toEqual({ pending: 0, retrying: 0, refused: 0 });
    });

    it('treats a sender that throws as a failed send, not a lost save', async () => {
        const send = vi.fn()
            .mockRejectedValueOnce(new Error('boom'))
            .mockResolvedValue(OK);
        const box = createOutbox({ send });

        box.enqueue('a', { v: 1 });
        await settle();
        expect(box.status().pending).toBe(1);

        await vi.advanceTimersByTimeAsync(1000);
        expect(box.status().pending).toBe(0);
    });

    it('does not wait out the delay when flushed', async () => {
        const { send, sent } = scripted(OFFLINE);
        const box = createOutbox({ send });

        box.enqueue('a', { v: 1 });
        await settle();
        expect(sent).toHaveLength(1);

        box.flush();
        await settle();
        expect(sent).toHaveLength(2);
        expect(box.status().pending).toBe(0);
    });

    // A send that stays in flight until released, then answers `result`.
    function held(result) {
        let release;
        const sent = [];
        const send = vi.fn((op) => {
            sent.push(op);
            if (sent.length === 1) return new Promise(resolve => { release = () => resolve(result); });
            return Promise.resolve(OK);
        });
        return { send, sent, release: () => release() };
    }

    it('sends only the latest value for a key changed while a send was in flight', async () => {
        const { send, sent, release } = held(OFFLINE);
        const box = createOutbox({ send });

        box.enqueue('cell', { v: 4 });
        await settle();
        box.enqueue('cell', { v: 5 });
        box.enqueue('cell', { v: 6 });
        release();
        await settle();

        expect(sent).toEqual([{ v: 4 }, { v: 6 }]);
        expect(box.status().pending).toBe(0);
    });

    it('still sends the newer value when the older one landed after it was queued', async () => {
        const { send, sent, release } = held(OK);
        const box = createOutbox({ send });

        box.enqueue('cell', { v: 4 });
        await settle();
        box.enqueue('cell', { v: 5 });
        release();
        await settle();

        expect(sent).toEqual([{ v: 4 }, { v: 5 }]);
        expect(box.status().pending).toBe(0);
    });

    it('sends other keys while one is waiting to retry', async () => {
        const { send, sent } = scripted(OFFLINE);
        const box = createOutbox({ send });

        box.enqueue('a', { v: 'a' });
        await settle();
        box.enqueue('b', { v: 'b' });
        await settle();

        expect(sent).toEqual([{ v: 'a' }, { v: 'b' }]);
        expect(box.pending()).toEqual([{ v: 'a' }]);
    });

    it('flags and reports a refused save once, after a few tries', async () => {
        const { send } = scripted(REFUSED, REFUSED, REFUSED, REFUSED);
        const report = vi.fn();
        const box = createOutbox({ send, report });

        box.enqueue('a', { v: 1 });
        await settle();
        await vi.advanceTimersByTimeAsync(1000);
        expect(box.status().refused).toBe(0);
        expect(report).not.toHaveBeenCalled();

        await vi.advanceTimersByTimeAsync(2000);
        expect(send).toHaveBeenCalledTimes(REFUSED_AFTER);
        expect(box.status()).toEqual({ pending: 1, retrying: 1, refused: 1 });
        expect(report).toHaveBeenCalledTimes(1);
        expect(report).toHaveBeenCalledWith({ v: 1 }, REFUSED);

        // Refused again a minute later: still flagged, not reported twice.
        await vi.advanceTimersByTimeAsync(60000);
        expect(send).toHaveBeenCalledTimes(4);
        expect(report).toHaveBeenCalledTimes(1);
    });

    it('clears the flag when a refused save finally goes through', async () => {
        const { send } = scripted(REFUSED, REFUSED, REFUSED);
        const box = createOutbox({ send });

        box.enqueue('a', { v: 1 });
        await vi.advanceTimersByTimeAsync(3000);
        expect(box.status().refused).toBe(1);

        await vi.advanceTimersByTimeAsync(60000);
        expect(box.status()).toEqual({ pending: 0, retrying: 0, refused: 0 });
    });

    it('never flags a save that only ever failed for lack of signal', async () => {
        const { send } = scripted(...Array(10).fill(OFFLINE));
        const report = vi.fn();
        const box = createOutbox({ send, report });

        box.enqueue('a', { v: 1 });
        await vi.advanceTimersByTimeAsync(5 * 60 * 1000);

        expect(report).not.toHaveBeenCalled();
        expect(box.status().pending).toBe(0);
    });

    it('survives a reporter that throws', async () => {
        const { send } = scripted(REFUSED, REFUSED, REFUSED);
        const box = createOutbox({ send, report: () => { throw new Error('no table'); } });

        box.enqueue('a', { v: 1 });
        await vi.advanceTimersByTimeAsync(3000 + 60000);

        expect(box.status().pending).toBe(0);
    });

    it('tells subscribers, and hands back the same status object when nothing changed', async () => {
        const { send } = scripted();
        const box = createOutbox({ send });
        const seen = vi.fn();
        const unsubscribe = box.subscribe(seen);

        const idle = box.status();
        box.enqueue('a', { v: 1 });
        expect(box.status()).not.toBe(idle);
        await settle();
        expect(seen).toHaveBeenCalled();

        const after = box.status();
        expect(box.status()).toBe(after);

        unsubscribe();
        seen.mockClear();
        box.enqueue('b', { v: 2 });
        expect(seen).not.toHaveBeenCalled();
    });

    it('keeps unsent saves in storage and sends them after a restart', async () => {
        const storage = memoryStorage();
        const first = createOutbox({ send: async () => OFFLINE, storage, storageKey: 'k' });
        first.enqueue('a', { v: 1 });
        await settle();
        expect(JSON.parse(storage.data.k)).toHaveLength(1);

        const { send, sent } = scripted();
        const second = createOutbox({ send, storage, storageKey: 'k' });
        expect(second.pending()).toEqual([{ v: 1 }]);

        second.flush();
        await settle();
        expect(sent).toEqual([{ v: 1 }]);
        expect(JSON.parse(storage.data.k)).toEqual([]);
    });

    it('drops a stored save that is more than a day old', () => {
        const at = Date.now() - MAX_AGE - 1;
        const storage = memoryStorage({ k: JSON.stringify([{ key: 'a', op: { v: 1 }, at }]) });
        const box = createOutbox({ send: async () => OK, storage, storageKey: 'k' });

        expect(box.pending()).toEqual([]);
    });

    it('starts empty when storage holds something unreadable', () => {
        const storage = memoryStorage({ k: 'not json' });
        const box = createOutbox({ send: async () => OK, storage, storageKey: 'k' });

        expect(box.pending()).toEqual([]);
    });
});

describe('outcome', () => {
    it('is saved only when rows came back', () => {
        expect(outcome({ data: [{ id: 1 }], error: null, status: 200 })).toEqual({ ok: true });
    });

    it('treats success with no rows as a refusal — what RLS does to a blocked UPDATE', () => {
        expect(outcome({ data: [], error: null, status: 200 }))
            .toMatchObject({ ok: false, refused: true, code: 'ZERO_ROWS' });
        expect(outcome({ data: null, error: null, status: 204 }))
            .toMatchObject({ ok: false, refused: true });
    });

    it('treats a request that never got an answer as worth retrying', () => {
        expect(outcome({ data: null, error: { message: 'TypeError: Failed to fetch' }, status: 0 }))
            .toMatchObject({ ok: false, refused: false });
        expect(outcome({ data: null, error: { message: 'x' } }))
            .toMatchObject({ ok: false, refused: false });
    });

    it('treats server trouble, timeouts and rate limits as worth retrying', () => {
        for (const status of [500, 502, 503, 408, 429]) {
            expect(outcome({ data: null, error: { message: 'x' }, status }).refused).toBe(false);
        }
    });

    it('treats the database saying no as a refusal, and keeps its code', () => {
        expect(outcome({ data: null, error: { code: '42501', message: 'permission denied' }, status: 403 }))
            .toEqual({ ok: false, refused: true, status: 403, code: '42501', message: 'permission denied' });
        expect(outcome({ data: null, error: { code: 'PGRST204', message: 'no column' }, status: 400 }).refused)
            .toBe(true);
    });
});

describe('overlayScores', () => {
    const fetched = { p1: { 1: 4, 2: 5 }, p2: { 1: 3 } };

    it('lays unsent scores for this match over what the database returned', () => {
        const ops = [
            { type: 'score', matchId: 'm', playerId: 'p1', hole: 2, strokes: 6 },
            { type: 'score', matchId: 'm', playerId: 'p3', hole: 1, strokes: 7 },
        ];
        expect(overlayScores(fetched, ops, 'm')).toEqual({ p1: { 1: 4, 2: 6 }, p2: { 1: 3 }, p3: { 1: 7 } });
    });

    it('removes a cell whose clearing has not been sent yet', () => {
        const ops = [{ type: 'score', matchId: 'm', playerId: 'p1', hole: 1, strokes: null }];
        expect(overlayScores(fetched, ops, 'm').p1).toEqual({ 2: 5 });
    });

    it('ignores other matches and other kinds of save, and leaves its input alone', () => {
        const ops = [
            { type: 'score', matchId: 'other', playerId: 'p1', hole: 1, strokes: 9 },
            { type: 'match', matchId: 'm', column: 'wager', value: {} },
        ];
        expect(overlayScores(fetched, ops, 'm')).toEqual(fetched);
        expect(fetched).toEqual({ p1: { 1: 4, 2: 5 }, p2: { 1: 3 } });
    });
});

describe('pendingMatchValue', () => {
    const ops = [
        { type: 'match', matchId: 'm', column: 'presses', value: [3] },
        { type: 'score', matchId: 'm', playerId: 'p1', hole: 1, strokes: 4 },
    ];

    it('finds the unsent value for a column', () => {
        expect(pendingMatchValue(ops, 'm', 'presses')).toEqual([3]);
    });

    it('is undefined when nothing is waiting for that column or match', () => {
        expect(pendingMatchValue(ops, 'm', 'wager')).toBeUndefined();
        expect(pendingMatchValue(ops, 'other', 'presses')).toBeUndefined();
    });
});
