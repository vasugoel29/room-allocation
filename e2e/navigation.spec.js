import { test, expect, signIn } from './helpers.js';

test.describe('Route guards & navigation', () => {
  for (const role of ['VIEWER', 'STUDENT_REP', 'FACULTY']) {
    test(`${role} hitting /admin is redirected to /calendar`, async ({ page, request, seed }) => {
      const user = await seed.user({ role });
      await signIn(page, request, user, '/admin');
      await expect(page).toHaveURL(/\/calendar$/);
      await expect(page.getByRole('heading', { name: /admin console/i })).toHaveCount(0);
      await page.goto('/admin?tab=users');
      await expect(page).toHaveURL(/\/calendar$/);
    });
  }

  test('VIEWER cannot open /bookings; STUDENT_REP cannot open /faculty', async ({ page, request, seed }) => {
    await signIn(page, request, await seed.user({ role: 'VIEWER' }), '/bookings');
    await expect(page).toHaveURL(/\/calendar$/);
    await signIn(page, request, await seed.user({ role: 'STUDENT_REP' }), '/faculty');
    await expect(page).toHaveURL(/\/calendar$/);
  });

  // /promotion, /forgot-password and /reset-password were removed with local accounts: plain unknown routes now.
  for (const path of ['/calendar', '/admin', '/faculty', '/bookings', '/profile', '/timetable', '/promotion', '/forgot-password', '/reset-password', '/nope']) {
    test(`logged-out visit to ${path} goes to /login`, async ({ page }) => {
      await page.goto(path);
      await expect(page).toHaveURL(/\/login$/);
      await expect(page.getByRole('button', { name: /sign in with google/i })).toBeVisible();
    });
  }

  test('home route sends each role to its landing page; unknown routes fall back to /calendar', async ({ page, request, seed }) => {
    await signIn(page, request, await seed.user({ role: 'ADMIN' }), '/');
    await expect(page).toHaveURL(/\/admin$/);
    await signIn(page, request, await seed.user({ role: 'FACULTY' }), '/');
    await expect(page).toHaveURL(/\/faculty$/);
    await signIn(page, request, await seed.user({ role: 'STUDENT_REP' }), '/');
    await expect(page).toHaveURL(/\/calendar$/);
    for (const removed of ['/does-not-exist', '/promotion', '/forgot-password', '/reset-password?token=x']) {
      await page.goto(removed);
      await expect(page).toHaveURL(/\/calendar$/);
    }
  });

  test('sidebar shows role-appropriate links', async ({ page, request, seed }) => {
    const nav = (name) => page.getByRole('complementary').getByRole('link', { name, exact: true });
    await signIn(page, request, await seed.user({ role: 'VIEWER' }), '/calendar');
    await expect(nav('Rooms')).toBeVisible();
    await expect(nav('Bookings')).toHaveCount(0);
    // Roles come from the ACL now, so there is no in-app promotion request link.
    await expect(nav('Apply to Book Rooms')).toHaveCount(0);

    await signIn(page, request, await seed.user({ role: 'STUDENT_REP' }), '/calendar');
    await expect(nav('Bookings')).toBeVisible();
    await nav('Bookings').click();
    await expect(page).toHaveURL(/\/bookings$/);
    await nav('Timetable').click();
    await expect(page).toHaveURL(/\/timetable$/);

    await signIn(page, request, await seed.user({ role: 'FACULTY' }), '/calendar');
    await expect(nav('Faculty Portal')).toBeVisible();
    await expect(nav('Admin Console')).toHaveCount(0);
  });

  test('profile is read-only and shows the directory (ACL) details', async ({ page, request, seed }) => {
    const rep = await seed.user({ role: 'STUDENT_REP', branch: 'CSE', semester: 4, year: 2, section: 3, group_name: 1 });
    const writes = [];
    page.on('request', (r) => { if (r.url().includes('/api/auth/users') && r.method() !== 'GET') writes.push(`${r.method()} ${r.url()}`); });
    await signIn(page, request, rep, '/profile');

    await expect(page.getByRole('heading', { name: rep.name })).toBeVisible();
    await expect(page.getByText(rep.email)).toBeVisible();
    await expect(page.getByText('CSE', { exact: true })).toBeVisible();
    await expect(page.getByText(/Semester 4\s*· Section 3\s*· Group 1/)).toBeVisible();
    await expect(page.getByText(/come from the institutional directory/i)).toBeVisible();

    await expect(page.getByRole('button', { name: /edit profile/i })).toHaveCount(0);
    await expect(page.getByRole('button', { name: /^save$/i })).toHaveCount(0);
    await expect(page.locator('main input, main select, main textarea')).toHaveCount(0);
    await expect(page.getByRole('button', { name: /logout securely/i })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Toggle Theme' })).toBeVisible();
    expect(writes).toEqual([]);
  });

  test('backend health failures show the Connection Error screen; Retry recovers', async ({ page, request, seed }) => {
    const rep = await seed.user({ role: 'STUDENT_REP' });
    await page.clock.install();
    await page.route('**/api/health', (r) => r.fulfill({ status: 500, contentType: 'application/json', body: '{"status":"down"}' }));
    await signIn(page, request, rep, '/calendar');
    await expect(page.getByPlaceholder('Search room name...')).toBeVisible();
    // the app needs two consecutive failed checks (30s interval) before showing the error screen
    await page.clock.fastForward(31_000);
    await expect(page.getByRole('heading', { name: /connection error/i })).toBeVisible();
    await expect(page.getByText(/cannot connect to server/i)).toBeVisible();

    await page.unroute('**/api/health');
    await page.getByRole('button', { name: /retry connection/i }).click();
    await expect(page.getByPlaceholder('Search room name...')).toBeVisible();
    await expect(page.getByRole('heading', { name: /connection error/i })).toHaveCount(0);
  });
});
