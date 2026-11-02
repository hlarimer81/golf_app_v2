import { describe, it, expect } from 'vitest';
import { wolfIndex, wolfPoints } from './wolf';

// Four players in rotation order: A is Wolf on the 1st played hole, B on the 2nd, and so on.
const players = [
  { id: 'a', player_name: 'A', handicap: 0 },
  { id: 'b', player_name: 'B', handicap: 0 },
  { id: 'c', player_name: 'C', handicap: 0 },
  { id: 'd', player_name: 'D', handicap: 0 },
];
const hcds = [7, 11, 17, 1, 9, 5, 15, 13, 3, 8, 12, 18, 2, 10, 6, 16, 14, 4];
const front = [1, 2, 3, 4, 5, 6, 7, 8, 9];

// scores[playerId][hole] from one row per hole: [a, b, c, d].
const scoresFrom = (rows) => {
  const s = { a: {}, b: {}, c: {}, d: {} };
  Object.entries(rows).forEach(([hole, strokes]) => {
    ['a', 'b', 'c', 'd'].forEach((id, i) => { s[id][hole] = strokes[i]; });
  });
  return s;
};

const points = (scores, decisions, extra = {}) =>
  wolfPoints({ players, scores, decisions, holeNumbers: front, hcds, useHandicaps: false, ...extra });

describe('wolfIndex', () => {
  it('rotates through the players by played hole, not raw hole number', () => {
    expect([1, 2, 3, 4, 5].map(h => wolfIndex(front, h, 4))).toEqual([0, 1, 2, 3, 0]);
    const back = [10, 11, 12, 13, 14, 15, 16, 17, 18];
    expect(wolfIndex(back, 10, 4)).toBe(0);
    expect(wolfIndex(back, 13, 4)).toBe(3);
  });
});

describe('wolfPoints', () => {
  it('gives 2 each to the Wolf and partner when their best ball wins', () => {
    // Hole 1, A is Wolf with C: A's 3 beats B's and D's 4.
    expect(points(scoresFrom({ 1: [3, 4, 5, 4] }), { 1: 'c' })).toEqual({ a: 2, b: 0, c: 2, d: 0 });
  });

  it('gives 2 each to the other side when their best ball wins', () => {
    expect(points(scoresFrom({ 1: [5, 3, 5, 4] }), { 1: 'c' })).toEqual({ a: 0, b: 2, c: 0, d: 2 });
  });

  it('scores a halved hole as nothing', () => {
    expect(points(scoresFrom({ 1: [4, 4, 5, 5] }), { 1: 'c' })).toEqual({ a: 0, b: 0, c: 0, d: 0 });
  });

  it('gives a Lone Wolf 4 for beating every other ball, and each other player 2 if not', () => {
    expect(points(scoresFrom({ 1: [3, 4, 4, 4] }), { 1: 'lone' })).toEqual({ a: 4, b: 0, c: 0, d: 0 });
    expect(points(scoresFrom({ 1: [5, 4, 6, 6] }), { 1: 'lone' })).toEqual({ a: 0, b: 2, c: 2, d: 2 });
    expect(points(scoresFrom({ 1: [4, 4, 6, 6] }), { 1: 'lone' })).toEqual({ a: 0, b: 0, c: 0, d: 0 });
  });

  it('uses the rotation for who is Wolf on each hole', () => {
    // Hole 2: B is Wolf. B + D (3, 5) beat A + C (4, 4).
    expect(points(scoresFrom({ 2: [4, 3, 4, 5] }), { 2: 'd' })).toEqual({ a: 0, b: 2, c: 0, d: 2 });
  });

  it('skips a hole with no decision or a missing score', () => {
    expect(points(scoresFrom({ 1: [3, 4, 4, 4] }), {})).toEqual({ a: 0, b: 0, c: 0, d: 0 });
    expect(points(scoresFrom({ 1: [3, 4, 4, null] }), { 1: 'lone' })).toEqual({ a: 0, b: 0, c: 0, d: 0 });
  });

  it('nets the scores when handicaps are on', () => {
    // Hole 4 (stroke index 1), D is Wolf and goes Lone. D's 5 nets 4 off a 1 handicap, beating 5s.
    const hcpPlayers = players.map(p => (p.id === 'd' ? { ...p, handicap: 1 } : p));
    const scores = scoresFrom({ 4: [5, 5, 5, 5] });
    expect(points(scores, { 4: 'lone' })).toEqual({ a: 0, b: 0, c: 0, d: 0 });
    expect(points(scores, { 4: 'lone' }, { players: hcpPlayers, useHandicaps: true })).toEqual({ a: 0, b: 0, c: 0, d: 4 });
  });

  it('totals a round from its saved decisions (issue #46)', () => {
    // Saved picks are all another device or the summary has. With them, every view gets the same
    // non-zero standings the scorer saw, not 0-0-0-0.
    const scores = scoresFrom({ 1: [3, 4, 5, 4], 2: [4, 3, 4, 5], 3: [5, 5, 3, 4], 4: [4, 4, 4, 5] });
    const decisions = { 1: 'c', 2: 'd', 3: 'lone', 4: 'a' };
    // 1: A+C win (a2 c2). 2: B+D win (b2 d2). 3: C lone wins (c4). 4: D+A 4 vs B+C 4, halved.
    expect(points(scores, decisions)).toEqual({ a: 2, b: 2, c: 6, d: 2 });
  });

  it('ignores a partner who is not in the round', () => {
    expect(points(scoresFrom({ 1: [3, 4, 5, 4] }), { 1: 'gone' })).toEqual({ a: 0, b: 0, c: 0, d: 0 });
  });
});
