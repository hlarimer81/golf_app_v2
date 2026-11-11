import { test, expect } from './fixtures.js';

// Issue #70: the Per-Hole Breakdown table on the Round Complete summary reused the live
// scorecard's hammer stepper (-/+) unguarded, so tapping it after Finish Round kept mutating and
// saving matches.wolf_vegas for an already-finished, banked round (found by Hazard).
// Fixed by rendering the hammer multiplier as plain text once the round is banked.

const MATCH = {
  id: 'match-wvhr',
  match_code: 'WVHAMR',
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
  wolf_vegas: { decisions: { 1: 'wvhr-bo' }, hammers: {}, grossBirdies: true },
};

const PLAYERS = ['Pat Par', 'Bo Birdie', 'Sandy Trap', 'Gil Green'].map((name, i) => (
  { id: ['wvhr-pat', 'wvhr-bo', 'wvhr-sandy', 'wvhr-gil'][i], player_name: name, handicap: 0, match_id: MATCH.id, team_id: null }
));
const SCORES = [4, 5, 5, 5].map((strokes, i) => ({ match_id: MATCH.id, player_id: PLAYERS[i].id, hole_number: 1, strokes }));

test('Wolf Vegas: the finished round\'s Per-Hole Breakdown hammer control is not interactive', async ({ page }) => {
  const patches = [];
  await page.route('**/rest/v1/matches*', (route) => {
    if (route.request().method() === 'PATCH') {
      patches.push(JSON.parse(route.request().postData() || '{}'));
      return route.fulfill({ json: [{ id: MATCH.id }] });
    }
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

  // The hammer multiplier still shows, as plain text, but the -/+ stepper is gone.
  await expect(page.locator('tbody tr').first().getByText('×1')).toBeVisible();
  await expect(page.getByRole('button', { name: '+' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: '−' })).toHaveCount(0);

  // Nothing after Finish Round should write wolf_vegas again.
  expect(patches.some(p => p.wolf_vegas)).toBe(false);
});
