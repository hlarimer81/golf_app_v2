//==================================================================================================
// Who you play with, derived from banked round_differential rows.
//
// Pure functions over an array of { canonical_name, match_id, played_on }. No React, no network —
// same shape as playerStats.js, and for the same reason: this decides what the round-setup screen
// offers first, and the cheap way to keep it honest is to be able to run it against real rows.
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
// Recent rounds count for more than old ones.
//
// Without this, ten rounds with a group you stopped playing with two years ago outrank three with
// the people you played last month — the picker keeps offering your old foursome forever. An
// exponential half-life fades that history instead of cutting it off at some arbitrary cliff: at
// 365 days a round counts half, at two years a quarter, and it never quite reaches zero.
//
// Retune HALF_LIFE_DAYS if the order feels wrong against real data. Shorter forgets faster.
//--------------------------------------------------------------------------------------------------
export const HALF_LIFE_DAYS = 365;

const DAY_MS = 86400000;

export function decay(playedOn, now = new Date(), halfLifeDays = HALF_LIFE_DAYS) {
  // An undated row counts at full weight. Dropping it would make a round disappear because of a
  // missing column, and a round that happened is evidence whatever the metadata says.
  if (!playedOn) return 1;
  const then = new Date(playedOn);
  if (Number.isNaN(then.getTime())) return 1;

  const days = (now - then) / DAY_MS;
  if (!Number.isFinite(days) || days <= 0) return 1;
  return Math.pow(0.5, days / halfLifeDays);
}

// played_on is a date, not a timestamp. Parsing it through Date and formatting it back can shift it
// a day either way depending on the viewer's timezone, so read the string directly.
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export function monthYear(playedOn) {
  if (!playedOn || typeof playedOn !== 'string') return null;
  const [y, m] = playedOn.split('-');
  const month = MONTHS[Number(m) - 1];
  if (!month || !y) return null;
  return `${month} ${y}`;
}

//--------------------------------------------------------------------------------------------------
// Per player: how many rounds, how much they weigh after decay, and when they last played.
//
// Counted by distinct match_id rather than by row: a player has one differential per round, but
// guarding against duplicates costs nothing and a double-counted round would quietly promote
// someone up the list.
//--------------------------------------------------------------------------------------------------
export function roundSummary(rows, now = new Date()) {
  const byName = new Map(); // name -> Map(match_id -> played_on)

  for (const r of rows ?? []) {
    if (!r?.canonical_name || !r?.match_id) continue;
    if (!byName.has(r.canonical_name)) byName.set(r.canonical_name, new Map());
    byName.get(r.canonical_name).set(r.match_id, r.played_on ?? null);
  }

  const out = new Map();
  for (const [name, matches] of byName) {
    let weight = 0;
    let last = null;
    for (const playedOn of matches.values()) {
      weight += decay(playedOn, now);
      if (playedOn && (!last || playedOn > last)) last = playedOn;
    }
    out.set(name, { rounds: matches.size, weight, last });
  }
  return out;
}

//--------------------------------------------------------------------------------------------------
// Per pair: the same three numbers for every two people who have shared a round.
//
// Returns name -> Map(partner -> { rounds, weight, last }). Symmetric, so callers never have to
// order their lookup.
//--------------------------------------------------------------------------------------------------
export function partnerSummary(rows, now = new Date()) {
  const byMatch = new Map(); // match_id -> { names:Set, played_on }

  for (const r of rows ?? []) {
    if (!r?.canonical_name || !r?.match_id) continue;
    if (!byMatch.has(r.match_id)) byMatch.set(r.match_id, { names: new Set(), played_on: r.played_on ?? null });
    byMatch.get(r.match_id).names.add(r.canonical_name);
  }

  const pairs = new Map();
  const bump = (a, b, playedOn) => {
    if (!pairs.has(a)) pairs.set(a, new Map());
    const inner = pairs.get(a);
    const cur = inner.get(b) ?? { rounds: 0, weight: 0, last: null };
    cur.rounds += 1;
    cur.weight += decay(playedOn, now);
    if (playedOn && (!cur.last || playedOn > cur.last)) cur.last = playedOn;
    inner.set(b, cur);
  };

  for (const { names, played_on: playedOn } of byMatch.values()) {
    const list = [...names];
    for (let i = 0; i < list.length; i++) {
      for (let j = i + 1; j < list.length; j++) {
        bump(list[i], list[j], playedOn);
        bump(list[j], list[i], playedOn);
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
//   now      injected so the ordering is testable and does not drift with the calendar
//
// Ordering, in priority order:
//   1. with nobody chosen yet — decayed rounds played, so current regulars are on top
//   2. with someone chosen   — decayed rounds played *with those people*, then overall
//   3. searching             — names that start with the query first, then contains, then weight
//
// A player with no banked rounds still appears, ranked last. Someone added for the first time last
// week has no history by definition, and dropping them from the list would make them unfindable.
//--------------------------------------------------------------------------------------------------
export function rankRoster({ roster = [], rows = [], chosen = [], search = '', now = new Date() } = {}) {
  const summary = roundSummary(rows, now);
  const pairs = partnerSummary(rows, now);
  const taken = new Set(chosen.filter(Boolean));
  const q = search.trim().toLowerCase();

  const withChosen = (name) => {
    let rounds = 0;
    let weight = 0;
    let last = null;
    for (const other of taken) {
      const pair = pairs.get(name)?.get(other);
      if (!pair) continue;
      rounds += pair.rounds;
      weight += pair.weight;
      if (pair.last && (!last || pair.last > last)) last = pair.last;
    }
    return { rounds, weight, last };
  };

  return roster
    .filter((p) => p?.player_name && !taken.has(p.player_name))
    .map((p) => {
      const name = p.player_name;
      const lower = name.toLowerCase();
      const mine = summary.get(name) ?? { rounds: 0, weight: 0, last: null };
      const shared = withChosen(name);
      return {
        id: p.id,
        name,
        handicap: p.handicap,
        rounds: mine.rounds,
        weight: mine.weight,
        lastPlayed: mine.last,
        together: shared.rounds,
        togetherWeight: shared.weight,
        lastTogether: shared.last,
        startsWith: q ? lower.startsWith(q) : false,
        matches: q ? lower.includes(q) : true,
      };
    })
    .filter((p) => p.matches)
    .sort((a, b) => {
      if (q && a.startsWith !== b.startsWith) return a.startsWith ? -1 : 1;
      if (!q && a.togetherWeight !== b.togetherWeight) return b.togetherWeight - a.togetherWeight;
      if (a.weight !== b.weight) return b.weight - a.weight;
      return a.name.localeCompare(b.name);
    });
}

//--------------------------------------------------------------------------------------------------
// The short line under a name in the picker.
//
// Shows the true round count, not the decayed weight — a decimal nobody asked for explains nothing.
// The "last played" half is what makes the order legible: five recent rounds sitting above twelve
// old ones looks broken until the dates are on screen.
//--------------------------------------------------------------------------------------------------
export function rankReason(entry, chosenCount) {
  if (!entry) return '';

  if (chosenCount > 0 && entry.together > 0) {
    const base = entry.together === 1 ? '1 round together' : `${entry.together} rounds together`;
    const when = monthYear(entry.lastTogether);
    return when ? `${base} · last ${when}` : base;
  }

  if (entry.rounds === 0) return 'no rounds yet';

  const base = entry.rounds === 1 ? '1 round' : `${entry.rounds} rounds`;
  const when = monthYear(entry.lastPlayed);
  return when ? `${base} · last ${when}` : base;
}
