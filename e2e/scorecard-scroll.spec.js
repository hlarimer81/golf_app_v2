import { test, expect } from './fixtures.js';

// Horizontal scrolling the scorecard has no natural stopping point, so a swipe or momentum scroll
// can come to rest with a hole column only half-covered by the sticky PLAYER column instead of
// fully behind it. For a par score that's invisible (the cell just blends into the background),
// but a bogey-or-worse score draws a bright bordered box (GolfScoreTile), and the slice of that
// box left exposed by a half-covered column reads as a stray white sliver leaking out from under
// the sticky column (issue #32, found by Rake: holes 5 and 14 each left a sliver on the rows with
// a bogey-or-worse score there, and no sliver on the rows that parred). It isn't the box's border
// escaping its own cell - the cell itself is just sitting half under the sticky column, same as it
// would for any other score. The fix snaps horizontal scrolling to each hole's left edge, with
// scroll-padding reserving the sticky PLAYER column's own (name-dependent) width, so scrolling
// always rests with a hole either fully shown or fully hidden, never straddling the boundary.
//
// One edge case the fix doesn't reach: scrolled all the way to the physical end (TOT flush against
// the right edge), the column before the last few can still straddle - there's no further room to
// scroll into, so mandatory snapping has nowhere valid left to rest. That's a narrower case than
// the reported one (which was mid-round, mid-table) and closing it needs trailing blank space after
// TOT, which would be its own, more visible oddity - not covered here.
const MATCH = {
  id: 'match-singles-scroll',
  match_code: 'SCROL1',
  match_name: null,
  game_type: 'singles',
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
  { id: 'sp-pat', player_name: 'Pat Par', handicap: 0, match_id: MATCH.id, team_id: null },
  { id: 'sp-bo', player_name: 'Bo Birdie', handicap: 0, match_id: MATCH.id, team_id: null },
  { id: 'sp-sandy', player_name: 'Sandy Trap', handicap: 0, match_id: MATCH.id, team_id: null },
  { id: 'sp-gil', player_name: 'Gil Green', handicap: 0, match_id: MATCH.id, team_id: null },
];

// Hole 5 is a par 4. Pat and Bo bogey it (draws GolfScoreTile's bordered box); Sandy and Gil par it
// (no box at all) - same pairing the AI tester saw.
const SCORES = [1, 2, 3, 4, 5, 6, 7, 8, 9].flatMap((hole) => [
  { match_id: MATCH.id, player_id: 'sp-pat', hole_number: hole, strokes: hole === 5 ? 5 : 4 },
  { match_id: MATCH.id, player_id: 'sp-bo', hole_number: hole, strokes: hole === 5 ? 5 : 4 },
  { match_id: MATCH.id, player_id: 'sp-sandy', hole_number: hole, strokes: 4 },
  { match_id: MATCH.id, player_id: 'sp-gil', hole_number: hole, strokes: 4 },
]);

test.use({ viewport: { width: 400, height: 700 } });

test('no hole column is left straddling the sticky PLAYER column at rest', async ({ page }) => {
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
  await page.getByPlaceholder('ABC123').fill('SCROL1');
  await page.getByRole('button', { name: 'Join Round' }).click();
  await expect(page.locator('tbody tr').first()).toBeVisible();

  const scrollContainer = page.locator('table').locator('xpath=..');
  const maxScroll = await scrollContainer.evaluate((el) => el.scrollWidth - el.clientWidth);

  // Arbitrary, not-column-aligned scroll targets spread across the middle of the scrollable range -
  // the kind of place a swipe's momentum would actually stop, not a tidy multiple of a column's
  // width and not the physical end (see the comment above).
  const targets = [0.15, 0.32, 0.47, 0.58, 0.7, 0.85].map((frac) => Math.round(maxScroll * frac));

  for (const target of targets) {
    await scrollContainer.evaluate((el, left) => { el.scrollTo({ left, behavior: 'instant' }); }, target);
    // Let scroll-snap settle before reading geometry back out.
    await page.waitForTimeout(150);

    const straddlers = await page.evaluate(() => {
      const stickyRight = document.querySelector('tbody tr td:first-child').getBoundingClientRect().right;
      const rows = Array.from(document.querySelectorAll('tbody tr'));
      const found = [];
      for (const row of rows) {
        const cells = Array.from(row.children).slice(1); // skip the sticky PLAYER cell
        for (const cell of cells) {
          const r = cell.getBoundingClientRect();
          if (r.left < stickyRight - 0.5 && r.right > stickyRight + 0.5) {
            found.push({ left: r.left, right: r.right, stickyRight });
          }
        }
      }
      return found;
    });

    expect(straddlers).toEqual([]);
  }
});
