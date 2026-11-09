import { test, expect } from './fixtures.js';

// Vegas can be played for money: $ per point, saved to matches.wager. Every player on the losing
// team pays the gap between the team totals (decided 2026-11-09): A 60, B 40 at $1 is $20 each.
//
// One gross hole on Test Links (par 4). Team A: Pat 4, Bo 5 make 45. Team B: Sandy 5, Gil 6 make
// 56. A wins by 11, so at $1 each A player is +$11 and each B player -$11.

const MATCH = {
  id: 'match-vm',
  match_code: 'VEGMNY',
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

const PLAYERS = [
  { id: 'vm-pat', player_name: 'Pat Par', handicap: 0, match_id: MATCH.id, team_id: 't1', teams: { team_name: 'A' } },
  { id: 'vm-bo', player_name: 'Bo Birdie', handicap: 0, match_id: MATCH.id, team_id: 't1', teams: { team_name: 'A' } },
  { id: 'vm-sandy', player_name: 'Sandy Trap', handicap: 0, match_id: MATCH.id, team_id: 't2', teams: { team_name: 'B' } },
  { id: 'vm-gil', player_name: 'Gil Green', handicap: 0, match_id: MATCH.id, team_id: 't2', teams: { team_name: 'B' } },
];
const SCORES = [4, 5, 5, 6].map((strokes, i) => ({ match_id: MATCH.id, player_id: PLAYERS[i].id, hole_number: 1, strokes }));

// Returns { patch }: the last update the round sent to matches.
async function joinRound(page, match) {
  const sent = { patch: null };
  await page.route('**/rest/v1/matches*', (route) => {
    if (route.request().method() === 'PATCH') {
      sent.patch = JSON.parse(route.request().postData() || '{}');
      return route.fulfill({ json: [{ id: match.id }] });
    }
    if (route.request().method() !== 'GET') return route.fallback();
    const single = (route.request().headers()['accept'] || '').includes('vnd.pgrst.object');
    return route.fulfill({ json: single ? match : [match] });
  });
  await page.route('**/rest/v1/players*', (route) => {
    const url = new URL(route.request().url());
    if (route.request().method() !== 'GET' || url.searchParams.get('match_id') !== `eq.${match.id}`) {
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
  await page.getByPlaceholder('ABC123').fill(match.match_code);
  await page.getByRole('button', { name: 'Join Round' }).click();
  return sent;
}

test('Vegas: setting $ per point saves the wager', async ({ page }) => {
  const sent = await joinRound(page, MATCH);
  await expect(page.getByRole('button', { name: '💰 Money' })).toHaveCount(0);

  await page.getByRole('button', { name: '💵 Wager' }).click();
  await page.getByRole('spinbutton').fill('1');
  await page.getByRole('button', { name: 'Save' }).click();

  await expect.poll(() => sent.patch?.wager?.per_point).toBe(1);
  await expect(page.getByRole('button', { name: '💵 $1.00/pt' })).toBeVisible();
  await expect(page.getByRole('button', { name: '💰 Money' })).toBeVisible();
});

test('Vegas: every player on the losing team pays the gap', async ({ page }) => {
  await joinRound(page, { ...MATCH, wager: { per_point: 1 } });
  await page.getByRole('button', { name: '💰 Money' }).click();

  // +$11 to each A player, not $11 split between them.
  await expect(page.getByText('+$11.00')).toHaveCount(2);
  await expect(page.getByText('-$11.00')).toHaveCount(2);
  await expect(page.getByText('+$5.50')).toHaveCount(0);
  // The breakdown line, then two payments of $11.
  await expect(page.getByText(/^\$11\.00$/)).toHaveCount(3);
});

test('Vegas: the Money screen is still there after Finish Round', async ({ page }) => {
  await joinRound(page, { ...MATCH, wager: { per_point: 1 } });
  await page.getByRole('button', { name: /Finish Round/ }).click();
  await expect(page.getByText(/Round Complete/)).toBeVisible();

  await page.getByRole('button', { name: '💰 Money' }).click();
  await expect(page.getByText('+$11.00')).toHaveCount(2);
});
