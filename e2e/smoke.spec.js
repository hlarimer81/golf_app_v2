import { test, expect } from './fixtures.js';

const selectWithPlaceholder = (page, placeholder) =>
  page.locator('select').filter({ has: page.locator('option', { hasText: placeholder }) });

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('button', { name: 'Start Round' })).toBeVisible();
});

test('home screen shows round setup and the course list', async ({ page }) => {
  await expect(page.getByRole('button', { name: 'Join Round' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Previous Rounds' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Players & Handicaps' })).toBeVisible();

  const course = selectWithPlaceholder(page, 'Select Course');
  await expect(course.locator('option', { hasText: 'Test Links' })).toHaveCount(1);
});

test('choosing a course selects its first tee', async ({ page }) => {
  await selectWithPlaceholder(page, 'Select Course').selectOption({ label: 'Test Links' });

  const tees = selectWithPlaceholder(page, 'Select Tees');
  await expect(tees).toHaveValue('tee-white');
  await expect(tees.locator('option', { hasText: 'Blue (72.4/128)' })).toHaveCount(1);
  await expect(page.getByRole('button', { name: /Report Issue/ })).toBeVisible();
});

test('join form only accepts a 6-character code', async ({ page }) => {
  await page.getByRole('button', { name: 'Join Round' }).click();
  await expect(page.getByRole('heading', { name: 'Join Round' })).toBeVisible();

  const code = page.getByPlaceholder('ABC123');
  const submit = page.getByRole('button', { name: 'Join Round' });
  await expect(submit).toBeDisabled();

  await code.fill('abc12');
  await expect(submit).toBeDisabled();

  await code.fill('abc123');
  await expect(code).toHaveValue('ABC123');
  await expect(submit).toBeEnabled();

  await page.getByRole('button', { name: '← Back' }).click();
  await expect(page.getByRole('button', { name: 'Start Round' })).toBeVisible();
});

test('previous rounds shows an empty state', async ({ page }) => {
  await page.getByRole('button', { name: 'Previous Rounds' }).click();
  await expect(page.getByText('No rounds found in the last 30 days')).toBeVisible();
});

test('player directory lists players with a handicap', async ({ page }) => {
  await page.getByRole('button', { name: 'Players & Handicaps' }).click();
  await expect(page.getByText('Pat Par')).toBeVisible();

  await page.getByRole('button', { name: /Back/ }).click();
  await expect(page.getByRole('button', { name: 'Start Round' })).toBeVisible();
});
