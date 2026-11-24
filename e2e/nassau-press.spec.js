import { test, expect } from './fixtures.js';

// One PRS tap made a press on every open segment: a tap after hole 3 put three $10 lines on the
// Money screen, front, back and overall (#90, round JEM2DN). A press belongs to the nine it was
// tapped in: holes 1-9 press the front, 10-18 the back, and the overall is a separate bet.
//
// Gross, $10 front / back / overall. B wins holes 1-3, holes 4-9 are halved.

const MATCH = {
  id: 'match-nassau-press',
  match_code: 'NASPRS',
  match_name: null,
  game_type: 'nassau',
  play_mode: 'singles',
  use_handicaps: false,
  course_name: 'Test Links',
  course_id: 'course-test-links',
  tee_box_id: 'tee-white',
  holes: 18,
  start_hole: 1,
  status: 'in_progress',
  wager: { nassau_front: 10, nassau_back: 10, nassau_overall: 10, nassau_press: 0 },
  presses: [],
  created_at: new Date().toISOString(),
};

const PLAYERS = [
  { id: 'np-pat', player_name: 'Pat Par', handicap: 0, match_id: MATCH.id, team_id: 't1', teams: { team_name: 'P' } },
  { id: 'np-bo', player_name: 'Bo Birdie', handicap: 0, match_id: MATCH.id, team_id: 't2', teams: { team_name: 'B' } },
];

const SCORES = Array.from({ length: 9 }, (_, i) => i + 1).flatMap((hole) => [
  { match_id: MATCH.id, player_id: 'np-pat', hole_number: hole, strokes: 4 },
  { match_id: MATCH.id, player_id: 'np-bo', hole_number: hole, strokes: hole <= 3 ? 3 : 4 },
]);

// Returns { patch }: the last update the round sent to matches.
async function joinRound(page, match = MATCH) {
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

test('Nassau: one press after hole 3 is one front-nine bet', async ({ page }) => {
  const sent = await joinRound(page);

  // Holes 1-9 are scored, but a press after 9 would have no holes to play: 8 PRS buttons, not 9.
  const prs = page.getByRole('button', { name: 'PRS', exact: true });
  await expect(prs).toHaveCount(8);

  await prs.nth(2).click();
  await expect.poll(() => sent.patch?.presses).toEqual([2]);

  await page.getByRole('button', { name: '💰 Money' }).click();
  await expect(page.getByText('Front 9 press (after 3)')).toBeVisible();
  await expect(page.getByText(/^Back 9 press/)).toHaveCount(0);
  await expect(page.getByText(/^Overall press/)).toHaveCount(0);
});

// #91: the summary screen had no 💰 Money button, so the settle-up vanished at Finish Round and
// stayed gone when the round was reopened. With the press after 3: B wins the front 3 up ($10),
// the press is halved over 4-9, and the back and overall are unfinished, so P owes B $10.
async function expectSettleUp(page) {
  await page.getByRole('button', { name: '💰 Money' }).click();
  await expect(page.getByText('Front 9 press (after 3)')).toBeVisible();
  await expect(page.getByText('+$10.00')).toBeVisible();
  await expect(page.getByText('-$10.00')).toBeVisible();
}

test('Nassau: the settle-up is still there after Finish Round', async ({ page }) => {
  await joinRound(page, { ...MATCH, presses: [2] });
  await page.getByRole('button', { name: /Finish Round/ }).click();
  await expect(page.getByText(/Round Complete/)).toBeVisible();
  await expectSettleUp(page);
});

test('Nassau: the settle-up is there on a finished round reopened by code', async ({ page }) => {
  await joinRound(page, { ...MATCH, presses: [2], status: 'completed' });
  await expect(page.getByText(/Round Complete/)).toBeVisible();
  await expect(page.getByRole('button', { name: /Finish Round/ })).toHaveCount(0);
  await expectSettleUp(page);
});
