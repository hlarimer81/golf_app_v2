import { test, expect } from './fixtures.js';

// A round reopened later must look the way it was set up. Opening one from Previous Rounds used
// to drop the holes, the starting hole, play-off-low and the handicap allowance, so a back-nine
// round came back as 18 holes from the 1st with handicaps worked out on the defaults. Joining by
// code restored all four. Both now go through the same code.
//
// The round here: nine holes from the 10th, net, 90% allowance, NOT playing off the low handicap.
//   Pat Par    saved 14 -> 90% = 13
//   Bo Birdie  saved  6 -> 90% =  5
// With the defaults (100%, play off low) those would read 8 and 0.

const MATCH = {
  id: 'match-back-nine',
  match_code: 'BACK09',
  match_name: null,
  game_type: 'singles',
  play_mode: 'singles',
  use_handicaps: true,
  course_name: 'Test Links',
  course_id: 'course-test-links',
  tee_box_id: 'tee-white',
  holes: 9,
  start_hole: 10,
  play_off_low: false,
  handicap_allowance_pct: 90,
  status: 'in_progress',
  created_at: new Date().toISOString(),
};

const PLAYERS = [
  { id: 'mp-pat', player_name: 'Pat Par', handicap: 14, match_id: MATCH.id, team_id: 't1', teams: { team_name: 'P' } },
  { id: 'mp-bo', player_name: 'Bo Birdie', handicap: 6, match_id: MATCH.id, team_id: 't2', teams: { team_name: 'B' } },
];

// Serve the one round and its players; everything else falls through to the fixture mock.
async function serveRound(page) {
  await page.route('**/rest/v1/matches*', (route) => {
    if (route.request().method() !== 'GET') return route.fallback();
    // .single() asks for one object rather than a list.
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
}

async function expectTheRoundAsSetUp(page) {
  // The back nine, and only the back nine.
  await expect(page.locator('#score-10-0')).toBeVisible();
  await expect(page.locator('#score-18-0')).toBeVisible();
  await expect(page.locator('#score-1-0')).toHaveCount(0);
  await expect(page.locator('#score-9-0')).toHaveCount(0);

  // 90% of each handicap, not played off the low one.
  await expect(page.getByText('HCP: 13', { exact: true })).toBeVisible();
  await expect(page.getByText('HCP: 5', { exact: true })).toBeVisible();
}

test.describe('reopening a round', () => {
  test.beforeEach(async ({ page }) => {
    await serveRound(page);
    await page.goto('/');
    await expect(page.getByRole('button', { name: 'Start Round' })).toBeVisible();
  });

  test('from Previous Rounds, it opens with its own holes and handicap settings', async ({ page }) => {
    await page.getByRole('button', { name: 'Previous Rounds' }).click();
    await page.getByText('BACK09').click();

    await expectTheRoundAsSetUp(page);
  });

  test('joined by code, it opens the same way', async ({ page }) => {
    await page.getByRole('button', { name: 'Join Round' }).click();
    await page.getByPlaceholder('ABC123').fill('BACK09');
    await page.getByRole('button', { name: 'Join Round' }).click();

    await expectTheRoundAsSetUp(page);
  });
});
