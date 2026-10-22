import { describe, it, expect } from 'vitest';
import { skinsStandings } from './skinsStandings';
import { settleSkins, EMPTY_WAGER } from '../settlement';

// Fixture reproducing the round from issue #35 (Hazard, scenario skins-9-net-carry-wager):
// Mulligan won 6 skins and +$15, Rake won 2 skins but was net -$1, Hazard won 1 skin,
// Rough won 0 skins and was the biggest loser at -$9. The generic net-Stableford 'points'
// MatchSummary used before the fix had Rough and Mulligan tied for 1st (12 pts) and Hazard
// and Rake tied for last (10 pts) - exactly backwards from the skins/money result.
const playerStats = [
  { id: 'mulligan', name: 'Mulligan', points: 12 },
  { id: 'rake', name: 'Rake', points: 10 },
  { id: 'hazard', name: 'Hazard', points: 10 },
  { id: 'rough', name: 'Rough', points: 12 },
];

const skinTotals = { mulligan: 6, rake: 2, hazard: 1, rough: 0 };

const players = playerStats.map((p) => ({ id: p.id, player_name: p.name }));
const wager = { ...EMPTY_WAGER, per_skin: 1 };
const settlement = settleSkins({ players, wager, skinsById: skinTotals, holeWinners: [] });

describe('skinsStandings', () => {
  it('ranks by skins actually won, not by the generic points stat', () => {
    const standings = skinsStandings(playerStats, skinTotals, settlement);
    expect(standings.map((p) => p.id)).toEqual(['mulligan', 'rake', 'hazard', 'rough']);
    expect(standings.map((p) => p.skinsWon)).toEqual([6, 2, 1, 0]);

    // The generic points sort ties Rough for 1st (0 skins, biggest money loser) and Rake
    // for last (2 skins won) - the exact contradiction the issue reported. Confirm this
    // fixture actually disagrees, so the test is proving something.
    const byPoints = [...playerStats].sort((a, b) => b.points - a.points).map((p) => p.id);
    expect(byPoints.indexOf('rough')).toBeLessThan(2);
    expect(standings.findIndex((p) => p.id === 'rough')).toBe(3);
  });

  it('carries the settlement $ net alongside the skins count', () => {
    const standings = skinsStandings(playerStats, skinTotals, settlement);
    const byId = Object.fromEntries(standings.map((p) => [p.id, p.moneyNet]));
    expect(byId.mulligan).toBe(15);
    expect(byId.rake).toBe(-1);
    expect(byId.rough).toBe(-9);
  });

  it('leaves money as null when there is no settlement (no wager)', () => {
    const standings = skinsStandings(playerStats, skinTotals, null);
    expect(standings.every((p) => p.moneyNet === null)).toBe(true);
  });
});
