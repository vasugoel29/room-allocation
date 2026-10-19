import { test, expect, signIn, toast, tag } from './helpers.js';

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

  for (const path of ['/calendar', '/admin', '/faculty', '/bookings', '/profile', '/timetable', '/promotion', '/nope']) {
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
    await page.goto('/does-not-exist');
    await expect(page).toHaveURL(/\/calendar$/);
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

  async function editProfileName(page, user, newName) {
    await page.getByRole('button', { name: /edit profile/i }).click();
    await page.getByPlaceholder('Full Name').fill(newName);
    const [resp] = await Promise.all([
      page.waitForResponse((r) => r.url().endsWith(`/api/auth/users/${user.id}`) && r.request().method() === 'PATCH'),
      page.getByRole('button', { name: /^save$/i }).click(),
    ]);
    return resp;
  }

  test('[FE-18] profile edits are saved and survive a reload', async ({ page, request, seed }) => {
    // Regression: the app now refreshes the profile from /auth/me on load.
    const rep = await seed.user({ role: 'STUDENT_REP', branch: 'CSE', semester: 4, year: 2, section: 1, group_name: 1 });
    const newName = `Renamed Rep ${tag()}`;
    await signIn(page, request, rep, '/profile');
    const resp = await editProfileName(page, rep, newName);
    expect(resp.status(), await resp.text()).toBe(200);
    await expect(toast(page, /profile updated successfully/i)).toBeVisible();
    await expect(page.getByRole('heading', { name: newName })).toBeVisible();
    expect((await seed.one('SELECT name FROM users WHERE id = $1', [rep.id])).name).toBe(newName);

    await page.reload();
    await expect(page.getByRole('heading', { name: newName }), 'name after reload').toBeVisible({ timeout: 5000 });
  });

  test('profile save works for a student with no semester/section/group on file', async ({ page, request, seed }) => {
    // [NEW-E2E-2] Profile.jsx sends '' for empty semester/section/group_name; userRepository.update passes
    // them straight into INTEGER columns -> 500 "Failed to update user". Any student without those fields
    // (e.g. CSV-imported, see OPS-09) cannot edit their profile at all.
    test.fail();
    const rep = await seed.user({ role: 'STUDENT_REP' });
    const newName = `Renamed Rep ${tag()}`;
    await signIn(page, request, rep, '/profile');
    const resp = await editProfileName(page, rep, newName);
    expect(resp.status(), `${resp.request().postData()} -> ${await resp.text()}`).toBe(200);
    await expect(toast(page, /profile updated successfully/i)).toBeVisible();
    expect((await seed.one('SELECT name FROM users WHERE id = $1', [rep.id])).name).toBe(newName);
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
