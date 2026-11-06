import { test, expect } from './fixtures.js';

// Issue #55: the Round Complete summary's "Per-Hole Points" table only rendered the per-hole
// pairwise half-points, not the per-nine bonus that calculateStandings() also adds into each
// team's headline total (Mulligan, an AI golfer, found the table's own columns summed to less
// than the headline score). The fix renders a bonus row using the same nineBonusPoints() the
// headline total is built from, so the table's columns always sum to the headline.
//
// Three holes (treated as one "nine" since the round isn't 18 holes), no handicaps:
//   Team A: Pat 4+4=8, Bo 4+5=9, Pat 4+4=8          -> holes 8, 9, 8  (total 25)
//   Team B: Sandy 5+5=10, Gil 4+4=8, Sandy 5+4=9    -> holes 10, 8, 9 (total 27)
// Per-hole: A wins holes 1 and 3 (2 each), B wins hole 2 (2) -> A 4 half (2 pts), B 2 half (1 pt).
// Nine bonus: A's total (25) beats B's (27) -> A +2 half (1 pt), B +0.
// Headline: A 3 pts, B 1 pt - but the old table only ever summed to A 2 pts, B 1 pt.
const MATCH = {
  id: 'match-aggregate-summary',
  match_code: 'AGG001',
  match_name: null,
  game_type: 'aggregate',
  play_mode: 'team',
  use_handicaps: false,
  course_name: 'Test Links',
  course_id: 'course-test-links',
  tee_box_id: 'tee-white',
  holes: 3,
  start_hole: 1,
  status: 'in_progress',
  created_at: new Date().toISOString(),
};

const PLAYERS = [
  { id: 'mp-pat', player_name: 'Pat Par', handicap: 0, match_id: MATCH.id, team_id: 't1', teams: { team_name: 'A' } },
  { id: 'mp-bo', player_name: 'Bo Birdie', handicap: 0, match_id: MATCH.id, team_id: 't1', teams: { team_name: 'A' } },
  { id: 'mp-sandy', player_name: 'Sandy Trap', handicap: 0, match_id: MATCH.id, team_id: 't2', teams: { team_name: 'B' } },
  { id: 'mp-gil', player_name: 'Gil Green', handicap: 0, match_id: MATCH.id, team_id: 't2', teams: { team_name: 'B' } },
];

const SCORES = [
  [1, 4, 4, 5, 5],
  [2, 4, 5, 4, 4],
  [3, 4, 4, 5, 4],
].flatMap(([hole, pat, bo, sandy, gil]) => [
  { match_id: MATCH.id, player_id: 'mp-pat', hole_number: hole, strokes: pat },
  { match_id: MATCH.id, player_id: 'mp-bo', hole_number: hole, strokes: bo },
  { match_id: MATCH.id, player_id: 'mp-sandy', hole_number: hole, strokes: sandy },
  { match_id: MATCH.id, player_id: 'mp-gil', hole_number: hole, strokes: gil },
]);

async function finishRound(page) {
  await page.route('**/rest/v1/matches*', (route) => {
    if (route.request().method() !== 'GET') return route.fallback();
    const single = (route.request().headers()['accept'] || '').includes('vnd.pgrst.object');
    return route.fulfill({ json: single ? MATCH : [MATCH] });
  });
  await page.route('**/rest/v1/players*', (route) => {
    const url = new URL(route.request().url());
    if (route.request().method() !== 'GET' || url.searchParams.get('match_id') !== `eq.${MATCH.id}`) {
      return route.fallback();
    }
    return route.fulfill({ json: PLAYERS });
  });
  await page.route('**/rest/v1/scores*', (route) => {
    if (route.request().method() !== 'GET') return route.fallback();
    return route.fulfill({ json: SCORES });
  });

  await page.goto('/');
  await page.getByRole('button', { name: 'Join Round' }).click();
  await page.getByPlaceholder('ABC123').fill(MATCH.match_code);
  await page.getByRole('button', { name: 'Join Round' }).click();
  await page.getByRole('button', { name: /Finish Round/ }).click();
  await expect(page.getByText(/Round Complete/)).toBeVisible();
}

test('Aggregate summary\'s Per-Hole Points table includes the per-nine bonus so it sums to the headline', async ({ page }) => {
  await finishRound(page);

  const bonusRow = page.getByRole('row').filter({ hasText: 'Nine Bonus' });
  await expect(bonusRow).toBeVisible();
  // Team A's lower 9-hole aggregate net (25 vs 27) earns the full bonus point.
  await expect(bonusRow.getByRole('cell', { name: '1', exact: true })).toBeVisible();
  await expect(bonusRow.getByRole('cell', { name: '0', exact: true })).toBeVisible();
});
