export const GOLF_COURSES = {
  "AGCC": {
    pars: [5, 4, 4, 3, 4, 4, 4, 4, 3, 4, 4, 3, 5, 3, 5, 4, 4, 4],
    handicaps: [3, 7, 13, 15, 11, 1, 9, 5, 17, 6, 12, 16, 2, 18, 8, 14, 10, 4]
  },

  // --- Gulf Shores, Alabama Courses ---

  "Kiva Dunes": {
    pars: [4, 5, 3, 4, 5, 4, 4, 3, 4, 4, 4, 4, 3, 5, 5, 4, 3, 4],
    handicaps: [17, 11, 9, 15, 7, 5, 1, 13, 3, 16, 18, 2, 12, 6, 14, 10, 8, 4]
  },

  "Craft Farms - Cotton Creek": {
    pars: [4, 4, 5, 3, 4, 4, 5, 3, 4, 5, 4, 4, 3, 4, 4, 3, 5, 4],
    handicaps: [13, 5, 3, 15, 9, 1, 7, 17, 11, 10, 4, 12, 16, 6, 14, 18, 2, 8]
  },

  "Craft Farms - Cypress Bend": {
    pars: [4, 4, 5, 4, 4, 3, 5, 3, 4, 4, 4, 3, 5, 4, 3, 4, 4, 5],
    handicaps: [9, 1, 11, 5, 13, 15, 3, 17, 7, 8, 4, 14, 12, 2, 18, 16, 10, 6]
  }
};

// --- Peninsula Golf Club (3 nine-hole courses) ---
// Select any 2 of 3 nines to make an 18-hole round

export const PENINSULA_NINES = {
  "Marsh": {
    pars: [4, 5, 4, 3, 4, 4, 4, 3, 5],
    handicaps: [4, 1, 2, 8, 5, 7, 6, 9, 3]
  },
  "Lakes": {
    pars: [4, 4, 4, 3, 4, 5, 5, 3, 4],
    handicaps: [6, 3, 5, 8, 4, 7, 2, 9, 1]
  },
  "Cypress": {
    pars: [4, 5, 3, 4, 3, 4, 4, 5, 4],
    handicaps: [9, 4, 3, 7, 8, 5, 6, 1, 2]
  }
};

// Helper to combine two Peninsula nines into an 18-hole course
export function combinePeninsulaNines(nine1Name, nine2Name) {
  const nine1 = PENINSULA_NINES[nine1Name];
  const nine2 = PENINSULA_NINES[nine2Name];
  if (!nine1 || !nine2) return null;

  // Combine pars directly
  const pars = [...nine1.pars, ...nine2.pars];

  // For handicaps, we need to interleave them properly for 18 holes
  // Front 9 gets odd handicaps (1,3,5,7,9,11,13,15,17), back 9 gets even (2,4,6,8,10,12,14,16,18)
  // We'll rank each nine's holes by difficulty and assign accordingly
  const rankNine = (hcps) => {
    const indexed = hcps.map((h, i) => ({ h, i }));
    indexed.sort((a, b) => a.h - b.h);
    return indexed.map(x => x.i);
  };

  const front9Ranks = rankNine(nine1.handicaps);
  const back9Ranks = rankNine(nine2.handicaps);

  const handicaps = Array(18).fill(0);
  const oddHcps = [1, 3, 5, 7, 9, 11, 13, 15, 17];
  const evenHcps = [2, 4, 6, 8, 10, 12, 14, 16, 18];

  front9Ranks.forEach((holeIdx, rank) => {
    handicaps[holeIdx] = oddHcps[rank];
  });
  back9Ranks.forEach((holeIdx, rank) => {
    handicaps[9 + holeIdx] = evenHcps[rank];
  });

  return { pars, handicaps };
}
