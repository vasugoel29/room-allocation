import request from 'supertest';
import app from '../src/server.js';
import * as db from '../src/db.js';
import jwt from 'jsonwebtoken';

const JWT_SECRET = 'your_jwt_secret';
let token;
let userId;

beforeAll(async () => {
  // Enforce schema sync
  await db.query(`
    ALTER TABLE bookings 
    ADD COLUMN IF NOT EXISTS status VARCHAR(20) DEFAULT 'ACTIVE',
    ADD COLUMN IF NOT EXISTS is_semester_booking BOOLEAN DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS cancelled_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW(),
    ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW()
  `);
  
  // Setup a test user
  await db.query("DELETE FROM users WHERE email = 'test@example.com'");
  const res = await db.query(
    "INSERT INTO users (name, email, password, role) VALUES ('Test User', 'test@example.com', 'hash', 'STUDENT_REP') RETURNING id"
  );
  userId = res.rows[0].id;
  token = jwt.sign({ id: userId, email: 'test@example.com', role: 'STUDENT_REP' }, JWT_SECRET);
  
  // Ensure we have a room
  await db.query("INSERT INTO rooms (id, name, capacity) VALUES (999, 'Test Room', 50) ON CONFLICT DO NOTHING");
}, 30000);


afterAll(async () => {
  await db.query("DELETE FROM bookings WHERE created_by = $1", [userId]);
  await db.query("DELETE FROM users WHERE id = $1", [userId]);
  await db.pool.end();
});

describe('Booking Constraints', () => {
  test('Should reject backdated booking', async () => {
    const pastDate = new Date();
    pastDate.setHours(pastDate.getHours() - 2);
    
    const res = await request(app)
      .post('/api/bookings')
      .set('Authorization', `Bearer ${token}`)
      .send({
        room_id: 999,
        start_time: pastDate.toISOString(),
        end_time: new Date(pastDate.getTime() + 3600000).toISOString(),
        purpose: 'Test'
      });
    
    expect(res.statusCode).toBe(400);
    expect(res.body.error).toBe('Cannot book in the past');
  });

  test('Should reject regular booking > 7 days in future', async () => {
    const futureDate = new Date();
    futureDate.setDate(futureDate.getDate() + 10);
    
    const res = await request(app)
      .post('/api/bookings')
      .set('Authorization', `Bearer ${token}`)
      .send({
        room_id: 999,
        start_time: futureDate.toISOString(),
        end_time: new Date(futureDate.getTime() + 3600000).toISOString(),
        purpose: 'Test'
      });
    
    expect(res.statusCode).toBe(400);
    expect(res.body.error).toBe('Regular bookings allowed only for the current week');
  });

  test('Should reject double booking for same room and time', async () => {
    const futureDate = new Date();
    futureDate.setDate(futureDate.getDate() + 2);
    futureDate.setHours(14, 0, 0, 0);
    const start = futureDate.toISOString();
    const end = new Date(futureDate.getTime() + 3600000).toISOString();

    // First booking
    await request(app)
      .post('/api/bookings')
      .set('Authorization', `Bearer ${token}`)
      .send({ room_id: 999, start_time: start, end_time: end, purpose: 'First' });

    // Conflicting booking
    const res = await request(app)
      .post('/api/bookings')
      .set('Authorization', `Bearer ${token}`)
      .send({ room_id: 999, start_time: start, end_time: end, purpose: 'Conflict' });

    expect(res.statusCode).toBe(409);
    expect(res.body.error).toBe('Room is already booked for this time period');
  });

  test('Should reject semester booking if any week has conflict', async () => {
    const futureDate = new Date();
    futureDate.setDate(futureDate.getDate() + 4); // Future enough to not conflict with previous test
    futureDate.setHours(10, 0, 0, 0); 
    
    const conflictDate = new Date(futureDate);
    conflictDate.setDate(conflictDate.getDate() + (2 * 7)); 
    await db.query(
      "INSERT INTO bookings (room_id, start_time, end_time, created_by, status) VALUES (999, $1, $2, $3, 'ACTIVE')",
      [conflictDate.toISOString(), new Date(conflictDate.getTime() + 3600000).toISOString(), userId]
    );

    const res = await request(app)
      .post('/api/bookings/semester')
      .set('Authorization', `Bearer ${token}`)
      .send({
        room_id: 999,
        start_time: futureDate.toISOString(),
        end_time: new Date(futureDate.getTime() + 3600000).toISOString(),
        purpose: 'Semester Test'
      });

    expect(res.statusCode).toBe(409);
    expect(res.body.error).toContain('Conflict at week 3');

    const check = await db.query("SELECT * FROM bookings WHERE room_id = 999 AND start_time = $1", [futureDate.toISOString()]);
    expect(check.rows.length).toBe(0);
  });

  test('Should allow user to cancel their own booking', async () => {
    const futureDate = new Date();
    futureDate.setDate(futureDate.getDate() + 5);
    const start = futureDate.toISOString();
    
    const createRes = await request(app)
      .post('/api/bookings')
      .set('Authorization', `Bearer ${token}`)
      .send({ room_id: 999, start_time: start, end_time: new Date(futureDate.getTime() + 3600000).toISOString(), purpose: 'To Cancel' });
    
    const bookingId = createRes.body.id;

    const res = await request(app)
      .patch(`/api/bookings/${bookingId}/cancel`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.statusCode).toBe(200);
    expect(res.body.status).toBe('Success');
  });
});
