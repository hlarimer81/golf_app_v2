import { test, expect } from './fixtures.js';
import { mockRealtime } from './realtime.js';

// Every change to a match's scores, from this phone or another, makes the grid refetch them all
// (src/hooks/useScores.js). A refetch must never take a confirmed score off the screen (issue #29).

const MATCH = {
  id: 'match-singles-refetch',
  match_code: 'SREF01',
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
  { id: 'ref-pat', player_name: 'Pat Par', handicap: 0, match_id: MATCH.id, team_id: 't1', teams: { team_name: 'P' } },
  { id: 'ref-bo', player_name: 'Bo Birdie', handicap: 0, match_id: MATCH.id, team_id: 't2', teams: { team_name: 'B' } },
];

const PAT_FOUR_ON_ONE = [{ match_id: MATCH.id, player_id: 'ref-pat', hole_number: 1, strokes: 4 }];

const patHoleOne = (page) => page.locator('#score-1-0');
const saving = (page) => page.getByRole('status').filter({ hasText: 'Saving' });

// Joins the round with the first load answered empty. Every later read of `scores` is held in the
// returned list until the test answers it.
async function joinRound(page) {
  const realtime = await mockRealtime(page);
  const heldReads = [];
  let firstRead = true;

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
    if (request.method() === 'POST') {
      return route.fulfill({ json: [{ hole_number: JSON.parse(request.postData()).hole_number }] });
    }
    if (request.method() !== 'GET') return route.fallback();
    if (firstRead) {
      firstRead = false;
      return route.fulfill({ json: [] });
    }
    heldReads.push(route);
  });

  await page.goto('/');
  await page.getByRole('button', { name: 'Join Round' }).click();
  await page.getByPlaceholder('ABC123').fill(MATCH.match_code);
  await page.getByRole('button', { name: 'Join Round' }).click();
  await expect(patHoleOne(page)).toBeVisible();
  await expect.poll(() => realtime.listening('scores')).toBe(true);
  return { realtime, heldReads };
}

// Pat's 4 on hole 1, entered and confirmed by the database, so nothing is left in the outbox.
async function enterConfirmedScore(page) {
  await patHoleOne(page).fill('4');
  await expect(saving(page)).toHaveCount(0);
}

// Give the app a moment to apply a refetch it has just been answered.
const settle = (page) => page.evaluate(() => new Promise((resolve) => setTimeout(resolve, 200)));

test('an older refetch that comes back last does not wipe a confirmed score', async ({ page }) => {
  const { realtime, heldReads } = await joinRound(page);
  await enterConfirmedScore(page);

  // Two changes, two refetches in flight. The first was sent before Pat's 4 reached the database;
  // the second after.
  await realtime.change('scores');
  await expect.poll(() => heldReads.length).toBe(1);
  await realtime.change('scores');
  await expect.poll(() => heldReads.length).toBe(2);

  await heldReads[1].fulfill({ json: PAT_FOUR_ON_ONE });
  await expect(patHoleOne(page)).toHaveValue('4');
  await heldReads[0].fulfill({ json: [] });
  await settle(page);

  await expect(patHoleOne(page)).toHaveValue('4');
});
