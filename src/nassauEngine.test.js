import { describe, it, expect } from 'vitest';
import { computeNassau, nassauSettlementSegments } from './nassauEngine';

// sideNet[side][holeIdx] is the side's best net score on that hole; 0 means nobody has scored it.
const blank = () => [Array(18).fill(0), Array(18).fill(0)];

// Side 0 wins the given 0-based holes, side 1 wins the rest of the listed ones.
function playHoles(sideNet, { side0Wins = [], side1Wins = [], halved = [] }) {
  side0Wins.forEach((h) => { sideNet[0][h] = 4; sideNet[1][h] = 5; });
  side1Wins.forEach((h) => { sideNet[0][h] = 5; sideNet[1][h] = 4; });
  halved.forEach((h) => { sideNet[0][h] = 4; sideNet[1][h] = 4; });
  return sideNet;
}

const find = (matches, segment, kind = 'primary') =>
  matches.find((m) => m.segment === segment && m.kind === kind);

describe('computeNassau', () => {
  it('always opens the three primary matches', () => {
    const { matches } = computeNassau({ sides: ['A', 'B'], sideNet: blank() });
    expect(matches).toHaveLength(3);
    expect(matches.map((m) => m.segment)).toEqual(['front', 'back', 'overall']);
    expect(matches.every((m) => m.kind === 'primary')).toBe(true);
  });

  it('ignores holes where either side has not scored', () => {
    const sideNet = blank();
    sideNet[0][0] = 4; // only side 0 has a score
    const { matches } = computeNassau({ sides: ['A', 'B'], sideNet });
    expect(find(matches, 'front').sideLead).toBe(0);
    expect(find(matches, 'front').throughHole).toBe(-1);
  });

  it('tracks the lead in holes won, not strokes', () => {
    const sideNet = playHoles(blank(), { side0Wins: [0, 1], side1Wins: [2] });
    const { matches } = computeNassau({ sides: ['A', 'B'], sideNet });
    expect(find(matches, 'front').sideLead).toBe(1);
    expect(find(matches, 'overall').sideLead).toBe(1);
  });

  it('leaves a halved hole alone', () => {
    const sideNet = playHoles(blank(), { halved: [0, 1, 2] });
    const { matches } = computeNassau({ sides: ['A', 'B'], sideNet });
    expect(find(matches, 'front').sideLead).toBe(0);
    expect(find(matches, 'front').throughHole).toBe(2);
  });

  it('closes out a match once the lead exceeds the holes left', () => {
    // Side 0 wins the first five: 5 up with 4 to play on the front nine — 5 & 4.
    const sideNet = playHoles(blank(), { side0Wins: [0, 1, 2, 3, 4] });
    const front = find(computeNassau({ sides: ['A', 'B'], sideNet }).matches, 'front');
    expect(front.closedOut).toBe(true);
    expect(front.closedAtHole).toBe(4);
    expect(front.winMargin).toBe(5);
    expect(front.winHolesLeft).toBe(4);
  });

  it('does not close a match that is merely all square or narrowly ahead', () => {
    // 1 up with 4 to play: still live.
    const sideNet = playHoles(blank(), { side0Wins: [0], halved: [1, 2, 3, 4] });
    const front = find(computeNassau({ sides: ['A', 'B'], sideNet }).matches, 'front');
    expect(front.closedOut).toBe(false);
    expect(front.holesRemaining).toBe(4);
  });

  it('stays open when the lead exactly equals the holes left — dormie is not won', () => {
    // 4 up with 4 to play. The trailing side can still halve the match by winning them all, so
    // the stake is not settled. Closing here would pay out a match that is not over.
    const sideNet = playHoles(blank(), { side0Wins: [0, 1, 2, 3], halved: [4] });
    const front = find(computeNassau({ sides: ['A', 'B'], sideNet }).matches, 'front');
    expect(front.sideLead).toBe(4);
    expect(front.holesRemaining).toBe(4);
    expect(front.closedOut).toBe(false);
  });

  it('closes the moment the lead exceeds the holes left, not before', () => {
    // The same match one hole later: 5 up with 3 to play is mathematically over — 5 & 3.
    const sideNet = playHoles(blank(), { side0Wins: [0, 1, 2, 3, 5], halved: [4] });
    const front = find(computeNassau({ sides: ['A', 'B'], sideNet }).matches, 'front');
    expect(front.closedOut).toBe(true);
    expect(front.winMargin).toBe(5);
    expect(front.winHolesLeft).toBe(3);
  });

  it('keeps the overall match alive after the front nine is decided', () => {
    const sideNet = playHoles(blank(), { side0Wins: [0, 1, 2, 3, 4] });
    const { matches } = computeNassau({ sides: ['A', 'B'], sideNet });
    expect(find(matches, 'front').closedOut).toBe(true);
    expect(find(matches, 'overall').closedOut).toBe(false);
  });

  it('stops scoring a closed match, so later holes cannot revive it', () => {
    const sideNet = playHoles(blank(), {
      side0Wins: [0, 1, 2, 3, 4],
      side1Wins: [5, 6, 7, 8],
    });
    const front = find(computeNassau({ sides: ['A', 'B'], sideNet }).matches, 'front');
    expect(front.sideLead).toBe(5);      // frozen at the close-out
    expect(front.closedAtHole).toBe(4);
  });

  it('spawns a press on each open segment, starting the following hole', () => {
    const sideNet = playHoles(blank(), { side0Wins: [0, 1], halved: [2, 3, 4, 5, 6, 7, 8] });
    const { matches } = computeNassau({
      sides: ['A', 'B'],
      sideNet,
      manualPressHoles: [1], // pressed after the second hole
    });
    const presses = matches.filter((m) => m.kind === 'press');
    expect(presses).toHaveLength(3); // front, back and overall are all still open
    presses.forEach((p) => {
      expect(p.startHole).toBe(2);
      expect(p.pressAfterHole).toBe(1);
    });
  });

  it('scores a press only from its own start, independent of the parent', () => {
    // Side 0 takes the first two, then side 1 takes the next two after the press.
    const sideNet = playHoles(blank(), { side0Wins: [0, 1], side1Wins: [2, 3] });
    const { matches } = computeNassau({ sides: ['A', 'B'], sideNet, manualPressHoles: [1] });
    const frontPress = matches.find((m) => m.kind === 'press' && m.segment === 'front');
    expect(frontPress.sideLead).toBe(-2); // side 1 is 2 up on the press
    expect(find(matches, 'front').sideLead).toBe(0); // the parent is back to all square
  });

  it('does not press a segment that is already closed out', () => {
    const sideNet = playHoles(blank(), { side0Wins: [0, 1, 2, 3, 4] });
    const { matches } = computeNassau({ sides: ['A', 'B'], sideNet, manualPressHoles: [4] });
    const frontPress = matches.find((m) => m.kind === 'press' && m.segment === 'front');
    expect(frontPress).toBeUndefined();
    // The overall match is still open, so it can still be pressed.
    expect(matches.find((m) => m.kind === 'press' && m.segment === 'overall')).toBeDefined();
  });

  it('does not press a segment with no holes left in it', () => {
    const sideNet = playHoles(blank(), { halved: Array.from({ length: 9 }, (_, i) => i) });
    const { matches } = computeNassau({ sides: ['A', 'B'], sideNet, manualPressHoles: [8] });
    // Pressing after hole 9 leaves the front nine nothing to play.
    expect(matches.find((m) => m.kind === 'press' && m.segment === 'front')).toBeUndefined();
  });
});

describe('nassauSettlementSegments', () => {
  const sideNames = ['Team A', 'Team B'];
  const wager = {
    nassau_front: 5, nassau_back: 5, nassau_overall: 10, nassau_press: 0,
  };

  it('pays out a closed-out match', () => {
    const sideNet = playHoles(blank(), { side0Wins: [0, 1, 2, 3, 4] });
    const { matches } = computeNassau({ sides: sideNames, sideNet });
    const segs = nassauSettlementSegments({ matches, sideNames, wager });
    expect(segs.find((s) => s.label === 'Front 9')).toMatchObject({
      winner: 'Team A', stake: 5,
    });
  });

  it('leaves an undecided match unpaid', () => {
    const sideNet = playHoles(blank(), { side0Wins: [0], halved: [1, 2] });
    const { matches } = computeNassau({ sides: sideNames, sideNet });
    const segs = nassauSettlementSegments({ matches, sideNames, wager });
    // Still live: 1 up with holes to play pays nobody.
    expect(segs.find((s) => s.label === 'Front 9').winner).toBeNull();
  });

  it('pays nobody for a dormie match', () => {
    // 4 up with 4 to play, with holes still unplayed: no winner, no money.
    const sideNet = playHoles(blank(), { side0Wins: [0, 1, 2, 3], halved: [4] });
    const { matches } = computeNassau({ sides: sideNames, sideNet });
    const segs = nassauSettlementSegments({ matches, sideNames, wager });
    expect(segs.find((s) => s.label === 'Front 9').winner).toBeNull();
  });

  it('pays a match that went the distance with someone ahead', () => {
    const sideNet = playHoles(blank(), {
      side0Wins: [0],
      halved: [1, 2, 3, 4, 5, 6, 7, 8],
    });
    const { matches } = computeNassau({ sides: sideNames, sideNet });
    const segs = nassauSettlementSegments({ matches, sideNames, wager });
    expect(segs.find((s) => s.label === 'Front 9').winner).toBe('Team A');
  });

  it('drops segments nobody staked money on', () => {
    const sideNet = playHoles(blank(), { side0Wins: [0, 1, 2, 3, 4] });
    const { matches } = computeNassau({ sides: sideNames, sideNet });
    const segs = nassauSettlementSegments({
      matches, sideNames,
      wager: { nassau_front: 0, nassau_back: 0, nassau_overall: 10, nassau_press: 0 },
    });
    expect(segs.map((s) => s.label)).toEqual(['Overall']);
  });

  it('gives a press its parent stake when no press rate is set', () => {
    const sideNet = playHoles(blank(), { side0Wins: [0, 1], side1Wins: [2, 3, 4, 5, 6, 7, 8] });
    const { matches } = computeNassau({ sides: sideNames, sideNet, manualPressHoles: [1] });
    const segs = nassauSettlementSegments({ matches, sideNames, wager });
    const press = segs.find((s) => s.label.startsWith('Front 9 press'));
    expect(press.stake).toBe(5); // inherited from nassau_front
  });

  it('uses the press rate when one is set', () => {
    const sideNet = playHoles(blank(), { side0Wins: [0, 1], side1Wins: [2, 3, 4, 5, 6, 7, 8] });
    const { matches } = computeNassau({ sides: sideNames, sideNet, manualPressHoles: [1] });
    const segs = nassauSettlementSegments({
      matches, sideNames, wager: { ...wager, nassau_press: 2 },
    });
    const press = segs.find((s) => s.label.startsWith('Front 9 press'));
    expect(press.stake).toBe(2);
  });

  it('names the press after the hole it was called on, in human numbering', () => {
    const sideNet = playHoles(blank(), { side0Wins: [0, 1], side1Wins: [2, 3, 4, 5, 6, 7, 8] });
    const { matches } = computeNassau({ sides: sideNames, sideNet, manualPressHoles: [1] });
    const segs = nassauSettlementSegments({ matches, sideNames, wager });
    expect(segs.some((s) => s.label === 'Front 9 press (after 2)')).toBe(true);
  });
});
