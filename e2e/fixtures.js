import { test as base, expect } from '@playwright/test';

// The test build points the Supabase client at this host. It doesn't exist: every request to it is
// answered from `tables` below, and any request leaving the machine for anywhere else is aborted,
// so a test can never read or write a real database.
export const SUPABASE_URL = 'http://supabase.test';

const par72 = [4, 4, 3, 5, 4, 4, 3, 4, 5, 4, 4, 3, 5, 4, 4, 3, 4, 5];
const strokeIndex = [7, 11, 17, 1, 9, 5, 15, 13, 3, 8, 12, 18, 2, 10, 6, 16, 14, 4];

// PostgREST responses keyed by table name. A table not listed here returns [].
export const tables = {
  golf_courses: [
    {
      id: 'course-test-links',
      name: 'Test Links',
      location: 'Ames, IA',
      holes: 18,
      greens: null,
      tee_boxes: [
        { id: 'tee-white', tee_name: 'White', tee_color: 'white', rating: 70.1, slope: 121, par: par72, stroke_index: strokeIndex, yardage: null },
        { id: 'tee-blue', tee_name: 'Blue', tee_color: 'blue', rating: 72.4, slope: 128, par: par72, stroke_index: strokeIndex, yardage: null },
      ],
    },
    // Name is long on purpose: it's what pushed the course select past the edge of a phone screen.
    {
      id: 'course-long-name',
      name: 'Pebble Brook National Golf and Country Club Championship Course',
      location: 'Ames, IA',
      holes: 18,
      greens: null,
      tee_boxes: [
        { id: 'tee-long-white', tee_name: 'White', tee_color: 'white', rating: 70.1, slope: 121, par: par72, stroke_index: strokeIndex, yardage: null },
      ],
    },
  ],
  players: [
    { id: 'player-pat', player_name: 'Pat Par', handicap: 12, match_id: null, team_id: null },
    { id: 'player-bo', player_name: 'Bo Birdie', handicap: 4, match_id: null, team_id: null },
    { id: 'player-sandy', player_name: 'Sandy Trap', handicap: 21, match_id: null, team_id: null },
    { id: 'player-gil', player_name: 'Gil Green', handicap: 16, match_id: null, team_id: null },
  ],
  handicap_summary: [
    { canonical_name: 'Pat Par', handicap_index: 12.4, rounds_used: 8, rounds_available: 20, estimated_count: 0, method: 'rated' },
    { canonical_name: 'Bo Birdie', handicap_index: 4.1, rounds_used: 8, rounds_available: 12, estimated_count: 0, method: 'rated' },
  ],
  // Account-to-player claims. Bo Birdie is already held by another account, so claiming him
  // exercises the pending path. Mutable per test: see claimsState() below.
  player_account: [
    { account_id: 'account-bo', canonical_name: 'Bo Birdie', status: 'confirmed' },
  ],
  // Who played with whom, for the player picker's ordering. Pat and Bo are regulars who play
  // together; Sandy has one round and Gil has none, so the picker has a real order to produce
  // rather than an alphabetical fallback.
  // Dated, because the picker weights recent rounds more heavily. Pat and Bo played together
  // recently; Sandy's round is old enough to be faded by the time it is ranked.
  round_differential: [
    { canonical_name: 'Pat Par', match_id: 'm1', played_on: '2026-08-02' },
    { canonical_name: 'Bo Birdie', match_id: 'm1', played_on: '2026-08-02' },
    { canonical_name: 'Pat Par', match_id: 'm2', played_on: '2026-08-16' },
    { canonical_name: 'Bo Birdie', match_id: 'm2', played_on: '2026-08-16' },
    { canonical_name: 'Pat Par', match_id: 'm3', played_on: '2023-05-14' },
    { canonical_name: 'Sandy Trap', match_id: 'm3', played_on: '2023-05-14' },
  ],
  courses: [],
  matches: [],
};

// The account the mocked auth server signs in, and the one code it accepts. Any other code is
// refused the way GoTrue refuses it, so a test can exercise the wrong-code path too.
export const AUTH_USER = { id: '00000000-0000-4000-8000-000000000001', email: 'pat@example.com' };
export const AUTH_CODE = '123456';

// GoTrue endpoints the sign-in flow calls: otp sends the email, verify trades the code for a
// session, logout ends it. Anything else under /auth/v1/ is a request the app shouldn't make yet.
function fulfillAuth(route, endpoint) {
  const request = route.request();
  if (endpoint === 'otp') return route.fulfill({ json: {} });
  if (endpoint === 'logout') return route.fulfill({ status: 204, body: '' });
  if (endpoint === 'verify') {
    const { token } = JSON.parse(request.postData() || '{}');
    if (token !== AUTH_CODE) {
      return route.fulfill({
        status: 403,
        json: { code: 403, error_code: 'otp_expired', msg: 'Token has expired or is invalid' },
      });
    }
    const now = Math.floor(Date.now() / 1000);
    return route.fulfill({
      json: {
        access_token: 'e2e-access-token',
        token_type: 'bearer',
        expires_in: 3600,
        expires_at: now + 3600,
        refresh_token: 'e2e-refresh-token',
        user: { ...AUTH_USER, aud: 'authenticated', role: 'authenticated', app_metadata: {}, user_metadata: {}, created_at: '2026-09-29T00:00:00Z' },
      },
    });
  }
  return route.abort();
}

// player_account and golf_claim_player(), with state that lasts for one test. Mirrors the rules in
// sql/auth-claim-player.sql: signed-in only, names must have rounds, first claim on a name is
// confirmed and a claim on a name another account holds is pending, re-claiming your own name
// changes nothing, and a DELETE removes only the caller's own row.
function claimsState() {
  const claims = structuredClone(tables.player_account);
  const accountOf = (request) =>
    request.headers()['authorization'] === 'Bearer e2e-access-token' ? AUTH_USER.id : null;

  return (route, table) => {
    const request = route.request();
    const method = request.method();
    const account = accountOf(request);

    if (table === 'rpc/golf_claim_player') {
      if (!account) return route.fulfill({ status: 401, json: { code: '42501', message: 'Sign in to claim a player' } });
      const name = JSON.parse(request.postData() || '{}').p_name;
      if (!tables.handicap_summary.some((r) => r.canonical_name === name)) {
        return route.fulfill({ status: 404, json: { code: 'P0002', message: `No rounds found for ${name}` } });
      }
      const mine = claims.find((c) => c.account_id === account);
      if (mine?.canonical_name === name) return route.fulfill({ json: mine.status });
      const status = claims.some((c) => c.canonical_name === name && c.status === 'confirmed' && c.account_id !== account)
        ? 'pending'
        : 'confirmed';
      if (mine) Object.assign(mine, { canonical_name: name, status });
      else claims.push({ account_id: account, canonical_name: name, status });
      return route.fulfill({ json: status });
    }

    if (method === 'DELETE') {
      const target = new URL(request.url()).searchParams.get('account_id')?.replace(/^eq\./, '');
      const removed = account && target === account ? claims.filter((c) => c.account_id === account) : [];
      removed.forEach((r) => claims.splice(claims.indexOf(r), 1));
      return route.fulfill({ json: removed.map(({ account_id }) => ({ account_id })) });
    }

    return route.fulfill({ json: claims });
  };
}

// Use this `test` instead of Playwright's: it installs the mock and fails any test during which the
// page threw an uncaught error, even if every assertion passed.
export const test = base.extend({
  page: async ({ page, context }, use) => {
    let inserted = 0;
    const handleClaims = claimsState();

    await context.route('**/*', (route) => {
      const url = new URL(route.request().url());
      if (url.hostname === 'localhost') return route.continue();
      if (url.origin !== SUPABASE_URL) return route.abort();
      if (url.pathname.startsWith('/auth/v1/')) return fulfillAuth(route, url.pathname.slice('/auth/v1/'.length));
      if (!url.pathname.startsWith('/rest/v1/')) return route.abort();

      const table = url.pathname.slice('/rest/v1/'.length);
      if (table === 'player_account' || table === 'rpc/golf_claim_player') return handleClaims(route, table);

      // A write has to hand back what it wrote. createMatch() does .insert().select() and then
      // reads data[0].id — with a static [] that is undefined, and the page throws before the
      // round-setup screen ever renders. Echo the body back with an id, the way PostgREST does.
      if (route.request().method() === 'POST') {
        let body = [];
        try {
          const parsed = JSON.parse(route.request().postData() || '[]');
          body = Array.isArray(parsed) ? parsed : [parsed];
        } catch {
          body = [];
        }
        return route.fulfill({
          json: body.map((row, i) => ({ id: `inserted-${table}-${++inserted}-${i}`, ...row })),
        });
      }

      return route.fulfill({ json: tables[table] ?? [] });
    });

    const pageErrors = [];
    page.on('pageerror', (err) => pageErrors.push(err.message));

    await use(page);

    expect(pageErrors, 'uncaught errors in the page').toEqual([]);
  },
});

export { expect };
