// Phase 7: notifications are written in the same transaction as the change (outbox), shown in the
// in-app inbox, and emailed by the worker with retries.
import request from 'supertest';
import app from '../../src/server.js';
import * as db from '../../src/db.js';
import {
  createUser, createAdmin, createRep, createFaculty, createFacultyEntry, createRoom, insertBooking, futureSlot, closeDb,
} from '../../test/helpers/factories.js';
import { runEmailBatch, setEmailSender, MAX_ATTEMPTS } from '../../src/notifications/emailWorker.js';
import { render } from '../../src/notifications/templates.js';

afterAll(async () => { setEmailSender(null); await closeDb(); });

const api = (method, auth, path, body) => {
  const r = request(app)[method](path);
  if (auth) r.set('Authorization', auth);
  return body === undefined ? r.send() : r.send(body);
};
const notesFor = async ({ userId, email }) => (await db.query(
  `SELECT * FROM notifications WHERE ${userId ? 'user_id = $1' : 'lower(email) = lower($1)'} ORDER BY id`,
  [userId ?? email],
)).rows;
const types = (rows) => rows.map((n) => n.type);

describe('booking events', () => {
  test('a student request notifies the faculty (inbox + email), never with the purpose; the student gets nothing', async () => {
    const fac = await createFaculty();
    const rep = await createRep();
    const room = await createRoom();
    const slot = futureSlot({ hour: 10 });
    const res = await api('post', rep.auth, '/api/bookings', {
      room_id: room.id, start_time: slot.start, end_time: slot.end, purpose: 'TOP SECRET PURPOSE', faculty_id: fac.faculty.id,
    });
    expect(res.status).toBe(201);
    const [n] = await notesFor({ userId: fac.user.id });
    expect(n).toMatchObject({
      type: 'booking_requested', email: fac.user.email, email_status: 'pending', entity_type: 'booking', entity_id: res.body.id, link: '/faculty',
    });
    expect(n.title).toContain(rep.user.name);
    expect(n.body).toContain(room.name);
    for (const field of [n.title, n.body, n.email_subject, n.email_html]) expect(field).not.toContain('TOP SECRET');
    expect(await notesFor({ userId: rep.user.id })).toEqual([]);
  });

  test('a refused request (409) leaves no notification behind — written in the same transaction', async () => {
    const fac = await createFaculty();
    const rep = await createRep();
    const room = await createRoom();
    const slot = futureSlot({ hour: 11 });
    await insertBooking({ room_id: room.id, created_by: (await createRep()).user.id, start_time: slot.start });
    const res = await api('post', rep.auth, '/api/bookings', {
      room_id: room.id, start_time: slot.start, end_time: slot.end, purpose: 'x', faculty_id: fac.faculty.id,
    });
    expect(res.status).toBe(409);
    expect(await notesFor({ userId: fac.user.id })).toEqual([]);
  });

  test('approve → student notified; overlapping requests that lose the room are told too', async () => {
    const fac = await createFaculty();
    const room = await createRoom();
    const slot = futureSlot({ hour: 12 });
    const [a, b] = [await createRep(), await createRep()];
    const winner = await insertBooking({ room_id: room.id, created_by: a.user.id, start_time: slot.start, status: 'PENDING', faculty_id: fac.faculty.id });
    await insertBooking({ room_id: room.id, created_by: b.user.id, start_time: slot.start, status: 'PENDING', faculty_id: fac.faculty.id });
    expect((await api('patch', fac.auth, `/api/faculty/${winner.id}/approve`)).status).toBe(200);
    expect(types(await notesFor({ userId: a.user.id }))).toEqual(['booking_approved']);
    const [lost] = await notesFor({ userId: b.user.id });
    expect(lost.type).toBe('booking_rejected');
    expect(lost.body).toMatch(/given to another request/);
  });

  test('reject → student notified', async () => {
    const fac = await createFaculty();
    const rep = await createRep();
    const bk = await insertBooking({ room_id: (await createRoom()).id, created_by: rep.user.id, start_time: futureSlot({ hour: 13 }).start, status: 'PENDING', faculty_id: fac.faculty.id });
    expect((await api('patch', fac.auth, `/api/faculty/${bk.id}/reject`)).status).toBe(200);
    expect(types(await notesFor({ userId: rep.user.id }))).toEqual(['booking_rejected']);
  });

  test('a student withdrawing a request tells the faculty; an admin cancelling tells the booker and the faculty', async () => {
    const fac = await createFaculty();
    const rep = await createRep();
    const room = await createRoom();
    const p = await insertBooking({ room_id: room.id, created_by: rep.user.id, start_time: futureSlot({ hour: 14 }).start, status: 'PENDING', faculty_id: fac.faculty.id });
    expect((await api('patch', rep.auth, `/api/bookings/${p.id}/cancel`)).status).toBe(200);
    expect(types(await notesFor({ userId: fac.user.id }))).toEqual(['booking_request_withdrawn']);
    expect(await notesFor({ userId: rep.user.id })).toEqual([]); // the actor isn't notified

    const act = await insertBooking({ room_id: room.id, created_by: rep.user.id, start_time: futureSlot({ hour: 15 }).start, faculty_id: fac.faculty.id });
    const admin = await createAdmin();
    expect((await api('patch', admin.auth, `/api/bookings/${act.id}/cancel`)).status).toBe(200);
    expect(types(await notesFor({ userId: rep.user.id }))).toEqual(['booking_cancelled']);
    expect(types(await notesFor({ userId: fac.user.id }))).toEqual(['booking_request_withdrawn', 'supervised_booking_cancelled']);
  });

  test('removing a room tells its upcoming bookers why', async () => {
    const rep = await createRep();
    const room = await createRoom();
    await insertBooking({ room_id: room.id, created_by: rep.user.id, start_time: futureSlot({ hour: 16 }).start });
    expect((await api('delete', (await createAdmin()).auth, `/api/rooms/${room.id}`)).status).toBe(200);
    const [n] = await notesFor({ userId: rep.user.id });
    expect(n.type).toBe('booking_cancelled');
    expect(n.body).toContain(`room ${room.name} was removed`);
  });

  test('an admin quick-booking for someone tells them', async () => {
    const rep = await createRep();
    const room = await createRoom();
    const res = await api('post', (await createAdmin()).auth, '/api/bookings/admin/quick', {
      room_name: room.name, date: futureSlot({ hour: 17 }).dateKey, slot: 17, target_user_id: rep.user.id,
    });
    expect(res.status).toBe(201);
    expect(types(await notesFor({ userId: rep.user.id }))).toEqual(['booking_created_for_you']);
  });
});

describe('transfer events', () => {
  test('request → owner; accept (no faculty involved) → requester gets the room; the accepting owner is not told about their own action', async () => {
    const owner = await createUser({ role: 'STUDENT_REP' });
    const requester = await createUser({ role: 'ADMIN' }); // staff: no supervising faculty needed
    const bk = await insertBooking({ room_id: (await createRoom()).id, created_by: owner.user.id, start_time: futureSlot({ hour: 9, skip: 1 }).start });
    const reqRes = await api('post', requester.auth, '/api/transfers/request', { booking_id: bk.id });
    expect(reqRes.status).toBe(201);
    expect(types(await notesFor({ userId: owner.user.id }))).toEqual(['transfer_requested']);

    expect((await api('patch', owner.auth, `/api/transfers/${reqRes.body.transfer.id}/accept`)).status).toBe(200);
    expect(types(await notesFor({ userId: requester.user.id }))).toEqual(['transfer_completed']);
    expect(types(await notesFor({ userId: owner.user.id }))).toEqual(['transfer_requested']);
  });

  test('with faculty involved, each step notifies the next approver and the requester; the end tells everyone', async () => {
    const ownerFac = await createFaculty();
    const reqFac = await createFaculty();
    const owner = await createRep();
    const requester = await createRep();
    const bk = await insertBooking({ room_id: (await createRoom()).id, created_by: owner.user.id, start_time: futureSlot({ hour: 11, skip: 1 }).start, faculty_id: ownerFac.faculty.id });
    const t = (await api('post', requester.auth, '/api/transfers/request', { booking_id: bk.id, target_faculty_id: reqFac.faculty.id })).body.transfer;

    expect((await api('patch', owner.auth, `/api/transfers/${t.id}/accept`)).status).toBe(200);
    expect(types(await notesFor({ userId: ownerFac.user.id }))).toEqual(['transfer_needs_approval']);
    expect((await api('patch', ownerFac.auth, `/api/transfers/${t.id}/accept`)).status).toBe(200);
    expect(types(await notesFor({ userId: reqFac.user.id }))).toEqual(['transfer_needs_approval']);
    expect((await api('patch', reqFac.auth, `/api/transfers/${t.id}/accept`)).status).toBe(200);

    expect(types(await notesFor({ userId: requester.user.id }))).toEqual(['transfer_progress', 'transfer_progress', 'transfer_completed']);
    expect(types(await notesFor({ userId: owner.user.id }))).toEqual(['transfer_requested', 'transfer_completed_owner']);
  });

  test('a rejected request tells the requester; a withdrawn one tells the owner', async () => {
    const owner = await createRep();
    const requester = await createAdmin();
    const bk = await insertBooking({ room_id: (await createRoom()).id, created_by: owner.user.id, start_time: futureSlot({ hour: 10, skip: 1 }).start });
    const t1 = (await api('post', requester.auth, '/api/transfers/request', { booking_id: bk.id })).body.transfer;
    expect((await api('patch', owner.auth, `/api/transfers/${t1.id}/reject`)).status).toBe(200);
    expect(types(await notesFor({ userId: requester.user.id }))).toEqual(['transfer_rejected']);

    const other = await createAdmin();
    const t2 = (await api('post', other.auth, '/api/transfers/request', { booking_id: bk.id })).body.transfer;
    expect((await api('patch', other.auth, `/api/transfers/${t2.id}/reject`)).status).toBe(200);
    expect(types(await notesFor({ userId: owner.user.id }))).toEqual(['transfer_requested', 'transfer_requested', 'transfer_withdrawn']);
  });
});

describe('class cancellation events', () => {
  test('request → the class faculty; decision → the rep', async () => {
    const fac = await createFaculty();
    const rep = await createRep();
    const room = await createRoom();
    const date = futureSlot({ hour: 9 }).dateKey;
    const res = await api('post', rep.auth, '/api/timetable/cancellation-requests', {
      room_name: room.name, subject_name: 'Compilers', date, hour: 9, faculty_name: fac.faculty.name,
    });
    expect(res.status).toBe(201);
    const [n] = await notesFor({ userId: fac.user.id });
    expect(n).toMatchObject({ type: 'class_cancellation_requested' });
    expect(n.body).toContain(`Compilers in room ${room.name} on ${date}, 09:00 – 10:00`);

    expect((await api('patch', fac.auth, `/api/timetable/cancellation-requests/${res.body.request.id}/approve`)).status).toBe(200);
    const [d] = await notesFor({ userId: rep.user.id });
    expect(d.type).toBe('class_cancellation_decided');
    expect(d.title).toMatch(/approved/);
  });
});

describe('in-app inbox API', () => {
  const seed = (userId, n = 3) => Promise.all(Array.from({ length: n }, (_, i) => db.query(
    `INSERT INTO notifications (user_id, type, title, body) VALUES ($1, 'booking_approved', $2, 'b') RETURNING id`,
    [userId, `t${i}`],
  ).then((r) => Number(r.rows[0].id))));

  test('list / unread count / mark read / read all / dismiss — only ever your own', async () => {
    const me = await createRep();
    const other = await createRep();
    const [a, b, c] = (await seed(me.user.id)).sort((x, y) => x - y);
    const [theirs] = await seed(other.user.id, 1);

    const list = await api('get', me.auth, '/api/notifications');
    expect(list.status).toBe(200);
    expect(list.body.data.map((n) => Number(n.id))).toEqual([c, b, a]);
    expect(list.body.unread).toBe(3);
    expect(list.body.data[0]).not.toHaveProperty('email_html');

    expect((await api('patch', me.auth, `/api/notifications/${a}/read`)).body.read_at).toEqual(expect.any(String));
    expect((await api('get', me.auth, '/api/notifications/unread-count')).body).toEqual({ unread: 2 });
    expect((await api('get', me.auth, '/api/notifications?unread=true')).body.data).toHaveLength(2);

    expect((await api('patch', me.auth, `/api/notifications/${theirs}/read`)).status).toBe(404);
    expect((await api('delete', me.auth, `/api/notifications/${theirs}`)).status).toBe(404);

    expect((await api('post', me.auth, '/api/notifications/read-all')).body).toEqual({ updated: 2 });
    expect((await api('delete', me.auth, `/api/notifications/${b}`)).status).toBe(200);
    expect((await api('get', me.auth, '/api/notifications')).body.data.map((n) => Number(n.id))).toEqual([c, a]);
    // Soft delete: the row stays.
    expect((await db.query('SELECT is_active FROM notifications WHERE id = $1', [b])).rows[0]).toEqual({ is_active: false });
    expect((await api('get', other.auth, '/api/notifications/unread-count')).body).toEqual({ unread: 1 });
  });

  test('a faculty member without an account yet is emailed, and sees it in the inbox on first sign-in', async () => {
    const email = `nofac.${Date.now()}@nsut.ac.in`;
    const entry = await createFacultyEntry({ name: 'Prof No Account', email });
    const rep = await createRep();
    const slot = futureSlot({ hour: 10, skip: 2 });
    const res = await api('post', rep.auth, '/api/bookings', {
      room_id: (await createRoom()).id, start_time: slot.start, end_time: slot.end, purpose: 'x', faculty_id: entry.id,
    });
    expect(res.status).toBe(201);
    const [n] = await notesFor({ email });
    expect(n).toMatchObject({ user_id: null, type: 'booking_requested', email_status: 'pending' });
    const later = await createUser({ role: 'FACULTY', email, name: 'Prof No Account' });
    expect((await api('get', later.auth, '/api/notifications')).body.data.map((x) => x.type)).toEqual(['booking_requested']);
  });

  test('401 without a session', async () => {
    expect((await api('get', null, '/api/notifications')).status).toBe(401);
  });
});

describe('email outbox worker', () => {
  const queue = async () => {
    const u = await createRep();
    const { rows: [n] } = await db.query(
      `INSERT INTO notifications (user_id, email, type, title, body, email_status, email_subject, email_html, email_next_at)
       VALUES ($1, $2, 'booking_approved', 't', 'b', 'pending', 'Subject', '<p>x</p>', NOW() - interval '1 second') RETURNING id`,
      [u.user.id, u.user.email],
    );
    return n.id;
  };
  const row = async (id) => (await db.query('SELECT * FROM notifications WHERE id = $1', [id])).rows[0];
  const drain = async () => db.query(`UPDATE notifications SET email_status = 'sent' WHERE email_status IN ('pending', 'sending')`);

  beforeEach(drain);

  test('sends due messages and marks them sent', async () => {
    const id = await queue();
    const sent = [];
    setEmailSender(async (to, subject, html) => { sent.push({ to, subject, html }); });
    expect(await runEmailBatch()).toMatchObject({ sent: 1 });
    expect(sent).toEqual([expect.objectContaining({ subject: 'Subject', html: '<p>x</p>' })]);
    expect(await row(id)).toMatchObject({ email_status: 'sent', email_attempts: 1, email_last_error: null });
  });

  test('a failure is retried later with backoff; after the last attempt it is marked failed', async () => {
    const id = await queue();
    setEmailSender(async () => { throw new Error('SMTP 421 try later'); });
    expect(await runEmailBatch()).toMatchObject({ retried: 1 });
    let r = await row(id);
    expect(r).toMatchObject({ email_status: 'pending', email_attempts: 1, email_last_error: 'SMTP 421 try later' });
    expect(new Date(r.email_next_at).getTime()).toBeGreaterThan(Date.now() + 30_000);
    expect(await runEmailBatch()).toMatchObject({ retried: 0 }); // not due yet

    await db.query(`UPDATE notifications SET email_attempts = $2, email_next_at = NOW() WHERE id = $1`, [id, MAX_ATTEMPTS - 1]);
    expect(await runEmailBatch()).toMatchObject({ failed: 1 });
    r = await row(id);
    expect(r).toMatchObject({ email_status: 'failed', email_attempts: MAX_ATTEMPTS });
  });

  test('a message stuck in "sending" (process died mid-send) is picked up again', async () => {
    const id = await queue();
    await db.query(`UPDATE notifications SET email_status = 'sending', email_next_at = NOW() - interval '11 minutes' WHERE id = $1`, [id]);
    setEmailSender(async () => {});
    expect(await runEmailBatch()).toMatchObject({ sent: 1 });
    expect((await row(id)).email_status).toBe('sent');
  });

  test('without SMTP configured (development) messages are logged, not lost or retried forever', async () => {
    const id = await queue();
    setEmailSender(null);
    const saved = [process.env.SMTP_USER, process.env.SMTP_PASS];
    delete process.env.SMTP_USER; delete process.env.SMTP_PASS;
    try {
      expect(await runEmailBatch()).toMatchObject({ logged: 1 });
      expect((await row(id)).email_status).toBe('logged');
    } finally {
      if (saved[0] !== undefined) process.env.SMTP_USER = saved[0];
      if (saved[1] !== undefined) process.env.SMTP_PASS = saved[1];
    }
  });
});

describe('templates', () => {
  test('every value in the email HTML is escaped; the subject has no line breaks', () => {
    const t = render('booking_requested', {
      studentName: '<script>alert(1)</script>\r\nBcc: x@evil', roomName: 'R&D', date: 'Tue, 20 Oct 2026', time: '10:00 – 11:00',
    });
    expect(t.html).not.toContain('<script>');
    expect(t.html).toContain('&lt;script&gt;');
    expect(t.html).toContain('R&amp;D');
    expect(t.subject).not.toMatch(/[\r\n]/);
  });

  test('links point at APP_URL when set', () => {
    process.env.APP_URL = 'https://cras.example.edu/';
    try {
      expect(render('booking_approved', { roomName: 'R1', date: 'd', time: 't', by: 'Prof' }).html)
        .toContain('href="https://cras.example.edu/bookings"');
    } finally {
      delete process.env.APP_URL;
    }
  });
});
