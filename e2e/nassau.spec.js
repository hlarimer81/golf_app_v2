import { test, expect } from './fixtures.js';

// The live Nassau status read each golfer's team from `player.team`, but players come back from
// the database with it in `teams.team_name`. Nobody was on either side, so FRONT 9 / OVERALL /
// BACK 9 read "AS" all round and every hole said "Not enough scores yet" (issue #12). Only the
// Finish Round summary, which used the team helpers, had it right.
//
// The round here, gross, three holes in:
//   hole 1  Pat 4  Bo 5   P wins
//   hole 2  Pat 5  Bo 4   B wins
//   hole 3  Pat 4  Bo 3   B wins     -> B +1 on the front and overall, back nine not started

const MATCH = {
  id: 'match-nassau',
  match_code: 'NASSAU',
  match_name: null,
  game_type: 'nassau',
  play_mode: 'singles',
  use_handicaps: false,
  course_name: 'Test Links',
  course_id: 'course-test-links',
  tee_box_id: 'tee-white',
  holes: 18,
  start_hole: 1,
  status: 'in_progress',
  created_at: new Date().toISOString(),
};

// Exactly the shape savePlayers() and the join query get back: the team is a joined row.
const PLAYERS = [
  { id: 'mp-pat', player_name: 'Pat Par', handicap: 0, match_id: MATCH.id, team_id: 't1', teams: { team_name: 'P' } },
  { id: 'mp-bo', player_name: 'Bo Birdie', handicap: 0, match_id: MATCH.id, team_id: 't2', teams: { team_name: 'B' } },
];

const SCORES = [
  [1, 4, 5],
  [2, 5, 4],
  [3, 4, 3],
].flatMap(([hole, pat, bo]) => [
  { match_id: MATCH.id, player_id: 'mp-pat', hole_number: hole, strokes: pat },
  { match_id: MATCH.id, player_id: 'mp-bo', hole_number: hole, strokes: bo },
]);

// A net round on the same course. Test Links' stroke indexes for holes 1-4 are 7, 11, 17 and 1.
// Pat's course handicap is 20 and Bo's 11; played off the low handicap that is Pat 9, Bo 0, so
// Pat gets a stroke on holes 1 and 4 only.
//   hole 1  Pat 5 (net 4)  Bo 4   halved      gross: B wins
//   hole 2  Pat 4          Bo 5   P wins
//   hole 3  Pat 5          Bo 4   B wins
//   hole 4  Pat 4 (net 3)  Bo 4   P wins      gross: halved
//   -> P +1 on the front and overall. Scored gross it would read B +1.
const NET_MATCH = {
  ...MATCH,
  id: 'match-nassau-net',
  match_code: 'NETNAS',
  use_handicaps: true,
  play_off_low: true,
  handicap_allowance_pct: 100,
};

const NET_PLAYERS = [
  { id: 'mp-pat-net', player_name: 'Pat Par', handicap: 20, match_id: NET_MATCH.id, team_id: 't1', teams: { team_name: 'P' } },
  { id: 'mp-bo-net', player_name: 'Bo Birdie', handicap: 11, match_id: NET_MATCH.id, team_id: 't2', teams: { team_name: 'B' } },
];

const NET_SCORES = [
  [1, 5, 4],
  [2, 4, 5],
  [3, 5, 4],
  [4, 4, 4],
].flatMap(([hole, pat, bo]) => [
  { match_id: NET_MATCH.id, player_id: 'mp-pat-net', hole_number: hole, strokes: pat },
  { match_id: NET_MATCH.id, player_id: 'mp-bo-net', hole_number: hole, strokes: bo },
]);

async function serveRound(page, { match = MATCH, players = PLAYERS, scores = SCORES } = {}) {
  await page.route('**/rest/v1/matches*', (route) => {
    if (route.request().method() !== 'GET') return route.fallback();
    const single = (route.request().headers()['accept'] || '').includes('vnd.pgrst.object');
    return route.fulfill({ json: single ? match : [match] });
  });
  await page.route('**/rest/v1/players*', (route) => {
    const url = new URL(route.request().url());
    if (route.request().method() !== 'GET' || url.searchParams.get('match_id') !== `eq.${match.id}`) {
      return route.fallback();
    }
    return route.fulfill({ json: players });
  });
  await page.route('**/rest/v1/scores*', (route) => {
    if (route.request().method() !== 'GET') return route.fallback();
    return route.fulfill({ json: scores });
  });
}

test('the live Nassau status follows the holes as they are won', async ({ page }) => {
  await serveRound(page);
  await page.goto('/');
  await page.getByRole('button', { name: 'Join Round' }).click();
  await page.getByPlaceholder('ABC123').fill('NASSAU');
  await page.getByRole('button', { name: 'Join Round' }).click();

  const status = (label) => page.getByText(label, { exact: true }).locator('xpath=following-sibling::div[1]');
  await expect(status('FRONT 9')).toHaveText('B +1');
  await expect(status('OVERALL')).toHaveText('B +1');
  await expect(status('BACK 9')).toHaveText('AS');

  // Hole 1's explainer names the winner and each golfer's side.
  await page.getByRole('button', { name: 'i', exact: true }).first().click();
  await expect(page.getByText('P wins the hole (low net 4).')).toBeVisible();
  await expect(page.getByText('Team undefined')).toHaveCount(0);
});

// Nobody gets strokes in a gross round, so a handicap line could only ever read "HCP: 0" (#15).
test('a gross round shows no handicap on the scorecard or the summary', async ({ page }) => {
  await serveRound(page);
  await page.goto('/');
  await page.getByRole('button', { name: 'Join Round' }).click();
  await page.getByPlaceholder('ABC123').fill('NASSAU');
  await page.getByRole('button', { name: 'Join Round' }).click();

  await expect(page.getByText('FRONT 9', { exact: true })).toBeVisible();
  await expect(page.getByText(/HCP/)).toHaveCount(0);

  await page.getByRole('button', { name: /Finish Round/ }).click();
  await expect(page.getByText(/Round Complete/)).toBeVisible();
  await expect(page.getByRole('columnheader', { name: 'Gross' })).toBeVisible();
  await expect(page.getByRole('columnheader', { name: 'HCP' })).toHaveCount(0);
});

test('a net Nassau gives each golfer the strokes of their playing handicap', async ({ page }) => {
  await serveRound(page, { match: NET_MATCH, players: NET_PLAYERS, scores: NET_SCORES });
  await page.goto('/');
  await page.getByRole('button', { name: 'Join Round' }).click();
  await page.getByPlaceholder('ABC123').fill('NETNAS');
  await page.getByRole('button', { name: 'Join Round' }).click();

  // Played off the low handicap: 20 and 11 become 9 and 0.
  await expect(page.getByText('HCP: 9', { exact: true })).toBeVisible();
  await expect(page.getByText('HCP: 0', { exact: true })).toBeVisible();

  const status = (label) => page.getByText(label, { exact: true }).locator('xpath=following-sibling::div[1]');
  await expect(status('FRONT 9')).toHaveText('P +1');
  await expect(status('OVERALL')).toHaveText('P +1');
  await expect(status('BACK 9')).toHaveText('AS');

  // Hole 4 is stroke index 1: Pat's 4 is a net 3 and wins it. Not a net 2 - one stroke, not two.
  await page.getByRole('button', { name: 'i', exact: true }).nth(3).click();
  await expect(page.getByText('P wins the hole (low net 3).')).toBeVisible();
});
