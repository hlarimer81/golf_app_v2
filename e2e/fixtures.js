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
  ],
  players: [
    { id: 'player-pat', player_name: 'Pat Par', handicap: 12, match_id: null, team_id: null },
    { id: 'player-bo', player_name: 'Bo Birdie', handicap: 4, match_id: null, team_id: null },
    { id: 'player-sandy', player_name: 'Sandy Trap', handicap: 21, match_id: null, team_id: null },
    { id: 'player-gil', player_name: 'Gil Green', handicap: 16, match_id: null, team_id: null },
  ],
  handicap_summary: [
    { canonical_name: 'Pat Par', handicap_index: 12.4, rounds_used: 8, rounds_available: 20, estimated_count: 0, method: 'rated' },
  ],
  // Who played with whom, for the player picker's ordering. Pat and Bo are regulars who play
  // together; Sandy has one round and Gil has none, so the picker has a real order to produce
  // rather than an alphabetical fallback.
  round_differential: [
    { canonical_name: 'Pat Par', match_id: 'm1' },
    { canonical_name: 'Bo Birdie', match_id: 'm1' },
    { canonical_name: 'Pat Par', match_id: 'm2' },
    { canonical_name: 'Bo Birdie', match_id: 'm2' },
    { canonical_name: 'Pat Par', match_id: 'm3' },
    { canonical_name: 'Sandy Trap', match_id: 'm3' },
  ],
  courses: [],
  matches: [],
};

// Use this `test` instead of Playwright's: it installs the mock and fails any test during which the
// page threw an uncaught error, even if every assertion passed.
export const test = base.extend({
  page: async ({ page, context }, use) => {
    let inserted = 0;

    await context.route('**/*', (route) => {
      const url = new URL(route.request().url());
      if (url.hostname === 'localhost') return route.continue();
      if (url.origin !== SUPABASE_URL || !url.pathname.startsWith('/rest/v1/')) return route.abort();

      const table = url.pathname.slice('/rest/v1/'.length);

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
