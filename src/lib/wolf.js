import { netScore } from './golf';

// =====================================================================================
// Wolf points, pure. WolfGrid (live panel) and MatchSummary (Finish Round) both call this, so
// every view of a round reads the same standings from the same saved partner picks (issue #46).
//
// decisions[holeNum] = partnerPlayerId | 'lone' (matches.wolf.decisions). Who was Wolf is not stored:
// it follows from the rotation, see wolfIndex().
// =====================================================================================

// The Wolf rotates through the players in order, one per played hole. The index is taken within
// the played sequence, not the raw hole number, so a back-nine round starts with the first player.
export function wolfIndex(holeNumbers, holeNum, playerCount) {
  const seqIdx = holeNumbers.indexOf(holeNum);
  const i = seqIdx >= 0 ? seqIdx : (holeNum - 1);
  return i % playerCount;
}

// Points per player id. A hole counts only once it has a decision and every player has a score.
//   Wolf + partner vs the rest: the side with the best net ball gets 2 points each.
//   Lone Wolf: the Wolf gets 4 for beating everyone's best ball, otherwise each other player gets 2.
//   A tie scores nothing.
export function wolfPoints({ players, scores, decisions, holeNumbers, hcds, useHandicaps }) {
  const points = {};
  players.forEach(p => { points[p.id] = 0; });
  if (!players.length) return points;

  for (const hole of holeNumbers) {
    const partner = decisions?.[hole];
    if (!partner) continue;
    const wolfId = players[wolfIndex(holeNumbers, hole, players.length)].id;

    const net = {};
    let allScored = true;
    players.forEach(p => {
      const n = netScore(scores?.[p.id]?.[hole], hole - 1, p.handicap ?? p.hcp ?? 0, hcds, useHandicaps);
      if (n === null) allScored = false;
      net[p.id] = n;
    });
    if (!allScored) continue;

    if (partner === 'lone') {
      const others = players.filter(p => p.id !== wolfId);
      const bestOther = Math.min(...others.map(p => net[p.id]));
      if (net[wolfId] < bestOther) points[wolfId] += 4;
      else if (net[wolfId] > bestOther) others.forEach(p => { points[p.id] += 2; });
    } else {
      // A partner id that is no longer in the round (or is the Wolf) can't form a side.
      if (partner === wolfId || !players.some(p => p.id === partner)) continue;
      const wolfSide = [wolfId, partner];
      const otherSide = players.map(p => p.id).filter(id => !wolfSide.includes(id));
      const bestWolf = Math.min(...wolfSide.map(id => net[id]));
      const bestOther = Math.min(...otherSide.map(id => net[id]));
      if (bestWolf < bestOther) wolfSide.forEach(id => { points[id] += 2; });
      else if (bestOther < bestWolf) otherSide.forEach(id => { points[id] += 2; });
    }
  }
  return points;
}
