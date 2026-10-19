import { test, expect, signIn, toast, tag, smartTodayKey, istDow, DOW_SHORT } from './helpers.js';

/** A rep in a unique section with one real timetable_slots row on the day /timetable opens on. */
async function seedSectionClass(seed) {
  const dept = `E2E DEPT ${tag()}`;
  const faculty = await seed.user({ role: 'FACULTY' });
  const room = await seed.room();
  const rep = await seed.user({ role: 'STUDENT_REP', branch: dept, semester: 3, year: 2, section: 1 });
  const dateKey = smartTodayKey();
  const subject = `Distributed Systems ${tag()}`;
  const slot = await seed.one(
    `INSERT INTO timetable_slots (department, degree, section, year, semester, day_of_week, slot_time, subject_code, subject_name, room_name, type, faculty_name)
     VALUES ($1,'B.Tech.','1','2026-27','3',$2,'09:00-10:00','E2E101',$3,$4,'Lecture',$5) RETURNING *`,
    [dept, DOW_SHORT[istDow(dateKey)], subject, room.name, faculty.name],
  );
  return { dept, faculty, room, rep, dateKey, subject, slot };
}

test.describe('Timetable & class cancellation', () => {
  test('rep sees their section timetable and requests a class cancellation', async ({ page, request, seed }) => {
    const { faculty, room, rep, dateKey, subject } = await seedSectionClass(seed);

    await signIn(page, request, rep, '/timetable');
    const item = page.locator('div.rounded-2xl').filter({ hasText: subject }).last();
    await expect(item).toBeVisible();
    await expect(item).toContainText(room.name);
    await expect(item).toContainText('09:00 - 10:00');

    await item.getByTitle('Mark available').click();
    await expect(page.getByRole('heading', { name: /free this room\?/i })).toBeVisible();
    await page.getByRole('button', { name: /request cancellation/i }).click();
    await expect(toast(page, /cancellation request sent/i)).toBeVisible();

    const req = await seed.one('SELECT *, class_date::text AS class_day FROM class_cancellation_requests WHERE requested_by = $1', [rep.id]);
    expect(req).toMatchObject({ status: 'PENDING', faculty_id: faculty.id, room_name: room.name, subject_name: subject, hour: 9, booking_id: null });
    expect(req.class_day).toBe(dateKey);

    // A duplicate request is refused
    await item.getByTitle('Mark available').click();
    await page.getByRole('button', { name: /request cancellation/i }).click();
    await expect(toast(page, /already awaiting faculty approval/i)).toBeVisible();
  });

  test('faculty approves a class cancellation -> request APPROVED and room freed for that date', async ({ page, request, seed }) => {
    // [BKG-05] Approving a cancellation without booking_id writes a JS Date into room_availability.day
    // (VARCHAR(20)) -> 500 "value too long"; the request stays PENDING.
    test.fail();
    const { faculty, room, rep, dateKey, subject } = await seedSectionClass(seed);
    const req = await seed.one(
      `INSERT INTO class_cancellation_requests (requested_by, faculty_id, room_name, subject_name, class_date, hour)
       VALUES ($1,$2,$3,$4,$5,9) RETURNING *`,
      [rep.id, faculty.id, room.name, subject, dateKey],
    );

    await signIn(page, request, faculty, '/faculty');
    const card = page.locator('div.ring-1').filter({ hasText: `Cancel class: ${subject}` });
    await expect(card).toContainText(/cancellation request/i);
    const [resp] = await Promise.all([
      page.waitForResponse((r) => r.url().includes(`/cancellation-requests/${req.id}/approve`)),
      card.getByRole('button', { name: /approve/i }).click(),
    ]);
    expect(resp.status(), await resp.text()).toBe(200);
    await expect(toast(page, /cancellation approved/i)).toBeVisible();
    expect((await seed.one('SELECT status FROM class_cancellation_requests WHERE id = $1', [req.id])).status).toBe('APPROVED');
    expect(await seed.one('SELECT is_available FROM room_availability WHERE room_id = $1 AND day = $2 AND hour = 9', [room.id, dateKey])).toEqual({ is_available: true });

    // The rep's timetable no longer lists the class on that date
    await signIn(page, request, rep, '/timetable');
    await expect(page.getByText(/no classes scheduled for this day/i)).toBeVisible();
  });

  test('faculty rejects a class cancellation -> REJECTED, class stays', async ({ page, request, seed }) => {
    const { faculty, room, rep, dateKey, subject } = await seedSectionClass(seed);
    const req = await seed.one(
      `INSERT INTO class_cancellation_requests (requested_by, faculty_id, room_name, subject_name, class_date, hour)
       VALUES ($1,$2,$3,$4,$5,9) RETURNING *`,
      [rep.id, faculty.id, room.name, subject, dateKey],
    );

    await signIn(page, request, faculty, '/faculty');
    const card = page.locator('div.ring-1').filter({ hasText: `Cancel class: ${subject}` });
    await card.getByRole('button', { name: /reject/i }).click();
    await expect(toast(page, /cancellation request rejected/i)).toBeVisible();
    await expect(card).toBeHidden();
    expect((await seed.one('SELECT status FROM class_cancellation_requests WHERE id = $1', [req.id])).status).toBe('REJECTED');

    await signIn(page, request, rep, '/timetable');
    await expect(page.getByText(subject)).toBeVisible();
  });

  test('viewer sees the timetable read-only (no cancel actions)', async ({ page, request, seed }) => {
    const { dept, subject } = await seedSectionClass(seed);
    const viewer = await seed.user({ role: 'VIEWER', branch: dept, semester: 3, year: 2, section: 1 });

    await signIn(page, request, viewer, '/timetable');
    await expect(page.getByText(subject)).toBeVisible();
    await expect(page.getByTitle('Mark available')).toHaveCount(0);
    await expect(page.getByText(/pro tip for reps/i)).toHaveCount(0);
  });

  test('week view lists the class under its weekday', async ({ page, request, seed }) => {
    const { rep, subject } = await seedSectionClass(seed);
    await signIn(page, request, rep, '/timetable');
    await page.getByRole('button', { name: /^week$/i }).click();
    await expect(page.getByText(/^week of /i)).toBeVisible();
    await expect(page.getByText(subject)).toBeVisible();
  });
});
