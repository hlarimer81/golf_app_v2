import { describe, it, expect } from 'vitest';
import {
  reduceTransactions,
  settleSkins,
  settleNassau,
  settlePerPointIndividual,
  settlePerPointTeam,
  settleZeroSumPoints,
  settleVegas,
  settleTeamPoints,
  wagerHasStake,
  headlineRate,
  EMPTY_WAGER,
} from './settlement';

const players = [
  { id: 'p1', player_name: 'Sam Scratch' },
  { id: 'p2', player_name: 'Lou Lowman' },
  { id: 'p3', player_name: 'Mia Middleton' },
  { id: 'p4', player_name: 'Hank Hozel' },
];

const sum = (xs) => xs.reduce((a, b) => a + b, 0);
const netTotal = (s) => sum(s.entities.map((e) => e.net));

describe('reduceTransactions', () => {
  it('produces nothing when there is nobody to pay', () => {
    expect(reduceTransactions([])).toEqual([]);
    expect(reduceTransactions([{ idx: 'p1', name: 'Sam', net: 5 }])).toEqual([]);
  });

  it('produces nothing when everyone is square', () => {
    const txs = reduceTransactions(players.map((p) => ({ idx: p.id, name: p.player_name, net: 0 })));
    expect(txs).toEqual([]);
  });

  it('moves exactly the money that is owed', () => {
    const entities = [
      { idx: 'p1', name: 'Sam', net: 15 },
      { idx: 'p2', name: 'Lou', net: -5 },
      { idx: 'p3', name: 'Mia', net: -10 },
    ];
    const txs = reduceTransactions(entities);
    expect(sum(txs.map((t) => t.amount))).toBeCloseTo(15, 5);
    // Everyone ends square once the transactions are applied.
    const after = Object.fromEntries(entities.map((e) => [e.idx, e.net]));
    txs.forEach((t) => { after[t.from] += t.amount; after[t.to] -= t.amount; });
    Object.values(after).forEach((v) => expect(v).toBeCloseTo(0, 5));
  });

  it('never needs more than one transaction fewer than there are people', () => {
    const entities = [
      { idx: 'p1', name: 'Sam', net: 30 },
      { idx: 'p2', name: 'Lou', net: -10 },
      { idx: 'p3', name: 'Mia', net: -10 },
      { idx: 'p4', name: 'Hank', net: -10 },
    ];
    expect(reduceTransactions(entities).length).toBeLessThanOrEqual(entities.length - 1);
  });

  it('pays the biggest creditor from the biggest debtor first', () => {
    const txs = reduceTransactions([
      { idx: 'p1', name: 'Sam', net: 20 },
      { idx: 'p2', name: 'Lou', net: -20 },
      { idx: 'p3', name: 'Mia', net: 5 },
      { idx: 'p4', name: 'Hank', net: -5 },
    ]);
    expect(txs[0]).toMatchObject({ from: 'p2', to: 'p1', amount: 20 });
  });
});

describe('settlePerPointIndividual', () => {
  const wager = { ...EMPTY_WAGER, per_point: 1 };

  it('pays nothing when no stake was set', () => {
    const s = settlePerPointIndividual({ players, wager: EMPTY_WAGER, pointsById: { p1: 10 } });
    expect(s.entities).toEqual([]);
    expect(s.txs).toEqual([]);
  });

  it('is a zero-sum game — money only moves between players', () => {
    const s = settlePerPointIndividual({
      players,
      wager,
      pointsById: { p1: 30, p2: 24, p3: 22, p4: 20 },
    });
    expect(netTotal(s)).toBeCloseTo(0, 5);
  });

  it('pays the difference against every opponent', () => {
    // Sam beats each of the other three by 2 points at $1/point: +$6. Each of them is -$2.
    const s = settlePerPointIndividual({
      players,
      wager,
      pointsById: { p1: 22, p2: 20, p3: 20, p4: 20 },
    });
    const net = Object.fromEntries(s.entities.map((e) => [e.idx, e.net]));
    expect(net.p1).toBe(6);
    expect(net.p2).toBe(-2);
    expect(net.p3).toBe(-2);
    expect(net.p4).toBe(-2);
  });

  it('leaves everyone square when nobody is ahead', () => {
    const s = settlePerPointIndividual({
      players,
      wager,
      pointsById: { p1: 20, p2: 20, p3: 20, p4: 20 },
    });
    s.entities.forEach((e) => expect(e.net).toBe(0));
    expect(s.txs).toEqual([]);
  });

  it('treats a missing score as zero points rather than crashing', () => {
    const s = settlePerPointIndividual({ players, wager, pointsById: { p1: 4 } });
    expect(netTotal(s)).toBeCloseTo(0, 5);
    const net = Object.fromEntries(s.entities.map((e) => [e.idx, e.net]));
    expect(net.p1).toBe(12); // 1 * (4*4 - 4)
  });
});

describe('settlePerPointTeam', () => {
  it('settles between teams and stays zero-sum', () => {
    const s = settlePerPointTeam({
      players,
      wager: { ...EMPTY_WAGER, per_point: 2 },
      pointsByTeam: { 'Team A': 12, 'Team B': 8 },
    });
    const net = Object.fromEntries(s.entities.map((e) => [e.idx, e.net]));
    expect(net['Team A']).toBe(8);  // 2 * (2*12 - 20)
    expect(net['Team B']).toBe(-8);
    expect(s.isTeam).toBe(true);
    expect(netTotal(s)).toBeCloseTo(0, 5);
  });
});

describe('settleSkins', () => {
  it('pays nothing when no skins were won', () => {
    const s = settleSkins({
      players,
      wager: { ...EMPTY_WAGER, per_skin: 5 },
      skinsById: { p1: 0, p2: 0, p3: 0, p4: 0 },
    });
    expect(s.entities).toEqual([]);
  });

  it('pays nothing when the stake is zero', () => {
    const s = settleSkins({ players, wager: EMPTY_WAGER, skinsById: { p1: 3 } });
    expect(s.entities).toEqual([]);
  });

  describe('per-skin mode', () => {
    const wager = { ...EMPTY_WAGER, per_skin: 5 };

    it('collects the stake from every other player for each skin', () => {
      // Sam wins the only skin: the other three pay $5 each.
      const s = settleSkins({ players, wager, skinsById: { p1: 1, p2: 0, p3: 0, p4: 0 } });
      const net = Object.fromEntries(s.entities.map((e) => [e.idx, e.net]));
      expect(net.p1).toBe(15);
      expect(net.p2).toBe(-5);
      expect(netTotal(s)).toBeCloseTo(0, 5);
    });

    it('stays zero-sum when skins are split', () => {
      const s = settleSkins({ players, wager, skinsById: { p1: 3, p2: 2, p3: 1, p4: 0 } });
      expect(netTotal(s)).toBeCloseTo(0, 5);
    });

    it('labels a carried hole with the number of skins riding on it', () => {
      const s = settleSkins({
        players,
        wager,
        skinsById: { p1: 2 },
        holeWinners: [{ hole: 14, winnerId: 'p1', skins: 2 }],
      });
      expect(s.lines[0].label).toBe('Hole 14 (2 skins)');
      expect(s.lines[0].amount).toBe(30); // $5 x 3 opponents x 2 skins
    });
  });

  describe('pot mode', () => {
    const wager = { ...EMPTY_WAGER, skins_pot: true, skins_ante: 10 };

    it('splits the pot by skins won, net of each player\'s ante', () => {
      // $40 pot, 4 skins -> $10 a skin. Sam won 2: +$20 - $10 ante = +$10.
      const s = settleSkins({ players, wager, skinsById: { p1: 2, p2: 1, p3: 1, p4: 0 } });
      const net = Object.fromEntries(s.entities.map((e) => [e.idx, e.net]));
      expect(net.p1).toBe(10);
      expect(net.p2).toBe(0);
      expect(net.p4).toBe(-10);
      expect(netTotal(s)).toBeCloseTo(0, 5);
    });

    it('gives the whole pot to a player who wins every skin', () => {
      const s = settleSkins({ players, wager, skinsById: { p1: 3, p2: 0, p3: 0, p4: 0 } });
      const net = Object.fromEntries(s.entities.map((e) => [e.idx, e.net]));
      expect(net.p1).toBe(30); // $40 pot less their own $10 ante
    });
  });
});

describe('settleNassau', () => {
  const teamNames = ['Team A', 'Team B'];

  it('moves the stake from loser to winner on each decided segment', () => {
    const s = settleNassau({
      wager: EMPTY_WAGER,
      teamNames,
      segments: [
        { label: 'Front 9', winner: 'Team A', stake: 5 },
        { label: 'Back 9', winner: 'Team B', stake: 5 },
        { label: 'Overall', winner: 'Team A', stake: 10 },
      ],
    });
    const net = Object.fromEntries(s.entities.map((e) => [e.idx, e.net]));
    expect(net['Team A']).toBe(10); // +5 -5 +10
    expect(net['Team B']).toBe(-10);
    expect(netTotal(s)).toBeCloseTo(0, 5);
  });

  it('pays nothing on a halved segment but still records the line', () => {
    const s = settleNassau({
      wager: EMPTY_WAGER,
      teamNames,
      segments: [{ label: 'Front 9', winner: null, stake: 5 }],
    });
    expect(netTotal(s)).toBe(0);
    expect(s.lines[0]).toMatchObject({ label: 'Front 9', winnerName: null, amount: 0 });
  });

  it('ignores segments with no stake on them', () => {
    const s = settleNassau({
      wager: EMPTY_WAGER,
      teamNames,
      segments: [{ label: 'Front 9', winner: 'Team A', stake: 0 }],
    });
    expect(s.lines).toEqual([]);
    expect(netTotal(s)).toBe(0);
  });
});

describe('wager helpers', () => {
  it('knows when there is money on the round', () => {
    expect(wagerHasStake(null)).toBe(false);
    expect(wagerHasStake(EMPTY_WAGER)).toBe(false);
    expect(wagerHasStake({ ...EMPTY_WAGER, per_point: 1 })).toBe(true);
    expect(wagerHasStake({ ...EMPTY_WAGER, nassau_overall: 10 })).toBe(true);
  });

  it('does not count a press stake on its own as a wager', () => {
    // A press inherits its parent's stake, so a press rate with no primary stake bets nothing.
    expect(wagerHasStake({ ...EMPTY_WAGER, nassau_press: 5 })).toBe(false);
  });

  it('reports the headline rate each game actually bets in', () => {
    expect(headlineRate({ ...EMPTY_WAGER, per_skin: 5 }, 'skins')).toBe(5);
    expect(headlineRate({ ...EMPTY_WAGER, skins_pot: true, skins_ante: 10 }, 'skins')).toBe(10);
    expect(headlineRate({ ...EMPTY_WAGER, nassau_overall: 20 }, 'nassau')).toBe(20);
    expect(headlineRate({ ...EMPTY_WAGER, per_point: 2 }, 'stableford')).toBe(2);
  });
});

describe('settleZeroSumPoints (Wolf Vegas)', () => {
  // The five-player Wolf Vegas round at Ames G&CC on 2026-11-08, at $1 a point. The other app's
  // sheet: Mindy pays Grundy $150, Ryan pays H $40, Mindy pays H $15.
  const ames = [
    { id: 'grundy', player_name: 'Grundy' },
    { id: 'h', player_name: 'H' },
    { id: 'roger', player_name: 'Roger' },
    { id: 'ryan', player_name: 'Ryan B' },
    { id: 'mindy', player_name: 'Mindy B' },
  ];
  const points = { grundy: 150, h: 55, roger: 0, ryan: -40, mindy: -165 };

  it('pays the points at the rate, not once per opponent', () => {
    const s = settleZeroSumPoints({ players: ames, wager: { ...EMPTY_WAGER, per_point: 1 }, pointsById: points });
    const net = Object.fromEntries(s.entities.map((e) => [e.idx, e.net]));
    expect(net).toEqual({ grundy: 150, h: 55, roger: 0, ryan: -40, mindy: -165 });
    expect(netTotal(s)).toBeCloseTo(0, 5);
  });

  it('settles in the fewest payments, as the sheet did', () => {
    const s = settleZeroSumPoints({ players: ames, wager: { ...EMPTY_WAGER, per_point: 1 }, pointsById: points });
    expect(s.txs.map(({ from, to, amount }) => ({ from, to, amount }))).toEqual([
      { from: 'mindy', to: 'grundy', amount: 150 },
      { from: 'ryan', to: 'h', amount: 40 },
      { from: 'mindy', to: 'h', amount: 15 },
    ]);
  });

  it('scales with the rate', () => {
    const s = settleZeroSumPoints({ players: ames, wager: { ...EMPTY_WAGER, per_point: 0.25 }, pointsById: points });
    expect(s.entities.find((e) => e.idx === 'mindy').net).toBe(-41.25);
  });

  it('pays nothing when no stake was set', () => {
    const s = settleZeroSumPoints({ players: ames, wager: EMPTY_WAGER, pointsById: points });
    expect(s.entities).toEqual([]);
    expect(s.txs).toEqual([]);
  });
});

describe('settleVegas', () => {
  const [sam, lou, mia, hank] = players;
  const teams = (aPts, bPts, aPlayers = [sam, lou], bPlayers = [mia, hank]) => [
    { name: 'A', points: aPts, players: aPlayers },
    { name: 'B', points: bPts, players: bPlayers },
  ];
  const netOf = (s) => Object.fromEntries(s.entities.map((e) => [e.idx, e.net]));

  it('pays every player the gap: 60 to 40 at $1 is $20 each', () => {
    const s = settleVegas({ wager: { ...EMPTY_WAGER, per_point: 1 }, teams: teams(60, 40) });
    expect(netOf(s)).toEqual({ p1: 20, p2: 20, p3: -20, p4: -20 });
    expect(s.txs).toHaveLength(2);
    expect(s.txs.every((t) => t.amount === 20)).toBe(true);
  });

  it('works whichever team is ahead, at any rate', () => {
    const s = settleVegas({ wager: { ...EMPTY_WAGER, per_point: 0.5 }, teams: teams(31, 45) });
    expect(netOf(s)).toEqual({ p1: -7, p2: -7, p3: 7, p4: 7 });
  });

  it('leaves everyone square on a tie', () => {
    const s = settleVegas({ wager: { ...EMPTY_WAGER, per_point: 1 }, teams: teams(50, 50) });
    s.entities.forEach((e) => expect(e.net).toBe(0));
    expect(s.txs).toEqual([]);
  });

  it('splits what the losers pay among the winners when teams are uneven', () => {
    const s = settleVegas({ wager: { ...EMPTY_WAGER, per_point: 1 }, teams: teams(20, 10, [sam], [lou, mia]) });
    expect(netOf(s)).toEqual({ p1: 20, p2: -10, p3: -10 });
    expect(netTotal(s)).toBeCloseTo(0, 5);
  });

  it('pays nothing when no stake was set', () => {
    const s = settleVegas({ wager: EMPTY_WAGER, teams: teams(60, 40) });
    expect(s.entities).toEqual([]);
  });
});

describe('settleTeamPoints (Chairman, team Stableford)', () => {
  const [sam, lou, mia, hank] = players;
  const netOf = (s) => Object.fromEntries(s.entities.map((e) => [e.idx, e.net]));
  const wager = { ...EMPTY_WAGER, per_point: 1 };

  it('settles two teams like Vegas: every player pays the gap', () => {
    const s = settleTeamPoints({ wager, teams: [
      { name: 'A', points: 9, players: [sam, lou] },
      { name: 'B', points: 4, players: [mia, hank] },
    ] });
    expect(netOf(s)).toEqual({ p1: 5, p2: 5, p3: -5, p4: -5 });
  });

  it('settles every pair of teams when there are more than two', () => {
    // A 10, B 6, C 4. A-B: 4, A-C: 6, B-C: 2.
    const s = settleTeamPoints({ wager, teams: [
      { name: 'A', points: 10, players: [sam] },
      { name: 'B', points: 6, players: [lou] },
      { name: 'C', points: 4, players: [mia, hank] },
    ] });
    // C's two players each pay A 6 and B 2: A gets 12 from C, B gets 4.
    expect(netOf(s)).toEqual({ p1: 4 + 12, p2: -4 + 4, p3: -8, p4: -8 });
    expect(netTotal(s)).toBeCloseTo(0, 5);
  });

  it('with teams of one, pays the same as the individual settlement', () => {
    const pointsById = { p1: 30, p2: 24, p3: 22, p4: 20 };
    const team = settleTeamPoints({ wager, teams: players.map((p) => ({ name: p.id, points: pointsById[p.id], players: [p] })) });
    const solo = settlePerPointIndividual({ players, wager, pointsById });
    expect(netOf(team)).toEqual(netOf(solo));
  });

  it('pays nothing with no stake or fewer than two teams', () => {
    expect(settleTeamPoints({ wager: EMPTY_WAGER, teams: [
      { name: 'A', points: 9, players: [sam] }, { name: 'B', points: 4, players: [lou] },
    ] }).entities).toEqual([]);
    expect(settleTeamPoints({ wager, teams: [{ name: 'A', points: 9, players: [sam] }] }).entities).toEqual([]);
  });
});
