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
