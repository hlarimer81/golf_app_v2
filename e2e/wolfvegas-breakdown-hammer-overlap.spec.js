import { test, expect } from './fixtures.js';

// Issue #71 (retest of #69/#66): the fix for #69 gave the Wolf/Pick columns a minWidth so the
// table could grow wide enough for them to scroll fully behind the sticky Hole column, but the
// Hammer column ('- x1 +') wasn't covered. Its stepper (two 20px buttons plus a 30px label) needs
// more room than the minWidth declared for its header, so the column is sized too narrow and its
// tail end still sits under/beside the sticky Hole column once scrolled.
const MATCH = {
  id: 'match-wolf-vegas-breakdown-hammer-overlap',
  match_code: 'WVBRKO2',
  match_name: null,
  game_type: 'wolfvegas',
  play_mode: 'singles',
  use_handicaps: false,
  course_name: 'Test Links',
  course_id: 'course-test-links',
  tee_box_id: 'tee-white',
  holes: 18,
  start_hole: 1,
  status: 'in_progress',
  created_at: new Date().toISOString(),
  wolf_vegas: { decisions: {}, hammers: {}, grossBirdies: false },
};

const PLAYERS = [
  { id: 'wv-hazard', player_name: 'Hazard', handicap: 0, match_id: MATCH.id, team_id: null },
  { id: 'wv-rough', player_name: 'Rough', handicap: 0, match_id: MATCH.id, team_id: null },
  { id: 'wv-mulligan', player_name: 'Mulligan', handicap: 0, match_id: MATCH.id, team_id: null },
  { id: 'wv-rake', player_name: 'Rake', handicap: 0, match_id: MATCH.id, team_id: null },
];

const SCORES = [];
for (let h = 1; h <= 18; h++) {
  SCORES.push({ match_id: MATCH.id, player_id: 'wv-hazard', hole_number: h, strokes: 4 });
  SCORES.push({ match_id: MATCH.id, player_id: 'wv-rough', hole_number: h, strokes: 5 });
  SCORES.push({ match_id: MATCH.id, player_id: 'wv-mulligan', hole_number: h, strokes: 4 });
  SCORES.push({ match_id: MATCH.id, player_id: 'wv-rake', hole_number: h, strokes: 5 });
}

// Phone width, matching how Hazard found this (390px).
test.use({ viewport: { width: 390, height: 700 } });

test('the Per-Hole Breakdown Hammer column fully scrolls behind the sticky Hole column with 4 players', async ({ page }) => {
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
  await expect(page.locator('tbody tr').first()).toBeVisible();

  await page.getByRole('button', { name: /Finish Round/ }).click();
  await expect(page.getByText('Round Complete')).toBeVisible();
  await expect(page.getByText('Per-Hole Breakdown')).toBeVisible();

  const scrollContainer = page.locator('table').locator('xpath=..');
  const holeCell = page.locator('tbody tr').first().locator('td').first();
  const hammerCell = page.locator('tbody tr').first().locator('td').nth(3);

  const maxScroll = await scrollContainer.evaluate((el) => el.scrollWidth - el.clientWidth);
  expect(maxScroll).toBeGreaterThan(0);
  await scrollContainer.evaluate((el, left) => { el.scrollTo({ left, behavior: 'instant' }); }, maxScroll);

  // The last player's point column should actually be reachable.
  await expect(page.locator('tbody tr').first().locator('td').last()).toBeVisible();

  const holeBox = await holeCell.boundingBox();
  const hammerBox = await hammerCell.boundingBox();

  // The Hammer column should have scrolled fully behind (or past) the sticky Hole column, not sit
  // partway, overlapping it with its stepper controls still showing.
  expect(hammerBox.x + hammerBox.width).toBeLessThanOrEqual(holeBox.x + 1);
});
