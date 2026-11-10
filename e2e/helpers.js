// Shared e2e helpers: an extended `test` (network isolation + console-error capture),
// multi-user sign-in, IST calendar maths that mirrors the app, and common UI drivers.
import { test as base, expect, apiLogin, istDateKey, istToUtc } from './fixtures.js';
import { WEB_URL } from './env.mjs';

export * from './fixtures.js';

let seq = 0;
/** Short unique tag for names (rooms are VARCHAR(32)-ish, keep it short). */
export const tag = () => `${Date.now().toString(36).slice(-5)}${(seq++).toString(36)}`;
/** A name that sorts before everything else seeded so far (admin lists are paginated by name ASC). */
export const firstSortingName = (prefix = '0') => `${prefix}${(4e12 - Date.now()).toString(36)}${(seq++).toString(36)}`;

export const test = base.extend({
  /**
   * - Blocks Sentry ingest (main.jsx ships every console log / replay to the production Sentry project).
   * - FE-16: AdminTimetableSlots does a raw fetch('/api/rooms') that Vite proxies to the *dev* backend
   *   on :4000. Answer it locally so e2e runs never touch the dev stack.
   * - Collects console errors + uncaught page errors into page.consoleErrors.
   */
  page: async ({ page }, use) => {
    await page.route(/sentry\.io/, (r) => r.fulfill({ status: 200, body: '{}' }));
    await page.route(`${WEB_URL}/api/**`, (r) => r.fulfill({ status: 200, contentType: 'application/json', body: '[]' }));
    page.consoleErrors = [];
    page.on('console', (m) => { if (m.type() === 'error') page.consoleErrors.push(m.text()); });
    page.on('pageerror', (e) => page.consoleErrors.push(`pageerror: ${e.message}`));
    await use(page);
  },
});

/**
 * Sign in as `user` on an existing page without init scripts, so the same page can switch users
 * (the `loginAs` fixture installs an init script that would re-inject the first user forever).
 */
export async function signIn(page, request, user, path = '/') {
  const { token, user: u } = await apiLogin(request, user.email);
  if (!page.url().startsWith(WEB_URL)) await page.goto('/login');
  // A real sign-in replaces the previous person's `token` and `permissions` cookies; swapping
  // localStorage alone would leave them, and the UI would show the previous person's permissions.
  await page.context().clearCookies();
  await page.evaluate(([t, json]) => {
    localStorage.clear();
    localStorage.setItem('token', t);
    localStorage.setItem('user', json);
    // The first-sign-in tutorial is a full-screen dialog that would cover every page under test.
    localStorage.setItem(`cras_tutorial_seen_${JSON.parse(json).id}`, 'true');
  }, [token, JSON.stringify(u)]);
  await page.goto(path);
  return { token, user: u };
}

// ---------------------------------------------------------------- IST date maths (mirrors the app)
const DAY = 86400_000;
const IST = 5.5 * 3600_000;
export const istDow = (dateKey) => new Date(`${dateKey}T00:00:00Z`).getUTCDay();
export const istHourNow = () => new Date(Date.now() + IST).getUTCHours();
export const addDays = (dateKey, n) => new Date(Date.parse(`${dateKey}T00:00:00Z`) + n * DAY).toISOString().slice(0, 10);
export const DOW_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
export const DOW_LONG = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

/** dateHelpers.getSmartTodayDate: weekend -> Monday, weekday >= 18:00 -> next weekday. */
export function smartTodayKey() {
  const today = istDateKey();
  const dow = istDow(today);
  if (dow === 0) return addDays(today, 1);
  if (dow === 6) return addDays(today, 2);
  if (istHourNow() >= 18) return addDays(today, dow === 5 ? 3 : 1);
  return today;
}

/** Calendar.jsx week view: the 5 weekdays starting today (weekend -> Monday). */
export function calendarWeekKeys() {
  let d = istDateKey();
  const keys = [];
  while (keys.length < 5) {
    const dow = istDow(d);
    if (dow !== 0 && dow !== 6) keys.push(d);
    d = addDays(d, 1);
  }
  return keys;
}

/** dateHelpers.getWeekRange (History "This Week"): Mon..Sun of this week; weekend -> next week. */
export function historyWeekKeys() {
  const today = istDateKey();
  const dow = istDow(today) || 7;
  const monday = addDays(today, -dow + 1 + (dow >= 6 ? 7 : 0));
  return Array.from({ length: 7 }, (_, i) => addDays(monday, i));
}

/** A future slot (>= leadHours ahead) inside the current "This Week" range, for seeded bookings. */
export function slotThisWeek(hour = 17, leadHours = 1) {
  for (const key of historyWeekKeys()) {
    const dow = istDow(key);
    if (dow === 0 || dow === 6) continue;
    const start = istToUtc(key, hour);
    if (Date.parse(start) > Date.now() + leadHours * 3600_000) {
      return { dateKey: key, start, end: new Date(Date.parse(start) + 3600_000).toISOString(), hour };
    }
  }
  // Late Friday: fall back to tonight 23:00 IST (still this week, still in the future).
  const key = istDateKey();
  const start = istToUtc(key, 23);
  return { dateKey: key, start, end: new Date(Date.parse(start) + 3600_000).toISOString(), hour: 23 };
}

// ---------------------------------------------------------------- calendar drivers
/** Filters the calendar to one room (sidebar search), switches to Week view. */
export async function focusCalendarOn(page, roomName) {
  await page.getByPlaceholder('Search room name...').fill(roomName);
  await page.getByRole('button', { name: /^week$/i }).click();
}

/** The week-view cell for (dateKey, hour). Rows are hour 8..17 in week view, columns are calendarWeekKeys(). */
export function calendarCell(page, dateKey, hour) {
  const col = calendarWeekKeys().indexOf(dateKey);
  if (col < 0) throw new Error(`${dateKey} is not visible in the calendar week (${calendarWeekKeys()})`);
  // The grid is a table: one row per hour, the first cell is the time label.
  const row = page.locator('[data-tour="calendar-grid"] tbody tr').nth(hour - 8);
  return row.locator(':scope > td').nth(col + 1);
}

export function roomCard(page, room, dateKey, hour) {
  return calendarCell(page, dateKey, hour).locator(`.room-card[title^="${room.name} - "]`);
}

/** Opens the booking modal from the calendar for a room/slot. */
export async function openSlot(page, room, slot) {
  await focusCalendarOn(page, room.name);
  const card = roomCard(page, room, slot.dateKey, slot.hour);
  await expect(card).toBeVisible();
  await card.click();
  return page.getByRole('dialog');
}

export async function pickFaculty(dialog, faculty) {
  const input = dialog.getByLabel('Search for faculty');
  await input.click();
  await input.fill(faculty.name);
  await dialog.getByText(faculty.name, { exact: true }).click();
  await expect(input).toHaveAttribute('placeholder', faculty.name);
}

/** Picks `dateKey` in DatePickerDropdown (only needed when it differs from the preselected day). */
export async function pickDate(page, dateKey) {
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

/** Toast lookup (react-hot-toast renders role=status). */
export const toast = (page, text) => page.getByRole('status').filter({ hasText: text });
