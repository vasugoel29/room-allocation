import { test, expect, signIn, toast, tag } from './helpers.js';

test.describe('Promotion (viewer -> student rep)', () => {
  test('viewer submits a promotion request from /promotion', async ({ page, request, seed }) => {
    // [BKG-15] POST /promotions always 500s (`reason`/`userId` are undefined in requestPromotion).
    test.fail();
    const viewer = await seed.user({ role: 'VIEWER' });
    const reason = `I am the CR ${tag()}`;

    await signIn(page, request, viewer, '/promotion');
    await page.getByPlaceholder(/official CR/i).fill(reason);
    const [resp] = await Promise.all([
      page.waitForResponse((r) => r.url().endsWith('/api/promotions') && r.request().method() === 'POST'),
      page.getByRole('button', { name: /submit request/i }).click(),
    ]);
    expect(resp.status(), await resp.text()).toBe(201);
    await expect(toast(page, /request submitted successfully/i)).toBeVisible();
    await expect(page.getByText(/pending review/i)).toBeVisible();
    expect(await seed.one('SELECT status, reason FROM promotion_requests WHERE user_id = $1', [viewer.id])).toEqual({ status: 'PENDING', reason });
  });

  test('viewer with a pending request sees its status and cannot resubmit', async ({ page, request, seed }) => {
    const viewer = await seed.user({ role: 'VIEWER' });
    const reason = `Pending ${tag()}`;
    await seed.one('INSERT INTO promotion_requests (user_id, reason) VALUES ($1, $2) RETURNING id', [viewer.id, reason]);

    await signIn(page, request, viewer, '/promotion');
    await expect(page.getByText(/pending review/i)).toBeVisible();
    await expect(page.getByText(reason)).toBeVisible();
    await expect(page.getByRole('button', { name: /request pending/i })).toBeDisabled();
  });

  test('admin approves a request on the Requests tab -> user becomes STUDENT_REP', async ({ page, request, seed }) => {
    const admin = await seed.user({ role: 'ADMIN' });
    const viewer = await seed.user({ role: 'VIEWER' });
    const reason = `Approve me ${tag()}`;
    const req = await seed.one('INSERT INTO promotion_requests (user_id, reason) VALUES ($1, $2) RETURNING id', [viewer.id, reason]);

    await signIn(page, request, admin, '/admin?tab=promotions');
    const row = page.locator('tr').filter({ hasText: viewer.email });
    await expect(row).toContainText(reason);
    await row.getByRole('button', { name: 'Approve' }).click();
    const modal = page.locator('div.fixed').filter({ has: page.getByRole('heading', { name: /approve request/i }) });
    await modal.getByPlaceholder(/type your comment/i).fill('Welcome aboard');
    await modal.getByRole('button', { name: /confirm approval/i }).click();
    await expect(toast(page, /request approved successfully/i)).toBeVisible();
    await expect(row).toContainText(/approved/i);

    expect(await seed.one('SELECT status, admin_comment FROM promotion_requests WHERE id = $1', [req.id])).toEqual({ status: 'APPROVED', admin_comment: 'Welcome aboard' });
    expect((await seed.one('SELECT role FROM users WHERE id = $1', [viewer.id])).role).toBe('STUDENT_REP');

    // After re-login the promoted user gets rep navigation (Bookings) and /promotion says so.
    await signIn(page, request, viewer, '/promotion');
    await expect(page.getByText(/you are a rep/i)).toBeVisible();
    await expect(page.getByRole('link', { name: /^bookings$/i })).toBeVisible();
  });

  test('admin rejects a request -> user stays VIEWER and sees the comment', async ({ page, request, seed }) => {
    const admin = await seed.user({ role: 'ADMIN' });
    const viewer = await seed.user({ role: 'VIEWER' });
    const req = await seed.one('INSERT INTO promotion_requests (user_id, reason) VALUES ($1, $2) RETURNING id', [viewer.id, `Reject me ${tag()}`]);

    await signIn(page, request, admin, '/admin?tab=promotions');
    const row = page.locator('tr').filter({ hasText: viewer.email });
    await row.getByRole('button', { name: 'Reject' }).click();
    await page.getByPlaceholder(/type your comment/i).fill('Not a CR');
    await page.getByRole('button', { name: /confirm rejection/i }).click();
    await expect(toast(page, /request rejected successfully/i)).toBeVisible();
    expect((await seed.one('SELECT status FROM promotion_requests WHERE id = $1', [req.id])).status).toBe('REJECTED');
    expect((await seed.one('SELECT role FROM users WHERE id = $1', [viewer.id])).role).toBe('VIEWER');

    await signIn(page, request, viewer, '/promotion');
    await expect(page.getByText(/^rejected$/i)).toBeVisible();
    await expect(page.getByText('Not a CR')).toBeVisible();
  });
});
