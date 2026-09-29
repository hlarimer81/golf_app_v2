import { test, expect, AUTH_USER, AUTH_CODE } from './fixtures.js';

// Claiming a player: a signed-in golfer links their account to a name, and their rounds follow.
// fixtures.js mocks golf_claim_player() with the same rules as sql/auth-claim-player.sql; Bo Birdie
// is already held by another account there.

async function signIn(page) {
  await page.goto('/');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await page.getByPlaceholder('you@example.com').fill(AUTH_USER.email);
  await page.getByRole('button', { name: 'Email Me a Code' }).click();
  await page.getByPlaceholder('123456').fill(AUTH_CODE);
  await page.getByRole('button', { name: 'Sign In', exact: true }).click();
  await expect(page.getByText(`Signed in as ${AUTH_USER.email}`)).toBeVisible();
}

const list = (page) => page.getByTestId('claim-list');

async function claim(page, name) {
  await page.getByRole('button', { name: 'Which player are you?' }).click();
  await list(page).getByText(name, { exact: true }).click();
  await page.getByRole('button', { name: 'Yes, that’s me' }).click();
}

test('signed out, there is nothing to claim', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('button', { name: 'Start Round' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Which player are you?' })).toHaveCount(0);
});

test('claiming an unheld name links it at once and opens that player’s rounds', async ({ page }) => {
  await signIn(page);
  await page.getByRole('button', { name: 'Which player are you?' }).click();

  // The list marks names another account already holds.
  await expect(list(page).getByText('Pat Par', { exact: true })).toBeVisible();
  await expect(list(page).getByText('Bo Birdie', { exact: true })).toBeVisible();
  await expect(list(page).getByText('claimed')).toHaveCount(1);

  await list(page).getByText('Pat Par', { exact: true }).click();
  await expect(page.getByText('Another account already holds this name')).toHaveCount(0);
  await page.getByRole('button', { name: 'Yes, that’s me' }).click();

  const mine = page.getByRole('button', { name: 'My rounds: Pat Par' });
  await expect(mine).toBeVisible();
  await mine.click();
  await expect(page.getByRole('heading', { name: 'Pat Par' })).toBeVisible();
});

test('claiming a name another account holds waits for approval', async ({ page }) => {
  await signIn(page);
  await page.getByRole('button', { name: 'Which player are you?' }).click();
  await list(page).getByText('Bo Birdie', { exact: true }).click();
  await expect(page.getByText('Another account already holds this name')).toBeVisible();
  await page.getByRole('button', { name: 'Yes, that’s me' }).click();

  await expect(page.getByText('Your claim is waiting for an admin to approve it.')).toBeVisible();

  await page.getByRole('button', { name: /Back/ }).click();
  await expect(page.getByRole('button', { name: 'Claim on Bo Birdie awaiting approval' })).toBeVisible();
  await expect(page.getByRole('button', { name: /My rounds/ })).toHaveCount(0);
});

test('a linked player can be unlinked', async ({ page }) => {
  await signIn(page);
  await claim(page, 'Pat Par');
  await expect(page.getByRole('button', { name: 'My rounds: Pat Par' })).toBeVisible();

  await page.getByRole('button', { name: 'Change player' }).click();
  await expect(page.getByText('Linked to Pat Par')).toBeVisible();
  await page.getByRole('button', { name: 'Unlink' }).click();
  await expect(page.getByText('Linked to Pat Par')).toHaveCount(0);

  await page.getByRole('button', { name: /Back/ }).click();
  await expect(page.getByRole('button', { name: 'Which player are you?' })).toBeVisible();
});
