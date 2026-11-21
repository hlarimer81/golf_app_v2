import { test, expect } from './fixtures.js';

// The OUT/IN/TOT subtotals summed the raw gross strokes per hole even in a Net round, while the
// leaderboard above the grid and the small per-hole overlay already used the net figure. A golfer
// checking the card mid-round saw a gross number that matched nothing else on the screen (issue
// #88, found by Rake).
//
// Test Links stroke indexes for holes 1-4 are 7, 11, 17 and 1. Pat plays off 9, so holes 1 and 4
// each give a stroke: four holes of 5 is gross 20, net 18.

const NET_MATCH = {
  id: 'match-singles-net-out',
  match_code: 'SNETOUT',
  match_name: null,
  game_type: 'singles',
  play_mode: 'singles',
  use_handicaps: true,
  play_off_low: false,
  handicap_allowance_pct: 100,
  course_name: 'Test Links',
  course_id: 'course-test-links',
  tee_box_id: 'tee-white',
  holes: 18,
  start_hole: 1,
  status: 'in_progress',
  created_at: new Date().toISOString(),
};

const PLAYERS = [
  { id: 'match-singles-net-out-pat', player_name: 'Pat Par', handicap: 9, match_id: NET_MATCH.id, team_id: 't1', teams: { team_name: 'P' } },
  { id: 'match-singles-net-out-bo', player_name: 'Bo Birdie', handicap: 0, match_id: NET_MATCH.id, team_id: 't2', teams: { team_name: 'B' } },
];

const SCORES = [1, 2, 3, 4].flatMap((hole) => [
  { match_id: NET_MATCH.id, player_id: 'match-singles-net-out-pat', hole_number: hole, strokes: 5 },
  { match_id: NET_MATCH.id, player_id: 'match-singles-net-out-bo', hole_number: hole, strokes: 4 },
]);

test('a Net round sums OUT/TOT from net strokes, not gross (issue #88)', async ({ page }) => {
  await page.route('**/rest/v1/matches*', (route) => {
    if (route.request().method() !== 'GET') return route.fallback();
    const single = (route.request().headers()['accept'] || '').includes('vnd.pgrst.object');
    return route.fulfill({ json: single ? NET_MATCH : [NET_MATCH] });
  });
  await page.route('**/rest/v1/players*', (route) => {
    const url = new URL(route.request().url());
    if (route.request().method() !== 'GET' || url.searchParams.get('match_id') !== `eq.${NET_MATCH.id}`) {
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
  await page.getByPlaceholder('ABC123').fill(NET_MATCH.match_code);
  await page.getByRole('button', { name: 'Join Round' }).click();
  await expect(page.locator('#score-1-0')).toBeVisible();

  // Only holes 1-4 have scores, so IN is still empty and OUT equals TOT: both should read the net
  // total (18), never the gross total (20) the bug showed.
  const patRow = page.getByRole('row').filter({ hasText: 'Pat Par' });
  await expect(patRow.getByRole('cell', { name: '18', exact: true })).toHaveCount(2);
  await expect(patRow.getByRole('cell', { name: '20', exact: true })).toHaveCount(0);
});
