import { test, expect } from './fixtures.js';

// The handicap a golfer sees at round setup is the handicap the round is played off. It was not:
// the scorecard converted the saved number again, and on a nine-hole round added about 36 strokes
// (issue #11, found by the AI golfers' first round — 21 and 11 at setup became 60 and 49).
//
// Fixtures: Test Links, White tees, slope 121, rating 70.1, par 72.
//   Pat Par    has a computed index of 12.4   -> 12.4 x 121/113 + (70.1 - 72) = 11
//   Sandy Trap has no index, saved handicap 21 -> 21 x 121/113 + (70.1 - 72)   = 21

const selectWithPlaceholder = (page, placeholder) =>
  page.locator('select').filter({ has: page.locator('option', { hasText: placeholder }) });

const selectLabelled = (page, label) =>
  page.locator('div').filter({ has: page.locator(`label:text-is("${label}")`) }).last().locator('select');

async function setUp(page, { holes, playOffLow }) {
  await page.goto('/');
  await selectWithPlaceholder(page, 'Select Course').selectOption({ label: 'Test Links' });
  await selectLabelled(page, 'Holes').selectOption(String(holes));
  await selectWithPlaceholder(page, 'Select Game Type').selectOption('stableford');
  await selectWithPlaceholder(page, 'Play Mode').selectOption('singles');
  await selectWithPlaceholder(page, 'Scoring Mode').selectOption('net');
  const offLow = page.getByLabel(/Play Off Low/);
  if ((await offLow.isChecked()) !== playOffLow) await offLow.click();

  await page.getByRole('button', { name: 'Start Round' }).click();
  await expect(page.getByRole('heading', { name: '2. Assign Players' })).toBeVisible();

  for (const name of ['Pat Par', 'Sandy Trap']) {
    await page.getByRole('button', { name: '-- Select Player --' }).first().click();
    await page.getByTestId('player-list').getByText(name, { exact: true }).click();
    await expect(page.getByRole('button', { name })).toBeVisible();
  }
}

const startScoring = async (page) => {
  await page.getByRole('button', { name: 'Start Round' }).click();
  await expect(page.locator('#score-1-0')).toBeVisible();
};

test.describe('handicaps from setup to scorecard', () => {
  test('setup says where each number came from', async ({ page }) => {
    await setUp(page, { holes: 18, playOffLow: false });

    await expect(page.getByText('computed 11')).toBeVisible();
    await expect(page.getByText('course handicap 21 from saved handicap 21')).toBeVisible();
  });

  test('an 18-hole scorecard plays off the numbers shown at setup', async ({ page }) => {
    await setUp(page, { holes: 18, playOffLow: false });
    await startScoring(page);

    await expect(page.getByText('HCP: 11', { exact: true })).toBeVisible();
    await expect(page.getByText('HCP: 21', { exact: true })).toBeVisible();
  });

  test('a nine-hole scorecard plays off the same numbers, not 36 strokes more', async ({ page }) => {
    await setUp(page, { holes: 9, playOffLow: false });
    await startScoring(page);

    await expect(page.getByText('HCP: 11', { exact: true })).toBeVisible();
    await expect(page.getByText('HCP: 21', { exact: true })).toBeVisible();
  });

  test('playing off the low handicap leaves the gap between the two', async ({ page }) => {
    await setUp(page, { holes: 18, playOffLow: true });
    await startScoring(page);

    await expect(page.getByText('HCP: 0', { exact: true })).toBeVisible();
    await expect(page.getByText('HCP: 10', { exact: true })).toBeVisible();
  });
});
