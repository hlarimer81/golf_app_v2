import { test, expect } from './fixtures.js';

// Each hole's Vegas point badge is a position:absolute div (bottom:2px, right:4px, z-index:10)
// inside its own score cell, which is also position:relative. The sticky PLAYER column is
// position:sticky with the *same* z-index:10. CSS breaks a z-index tie by document order, and the
// PLAYER column is the first cell in every row, so once a hole column is scrolled far enough that
// it sits underneath the sticky column, its later-in-the-DOM badge used to win the tie and paint
// on top of the sticky column's background and player names instead of staying hidden behind it
// (issue #18, found by Rake on a phone-width scorecard: hole 17's '+11' badge for Mulligan and
// Rough rendered over their names in the PLAYER column). The fix gives the sticky column a higher
// z-index (20) so it always wins, and adds overflow:hidden to each score cell so a badge can never
// visually bleed into a neighbouring cell either.
const MATCH = {
  id: 'match-vegas',
  match_code: 'VEGAS1',
  match_name: null,
  game_type: 'vegas',
  play_mode: 'team',
  use_handicaps: false,
  course_name: 'Test Links',
  course_id: 'course-test-links',
  tee_box_id: 'tee-white',
  holes: 18,
  start_hole: 1,
  status: 'in_progress',
  created_at: new Date().toISOString(),
};

// Two teams of two. Holes 3 (par 3) and 17 (par 4) both give team B a 12-point Vegas swing from
// the raw two-digit concatenation - nobody birdies either hole, so the swing isn't a birdie flip.
const PLAYERS = [
  { id: 'mp-pat', player_name: 'Pat Par', handicap: 0, match_id: MATCH.id, team_id: 't1', teams: { team_name: 'A' } },
  { id: 'mp-bo', player_name: 'Bo Birdie', handicap: 0, match_id: MATCH.id, team_id: 't1', teams: { team_name: 'A' } },
  { id: 'mp-sandy', player_name: 'Sandy Trap', handicap: 0, match_id: MATCH.id, team_id: 't2', teams: { team_name: 'B' } },
  { id: 'mp-gil', player_name: 'Gil Green', handicap: 0, match_id: MATCH.id, team_id: 't2', teams: { team_name: 'B' } },
];

const SCORES = [
  [3, 4, 5, 3, 3],
  [17, 5, 6, 4, 4],
].flatMap(([hole, pat, bo, sandy, gil]) => [
  { match_id: MATCH.id, player_id: 'mp-pat', hole_number: hole, strokes: pat },
  { match_id: MATCH.id, player_id: 'mp-bo', hole_number: hole, strokes: bo },
  { match_id: MATCH.id, player_id: 'mp-sandy', hole_number: hole, strokes: sandy },
  { match_id: MATCH.id, player_id: 'mp-gil', hole_number: hole, strokes: gil },
]);

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
  await page.route('**/rest/v1/scores*', (route) => {
    if (route.request().method() !== 'GET') return route.fallback();
    return route.fulfill({ json: SCORES });
  });
}

// Narrow enough that scrolling the scorecard all the way to the right leaves a hole column's
// badge sitting underneath the sticky PLAYER column, not just beside it.
test.use({ viewport: { width: 320, height: 700 } });

test('a Vegas point badge never renders inside the next cell or over the sticky column', async ({ page }) => {
  await serveRound(page);
  await page.goto('/');
  await page.getByRole('button', { name: 'Join Round' }).click();
  await page.getByPlaceholder('ABC123').fill('VEGAS1');
  await page.getByRole('button', { name: 'Join Round' }).click();

  const rows = page.locator('tbody tr');
  // td 3 (0-based) is hole 3: PLAYER, holes 1-9 (9 cells). Row 2 is Sandy, team B - the winner.
  const sandyHole3 = rows.nth(2).locator('td').nth(3);
  const cellBox = await sandyHole3.boundingBox();
  const badgeBox = await sandyHole3.getByText('+12', { exact: true }).boundingBox();
  expect(badgeBox.x).toBeGreaterThanOrEqual(cellBox.x - 0.5);
  expect(badgeBox.x + badgeBox.width).toBeLessThanOrEqual(cellBox.x + cellBox.width + 0.5);

  // Scroll the scorecard all the way right. Only holes 17, 18, IN and TOT remain after hole 17 at
  // this width, so hole 17 ends up scrolled entirely underneath the sticky PLAYER column.
  const scrollContainer = page.locator('table').locator('xpath=..');
  await scrollContainer.evaluate((el) => { el.scrollLeft = el.scrollWidth; });

  // td 18 (0-based): PLAYER, holes 1-9, OUT, holes 10-16 (7 cells) -> index 18 is hole 17.
  const sandyHole17 = rows.nth(2).locator('td').nth(18);
  await expect(sandyHole17).toHaveText('+12');
  const badge17 = sandyHole17.getByText('+12', { exact: true });
  const badge17Box = await badge17.boundingBox();

  // Hole 17's cell, badge included, is now scrolled entirely underneath the sticky PLAYER
  // column - same as the score tile next to it, it should render BEHIND the sticky column, not
  // paint on top of it. The element actually on top at the badge's position must not be the
  // badge itself.
  const badgeIsOnTop = await page.evaluate(
    ({ x, y, badge }) => document.elementFromPoint(x, y) === badge,
    { x: badge17Box.x + badge17Box.width / 2, y: badge17Box.y + badge17Box.height / 2, badge: await badge17.elementHandle() }
  );
  expect(badgeIsOnTop).toBe(false);
});
