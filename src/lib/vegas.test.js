import { describe, it, expect } from 'vitest';
import { netScore, vegasSideNumber, vegasSideBirdie, vegasHoleNumbers, settleWolfVegasHole } from './golf';

describe('vegasSideNumber', () => {
  it('puts the lower score first', () => {
    expect(vegasSideNumber([5, 4], false)).toBe(45);
  });
  it('puts the higher score first when flipped', () => {
    expect(vegasSideNumber([5, 4], true)).toBe(54);
  });
  it('uses the two best scores of a three-player side', () => {
    expect(vegasSideNumber([6, 4, 5], false)).toBe(45);
  });
  it('doubles a one-player side, which a flip cannot change', () => {
    expect(vegasSideNumber([4], false)).toBe(44);
    expect(vegasSideNumber([4], true)).toBe(44);
  });
});

describe('vegasSideBirdie', () => {
  // A 5 with a stroke on a par 5: a net birdie, not a natural one.
  const popPar = [{ gross: 5, net: 4 }];
  it('counts a net birdie only when birdies are net', () => {
    expect(vegasSideBirdie(popPar, 5, false)).toBe(true);
    expect(vegasSideBirdie(popPar, 5, true)).toBe(false);
  });
  it('counts a natural birdie either way', () => {
    expect(vegasSideBirdie([{ gross: 3, net: 3 }], 4, true)).toBe(true);
    expect(vegasSideBirdie([{ gross: 3, net: 3 }], 4, false)).toBe(true);
  });
  it('ignores an unscored player', () => {
    expect(vegasSideBirdie([{ gross: null, net: null }], 4, true)).toBe(false);
  });
});

describe('vegasHoleNumbers', () => {
  it("flips the other side's number on a birdie", () => {
    const birdie = [{ gross: 3, net: 3 }, { gross: 5, net: 4 }];
    const field = [{ gross: 5, net: 5 }, { gross: 5, net: 4 }];
    expect(vegasHoleNumbers(birdie, field, 4, true)).toMatchObject({ a: 34, b: 54, aBirdie: true, bBirdie: false });
  });
});

describe('settleWolfVegasHole', () => {
  const m = (id, net) => ({ id, gross: net, net });
  it('settles 2 v 3 per opposing player, zero-sum', () => {
    const r = settleWolfVegasHole([m('a', 6), m('b', 7)], [m('c', 4), m('d', 5), m('e', 5)], 4, { grossBirdies: true });
    expect(r).toMatchObject({ wolfNum: 67, oppNum: 45, diff: 22 });
    expect(r.pts).toEqual({ a: -66, b: -66, c: 44, d: 44, e: 44 });
  });
  it('settles equal sides once each', () => {
    const r = settleWolfVegasHole([m('a', 4), m('b', 5)], [m('c', 5), m('d', 5)], 4, { grossBirdies: true });
    expect(r.pts).toEqual({ a: 10, b: 10, c: -10, d: -10 });
  });
  it('scales by the Lone multiplier and hammers', () => {
    const r = settleWolfVegasHole([m('a', 4)], [m('b', 5), m('c', 5), m('d', 5)], 4, { grossBirdies: true, scale: 2 * 2 });
    // 44 against 55: 11 per opponent, x4.
    expect(r.pts).toEqual({ a: 132, b: -44, c: -44, d: -44 });
  });
  it('scores a tie as nothing', () => {
    const r = settleWolfVegasHole([m('a', 4), m('b', 5)], [m('c', 4), m('d', 5), m('e', 6)], 4, { grossBirdies: true });
    expect(Object.values(r.pts).every(v => v === 0)).toBe(true);
  });
});

// A real five-player round: Ames Golf and Country Club, blue tees, 2026-11-08. Another app scored
// it with natural (gross) birdies only, and its sheet gave the totals below. Played off the low
// handicap: strokes received Grundy 0, Ryan 5, Roger 7, Mindy 13, H 14.
describe('Wolf Vegas: the Ames round of 2026-11-08', () => {
  const order = ['Grundy', 'H', 'Mindy', 'Roger', 'Ryan']; // the Wolf rotates in this order
  const strokes = { Grundy: 0, H: 14, Mindy: 13, Roger: 7, Ryan: 5 };
  const pars = [5, 4, 4, 3, 4, 4, 4, 4, 3, 4, 4, 3, 5, 3, 5, 4, 4, 4];
  const si = [3, 7, 15, 13, 11, 1, 9, 5, 17, 6, 12, 16, 4, 18, 2, 14, 10, 8];
  const gross = {
    Ryan: [6, 5, 5, 4, 5, 6, 6, 6, 3, 4, 5, 4, 8, 4, 6, 6, 6, 4],
    Grundy: [7, 3, 4, 3, 4, 6, 5, 3, 5, 5, 5, 3, 8, 3, 5, 4, 4, 3],
    H: [5, 5, 4, 4, 5, 6, 7, 7, 4, 6, 7, 5, 8, 4, 8, 5, 7, 5],
    Mindy: [7, 5, 5, 3, 5, 8, 5, 5, 5, 5, 6, 5, 8, 4, 7, 6, 6, 5],
    Roger: [6, 6, 5, 4, 5, 5, 7, 6, 4, 5, 7, 4, 6, 5, 6, 4, 7, 5],
  };
  const partners = ['Mindy', 'Grundy', 'Grundy', 'Grundy', 'Mindy', 'Roger', 'Mindy', 'Grundy', 'Ryan',
    'Roger', 'Ryan', 'Ryan', 'H', 'Mindy', 'Roger', 'H', 'Grundy', 'Ryan'];

  const play = (grossBirdies) => {
    const totals = Object.fromEntries(order.map(p => [p, 0]));
    const holes = [];
    for (let h = 0; h < 18; h++) {
      const member = (id) => ({ id, gross: gross[id][h], net: netScore(gross[id][h], h, strokes[id], si, true) });
      const wolfSide = [order[h % 5], partners[h]];
      const oppSide = order.filter(p => !wolfSide.includes(p));
      const r = settleWolfVegasHole(wolfSide.map(member), oppSide.map(member), pars[h], { grossBirdies });
      holes.push(r);
      order.forEach(p => { totals[p] += r.pts[p]; });
    }
    return { totals, holes };
  };

  it('matches the sheet with gross birdies', () => {
    const { totals, holes } = play(true);
    expect(totals).toEqual({ Grundy: 150, H: 55, Roger: 0, Ryan: -40, Mindy: -165 });
    // Hole 2: Grundy's natural birdie flips the field's 45 to 54.
    expect(holes[1]).toMatchObject({ wolfNum: 34, oppNum: 54 });
    // Hole 1: H's par with a stroke is no birdie, so the Wolf side's 67 stands.
    expect(holes[0]).toMatchObject({ wolfNum: 67, oppNum: 45 });
  });

  it('differs on holes 1 and 4 with net birdies', () => {
    const { totals, holes } = play(false);
    expect(holes[0]).toMatchObject({ wolfNum: 76, oppNum: 45 }); // H's net 4 on the par 5
    expect(holes[3]).toMatchObject({ wolfNum: 43, oppNum: 23 }); // Mindy's net 2 on the par 3
    expect(totals).toEqual({ Grundy: 96, H: 91, Roger: -9, Ryan: -4, Mindy: -174 });
  });

  it('is zero-sum', () => {
    for (const gb of [true, false]) {
      expect(Object.values(play(gb).totals).reduce((a, b) => a + b, 0)).toBe(0);
    }
  });
});
