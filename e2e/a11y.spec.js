import { test, expect, signIn, nextWeekdaySlot, openSlot, focusCalendarOn } from './helpers.js';

test.describe('Keyboard accessibility smoke', () => {
  test('a room slot can be reached and opened with the keyboard alone', async ({ page, request, seed }) => {
    // [FE-07] regression: room cards and the booking-type / faculty pickers are buttons now.
    const rep = await seed.user({ role: 'STUDENT_REP' });
    const room = await seed.room();
    await signIn(page, request, rep, '/calendar');
    await focusCalendarOn(page, room.name);
    await page.getByPlaceholder('Search room name...').focus();

    let reached = false;
    for (let i = 0; i < 40 && !reached; i++) {
      await page.keyboard.press('Tab');
      reached = await page.evaluate(() => !!document.activeElement?.closest('.room-card'));
    }
    expect(reached, 'Tab should eventually focus a room card').toBe(true);
    await page.keyboard.press('Enter');
    await expect(page.getByRole('dialog')).toBeVisible();
  });

  test('booking modal is a labelled dialog, takes focus, and closes on Escape', async ({ page, request, seed }) => {
    const rep = await seed.user({ role: 'STUDENT_REP' });
    const room = await seed.room();
    const slot = nextWeekdaySlot(15);
    await signIn(page, request, rep, '/calendar');
    const dialog = await openSlot(page, room, slot);
    await expect(dialog).toHaveAttribute('aria-modal', 'true');
    await expect(dialog).toHaveAccessibleName(/reserve space/i);
    expect(await page.evaluate(() => !!document.activeElement?.closest('[role=dialog]'))).toBe(true);
    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();
  });
});
