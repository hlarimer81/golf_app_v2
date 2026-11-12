import { test, expect } from './fixtures.js';

// Issue #75 (retest of #71/#69/#66): the #71 fix sized the trailing spacer column from the
// combined span between the first and last player columns versus the container width, which
// gives the row enough scroll room to carry the last column fully behind the sticky Hole column,
// but it never accounted for the sticky Hole column's own width. So at max scroll the first
// player column (Hazard, here) still starts to the left of where the sticky column ends, and its
// header/values peek out beside the Hole number.
const MATCH = {
  id: 'match-wolf-vegas-breakdown-player-overlap',
  match_code: 'WVBRKO3',
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

// Phone width, matching how Rough found this (390px).
test.use({ viewport: { width: 390, height: 700 } });

test('the Per-Hole Breakdown first player column fully scrolls behind the sticky Hole column with 4 players', async ({ page }) => {
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
  // Column order is Hole, Wolf, Pick, Hammer, then players — the first player (Hazard) is index 4.
  const firstPlayerCell = page.locator('tbody tr').first().locator('td').nth(4);

  const maxScroll = await scrollContainer.evaluate((el) => el.scrollWidth - el.clientWidth);
  expect(maxScroll).toBeGreaterThan(0);
  await scrollContainer.evaluate((el, left) => { el.scrollTo({ left, behavior: 'instant' }); }, maxScroll);

  // The last player's point column should actually be reachable.
  await expect(page.locator('tbody tr').first().locator('td').last()).toBeVisible();

  const holeBox = await holeCell.boundingBox();
  const firstPlayerBox = await firstPlayerCell.boundingBox();

  // The first player column should have scrolled fully behind (or past) the sticky Hole column,
  // not sit partway, with its header/values still showing to its left.
  expect(firstPlayerBox.x + firstPlayerBox.width).toBeLessThanOrEqual(holeBox.x + 1);
});
