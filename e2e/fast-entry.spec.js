import { test, expect } from './fixtures.js';

// Typing a digit moves focus to the next golfer on the same hole, 10ms later. A scorer catching up
// across one golfer's row can tap the next hole inside that window; the jump used to fire anyway,
// so the digit they typed landed in the cell below and the cell they tapped stayed empty (issue #29).
// The jump is held on the page's clock, so each test decides when it fires.

const MATCH = {
  id: 'match-singles-fast',
  match_code: 'SFAST1',
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
  { id: 'fast-pat', player_name: 'Pat Par', handicap: 0, match_id: MATCH.id, team_id: 't1', teams: { team_name: 'P' } },
  { id: 'fast-bo', player_name: 'Bo Birdie', handicap: 0, match_id: MATCH.id, team_id: 't2', teams: { team_name: 'B' } },
];

async function joinRoundOnHeldClock(page) {
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
  await expect(page.locator('#score-1-0')).toBeVisible();
  await page.clock.pauseAt(new Date('2026-10-18T13:00:00Z'));
}

test('a cell tapped before the jump to the next golfer keeps the digit typed into it (issue #29)', async ({ page }) => {
  await joinRoundOnHeldClock(page);

  // Pat's hole 1, then straight on to Pat's hole 2 before the jump to Bo's hole 1 has fired.
  await page.locator('#score-1-0').pressSequentially('4');
  await page.locator('#score-2-0').click();
  await page.clock.runFor(50);
  await page.keyboard.type('5');

  await expect(page.locator('#score-2-0')).toBeFocused();
  await expect(page.locator('#score-1-0')).toHaveValue('4');
  await expect(page.locator('#score-2-0')).toHaveValue('5');
  await expect(page.locator('#score-1-1')).toHaveValue('');
});

test('typing a digit still moves to the next golfer on the same hole', async ({ page }) => {
  await joinRoundOnHeldClock(page);

  await page.locator('#score-1-0').pressSequentially('4');
  await page.clock.runFor(50);

  await expect(page.locator('#score-1-1')).toBeFocused();
});
