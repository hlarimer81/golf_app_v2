import { test, expect } from './fixtures.js';

// Wolf, 9-Point, Stableford and Chairman can be played for $ per point (matches.wager).
// Individual games: each pair of players settles the gap between their points.
// Team games: every player on the lower team pays the gap between team totals, as in Vegas.
// Every round here is gross on Test Links (pars 4 4 3 5 ...).

const base = {
  match_name: null,
  use_handicaps: false,
  course_name: 'Test Links',
  course_id: 'course-test-links',
  tee_box_id: 'tee-white',
  holes: 18,
  start_hole: 1,
  status: 'in_progress',
  created_at: new Date().toISOString(),
};

const NAMES = ['Pat Par', 'Bo Birdie', 'Sandy Trap', 'Gil Green'];

// players: [{ name, team }]; strokes: { hole: [one per player] }.
function round(id, code, extra, players, strokes) {
  const match = { ...base, id, match_code: code, ...extra };
  const rows = players.map(({ name, team }, i) => ({
    id: `${id}-${i}`, player_name: name, handicap: 0, match_id: id,
    team_id: team ? `t-${team}` : null, ...(team ? { teams: { team_name: team } } : {}),
  }));
  const scores = Object.entries(strokes).flatMap(([hole, row]) => row.map((s, i) => (
    { match_id: id, player_id: rows[i].id, hole_number: Number(hole), strokes: s }
  )));
  return { match, rows, scores };
}

async function joinRound(page, { match, rows, scores }) {
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
    return route.fulfill({ json: rows });
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

// The Money screen's per-player cards, as { name: '+$12.00' }.
async function moneyCards(page) {
  await page.getByRole('button', { name: '💰 Money' }).click();
  await expect(page.getByText('Settle Up')).toBeVisible();
  return page.evaluate(() => {
    const out = {};
    const title = [...document.querySelectorAll('div')].find(d => d.textContent === '💰 Money');
    const modal = title.closest('div[style*="max-width"]');
    const cards = modal.querySelector('div[style*="flex-wrap"]').children;
    for (const c of cards) out[c.children[0].textContent] = c.children[1].textContent;
    return out;
  });
}

test('Wolf: each pair of players settles the gap between their points', async ({ page }) => {
  // As e2e/wolf.spec.js: Pat 2, Bo 2, Sandy 6, Gil 2. At $1 Sandy is 4 up on each of three.
  const r = round('m-wolf-$', 'WOLFMN',
    { game_type: 'wolf', play_mode: 'singles', wager: { per_point: 1 }, wolf: { decisions: { 1: 'm-wolf-$-2', 2: 'm-wolf-$-3', 3: 'lone', 4: 'm-wolf-$-0' } } },
    NAMES.map(name => ({ name })),
    { 1: [3, 4, 5, 4], 2: [4, 3, 4, 5], 3: [5, 5, 3, 4], 4: [4, 4, 4, 5] });
  await joinRound(page, r);
  await expect(page.getByText('Pts: 6', { exact: true })).toBeVisible();
  expect(await moneyCards(page)).toEqual({ Pat: '-$4.00', Bo: '-$4.00', Sandy: '+$12.00', Gil: '-$4.00' });
});

test('9-Point: each pair of players settles the gap between their points', async ({ page }) => {
  // Hole 1: Pat 3, Bo 4, Sandy 5 share 5-3-1. At $1: Pat +6, Bo 0, Sandy -6.
  const r = round('m-nine-$', 'NINEMN',
    { game_type: 'ninepoint', play_mode: 'singles', wager: { per_point: 1 } },
    NAMES.slice(0, 3).map(name => ({ name })),
    { 1: [3, 4, 5] });
  await joinRound(page, r);
  expect(await moneyCards(page)).toEqual({ Pat: '+$6.00', Bo: '$0.00', Sandy: '-$6.00' });
});

test('Stableford singles: each pair of players settles the gap between their points', async ({ page }) => {
  // Hole 1, par 4: Pat 3 (3 pts), Bo 4 (2), Sandy 5 (1), Gil 6 (0). Total 6. At $1, Pat is
  // 4x3 - 6 = +6, Bo +2, Sandy -2, Gil -6.
  const r = round('m-stab-$', 'STABMN',
    { game_type: 'stableford', play_mode: 'singles', wager: { per_point: 1 } },
    NAMES.map(name => ({ name })),
    { 1: [3, 4, 5, 6] });
  await joinRound(page, r);
  expect(await moneyCards(page)).toEqual({ Pat: '+$6.00', Bo: '+$2.00', Sandy: '-$2.00', Gil: '-$6.00' });
});

test('Chairman: every player on the lower team pays the gap', async ({ page }) => {
  // Team A wins hole 1 outright (becomes Chairman, no point) and hole 2 (Chairman wins: 1 point).
  // A 1, B 0. At $5 each A player is +$5 and each B player -$5 (not $2.50 split between them).
  const r = round('m-chair-$', 'CHAIRM',
    { game_type: 'chairman', play_mode: 'team', wager: { per_point: 5 } },
    [{ name: 'Pat Par', team: 'A' }, { name: 'Bo Birdie', team: 'A' }, { name: 'Sandy Trap', team: 'B' }, { name: 'Gil Green', team: 'B' }],
    { 1: [3, 5, 4, 5], 2: [3, 5, 4, 5] });
  await joinRound(page, r);
  expect(await moneyCards(page)).toEqual({ Pat: '+$5.00', Bo: '+$5.00', Sandy: '-$5.00', Gil: '-$5.00' });
});

test('a points game shows the Money screen on the summary after Finish Round', async ({ page }) => {
  const r = round('m-stab-$s', 'STABSM',
    { game_type: 'stableford', play_mode: 'singles', wager: { per_point: 1 } },
    NAMES.map(name => ({ name })),
    { 1: [3, 4, 5, 6] });
  await joinRound(page, r);
  await page.getByRole('button', { name: /Finish Round/ }).click();
  await expect(page.getByText(/Round Complete/)).toBeVisible();
  expect(await moneyCards(page)).toEqual({ Pat: '+$6.00', Bo: '+$2.00', Sandy: '-$2.00', Gil: '-$6.00' });
});
