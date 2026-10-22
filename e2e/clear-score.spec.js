import { test, expect } from './fixtures.js';

// Clearing a cell has to take its score out of the standings at once, the same way typing one puts
// it in, and the clear has to reach the database as a DELETE. Issue #34 reported the old score
// staying counted; it came from a script setting the cell's value, which the app never sees. This
// clears the cell with keys, the way a golfer does.

const MATCH = {
  id: 'match-singles-clear',
  match_code: 'SCLR01',
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
  { id: 'clear-pat', player_name: 'Pat Par', handicap: 0, match_id: MATCH.id, team_id: 't1', teams: { team_name: 'P' } },
  { id: 'clear-bo', player_name: 'Bo Birdie', handicap: 0, match_id: MATCH.id, team_id: 't2', teams: { team_name: 'B' } },
];

async function joinRound(page) {
  const deletes = [];
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
    if (request.method() === 'DELETE') {
      const url = new URL(request.url());
      deletes.push({ player: url.searchParams.get('player_id'), hole: url.searchParams.get('hole_number') });
      return route.fulfill({ json: [{ hole_number: Number(url.searchParams.get('hole_number').replace(/^eq\./, '')) }] });
    }
    return route.fallback();
  });

  await page.goto('/');
  await page.getByRole('button', { name: 'Join Round' }).click();
  await page.getByPlaceholder('ABC123').fill(MATCH.match_code);
  await page.getByRole('button', { name: 'Join Round' }).click();
  await expect(page.locator('#score-1-0')).toBeVisible();
  return deletes;
}

const patRow = (page) => page.locator('tr', { has: page.locator('#score-1-0') });
// Player column, holes 1-9, then OUT.
const patOut = (page) => patRow(page).locator('td').nth(10);
const patTot = (page) => patRow(page).locator('td').last();
const patLeaderboard = (page) =>
  page.getByText('Pat Par', { exact: false }).first().locator('xpath=following-sibling::div[1]');

test('clearing a score takes it out of the totals and the leaderboard at once (issue #34)', async ({ page }) => {
  const deletes = await joinRound(page);

  await page.locator('#score-1-0').pressSequentially('4');
  await page.locator('#score-2-0').click();
  await page.keyboard.type('9');
  await expect(patTot(page)).toHaveText('13');
  await expect(patOut(page)).toHaveText('13');
  await expect(patLeaderboard(page)).toHaveText('13');

  await page.locator('#score-2-0').click();
  await page.keyboard.press('ControlOrMeta+a');
  await page.keyboard.press('Backspace');

  await expect(page.locator('#score-2-0')).toHaveValue('');
  await expect(patTot(page)).toHaveText('4');
  await expect(patOut(page)).toHaveText('4');
  await expect(patLeaderboard(page)).toHaveText('4');
  await expect.poll(() => deletes).toEqual([{ player: 'eq.clear-pat', hole: 'eq.2' }]);

  // The real score goes in on top, counted once.
  await page.locator('#score-2-0').click();
  await page.keyboard.type('3');
  await expect(patTot(page)).toHaveText('7');
  await expect(patLeaderboard(page)).toHaveText('7');
});
