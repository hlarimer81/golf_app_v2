import { test, expect } from './fixtures.js';

// The round-setup screen reaches the player picker only after a course, tees and a game type are
// chosen and the round is created — so every test here walks that path first.
async function startRound(page) {
  const selectWithPlaceholder = (placeholder) =>
    page.locator('select').filter({ has: page.locator('option', { hasText: placeholder }) });

  await page.goto('/');
  await selectWithPlaceholder('Select Course').selectOption({ label: 'Test Links' });
  await selectWithPlaceholder('Select Game Type').selectOption('stableford');
  await selectWithPlaceholder('Play Mode').selectOption('singles');
  await page.getByRole('button', { name: 'Start Round' }).click();
  await expect(page.getByRole('heading', { name: '2. Assign Players' })).toBeVisible();
}

// Scope to the list inside the sheet, so a name here is never confused with the same name sitting
// in an already-filled slot behind the overlay. Selected by test id rather than by walking a tree
// of inline-styled divs: the list is a *sibling* of the sheet's header, so an ancestor-of-heading
// selector matches the header row and finds no names at all.
const sheet = (page) => page.getByTestId('player-list');
const openPicker = async (page) => {
  await page.getByRole('button', { name: '-- Select Player --' }).first().click();
  await expect(page.getByRole('heading', { name: 'Add player' })).toBeVisible();
};
const nameRow = (page, name) => sheet(page).getByText(name, { exact: true });

test.describe('player picker', () => {
  test.beforeEach(async ({ page }) => {
    await startRound(page);
  });

  test('offers the regulars first, ordered by rounds played', async ({ page }) => {
    await openPicker(page);
    await expect(page.getByText('REGULARS')).toBeVisible();

    // Pat and Bo have two rounds each in the fixtures, Sandy one, Gil none. Ties break
    // alphabetically, so Bo comes before Pat, and Gil is last.
    await expect(nameRow(page, 'Bo Birdie')).toBeVisible();
    await expect(nameRow(page, 'Gil Green')).toBeVisible();
  });

  test('explains why each player is in the list', async ({ page }) => {
    await openPicker(page);
    await expect(sheet(page).getByText('2 rounds').first()).toBeVisible();
    await expect(sheet(page).getByText('no rounds yet')).toBeVisible();
  });

  test('search narrows the list to one player', async ({ page }) => {
    await openPicker(page);
    await page.getByPlaceholder('Search players').fill('sandy');

    await expect(nameRow(page, 'Sandy Trap')).toBeVisible();
    await expect(nameRow(page, 'Bo Birdie')).toHaveCount(0);
  });

  test('says so when a search matches nobody', async ({ page }) => {
    await openPicker(page);
    await page.getByPlaceholder('Search players').fill('zzzz');
    await expect(page.getByText('No player matching "zzzz"')).toBeVisible();
  });

  test('picking a player closes the sheet and fills the slot', async ({ page }) => {
    await openPicker(page);
    await nameRow(page, 'Pat Par').click();

    await expect(page.getByRole('heading', { name: 'Add player' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Pat Par' })).toBeVisible();
  });

  test('a player already in the round is not offered again', async ({ page }) => {
    await openPicker(page);
    await nameRow(page, 'Pat Par').click();
    await expect(page.getByRole('button', { name: 'Pat Par' })).toBeVisible();

    await openPicker(page);
    await expect(nameRow(page, 'Pat Par')).toHaveCount(0);
  });

  test('someone new can be added as a guest', async ({ page }) => {
    await openPicker(page);
    await page.getByRole('button', { name: '+ Add someone new' }).click();

    await expect(page.getByRole('heading', { name: 'Add player' })).toHaveCount(0);
    await expect(page.getByPlaceholder('Guest Name')).toBeVisible();
  });

  test('the sheet closes without choosing anyone', async ({ page }) => {
    await openPicker(page);
    await page.getByRole('button', { name: '✕' }).click();

    await expect(page.getByRole('heading', { name: 'Add player' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: '-- Select Player --' }).first()).toBeVisible();
  });
});
