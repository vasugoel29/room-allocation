// Migration v26: the database itself enforces "one commitment per slot" (BKG-02/09), independent of
// the service checks. Rows are inserted directly, bypassing every business rule.
import * as db from '../../src/db.js';
import { createRep, createRoom, createFacultyEntry, insertBooking, futureSlot, closeDb } from '../../test/helpers/factories.js';
import { plusHours } from '../../test/helpers/bookings.js';

afterAll(closeDb);

const violation = (constraint, code = '23P01') => expect.objectContaining({ code, constraint });

let slot;
beforeAll(() => { slot = futureSlot({ hour: 10 }); });
const overlapping = () => ({ start_time: plusHours(slot.start, 0.5), end_time: plusHours(slot.start, 1.5) });
const adjacent = () => ({ start_time: slot.end, end_time: plusHours(slot.end) });

test('migrations v26 and v27 are recorded', async () => {
  const { rows } = await db.query('SELECT version FROM schema_migrations WHERE version IN (26, 27) ORDER BY version');
  expect(rows.map((r) => r.version)).toEqual([26, 27]);
});

describe('bookings_no_room_overlap (ACTIVE bookings of one room)', () => {
  test('a second overlapping ACTIVE booking of the same room is refused, by anyone', async () => {
    const room = await createRoom();
    await insertBooking({ room_id: room.id, created_by: (await createRep()).user.id, start_time: slot.start, end_time: slot.end });
    for (const s of [{ start_time: slot.start, end_time: slot.end }, overlapping()]) {
      await expect(insertBooking({ room_id: room.id, created_by: (await createRep()).user.id, ...s }))
        .rejects.toEqual(violation(s.start_time === slot.start ? 'idx_room_slot_active' : 'bookings_no_room_overlap', s.start_time === slot.start ? '23505' : '23P01'));
    }
  });

  test('a different-start overlap is caught by the exclusion constraint itself', async () => {
    const room = await createRoom();
    await insertBooking({ room_id: room.id, created_by: (await createRep()).user.id, start_time: slot.start, end_time: plusHours(slot.start, 2) });
    await expect(insertBooking({ room_id: room.id, created_by: (await createRep()).user.id, start_time: plusHours(slot.start, 1), end_time: plusHours(slot.start, 3) }))
      .rejects.toEqual(violation('bookings_no_room_overlap'));
  });

  test('adjacent bookings, other rooms, and PENDING/CANCELLED/REJECTED rows are allowed', async () => {
    const room = await createRoom();
    await insertBooking({ room_id: room.id, created_by: (await createRep()).user.id, start_time: slot.start, end_time: slot.end });
    await insertBooking({ room_id: room.id, created_by: (await createRep()).user.id, ...adjacent() });
    await insertBooking({ room_id: (await createRoom()).id, created_by: (await createRep()).user.id, ...overlapping() });
    for (const status of ['PENDING', 'CANCELLED', 'REJECTED']) {
      await insertBooking({ room_id: room.id, created_by: (await createRep()).user.id, ...overlapping(), status });
    }
    const { rows } = await db.query('SELECT status FROM bookings WHERE room_id = $1 ORDER BY id', [room.id]);
    expect(rows.map((r) => r.status)).toEqual(['ACTIVE', 'ACTIVE', 'PENDING', 'CANCELLED', 'REJECTED']);
  });

  test('re-activating a cancelled booking into an occupied slot is refused too', async () => {
    const room = await createRoom();
    const old = await insertBooking({ room_id: room.id, created_by: (await createRep()).user.id, ...overlapping(), status: 'CANCELLED' });
    await insertBooking({ room_id: room.id, created_by: (await createRep()).user.id, start_time: slot.start, end_time: slot.end });
    await expect(db.query(`UPDATE bookings SET status = 'ACTIVE' WHERE id = $1`, [old.id])).rejects.toEqual(violation('bookings_no_room_overlap'));
  });
});

describe('bookings_no_person_overlap (ACTIVE or PENDING bookings created by one person)', () => {
  test.each([
    ['ACTIVE', 'ACTIVE'],
    ['ACTIVE', 'PENDING'],
    ['PENDING', 'ACTIVE'],
    ['PENDING', 'PENDING'],
  ])('%s then overlapping %s by the same creator in another room → refused', async (first, second) => {
    const rep = await createRep();
    await insertBooking({ room_id: (await createRoom()).id, created_by: rep.user.id, start_time: slot.start, end_time: slot.end, status: first });
    await expect(insertBooking({ room_id: (await createRoom()).id, created_by: rep.user.id, ...overlapping(), status: second }))
      .rejects.toEqual(violation('bookings_no_person_overlap'));
  });

  test('the same creator may hold adjacent bookings and overlapping CANCELLED/REJECTED rows', async () => {
    const rep = await createRep();
    await insertBooking({ room_id: (await createRoom()).id, created_by: rep.user.id, start_time: slot.start, end_time: slot.end, status: 'PENDING' });
    await insertBooking({ room_id: (await createRoom()).id, created_by: rep.user.id, ...adjacent() });
    await insertBooking({ room_id: (await createRoom()).id, created_by: rep.user.id, ...overlapping(), status: 'CANCELLED' });
    await insertBooking({ room_id: (await createRoom()).id, created_by: rep.user.id, ...overlapping(), status: 'REJECTED' });
    const { rows } = await db.query('SELECT 1 FROM bookings WHERE created_by = $1', [rep.user.id]);
    expect(rows).toHaveLength(4);
  });
});

describe('bookings_no_faculty_overlap (ACTIVE bookings supervised by one faculty member)', () => {
  test('two overlapping ACTIVE bookings with the same faculty_id are refused (different rooms and students)', async () => {
    const fac = await createFacultyEntry();
    await insertBooking({ room_id: (await createRoom()).id, created_by: (await createRep()).user.id, start_time: slot.start, end_time: slot.end, faculty_id: fac.id });
    await expect(insertBooking({ room_id: (await createRoom()).id, created_by: (await createRep()).user.id, ...overlapping(), faculty_id: fac.id }))
      .rejects.toEqual(violation('bookings_no_faculty_overlap'));
  });

  test('overlapping PENDING requests to the same faculty member are allowed (they choose one)', async () => {
    const fac = await createFacultyEntry();
    await insertBooking({ room_id: (await createRoom()).id, created_by: (await createRep()).user.id, start_time: slot.start, end_time: slot.end, faculty_id: fac.id });
    for (let i = 0; i < 2; i++) {
      await insertBooking({ room_id: (await createRoom()).id, created_by: (await createRep()).user.id, ...overlapping(), faculty_id: fac.id, status: 'PENDING' });
    }
    // ...but approving one of them now would violate the constraint.
    const { rows: [p] } = await db.query(`SELECT id FROM bookings WHERE faculty_id = $1 AND status = 'PENDING' LIMIT 1`, [fac.id]);
    await expect(db.query(`UPDATE bookings SET status = 'ACTIVE' WHERE id = $1`, [p.id])).rejects.toEqual(violation('bookings_no_faculty_overlap'));
  });

  test('bookings without a faculty are not constrained by it', async () => {
    for (let i = 0; i < 2; i++) {
      await insertBooking({ room_id: (await createRoom()).id, created_by: (await createRep()).user.id, start_time: slot.start, end_time: slot.end });
    }
  });
});

describe('bookings_time_order (end_time > start_time)', () => {
  test.each([['end before start', -1], ['zero length', 0]])('%s → check violation 23514, whatever the status', async (_n, h) => {
    for (const status of ['ACTIVE', 'CANCELLED']) {
      await expect(insertBooking({
        room_id: (await createRoom()).id, created_by: (await createRep()).user.id, start_time: slot.start, end_time: plusHours(slot.start, h), status,
      })).rejects.toEqual(violation('bookings_time_order', '23514'));
    }
  });
});

describe('room_slot_releases (v26) and reschedule columns (v27)', () => {
  test.each([
    ['start_hour 24', 24, 25],
    ['end_hour 25', 10, 25],
    ['end_hour == start_hour', 10, 10],
  ])('release with %s is refused', async (_n, start_hour, end_hour) => {
    const room = await createRoom();
    await expect(db.query(
      `INSERT INTO room_slot_releases (room_id, release_date, start_hour, end_hour, source_type) VALUES ($1, '2030-01-07', $2, $3, 'test')`,
      [room.id, start_hour, end_hour],
    )).rejects.toEqual(expect.objectContaining({ code: '23514' }));
  });

  test('bookings.reschedule_hour must be 0–23', async () => {
    const b = await insertBooking({ room_id: (await createRoom()).id, created_by: (await createRep()).user.id, start_time: slot.start, end_time: slot.end, status: 'CANCELLED' });
    await expect(db.query('UPDATE bookings SET reschedule_hour = 24 WHERE id = $1', [b.id])).rejects.toEqual(expect.objectContaining({ code: '23514' }));
    await db.query('UPDATE bookings SET reschedule_hour = 23, reschedule_date = $2 WHERE id = $1', [b.id, '2030-01-07']);
  });
});
