// =====================================================================================
// Team helpers shared across grids. Player records come from Supabase in a few shapes
// (joined `teams.team_name`, flat `team`, or `team_name`), so resolution is normalized
// in one place here.
// =====================================================================================

export const TEAM_COLOR_PALETTE = ['#4CAF50', '#2196F3', '#9C27B0', '#FF5722', '#FFC107', '#00BCD4'];

/** Resolve a player's team name across the various record shapes. */
export function getPlayerTeam(player) {
  return player.teams?.team_name || player.team || player.team_name || 'Unknown';
}

/** Distinct, known team names for the field (excludes 'Unknown'). */
export function activeTeams(players) {
  return [...new Set(players.map(getPlayerTeam).filter((t) => t && t !== 'Unknown'))];
}

/** Players belonging to a given team name. */
export function getTeamPlayers(players, teamName) {
  return players.filter((p) => getPlayerTeam(p) === teamName);
}

// One golfer's part of a side's name: the first `letters` letters of the first name, then the
// last initial if there is a last name. "Rough" -> "R", then "Ro"; "Pat Par" -> "PP", then "PaP".
function golferInitials(name, letters) {
  const parts = name.trim().split(/\s+/);
  const first = parts[0];
  const head = first.slice(0, 1).toUpperCase() + first.slice(1, letters).toLowerCase();
  return parts.length === 1 ? head : head + parts[parts.length - 1].slice(0, 1).toUpperCase();
}

const clashing = (names) => names.map((n, i) => (names.indexOf(n) !== i || names.lastIndexOf(n) !== i ? i : -1)).filter((i) => i >= 0);

/**
 * The name each side of a round is saved under, from its golfers' names: `sides` is one array of
 * names per side, and the result is one name per side, in the same order.
 *
 * A side is its golfers' initials joined with "-": ["Hazard", "Mulligan"] is "H-M". The names
 * must all differ, because every golfer is matched to a side by this name, in the round's save and
 * in every grid. Two golfers who share an initial and each play for themselves were both "R", so
 * both were saved onto the same side. Sides that would share a name take more letters of the
 * first name until they differ ("Ro" and "Ra"); the other sides keep their initials. Sides that
 * letters cannot tell apart, two golfers both called Ryan, are numbered.
 */
export function sideNames(sides) {
  const name = (side, letters) => side.map((g) => golferInitials(g, letters)).join('-');
  const names = sides.map((side) => name(side, 1));

  const longest = Math.max(0, ...sides.flat().map((g) => g.trim().split(/\s+/)[0].length));
  for (let letters = 2; letters <= longest && clashing(names).length > 0; letters++) {
    clashing(names).forEach((i) => { names[i] = name(sides[i], letters); });
  }

  const count = {};
  const numbered = new Set(clashing(names).map((i) => names[i]));
  return names.map((n) => {
    if (!numbered.has(n)) return n;
    count[n] = (count[n] || 0) + 1;
    return `${n}${count[n]}`;
  });
}

/** Map of team name -> color, stable by team order. */
export function teamColorMap(teams) {
  const map = {};
  teams.forEach((t, i) => { map[t] = TEAM_COLOR_PALETTE[i % TEAM_COLOR_PALETTE.length]; });
  return map;
}
