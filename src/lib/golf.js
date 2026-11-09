// =====================================================================================
// Pure golf scoring math — no React, fully unit-testable.
// This is the single source of truth for net-stroke, Stableford, and hole-layout
// logic that was previously copy-pasted into every *Grid.jsx and MatchSummary.jsx.
// =====================================================================================

export const PAR_FALLBACK = Array(18).fill(4);
export const HCP_FALLBACK = Array(18).fill(10);

/**
 * Net (handicap-adjusted) strokes for a hole.
 * Returns null when no gross score has been entered.
 */
export function netScore(strokes, holeIndex, playerHcp, hcds, useHandicaps) {
  if (!strokes || strokes === 0) return null;
  let net = parseInt(strokes, 10);
  if (useHandicaps) {
    const diff = hcds[holeIndex];
    const hcp = parseInt(playerHcp, 10) || 0;
    if (hcp >= diff) net -= 1;
    if (hcp >= diff + 18) net -= 1;
  }
  return net;
}

/**
 * Stableford points for a hole (net if useHandicaps, otherwise gross).
 * eagle+ = 4, birdie = 3, par = 2, bogey = 1, worse = 0.
 */
export function stablefordPoints(strokes, holeIndex, playerHcp, pars, hcds, useHandicaps) {
  if (!strokes || strokes === 0) return 0;
  let netStrokes = parseInt(strokes, 10);
  if (useHandicaps) {
    const holeDifficulty = hcds[holeIndex];
    const hcp = parseInt(playerHcp, 10) || 0;
    if (hcp >= holeDifficulty) netStrokes -= 1;
    if (hcp >= holeDifficulty + 18) netStrokes -= 1;
  }
  const diff = netStrokes - pars[holeIndex];
  if (diff <= -2) return 4;
  if (diff === -1) return 3;
  if (diff === 0) return 2;
  if (diff === 1) return 1;
  return 0;
}

/**
 * How many handicap strokes a player receives on a hole (0, 1, or 2).
 * Useful for rendering the "pop" dots on a score tile.
 */
export function strokesReceived(playerHcp, holeIndex, hcds, useHandicaps) {
  if (!useHandicaps) return 0;
  const diff = hcds[holeIndex];
  const hcp = parseInt(playerHcp, 10) || 0;
  let n = 0;
  if (hcp >= diff) n += 1;
  if (hcp >= diff + 18) n += 1;
  return n;
}

/**
 * Sum of gross Stableford points for a player up to (and including) `upToHole`.
 * Quota always uses gross (playerHcp = 0), matching the existing grids.
 */
export function pointsUpToHole(playerScores, upToHole, pars, hcds) {
  let total = 0;
  for (let h = 1; h <= upToHole; h++) {
    if (playerScores[h]) {
      total += stablefordPoints(playerScores[h], h - 1, 0, pars, hcds, false);
    }
  }
  return total;
}

/**
 * Build the list of hole numbers played plus the front/back split.
 */
export function holeLayout(holesCount = 18, startHole = 1) {
  const holeNumbers = Array.from({ length: holesCount }, (_, i) => startHole + i);
  const is18 = holesCount === 18;
  return {
    holeNumbers,
    is18,
    frontHoles: is18 ? holeNumbers.slice(0, 9) : holeNumbers,
    backHoles: is18 ? holeNumbers.slice(9) : [],
  };
}

/**
 * Standard competition ranking ("1224") for a list of scores already sorted best-first.
 * Equal scores share the same place; the next distinct score skips ahead by the number
 * of players tied ahead of it (two tied for 1st -> the next player is 3rd, not 2nd).
 * A null/undefined score (no round played) never ties with another and keeps its own place.
 */
export function computeRanks(sortedScores) {
  let rank = 1;
  return sortedScores.map((score, idx) => {
    if (idx > 0 && score != null && score === sortedScores[idx - 1]) {
      return rank;
    }
    rank = idx + 1;
    return rank;
  });
}

/**
 * Color for a net score relative to par (shared by grids/summary).
 */
export function scoreColor(net, par) {
  if (net === null || net === undefined) return '#fff';
  const diff = net - par;
  if (diff <= -2) return '#FFD700';
  if (diff === -1) return '#4CAF50';
  if (diff === 0) return '#fff';
  if (diff === 1) return '#ff9800';
  return '#f44336';
}

// ---------------------------------------------------------------------------------------------
// Vegas and Wolf Vegas
//
// Each side makes a two-digit number from its two lowest net scores, low digit first. A birdie
// by one side flips the other side's number (45 -> 54). The lower number wins the difference.
// Whether a birdie must be natural (gross) or can come with a stroke (net) is a per-round option.
// ---------------------------------------------------------------------------------------------

/**
 * A side's Vegas number from its net scores: the two lowest, low digit first, or high digit first
 * when `flipped`. A one-player side doubles its net (4 -> 44), so a flip changes nothing there.
 * Any score past the two lowest is ignored.
 */
export function vegasSideNumber(nets, flipped) {
  if (nets.length === 1) return nets[0] * 11;
  const [lo, hi] = [...nets].sort((a, b) => a - b);
  return flipped ? hi * 10 + lo : lo * 10 + hi;
}

/**
 * Did a side birdie? Any member one or more under par. members: [{ gross, net }].
 * With `grossBirdies` only a natural birdie counts; otherwise a net birdie does too.
 */
export function vegasSideBirdie(members, par, grossBirdies) {
  return members.some(m => {
    const s = grossBirdies ? m.gross : m.net;
    return s != null && s <= par - 1;
  });
}

/**
 * Both sides' numbers on one hole. Each side is [{ gross, net }], net already handicapped.
 * Returns { a, b, aBirdie, bBirdie }: a is sideA's number, flipped if sideB birdied.
 */
export function vegasHoleNumbers(sideA, sideB, par, grossBirdies) {
  const aBirdie = vegasSideBirdie(sideA, par, grossBirdies);
  const bBirdie = vegasSideBirdie(sideB, par, grossBirdies);
  return {
    a: vegasSideNumber(sideA.map(m => m.net), bBirdie),
    b: vegasSideNumber(sideB.map(m => m.net), aBirdie),
    aBirdie,
    bBirdie,
  };
}

/**
 * Settle one Wolf Vegas hole. wolfSide and oppSide are [{ id, gross, net }]. `scale` is the
 * Lone (x2) / Blind (x3) multiplier times the hammers. Equal-sized sides settle the difference
 * once each; unequal sides settle it with every player opposite, so a wolf-side player swings
 * diff x (opponents) and an opponent diff x (wolf side). Always zero-sum.
 * Returns { pts: { [id]: signed points }, wolfNum, oppNum, diff } with diff unsigned.
 */
export function settleWolfVegasHole(wolfSide, oppSide, par, { grossBirdies, scale = 1 } = {}) {
  const { a: wolfNum, b: oppNum } = vegasHoleNumbers(wolfSide, oppSide, par, grossBirdies);
  const signed = wolfNum - oppNum;
  const diff = Math.abs(signed);
  const equal = wolfSide.length === oppSide.length;
  const wolfEach = (equal ? diff : diff * oppSide.length) * scale;
  const oppEach = (equal ? diff : diff * wolfSide.length) * scale;

  const pts = {};
  wolfSide.forEach(m => { pts[m.id] = 0; });
  oppSide.forEach(m => { pts[m.id] = 0; });
  // The lower number wins. A tie scores nothing.
  if (signed < 0) {
    wolfSide.forEach(m => { pts[m.id] = wolfEach; });
    oppSide.forEach(m => { pts[m.id] = -oppEach; });
  } else if (signed > 0) {
    wolfSide.forEach(m => { pts[m.id] = -wolfEach; });
    oppSide.forEach(m => { pts[m.id] = oppEach; });
  }
  return { pts, wolfNum, oppNum, diff };
}
