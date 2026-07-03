// =====================================================================================
// Single source of truth for the game types. Drives the scorer component selection,
// banner colors, dropdown labels, human descriptions, and the "Recent Rounds" labels.
//
// Previously these lived in four separate hand-synced spots inside App.jsx:
//   - the if/else ScorerComponent chain
//   - the <select> option list
//   - the gameDescriptions object
//   - the recent-matches label map
// Keeping them together prevents them from drifting apart.
// =====================================================================================

// Note: component references are attached in App.jsx (to avoid a circular import and
// to keep this module free of JSX). Order here is the display order in the dropdown.
export const GAMES = {
  stableford: {
    label: 'Stableford',
    recentLabel: 'Stableford',
    banner: '#4CAF50',
    description: 'Points-based scoring. Each player earns points per hole. Teams accumulate total points.',
  },
  fourball: {
    label: '4-Ball',
    recentLabel: '4-Ball',
    banner: '#4CAF50',
    description: 'Match play. Each player plays their own ball; the best score on each team counts. Team A vs Team B.',
  },
  skins: {
    label: 'Skins',
    recentLabel: 'Skins',
    banner: '#FFD700',
    description: 'Individual competition. Lowest score wins the hole. Ties can carry over to the next hole.',
  },
  chairman: {
    label: 'Chairman',
    recentLabel: 'Chairman',
    banner: '#8B4513',
    description: 'King of the hill. Win a hole outright to become Chairman. Chairman earns 1 point for each hole won.',
  },
  ninepoint: {
    label: '9-Point',
    recentLabel: '9-Point',
    banner: '#00BCD4',
    description: '3-player game. 9 points awarded per hole: 5 for best, 3 for middle, 1 for worst. Ties split points.',
  },
  singles: {
    label: 'Singles',
    recentLabel: 'Singles',
    banner: '#9C27B0',
    description: 'Individual stroke play. No teams, just you vs the course. Keeps track of gross and net scores.',
  },
  nassau: {
    label: 'Nassau',
    recentLabel: 'Nassau',
    banner: '#0D47A1',
    description: 'Classic 3-part match: Front 9, Back 9, and 18-hole total.',
    requires18: true,
  },
  vegas: {
    label: 'Vegas',
    recentLabel: 'Vegas',
    banner: '#E91E63',
    description: '2v2 per-hole points. Scores are concatenated (e.g. 4 and 5 makes 45).',
  },
  wolf: {
    label: 'Wolf',
    recentLabel: 'Wolf',
    banner: '#607D8B',
    description: 'Rotational 4-player game. The "Wolf" tees off first and can choose a partner or play lone wolf.',
  },
  wolfvegas: {
    label: 'Wolf Vegas',
    recentLabel: 'Wolf Vegas',
    banner: '#AB47BC',
    description: '4-player Wolf combined with Vegas. The rotating Wolf picks a partner, goes Lone (x2) or Blind (x3); sides form two-digit Vegas numbers and the difference is the points swing.',
  },
  aggregate: {
    label: '2-Ball Aggregate',
    recentLabel: '2-Ball Aggregate',
    banner: '#26A69A',
    description: "2-Ball teams. Both partners' net scores are summed each hole; teams compete pairwise per hole plus a per-nine bonus.",
  },
};

export const GAME_ORDER = Object.keys(GAMES);

export const gameDescriptions = Object.fromEntries(
  GAME_ORDER.map((k) => [k, GAMES[k].description])
);

export const gameRecentLabels = Object.fromEntries(
  GAME_ORDER.map((k) => [k, GAMES[k].recentLabel])
);

export function gameBanner(gameType) {
  return GAMES[gameType]?.banner || '#4CAF50';
}
