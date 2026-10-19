import { test, expect, API_URL } from './fixtures.js';

// The e2e stack runs the ACL in mock mode backed by the seeded users table (ACL_MOCK_SOURCE=db),
// with developer sign-in enabled and no Google client id configured.
const devSignIn = async (page, email) => {
  await page.goto('/login');
  await page.getByLabel(/developer sign-in \(local only\)/i).fill(email);
  await page.getByRole('button', { name: /dev sign in/i }).click();
};

test.describe('Authentication', () => {
  for (const [role, landing] of [['VIEWER', /\/calendar/], ['STUDENT_REP', /\/calendar/], ['FACULTY', /\/faculty/], ['ADMIN', /\/admin/]]) {
    test(`${role} signs in and lands on their home page`, async ({ page, seed }) => {
      const user = await seed.user({ role });
      await devSignIn(page, user.email);
      await expect(page).toHaveURL(landing);
      expect(await page.evaluate(() => localStorage.getItem('token'))).toBeTruthy();
      // The session is linked to an ACL identity on first sign-in.
      const row = await seed.one('SELECT acl_id FROM users WHERE id = $1', [user.id]);
      expect(row.acl_id).toBeTruthy();
    });
  }

  test('an email that is not in the access directory is refused', async ({ page }) => {
    await devSignIn(page, `nobody.${Date.now()}@nsut.ac.in`);
    await expect(page.locator('#login-error')).toContainText(/not registered/i);
    await expect(page).toHaveURL(/\/login/);
    expect(await page.evaluate(() => localStorage.getItem('token'))).toBeNull();
  });

  test('[ACL-01] "Sign in with Google" without a configured client id explains it and never signs anyone in', async ({ page }) => {
    let calls = 0;
    page.on('request', (r) => { if (r.url().includes('/api/auth/')) calls++; });
    await page.goto('/login');
    await page.getByRole('button', { name: /sign in with google/i }).click();
    await expect(page.locator('#login-error')).toContainText(/not configured/i);
    expect(calls).toBe(0);
  });

  test('[ACL-01] the API refuses an email-only Google sign-in', async ({ request, seed }) => {
    const admin = await seed.user({ role: 'ADMIN' });
    const res = await request.post(`${API_URL}/auth/google`, { data: { email: admin.email } });
    expect(res.status()).toBe(400);
    expect((await res.json()).token).toBeUndefined();
  });

  test('logout clears the session and revokes the token server-side', async ({ page, seed, request }) => {
    const user = await seed.user({ role: 'STUDENT_REP' });
    await devSignIn(page, user.email);
    await expect(page).toHaveURL(/\/calendar/);
    const token = await page.evaluate(() => localStorage.getItem('token'));
    await page.goto('/profile');
    await page.getByRole('button', { name: /logout securely/i }).click();
    await expect(page).toHaveURL(/\/login/);
    expect(await page.evaluate(() => localStorage.getItem('token'))).toBeNull();
    const me = await request.get(`${API_URL}/auth/me`, { headers: { Authorization: `Bearer ${token}` } });
    expect(me.status()).toBe(401);
  });

  test('a role change is picked up from the server on the next page load', async ({ page, seed }) => {
    const user = await seed.user({ role: 'STUDENT_REP' });
    await devSignIn(page, user.email);
    await expect(page).toHaveURL(/\/calendar/);
    // Simulate the ACL demoting the user: the snapshot is what the server trusts.
    await seed.db.query(`UPDATE user_access SET role = 'VIEWER' WHERE user_id = $1`, [user.id]);
    await page.reload();
    await expect.poll(async () => JSON.parse(await page.evaluate(() => localStorage.getItem('user'))).role).toBe('VIEWER');
  });
});
