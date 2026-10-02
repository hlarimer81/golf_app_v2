import { supabase } from '../supabaseClient';
import { createOutbox } from './outbox';

//==================================================================================================
// The app's one outbox, and the two kinds of save that go through it:
//
//   score  one cell of the scorecard (strokes null = cleared)
//   match  one column of the matches row (wager, presses, wolf_vegas), overwritten whole
//
// The hooks queue a save here instead of calling Supabase themselves. See outbox.js for how
// retrying works; this file is the part that talks to the database and decides what counts as
// saved.
//==================================================================================================

const scoreKey = (matchId, playerId, hole) => `score:${matchId}:${playerId}:${hole}`;
const matchKey = (matchId, column) => `match:${matchId}:${column}`;

// Turn a Supabase response into the outbox's verdict.
//
// No status (the request never got an answer), 5xx, 408 and 429 are worth retrying. Any other 4xx
// is the database refusing. A 2xx with no rows is also a refusal: an UPDATE blocked by RLS returns
// 200 and an empty array, with no error.
export function outcome({ data, error, status }) {
    if (error) {
        const transient = !status || status >= 500 || status === 408 || status === 429;
        return { ok: false, refused: !transient, status: status || 0, code: error.code || '', message: error.message || '' };
    }
    if (!data?.length) {
        return { ok: false, refused: true, status: status || 0, code: 'ZERO_ROWS', message: 'the write reported success but changed no rows' };
    }
    return { ok: true };
}

export async function sendOp(op, db = supabase) {
    if (op.type === 'match') {
        return outcome(await db.from('matches')
            .update({ [op.column]: op.value })
            .eq('id', op.matchId)
            .select('id'));
    }

    if (op.strokes !== null) {
        return outcome(await db.from('scores')
            .upsert(
                { match_id: op.matchId, player_id: op.playerId, hole_number: op.hole, strokes: op.strokes },
                { onConflict: 'match_id,player_id,hole_number' })
            .select('hole_number'));
    }

    // Clearing a cell. Zero rows deleted is ambiguous: the row may already be gone, or the DELETE
    // may have been refused. Look for the row to tell which.
    const cell = (query) => query
        .eq('match_id', op.matchId).eq('player_id', op.playerId).eq('hole_number', op.hole);

    const removed = await cell(db.from('scores').delete()).select('hole_number');
    if (removed.error) return outcome(removed);
    if (removed.data?.length) return { ok: true };

    const left = await cell(db.from('scores').select('hole_number'));
    if (left.error) return outcome(left);
    if (!left.data?.length) return { ok: true };
    return { ok: false, refused: true, status: removed.status || 0, code: 'ZERO_ROWS', message: 'the delete reported success but the row is still there' };
}

// One row in client_error per refused save, so a refusal is something Harold can find rather than
// something a golfer has to describe. No scores or wagers go in it, only what was being written.
//
// The insert is deliberately not checked: anon may INSERT but not SELECT here, so there is nothing
// to read back, and a failed report must not disturb the save it is reporting on.
const reported = new Set();
async function reportRefusal(op, result) {
    const target = op.type === 'score' ? 'scores' : 'matches';
    const action = op.type === 'score' ? (op.strokes === null ? 'delete' : 'upsert') : `update ${op.column}`;
    const once = `${op.matchId}:${target}:${action}:${result.code}`;
    if (reported.has(once)) return;
    reported.add(once);

    console.error('save refused', target, action, result);
    try {
        await supabase.from('client_error').insert({
            match_id: String(op.matchId),
            target,
            action,
            http_status: result.status || null,
            code: result.code || null,
            message: (result.message || '').slice(0, 500),
            app_version: import.meta.env.VITE_APP_VERSION || null,
            user_agent: typeof navigator !== 'undefined' ? navigator.userAgent.slice(0, 300) : null,
        });
    } catch {
        // Nothing useful to do: the console line above is the fallback.
    }
}

const inBrowser = typeof window !== 'undefined';

let storage = null;
try { storage = inBrowser ? window.localStorage : null; } catch { storage = null; }

export const outbox = createOutbox({
    send: sendOp,
    report: reportRefusal,
    storage,
    storageKey: '4play.outbox.v1',
});

if (inBrowser) {
    // Don't wait out a retry delay once there is a reason to think the next try will work.
    window.addEventListener('online', () => outbox.flush());
    document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') outbox.flush();
    });
    // Saves left unsent when the app was last closed.
    outbox.flush();
}

export function queueScoreSave(matchId, playerId, hole, strokes) {
    outbox.enqueue(scoreKey(matchId, playerId, hole), { type: 'score', matchId, playerId, hole, strokes });
}

export function queueMatchSave(matchId, column, value) {
    outbox.enqueue(matchKey(matchId, column), { type: 'match', matchId, column, value });
}

// Lay unsent score saves over a freshly fetched scores map ({ [playerId]: { [hole]: strokes } }).
// Without this, a realtime refetch triggered by another phone would wipe a score that is still
// waiting to be sent off this one.
export function overlayScores(map, pendingOps, matchId) {
    const out = { ...map };
    for (const op of pendingOps) {
        if (op.type !== 'score' || op.matchId !== matchId) continue;
        const row = { ...(out[op.playerId] || {}) };
        if (op.strokes === null) delete row[op.hole];
        else row[op.hole] = op.strokes;
        out[op.playerId] = row;
    }
    return out;
}

// The unsent value for one column of a match, or undefined when there is none.
export function pendingMatchValue(pendingOps, matchId, column) {
    const op = pendingOps.find(o => o.type === 'match' && o.matchId === matchId && o.column === column);
    return op ? op.value : undefined;
}
