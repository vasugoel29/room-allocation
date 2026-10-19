import { defineConfig, devices } from '@playwright/test';
import { E2E_DB_URL, API_PORT, WEB_PORT, API_URL, WEB_URL, JWT_SECRET } from './e2e/env.mjs';

// Run with `npm run test:e2e` (rebuilds the e2e DB first). Spins up its own backend
// and frontend on dedicated ports against roomdb_e2e_test — never the dev servers/DB.
export default defineConfig({
  testDir: './e2e',
  testIgnore: ['**/legacy/**'],
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: [['list'], ['html', { open: 'never', outputFolder: 'e2e-report' }]],
  outputDir: 'e2e-results',
  use: {
    baseURL: WEB_URL,
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
    timezoneId: 'Asia/Kolkata',
    locale: 'en-IN',
  },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } }, testIgnore: ['**/*.mobile.spec.js', '**/legacy/**'] },
    { name: 'mobile', use: { ...devices['Pixel 7'] }, testMatch: ['**/*.mobile.spec.js'] },
  ],
  webServer: [
    {
      command: 'node src/server.js',
      cwd: './backend',
      url: `${API_URL}/health`,
      reuseExistingServer: false,
      timeout: 120_000,
      env: {
        NODE_ENV: 'e2e',
        PORT: String(API_PORT),
        DATABASE_URL: E2E_DB_URL,
        JWT_SECRET,
        CORS_ORIGIN: WEB_URL,
        FRONTEND_URL: WEB_URL,
        RATE_LIMIT_DISABLED: 'true',
        SMTP_USER: '',
        SMTP_PASS: '',
      },
    },
    {
      command: `npx vite --port ${WEB_PORT} --strictPort`,
      cwd: './frontend',
      url: WEB_URL,
      reuseExistingServer: false,
      timeout: 120_000,
      env: { VITE_API_URL: API_URL },
    },
  ],
});
