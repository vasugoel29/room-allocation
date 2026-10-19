import { test, expect, signIn, toast, tag, nextWeekdaySlot, slotThisWeek } from './helpers.js';

/** Picks `dateKey` in DatePickerDropdown (only needed when it differs from the preselected day). */
async function pickDate(page, dateKey) {
  const [y, m, d] = dateKey.split('-');
  const trigger = page.getByRole('button', { name: /^\d{2}\/\d{2}\/\d{4}$/ });
  if ((await trigger.innerText()).trim() === `${d}/${m}/${y}`) return;
  await trigger.click();
  const picker = page.locator('div.glass').filter({ has: page.getByText(/^(Su)$/) }).last();
  const monthLabel = new Date(Date.UTC(+y, +m - 1, 15)).toLocaleDateString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' });
  if (!(await picker.getByText(monthLabel).count())) await picker.getByRole('button').nth(1).click(); // next month
  await expect(picker.getByText(monthLabel)).toBeVisible();
  await picker.getByRole('button', { name: String(Number(d)), exact: true }).click();
  await expect(trigger).toHaveText(`${d}/${m}/${y}`);
}

test.describe('Mobile booking & history', () => {
  test('rep books through the 3-step /book-a-slot flow -> PENDING request', async ({ page, request, seed }) => {
    const rep = await seed.user({ role: 'STUDENT_REP' });
    const faculty = await seed.user({ role: 'FACULTY' });
    const room = await seed.room();
    const slot = nextWeekdaySlot(16, 1);
    const purpose = `Mobile class ${tag()}`;

    await signIn(page, request, rep, '/calendar');
    await page.getByRole('navigation').getByRole('button').click(); // the "+" in the bottom nav
    await expect(page).toHaveURL(/\/book-a-slot$/);
    await expect(page.getByText(/step 1 of 3/i)).toBeVisible();
    await pickDate(page, slot.dateKey);
    await page.getByRole('button', { name: `${slot.hour}:00`, exact: true }).click();
    await page.getByRole('button', { name: /next: select room/i }).click();

    await expect(page.getByText(/step 2 of 3/i)).toBeVisible();
    await page.getByPlaceholder('Quick search room...').fill(room.name);
    await page.getByRole('button', { name: new RegExp(room.name) }).click();
    await page.getByRole('button', { name: /next: details/i }).click();

    await expect(page.getByText(/step 3 of 3/i)).toBeVisible();
    await expect(page.getByRole('heading', { name: `Room ${room.name}` })).toBeVisible();
    const confirm = page.getByRole('button', { name: /confirm request/i });
    await expect(confirm).toBeDisabled();
    await page.getByPlaceholder('e.g. Special Class, Meeting').fill(purpose);
    await page.getByRole('button', { name: /choose a faculty/i }).click();
    await page.getByText(faculty.name, { exact: true }).click();
    await confirm.click();
    await expect(toast(page, `Request sent to Prof. ${faculty.name}`)).toBeVisible();
    await expect(page).toHaveURL(/\/calendar$/);

    const b = await seed.one('SELECT * FROM bookings WHERE room_id = $1 AND created_by = $2', [room.id, rep.id]);
    expect(b).toMatchObject({ status: 'PENDING', faculty_id: faculty.faculty_id, purpose });
    expect(new Date(b.start_time).toISOString()).toBe(slot.start);
  });

  test('booked rooms are not offered in step 2', async ({ page, request, seed }) => {
    const rep = await seed.user({ role: 'STUDENT_REP' });
    const other = await seed.user({ role: 'STUDENT_REP' });
    const t = `M${tag()}`;
    const free = await seed.room({ name: `${t}-FREE` });
    const taken = await seed.room({ name: `${t}-TAKEN` });
    const slot = nextWeekdaySlot(15, 1);
    await seed.booking({ room_id: taken.id, created_by: other.id, start_time: slot.start });

    await signIn(page, request, rep, '/book-a-slot');
    await pickDate(page, slot.dateKey);
    await page.getByRole('button', { name: `${slot.hour}:00`, exact: true }).click();
    await page.getByRole('button', { name: /next: select room/i }).click();
    await page.getByPlaceholder('Quick search room...').fill(t);
    await expect(page.getByRole('button', { name: new RegExp(free.name) })).toBeVisible();
    await expect(page.getByRole('button', { name: new RegExp(taken.name) })).toHaveCount(0);
  });

  test('mobile history lists my booking and lets me cancel it', async ({ page, request, seed }) => {
    const rep = await seed.user({ role: 'STUDENT_REP' });
    const room = await seed.room();
    const slot = slotThisWeek(17);
    const b = await seed.booking({ room_id: room.id, created_by: rep.id, start_time: slot.start, purpose: `Mobile list ${tag()}` });

    await signIn(page, request, rep, '/calendar');
    await page.getByRole('navigation').getByRole('link', { name: /bookings/i }).click();
    await expect(page).toHaveURL(/\/history$/);
    await expect(page.getByRole('heading', { name: /my bookings/i })).toBeVisible();
    await page.getByRole('button', { name: /^this week$/i }).click();
    const card = page.locator('div.rounded-\\[2\\.5rem\\]').filter({ hasText: b.purpose });
    await expect(card).toContainText(room.name);
    await expect(card).toContainText(/valid/i);
    await card.getByRole('button').click();
    await page.getByRole('dialog').getByRole('button', { name: /cancel booking/i }).click();
    await expect(toast(page, /booking cancelled/i)).toBeVisible();
    await expect(card).toContainText(/revoked/i);
    expect((await seed.one('SELECT status FROM bookings WHERE id = $1', [b.id])).status).toBe('CANCELLED');
  });

  test('viewers cannot reach the mobile booking flow', async ({ page, request, seed }) => {
    // [FE-24] regression: /book-a-slot and /history are role-gated like /bookings.
    const viewer = await seed.user({ role: 'VIEWER' });
    await signIn(page, request, viewer, '/book-a-slot');
    await expect(page).toHaveURL(/\/calendar$/, { timeout: 5000 });
    await expect(page.getByText(/step 1 of 3/i)).toHaveCount(0);
  });
});
