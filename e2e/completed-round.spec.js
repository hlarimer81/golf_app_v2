import { test, expect } from './fixtures.js';

// Issue #37: a finished, banked round reopened as a live editable scorecard, not the read-only
// summary - from the Resume banner, from Previous Rounds, and from Join Round by code alike. The
// Finish Round click already shows the summary locally, but openMatch() (the one place all three
// routes land) never looked at the match's own status before rendering the grid, so a stale
// localStorage code, a tap in Previous Rounds, or a re-typed join code all opened the same
// completed round fully editable, Finish Round button and all.

const MATCH = {
  id: 'match-done',
  match_code: 'DONE01',
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
  status: 'completed',
  created_at: new Date().toISOString(),
};

const PLAYERS = [
  { id: 'mp-pat', player_name: 'Pat Par', handicap: 12, match_id: MATCH.id, team_id: 't1', teams: { team_name: 'Pat Par' } },
  { id: 'mp-bo', player_name: 'Bo Birdie', handicap: 4, match_id: MATCH.id, team_id: 't2', teams: { team_name: 'Bo Birdie' } },
];

const SCORES = [1, 2, 3, 4].flatMap((hole) => [
  { match_id: MATCH.id, player_id: 'mp-pat', hole_number: hole, strokes: 5 },
  { match_id: MATCH.id, player_id: 'mp-bo', hole_number: hole, strokes: 4 },
]);

async function serveCompletedRound(page, match = MATCH) {
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
    return route.fulfill({ json: PLAYERS });
  });
  await page.route('**/rest/v1/scores*', (route) => {
    if (route.request().method() !== 'GET') return route.fallback();
    return route.fulfill({ json: SCORES });
  });
}

async function expectReadOnlySummary(page) {
  await expect(page.getByText(/Round Complete/)).toBeVisible();
  await expect(page.locator('#score-1-0')).toHaveCount(0);
  await expect(page.getByRole('button', { name: /Finish Round/ })).toHaveCount(0);
}

test.describe('reopening an already-completed round', () => {
  test('from Previous Rounds, it opens to the summary, not an editable scorecard', async ({ page }) => {
    await serveCompletedRound(page);
    await page.goto('/');
    await expect(page.getByRole('button', { name: 'Start Round' })).toBeVisible();

    await page.getByRole('button', { name: 'Previous Rounds' }).click();
    await page.getByText(MATCH.match_code).click();

    await expectReadOnlySummary(page);
  });

  test('joined by code, it opens to the summary, not an editable scorecard', async ({ page }) => {
    await serveCompletedRound(page);
    await page.goto('/');
    await expect(page.getByRole('button', { name: 'Start Round' })).toBeVisible();

    await page.getByRole('button', { name: 'Join Round' }).click();
    await page.getByPlaceholder('ABC123').fill(MATCH.match_code);
    await page.getByRole('button', { name: 'Join Round' }).click();

    await expectReadOnlySummary(page);
  });

  test('resumed from the banner after finishing elsewhere, it opens to the summary', async ({ page }) => {
    // Join while the round is still in progress, so the Resume banner's localStorage code gets
    // written the way a real session would - then the round is finished (on another device, or by
    // the same player after a reload) before it's resumed.
    const inProgress = { ...MATCH, status: 'in_progress' };
    await serveCompletedRound(page, inProgress);
    await page.goto('/');
    await expect(page.getByRole('button', { name: 'Start Round' })).toBeVisible();

    await page.getByRole('button', { name: 'Join Round' }).click();
    await page.getByPlaceholder('ABC123').fill(MATCH.match_code);
    await page.getByRole('button', { name: 'Join Round' }).click();
    await expect(page.locator('#score-1-0')).toBeVisible();

    await serveCompletedRound(page, MATCH);
    await page.reload();
    await expect(page.getByRole('button', { name: 'Resume' })).toBeVisible();

    await page.getByRole('button', { name: 'Resume' }).click();
    await expectReadOnlySummary(page);
  });
});

test.describe('finishing a round in the same session', () => {
  // Issue #41: the Resume/Previous Rounds/Join fixes above only guarded the routes that *reopen* an
  // already-banked round. Finishing live never re-checks anything - MatchSummary's own 'Back to
  // Scorecard' button just flips local state back to the editable grid, so a round just banked by
  // Finish Round could be reopened and resaved over from its own summary screen.
  test('the summary has no Back to Scorecard button, so the just-banked round cannot be reopened', async ({ page }) => {
    const inProgress = { ...MATCH, status: 'in_progress' };
    await serveCompletedRound(page, inProgress);
    await page.goto('/');
    await page.getByRole('button', { name: 'Join Round' }).click();
    await page.getByPlaceholder('ABC123').fill(MATCH.match_code);
    await page.getByRole('button', { name: 'Join Round' }).click();
    await expect(page.locator('#score-1-0')).toBeVisible();

    await page.getByRole('button', { name: /Finish Round/ }).click();
    await expectReadOnlySummary(page);
    await expect(page.getByRole('button', { name: /Back to Scorecard/ })).toHaveCount(0);
  });
});
