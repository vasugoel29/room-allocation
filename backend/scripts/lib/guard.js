/**
 * Safety guard for destructive dev scripts (unseed, create_db, snapshot seeding…).
 * Refuses to run when NODE_ENV=production or when the target database is not on this machine,
 * unless ALLOW_REMOTE_DB_SCRIPT=i-understand-this-destroys-data is set explicitly (OPS-01).
 */
const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '::1', '[::1]']);

export function assertLocalDatabase(connectionString, scriptName) {
  if (process.env.NODE_ENV === 'production') {
    console.error(`${scriptName}: refusing to run with NODE_ENV=production.`);
    process.exit(1);
  }
  let host;
  try {
    host = new URL(connectionString).hostname;
  } catch {
    console.error(`${scriptName}: DATABASE_URL is missing or invalid.`);
    process.exit(1);
  }
  const override = process.env.ALLOW_REMOTE_DB_SCRIPT === 'i-understand-this-destroys-data';
  if (!LOCAL_HOSTS.has(host) && !override) {
    console.error(`${scriptName}: refusing to run against non-local database host "${host}". This script deletes data.`);
    process.exit(1);
  }
  console.warn(`${scriptName}: target database host "${host}"`);
}
