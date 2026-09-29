import { supabase } from '../supabaseClient';

//==================================================================================================
// Which player a signed-in account is. See sql/auth-claim-player.sql for the rules.
//
// Claims are written only through golf_claim_player(), which decides on the server whether a claim
// is confirmed or waits for approval. The client never writes the status itself.
//==================================================================================================

// Every claim, all accounts. The table is small, and the claim screen needs the other accounts'
// claims to warn before someone claims a name that is already held.
export async function fetchClaims() {
    const { data, error } = await supabase
        .from('player_account')
        .select('account_id, canonical_name, status');
    if (error || !data) return [];
    return data;
}

// Returns { status: 'confirmed' | 'pending' } or { error: message }.
export async function claimPlayer(canonicalName) {
    const { data, error } = await supabase.rpc('golf_claim_player', { p_name: canonicalName });
    if (error) return { error: error.message };
    if (data !== 'confirmed' && data !== 'pending') return { error: 'The claim was not saved. Try again.' };
    return { status: data };
}

// Returns an error message, or null on success. A DELETE refused by RLS answers 200 with no rows,
// so an empty result is a failure, not a success.
export async function unclaimPlayer(accountId) {
    const { data, error } = await supabase
        .from('player_account')
        .delete()
        .eq('account_id', accountId)
        .select('account_id');
    if (error) return error.message;
    if (!data || data.length === 0) return 'The link was not removed. Try again.';
    return null;
}

// The names a golfer can claim: the same people the player directory lists. Rows with no index and
// no combined rounds are scramble teams and placeholders, not people - see PlayerDirectory.jsx.
export function claimableNames(handicapEntries) {
    return handicapEntries
        .filter(e => e.handicap_index != null || e.rounds_available > 0)
        .map(e => e.canonical_name)
        .sort((a, b) => a.localeCompare(b));
}

// True when another account already holds a confirmed claim on this name, so claiming it now would
// wait for approval. Mirrors the test inside golf_claim_player(); the server's answer is the one
// that counts, this only lets the screen say so before the golfer taps.
export function heldByAnother(claims, canonicalName, accountId) {
    return claims.some(c =>
        c.canonical_name === canonicalName && c.status === 'confirmed' && c.account_id !== accountId);
}
