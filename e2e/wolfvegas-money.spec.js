import { test, expect } from './fixtures.js';

// Wolf Vegas can be played for money: $ per point, saved to matches.wager. A Wolf Vegas total is
// already settled player against player, so the money is the points times the rate. (The generic
// per-point settlement would pay each total out again against every opponent.)
//
// One gross hole on Test Links (par 4). Pat is Wolf and takes Bo: Pat 4, Bo 5 make 45. Sandy and
// Gil both make 5: 55. Two against two, so each side settles 10 once: Pat and Bo +10, Sandy and
// Gil -10. At $1 a point that is $10 each way.

const MATCH = {
  id: 'match-wvm',
  match_code: 'WVMONY',
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
  wolf_vegas: { decisions: { 1: 'wvm-bo' }, hammers: {}, grossBirdies: true },
};

const PLAYERS = ['Pat Par', 'Bo Birdie', 'Sandy Trap', 'Gil Green'].map((name, i) => (
  { id: ['wvm-pat', 'wvm-bo', 'wvm-sandy', 'wvm-gil'][i], player_name: name, handicap: 0, match_id: MATCH.id, team_id: null }
));
const SCORES = [4, 5, 5, 5].map((strokes, i) => ({ match_id: MATCH.id, player_id: PLAYERS[i].id, hole_number: 1, strokes }));

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

test('Wolf Vegas: setting $ per point saves the wager', async ({ page }) => {
  const sent = await joinRound(page, MATCH);
  await expect(page.getByRole('button', { name: '💰 Money' })).toHaveCount(0);

  await page.getByRole('button', { name: '💵 Wager' }).click();
  await page.getByRole('spinbutton').fill('1');
  await page.getByRole('button', { name: 'Save' }).click();

  await expect.poll(() => sent.patch?.wager?.per_point).toBe(1);
  await expect(page.getByRole('button', { name: '💵 $1.00/pt' })).toBeVisible();
  await expect(page.getByRole('button', { name: '💰 Money' })).toBeVisible();
});

test('Wolf Vegas: the Money screen pays points times the rate', async ({ page }) => {
  await joinRound(page, { ...MATCH, wager: { per_point: 1 } });
  await page.getByRole('button', { name: '💰 Money' }).click();

  // $10 each way, not $40 (the per-opponent formula would give 4 x 10 - 0).
  await expect(page.getByText('+$10.00')).toHaveCount(4); // two cards and two breakdown lines
  await expect(page.getByText('-$10.00')).toHaveCount(4);
  await expect(page.getByText('$40.00')).toHaveCount(0);
  // Two payments of $10.
  await expect(page.getByText(/^\$10\.00$/)).toHaveCount(2);
});

test('Wolf Vegas: the summary shows each player\'s money', async ({ page }) => {
  await joinRound(page, { ...MATCH, wager: { per_point: 0.5 } });
  await page.getByRole('button', { name: /Finish Round/ }).click();
  await expect(page.getByText(/Round Complete/)).toBeVisible();
  await expect(page.getByText('+$5.00')).toHaveCount(2);
  await expect(page.getByText('-$5.00')).toHaveCount(2);
});
