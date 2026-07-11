import request from 'supertest';
import app from '../src/server.js';
import * as db from '../src/db.js';
import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET || 'dev_secret_fallback_only';

describe('Rooms & Availability Integration Tests', () => {
  let token;
  let userId;
  let roomId;

  beforeAll(async () => {
    // Setup mock user
    const res = await db.query(
      "INSERT INTO users (name, email, password, role) VALUES ('Test Rep', 'rep@nsut.ac.in', 'hash', 'STUDENT_REP') RETURNING id"
    );
    userId = res.rows[0].id;
    token = jwt.sign({ id: userId, email: 'rep@nsut.ac.in', role: 'STUDENT_REP' }, JWT_SECRET);

    // Setup mock room
    const roomRes = await db.query(
      "INSERT INTO rooms (name, capacity, has_ac, has_projector, building, floor) VALUES ('Test-101', 60, true, true, '5th Block', 1) RETURNING id"
    );
    roomId = roomRes.rows[0].id;
  });

  afterAll(async () => {
    // Cleanup
    await db.query("DELETE FROM room_availability WHERE room_id = $1", [roomId]);
    await db.query("DELETE FROM rooms WHERE id = $1", [roomId]);
    await db.query("DELETE FROM users WHERE id = $1", [userId]);
    await db.pool.end();
  });

  describe('GET /api/rooms', () => {
    it('should list rooms matching filter criteria', async () => {
      const res = await request(app)
        .get('/api/rooms')
        .set('Authorization', `Bearer ${token}`)
        .query({ capacity: 50, ac: 'true', projector: 'true' });

      expect(res.statusCode).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
      const testRoom = res.body.find(r => r.id === roomId);
      expect(testRoom).toBeDefined();
      expect(testRoom.name).toBe('Test-101');
    });
  });

  describe('GET /api/availability', () => {
    it('should fetch room availability entries', async () => {
      const res = await request(app)
        .get('/api/availability')
        .set('Authorization', `Bearer ${token}`);

      expect(res.statusCode).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
    });
  });

  describe('POST /api/availability/override', () => {
    it('should allow student rep to set custom override', async () => {
      const res = await request(app)
        .post('/api/availability/override')
        .set('Authorization', `Bearer ${token}`)
        .send({
          room_name: 'Test-101',
          day: 'Mon',
          hour: 9,
          is_available: false
        });

      expect(res.statusCode).toBe(200);
      expect(res.body.status).toBe('Success');
    });
  });
});
