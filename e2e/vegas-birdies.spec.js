import { test, expect } from './fixtures.js';

// In Vegas a birdie flips the other side's number (45 -> 54). Only a natural (gross) birdie does,
// unless the round is set to net birdies: a par with a stroke is not a birdie by default. Both
// Vegas and Wolf Vegas default to gross. A Wolf Vegas round already saved on net stays on net.

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

async function joinRound(page, match, players, scores = []) {
  await page.route('**/rest/v1/matches*', (route) => {
    if (route.request().method() === 'PATCH') return route.fulfill({ json: [{ id: match.id }] });
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
}

test('Vegas: a par with a stroke does not flip the other side', async ({ page }) => {
  const match = { ...base, id: 'match-vb', match_code: 'VEGBRD', game_type: 'vegas', play_mode: 'team' };
  // Pat gets one stroke, on the hardest hole: hole 4, a par 5.
  const players = [
    { id: 'vb-pat', player_name: 'Pat Par', handicap: 1, match_id: match.id, team_id: 't1', teams: { team_name: 'A' } },
    { id: 'vb-bo', player_name: 'Bo Birdie', handicap: 0, match_id: match.id, team_id: 't1', teams: { team_name: 'A' } },
    { id: 'vb-sandy', player_name: 'Sandy Trap', handicap: 0, match_id: match.id, team_id: 't2', teams: { team_name: 'B' } },
    { id: 'vb-gil', player_name: 'Gil Green', handicap: 0, match_id: match.id, team_id: 't2', teams: { team_name: 'B' } },
  ];
  // Pat 5 (net 4), Bo 6: A makes 46. Sandy 5, Gil 6: B makes 56. A wins by 10.
  // Counting Pat's net 4 as a birdie would flip B to 65 and make it 19.
  const scores = [['vb-pat', 5], ['vb-bo', 6], ['vb-sandy', 5], ['vb-gil', 6]]
    .map(([player_id, strokes]) => ({ match_id: match.id, player_id, hole_number: 4, strokes }));

  await joinRound(page, match, players, scores);
  await expect(page.getByText('+10', { exact: true }).first()).toBeVisible();
  await expect(page.getByText('+19', { exact: true })).toHaveCount(0);
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
