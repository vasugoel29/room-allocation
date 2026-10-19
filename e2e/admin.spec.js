import fs from 'fs';
import {
  test, expect, signIn, toast, tag, firstSortingName, smartTodayKey, istToUtc, istDateKey, istDow, addDays,
  DOW_LONG, API_URL, apiLogin, PASSWORD,
} from './helpers.js';

// Noise that is not an app error (dev-only / environment), everything else fails the tab smoke test.
const IGNORED_CONSOLE = [/Download the React DevTools/i, /\[vite\]/i, /favicon/i];

const TABS = [
  ['quick', /quick allocation/i],
  ['bookings', /bookings management/i],
  ['promotions', /promotion requests/i],
  ['timetable', /^timetable$/i],
  ['room-grid', /room schedule grid/i],
  ['users', /users management/i],
  ['rooms', /rooms management/i],
  ['departments', /departments management/i],
  ['branches', /branches management/i],
  ['analytics', /room analytics/i],
  ['audit', /system audit log/i],
  ['uploads', /bulk uploads/i],
];

const dialog = (page, title) => page.getByRole('dialog').filter({ has: page.getByRole('heading', { name: title }) });
const modal = (page, title) => page.locator('div.fixed').filter({ has: page.getByRole('heading', { name: title, exact: true }) });

test.describe('Admin console', () => {
  for (const [tab, heading] of TABS) {
    test(`tab "${tab}" loads without error toasts or console errors`, async ({ page, request, seed }) => {
      const admin = await seed.user({ role: 'ADMIN' });
      await signIn(page, request, admin, `/admin?tab=${tab}`);
      await expect(page.getByRole('heading', { name: heading }).first()).toBeVisible();
      await page.waitForLoadState('networkidle');
      await expect(page.getByText(/something went wrong/i)).toHaveCount(0);
      await expect(page.getByRole('status').filter({ hasText: /fail|error|unable/i })).toHaveCount(0);
      const errors = page.consoleErrors.filter((e) => !IGNORED_CONSOLE.some((re) => re.test(e)));
      expect(errors, errors.join('\n')).toEqual([]);
    });
  }

  test('tab bar navigation updates the URL', async ({ page, request, seed }) => {
    const admin = await seed.user({ role: 'ADMIN' });
    await signIn(page, request, admin, '/admin');
    await page.getByRole('button', { name: /^rooms$/i }).click();
    await expect(page).toHaveURL(/tab=rooms/);
    await page.getByRole('button', { name: /^audit log$/i }).click();
    await expect(page).toHaveURL(/tab=audit/);
  });

  test('Rooms: create, edit and delete a room', async ({ page, request, seed }) => {
    const admin = await seed.user({ role: 'ADMIN' });
    const name = firstSortingName();
    await signIn(page, request, admin, '/admin?tab=rooms');

    await page.getByRole('button', { name: /add room/i }).click();
    const m = modal(page, 'New Room');
    await m.getByPlaceholder('e.g. 5013, Audi-2').fill(name);
    await m.getByRole('button', { name: /select building\/block/i }).click();
    await m.getByText('5th Block', { exact: true }).click();
    await m.getByPlaceholder('0 for G, 1 for 1st').fill('2');
    await m.getByPlaceholder('e.g. 60').fill('75');
    await m.getByLabel(/air conditioned/i).check();
    await m.getByPlaceholder(/block 5 top floor/i).fill('Near the lift');
    await m.getByRole('button', { name: /create room/i }).click();
    await expect(toast(page, /room created successfully/i)).toBeVisible();
    const created = await seed.one('SELECT * FROM rooms WHERE name = $1', [name]);
    expect(created).toMatchObject({ building: '5th Block', floor: 2, capacity: 75, has_ac: true, has_projector: false, description: 'Near the lift', student_access: true, type: 'Lecture Room' });

    const row = page.locator('tr').filter({ hasText: name });
    await expect(row).toContainText('75 seats');
    await row.getByRole('button').first().click();
    const e = modal(page, 'Edit Room');
    await expect(e.getByPlaceholder('e.g. 5013, Audi-2')).toHaveValue(name);
    await e.getByPlaceholder('e.g. 60').fill('90');
    await e.getByLabel(/allow student booking/i).uncheck();
    await e.getByRole('button', { name: /save settings/i }).click();
    await expect(toast(page, /room updated successfully/i)).toBeVisible();
    await expect(row).toContainText('90 seats');
    await expect(row).toContainText(/staff only/i);
    expect(await seed.one('SELECT capacity, student_access FROM rooms WHERE id = $1', [created.id])).toEqual({ capacity: 90, student_access: false });

    await row.getByRole('button').last().click();
    await dialog(page, /delete room/i).getByRole('button', { name: /delete room/i }).click();
    await expect(toast(page, /room deleted successfully/i)).toBeVisible();
    await expect(row).toHaveCount(0);
    expect(await seed.one('SELECT id FROM rooms WHERE id = $1', [created.id])).toBeUndefined();
  });

  test('Users: add a FACULTY user', async ({ page, request, seed }) => {
    const admin = await seed.user({ role: 'ADMIN' });
    const email = `e2e.added.${tag()}@nsut.ac.in`;
    await signIn(page, request, admin, '/admin?tab=users');
    await page.getByRole('button', { name: /add user/i }).click();
    const m = modal(page, 'New Observer');
    await m.getByPlaceholder('e.g. John Doe').fill('E2E Added Faculty');
    await m.getByPlaceholder('john@campus.edu').fill(email);
    await m.getByRole('button', { name: /viewer \(student\)/i }).click();
    await m.getByText('FACULTY (Staff)').click();
    await m.getByPlaceholder('Select or type department').fill('Computer Science');
    await m.getByText('Department Of Computer Science (CSE)').click();
    await m.getByPlaceholder('••••••••').fill(PASSWORD);
    await m.getByRole('button', { name: /establish access/i }).click();
    await expect(toast(page, /user created/i)).toBeVisible();
    expect(await seed.one('SELECT role, is_approved FROM users WHERE email = $1', [email])).toEqual({ role: 'FACULTY', is_approved: true });
    await apiLogin(request, email); // the new account can sign in
  });

  test('Users: "Add User" with role ADMIN stores an ADMIN', async ({ page, request, seed }) => {
    // [FE-03] AdminUserModal sends role:'admin' (lowercase) for ADMIN; the backend stores it verbatim,
    // so the new "admin" has no rights at all.
    test.fail();
    const admin = await seed.user({ role: 'ADMIN' });
    const email = `e2e.newadmin.${tag()}@nsut.ac.in`;
    await signIn(page, request, admin, '/admin?tab=users');
    await page.getByRole('button', { name: /add user/i }).click();
    const m = modal(page, 'New Observer');
    await m.getByPlaceholder('e.g. John Doe').fill('E2E New Admin');
    await m.getByPlaceholder('john@campus.edu').fill(email);
    await m.getByRole('button', { name: /viewer \(student\)/i }).click();
    await m.getByText('ADMIN (Root Access)').click();
    await m.getByPlaceholder('Select or type department').fill('Computer Science');
    await m.getByText('Department Of Computer Science (CSE)').click();
    await m.getByPlaceholder('••••••••').fill(PASSWORD);
    await m.getByRole('button', { name: /establish access/i }).click();
    await expect(toast(page, /user created/i)).toBeVisible();
    expect((await seed.one('SELECT role FROM users WHERE email = $1', [email])).role).toBe('ADMIN');
  });

  test('Users: approve a pending faculty account, then delete a user', async ({ page, request, seed }) => {
    const admin = await seed.user({ role: 'ADMIN' });
    const pending = await seed.user({ role: 'FACULTY', is_approved: false });
    const doomed = await seed.user({ role: 'VIEWER' });
    await signIn(page, request, admin, '/admin?tab=users');

    const pendingRow = page.locator('tr').filter({ hasText: pending.email });
    await expect(pendingRow).toContainText(/pending approval/i);
    await pendingRow.getByRole('button', { name: /approve/i }).click();
    await expect(toast(page, /user approved/i)).toBeVisible();
    await expect(pendingRow).not.toContainText(/pending approval/i);
    expect((await seed.one('SELECT is_approved FROM users WHERE id = $1', [pending.id])).is_approved).toBe(true);
    await apiLogin(request, pending.email);

    const doomedRow = page.locator('tr').filter({ hasText: doomed.email });
    await doomedRow.getByRole('button').last().click();
    await dialog(page, /delete user/i).getByRole('button', { name: /delete user/i }).click();
    await expect(toast(page, /user deleted/i)).toBeVisible();
    await expect(doomedRow).toHaveCount(0);
    expect(await seed.one('SELECT id FROM users WHERE id = $1', [doomed.id])).toBeUndefined();
  });

  test('Departments: create, rename and delete', async ({ page, request, seed }) => {
    const admin = await seed.user({ role: 'ADMIN' });
    const name = `${firstSortingName()} Dept`;
    await signIn(page, request, admin, '/admin?tab=departments');

    await page.getByRole('button', { name: /add dept/i }).click();
    await modal(page, 'New Dept').getByPlaceholder('e.g. Department of CSE').fill(name);
    await page.getByRole('button', { name: /create department/i }).click();
    await expect(toast(page, /department created successfully/i)).toBeVisible();
    const dept = await seed.one('SELECT * FROM departments WHERE name = $1', [name]);
    expect(dept).toBeTruthy();

    const row = page.locator('tr').filter({ hasText: name });
    await row.getByRole('button').first().click();
    const renamed = `${name} Renamed`;
    await expect(modal(page, 'Edit Dept').getByPlaceholder('e.g. Department of CSE')).toHaveValue(name);
    await modal(page, 'Edit Dept').getByPlaceholder('e.g. Department of CSE').fill(renamed);
    await page.getByRole('button', { name: /save changes/i }).click();
    await expect(toast(page, /department updated successfully/i)).toBeVisible();
    expect((await seed.one('SELECT name FROM departments WHERE id = $1', [dept.id])).name).toBe(renamed);

    const renamedRow = page.locator('tr').filter({ hasText: renamed });
    await renamedRow.getByRole('button').last().click();
    await dialog(page, /delete department/i).getByRole('button', { name: /delete department/i }).click();
    await expect(toast(page, /department deleted successfully/i)).toBeVisible();
    await expect(renamedRow).toHaveCount(0);
    expect(await seed.one('SELECT id FROM departments WHERE id = $1', [dept.id])).toBeUndefined();
  });

  test('Branches: create, edit and delete', async ({ page, request, seed }) => {
    const admin = await seed.user({ role: 'ADMIN' });
    const dept = await seed.one('INSERT INTO departments (name) VALUES ($1) RETURNING *', [`${firstSortingName()} Branch Dept`]);
    const name = `${firstSortingName()} Branch`;
    await signIn(page, request, admin, '/admin?tab=branches');

    await page.getByRole('button', { name: /add branch/i }).click();
    const m = modal(page, 'New Branch');
    await m.getByPlaceholder('e.g. Information Technology').fill(name);
    await m.getByPlaceholder('e.g. IT').fill('zz');
    await m.locator('select').selectOption({ label: dept.name });
    await m.getByRole('button', { name: /create branch/i }).click();
    await expect(toast(page, /branch created successfully/i)).toBeVisible();
    const branch = await seed.one('SELECT * FROM branches WHERE name = $1', [name]);
    expect(branch).toMatchObject({ short_code: 'ZZ', department_id: dept.id });

    await page.getByRole('button', { name: `Edit ${name}` }).click();
    // the modal copies the branch into its form in an effect; wait for it before typing
    await expect(modal(page, 'Edit Branch').getByPlaceholder('e.g. Information Technology')).toHaveValue(name);
    await modal(page, 'Edit Branch').getByPlaceholder('e.g. IT').fill('ZY');
    await page.getByRole('button', { name: /save changes/i }).click();
    await expect(toast(page, /branch updated successfully/i)).toBeVisible();
    expect((await seed.one('SELECT short_code FROM branches WHERE id = $1', [branch.id])).short_code).toBe('ZY');

    await page.getByRole('button', { name: `Delete ${name}` }).click();
    await dialog(page, /delete branch/i).getByRole('button', { name: /delete branch/i }).click();
    await expect(toast(page, /branch deleted successfully/i)).toBeVisible();
    expect(await seed.one('SELECT id FROM branches WHERE id = $1', [branch.id])).toBeUndefined();
    await seed.db.query('DELETE FROM departments WHERE id = $1', [dept.id]);
  });

  test('Bookings: lists today\'s booking and cancels it; export downloads a CSV', async ({ page, request, seed }) => {
    const admin = await seed.user({ role: 'ADMIN' });
    const rep = await seed.user({ role: 'STUDENT_REP' });
    const room = await seed.room();
    const b = await seed.booking({ room_id: room.id, created_by: rep.id, start_time: istToUtc(smartTodayKey(), 19), purpose: `Admin view ${tag()}` });

    await signIn(page, request, admin, '/admin?tab=bookings');
    await page.getByPlaceholder('Search bookings...').fill(room.name);
    const row = page.locator('tr').filter({ hasText: room.name });
    await expect(row).toContainText(rep.name);
    await expect(row).toContainText('19:00');
    await expect(row).toContainText('ACTIVE');

    const downloadP = page.waitForEvent('download');
    await page.getByRole('button', { name: /^export$/i }).click();
    const download = await downloadP;
    expect(download.suggestedFilename()).toMatch(/^bookings_export_.*\.csv$/);
    const csv = fs.readFileSync(await download.path(), 'utf8');
    expect(csv).toContain(room.name);

    await row.getByTitle('Cancel Booking').click();
    await dialog(page, /cancel booking/i).getByRole('button', { name: /cancel booking/i }).click();
    await expect(toast(page, /booking cancelled successfully/i)).toBeVisible();
    await expect(row).toContainText('CANCELLED');
    expect((await seed.one('SELECT status FROM bookings WHERE id = $1', [b.id])).status).toBe('CANCELLED');
  });

  test('Quick Book: books a room for a chosen user', async ({ page, request, seed }) => {
    const admin = await seed.user({ role: 'ADMIN' });
    const rep = await seed.user({ role: 'STUDENT_REP' });
    const room = await seed.room({ name: firstSortingName() }); // sorts onto page 1 of the status table
    const dateKey = new Date().toISOString().slice(0, 10); // useAdminQuickBook default (UTC date, see FE-14)

    await signIn(page, request, admin, '/admin?tab=quick');
    await page.getByRole('button', { name: /^08:00 - 09:00$/ }).click();
    await page.getByRole('button', { name: /^16:00 - 17:00$/ }).click();

    const row = page.locator('tr').filter({ hasText: room.name });
    await expect(row).toContainText(/available/i);
    await row.getByRole('button', { name: /select user/i }).click();
    await page.getByPlaceholder('Search members...').filter({ visible: true }).fill(rep.email);
    await page.getByRole('button', { name: new RegExp(rep.name) }).filter({ visible: true }).click();
    await row.getByRole('button', { name: /book now/i }).click();
    await expect(toast(page, `Room ${room.name} booked successfully!`)).toBeVisible();
    await expect(row.getByRole('button', { name: /^booked$/i })).toBeDisabled();

    const b = await seed.one('SELECT * FROM bookings WHERE room_id = $1', [room.id]);
    expect(b).toMatchObject({ created_by: rep.id, status: 'ACTIVE', purpose: 'Admin Override' });
    expect(new Date(b.start_time).toISOString()).toBe(istToUtc(dateKey, 16));
  });

  test('Quick Book: "Room Jump" filters the table to the chosen room', async ({ page, request, seed }) => {
    // [NEW-E2E-1] The Room Jump (and Slot) dropdowns live in a header with backdrop-blur (its own stacking
    // context, no z-index), so the table's `relative` recipient pickers paint above them: items that overlap
    // the "Member (Recipient)" column are unclickable — the click lands on a row's "Select User..." button.
    test.fail();
    const admin = await seed.user({ role: 'ADMIN' });
    const room = await seed.room({ name: `ZZ-${tag()}` }); // sorts last -> deep in the Room Jump list
    await signIn(page, request, admin, '/admin?tab=quick');
    await page.getByRole('button', { name: /^all rooms$/i }).click();
    await page.getByRole('button', { name: room.name, exact: true }).click({ timeout: 5000 });
    await expect(page.locator('tbody tr')).toHaveCount(1);
    await expect(page.locator('tbody tr')).toContainText(room.name);
  });

  test('Room Grid: a seeded booking shows on its own weekday row', async ({ page, request, seed }) => {
    // [FE-01] RoomScheduleGrid builds row dates with toISOString() on local (IST) midnight, so every
    // row is labelled one day late: Tuesday's booking renders in the Wednesday row.
    test.fail();
    const admin = await seed.user({ role: 'ADMIN' });
    const booker = await seed.user({ role: 'STUDENT_REP' });
    const room = await seed.room();
    const today = istDateKey();
    const dow = istDow(today) || 7;
    const tuesday = addDays(today, 2 - dow); // Tuesday of the grid's (Monday-based) current week
    const purpose = `Grid ${tag()}`;
    await seed.booking({ room_id: room.id, created_by: booker.id, start_time: istToUtc(tuesday, 10), purpose });

    await signIn(page, request, admin, '/admin?tab=room-grid');
    await selectGridRoom(page, room);
    const title = `Booked by ${booker.name}: ${purpose}`;
    await expect(page.getByTitle(title)).toBeVisible(); // it is rendered somewhere...
    const rowOf = (day) => page.locator('div.grid-cols-11').filter({ has: page.getByText(day, { exact: true }) });
    const observed = [];
    for (const day of DOW_LONG.slice(1, 6)) if (await rowOf(day).getByTitle(title).count()) observed.push(day);
    test.info().annotations.push({ type: 'observed-row', description: observed.join(',') });
    // ...but must be in the Tuesday row, 10:00 column (column 0 is the day header, hours start at 08:00)
    await expect(rowOf('Tuesday').locator(':scope > div').nth(10 - 8 + 1), `rendered in: ${observed}`).toHaveAttribute('title', title, { timeout: 3000 });
  });

  test('Room Grid: "Confirm Booking" creates a booking for a free cell', async ({ page, request, seed }) => {
    // [FE-02] The drawer posts {room_id,start_time,end_time,purpose} to /bookings/admin/quick, which
    // requires room_name/date/slot -> always 400 "Room name required".
    test.fail();
    const admin = await seed.user({ role: 'ADMIN' });
    const room = await seed.room();
    const purpose = `Grid book ${tag()}`;

    await signIn(page, request, admin, '/admin?tab=room-grid');
    await selectGridRoom(page, room);
    const thursday = page.locator('div.grid-cols-11').filter({ has: page.getByText('Thursday', { exact: true }) });
    await thursday.locator(':scope > div').nth(11 - 8 + 1).click();
    await expect(page.getByRole('heading', { name: /create booking/i })).toBeVisible();
    await expect(page.getByText(/slot is free/i)).toBeVisible();
    await page.getByPlaceholder(/guest lecture/i).fill(purpose);
    const [resp] = await Promise.all([
      page.waitForResponse((r) => r.url().endsWith('/bookings/admin/quick')),
      page.getByRole('button', { name: /confirm booking/i }).click(),
    ]);
    expect(resp.status(), await resp.text()).toBe(201);
    await expect(toast(page, /booking created successfully/i)).toBeVisible();
    expect(await seed.one('SELECT status FROM bookings WHERE room_id = $1 AND purpose = $2', [room.id, purpose])).toEqual({ status: 'ACTIVE' });
  });

  test('Audit Log: shows the admin\'s recent actions and filters by search', async ({ page, request, seed }) => {
    const admin = await seed.user({ role: 'ADMIN' });
    const rep = await seed.user({ role: 'STUDENT_REP' });
    const room = await seed.room();
    const b = await seed.booking({ room_id: room.id, created_by: rep.id, start_time: istToUtc(smartTodayKey(), 20) });
    const { token } = await apiLogin(request, admin.email);
    const res = await request.patch(`${API_URL}/bookings/${b.id}/cancel`, { headers: { Authorization: `Bearer ${token}` } });
    expect(res.ok()).toBeTruthy();

    await signIn(page, request, admin, '/admin?tab=audit');
    await page.getByPlaceholder('Search action or user...').fill(admin.name);
    const row = page.locator('tr').filter({ hasText: admin.name }).filter({ hasText: /cancel booking/i });
    await expect(row.first()).toBeVisible();
    await page.getByPlaceholder('Search action or user...').fill(`zz-no-such-user-${tag()}`);
    await expect(page.locator('tr').filter({ hasText: admin.name })).toHaveCount(0);
  });

  test('Analytics renders summary cards', async ({ page, request, seed }) => {
    const admin = await seed.user({ role: 'ADMIN' });
    await signIn(page, request, admin, '/admin?tab=analytics');
    await expect(page.getByRole('heading', { name: /room analytics/i })).toBeVisible();
    await expect(page.getByRole('heading', { level: 3 }).first()).toBeVisible();
    await expect(page.locator('.recharts-wrapper, svg.recharts-surface').first()).toBeVisible();
  });

  test('CSV Uploads: download the students template and import a students CSV', async ({ page, request, seed }) => {
    const admin = await seed.user({ role: 'ADMIN' });
    const t = tag();
    const email = `e2e.import.${t}@nsut.ac.in`;
    await signIn(page, request, admin, '/admin?tab=uploads');
    const card = page.locator('div.rounded-\\[2\\.5rem\\]').filter({ hasText: 'Students Data' }).last();

    const downloadP = page.waitForEvent('download');
    await card.getByRole('button', { name: /template/i }).click();
    const download = await downloadP;
    expect(download.suggestedFilename()).toBe('students_template.csv');
    const header = fs.readFileSync(await download.path(), 'utf8').trim();
    expect(header).toBe('name,email,branch,year,section,degree,department_name,roll_no');

    const csv = `${header}\nE2E Imported ${t},${email},CSE,2,1,B.Tech.,Department Of Computer Science (CSE),2K24/E2E/${t}\n`;
    await card.locator('input[type=file]').setInputFiles({ name: 'students.csv', mimeType: 'text/csv', buffer: Buffer.from(csv) });
    await expect(card.getByRole('button', { name: /dismiss/i })).toBeVisible({ timeout: 20_000 });
    await expect(card).toContainText(/upload students csv\s*done/i);
    expect(await seed.one('SELECT role, name FROM users WHERE email = $1', [email])).toEqual({ role: 'VIEWER', name: `E2E Imported ${t}` });
  });
});

async function selectGridRoom(page, room) {
  await page.getByText('Select Room', { exact: true }).locator('xpath=following-sibling::div[1]').click();
  await page.getByPlaceholder('Search room name or building...').fill(room.name);
  await page.getByText(`Room ${room.name} · `, { exact: false }).click();
  await expect(page.getByText(`Room ${room.name} (5th Block)`)).toBeVisible();
}
