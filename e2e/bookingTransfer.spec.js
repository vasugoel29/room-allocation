import { test, expect } from '@playwright/test';
import pkg from 'pg';
const { Client } = pkg;
import bcrypt from 'bcrypt';
import dotenv from 'dotenv';
import path from 'path';

const nodeEnv = process.env.NODE_ENV || 'development';
dotenv.config({ path: path.resolve(process.cwd(), `backend/.env.${nodeEnv}`) });
dotenv.config({ path: path.resolve(process.cwd(), 'backend/.env') });

const DATABASE_URL = process.env.DATABASE_URL;

// Helper to calculate target Monday
function getTestMonday() {
  const dates = [];
  const d = new Date();
  const day = d.getDay();
  // Find Mon of current week or next week if weekend
  if (day === 0) d.setDate(d.getDate() + 1);
  else if (day === 6) d.setDate(d.getDate() + 2);
  else {
    // Force next week's Monday to ensure it is in the future
    d.setDate(d.getDate() - day + 8);
  }

  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const dayNum = String(d.getDate()).padStart(2, '0');
  
  return {
    dateStr: `${year}-${month}-${dayNum}`,
    fullDate: new Date(d)
  };
}

test.describe('Booking Transfer and Timetable Integration Flow', () => {
  // Use desktop viewport to interact with the Calendar grid and BookingModal
  test.use({ viewport: { width: 1280, height: 800 } });

  const student1Email = 'transfer.student1@nsut.ac.in';
  const student2Email = 'transfer.student2@nsut.ac.in';
  const student3Email = 'transfer.student3@nsut.ac.in';
  const faculty1Email = 'transfer.faculty1@nsut.ac.in';
  const faculty2Email = 'transfer.faculty2@nsut.ac.in';
  
  let client;
  let targetMonday;

  test.beforeAll(async () => {
    targetMonday = getTestMonday();
    console.log('[E2E Setup] Target Monday dateStr:', targetMonday.dateStr);

    client = new Client({ connectionString: DATABASE_URL });
    await client.connect();

    const passwordHash = await bcrypt.hash('password123', 10);

    // Delete existing E2E data
    await client.query("DELETE FROM bookings WHERE purpose IN ('Transfer E2E Base Booking', 'Transfer E2E Class')");
    await client.query("DELETE FROM users WHERE email IN ($1, $2, $3, $4, $5)", [
      student1Email, student2Email, student3Email, faculty1Email, faculty2Email
    ]);
    await client.query("DELETE FROM rooms WHERE name = 'Transfer-Room'");

    // Insert E2E Room
    await client.query(
      "INSERT INTO rooms (name, capacity, has_ac, has_projector, building, floor) VALUES ('Transfer-Room', 45, true, true, '5th Block', 2)"
    );

    // Insert users
    // Student 1 (Rep 2, current owner): CSE, Year 3, Section 1
    await client.query(
      `INSERT INTO users (name, email, password, role, branch, year, section, is_approved) 
       VALUES ('Transfer Student 1', $1, $2, 'STUDENT_REP', 'CSE', 3, 1, true)`,
      [student1Email, passwordHash]
    );

    // Student 2 (Rep 1, requester): CSE, Year 3, Section 1 (same class section)
    await client.query(
      `INSERT INTO users (name, email, password, role, branch, year, section, is_approved) 
       VALUES ('Transfer Student 2', $1, $2, 'STUDENT_REP', 'CSE', 3, 1, true)`,
      [student2Email, passwordHash]
    );

    // Student 3 (different class section): ECE, Year 2, Section 2
    await client.query(
      `INSERT INTO users (name, email, password, role, branch, year, section, is_approved) 
       VALUES ('Transfer Student 3', $1, $2, 'STUDENT_REP', 'ECE', 2, 2, true)`,
      [student3Email, passwordHash]
    );

    // Faculty 1 (owner faculty)
    await client.query(
      `INSERT INTO users (name, email, password, role, is_approved) 
       VALUES ('Transfer Faculty 1', $1, $2, 'FACULTY', true)`,
      [faculty1Email, passwordHash]
    );

    // Faculty 2 (requester faculty)
    await client.query(
      `INSERT INTO users (name, email, password, role, is_approved) 
       VALUES ('Transfer Faculty 2', $1, $2, 'FACULTY', true)`,
      [faculty2Email, passwordHash]
    );
  });

  test.afterAll(async () => {
    await client.query("DELETE FROM bookings WHERE purpose IN ('Transfer E2E Base Booking', 'Transfer E2E Class')");
    await client.query("DELETE FROM users WHERE email IN ($1, $2, $3, $4, $5)", [
      student1Email, student2Email, student3Email, faculty1Email, faculty2Email
    ]);
    await client.query("DELETE FROM rooms WHERE name = 'Transfer-Room'");
    await client.end();
  });

  // Helper to click Monday column at a specific hour for a room
  async function clickCalendarSlot(page, hour, roomName) {
    // Find the row where the first span (start time label) is exactly target hour
    const row = page.locator('div.group').filter({
      has: page.locator('span').first().filter({ hasText: new RegExp(`^${String(hour).padStart(2, '0')}:00$`) })
    }).first();
    // Monday is column 1 (0 is time label)
    const cell = row.locator('> div').nth(1);
    // Click target room
    const targetRoomCard = cell.locator('.room-card', { hasText: roomName });
    await targetRoomCard.scrollIntoViewIfNeeded();
    await targetRoomCard.click();
  }

  // Helper to navigate to target day on Timetable page
  async function navigateToDate(page, targetDateStr) {
    const expected = new Date(targetDateStr).toLocaleDateString('en-US', { 
      weekday: 'long', 
      month: 'long', 
      day: 'numeric' 
    });
    console.log(`[E2E Date Navigation] Expected header: "${expected}"`);
    
    const maxTries = 14;
    for (let i = 0; i < maxTries; i++) {
      const headerText = await page.locator('.uppercase.tracking-widest.mt-0\\.5').innerText();
      console.log(`[E2E Date Navigation] Try ${i}: header is "${headerText.trim()}"`);
      if (headerText.trim().toLowerCase() === expected.trim().toLowerCase()) {
        break;
      }
      await page.click('button:has(svg.lucide-chevron-right)');
      await page.waitForTimeout(300);
    }
  }

  test('Booking Transfer lifecycle and Timetable assertions', async ({ page }) => {
    test.setTimeout(120000); // 2 minutes

    // ----------------------------------------------------
    // Step 1: Student 1 logs in and books Transfer-Room for Monday @ 10:00
    // ----------------------------------------------------
    console.log('[Step 1] Logging in Student 1');
    await page.goto('/login');
    await page.fill('input[type="email"]', student1Email);
    await page.fill('input[type="password"]', 'password123');
    await page.click('button[type="submit"]');
    await expect(page).toHaveURL(/\/calendar/);

    // Click the slot for hour 10 on Monday
    console.log('[Step 1] Creating initial booking');
    await clickCalendarSlot(page, 10, 'Transfer-Room');
    
    // Choose Faculty 1
    await page.click('input[aria-label="Search for faculty"]');
    await page.click('span:has-text("Transfer Faculty 1")');
    await page.fill('textarea[placeholder*="Club Meeting"]', 'Transfer E2E Base Booking');
    await page.click('button:has-text("Finalize Allocation")');
    
    // Toast notification check
    await expect(page.locator('.hot-toast-container, body')).toContainText('Request sent to Prof. Transfer Faculty 1');
    await page.waitForTimeout(2000);

    // Logout Student 1
    await page.evaluate(() => { localStorage.clear(); sessionStorage.clear(); });
    await page.context().clearCookies();

    // ----------------------------------------------------
    // Step 2: Faculty 1 approves Student 1's base booking
    // ----------------------------------------------------
    console.log('[Step 2] Faculty 1 approving base booking');
    await page.goto('/login');
    await page.fill('input[type="email"]', faculty1Email);
    await page.fill('input[type="password"]', 'password123');
    await page.click('button[type="submit"]');
    await expect(page).toHaveURL(/\/faculty/);
    
    // Target the specific request card containing Student 1's booking
    const baseCard = page.locator('.bg-surface-low', { hasText: 'Transfer E2E Base Booking' }).first();
    await baseCard.locator('button:has-text("Approve")').click();
    await page.waitForTimeout(2000);

    // Logout Faculty 1
    await page.evaluate(() => { localStorage.clear(); sessionStorage.clear(); });
    await page.context().clearCookies();

    // ----------------------------------------------------
    // Step 3: Student 2 logs in and requests a Booking Transfer
    // ----------------------------------------------------
    console.log('[Step 3] Student 2 requesting booking transfer');
    await page.goto('/login');
    await page.fill('input[type="email"]', student2Email);
    await page.fill('input[type="password"]', 'password123');
    await page.click('button[type="submit"]');
    await expect(page).toHaveURL(/\/calendar/);

    // Click the active booking card at Monday 10:00
    await clickCalendarSlot(page, 10, 'Transfer-Room');

    // Fill transfer details
    await page.click('input[aria-label="Search for faculty"]');
    await page.click('span:has-text("Transfer Faculty 2")');
    await page.fill('textarea[placeholder*="Club Meeting"]', 'Transfer E2E Class');
    await page.click('button:has-text("Request Transfer")');

    // Toast notification check
    await expect(page.locator('.hot-toast-container, body')).toContainText('Transfer request sent successfully!');
    await page.waitForTimeout(2000);

    // Logout Student 2
    await page.evaluate(() => { localStorage.clear(); sessionStorage.clear(); });
    await page.context().clearCookies();

    // ----------------------------------------------------
    // Step 4: Student 1 accepts the transfer request
    // ----------------------------------------------------
    console.log('[Step 4] Student 1 accepting transfer');
    await page.goto('/login');
    await page.fill('input[type="email"]', student1Email);
    await page.fill('input[type="password"]', 'password123');
    await page.click('button[type="submit"]');
    await expect(page).toHaveURL(/\/calendar/);

    // Go to Bookings page
    await page.click('a[href="/bookings"], button:has-text("Bookings")');
    await page.waitForURL(/\/bookings/);

    // Click Transfers tab
    await page.click('button:has-text("Transfers")');
    await expect(page.locator('body')).toContainText('Transfer-Room');
    await expect(page.locator('body')).toContainText('Transfer E2E Class');

    // Click Accept button on the inbound request card
    await page.click('button:has-text("Accept")');
    
    // Toast notification check
    await expect(page.locator('.hot-toast-container, body')).toContainText('Transfer accepted');
    await page.waitForTimeout(2000);

    // Logout Student 1
    await page.evaluate(() => { localStorage.clear(); sessionStorage.clear(); });
    await page.context().clearCookies();

    // ----------------------------------------------------
    // Step 5: Faculty 1 approves the transfer (Stage 1)
    // ----------------------------------------------------
    console.log('[Step 5] Faculty 1 approving transfer');
    await page.goto('/login');
    await page.fill('input[type="email"]', faculty1Email);
    await page.fill('input[type="password"]', 'password123');
    await page.click('button[type="submit"]');
    await expect(page).toHaveURL(/\/faculty/);

    // Target the specific transfer card
    const transferCard1 = page.locator('.bg-surface-low', { hasText: 'Transfer E2E Class' }).first();
    await transferCard1.locator('button:has-text("Approve")').click();
    await expect(page.locator('.hot-toast-container, body')).toContainText('Owner faculty approved');
    await page.waitForTimeout(2000);

    // Logout Faculty 1
    await page.evaluate(() => { localStorage.clear(); sessionStorage.clear(); });
    await page.context().clearCookies();

    // ----------------------------------------------------
    // Step 6: Faculty 2 approves the transfer (Stage 2 - Final Completion)
    // ----------------------------------------------------
    console.log('[Step 6] Faculty 2 approving transfer');
    await page.goto('/login');
    await page.fill('input[type="email"]', faculty2Email);
    await page.fill('input[type="password"]', 'password123');
    await page.click('button[type="submit"]');
    await expect(page).toHaveURL(/\/faculty/);

    // Target the transfer card
    const transferCard2 = page.locator('.bg-surface-low', { hasText: 'Transfer E2E Class' }).first();
    await transferCard2.locator('button:has-text("Approve")').click();
    await expect(page.locator('.hot-toast-container, body')).toContainText('Transfer completed successfully');
    await page.waitForTimeout(2000);

    // ----------------------------------------------------
    // Step 7: Verification - Faculty 2 Timetable
    // ----------------------------------------------------
    console.log('[Step 7] Checking Faculty 2 Timetable');
    await page.click('a[href="/timetable"], button:has-text("Timetable")');
    await page.waitForURL(/\/timetable/);
    await navigateToDate(page, targetMonday.dateStr);

    await expect(page.locator('body')).toContainText('Transfer E2E Class');
    await expect(page.locator('body')).toContainText('Transfer-Room');
    await expect(page.locator('body')).toContainText('Updated');

    // Logout Faculty 2
    await page.evaluate(() => { localStorage.clear(); sessionStorage.clear(); });
    await page.context().clearCookies();

    // ----------------------------------------------------
    // Step 8: Verification - Student 2 (Requester/New Owner) Timetable
    // ----------------------------------------------------
    console.log('[Step 8] Checking Student 2 Timetable');
    await page.goto('/login');
    await page.fill('input[type="email"]', student2Email);
    await page.fill('input[type="password"]', 'password123');
    await page.click('button[type="submit"]');
    await expect(page).toHaveURL(/\/calendar/);

    await page.click('a[href="/timetable"], button:has-text("Timetable")');
    await page.waitForURL(/\/timetable/);
    await navigateToDate(page, targetMonday.dateStr);

    await expect(page.locator('body')).toContainText('Transfer E2E Class');
    await expect(page.locator('body')).toContainText('Transfer-Room');
    await expect(page.locator('body')).toContainText('Updated');

    // Logout Student 2
    await page.evaluate(() => { localStorage.clear(); sessionStorage.clear(); });
    await page.context().clearCookies();

    // ----------------------------------------------------
    // Step 9: Verification - Student 1 (Same Class Section & Year) Timetable
    // ----------------------------------------------------
    console.log('[Step 9] Checking Student 1 (Same Section) Timetable');
    await page.goto('/login');
    await page.fill('input[type="email"]', student1Email);
    await page.fill('input[type="password"]', 'password123');
    await page.click('button[type="submit"]');
    await expect(page).toHaveURL(/\/calendar/);

    await page.click('a[href="/timetable"], button:has-text("Timetable")');
    await page.waitForURL(/\/timetable/);
    await navigateToDate(page, targetMonday.dateStr);

    await expect(page.locator('body')).toContainText('Transfer E2E Class');
    await expect(page.locator('body')).toContainText('Transfer-Room');
    await expect(page.locator('body')).toContainText('Updated');

    // Logout Student 1
    await page.evaluate(() => { localStorage.clear(); sessionStorage.clear(); });
    await page.context().clearCookies();

    // ----------------------------------------------------
    // Step 10: Verification - Student 3 (Different Class Section & Year) Timetable
    // ----------------------------------------------------
    console.log('[Step 10] Checking Student 3 (Different Section) Timetable');
    await page.goto('/login');
    await page.fill('input[type="email"]', student3Email);
    await page.fill('input[type="password"]', 'password123');
    await page.click('button[type="submit"]');
    await expect(page).toHaveURL(/\/calendar/);

    await page.click('a[href="/timetable"], button:has-text("Timetable")');
    await page.waitForURL(/\/timetable/);
    await navigateToDate(page, targetMonday.dateStr);

    // Verify booking does NOT exist on Student 3's timetable
    await expect(page.locator('body')).not.toContainText('Transfer E2E Class');
    await expect(page.locator('body')).not.toContainText('Transfer-Room');
  });
});
