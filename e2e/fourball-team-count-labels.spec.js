import { test, expect } from './fixtures.js';

// Issue #92: the 4-Ball setup info box and the live scorecard heading were static copy that always
// described a 4-team round robin ("6 matchups with 4 teams"), even when only Team A and Team B were
// assigned. The Finish Round summary screen's heading happened to read correctly for any team
// count, so the two didn't match. Both now read off the number of teams actually assigned, the same
// way the summary screen's heading always has.

const selectWithPlaceholder = (page, placeholder) =>
  page.locator('select').filter({ has: page.locator('option', { hasText: placeholder }) });

async function pickPlayer(page, name) {
  await page.getByRole('button', { name: '-- Select Player --' }).first().click();
  await page.getByTestId('player-list').getByText(name, { exact: true }).click();
  await expect(page.getByRole('button', { name })).toBeVisible();
}

async function assignTeam(page, rowIndex, team) {
  await selectWithPlaceholder(page, '-- Team --').nth(rowIndex).selectOption(team);
}

test('setup info box reads as a single match with two teams, a round robin with more', async ({ page }) => {
  await page.goto('/');
  await selectWithPlaceholder(page, 'Select Course').selectOption({ label: 'Test Links' });
  await selectWithPlaceholder(page, 'Select Game Type').selectOption('fourball');
  await selectWithPlaceholder(page, 'Scoring Mode').selectOption('gross');
  await page.getByRole('button', { name: 'Start Round' }).click();
  await expect(page.getByRole('heading', { name: '2. Assign Players' })).toBeVisible();

  for (const name of ['Pat Par', 'Bo Birdie', 'Sandy Trap', 'Gil Green']) {
    await pickPlayer(page, name);
  }

  // Two teams only (A and B): a single match, not a round robin.
  await assignTeam(page, 0, 'Team A');
  await assignTeam(page, 1, 'Team A');
  await assignTeam(page, 2, 'Team B');
  await assignTeam(page, 3, 'Team B');
  await expect(page.getByText('4-Ball Match Play:', { exact: false })).toBeVisible();
  await expect(page.getByText('Round Robin', { exact: false })).toHaveCount(0);

  // Four teams: the round robin blurb, with the right matchup count.
  await assignTeam(page, 1, 'Team C');
  await assignTeam(page, 3, 'Team D');
  await expect(page.getByText('6 matchups with 4 teams', { exact: false })).toBeVisible();
});

const MATCH = (code, id) => ({
  id,
  match_code: code,
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
});

const twoTeamPlayers = (match) => [
  { id: `${match.id}-a1`, player_name: 'Ann Ace', handicap: 0, match_id: match.id, team_id: 't1', teams: { team_name: 'Team A' } },
  { id: `${match.id}-a2`, player_name: 'Al Ace', handicap: 0, match_id: match.id, team_id: 't1', teams: { team_name: 'Team A' } },
  { id: `${match.id}-b1`, player_name: 'Bea Birdie', handicap: 0, match_id: match.id, team_id: 't2', teams: { team_name: 'Team B' } },
  { id: `${match.id}-b2`, player_name: 'Bo Birdie', handicap: 0, match_id: match.id, team_id: 't2', teams: { team_name: 'Team B' } },
];

const fourTeamPlayers = (match) => [
  { id: `${match.id}-a1`, player_name: 'Ann Ace', handicap: 0, match_id: match.id, team_id: 't1', teams: { team_name: 'Team A' } },
  { id: `${match.id}-b1`, player_name: 'Bea Birdie', handicap: 0, match_id: match.id, team_id: 't2', teams: { team_name: 'Team B' } },
  { id: `${match.id}-c1`, player_name: 'Cal Chip', handicap: 0, match_id: match.id, team_id: 't3', teams: { team_name: 'Team C' } },
  { id: `${match.id}-d1`, player_name: 'Dee Divot', handicap: 0, match_id: match.id, team_id: 't4', teams: { team_name: 'Team D' } },
];

async function joinRound(page, match, playerRows) {
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
    return route.fulfill({ json: playerRows });
  });
  await page.route('**/rest/v1/scores*', (route) => {
    if (route.request().method() !== 'GET') return route.fallback();
    return route.fulfill({ json: [] });
  });

  await page.goto('/');
  await page.getByRole('button', { name: 'Join Round' }).click();
  await page.getByPlaceholder('ABC123').fill(match.match_code);
  await page.getByRole('button', { name: 'Join Round' }).click();
  await expect(page.locator('#score-1-0')).toBeVisible();
}

test('2-team 4-Ball live scorecard reads as a single match, not a round robin', async ({ page }) => {
  const match = MATCH('FB2TEAM', 'match-fourball-2team');
  await joinRound(page, match, twoTeamPlayers(match));

  await expect(page.getByText('4-Ball Match Play Standings')).toBeVisible();
});

test('4-team 4-Ball live scorecard still reads as a round robin', async ({ page }) => {
  const match = MATCH('FB4TEAM', 'match-fourball-4team');
  await joinRound(page, match, fourTeamPlayers(match));

  await expect(page.getByText('4-Ball Round Robin Standings')).toBeVisible();
});
