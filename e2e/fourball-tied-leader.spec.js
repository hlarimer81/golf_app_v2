import { test, expect } from './fixtures.js';

// Issue #83: the standings header sorted teams by points and gave the trophy/highlighted
// border to whichever team landed at index 0 after the sort, with no check for a tie at the
// top. Two teams level on points both showed up identically ranked, but only one got the
// trophy and border — implying a lead that didn't exist.
//
// No handicaps. Hole 1 is halved: Team A's best net (4) equals Team B's best net (4), so both
// teams earn 0.5 points and are tied.

const TIED_MATCH = {
  id: 'match-fourball-tied',
  match_code: 'FBTIE1',
  match_name: null,
  game_type: 'fourball',
  play_mode: 'team',
  use_handicaps: false,
  course_name: 'Test Links',
  course_id: 'course-test-links',
  tee_box_id: 'tee-white',
  holes: 18,
  start_hole: 1,
  status: 'in_progress',
  created_at: new Date().toISOString(),
};

const players = (match) => [
  { id: `${match.id}-a1`, player_name: 'Ann Ace', handicap: 0, match_id: match.id, team_id: 't1', teams: { team_name: 'Team A' } },
  { id: `${match.id}-a2`, player_name: 'Al Ace', handicap: 0, match_id: match.id, team_id: 't1', teams: { team_name: 'Team A' } },
  { id: `${match.id}-b1`, player_name: 'Bea Birdie', handicap: 0, match_id: match.id, team_id: 't2', teams: { team_name: 'Team B' } },
  { id: `${match.id}-b2`, player_name: 'Bo Birdie', handicap: 0, match_id: match.id, team_id: 't2', teams: { team_name: 'Team B' } },
];

// Team A's best net is a1's 4; Team B's best net is b1's 4. Halved hole.
const tiedScores = (match) => [
  { match_id: match.id, player_id: `${match.id}-a1`, hole_number: 1, strokes: 4 },
  { match_id: match.id, player_id: `${match.id}-a2`, hole_number: 1, strokes: 5 },
  { match_id: match.id, player_id: `${match.id}-b1`, hole_number: 1, strokes: 4 },
  { match_id: match.id, player_id: `${match.id}-b2`, hole_number: 1, strokes: 6 },
];

// Team A wins hole 1 outright: best net 4 beats Team B's best net 5.
const leadScores = (match) => [
  { match_id: match.id, player_id: `${match.id}-a1`, hole_number: 1, strokes: 4 },
  { match_id: match.id, player_id: `${match.id}-a2`, hole_number: 1, strokes: 6 },
  { match_id: match.id, player_id: `${match.id}-b1`, hole_number: 1, strokes: 5 },
  { match_id: match.id, player_id: `${match.id}-b2`, hole_number: 1, strokes: 7 },
];

async function joinRound(page, match, scores) {
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
  await expect(page.getByText('4-Ball Round Robin Standings')).toBeVisible();
}

test('teams level on points both show no trophy (issue #83)', async ({ page }) => {
  await joinRound(page, TIED_MATCH, tiedScores);

  await expect(page.getByText('0.5', { exact: true })).toHaveCount(2);
  await expect(page.getByText('🏆', { exact: false })).toHaveCount(0);
});

test('a team ahead on points still gets the trophy', async ({ page }) => {
  const match = { ...TIED_MATCH, id: 'match-fourball-lead', match_code: 'FBLEAD1' };
  await joinRound(page, match, leadScores);

  await expect(page.getByText('🏆', { exact: false })).toHaveCount(1);
  await expect(page.getByText('🏆 A', { exact: false })).toBeVisible();
});
