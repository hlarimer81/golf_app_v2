import { test, expect, AUTH_USER, AUTH_CODE } from './fixtures.js';

// Signing in is optional, so the home screen must work the same either way; these tests cover the
// account line and the email-code flow behind it. The auth server is mocked in fixtures.js.

const signInLink = (page) => page.getByRole('button', { name: 'Sign in', exact: true });

async function requestCode(page) {
  await page.goto('/');
  await signInLink(page).click();
  await expect(page.getByRole('heading', { name: 'Sign In' })).toBeVisible();

  const send = page.getByRole('button', { name: 'Email Me a Code' });
  await expect(send).toBeDisabled();
  await page.getByPlaceholder('you@example.com').fill(AUTH_USER.email);

  // Match on the path: the link's redirect target rides in the query string.
  const otp = page.waitForRequest((r) => new URL(r.url()).pathname === '/auth/v1/otp' && r.method() === 'POST');
  await send.click();
  const request = await otp;
  expect(JSON.parse(request.postData()).email).toBe(AUTH_USER.email);
  // The link in the email must bring the golfer back to this app, not to Supabase's Site URL.
  expect(new URL(request.url()).searchParams.get('redirect_to')).toBe(new URL(page.url()).origin);

  await expect(page.getByText(`Enter the code we sent to ${AUTH_USER.email}`)).toBeVisible();
}

test('home screen offers sign-in without requiring it', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('button', { name: 'Start Round' })).toBeVisible();
  await expect(signInLink(page)).toBeVisible();

  await signInLink(page).click();
  await page.getByRole('button', { name: /Back/ }).click();
  await expect(page.getByRole('button', { name: 'Start Round' })).toBeVisible();
});

test('signs in with the emailed code, survives a reload, and signs out', async ({ page }) => {
  await requestCode(page);

  await page.getByPlaceholder('123456').fill(AUTH_CODE);
  await page.getByRole('button', { name: 'Sign In', exact: true }).click();

  await expect(page.getByRole('button', { name: 'Start Round' })).toBeVisible();
  await expect(page.getByText(`Signed in as ${AUTH_USER.email}`)).toBeVisible();

  // The session is stored, so a golfer who reopens the app mid-round is still signed in.
  await page.reload();
  await expect(page.getByText(`Signed in as ${AUTH_USER.email}`)).toBeVisible();

  await page.getByRole('button', { name: 'Sign out' }).click();
  await expect(signInLink(page)).toBeVisible();
  await expect(page.getByText('Signed in as')).toHaveCount(0);
});

test('a wrong code is refused and the golfer stays on the code screen', async ({ page }) => {
  await requestCode(page);

  await page.getByPlaceholder('123456').fill('999999');
  await page.getByRole('button', { name: 'Sign In', exact: true }).click();

  await expect(page.getByRole('alert')).toContainText('expired or is invalid');
  await expect(page.getByText(`Enter the code we sent to ${AUTH_USER.email}`)).toBeVisible();
});
