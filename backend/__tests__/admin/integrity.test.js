// Migration v37: the database enforces the app's vocabulary and the soft-delete rule.
import request from 'supertest';
import app from '../../src/server.js';
import * as db from '../../src/db.js';
import { notify } from '../../src/notifications/notify.js';
import { createAdmin, createRep, createRoom, insertBooking, futureSlot, closeDb } from '../../test/helpers/factories.js';

afterAll(closeDb);

let admin;
beforeAll(async () => { admin = await createAdmin(); });

const pgError = (promise) => promise.then(() => null, (err) => ({ code: err.code, constraint: err.constraint }));

describe('vocabulary checks', () => {
  test('booking, transfer, role and room-type values outside the app\'s set are refused', async () => {
    const rep = await createRep();
    const room = await createRoom();
    const b = await insertBooking({ room_id: room.id, created_by: rep.user.id, start_time: futureSlot({ hour: 9 }).start });
    expect(await pgError(db.query("UPDATE bookings SET status = 'COMPLETED' WHERE id = $1", [b.id])))
      .toEqual({ code: '23514', constraint: 'bookings_status_check' });
    expect(await pgError(db.query(
      "INSERT INTO booking_transfers (booking_id, owner_id, requested_by, status) VALUES ($1, $2, $2, 'MAYBE')", [b.id, rep.user.id],
    ))).toEqual({ code: '23514', constraint: 'booking_transfers_status_check' });
    expect(await pgError(db.query("UPDATE users SET role = 'SUPERUSER' WHERE id = $1", [rep.user.id])))
      .toEqual({ code: '23514', constraint: 'users_role_check' });
    expect(await pgError(db.query("UPDATE rooms SET type = 'Cafeteria' WHERE id = $1", [room.id])))
      .toEqual({ code: '23514', constraint: 'rooms_type_check' });
  });

  test('the rooms API names the allowed types', async () => {
    const res = await request(app).post('/api/rooms').set('Authorization', admin.auth).send({ name: `TY-${Date.now() % 1e6}`, capacity: 10, type: 'Cafeteria' });
    expect(res.status).toBe(400);
    expect(JSON.stringify(res.body)).toContain('type must be one of Lecture Room, Lab, Auditorium, Committee Room');
    const room = await createRoom();
    const patch = await request(app).patch(`/api/rooms/${room.id}`).set('Authorization', admin.auth).send({ type: 'Cafeteria' });
    expect(patch.status).toBe(400);
  });
});

describe('soft delete only', () => {
  test('hard-deleting a room or person that history points at fails instead of cascading', async () => {
    const rep = await createRep();
    const room = await createRoom();
    await insertBooking({ room_id: room.id, created_by: rep.user.id, start_time: futureSlot({ hour: 10 }).start });
    expect((await pgError(db.query('DELETE FROM rooms WHERE id = $1', [room.id]))).code).toBe('23503');
    expect((await pgError(db.query('DELETE FROM users WHERE id = $1', [rep.user.id]))).code).toBe('23503');
    expect((await db.query('SELECT count(*)::int AS n FROM bookings WHERE room_id = $1', [room.id])).rows[0].n).toBe(1);
  });

  test('no foreign key cascades or nulls on delete', async () => {
    const { rows } = await db.query(
      "SELECT conname FROM pg_constraint WHERE contype = 'f' AND connamespace = 'public'::regnamespace AND confdeltype IN ('c', 'n')");
    expect(rows).toEqual([]);
  });
});

describe('room names', () => {
  test('are unique among active rooms regardless of case', async () => {
    const room = await createRoom();
    const res = await request(app).post('/api/rooms').set('Authorization', admin.auth).send({ name: room.name.toLowerCase(), capacity: 10 });
    expect(res.status).toBe(409);
  });
});

describe('notifications', () => {
  test('one that is never emailed keeps no rendered email', async () => {
    const rep = await createRep();
    const before = process.env.EMAIL_DELIVERY;
    process.env.EMAIL_DELIVERY = 'off';
    try {
      const [n] = await db.runInTransaction((client) => notify(client, [{ userId: rep.user.id }], 'booking_cancelled',
        { roomName: 'R1', start: new Date().toISOString(), end: new Date().toISOString(), by: 'An administrator' }));
      const { rows: [row] } = await db.query('SELECT email_status, email_subject, email_html, title FROM notifications WHERE id = $1', [n.id]);
      expect(row).toMatchObject({ email_status: 'none', email_subject: null, email_html: null, title: expect.any(String) });
    } finally {
      if (before === undefined) delete process.env.EMAIL_DELIVERY; else process.env.EMAIL_DELIVERY = before;
    }
  });
});

describe('indexes', () => {
  test('PENDING room conflicts have their own partial index; the full-table range indexes are gone', async () => {
    const { rows } = await db.query("SELECT indexname FROM pg_indexes WHERE tablename = 'bookings' ORDER BY 1");
    const names = rows.map((r) => r.indexname);
    expect(names).toContain('idx_bookings_room_pending');
    expect(names).not.toContain('idx_bookings_range_gist');
    expect(names).not.toContain('idx_bookings_user_range');
  });
});
