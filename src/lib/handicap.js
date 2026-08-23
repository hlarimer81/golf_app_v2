import { supabase } from '../supabaseClient';

//==================================================================================================
// Handicap data layer.
//
// The durable record is round_differential, banked one row per player per round by
// golf_bank_round(). It carries no foreign key to matches, so delete_old_matches() - which drops
// everything older than 30 days - cannot take handicap history with it. Nothing here recomputes an
// index from raw rounds; that would make every handicap in the app shift silently as rounds aged
// out. See sql/handicap-system.sql.
//==================================================================================================

//--------------------------------------------------------------------------------------------------
// Mark a round complete and bank a differential for every player in it.
//
// Called when Finish Round is pressed. Idempotent end to end: the status write is a no-op if it is
// already completed, and banking is ON CONFLICT DO NOTHING, so pressing Finish twice cannot
// double-count a round.
//
// Returns { banked, error }. Never throws - finishing a round must still show the summary even if
// the handicap side fails, because the player is standing on the 18th green and the scores are
// already saved. The caller decides whether to surface it.
//--------------------------------------------------------------------------------------------------
export async function finishRound(matchId) {
    if (!matchId) return { banked: 0, error: 'no match id' };

    // .select() so a policy-blocked UPDATE is visible. A PATCH refused by RLS matches zero rows and
    // returns 200 with no error - this app has already lost writes to exactly that twice.
    const { data: updated, error: statusError } = await supabase
        .from('matches')
        .update({ status: 'completed' })
        .eq('id', matchId)
        .select('id');

    if (statusError) return { banked: 0, error: statusError.message };
    if (!updated?.length) return { banked: 0, error: 'round could not be marked complete (0 rows)' };

    const { data: banked, error: bankError } = await supabase
        .rpc('golf_bank_round', { p_match_id: matchId });

    if (bankError) return { banked: 0, error: bankError.message };

    // 0 is not an error: a round already banked, or one where nobody completed 18 holes, both
    // legitimately bank nothing.
    return { banked: banked ?? 0, error: null };
}

//--------------------------------------------------------------------------------------------------
// Current index for everyone who has any banked round, keyed by canonical name.
//
// handicap_index is null for players with fewer than three rounds. That is a real answer and must
// be shown as "not enough rounds" rather than coerced to 0, which would hand a 20-handicap a
// scratch card.
//--------------------------------------------------------------------------------------------------
export async function fetchHandicapIndexes() {
    const { data, error } = await supabase
        .from('handicap_summary')
        .select('canonical_name, handicap_index, rounds_used, rounds_available, estimated_count, method');

    if (error || !data) return {};

    return Object.fromEntries(data.map(r => [r.canonical_name, r]));
}

//--------------------------------------------------------------------------------------------------
// Course Handicap = Index x (Slope / 113) + (Course Rating - Par).
//
// Computed here rather than by RPC because the round-setup screen calls it once per player on every
// tee change, and a round trip per keystroke is not worth it. golf_course_handicap() in
// sql/handicap-system.sql is the same formula WITHOUT the parRelative branch below; it is granted
// to clients but has no caller, so the divergence is currently harmless. Give it the same branch
// before using it for anything.
//
// With no slope or rating this degrades to the index itself, which is the correct neutral: the
// course is assumed to be of standard difficulty because nothing says otherwise.
//
// parRelative EXISTS BECAUSE MOST OF THIS DATABASE'S INDEXES ARE NOT WHS INDEXES.
//
// The (Rating - Par) term converts an index expressed relative to COURSE RATING into strokes
// relative to PAR. An 'estimated' differential is (adjusted gross - par) with slope assumed 113,
// so an index containing any of them is ALREADY relative to par and the term subtracts a second
// time. At Okoboji View (rating 67.2, par 71) that double-subtraction handed every player about
// four strokes fewer than they play to. Pass parRelative when estimated_count > 0; the slope
// scaling still applies, because that part is a difficulty ratio and is valid either way.
//--------------------------------------------------------------------------------------------------
export function courseHandicap(index, { slope, rating, par, parRelative = false } = {}) {
    if (index == null) return null;
    const s = slope || 113;
    const adjustment = (!parRelative && rating != null && par != null) ? (rating - par) : 0;
    return Math.round(index * (s / 113) + adjustment);
}

//--------------------------------------------------------------------------------------------------
// How to describe an index to a player, given how it was derived.
//
// An index built mostly from rounds with no course rating is not a WHS index and should not be
// presented as one. ~90% of this database's history has no rating or slope, so this is the normal
// case, not a footnote.
//--------------------------------------------------------------------------------------------------
export function describeIndex(entry) {
    if (!entry || entry.handicap_index == null) {
        const n = entry?.rounds_available ?? 0;
        return { value: null, label: `Not enough rounds (${n} of 3)`, estimated: false };
    }
    const estimated = entry.estimated_count > 0;
    return {
        value: entry.handicap_index,
        estimated,
        label: estimated
            ? `${entry.handicap_index} (estimated - ${entry.estimated_count} of ${entry.rounds_available} rounds lack course rating)`
            : `${entry.handicap_index} (WHS, ${entry.rounds_available} rounds)`,
    };
}
