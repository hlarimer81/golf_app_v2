import { test, expect } from './fixtures.js';

// In Vegas a birdie flips the other side's number (45 -> 54). Only a natural (gross) birdie does,
// unless the round is set to net birdies: a par with a stroke is not a birdie by default. Both
// Vegas and Wolf Vegas default to gross, and each has a switch to net. A round saved on net stays on net.

const base = {
  match_name: null,
  course_name: 'Test Links',
  course_id: 'course-test-links',
  tee_box_id: 'tee-white',
  holes: 18,
  start_hole: 1,
  status: 'in_progress',
  use_handicaps: true,
  play_off_low: true,
  handicap_allowance_pct: 100,
  created_at: new Date().toISOString(),
};

// Returns { patch }: the body of the last update the round sent to matches.
async function joinRound(page, match, players, scores = []) {
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
    return route.fulfill({ json: players });
  });
  await page.route('**/rest/v1/scores*', (route) => {
    if (route.request().method() !== 'GET') return route.fallback();
    return route.fulfill({ json: scores });
  });
  await page.goto('/');
  await page.getByRole('button', { name: 'Join Round' }).click();
  await page.getByPlaceholder('ABC123').fill(match.match_code);
  await page.getByRole('button', { name: 'Join Round' }).click();
  return sent;
}

// A Vegas round where Pat gets one stroke, on the hardest hole: hole 4, a par 5.
// Pat 5 (net 4), Bo 6: A makes 46. Sandy 5, Gil 6: B makes 56. A wins by 10.
// Counting Pat's net 4 as a birdie flips B to 65 and makes it 19.
function vegasRound(id, code, extra = {}) {
  const match = { ...base, id, match_code: code, game_type: 'vegas', play_mode: 'team', ...extra };
  const players = [
    { id: `${id}-pat`, player_name: 'Pat Par', handicap: 1, match_id: id, team_id: 't1', teams: { team_name: 'A' } },
    { id: `${id}-bo`, player_name: 'Bo Birdie', handicap: 0, match_id: id, team_id: 't1', teams: { team_name: 'A' } },
    { id: `${id}-sandy`, player_name: 'Sandy Trap', handicap: 0, match_id: id, team_id: 't2', teams: { team_name: 'B' } },
    { id: `${id}-gil`, player_name: 'Gil Green', handicap: 0, match_id: id, team_id: 't2', teams: { team_name: 'B' } },
  ];
  const scores = [5, 6, 5, 6].map((strokes, i) => ({ match_id: id, player_id: players[i].id, hole_number: 4, strokes }));
  return [match, players, scores];
}

test('Vegas: a par with a stroke does not flip the other side', async ({ page }) => {
  await joinRound(page, ...vegasRound('match-vb', 'VEGBRD'));
  await expect(page.getByRole('button', { name: 'Birdies: Gross' })).toBeVisible();
  await expect(page.getByText('+10', { exact: true }).first()).toBeVisible();
  await expect(page.getByText('+19', { exact: true })).toHaveCount(0);
});

test('Vegas: switching to net birdies rescores the hole and saves the choice', async ({ page }) => {
  const sent = await joinRound(page, ...vegasRound('match-vbt', 'VEGTGL'));
  await expect(page.getByText('+10', { exact: true }).first()).toBeVisible();

  await page.getByRole('button', { name: 'Birdies: Gross' }).click();
  await expect(page.getByRole('button', { name: 'Birdies: Net' })).toBeVisible();
  await expect(page.getByText('+19', { exact: true }).first()).toBeVisible();
  await expect.poll(() => sent.patch?.vegas).toEqual({ grossBirdies: false });
});

test('Vegas: a round saved on net birdies opens on net', async ({ page }) => {
  await joinRound(page, ...vegasRound('match-vbn', 'VEGNET', { vegas: { grossBirdies: false } }));
  await expect(page.getByRole('button', { name: 'Birdies: Net' })).toBeVisible();
  await expect(page.getByText('+19', { exact: true }).first()).toBeVisible();
});

const wolfPlayers = (matchId) => ['Pat Par', 'Bo Birdie', 'Sandy Trap', 'Gil Green'].map((name, i) => (
  { id: `${matchId}-${i}`, player_name: name, handicap: 0, match_id: matchId, team_id: null }
));

test('Wolf Vegas: a new round counts gross birdies', async ({ page }) => {
  const match = { ...base, id: 'match-wvg', match_code: 'WVGROS', game_type: 'wolfvegas', play_mode: 'singles' };
  await joinRound(page, match, wolfPlayers(match.id));
  await expect(page.getByRole('button', { name: 'Birdies: Gross' })).toBeVisible();
});

test('Wolf Vegas: a round saved on net birdies stays on net', async ({ page }) => {
  const match = {
    ...base, id: 'match-wvn', match_code: 'WVNETT', game_type: 'wolfvegas', play_mode: 'singles',
    wolf_vegas: { decisions: {}, hammers: {}, grossBirdies: false },
  };
  await joinRound(page, match, wolfPlayers(match.id));
  await expect(page.getByRole('button', { name: 'Birdies: Net' })).toBeVisible();
});
