import { test, expect } from './fixtures.js';

// Issue #56: the team aggregate row was hard-coded 'AGG NET' regardless of the Gross/Net
// scoring mode toggle, even when no handicap strokes were being subtracted.
//
// Two teams of 2, no handicaps (Gross mode). Hole 1: 7+8=15, 5+5=10.

const GROSS_MATCH = {
  id: 'match-aggregate-gross',
  match_code: 'AGGGR1',
  match_name: null,
  game_type: 'aggregate',
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

const NET_MATCH = { ...GROSS_MATCH, id: 'match-aggregate-net', match_code: 'AGGNET', use_handicaps: true };

const players = (match) => [
  { id: `${match.id}-a1`, player_name: 'Ann Ace', handicap: 0, match_id: match.id, team_id: 't1', teams: { team_name: 'Team A' } },
  { id: `${match.id}-a2`, player_name: 'Al Ace', handicap: 0, match_id: match.id, team_id: 't1', teams: { team_name: 'Team A' } },
  { id: `${match.id}-b1`, player_name: 'Bea Birdie', handicap: 0, match_id: match.id, team_id: 't2', teams: { team_name: 'Team B' } },
  { id: `${match.id}-b2`, player_name: 'Bo Birdie', handicap: 0, match_id: match.id, team_id: 't2', teams: { team_name: 'Team B' } },
];

const scores = (match) => [
  { match_id: match.id, player_id: `${match.id}-a1`, hole_number: 1, strokes: 7 },
  { match_id: match.id, player_id: `${match.id}-a2`, hole_number: 1, strokes: 8 },
  { match_id: match.id, player_id: `${match.id}-b1`, hole_number: 1, strokes: 5 },
  { match_id: match.id, player_id: `${match.id}-b2`, hole_number: 1, strokes: 5 },
];

async function joinRound(page, match) {
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
}

test('Gross-mode aggregate round labels the team row AGG GROSS, not AGG NET (issue #56)', async ({ page }) => {
  await joinRound(page, GROSS_MATCH);

  await expect(page.getByText('AGG GROSS')).toHaveCount(2);
  await expect(page.getByText('AGG NET')).toHaveCount(0);

  await page.getByRole('button', { name: /Finish Round/ }).click();
  await expect(page.getByText(/Round Complete/)).toBeVisible();
  await expect(page.getByText('15 gross')).toBeVisible();
  await expect(page.getByText('10 gross')).toBeVisible();
});

test('Net-mode aggregate round still labels the team row AGG NET', async ({ page }) => {
  await joinRound(page, NET_MATCH);

  await expect(page.getByText('AGG NET')).toHaveCount(2);
  await expect(page.getByText('AGG GROSS')).toHaveCount(0);
});

test('Team name stays pinned on the team header row when the scorecard is scrolled right (issue #59)', async ({ page }) => {
  await joinRound(page, GROSS_MATCH);

  const teamNameCell = page.getByTestId('team-name-Team A');
  const container = page.locator('table').locator('..');

  const beforeBox = await teamNameCell.boundingBox();
  await container.evaluate((el) => { el.scrollLeft = el.scrollWidth; });
  const afterBox = await teamNameCell.boundingBox();

  // The team name's on-screen position shouldn't move when the table scrolls horizontally.
  expect(afterBox.x).toBeCloseTo(beforeBox.x, 0);
  await expect(teamNameCell).toBeInViewport();
});
