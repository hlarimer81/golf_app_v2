import { describe, it, expect } from 'vitest';
import {
  reduceTransactions,
  settleSkins,
  settleNassau,
  settlePerPointIndividual,
  settlePerPointTeam,
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
