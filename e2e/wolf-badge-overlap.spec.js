import { test, expect } from './fixtures.js';

// Each hole's wolf/partner badge (🐺/🤝) is a position:absolute div (zIndex: 10) inside its own
// score cell, which is position:relative. The sticky PLAYER column is position:sticky with the
// *same* zIndex: 10. CSS breaks a z-index tie by document order, and the PLAYER column is the
// first cell in every row, so once a hole column has scrolled far enough that it sits underneath
// the sticky column, its later-in-the-DOM badge used to win the tie and paint on top of the sticky
// column's background and player names instead of staying hidden behind it (issue #47, found by
// Rough: scrolled past hole 9, stray wolf/handshake icons from holes 1-8 crowded against the
// PLAYER names). The fix gives the sticky column a higher zIndex (20), the same fix already used
// for the Vegas point badge (issue #18, see vegas.spec.js).
const MATCH = {
  id: 'match-wolf-scroll',
  match_code: 'WOLF01',
  match_name: null,
  game_type: 'wolf',
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

// Wolf rotates through players by the played sequence index, so Pat (first in the list) is the
// wolf on hole 1.
const PLAYERS = [
  { id: 'wp-pat', player_name: 'Pat Par', handicap: 0, match_id: MATCH.id, team_id: null },
  { id: 'wp-bo', player_name: 'Bo Birdie', handicap: 0, match_id: MATCH.id, team_id: null },
  { id: 'wp-sandy', player_name: 'Sandy Trap', handicap: 0, match_id: MATCH.id, team_id: null },
  { id: 'wp-gil', player_name: 'Gil Green', handicap: 0, match_id: MATCH.id, team_id: null },
];

// Narrow enough that scrolling the scorecard right leaves hole 1's badge sitting underneath the
// sticky PLAYER column, not just beside it.
test.use({ viewport: { width: 320, height: 700 } });

test('a wolf badge never renders on top of the sticky PLAYER column once its hole scrolls away', async ({ page }) => {
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
  await page.getByPlaceholder('ABC123').fill('WOLF01');
  await page.getByRole('button', { name: 'Join Round' }).click();
  await expect(page.locator('tbody tr').first()).toBeVisible();

  // Pat is the wolf on holes 1, 5, 9, 13 and 17 (rotation repeats every 4 players over 18 holes).
  // The first one in DOM order is hole 1's, the leftmost column.
  const badge = page.locator('tbody tr').first().getByText('🐺', { exact: true }).first();
  await expect(badge).toBeVisible();

  // Scroll the scorecard so hole 1 (and its wolf badge) ends up entirely underneath the sticky
  // PLAYER column, the way it would after scrolling well past hole 9 on a phone.
  const scrollContainer = page.locator('table').locator('xpath=..');
  const stickyCell = page.locator('tbody tr').first().locator('td').first();
  const stickyWidth = await stickyCell.evaluate((el) => el.getBoundingClientRect().width);
  await scrollContainer.evaluate((el, left) => { el.scrollTo({ left, behavior: 'instant' }); }, stickyWidth);

  const badgeBox = await badge.boundingBox();
  const stickyBox = await stickyCell.boundingBox();

  // Sanity check: the scroll actually put the badge's hole underneath the sticky column. If this
  // fails the test setup isn't reproducing the reported scenario.
  expect(badgeBox.x).toBeLessThan(stickyBox.x + stickyBox.width);

  const badgeIsOnTop = await page.evaluate(
    ({ x, y, badge }) => document.elementFromPoint(x, y) === badge,
    { x: badgeBox.x + badgeBox.width / 2, y: badgeBox.y + badgeBox.height / 2, badge: await badge.elementHandle() }
  );
  expect(badgeIsOnTop).toBe(false);
});
