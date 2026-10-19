// Rebuilds the e2e database exactly like the backend test harness does
// (schema_v2.sql -> startup migrations -> backend/test/known-drift.sql).
import { E2E_DB_URL } from './env.mjs';

process.env.TEST_DATABASE_URL = E2E_DB_URL;
const { default: globalSetup } = await import('../backend/test/global-setup.js');
await globalSetup();
console.log(`e2e database ready: ${new URL(E2E_DB_URL).pathname.slice(1)}`);
process.exit(0);
