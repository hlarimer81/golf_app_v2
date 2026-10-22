// Round Complete standings for Skins. The generic individual leaderboard elsewhere in
// MatchSummary.jsx ranks by a net-Stableford 'points' stat that has nothing to do with Skins -
// a player can win the most skins and the most money and still show up tied for last. Skins
// ranks by skins actually won (what the header tally and Money screen already show), with the
// settlement's $ net carried along for display.
export function skinsStandings(playerStats, skinTotals, settlement) {
  const moneyById = {};
  (settlement?.entities || []).forEach((e) => { moneyById[e.idx] = e.net; });

  return [...playerStats]
    .map((p) => ({
      ...p,
      skinsWon: skinTotals?.[p.id] || 0,
      moneyNet: p.id in moneyById ? moneyById[p.id] : null,
    }))
    .sort((a, b) => b.skinsWon - a.skinsWon);
}
