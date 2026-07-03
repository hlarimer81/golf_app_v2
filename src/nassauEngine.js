// =====================================================================================
// Nassau compute engine (JS port of golf_scoring_nassau.c).
//
// Three concurrent match-play matches — Front 9 / Back 9 / Overall 18 — between two
// sides, plus manual presses. A press spawned "after hole h" is its own sub-match on
// the same segment starting at hole h+1. Each match tracks side 0's running lead in
// hole wins and closes out once |lead| > holesRemaining.
//
//   sideNet[side][holeIdx]  best (lowest) net stroke for that side on that hole, 0 if
//                           unscored. Sides are the two teams; net honours the "off-low"
//                           handicap convention (each hcp reduced by the match-wide low).
//
// Returns { matches:[...], err } where each match is:
//   { segment:'front'|'back'|'overall', kind:'primary'|'press',
//     startHole, endHole,        (0-based inclusive)
//     throughHole, sideLead, holesRemaining,
//     closedOut, closedAtHole, winMargin, winHolesLeft,
//     parent, pressAfterHole }
// =====================================================================================

const SEG = { front: 'front', back: 'back', overall: 'overall' };
const segStart = (seg) => (seg === SEG.back ? 9 : 0);
const segEnd = (seg) => (seg === SEG.front ? 8 : 17);

// players: [{ id, team, handicap, netByHole:{holeNum->net} }]  (holeNum is 1-based)
// manualPressHoles: array of 0-based hole indices AFTER which a manual press was added.
export function computeNassau({ sides, sideNet, manualPressHoles = [] }) {
  const matches = [];
  const add = (segment, kind, start, parent, after) => {
    const idx = matches.length;
    matches.push({
      segment, kind, startHole: start, endHole: segEnd(segment),
      throughHole: -1, sideLead: 0, holesRemaining: segEnd(segment) - start + 1,
      closedOut: false, closedAtHole: -1, winMargin: 0, winHolesLeft: 0,
      parent: parent ?? -1, pressAfterHole: after ?? -1, autoPressed: false,
    });
    return idx;
  };

  // Primaries.
  const primSegs = [SEG.front, SEG.back, SEG.overall];
  const primIdx = primSegs.map((seg) => add(seg, 'primary', segStart(seg), -1, -1));

  for (let h = 0; h < 18; h++) {
    const s0 = sideNet[0][h] || 0;
    const s1 = sideNet[1][h] || 0;
    if (s0 === 0 || s1 === 0) continue; // both sides must have scored.

    const nBefore = matches.length;
    for (let mi = 0; mi < nBefore; mi++) {
      const mm = matches[mi];
      if (mm.closedOut) continue;
      if (h < mm.startHole || h > mm.endHole) continue;
      if (s0 < s1) mm.sideLead++;
      else if (s0 > s1) mm.sideLead--;
      mm.throughHole = h;
      mm.holesRemaining = mm.endHole - h;
      const lead = Math.abs(mm.sideLead);
      if (lead > mm.holesRemaining) {
        mm.closedOut = true;
        mm.closedAtHole = h;
        mm.winMargin = lead;
        mm.winHolesLeft = mm.holesRemaining;
      }
    }

    // Manual presses requested after hole h -> one press per still-open primary segment.
    if (manualPressHoles.includes(h)) {
      primSegs.forEach((seg, s) => {
        const pi = primIdx[s];
        if (matches[pi].closedOut) return;
        if (h + 1 > segEnd(seg)) return;
        add(seg, 'press', h + 1, pi, h);
      });
    }
  }

  return { matches, sides };
}

// Roll the computed matches into settlement segments for settleNassau().
// wager.nassau_front/back/overall are the primary stakes; press stake = nassau_press
// (0 = inherit the parent primary's stake). winner is side-0-name / side-1-name / null.
export function nassauSettlementSegments({ matches, sideNames, wager }) {
  const stakeFor = (m) => {
    if (m.kind === 'primary') {
      if (m.segment === 'front') return wager.nassau_front || 0;
      if (m.segment === 'back') return wager.nassau_back || 0;
      return wager.nassau_overall || 0;
    }
    // press: inherit parent's stake if nassau_press is 0
    if ((wager.nassau_press || 0) > 0) return wager.nassau_press;
    const parent = matches[m.parent];
    if (!parent) return 0;
    if (parent.segment === 'front') return wager.nassau_front || 0;
    if (parent.segment === 'back') return wager.nassau_back || 0;
    return wager.nassau_overall || 0;
  };

  const segLabel = (m) => {
    const base = m.segment === 'front' ? 'Front 9' : m.segment === 'back' ? 'Back 9' : 'Overall';
    if (m.kind === 'primary') return base;
    return `${base} press (after ${m.pressAfterHole + 1})`;
  };

  return matches
    .map((m) => {
      const stake = stakeFor(m);
      let winner = null;
      // A match only pays out if it's decided: either closed out, or fully played with a lead.
      const decided = m.closedOut || (m.throughHole === m.endHole && m.sideLead !== 0);
      if (decided) winner = m.sideLead > 0 ? sideNames[0] : m.sideLead < 0 ? sideNames[1] : null;
      return { label: segLabel(m), winner, stake };
    })
    .filter((s) => s.stake > 0);
}
