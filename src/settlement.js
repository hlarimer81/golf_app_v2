// =====================================================================================
// Wager / Money Settlement engine  (JS port of score_play's settlement.* + per-game
// compute_settlement implementations).
//
// A settlement result carries three layers, mirroring the firmware:
//   1. entities[]   — each team's or player's overall +/- for the round ($, signed).
//   2. lines[]      — labelled per-line breakdown ("Front 9 — A wins $5", "Skin 14"...).
//   3. txs[]        — the minimum set of "X pays Y $N" handoffs (min-transactions reduce).
//
// Wager shape (persisted to matches.wager JSONB):
//   {
//     per_point,       // $/scoring-point: Vegas / Stableford / Wolf / Chairman / 9-Point / Aggregate / Wolf Vegas / Singles
//     per_skin,        // $/skin: Skins (per-skin mode)
//     skins_ante,      // $/player ante: Skins (pot mode)
//     skins_pot,       // false = per-skin, true = pot split by skin count
//     nassau_front,    // $ stake on the Front-9 match
//     nassau_back,     // $ stake on the Back-9 match
//     nassau_overall,  // $ stake on the 18-hole Overall match
//     nassau_press,    // $ per press (0 = inherit parent's stake)
//   }
// =====================================================================================

export const EMPTY_WAGER = {
  per_point: 0,
  per_skin: 0,
  skins_ante: 0,
  skins_pot: false,
  nassau_front: 0,
  nassau_back: 0,
  nassau_overall: 0,
  nassau_press: 0,
};

export function wagerHasStake(w) {
  if (!w) return false;
  return (
    (w.per_point || 0) > 0 ||
    (w.per_skin || 0) > 0 ||
    (w.skins_ante || 0) > 0 ||
    (w.nassau_front || 0) > 0 ||
    (w.nassau_back || 0) > 0 ||
    (w.nassau_overall || 0) > 0
  );
}

// The single headline rate a game exposes as "the bet".
export function headlineRate(w, gameType) {
  if (!w) return 0;
  if (gameType === 'skins') return w.skins_pot ? w.skins_ante : w.per_skin;
  if (gameType === 'nassau') return w.nassau_overall;
  return w.per_point;
}

export function headlineUnit(gameType) {
  if (gameType === 'skins') return 'skin';
  if (gameType === 'nassau') return 'match';
  return 'pt';
}

// -------------------------------------------------------------------------------------
// Min-transactions reduction. Greedy "biggest debtor pays biggest creditor" until
// everyone is within a cent of zero. Produces at most entity_count - 1 transactions.
// entities: [{ idx, name, net }]  ->  returns [{ from, to, fromName, toName, amount }]
// -------------------------------------------------------------------------------------
export function reduceTransactions(entities) {
  const txs = [];
  if (!entities || entities.length <= 1) return txs;
  const bal = entities.map((e) => e.net);
  const EPS = 0.005;
  let guard = 0;
  while (guard++ < 64) {
    let debtor = -1, creditor = -1, worst = 0, best = 0;
    for (let i = 0; i < bal.length; i++) {
      if (bal[i] < worst) { worst = bal[i]; debtor = i; }
      if (bal[i] > best) { best = bal[i]; creditor = i; }
    }
    if (debtor < 0 || creditor < 0) break;
    const amt = Math.min(-worst, best);
    if (amt < EPS) break;
    txs.push({
      from: entities[debtor].idx,
      to: entities[creditor].idx,
      fromName: entities[debtor].name,
      toName: entities[creditor].name,
      amount: amt,
    });
    bal[debtor] += amt;
    bal[creditor] -= amt;
  }
  return txs;
}

// -------------------------------------------------------------------------------------
// Small helpers shared across games
// -------------------------------------------------------------------------------------
const firstName = (p) => (p.player_name || p.name || '').split(' ')[0] || '?';
const teamOf = (p) => p.teams?.team_name || p.team || p.team_name || 'Unknown';

function activeTeams(players) {
  return [...new Set(players.map(teamOf).filter((t) => t !== 'Unknown'))];
}

// Wrap up a per-player points map into a settlement (individual, per_point $/pt).
// Each player wins/loses per_point per point of difference vs the field average, i.e.
// pays per_point to each opponent for every point they beat them by. Simpler and
// standard: net = per_point * (n * myPts - totalPts).
function pointsSettlementIndividual(players, pointsById, perPoint, lineLabelFn) {
  const n = players.length;
  const total = players.reduce((s, p) => s + (pointsById[p.id] || 0), 0);
  const entities = players.map((p) => ({
    idx: p.id,
    name: firstName(p),
    net: perPoint * (n * (pointsById[p.id] || 0) - total),
  }));
  const lines = players.map((p) => ({
    label: lineLabelFn ? lineLabelFn(p) : firstName(p),
    winnerName: null,
    amount: entities.find((e) => e.idx === p.id).net,
    signed: true,
  }));
  return {
    isTeam: false,
    entities,
    lines,
    txs: reduceTransactions(entities),
  };
}

// Team points settlement (per_point). Team net = per_point * (nt*myPts - total).
function pointsSettlementTeam(teams, pointsByTeam, perPoint) {
  const nt = teams.length;
  const total = teams.reduce((s, t) => s + (pointsByTeam[t] || 0), 0);
  const entities = teams.map((t) => ({
    idx: t,
    name: t,
    net: perPoint * (nt * (pointsByTeam[t] || 0) - total),
  }));
  const lines = teams.map((t) => ({
    label: t,
    winnerName: null,
    amount: entities.find((e) => e.idx === t).net,
    signed: true,
  }));
  return { isTeam: true, entities, lines, txs: reduceTransactions(entities) };
}

// -------------------------------------------------------------------------------------
// Per-game settlement builders.
// Each takes ({ players, wager, ...gameData }) and returns a settlement object.
// gameData carries whatever the Grid already computed (points, skins, nassau state...).
// -------------------------------------------------------------------------------------

// SKINS — needs skinsById (playerId -> skins won) and, optionally, per-hole winners.
export function settleSkins({ players, wager, skinsById, holeWinners }) {
  const n = players.length;
  const empty = { isTeam: false, entities: [], lines: [], txs: [] };
  if (n <= 1) return empty;
  const totalSkins = players.reduce((s, p) => s + (skinsById[p.id] || 0), 0);
  if (totalSkins === 0) return empty;

  const entities = players.map((p) => ({ idx: p.id, name: firstName(p), net: 0 }));
  const netById = {};
  const lines = [];

  if (wager.skins_pot) {
    if ((wager.skins_ante || 0) <= 0) return empty;
    const pot = wager.skins_ante * n;
    const perSkin = pot / totalSkins;
    players.forEach((p) => {
      netById[p.id] = perSkin * (skinsById[p.id] || 0) - wager.skins_ante;
    });
    lines.push({ label: `Pot ${n} × $${wager.skins_ante.toFixed(2)}`, winnerName: null, amount: pot });
  } else {
    if ((wager.per_skin || 0) <= 0) return empty;
    players.forEach((p) => {
      netById[p.id] = wager.per_skin * (n * (skinsById[p.id] || 0) - totalSkins);
    });
    // Per-hole lines from holeWinners: [{ hole, winnerId, skins }]
    (holeWinners || []).forEach((hw) => {
      if (hw.winnerId == null) return;
      const winner = players.find((p) => p.id === hw.winnerId);
      lines.push({
        label: hw.skins > 1 ? `Hole ${hw.hole} (${hw.skins} skins)` : `Hole ${hw.hole}`,
        winnerName: winner ? firstName(winner) : '?',
        amount: wager.per_skin * (n - 1) * hw.skins,
      });
    });
  }

  entities.forEach((e) => { e.net = netById[e.idx] || 0; });
  return { isTeam: false, entities, lines, txs: reduceTransactions(entities) };
}

// NASSAU — needs matches: [{ label, winner: 'A'|'B'|null, stake }] plus teamNames [A,B].
export function settleNassau({ wager, teamNames, segments }) {
  const [tA, tB] = teamNames;
  const entities = [
    { idx: tA, name: tA, net: 0 },
    { idx: tB, name: tB, net: 0 },
  ];
  const lines = [];
  (segments || []).forEach((seg) => {
    const stake = seg.stake;
    if (!stake || stake <= 0) return;
    let winnerName = null;
    if (seg.winner === tA) {
      entities[0].net += stake; entities[1].net -= stake; winnerName = tA;
    } else if (seg.winner === tB) {
      entities[1].net += stake; entities[0].net -= stake; winnerName = tB;
    }
    lines.push({ label: seg.label, winnerName, amount: winnerName ? stake : 0 });
  });
  return { isTeam: true, entities, lines, txs: reduceTransactions(entities) };
}

// VEGAS / WOLF VEGAS / STABLEFORD / CHAIRMAN / 9-POINT / WOLF / SINGLES — per_point.
// pointsById is a map of playerId -> game points (may be signed for Vegas/Wolf Vegas).
export function settlePerPointIndividual({ players, wager, pointsById }) {
  if ((wager.per_point || 0) <= 0) return { isTeam: false, entities: [], lines: [], txs: [] };
  return pointsSettlementIndividual(players, pointsById, wager.per_point);
}

// Team per_point (e.g. 4-Ball / Aggregate / team Stableford / Vegas team).
export function settlePerPointTeam({ players, wager, pointsByTeam }) {
  if ((wager.per_point || 0) <= 0) return { isTeam: true, entities: [], lines: [], txs: [] };
  const teams = Object.keys(pointsByTeam);
  return pointsSettlementTeam(teams, pointsByTeam, wager.per_point);
}

export { firstName as settlementFirstName, teamOf as settlementTeamOf, activeTeams as settlementActiveTeams };
