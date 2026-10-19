import crypto from 'crypto';
import { test, expect, PASSWORD } from './fixtures.js';

test.describe('Authentication', () => {
  for (const [role, landing] of [['VIEWER', /\/calendar/], ['STUDENT_REP', /\/calendar/], ['FACULTY', /\/faculty/], ['ADMIN', /\/admin/]]) {
    test(`${role} logs in through the form and lands on their home page`, async ({ page, seed }) => {
      const user = await seed.user({ role });
      await page.goto('/login');
      await page.locator('#email').fill(user.email);
      await page.locator('#password').fill(PASSWORD);
      await page.getByRole('button', { name: /sign in/i }).click();
      await expect(page).toHaveURL(landing);
      expect(await page.evaluate(() => localStorage.getItem('token'))).toBeTruthy();
    });
  }

  test('wrong password shows an error and stays on login', async ({ page, seed }) => {
    const user = await seed.user();
    await page.goto('/login');
    await page.locator('#email').fill(user.email);
    await page.locator('#password').fill('wrong-password');
    await page.getByRole('button', { name: /sign in/i }).click();
    await expect(page.locator('#login-error')).toContainText(/invalid credentials/i);
    await expect(page).toHaveURL(/\/login/);
  });

  test('non-NSUT email is rejected client-side', async ({ page }) => {
    await page.goto('/login');
    await page.locator('#email').fill('someone@gmail.com');
    await page.locator('#password').fill('whatever');
    await page.getByRole('button', { name: /sign in/i }).click();
    await expect(page.getByText(/only nsut emails/i)).toBeVisible();
  });

  test('unapproved faculty sees the pending-approval message', async ({ page, seed }) => {
    const user = await seed.user({ role: 'FACULTY', is_approved: false });
    await page.goto('/login');
    await page.locator('#email').fill(user.email);
    await page.locator('#password').fill(PASSWORD);
    await page.getByRole('button', { name: /sign in/i }).click();
    await expect(page.locator('#login-error')).toContainText(/awaiting administrator approval/i);
  });

  test('logout clears the session and protected pages redirect to login', async ({ page, seed, loginAs }) => {
    const user = await seed.user({ role: 'STUDENT_REP' });
    await loginAs(user, '/profile');
    await page.getByRole('button', { name: /logout securely/i }).click();
    await expect(page).toHaveURL(/\/login/);
    expect(await page.evaluate(() => localStorage.getItem('token'))).toBeNull();
  });

  test('forgot password shows a neutral confirmation (no account enumeration in the UI)', async ({ page, seed }) => {
    const user = await seed.user();
    for (const email of [user.email, 'nobody.here@nsut.ac.in']) {
      await page.goto('/forgot-password');
      await page.getByPlaceholder('rollno@nsut.ac.in').fill(email);
      await page.getByRole('button', { name: /send reset link/i }).click();
      await expect(page.getByText(/if an account with/i)).toBeVisible();
    }
  });

  test('reset password with a valid token lets the user log in with the new password', async ({ page, seed }) => {
    const user = await seed.user();
    const token = crypto.randomBytes(32).toString('hex');
    await seed.db.query(
      `UPDATE users SET password_reset_token = $1, password_reset_expires = NOW() + interval '1 hour' WHERE id = $2`,
      [crypto.createHash('sha256').update(token).digest('hex'), user.id],
    );
    await page.goto(`/reset-password?token=${token}`);
    const inputs = page.locator('input[type=password]');
    await inputs.nth(0).fill('NewPassword@456');
    await inputs.nth(1).fill('NewPassword@456');
    await page.getByRole('button', { name: /reset password/i }).click();
    await expect(page.getByRole('button', { name: /go to login/i }).or(page.getByRole('link', { name: /go to login/i }))).toBeVisible();

    await page.goto('/login');
    await page.locator('#email').fill(user.email);
    await page.locator('#password').fill('NewPassword@456');
    await page.getByRole('button', { name: /sign in/i }).click();
    await expect(page).toHaveURL(/\/calendar/);
  });

  test('reset password page without a token shows "Invalid Reset Link"', async ({ page }) => {
    await page.goto('/reset-password');
    await expect(page.getByText(/invalid reset link/i)).toBeVisible();
  });

  test('reset password rejects mismatched passwords client-side', async ({ page }) => {
    await page.goto('/reset-password?token=abc');
    const inputs = page.locator('input[type=password]');
    await inputs.nth(0).fill('NewPassword@456');
    await inputs.nth(1).fill('Different@456');
    await page.getByRole('button', { name: /reset password/i }).click();
    await expect(page.getByText(/passwords do not match/i)).toBeVisible();
  });
});
