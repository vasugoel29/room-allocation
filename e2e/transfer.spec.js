import { test, expect, signIn, nextWeekdaySlot, openSlot, pickFaculty, toast, tag } from './helpers.js';

// Transfer state machine (backend/src/services/transferService.js), for a booking that has an owner faculty
// and a requester-chosen target faculty:
//   PENDING --owner rep accepts--> REP2_ACCEPTED --owner faculty approves--> FACULTY2_ACCEPTED (booking CANCELLED)
//   --target faculty approves--> ACCEPTED (booking ACTIVE again, created_by = requester, faculty_id = target faculty)
test.describe('Booking transfer', () => {
  test('rep B requests rep A\'s booking; A accepts, both faculties approve -> booking owned by B', async ({ page, request, seed }) => {
    const repA = await seed.user({ role: 'STUDENT_REP' });
    const repB = await seed.user({ role: 'STUDENT_REP' });
    const facultyA = await seed.user({ role: 'FACULTY' });
    const facultyB = await seed.user({ role: 'FACULTY' });
    const room = await seed.room();
    const slot = nextWeekdaySlot(14);
    const booking = await seed.booking({ room_id: room.id, created_by: repA.id, start_time: slot.start, faculty_id: facultyA.faculty_id, purpose: `Original ${tag()}` });
    const newPurpose = `Transferred ${tag()}`;
    const transfer = () => seed.one('SELECT * FROM booking_transfers WHERE booking_id = $1', [booking.id]);
    const bookingRow = () => seed.one('SELECT * FROM bookings WHERE id = $1', [booking.id]);

    // 1. Rep B asks for the slot from the calendar
    await signIn(page, request, repB, '/calendar');
    const dialog = await openSlot(page, room, slot);
    await expect(dialog.getByRole('heading', { name: /request transfer/i })).toBeVisible();
    await pickFaculty(dialog, facultyB);
    await dialog.getByPlaceholder(/special class/i).fill(newPurpose);
    await dialog.getByRole('button', { name: /request transfer/i }).click();
    await expect(toast(page, /transfer request sent successfully/i)).toBeVisible();
    expect(await transfer()).toMatchObject({ status: 'PENDING', requested_by: repB.id, owner_id: repA.id, target_faculty_id: facultyB.faculty_id, new_purpose: newPurpose });

    // Rep B sees it as outgoing
    await page.goto('/bookings');
    await page.getByRole('button', { name: /^transfers/i }).click();
    await expect(page.getByText(/waiting for owner/i)).toBeVisible();

    // 2. Rep A accepts on /bookings -> Transfers
    await signIn(page, request, repA, '/bookings');
    await page.getByRole('button', { name: /^transfers/i }).click();
    const incoming = page.locator('div.rounded-\\[2rem\\]').filter({ hasText: room.name }).filter({ hasText: newPurpose });
    await expect(incoming).toBeVisible();
    await incoming.getByRole('button', { name: /accept/i }).click();
    await expect(toast(page, /transfer accepted/i)).toBeVisible();
    await expect(incoming.getByText(/owner accepted/i)).toBeVisible();
    expect((await transfer()).status).toBe('REP2_ACCEPTED');
    expect((await bookingRow()).status).toBe('ACTIVE');

    // 3. Owner faculty approves on the faculty portal
    await signIn(page, request, facultyA, '/faculty');
    let card = page.locator('div.ring-1').filter({ hasText: newPurpose });
    await card.getByRole('button', { name: /approve/i }).click();
    await expect(toast(page, /owner faculty approved/i)).toBeVisible();
    expect((await transfer()).status).toBe('FACULTY2_ACCEPTED');

    // 4. Requester's faculty gives final approval
    await signIn(page, request, facultyB, '/faculty');
    card = page.locator('div.ring-1').filter({ hasText: newPurpose });
    await card.getByRole('button', { name: /approve/i }).click();
    await expect(toast(page, /transfer completed successfully/i)).toBeVisible();

    expect((await transfer()).status).toBe('ACCEPTED');
    expect(await bookingRow()).toMatchObject({ status: 'ACTIVE', created_by: repB.id, faculty_id: facultyB.faculty_id, purpose: newPurpose });

    // Rep B now sees it as their own booking
    await signIn(page, request, repB, '/calendar');
    const mine = await openSlot(page, room, slot);
    await expect(mine.getByRole('heading', { name: /booking details/i })).toBeVisible();
  });

  test('owner rejects a transfer request -> REJECTED, booking untouched', async ({ page, request, seed }) => {
    const repA = await seed.user({ role: 'STUDENT_REP' });
    const repB = await seed.user({ role: 'STUDENT_REP' });
    const room = await seed.room();
    const slot = nextWeekdaySlot(13);
    const booking = await seed.booking({ room_id: room.id, created_by: repA.id, start_time: slot.start, purpose: `Keep ${tag()}` });
    const t = await seed.one(
      `INSERT INTO booking_transfers (booking_id, requested_by, owner_id, new_purpose) VALUES ($1,$2,$3,$4) RETURNING *`,
      [booking.id, repB.id, repA.id, `Want it ${tag()}`],
    );

    await signIn(page, request, repA, '/bookings');
    await page.getByRole('button', { name: /^transfers/i }).click();
    const incoming = page.locator('div.rounded-\\[2rem\\]').filter({ hasText: t.new_purpose });
    await incoming.getByRole('button', { name: /reject/i }).click();
    await expect(toast(page, /transfer rejected/i)).toBeVisible();
    await expect(incoming.getByText(/dismissed/i)).toBeVisible();
    expect((await seed.one('SELECT status FROM booking_transfers WHERE id = $1', [t.id])).status).toBe('REJECTED');
    expect(await seed.one('SELECT status, created_by FROM bookings WHERE id = $1', [booking.id])).toEqual({ status: 'ACTIVE', created_by: repA.id });
  });
});
