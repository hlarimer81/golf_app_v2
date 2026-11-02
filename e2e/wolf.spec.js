import { test, expect } from './fixtures.js';

// Wolf partner picks lived only in the scoring phone's React state. A second phone joining the
// round, and the Finish Round summary, could tell who was Wolf but not who partnered whom, so they
// showed every player on 0 points and four gold medals (issue #46). The picks are saved to
// matches.wolf now, and every view totals them the same way.
//
// Four gross holes on Test Links (pars 4 4 3 5). Wolf rotates Pat, Bo, Sandy, Gil.
//   1  Pat + Sandy   3 4 5 4   Pat and Sandy's 3 wins          Pat 2, Sandy 2
//   2  Bo + Gil      4 3 4 5   Bo's 3 wins                     Bo 2, Gil 2
//   3  Sandy lone    5 5 3 4   Sandy's 3 beats everyone        Sandy 4
//   4  Gil + Pat     4 4 4 5   4 vs 4, halved
// Totals: Pat 2, Bo 2, Sandy 6, Gil 2. Sandy wins outright.

const MATCH = {
  id: 'match-wolf',
  match_code: 'WOLF01',
  match_name: null,
  game_type: 'wolf',
  play_mode: 'singles',
  use_handicaps: false,
  course_name: 'Test Links',
  course_id: 'course-test-links',
  tee_box_id: 'tee-white',
  holes: 18,
  start_hole: 1,
  status: 'in_progress',
  created_at: new Date().toISOString(),
  wolf: { decisions: { 1: 'w-sandy', 2: 'w-gil', 3: 'lone', 4: 'w-pat' } },
};

const PLAYERS = [
  { id: 'w-pat', player_name: 'Pat Par', handicap: 0, match_id: MATCH.id, team_id: 't1', teams: { team_name: 'P' } },
  { id: 'w-bo', player_name: 'Bo Birdie', handicap: 0, match_id: MATCH.id, team_id: 't2', teams: { team_name: 'B' } },
  { id: 'w-sandy', player_name: 'Sandy Trap', handicap: 0, match_id: MATCH.id, team_id: 't3', teams: { team_name: 'S' } },
  { id: 'w-gil', player_name: 'Gil Green', handicap: 0, match_id: MATCH.id, team_id: 't4', teams: { team_name: 'G' } },
];

const STROKES = { 1: [3, 4, 5, 4], 2: [4, 3, 4, 5], 3: [5, 5, 3, 4], 4: [4, 4, 4, 5] };
const SCORES = Object.entries(STROKES).flatMap(([hole, row]) => row.map((strokes, i) => (
  { match_id: MATCH.id, player_id: PLAYERS[i].id, hole_number: Number(hole), strokes }
)));

// Join the round by code as a second phone would, with the picks already saved by the first.
async function joinRound(page) {
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
}

test('a second phone shows the Wolf points from the saved picks, not 0 (issue #46)', async ({ page }) => {
  await joinRound(page);
  await expect(page.getByText('Pts: 6', { exact: true })).toBeVisible();
  await expect(page.getByText('Pts: 2', { exact: true })).toHaveCount(3);
  // The next hole without a pick is the 5th, and the rotation is back to Pat.
  await expect(page.getByText(/HOLE 5 — 🐺 Pat IS THE WOLF/)).toBeVisible();
});

test('the Finish Round summary ranks the Wolf leader first, not a four-way tie (issue #46)', async ({ page }) => {
  await joinRound(page);
  await page.getByRole('button', { name: /Finish Round/ }).click();
  await expect(page.getByText(/Round Complete/)).toBeVisible();

  const sandyRow = page.getByRole('row').filter({ hasText: 'Sandy Trap' });
  await expect(sandyRow.getByRole('cell', { name: '6', exact: true })).toBeVisible();
  await expect(sandyRow.getByRole('cell', { name: '🥇', exact: true })).toBeVisible();
  await expect(page.getByRole('cell', { name: '🥇', exact: true })).toHaveCount(1);
  await expect(page.getByText(/Partner selections are not saved/)).toHaveCount(0);
});

test('picking a Wolf partner saves it to the round', async ({ page }) => {
  let saved = null;
  await page.route('**/rest/v1/matches*', (route) => {
    if (route.request().method() !== 'PATCH') return route.fallback();
    saved = JSON.parse(route.request().postData() || '{}');
    return route.fulfill({ json: [{ id: MATCH.id }] });
  });
  await joinRound(page);

  await page.getByRole('button', { name: 'Bo', exact: true }).click();
  await expect.poll(() => saved?.wolf?.decisions?.[5]).toBe('w-bo');
  // The whole state goes up, so the earlier holes' picks are kept.
  expect(saved.wolf.decisions[3]).toBe('lone');
  // The panel moves on to the 6th, where Bo is Wolf.
  await expect(page.getByText(/HOLE 6 — 🐺 Bo IS THE WOLF/)).toBeVisible();
});
