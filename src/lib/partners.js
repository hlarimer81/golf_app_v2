//==================================================================================================
// Who you play with, derived from banked round_differential rows.
//
// Pure functions over an array of { canonical_name, match_id }. No React, no network — same shape
// as playerStats.js, and for the same reason: this decides what the round-setup screen offers first,
// and the cheap way to keep it honest is to be able to run it against real rows.
//
// round_differential is the right source, not matches. delete_old_matches() destroys matches,
// scores and players after 30 days; differentials survive. Ranking from matches would quietly
// forget a regular foursome over a winter, which is exactly the group the picker should know best.
//
// There is no signed-in user, so "who you play with" has no anchor to start from. It gets one as
// soon as the first player is chosen: pick yourself, and the remaining slots rank by who actually
// shows up in your rounds.
//==================================================================================================

//--------------------------------------------------------------------------------------------------
// How many distinct rounds each name appears in.
//
// Counted by distinct match_id rather than by row: a player has one differential per round, but
// guarding against duplicates costs nothing and a double-counted round would quietly promote
// someone up the list.
//--------------------------------------------------------------------------------------------------
export function roundCounts(rows) {
  const seen = new Map(); // name -> Set(match_id)
  for (const r of rows ?? []) {
    if (!r?.canonical_name || !r?.match_id) continue;
    if (!seen.has(r.canonical_name)) seen.set(r.canonical_name, new Set());
    seen.get(r.canonical_name).add(r.match_id);
  }
  return new Map([...seen].map(([name, matches]) => [name, matches.size]));
}

//--------------------------------------------------------------------------------------------------
// How often each pair of names appears in the same round.
//
// Returns name -> Map(partner -> rounds together). Symmetric: A with B is the same fact as B with A,
// so both directions are recorded and callers never have to order their lookup.
//--------------------------------------------------------------------------------------------------
export function partnerCounts(rows) {
  const byMatch = new Map(); // match_id -> Set(name)
  for (const r of rows ?? []) {
    if (!r?.canonical_name || !r?.match_id) continue;
    if (!byMatch.has(r.match_id)) byMatch.set(r.match_id, new Set());
    byMatch.get(r.match_id).add(r.canonical_name);
  }

  const pairs = new Map();
  const bump = (a, b) => {
    if (!pairs.has(a)) pairs.set(a, new Map());
    const inner = pairs.get(a);
    inner.set(b, (inner.get(b) ?? 0) + 1);
  };

  for (const names of byMatch.values()) {
    const list = [...names];
    for (let i = 0; i < list.length; i++) {
      for (let j = i + 1; j < list.length; j++) {
        bump(list[i], list[j]);
        bump(list[j], list[i]);
      }
    }
  }
  return pairs;
}

//--------------------------------------------------------------------------------------------------
// The roster, ordered for the picker.
//
//   roster   [{ id, player_name, handicap }]  — every known player
//   rows     round_differential rows
//   chosen   names already used by other slots in this round
//   search   free text; when present it filters and takes over the ordering
//
// Ordering, in priority order:
//   1. with nobody chosen yet — most rounds played, so the regulars are on top
//   2. with someone chosen   — most rounds played *with those people*, then overall rounds
//   3. searching             — names that start with the query first, then contains, then rounds
//
// A player with no banked rounds still appears, ranked last. Someone added for the first time last
// week has no history by definition, and dropping them from the list would make them unfindable.
//--------------------------------------------------------------------------------------------------
export function rankRoster({ roster = [], rows = [], chosen = [], search = '' } = {}) {
  const counts = roundCounts(rows);
  const pairs = partnerCounts(rows);
  const taken = new Set(chosen.filter(Boolean));
  const q = search.trim().toLowerCase();

  const withChosen = (name) => {
    let total = 0;
    for (const other of taken) total += pairs.get(name)?.get(other) ?? 0;
    return total;
  };

  return roster
    .filter((p) => p?.player_name && !taken.has(p.player_name))
    .map((p) => {
      const name = p.player_name;
      const lower = name.toLowerCase();
      return {
        id: p.id,
        name,
        handicap: p.handicap,
        rounds: counts.get(name) ?? 0,
        together: withChosen(name),
        startsWith: q ? lower.startsWith(q) : false,
        matches: q ? lower.includes(q) : true,
      };
    })
    .filter((p) => p.matches)
    .sort((a, b) => {
      if (q && a.startsWith !== b.startsWith) return a.startsWith ? -1 : 1;
      if (!q && a.together !== b.together) return b.together - a.together;
      if (a.rounds !== b.rounds) return b.rounds - a.rounds;
      return a.name.localeCompare(b.name);
    });
}

//--------------------------------------------------------------------------------------------------
// The short line under a name in the picker. Says why this player is where they are in the list,
// because an order nobody can explain reads as random.
//--------------------------------------------------------------------------------------------------
export function rankReason(entry, chosenCount) {
  if (!entry) return '';
  if (chosenCount > 0 && entry.together > 0) {
    return entry.together === 1 ? '1 round together' : `${entry.together} rounds together`;
  }
  if (entry.rounds === 0) return 'no rounds yet';
  return entry.rounds === 1 ? '1 round' : `${entry.rounds} rounds`;
}
