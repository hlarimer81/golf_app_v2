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

/** Map of team name -> color, stable by team order. */
export function teamColorMap(teams) {
  const map = {};
  teams.forEach((t, i) => { map[t] = TEAM_COLOR_PALETTE[i % TEAM_COLOR_PALETTE.length]; });
  return map;
}
