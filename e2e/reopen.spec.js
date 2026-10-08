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

// Issue #19: a round opened from Previous Rounds and one joined by code used to list players in
// whatever order Postgres happened to hand back an unordered SELECT - not necessarily the order
// they were added at setup, and not necessarily the same order on both screens. The fix asks for
// the players in `id` order explicitly; this mock only returns that order when the request says so,
// so the test fails the way the bug did if either read path drops the `.order('id')`.
const ORDER_MATCH = {
  id: 'match-row-order',
  match_code: 'ROWORD',
  match_name: null,
  game_type: 'singles',
  play_mode: 'singles',
  use_handicaps: false,
  course_name: 'Test Links',
  course_id: 'course-test-links',
  tee_box_id: 'tee-white',
  holes: 18,
  start_hole: 1,
  play_off_low: true,
  handicap_allowance_pct: 100,
  status: 'in_progress',
  created_at: new Date().toISOString(),
};

// Added at setup in this order (and so given ids in this order): Hazard, Rough, Rake, Mulligan.
const ORDER_PLAYERS_BY_ID = [
  { id: 'mp-1', player_name: 'Hazard', handicap: 0, match_id: ORDER_MATCH.id, team_id: 't1', teams: { team_name: 'Hazard' } },
  { id: 'mp-2', player_name: 'Rough', handicap: 0, match_id: ORDER_MATCH.id, team_id: 't2', teams: { team_name: 'Rough' } },
  { id: 'mp-3', player_name: 'Rake', handicap: 0, match_id: ORDER_MATCH.id, team_id: 't3', teams: { team_name: 'Rake' } },
  { id: 'mp-4', player_name: 'Mulligan', handicap: 0, match_id: ORDER_MATCH.id, team_id: 't4', teams: { team_name: 'Mulligan' } },
];

async function serveScrambledRound(page) {
  await page.route('**/rest/v1/matches*', (route) => {
    if (route.request().method() !== 'GET') return route.fallback();
    const single = (route.request().headers()['accept'] || '').includes('vnd.pgrst.object');
    return route.fulfill({ json: single ? ORDER_MATCH : [ORDER_MATCH] });
  });
  await page.route('**/rest/v1/players*', (route) => {
    const url = new URL(route.request().url());
    if (route.request().method() !== 'GET' || url.searchParams.get('match_id') !== `eq.${ORDER_MATCH.id}`) {
      return route.fallback();
    }
    // An unordered SELECT from Postgres - stands in for whatever physical order the rows happen
    // to live in, which is not the order they were inserted.
    const unordered = [ORDER_PLAYERS_BY_ID[2], ORDER_PLAYERS_BY_ID[0], ORDER_PLAYERS_BY_ID[3], ORDER_PLAYERS_BY_ID[1]];
    const ordered = url.searchParams.get('order') === 'id.asc' ? ORDER_PLAYERS_BY_ID : unordered;
    return route.fulfill({ json: ordered });
  });
}

async function rowOrder(page) {
  return page.locator('tbody tr td:first-child').allTextContents();
}

test.describe('scorecard row order', () => {
  test.beforeEach(async ({ page }) => {
    await serveScrambledRound(page);
    await page.goto('/');
    await expect(page.getByRole('button', { name: 'Start Round' })).toBeVisible();
  });

  test('from Previous Rounds, rows follow the order players were added, not the read order', async ({ page }) => {
    await page.getByRole('button', { name: 'Previous Rounds' }).click();
    await page.getByText('ROWORD').click();

    await expect(page.locator('#score-1-0')).toBeVisible();
    const names = (await rowOrder(page)).map(t => t.split('\n')[0].trim());
    expect(names).toEqual(['Hazard', 'Rough', 'Rake', 'Mulligan']);
  });

  test('joined by code, rows are in the same order', async ({ page }) => {
    await page.getByRole('button', { name: 'Join Round' }).click();
    await page.getByPlaceholder('ABC123').fill('ROWORD');
    await page.getByRole('button', { name: 'Join Round' }).click();

    await expect(page.locator('#score-1-0')).toBeVisible();
    const names = (await rowOrder(page)).map(t => t.split('\n')[0].trim());
    expect(names).toEqual(['Hazard', 'Rough', 'Rake', 'Mulligan']);
  });
});
