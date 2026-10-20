import { test, expect, signIn, nextWeekdaySlot, openSlot, pickFaculty, toast, tag } from './helpers.js';

test.describe('Notifications (Phase 7)', () => {
  test('a rep\'s request reaches the faculty bell; opening it goes to the Faculty Portal; approval reaches the rep', async ({ page, request, seed }) => {
    const rep = await seed.user({ role: 'STUDENT_REP' });
    const faculty = await seed.user({ role: 'FACULTY' });
    const room = await seed.room();
    const slot = nextWeekdaySlot(16);
    const purpose = `Never shown to others ${tag()}`;

    await signIn(page, request, rep, '/calendar');
    const dialog = await openSlot(page, room, slot);
    await pickFaculty(dialog, faculty);
    await dialog.getByPlaceholder(/special class/i).fill(purpose);
    await dialog.getByRole('button', { name: /finalize allocation/i }).click();
    await expect(toast(page, `Request sent to Prof. ${faculty.name}`)).toBeVisible();

    await signIn(page, request, faculty, '/calendar');
    const bell = page.getByRole('button', { name: 'Notifications, 1 unread' });
    await expect(bell).toBeVisible();
    await bell.click();
    const panel = page.getByRole('dialog', { name: 'Notifications' });
    const item = panel.getByText(`New booking request from ${rep.name}`);
    await expect(item).toBeVisible();
    await expect(panel).not.toContainText(purpose);
    await item.click();
    await expect(page).toHaveURL(/\/faculty$/);
    await expect(page.getByRole('button', { name: 'Notifications' })).toBeVisible(); // read now

    const card = page.locator('div.ring-1').filter({ hasText: room.name });
    await card.getByRole('button', { name: /approve/i }).click();
    await expect(toast(page, /approved/i)).toBeVisible();

    await signIn(page, request, rep, '/calendar');
    await page.getByRole('button', { name: 'Notifications, 1 unread' }).click();
    await expect(page.getByRole('dialog', { name: 'Notifications' })).toContainText(`Booking approved — room ${room.name}`);
  });
});
