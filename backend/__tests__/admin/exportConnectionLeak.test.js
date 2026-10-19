// OPS-07: GET /api/admin/export/bookings acquires a dedicated pool client and only releases it
// on the happy path. Every failing export (e.g. an unparsable start_date) leaks one connection;
// once `pool.options.max` have leaked, every DB call in the process blocks.
// Kept in its own file because the leak poisons the module-level pool; afterAll force-releases
// the leaked clients so closeDb() can't hang. Every request is bounded so nothing can hang the suite.
import request from 'supertest';
import app from '../../src/server.js';
import * as db from '../../src/db.js';
import { createAdmin, closeDb } from '../../test/helpers/factories.js';

const checkedOut = () => db.pool.totalCount - db.pool.idleCount;

/** Fires a request but never waits longer than `ms` (a hung response resolves as { timedOut: true }). */
const bounded = (req, ms) => Promise.race([
  req.then((res) => ({ res }), (err) => ({ err })),
  new Promise((r) => setTimeout(() => r({ timedOut: true }), ms)),
]);

const badExport = (auth, startDate) => bounded(
  request(app).get('/api/admin/export/bookings').query({ start_date: startDate }).set('Authorization', auth).timeout(2500),
  3000,
);

let admin;
beforeAll(async () => {
  admin = await createAdmin();
});

afterAll(async () => {
  // Release whatever the export leaked so pool.end() can complete. Bounded retry: releasing can
  // hand a client to a queued waiter, which then returns it on its own.
  for (let attempt = 0; attempt < 50 && checkedOut() > 0; attempt++) {
    const idle = new Set(db.pool._idle.map((i) => i.client));
    for (const client of [...db.pool._clients]) {
      if (!idle.has(client) && typeof client.release === 'function') {
        try { client.release(); } catch { /* already released */ }
      }
    }
    await new Promise((r) => setTimeout(r, 100));
  }
  await closeDb();
}, 20000);

// The export flushes `200 text/csv` + the CSV header line before running the query; when the
// query fails, the catch block's res.status(500) throws ERR_HTTP_HEADERS_SENT, the global error
// handler hits the same, and Express aborts the socket -> the client sees a truncated 200 / "aborted".
test.failing('[NEW-admin-1] an invalid start_date is rejected with a completed 400 JSON response (not an aborted 200 stream)', async () => {
  const out = await badExport(admin.auth, 'not-a-date');
  expect(out.timedOut).toBeUndefined();
  expect(out.err).toBeUndefined();
  expect(out.res.status).toBe(400);
  expect(out.res.body.error).toEqual(expect.any(String));
});

test.failing('[OPS-07] failed exports release their pool client: after > pool.max failing exports the pool still serves queries', async () => {
  const max = db.pool.options.max || 10;
  await Promise.all(Array.from({ length: max + 1 }, (_, i) => badExport(admin.auth, `bad-${i}`)));

  // No client may stay checked out once the requests are over.
  expect(checkedOut()).toBe(0);
  expect(db.pool.waitingCount).toBe(0);

  // And the app must still be able to talk to the DB (bounded well under the 15s connect timeout).
  const health = await bounded(request(app).get('/api/health').timeout(3000), 3500);
  expect(health.timedOut).toBeUndefined();
  expect(health.res?.status).toBe(200);
}, 30000);
