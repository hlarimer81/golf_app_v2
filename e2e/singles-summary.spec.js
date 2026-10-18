import { test, expect } from './fixtures.js';

// The Singles summary always showed a Net column. A gross round plays everyone off 0, so Net only
// ever repeated Gross, which read as handicaps being ignored (issue #23). Net now shows only in a
// net round, where it differs.
//
// Four holes on Test Links, whose stroke indexes for holes 1-4 are 7, 11, 17 and 1.
//   Pat  5 5 5 5  gross 20   off 9: a stroke on holes 1 and 4 -> net 18
//   Bo   4 4 4 4  gross 16   off 0                            -> net 16

const GROSS_MATCH = {
  id: 'match-singles-gross',
  match_code: 'SGROSS',
  match_name: null,
  game_type: 'singles',
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

const NET_MATCH = {
  ...GROSS_MATCH,
  id: 'match-singles-net',
  match_code: 'SNET01',
  use_handicaps: true,
  play_off_low: false,
  handicap_allowance_pct: 100,
};

// Rough and Rake both shot 82 (issue #30) - here, both shoot gross 16 over the same four holes.
const TIE_MATCH = {
  ...GROSS_MATCH,
  id: 'match-singles-tie',
  match_code: 'STIE01',
};

const playersFor = (match, patHcp) => [
  { id: `${match.id}-pat`, player_name: 'Pat Par', handicap: patHcp, match_id: match.id, team_id: 't1', teams: { team_name: 'P' } },
  { id: `${match.id}-bo`, player_name: 'Bo Birdie', handicap: 0, match_id: match.id, team_id: 't2', teams: { team_name: 'B' } },
];

const scoresFor = (match) => [1, 2, 3, 4].flatMap((hole) => [
  { match_id: match.id, player_id: `${match.id}-pat`, hole_number: hole, strokes: 5 },
  { match_id: match.id, player_id: `${match.id}-bo`, hole_number: hole, strokes: 4 },
]);

const tiedScoresFor = (match) => [1, 2, 3, 4].flatMap((hole) => [
  { match_id: match.id, player_id: `${match.id}-pat`, hole_number: hole, strokes: 4 },
  { match_id: match.id, player_id: `${match.id}-bo`, hole_number: hole, strokes: 4 },
]);

async function finishRound(page, match, patHcp, scoresFn = scoresFor) {
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
    return route.fulfill({ json: playersFor(match, patHcp) });
  });
  await page.route('**/rest/v1/scores*', (route) => {
    if (route.request().method() !== 'GET') return route.fallback();
    return route.fulfill({ json: scoresFn(match) });
  });

  await page.goto('/');
  await page.getByRole('button', { name: 'Join Round' }).click();
  await page.getByPlaceholder('ABC123').fill(match.match_code);
  await page.getByRole('button', { name: 'Join Round' }).click();
  await page.getByRole('button', { name: /Finish Round/ }).click();
  await expect(page.getByText(/Round Complete/)).toBeVisible();
}

const patRow = (page) => page.getByRole('row').filter({ hasText: 'Pat Par' });
const boRow = (page) => page.getByRole('row').filter({ hasText: 'Bo Birdie' });

test('a gross Singles summary has no Net column', async ({ page }) => {
  await finishRound(page, GROSS_MATCH, 0);
  await expect(page.getByRole('columnheader', { name: 'Gross' })).toBeVisible();
  await expect(page.getByRole('columnheader', { name: 'Net' })).toHaveCount(0);
  await expect(patRow(page).getByRole('cell', { name: '20', exact: true })).toBeVisible();
});

test('a net Singles summary shows Net after handicap strokes', async ({ page }) => {
  await finishRound(page, NET_MATCH, 9);
  await expect(page.getByRole('columnheader', { name: 'Net' })).toBeVisible();
  await expect(patRow(page).getByRole('cell', { name: '20', exact: true })).toBeVisible();
  await expect(patRow(page).getByRole('cell', { name: '18', exact: true })).toBeVisible();
});

test('two players tied on gross score both show 1st, not 1st/2nd (issue #30)', async ({ page }) => {
  await finishRound(page, TIE_MATCH, 0, tiedScoresFor);
  await expect(patRow(page).getByRole('cell', { name: '🥇', exact: true })).toBeVisible();
  await expect(boRow(page).getByRole('cell', { name: '🥇', exact: true })).toBeVisible();
  await expect(page.getByRole('cell', { name: '🥈', exact: true })).toHaveCount(0);
});
