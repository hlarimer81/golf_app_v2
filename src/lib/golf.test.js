import { describe, it, expect } from 'vitest';
import {
  netScore,
  stablefordPoints,
  strokesReceived,
  pointsUpToHole,
  holeLayout,
} from './golf';

// Stroke index 1 is the hardest hole, 18 the easiest. A player receives a stroke on every hole
// whose index is at or below their handicap, and a second stroke once their handicap reaches
// index + 18. These fixtures make the boundaries explicit.
const pars = [4, 5, 3, 4, 4, 5, 3, 4, 4, 4, 4, 3, 5, 4, 4, 3, 5, 4];
const hcds = [7, 3, 15, 1, 11, 5, 17, 9, 13, 8, 12, 16, 2, 10, 6, 18, 4, 14];

const HOLE_SI_1 = 3;   // hardest hole
const HOLE_SI_18 = 15; // easiest hole

describe('netScore', () => {
  it('returns null when the hole has not been scored', () => {
    expect(netScore(0, 0, 18, hcds, true)).toBeNull();
    expect(netScore(null, 0, 18, hcds, true)).toBeNull();
    expect(netScore(undefined, 0, 18, hcds, true)).toBeNull();
  });

  it('returns the gross score when handicaps are off', () => {
    expect(netScore(5, HOLE_SI_1, 36, hcds, false)).toBe(5);
  });

  it('gives one stroke when the handicap reaches the hole index', () => {
    // Handicap 7 on the hole with stroke index 7: exactly at the boundary, stroke given.
    expect(netScore(5, 0, 7, hcds, true)).toBe(4);
    // Handicap 6 on that same hole: one short, no stroke.
    expect(netScore(5, 0, 6, hcds, true)).toBe(5);
  });

  it('gives a second stroke only once the handicap reaches index + 18', () => {
    // Stroke index 1, handicap 18: one stroke (18 >= 1, but 18 < 19).
    expect(netScore(6, HOLE_SI_1, 18, hcds, true)).toBe(5);
    // Handicap 19 on stroke index 1: the second stroke arrives.
    expect(netScore(6, HOLE_SI_1, 19, hcds, true)).toBe(4);
  });

  it('treats a scratch player as receiving nothing', () => {
    expect(netScore(4, HOLE_SI_1, 0, hcds, true)).toBe(4);
  });

  it('parses string scores, which is how they arrive from inputs', () => {
    expect(netScore('5', 0, 7, hcds, true)).toBe(4);
  });
});

describe('strokesReceived', () => {
  it('is zero when handicaps are off, whatever the handicap', () => {
    expect(strokesReceived(36, HOLE_SI_1, hcds, false)).toBe(0);
  });

  it('counts 0, 1 and 2 strokes across the boundaries', () => {
    expect(strokesReceived(0, HOLE_SI_1, hcds, true)).toBe(0);
    expect(strokesReceived(1, HOLE_SI_1, hcds, true)).toBe(1);
    expect(strokesReceived(18, HOLE_SI_1, hcds, true)).toBe(1);
    expect(strokesReceived(19, HOLE_SI_1, hcds, true)).toBe(2);
  });

  it('gives the easiest hole a stroke only at handicap 18', () => {
    expect(strokesReceived(17, HOLE_SI_18, hcds, true)).toBe(0);
    expect(strokesReceived(18, HOLE_SI_18, hcds, true)).toBe(1);
  });
});

describe('stablefordPoints', () => {
  it('scores gross: eagle 4, birdie 3, par 2, bogey 1, double 0', () => {
    const par5 = 1; // pars[1] === 5
    expect(stablefordPoints(3, par5, 0, pars, hcds, false)).toBe(4);
    expect(stablefordPoints(4, par5, 0, pars, hcds, false)).toBe(3);
    expect(stablefordPoints(5, par5, 0, pars, hcds, false)).toBe(2);
    expect(stablefordPoints(6, par5, 0, pars, hcds, false)).toBe(1);
    expect(stablefordPoints(7, par5, 0, pars, hcds, false)).toBe(0);
  });

  it('caps the good end: albatross scores the same 4 as an eagle', () => {
    expect(stablefordPoints(2, 1, 0, pars, hcds, false)).toBe(4);
  });

  it('scores zero for an unplayed hole', () => {
    expect(stablefordPoints(0, 0, 0, pars, hcds, false)).toBe(0);
  });

  it('applies the handicap stroke before comparing to par', () => {
    // Hole 0 is a par 4 with stroke index 7. A 7-handicap making 5 nets 4: par, 2 points.
    expect(stablefordPoints(5, 0, 7, pars, hcds, true)).toBe(2);
    // Same gross score, no handicap: bogey, 1 point.
    expect(stablefordPoints(5, 0, 0, pars, hcds, true)).toBe(1);
  });
});

describe('pointsUpToHole', () => {
  const scores = { 1: 4, 2: 5, 3: 3, 4: 4 };

  it('counts only holes up to and including the one asked for', () => {
    // Hole 1 par 4 -> par -> 2. Hole 2 par 5 -> par -> 2.
    expect(pointsUpToHole(scores, 1, pars, hcds)).toBe(2);
    expect(pointsUpToHole(scores, 2, pars, hcds)).toBe(4);
  });

  it('ignores holes with no score', () => {
    expect(pointsUpToHole({ 1: 4 }, 18, pars, hcds)).toBe(2);
  });

  it('scores gross, ignoring any handicap', () => {
    // Quota is a gross format; there is no handicap parameter to pass.
    expect(pointsUpToHole({ 4: 5 }, 4, pars, hcds)).toBe(1);
  });
});

describe('holeLayout', () => {
  it('splits 18 holes into front and back nines', () => {
    const { holeNumbers, is18, frontHoles, backHoles } = holeLayout(18, 1);
    expect(holeNumbers).toHaveLength(18);
    expect(is18).toBe(true);
    expect(frontHoles).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9]);
    expect(backHoles).toEqual([10, 11, 12, 13, 14, 15, 16, 17, 18]);
  });

  it('treats a nine as all front, with no back', () => {
    const { is18, frontHoles, backHoles } = holeLayout(9, 1);
    expect(is18).toBe(false);
    expect(frontHoles).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9]);
    expect(backHoles).toEqual([]);
  });

  it('starts where the round starts — a back-nine tee off gives holes 10-18', () => {
    // This is the shape that matters for handicaps: a nine started on 10 stores scores on
    // holes 10-18, and par must be read from those holes, not 1-9.
    expect(holeLayout(9, 10).holeNumbers).toEqual([10, 11, 12, 13, 14, 15, 16, 17, 18]);
  });
});
