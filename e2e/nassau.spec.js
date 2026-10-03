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

async function serveRound(page) {
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
