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

test.describe('Room Booking Lifecycle Flow', () => {
  // Enforce mobile viewport so MobileBooking component is loaded at /book-a-slot
  test.use({ viewport: { width: 375, height: 812 } });

  let studentEmail = 'e2e.student@nsut.ac.in';
  let facultyEmail = 'e2e.faculty@nsut.ac.in';
  let client;

  test.beforeAll(async () => {
    client = new Client({ connectionString: DATABASE_URL });
    await client.connect();

    const passwordHash = await bcrypt.hash('password123', 10);

    // Delete existing E2E data
    await client.query("DELETE FROM bookings WHERE purpose = 'E2E Test Booking'");
    await client.query("DELETE FROM users WHERE email IN ($1, $2)", [studentEmail, facultyEmail]);
    await client.query("DELETE FROM rooms WHERE name = 'E2E-Room'");

    // Insert E2E Room
    await client.query(
      "INSERT INTO rooms (name, capacity, has_ac, has_projector, building, floor) VALUES ('E2E-Room', 60, true, true, '5th Block', 1)"
    );

    // Insert Student Rep
    await client.query(
      `INSERT INTO users (name, email, password, role, branch, year, section, is_approved) 
       VALUES ('E2E Student', $1, $2, 'STUDENT_REP', 'CSE', 3, 1, true)`,
      [studentEmail, passwordHash]
    );

    // Insert Faculty
    await client.query(
      `INSERT INTO users (name, email, password, role, is_approved) 
       VALUES ('E2E Faculty', $1, $2, 'FACULTY', true)`,
      [facultyEmail, passwordHash]
    );
  });

  test.afterAll(async () => {
    await client.query("DELETE FROM bookings WHERE purpose = 'E2E Test Booking'");
    await client.query("DELETE FROM users WHERE email IN ($1, $2)", [studentEmail, facultyEmail]);
    await client.query("DELETE FROM rooms WHERE name = 'E2E-Room'");
    await client.end();
  });

  test('Student requests a booking and Faculty approves it', async ({ page }) => {
    test.setTimeout(60000);
    // 1. Student Login
    await page.goto('/login');
    await page.fill('input[type="email"]', studentEmail);
    await page.fill('input[type="password"]', 'password123');
    await page.click('button[type="submit"]');

    // Wait for redirect to calendar
    await expect(page).toHaveURL(/\/calendar/);

    // Go directly to mobile booking page
    await page.goto('/book-a-slot');
    await page.waitForTimeout(1000);

    // Click date picker toggle (the button showing dd/mm/yyyy format containing '/')
    await page.click('button:has-text("/")');
    await page.waitForTimeout(500);

    // Find and click a weekday button dynamically in the calendar dropdown
    await page.evaluate(() => {
      const today = new Date();
      // Look for a day in the next 7 days that is Mon-Fri (1-5)
      for (let i = 1; i <= 7; i++) {
        const futureDate = new Date();
        futureDate.setDate(today.getDate() + i);
        const dayOfWeek = futureDate.getDay();
        if (dayOfWeek >= 1 && dayOfWeek <= 5) {
          const dayNum = futureDate.getDate();
          
          // Find the button in calendar grid containing the exact day number and click it
          const buttons = Array.from(document.querySelectorAll('div.grid-cols-7 button'));
          const targetButton = buttons.find(b => b.textContent.trim() === String(dayNum) && !b.disabled);
          if (targetButton) {
            targetButton.click();
            return;
          }
        }
      }
    });
    await page.waitForTimeout(500);

    // Select the first non-disabled hour button (e.g. 14:00 or 15:00)
    await page.click('div.grid button:not([disabled]):has-text(":00")');
    await page.waitForTimeout(500);

    // Click Next: Select Room
    await page.click('button:has-text("Next: Select Room")');
    await page.waitForTimeout(500);

    // Select E2E-Room
    await page.click('button:has-text("E2E-Room")');
    await page.waitForTimeout(500);

    // Click Next: Details
    await page.click('button:has-text("Next: Details")');
    await page.waitForTimeout(500);

    // Fill purpose of booking
    await page.fill('textarea[placeholder*="Class"]', 'E2E Test Booking');

    // Select Faculty
    await page.click('button:has-text("Choose a Faculty")');
    await page.waitForTimeout(500);
    await page.click('div.absolute >> text="E2E Faculty"');
    await page.waitForTimeout(500);

    // Click Confirm Request
    await page.click('button:has-text("Confirm Request")');
    await page.waitForTimeout(2000);

    // Logout Student by clearing localStorage and cookies
    await page.evaluate(() => {
      localStorage.clear();
      sessionStorage.clear();
    });
    await page.context().clearCookies();
    await page.goto('/login');
    await page.waitForTimeout(1000);

    // 2. Faculty Login
    await page.goto('/login');
    await page.fill('input[type="email"]', facultyEmail);
    await page.fill('input[type="password"]', 'password123');
    await page.click('button[type="submit"]');

    // Wait for Faculty Portal
    await expect(page).toHaveURL(/\/faculty/);

    // Verify pending booking is visible
    await expect(page.locator('body')).toContainText('E2E Test Booking');

    // Click Approve button
    await page.click('button:has-text("Approve"), button:has-text("Accept")');
    await page.waitForTimeout(2000);

    // Logout Faculty by clearing localStorage and cookies
    await page.evaluate(() => {
      localStorage.clear();
      sessionStorage.clear();
    });
    await page.context().clearCookies();
    await page.goto('/login');
    await page.waitForTimeout(1000);

    // 3. Student Verification
    await page.goto('/login');
    await page.fill('input[type="email"]', studentEmail);
    await page.fill('input[type="password"]', 'password123');
    await page.click('button[type="submit"]');

    await expect(page).toHaveURL(/\/calendar/);
    await page.goto('/history'); // Under mobile, bookings/transfers are shown at /history
    
    // Verify E2E Test Booking is listed
    await expect(page.locator('body')).toContainText('E2E Test Booking');
  });
});
