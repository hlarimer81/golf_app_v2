import { test, expect } from './fixtures.js';

// Issue #38: in team play, typing a score used to jump focus to the next player's box in the
// underlying (unsorted) players array, not the next row actually drawn on screen. With two teams
// interleaved in the players array, that sent focus to a player two rows down in the other team's
// block instead of the player directly beneath, on the same team.

const MATCH = {
  id: 'match-stableford-team-advance',
  match_code: 'TADV01',
  match_name: null,
  game_type: 'stableford',
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

// Deliberately interleaved in the underlying array - Team A, Team B, Team A, Team B - the way the
// reported round's players came back, so the rendered (team-grouped) order differs from array order.
const PLAYERS = [
  { id: 'adv-hazard', player_name: 'Hazard', handicap: 0, match_id: MATCH.id, team_id: 'ta', teams: { team_name: 'Team A' } },
  { id: 'adv-mulligan', player_name: 'Mulligan', handicap: 0, match_id: MATCH.id, team_id: 'tb', teams: { team_name: 'Team B' } },
  { id: 'adv-rake', player_name: 'Rake', handicap: 0, match_id: MATCH.id, team_id: 'ta', teams: { team_name: 'Team A' } },
  { id: 'adv-rough', player_name: 'Rough', handicap: 0, match_id: MATCH.id, team_id: 'tb', teams: { team_name: 'Team B' } },
];

test('typing a score in team stableford moves focus to the row drawn directly below, not the next player in join order (issue #38)', async ({ page }) => {
  await page.clock.install({ time: new Date('2026-10-18T12:00:00Z') });
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
    const request = route.request();
    if (request.method() === 'GET') return route.fulfill({ json: [] });
    if (request.method() === 'POST') {
      return route.fulfill({ json: [{ hole_number: JSON.parse(request.postData()).hole_number }] });
    }
    return route.fallback();
  });

  await page.goto('/');
  await page.getByRole('button', { name: 'Join Round' }).click();
  await page.getByPlaceholder('ABC123').fill(MATCH.match_code);
  await page.getByRole('button', { name: 'Join Round' }).click();

  const hazardRow = page.locator('tr', { hasText: 'Hazard' });
  const rakeRow = page.locator('tr', { hasText: 'Rake' });
  const mulliganRow = page.locator('tr', { hasText: 'Mulligan' });
  await expect(hazardRow.locator('input').first()).toBeVisible();

  await hazardRow.locator('input').first().pressSequentially('4');
  await page.clock.runFor(50);

  await expect(rakeRow.locator('input').first()).toBeFocused();
  await expect(mulliganRow.locator('input').first()).not.toBeFocused();
});
