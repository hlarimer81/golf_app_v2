import { test, expect } from './fixtures.js';

// Issue #63: the Wolf Vegas 'Round Complete' player point cards used display:flex with
// flex-wrap:wrap and each card at flex:1/minWidth:70px. At phone width the four cards' content
// didn't fit one row, so the last card wrapped onto a row by itself; flex:1 then stretched that
// lone card to the full row width, making it much larger than the other three (found by Rake).
// The fix lays the cards out on a CSS grid with one column per player, so all four always share
// one row at equal width instead of wrapping.
const MATCH = {
  id: 'match-wolfvegas-summary-cards',
  match_code: 'WVCARD1',
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
  { id: 'wvc-pat', player_name: 'Pat Par', handicap: 0, match_id: MATCH.id, team_id: null },
  { id: 'wvc-bo', player_name: 'Bo Birdie', handicap: 0, match_id: MATCH.id, team_id: null },
  { id: 'wvc-sandy', player_name: 'Sandy Trap', handicap: 0, match_id: MATCH.id, team_id: null },
  { id: 'wvc-gil', player_name: 'Gil Green', handicap: 0, match_id: MATCH.id, team_id: null },
];

// Phone width, matching the reported scenario.
test.use({ viewport: { width: 390, height: 700 } });

test('all four Wolf Vegas player point cards sit in one row at equal width', async ({ page }) => {
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

  const cards = page.locator('xpath=//h1[contains(text(),"Round Complete")]/parent::div/following-sibling::div[1]/*');
  await expect(cards).toHaveCount(4);

  const boxes = await Promise.all([0, 1, 2, 3].map((i) => cards.nth(i).boundingBox()));

  // Sanity check: every card actually rendered with a box.
  for (const box of boxes) expect(box).not.toBeNull();

  // All four cards sit on the same row, not wrapped onto a row by themselves.
  const tops = boxes.map((b) => b.y);
  for (const top of tops) expect(Math.abs(top - tops[0])).toBeLessThan(1);

  // All four cards are the same width, so none stretches to fill a row alone.
  const widths = boxes.map((b) => b.width);
  for (const width of widths) expect(Math.abs(width - widths[0])).toBeLessThan(1);
});
