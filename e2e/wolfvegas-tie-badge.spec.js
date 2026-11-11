import { test, expect } from './fixtures.js';

// Issue #67: a Wolf Vegas hole that ties (both sides form the same Vegas number, a 0-point
// swing) rendered no badge at all for any player once all four scores were in, because the
// live grid's badge only rendered when holePts !== 0. That's indistinguishable from a hole
// that simply hasn't been scored yet. Every other hole shows a green '+N' or red '-N' badge,
// so a tie should show a neutral '0' badge instead of nothing.

const MATCH = {
  id: 'match-wv-tie',
  match_code: 'WVTIE1',
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
  // Wolf on hole 1 (first in the played sequence) is wvt-pat; wvt-bo is picked as partner, so
  // the sides are [pat, bo] vs [sandy, gil].
  wolf_vegas: { decisions: { 1: 'wvt-bo' }, hammers: {}, grossBirdies: true },
};

const PLAYERS = ['Pat Par', 'Bo Birdie', 'Sandy Trap', 'Gil Green'].map((name, i) => (
  { id: ['wvt-pat', 'wvt-bo', 'wvt-sandy', 'wvt-gil'][i], player_name: name, handicap: 0, match_id: MATCH.id, team_id: null }
));
// Hole 1 is par 4, no handicaps so net == gross. Both sides make 4 and 5 -> both form Vegas
// number 45. Nobody birdies, so no flip: the sides tie and the swing is 0.
const SCORES = [4, 5, 4, 5].map((strokes, i) => ({ match_id: MATCH.id, player_id: PLAYERS[i].id, hole_number: 1, strokes }));

test('a tied Wolf Vegas hole shows a neutral 0 badge instead of no badge at all', async ({ page }) => {
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
  await page.getByPlaceholder('ABC123').fill('WVTIE1');
  await page.getByRole('button', { name: 'Join Round' }).click();
  await expect(page.locator('tbody tr').first()).toBeVisible();

  // All four players' hole-1 cell shows a '0' badge, not nothing.
  const badges = page.locator('tbody tr').locator('td').getByText('0', { exact: true });
  await expect(badges).toHaveCount(4);
});
