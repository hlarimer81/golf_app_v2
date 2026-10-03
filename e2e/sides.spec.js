import { test, expect } from './fixtures.js';

// A side is named from its golfers' initials, and each golfer was then matched to a side by that
// name. Two golfers who share an initial, each playing for themselves, both became side "R" and
// were both saved onto the first one. Sides that would share a name now take more letters.

const PLAYERS = [
  { id: 'player-rough', player_name: 'Rough', handicap: 11, match_id: null, team_id: null },
  { id: 'player-rake', player_name: 'Rake', handicap: 15, match_id: null, team_id: null },
  { id: 'player-hazard', player_name: 'Hazard', handicap: 25, match_id: null, team_id: null },
];

const selectWithPlaceholder = (page, placeholder) =>
  page.locator('select').filter({ has: page.locator('option', { hasText: placeholder }) });

test('two golfers who share an initial are saved on different sides', async ({ page }) => {
  await page.route('**/rest/v1/players*', (route) => {
    if (route.request().method() !== 'GET') return route.fallback();
    return route.fulfill({ json: PLAYERS });
  });

  const sent = {};
  page.on('request', (request) => {
    if (request.method() !== 'POST') return;
    const table = new URL(request.url()).pathname.split('/').pop();
    if (table === 'teams' || table === 'players') sent[table] = JSON.parse(request.postData());
  });
  const saved = {};
  page.on('response', async (response) => {
    if (response.request().method() !== 'POST') return;
    const table = new URL(response.url()).pathname.split('/').pop();
    if (table === 'teams') saved.teams = await response.json();
  });

  await page.goto('/');
  await selectWithPlaceholder(page, 'Select Course').selectOption({ label: 'Test Links' });
  await selectWithPlaceholder(page, 'Select Game Type').selectOption('stableford');
  await selectWithPlaceholder(page, 'Play Mode').selectOption('singles');
  await selectWithPlaceholder(page, 'Scoring Mode').selectOption('gross');
  await page.getByRole('button', { name: 'Start Round' }).click();
  await expect(page.getByRole('heading', { name: '2. Assign Players' })).toBeVisible();

  for (const name of ['Rough', 'Rake', 'Hazard']) {
    await page.getByRole('button', { name: '-- Select Player --' }).first().click();
    await page.getByTestId('player-list').getByText(name, { exact: true }).click();
    await expect(page.getByRole('button', { name })).toBeVisible();
  }
  await page.getByRole('button', { name: 'Start Round' }).click();
  await expect(page.locator('#score-1-0')).toBeVisible();

  // Only the two that clash are lengthened.
  expect(sent.teams.map((t) => t.team_name)).toEqual(['Ro', 'Ra', 'H']);

  const sideOf = (name) => {
    const teamId = sent.players.find((p) => p.player_name === name).team_id;
    return saved.teams.find((t) => t.id === teamId).team_name;
  };
  expect(sideOf('Rough')).toBe('Ro');
  expect(sideOf('Rake')).toBe('Ra');
  expect(sideOf('Hazard')).toBe('H');
});
