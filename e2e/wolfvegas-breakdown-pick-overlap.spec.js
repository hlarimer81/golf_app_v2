import { test, expect } from './fixtures.js';

// Issue #66 (retest of #62/#64): the Hole column's sticky fix (#64) covered the case where the
// Per-Hole Breakdown table had no sticky column at all, but with 4 players the Wolf/Pick columns
// never fully scroll away. The table forces `width: '100%'` with no minWidth on the Wolf/Pick/
// Hammer/player columns, so auto table layout squeezes them to fit the container instead of
// letting the table grow wider and scroll (the pattern every other scorecard table in this repo
// already uses - see the PLAYER/hole columns in the live scorecard further down this same file).
// Squeezed that way, there still isn't enough scrollable width to carry Wolf/Pick fully behind the
// sticky Hole column once the last player's column is in view, so a sliver of Pick's text (a long
// first name like 'Mulligan') keeps sitting immediately beside/behind the Hole numbers instead of
// disappearing, exactly as Mulligan (an AI golfer) reported from a real round (run 3EU6K9). The fix
// gives Wolf/Pick/Hammer/player columns a minWidth so the table is free to grow wide enough to
// scroll them fully out of view.
const MATCH = {
  id: 'match-wolf-vegas-breakdown-overlap',
  match_code: 'WVBRKO1',
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
  // Wolf on hole 1 is wv-hazard; wv-mulligan is picked as partner, so Pick reads the long name
  // 'Mulligan' - the exact content the tester's report showed truncated and bleeding.
  wolf_vegas: { decisions: { 1: 'wv-mulligan' }, hammers: {}, grossBirdies: false },
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

// Phone width, matching how Mulligan found this (390px).
test.use({ viewport: { width: 390, height: 700 } });

test('the Per-Hole Breakdown Pick column fully scrolls behind the sticky Hole column with 4 players', async ({ page }) => {
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
  const pickCell = page.locator('tbody tr').first().locator('td').nth(2);

  const maxScroll = await scrollContainer.evaluate((el) => el.scrollWidth - el.clientWidth);
  expect(maxScroll).toBeGreaterThan(0);
  await scrollContainer.evaluate((el, left) => { el.scrollTo({ left, behavior: 'instant' }); }, maxScroll);

  // The last player's point column should actually be reachable.
  await expect(page.locator('tbody tr').first().locator('td').last()).toBeVisible();

  const holeBox = await holeCell.boundingBox();
  const pickBox = await pickCell.boundingBox();

  // The Pick column should have scrolled fully behind (or past) the sticky Hole column, not sit
  // partway, overlapping it with a sliver of its text still showing.
  expect(pickBox.x + pickBox.width).toBeLessThanOrEqual(holeBox.x + 1);
});
