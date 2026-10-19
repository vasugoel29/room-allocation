import {
  test, expect, signIn, nextWeekdaySlot, openSlot, pickFaculty, focusCalendarOn, roomCard, toast,
  slotThisWeek, tag,
} from './helpers.js';

const bookingFor = (seed, roomId, userId) =>
  seed.one('SELECT * FROM bookings WHERE room_id = $1 AND created_by = $2 ORDER BY id DESC LIMIT 1', [roomId, userId]);

test.describe('Booking flow (desktop calendar)', () => {
  test('rep books a free room with a faculty -> PENDING; faculty approves -> ACTIVE; others see it booked', async ({ page, request, seed }) => {
    const rep = await seed.user({ role: 'STUDENT_REP' });
    const faculty = await seed.user({ role: 'FACULTY' });
    const viewer = await seed.user({ role: 'VIEWER' });
    const room = await seed.room();
    const slot = nextWeekdaySlot(15);
    const purpose = `Extra class ${tag()}`;

    await signIn(page, request, rep, '/calendar');
    const dialog = await openSlot(page, room, slot);
    await expect(dialog.getByRole('heading', { name: /reserve space/i })).toBeVisible();
    await pickFaculty(dialog, faculty);
    await dialog.getByPlaceholder(/special class/i).fill(purpose);
    await dialog.getByRole('button', { name: /finalize allocation/i }).click();
    await expect(toast(page, `Request sent to Prof. ${faculty.name}`)).toBeVisible();
    await expect(dialog).toBeHidden();

    const pending = await bookingFor(seed, room.id, rep.id);
    expect(pending).toMatchObject({ status: 'PENDING', faculty_id: faculty.id, purpose });
    expect(new Date(pending.start_time).toISOString()).toBe(slot.start);

    // Faculty approves from the portal
    await signIn(page, request, faculty, '/faculty');
    const card = page.locator('div.ring-1').filter({ hasText: purpose });
    await expect(card).toBeVisible();
    await card.getByRole('button', { name: /approve/i }).click();
    await expect(toast(page, /booking approved/i)).toBeVisible();
    await expect(card).toBeHidden();
    expect((await seed.one('SELECT status FROM bookings WHERE id = $1', [pending.id])).status).toBe('ACTIVE');

    // Approved tab lists it
    await page.getByRole('button', { name: /^approved$/i }).click();
    await expect(page.getByText(purpose)).toBeVisible();

    // Another user sees the slot as booked on the calendar
    await signIn(page, request, viewer, '/calendar');
    await focusCalendarOn(page, room.name);
    await expect(roomCard(page, room, slot.dateKey, slot.hour)).toHaveAttribute('title', new RegExp(`^${room.name} - Booked for `));
  });

  test('faculty rejects a pending request -> REJECTED', async ({ page, request, seed }) => {
    const rep = await seed.user({ role: 'STUDENT_REP' });
    const faculty = await seed.user({ role: 'FACULTY' });
    const room = await seed.room();
    const slot = nextWeekdaySlot(14);
    const b = await seed.booking({ room_id: room.id, created_by: rep.id, start_time: slot.start, status: 'PENDING', faculty_id: faculty.id, purpose: `Reject me ${tag()}` });

    await signIn(page, request, faculty, '/faculty');
    await expect(page.getByRole('button', { name: /pending \(1\)/i })).toBeVisible();
    const card = page.locator('div.ring-1').filter({ hasText: b.purpose });
    await card.getByRole('button', { name: /reject/i }).click();
    await expect(card).toBeHidden();
    await expect.poll(async () => (await seed.one('SELECT status FROM bookings WHERE id = $1', [b.id])).status).toBe('REJECTED');
  });

  test('students must pick a supervising faculty (no faculty-less student bookings)', async ({ page, request, seed }) => {
    const rep = await seed.user({ role: 'STUDENT_REP' });
    const room = await seed.room();
    const slot = nextWeekdaySlot(13);

    await signIn(page, request, rep, '/calendar');
    const dialog = await openSlot(page, room, slot);
    await dialog.getByPlaceholder(/special class/i).fill('No faculty');
    await dialog.getByRole('button', { name: /finalize allocation/i }).click();
    await expect(dialog.getByText(/please select a faculty for this class/i)).toBeVisible();
    expect(await bookingFor(seed, room.id, rep.id)).toBeUndefined();
  });

  test('faculty books directly (no approver) -> ACTIVE immediately', async ({ page, request, seed }) => {
    const faculty = await seed.user({ role: 'FACULTY' });
    const room = await seed.room();
    const slot = nextWeekdaySlot(12);
    const purpose = `Faculty session ${tag()}`;

    await signIn(page, request, faculty, '/calendar');
    const dialog = await openSlot(page, room, slot);
    await expect(dialog.getByLabel('Search for faculty')).toHaveCount(0);
    await dialog.getByPlaceholder(/special class/i).fill(purpose);
    await dialog.getByRole('button', { name: /finalize allocation/i }).click();
    await expect(toast(page, `Room ${room.name} has been booked`)).toBeVisible();
    expect(await bookingFor(seed, room.id, faculty.id)).toMatchObject({ status: 'ACTIVE', faculty_id: null, purpose });
  });

  test('conflict: room booked by someone else after the calendar loaded -> error, nothing created', async ({ page, request, seed }) => {
    const rep = await seed.user({ role: 'STUDENT_REP' });
    const other = await seed.user({ role: 'STUDENT_REP' });
    const faculty = await seed.user({ role: 'FACULTY' });
    const room = await seed.room();
    const slot = nextWeekdaySlot(11);

    await signIn(page, request, rep, '/calendar');
    const dialog = await openSlot(page, room, slot);
    // Somebody else grabs the room while the modal is open (calendar data is a snapshot).
    await seed.booking({ room_id: room.id, created_by: other.id, start_time: slot.start, status: 'ACTIVE' });
    await pickFaculty(dialog, faculty);
    await dialog.getByPlaceholder(/special class/i).fill('Too late');
    await dialog.getByRole('button', { name: /finalize allocation/i }).click();
    await expect(dialog.getByText(/room is already booked/i)).toBeVisible();
    expect(await bookingFor(seed, room.id, rep.id)).toBeUndefined();
  });

  test('rep cancels own booking from the calendar modal -> CANCELLED', async ({ page, request, seed }) => {
    const rep = await seed.user({ role: 'STUDENT_REP' });
    const room = await seed.room();
    const slot = nextWeekdaySlot(16);
    const b = await seed.booking({ room_id: room.id, created_by: rep.id, start_time: slot.start, purpose: `Mine ${tag()}` });

    await signIn(page, request, rep, '/calendar');
    const dialog = await openSlot(page, room, slot);
    await expect(dialog.getByRole('heading', { name: /booking details/i })).toBeVisible();
    await expect(dialog.getByText(b.purpose)).toBeVisible();
    await dialog.getByRole('button', { name: /cancel booking/i }).click();
    await expect(dialog).toBeHidden();
    await expect.poll(async () => (await seed.one('SELECT status FROM bookings WHERE id = $1', [b.id])).status).toBe('CANCELLED');
    await expect(roomCard(page, room, slot.dateKey, slot.hour)).toHaveAttribute('title', `${room.name} - Available`);
  });

  test('rep cancels own booking from /bookings -> CANCELLED and shown as Revoked', async ({ page, request, seed }) => {
    const rep = await seed.user({ role: 'STUDENT_REP' });
    const room = await seed.room();
    const slot = slotThisWeek(17);
    const b = await seed.booking({ room_id: room.id, created_by: rep.id, start_time: slot.start, purpose: `Cancel via list ${tag()}` });

    await signIn(page, request, rep, '/bookings');
    await page.getByRole('button', { name: /^this week$/i }).click();
    const row = page.locator('tr').filter({ hasText: room.name });
    await expect(row).toContainText(/validated/i);
    await row.getByRole('button').click();
    const confirm = page.getByRole('dialog').filter({ hasText: /are you sure/i });
    await confirm.getByRole('button', { name: /cancel booking/i }).click();
    await expect(toast(page, /booking cancelled/i)).toBeVisible();
    await expect(row).toContainText(/revoked/i);
    expect((await seed.one('SELECT status FROM bookings WHERE id = $1', [b.id])).status).toBe('CANCELLED');
  });

  test('viewer gets a read-only modal with no submit', async ({ page, request, seed }) => {
    const viewer = await seed.user({ role: 'VIEWER' });
    const room = await seed.room();
    const slot = nextWeekdaySlot(10);

    await signIn(page, request, viewer, '/calendar');
    const dialog = await openSlot(page, room, slot);
    await expect(dialog.getByText(/read only registry/i)).toBeVisible();
    await expect(dialog.getByRole('button', { name: /finalize allocation|request transfer/i })).toHaveCount(0);
    expect(await seed.one('SELECT count(*)::int AS n FROM bookings WHERE room_id = $1', [room.id])).toEqual({ n: 0 });
  });

  test('students do not see Committee Rooms, Auditoriums or staff-only rooms; faculty do', async ({ page, request, seed }) => {
    const t = `R${tag()}`;
    const lecture = await seed.room({ name: `${t}-LEC` });
    const committee = await seed.room({ name: `${t}-COM`, type: 'Committee Room' });
    const audi = await seed.room({ name: `${t}-AUD`, type: 'Auditorium' });
    const staffOnly = await seed.room({ name: `${t}-STF`, student_access: false });
    const slot = nextWeekdaySlot(9, 0);
    const rep = await seed.user({ role: 'STUDENT_REP' });
    const faculty = await seed.user({ role: 'FACULTY' });

    await signIn(page, request, rep, '/calendar');
    await focusCalendarOn(page, t);
    await expect(roomCard(page, lecture, slot.dateKey, slot.hour)).toBeVisible();
    for (const r of [committee, audi, staffOnly]) await expect(roomCard(page, r, slot.dateKey, slot.hour)).toHaveCount(0);

    await signIn(page, request, faculty, '/calendar');
    await focusCalendarOn(page, t);
    for (const r of [lecture, committee, audi, staffOnly]) await expect(roomCard(page, r, slot.dateKey, slot.hour)).toBeVisible();
  });
});
