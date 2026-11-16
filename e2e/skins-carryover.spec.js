import { test, expect } from './fixtures.js';

// Issue #77: the "Carryover Skins" choice was never saved with the round. Reloading and resuming
// (or joining by code) fell back to carryover ON, flipped the header to "Skins (Carryover)", and
// re-scored every push as a carried skin. The choice is now saved as matches.use_carryover and
// read back whenever a round is reopened.

const selectWithPlaceholder = (page, placeholder) =>
  page.locator('select').filter({ has: page.locator('option', { hasText: placeholder }) });

const MATCH = {
  id: 'match-no-carry',
  match_code: 'NOCAR1',
  match_name: null,
  game_type: 'skins',
  play_mode: 'singles',
  use_handicaps: false,
  use_carryover: false,
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

const players = (match) => [
  { id: `${match.id}-pat`, player_name: 'Pat Par', handicap: 0, match_id: match.id, team_id: 't1', teams: { team_name: 'Pat Par' } },
  { id: `${match.id}-bo`, player_name: 'Bo Birdie', handicap: 0, match_id: match.id, team_id: 't2', teams: { team_name: 'Bo Birdie' } },
];

async function serveRound(page, match) {
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
}

async function joinTheRound(page, match) {
  await page.goto('/');
  await page.getByRole('button', { name: 'Join Round' }).click();
  await page.getByPlaceholder('ABC123').fill(match.match_code);
  await page.getByRole('button', { name: 'Join Round' }).click();
  await expect(page.locator('#score-1-0')).toBeVisible();
}

test('starting a No Carryover skins round saves the choice with the round', async ({ page }) => {
  await page.goto('/');
  await selectWithPlaceholder(page, 'Select Course').selectOption({ label: 'Test Links' });
  await selectWithPlaceholder(page, 'Select Game Type').selectOption('skins');
  await selectWithPlaceholder(page, 'Play Mode').selectOption('singles');
  await selectWithPlaceholder(page, 'Scoring Mode').selectOption('gross');

  const carryover = page.getByLabel(/Carryover Skins/);
  await expect(carryover).toBeChecked();
  await carryover.uncheck();

  const created = page.waitForRequest((req) =>
    req.method() === 'POST' && new URL(req.url()).pathname === '/rest/v1/matches');
  await page.getByRole('button', { name: 'Start Round' }).click();
  const [row] = (await created).postDataJSON();

  expect(row.game_type).toBe('skins');
  expect(row.use_carryover).toBe(false);
});

test('a No Carryover round stays No Carryover after a reload and Resume', async ({ page }) => {
  await serveRound(page, MATCH);
  await joinTheRound(page, MATCH);
  await expect(page.getByText('Skins (No Carryover)')).toBeVisible();

  await page.reload();
  await page.getByRole('button', { name: 'Resume' }).click();
  await expect(page.locator('#score-1-0')).toBeVisible();

  await expect(page.getByText('Skins (No Carryover)')).toBeVisible();
  await expect(page.getByText('Skins (Carryover)')).toHaveCount(0);
});

test('a round saved before the setting existed still opens with carryover on', async ({ page }) => {
  // undefined is left out of the JSON, as if the column weren't there.
  const match = { ...MATCH, use_carryover: undefined, id: 'match-old-skins', match_code: 'OLDSK1' };
  await serveRound(page, match);
  await joinTheRound(page, match);

  await expect(page.getByText('Skins (Carryover)')).toBeVisible();
});
