import { test, expect } from './fixtures.js';

// Issue #62: the Wolf Vegas 'Round Complete' screen's Per-Hole Breakdown table had no sticky
// column at all. Scrolling right to see the 3rd/4th player's points columns scrolled the Hole,
// Wolf, Pick and Hammer columns away completely, leaving a bare column of point numbers with no
// way to tell which hole or whose pick they belonged to (found by Rake). The fix gives the Hole
// column the same position:'sticky', left:0 pattern the live scorecard already uses for its
// PLAYER column, so the hole number stays on screen while the rest of the row scrolls under it.
const MATCH = {
  id: 'match-wolfvegas-summary-scroll',
  match_code: 'WVEGS1',
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
};

const PLAYERS = [
  { id: 'wvp-pat', player_name: 'Pat Par', handicap: 0, match_id: MATCH.id, team_id: null },
  { id: 'wvp-bo', player_name: 'Bo Birdie', handicap: 0, match_id: MATCH.id, team_id: null },
  { id: 'wvp-sandy', player_name: 'Sandy Trap', handicap: 0, match_id: MATCH.id, team_id: null },
  { id: 'wvp-gil', player_name: 'Gil Green', handicap: 0, match_id: MATCH.id, team_id: null },
];

test.use({ viewport: { width: 360, height: 700 } });

test('the Hole column stays visible when the Per-Hole Breakdown table is scrolled right', async ({ page }) => {
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
    return route.fulfill({ json: [] });
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

  const beforeBox = await holeCell.boundingBox();
  const maxScroll = await scrollContainer.evaluate((el) => el.scrollWidth - el.clientWidth);

  // Sanity check: the table actually overflows at this viewport width, or scrolling it proves
  // nothing.
  expect(maxScroll).toBeGreaterThan(0);

  await scrollContainer.evaluate((el, left) => { el.scrollTo({ left, behavior: 'instant' }); }, maxScroll);

  const afterBox = await holeCell.boundingBox();
  // The sticky Hole column should stay pinned at the same screen position while everything else
  // in the row scrolls underneath it, not travel left off-screen with the rest of the table.
  expect(Math.abs(afterBox.x - beforeBox.x)).toBeLessThan(1);
  await expect(holeCell).toBeVisible();
});
