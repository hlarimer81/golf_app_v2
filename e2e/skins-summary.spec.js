import { test, expect } from './fixtures.js';

// Issue #35: the Round Complete screen for Skins ranked and labelled players by the generic
// net-Stableford 'Points' stat (each player scored against par on their own), not by skins
// actually won (who beat the field head-to-head on a hole). The two can disagree completely.
//
// Three holes, par 4, no handicaps, carryover on:
//   Sue Streaky   4 3 10   hole1 push (carry 1) -> wins hole2 for 1+1=2 skins, blows up hole3
//   Cam Consistent 4 4 3   hole1 push           -> steady pars, wins hole3 for 1 skin
// Skins: Sue 2, Cam 1 (Sue actually won the round). Points: Sue 2+3+0=5, Cam 2+2+3=7 (Cam would
// "win" on the old generic column) - the two rankings are reversed.

const MATCH = {
  id: 'match-skins-summary',
  match_code: 'SKIN01',
  match_name: null,
  game_type: 'skins',
  play_mode: 'singles',
  use_handicaps: false,
  course_name: 'Test Links',
  course_id: 'course-test-links',
  tee_box_id: 'tee-white',
  holes: 3,
  start_hole: 1,
  status: 'in_progress',
  created_at: new Date().toISOString(),
};

const WAGERED_MATCH = {
  ...MATCH,
  id: 'match-skins-summary-wager',
  match_code: 'SKIN02',
  wager: { per_skin: 10, skins_pot: false },
};

const players = (match) => [
  { id: `${match.id}-sue`, player_name: 'Sue Streaky', handicap: 0, match_id: match.id },
  { id: `${match.id}-cam`, player_name: 'Cam Consistent', handicap: 0, match_id: match.id },
];

const scores = (match) => [
  { match_id: match.id, player_id: `${match.id}-sue`, hole_number: 1, strokes: 4 },
  { match_id: match.id, player_id: `${match.id}-cam`, hole_number: 1, strokes: 4 },
  { match_id: match.id, player_id: `${match.id}-sue`, hole_number: 2, strokes: 3 },
  { match_id: match.id, player_id: `${match.id}-cam`, hole_number: 2, strokes: 4 },
  { match_id: match.id, player_id: `${match.id}-sue`, hole_number: 3, strokes: 10 },
  { match_id: match.id, player_id: `${match.id}-cam`, hole_number: 3, strokes: 3 },
];

async function finishRound(page, match) {
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
    return route.fulfill({ json: players(match) });
  });
  await page.route('**/rest/v1/scores*', (route) => {
    if (route.request().method() !== 'GET') return route.fallback();
    return route.fulfill({ json: scores(match) });
  });

  await page.goto('/');
  await page.getByRole('button', { name: 'Join Round' }).click();
  await page.getByPlaceholder('ABC123').fill(match.match_code);
  await page.getByRole('button', { name: 'Join Round' }).click();
  await page.getByRole('button', { name: /Finish Round/ }).click();
  await expect(page.getByText(/Round Complete/)).toBeVisible();
}

const sueRow = (page) => page.getByRole('row').filter({ hasText: 'Sue Streaky' });
const camRow = (page) => page.getByRole('row').filter({ hasText: 'Cam Consistent' });

test('Skins summary ranks and labels by skins won, not the generic points stat', async ({ page }) => {
  await finishRound(page, MATCH);

  await expect(page.getByRole('columnheader', { name: 'Skins' })).toBeVisible();
  await expect(page.getByRole('columnheader', { name: 'Points' })).toHaveCount(0);

  // Sue actually won the round (2 skins to 1) despite fewer Stableford-style points (5 vs 7).
  await expect(sueRow(page).getByRole('cell', { name: '🥇', exact: true })).toBeVisible();
  await expect(sueRow(page).getByRole('cell', { name: '2', exact: true })).toBeVisible();
  await expect(camRow(page).getByRole('cell', { name: '🥇', exact: true })).toHaveCount(0);
  await expect(camRow(page).getByRole('cell', { name: '1', exact: true })).toBeVisible();
});

test('Skins summary shows the $ net from the same wager as the Money screen', async ({ page }) => {
  await finishRound(page, WAGERED_MATCH);

  await expect(page.getByRole('columnheader', { name: 'Net $' })).toBeVisible();
  await expect(sueRow(page).getByRole('cell', { name: '+$10.00', exact: true })).toBeVisible();
  await expect(camRow(page).getByRole('cell', { name: '-$10.00', exact: true })).toBeVisible();
});
