import app from '../src/server.js';
import * as db from '../src/db.js';

let migrated = false;
let migrationPromise = null;

export default async function handler(req, res) {
  if (!migrated) {
    if (!migrationPromise) {
      migrationPromise = db.connectAndMigrate().then(() => {
        migrated = true;
      });
    }
    await migrationPromise;
  }
  return app(req, res);
}
