import { test, expect } from './fixtures.js';

// Saves go through an outbox that resends until the database confirms them (src/lib/outbox.js).
// These tests break the scores endpoint in the two ways it breaks for real - no answer at all, and
// "success" with nothing written - and watch what the app does about it.

async function startScoring(page) {
  const selectWithPlaceholder = (placeholder) =>
    page.locator('select').filter({ has: page.locator('option', { hasText: placeholder }) });

  await page.goto('/');
  await selectWithPlaceholder('Select Course').selectOption({ label: 'Test Links' });
  await selectWithPlaceholder('Select Game Type').selectOption('stableford');
  await selectWithPlaceholder('Play Mode').selectOption('singles');
  await page.getByRole('button', { name: 'Start Round' }).click();
  await expect(page.getByRole('heading', { name: '2. Assign Players' })).toBeVisible();

  await page.getByRole('button', { name: '-- Select Player --' }).first().click();
  await page.getByTestId('player-list').getByText('Pat Par', { exact: true }).click();
  await page.getByRole('button', { name: 'Start Round' }).click();
  await expect(firstCell(page)).toBeVisible();
}

const firstCell = (page) => page.locator('#score-1-0');
const saving = (page) => page.getByRole('status').filter({ hasText: 'Saving' });
const notSaving = (page) => page.getByRole('alert').filter({ hasText: 'This round isn’t saving' });

// Answer writes to `scores` with whatever `respond` decides, and record each one. Reads fall
// through to the fixture mock.
async function interceptScoreWrites(page, respond) {
  const writes = [];
  await page.route('**/rest/v1/scores*', (route) => {
    const request = route.request();
    if (request.method() !== 'POST') return route.fallback();
    const body = JSON.parse(request.postData());
    writes.push(body);
    return respond(route, body, writes.length);
  });
  return writes;
}

const saved = (route, body) => route.fulfill({ json: [{ hole_number: body.hole_number }] });

test.describe('saving scores', () => {
  test('a score that saves first time shows no indicator', async ({ page }) => {
    const writes = await interceptScoreWrites(page, saved);
    await startScoring(page);

    await firstCell(page).fill('4');

    await expect.poll(() => writes.length).toBe(1);
    expect(writes[0]).toMatchObject({ hole_number: 1, strokes: 4 });
    await expect(saving(page)).toHaveCount(0);
    await expect(notSaving(page)).toHaveCount(0);
  });

  test('a score that fails to send is resent until it lands', async ({ page }) => {
    // No answer twice, as in a dead spot, then the network is back.
    const writes = await interceptScoreWrites(page, (route, body, n) =>
      n <= 2 ? route.abort('internetdisconnected') : saved(route, body));
    await startScoring(page);

    await firstCell(page).fill('5');

    await expect(saving(page)).toHaveText('Saving 1…');
    await expect(firstCell(page)).toHaveValue('5');

    await expect.poll(() => writes.length, { timeout: 10_000 }).toBe(3);
    expect(writes[2]).toMatchObject({ hole_number: 1, strokes: 5 });
    await expect(saving(page)).toHaveCount(0);
    await expect(notSaving(page)).toHaveCount(0);
  });

  test('a score still unsent when the app is closed is sent when it reopens', async ({ page }) => {
    let online = false;
    const writes = await interceptScoreWrites(page, (route, body) =>
      online ? saved(route, body) : route.abort('internetdisconnected'));
    await startScoring(page);

    await firstCell(page).fill('6');
    await expect(saving(page)).toBeVisible();
    const before = writes.length;

    online = true;
    await page.reload();

    await expect.poll(() => writes.length, { timeout: 10_000 }).toBeGreaterThan(before);
    expect(writes.at(-1)).toMatchObject({ hole_number: 1, strokes: 6 });
    await expect(saving(page)).toHaveCount(0);
  });

  test('a refused save warns the golfer and is reported once', async ({ page }) => {
    // What RLS does to a write it blocks: 200, no error, no rows.
    await interceptScoreWrites(page, (route) => route.fulfill({ json: [] }));
    const reports = [];
    await page.route('**/rest/v1/client_error*', (route) => {
      reports.push(JSON.parse(route.request().postData()));
      return route.fulfill({ status: 201, body: '' });
    });
    await startScoring(page);

    await firstCell(page).fill('4');

    await expect(notSaving(page)).toBeVisible({ timeout: 10_000 });
    await expect(firstCell(page)).toHaveValue('4');

    await expect.poll(() => reports.length).toBe(1);
    expect(reports[0]).toMatchObject({ target: 'scores', action: 'upsert', code: 'ZERO_ROWS' });
    // The report says what was being written, never the score itself.
    expect(reports[0]).not.toHaveProperty('strokes');
  });
});
