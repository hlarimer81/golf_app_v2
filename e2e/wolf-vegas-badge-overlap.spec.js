import { test, expect } from './fixtures.js';

// Same bug as #47/#49 (see wolf-badge-overlap.spec.js), but in WolfVegasGrid's own per-hole
// points badge instead of WolfGrid's wolf/partner badge: a position:absolute div (zIndex: 10)
// inside its own score cell, which is position:relative but had no overflow:hidden. The sticky
// PLAYER column was position:sticky with the *same* zIndex: 10, so CSS broke the tie by document
// order and a later-in-the-DOM badge from a hole scrolled underneath the sticky column painted on
// top of it instead of staying hidden behind it (issue #61, found by Rake: scrolled past hole
// 8-9, stray '+1'/'-1'/'+8' badges crowded against the PLAYER names). The fix ports the same
// two-line pattern already applied to WolfGrid: the sticky column gets a higher zIndex (20), and
// each score cell gets overflow:hidden so a badge can never bleed into a neighbouring cell either.
const MATCH = {
  id: 'match-wolf-vegas-scroll',
  match_code: 'WVEGAS1',
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
  // Wolf on hole 1 (first in the played sequence) is wv-pat; wv-sandy is picked as partner, so
  // the sides are [pat, sandy] vs [bo, gil].
  wolf_vegas: { decisions: { 1: 'wv-sandy' }, hammers: {}, grossBirdies: false },
};

const PLAYERS = [
  { id: 'wv-pat', player_name: 'Pat Par', handicap: 0, match_id: MATCH.id, team_id: null },
  { id: 'wv-bo', player_name: 'Bo Birdie', handicap: 0, match_id: MATCH.id, team_id: null },
  { id: 'wv-sandy', player_name: 'Sandy Trap', handicap: 0, match_id: MATCH.id, team_id: null },
  { id: 'wv-gil', player_name: 'Gil Green', handicap: 0, match_id: MATCH.id, team_id: null },
];

// Hole 1 is par 4. Pat/Sandy (wolf side) net 4 and 6 -> Vegas number 46. Bo/Gil (opp side) net 5
// and 5 -> 55. Neither side birdies, so no flip. 46 < 55, wolf side wins the 9-point swing.
const SCORES = [
  { match_id: MATCH.id, player_id: 'wv-pat', hole_number: 1, strokes: 4 },
  { match_id: MATCH.id, player_id: 'wv-sandy', hole_number: 1, strokes: 6 },
  { match_id: MATCH.id, player_id: 'wv-bo', hole_number: 1, strokes: 5 },
  { match_id: MATCH.id, player_id: 'wv-gil', hole_number: 1, strokes: 5 },
];

// Narrow enough that scrolling the scorecard right leaves hole 1's badge sitting underneath the
// sticky PLAYER column, not just beside it.
test.use({ viewport: { width: 320, height: 700 } });

test('a Wolf Vegas points badge never renders on top of the sticky PLAYER column once its hole scrolls away', async ({ page }) => {
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
  await page.getByPlaceholder('ABC123').fill('WVEGAS1');
  await page.getByRole('button', { name: 'Join Round' }).click();
  await expect(page.locator('tbody tr').first()).toBeVisible();

  // Pat (first row) won hole 1's 9-point swing.
  const badge = page.locator('tbody tr').first().getByText('+9', { exact: true }).first();
  await expect(badge).toBeVisible();

  // Scroll the scorecard so hole 1 (and its points badge) ends up entirely underneath the sticky
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
