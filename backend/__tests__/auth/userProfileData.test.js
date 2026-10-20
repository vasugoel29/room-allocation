// Phase 11 (live data bugs): the ACL department isn't hidden by a join; email lookups are
// case-insensitive and unique.
import request from 'supertest';
import app from '../../src/server.js';
import * as db from '../../src/db.js';
import { createAdmin, createRep, closeDb } from '../../test/helpers/factories.js';
import { userRepository } from '../../src/repositories/userRepository.js';

afterAll(closeDb);

test('the ACL-provided department and branch are returned (not overwritten by an empty join)', async () => {
  const rep = await createRep({ department_name: 'Department of Information Technology', branch: 'IT' });
  expect(await userRepository.findById(rep.user.id)).toMatchObject({
    department_name: 'Department of Information Technology', branch_name: 'IT',
  });
  const admin = await createAdmin();
  const res = await request(app).get('/api/auth/users').query({ search: rep.user.email }).set('Authorization', admin.auth);
  expect(res.body.data[0]).toMatchObject({ department_name: 'Department of Information Technology', branch_name: 'IT' });
});

test('emails are unique regardless of case, and lookups by lower(email) use an index', async () => {
  const rep = await createRep();
  await expect(db.query("INSERT INTO users (name, email, role) VALUES ('Dup', $1, 'VIEWER')", [rep.user.email.toUpperCase()]))
    .rejects.toThrow(/duplicate key|users_email_lower_key/);
  await db.query('SET enable_seqscan = off');
  try {
    const { rows } = await db.query('EXPLAIN SELECT id FROM users WHERE lower(email) = $1', [rep.user.email]);
    expect(rows.map((r) => r['QUERY PLAN']).join('\n')).toMatch(/users_email_lower_key/);
  } finally {
    await db.query('SET enable_seqscan = on');
  }
});

test('junk authorless "free" availability rows are retired (soft delete) by migration v34', async () => {
  const { rows: [{ c }] } = await db.query(
    "SELECT count(*)::int AS c FROM room_availability WHERE source = 'manual' AND is_available AND user_id IS NULL AND is_active",
  );
  expect(c).toBe(0);
});
