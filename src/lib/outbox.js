//==================================================================================================
// A queue of saves that have not been confirmed yet.
//
// A save goes in under a key that names what it sets (one score cell, one column of a match). It
// is sent, and removed only when the sender confirms it landed. Anything else is retried: a dead
// spot on the course is the ordinary case, and the golfer should not have to notice it.
//
// Only the latest value per key is kept, so a cell changed twice while offline arrives as its
// final value rather than being replayed in order. That is safe because every save here sets a
// whole value (an upsert on a unique key, or an overwrite of one column).
//
// Two kinds of failure, told apart by the sender:
//   - transient (no network, 5xx): retried with a growing delay, for as long as it takes.
//   - refused (the database said no, or reported success having written nothing): retrying will
//     not fix it, so after REFUSED_AFTER tries the entry is flagged and reported once. It is still
//     retried slowly, so a policy fixed mid-round clears the flag by itself.
//
// No Supabase and no DOM in here: the sender, the reporter, the storage and the timers are passed
// in, which is what lets the unit tests drive it.
//==================================================================================================

export const REFUSED_AFTER = 3;
const MAX_TRANSIENT_DELAY = 30_000;
const REFUSED_DELAY = 60_000;
// A save still unsent after this long is dropped when the app next starts. Without a limit, a
// save refused for good (its match was deleted) would raise the warning on every launch forever.
export const MAX_AGE = 24 * 60 * 60 * 1000;

// Delay before the next try: 1s, 2s, 4s ... capped. A flagged entry waits the long delay.
export function retryDelay(attempts, flagged) {
    if (flagged) return REFUSED_DELAY;
    return Math.min(MAX_TRANSIENT_DELAY, 1000 * 2 ** Math.max(0, attempts - 1));
}

export function createOutbox({
    send,
    report = () => {},
    storage = null,
    storageKey = 'outbox',
    now = () => Date.now(),
    setTimer = (fn, ms) => setTimeout(fn, ms),
    clearTimer = (id) => clearTimeout(id),
}) {
    const entries = new Map();
    const listeners = new Set();
    let seq = 0;
    let running = false;
    let timer = null;
    let status = { pending: 0, retrying: 0, refused: 0 };

    const persist = () => {
        if (!storage) return;
        try {
            storage.setItem(storageKey, JSON.stringify(
                [...entries.values()].map(({ key, op, at }) => ({ key, op, at }))));
        } catch {
            // Storage full or unavailable (private mode): the queue still works for this session.
        }
    };

    const changed = () => {
        const all = [...entries.values()];
        const next = {
            pending: all.length,
            retrying: all.filter(e => e.attempts > 0).length,
            refused: all.filter(e => e.refused).length,
        };
        // Keep the same object when nothing changed: useSyncExternalStore compares by identity.
        if (next.pending !== status.pending || next.retrying !== status.retrying || next.refused !== status.refused) {
            status = next;
        }
        persist();
        listeners.forEach(fn => fn());
    };

    const schedule = () => {
        if (timer !== null) { clearTimer(timer); timer = null; }
        if (!entries.size) return;
        const soonest = Math.min(...[...entries.values()].map(e => e.nextAt));
        timer = setTimer(() => { timer = null; run(); }, Math.max(0, soonest - now()));
    };

    async function run() {
        if (running) return;
        running = true;
        try {
            for (;;) {
                const entry = [...entries.values()].find(e => e.nextAt <= now());
                if (!entry) break;

                let result;
                try {
                    result = await send(entry.op);
                } catch (err) {
                    result = { ok: false, refused: false, message: String(err?.message || err) };
                }

                // A newer value for this key was queued while this one was in flight. Whatever
                // happened to the old value, the new one still has to go.
                if (entries.get(entry.key) !== entry) continue;

                if (result?.ok) {
                    entries.delete(entry.key);
                } else {
                    entry.attempts += 1;
                    if (result?.refused) entry.refusals += 1;
                    if (!entry.refused && entry.refusals >= REFUSED_AFTER) {
                        entry.refused = true;
                        try { report(entry.op, result); } catch { /* reporting must never break saving */ }
                    }
                    entry.nextAt = now() + retryDelay(entry.attempts, entry.refused);
                }
                changed();
            }
        } finally {
            running = false;
            schedule();
        }
    }

    const add = (key, op, at) => {
        seq += 1;
        entries.set(key, { key, op, at, seq, attempts: 0, refusals: 0, refused: false, nextAt: 0 });
    };

    // Saves left over from the last time the app was open.
    if (storage) {
        try {
            const saved = JSON.parse(storage.getItem(storageKey) || '[]');
            for (const { key, op, at } of Array.isArray(saved) ? saved : []) {
                if (key && op && now() - (at || 0) < MAX_AGE) add(key, op, at);
            }
        } catch {
            // Unreadable storage: start empty.
        }
        if (entries.size) changed();
    }

    return {
        // Queue a save, replacing any unsent value for the same key.
        enqueue(key, op) {
            add(key, op, now());
            changed();
            run();
        },
        // Try everything now, ignoring the retry delays: the phone came back online, or the app
        // returned to the foreground.
        flush() {
            entries.forEach(e => { e.nextAt = 0; });
            run();
        },
        // The unsent operations, oldest first. A fresh read from the database does not include
        // these yet, so whoever shows that data lays them over the top.
        pending() {
            return [...entries.values()].map(e => e.op);
        },
        status: () => status,
        subscribe(fn) {
            listeners.add(fn);
            return () => listeners.delete(fn);
        },
    };
}
