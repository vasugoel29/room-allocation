// Loaded by Jest (setupFiles) and by global-setup before any app module is imported.
// Pins the app to an isolated test database and refuses to run against anything else.
export const DEFAULT_TEST_DATABASE_URL = 'postgresql://roomuser:roompass@localhost:5432/roomdb_test';

export function applyTestEnv() {
  process.env.NODE_ENV = 'test';
  process.env.DATABASE_URL = process.env.TEST_DATABASE_URL || DEFAULT_TEST_DATABASE_URL;
  process.env.JWT_SECRET = process.env.JWT_SECRET_TEST || 'test_jwt_secret_do_not_use_elsewhere';
  process.env.FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:5173';
  // Rate limiting has its own dedicated tests, which re-enable it explicitly.
  process.env.RATE_LIMIT_DISABLED = 'true';
  // Never send real email from tests.
  delete process.env.SMTP_USER;
  delete process.env.SMTP_PASS;

  const dbName = new URL(process.env.DATABASE_URL).pathname.slice(1);
  if (!dbName.endsWith('_test')) {
    throw new Error(`Refusing to run tests against non-test database "${dbName}" (name must end with _test).`);
  }
  return dbName;
}

applyTestEnv();
