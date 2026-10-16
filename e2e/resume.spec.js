import { test, expect } from './fixtures.js';

// Issue #25: reloading mid-round (an accidental refresh, or a phone backgrounding the page) used to
// land back on the blank new-round setup screen with no sign a round was already going - nothing
// pointed at Join Round or Previous Rounds, where the code happened to be re-typed or dug up from.
// The fix remembers the round's code across a reload and offers a one-tap resume.

const MATCH = {
  id: 'match-resume',
  match_code: 'RESUM1',
  match_name: null,
  game_type: 'singles',
  play_mode: 'singles',
  use_handicaps: false,
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

const PLAYERS = [
  { id: 'mp-pat', player_name: 'Pat Par', handicap: 12, match_id: MATCH.id, team_id: 't1', teams: { team_name: 'Pat Par' } },
  { id: 'mp-bo', player_name: 'Bo Birdie', handicap: 4, match_id: MATCH.id, team_id: 't2', teams: { team_name: 'Bo Birdie' } },
];

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
}

async function joinTheRound(page) {
  await page.getByRole('button', { name: 'Join Round' }).click();
  await page.getByPlaceholder('ABC123').fill(MATCH.match_code);
  await page.getByRole('button', { name: 'Join Round' }).click();
  await expect(page.locator('#score-1-0')).toBeVisible();
}

test.describe('resuming an in-progress round after a reload', () => {
  test.beforeEach(async ({ page }) => {
    await serveRound(page);
    await page.goto('/');
    await expect(page.getByRole('button', { name: 'Start Round' })).toBeVisible();
  });

  test('a reload shows a resume banner with the round code, and Resume reopens it', async ({ page }) => {
    await joinTheRound(page);

    await page.reload();

    // Back on the ordinary setup screen, but with the in-progress round called out.
    await expect(page.getByRole('button', { name: 'Start Round' })).toBeVisible();
    await expect(page.getByText(MATCH.match_code)).toBeVisible();

    await page.getByRole('button', { name: 'Resume' }).click();
    await expect(page.locator('#score-1-0')).toBeVisible();
  });

  test('dismissing the banner forgets the round', async ({ page }) => {
    await joinTheRound(page);
    await page.reload();
    await expect(page.getByRole('button', { name: 'Resume' })).toBeVisible();

    await page.getByRole('button', { name: 'Dismiss' }).click();
    await expect(page.getByRole('button', { name: 'Resume' })).toHaveCount(0);

    await page.reload();
    await expect(page.getByRole('button', { name: 'Resume' })).toHaveCount(0);
  });

  test('no banner appears when no round is in progress', async ({ page }) => {
    await expect(page.getByRole('button', { name: 'Resume' })).toHaveCount(0);
  });
});
