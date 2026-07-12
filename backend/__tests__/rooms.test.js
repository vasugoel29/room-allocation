import request from 'supertest';
import app from '../src/server.js';
import * as db from '../src/db.js';
import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET || 'dev_secret_fallback_only';

describe('Rooms & Availability Integration Tests', () => {
  let token;
  let userId;
  let roomId;
  let adminToken;
  let adminId;

  beforeAll(async () => {
    // Clean up existing mock users and rooms
    await db.query("DELETE FROM users WHERE email IN ('rep@nsut.ac.in', 'admin-test@nsut.ac.in')");
    await db.query("DELETE FROM rooms WHERE name = 'Test-101'");

    // Setup mock user
    const res = await db.query(
      "INSERT INTO users (name, email, password, role) VALUES ('Test Rep', 'rep@nsut.ac.in', 'hash', 'STUDENT_REP') RETURNING id"
    );
    userId = res.rows[0].id;
    token = jwt.sign({ id: userId, email: 'rep@nsut.ac.in', role: 'STUDENT_REP' }, JWT_SECRET);

    // Setup mock admin
    const adminRes = await db.query(
      "INSERT INTO users (name, email, password, role) VALUES ('Test Admin', 'admin-test@nsut.ac.in', 'hash', 'ADMIN') RETURNING id"
    );
    adminId = adminRes.rows[0].id;
    adminToken = jwt.sign({ id: adminId, email: 'admin-test@nsut.ac.in', role: 'ADMIN' }, JWT_SECRET);

    // Setup mock room
    const roomRes = await db.query(
      "INSERT INTO rooms (name, capacity, has_ac, has_projector, building, floor) VALUES ('Test-101', 60, true, true, '5th Block', 1) RETURNING id"
    );
    roomId = roomRes.rows[0].id;
  });

  afterAll(async () => {
    // Cleanup
    await db.query("DELETE FROM room_availability WHERE room_id = $1", [roomId]);
    await db.query("DELETE FROM rooms WHERE name = 'Test-101'");
    await db.query("DELETE FROM rooms WHERE id = $1", [roomId]);
    await db.query("DELETE FROM users WHERE id IN ($1, $2)", [userId, adminId]);
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

  describe('Student booking access control', () => {
    it('should block student from booking a room with student_access = false', async () => {
      // Set Test-101 student_access to false first
      await db.query("UPDATE rooms SET student_access = false WHERE id = $1", [roomId]);

      const res = await request(app)
        .post('/api/bookings')
        .set('Authorization', `Bearer ${token}`)
        .send({
          room_id: roomId,
          start_time: new Date(Date.now() + 86400000).toISOString(),
          end_time: new Date(Date.now() + 86400000 + 3600000).toISOString(),
          purpose: 'Group Study Session'
        });

      expect(res.statusCode).toBe(403);
      expect(res.body.error).toBe('Students do not have permission to book this room');

      // Reset
      await db.query("UPDATE rooms SET student_access = true WHERE id = $1", [roomId]);
    });
  });

  describe('Room CRUD operations by Admin', () => {
    let newRoomId;

    it('should allow admin to create a room', async () => {
      const res = await request(app)
        .post('/api/rooms')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          name: 'CRUD-Room-99',
          building: 'Block IV',
          floor: 2,
          capacity: 45,
          type: 'Lab',
          has_ac: true,
          has_projector: false,
          description: 'A mock classroom description',
          student_access: false
        });

      expect(res.statusCode).toBe(201);
      expect(res.body.name).toBe('CRUD-Room-99');
      expect(res.body.description).toBe('A mock classroom description');
      expect(res.body.student_access).toBe(false);
      newRoomId = res.body.id;
    });

    it('should prevent non-admins from creating a room', async () => {
      const res = await request(app)
        .post('/api/rooms')
        .set('Authorization', `Bearer ${token}`)
        .send({
          name: 'CRUD-Room-Unauth',
          capacity: 45
        });

      expect(res.statusCode).toBe(403);
    });

    it('should allow admin to update a room', async () => {
      const res = await request(app)
        .patch(`/api/rooms/${newRoomId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          name: 'CRUD-Room-99-Updated',
          building: 'Block IV',
          floor: 2,
          capacity: 50,
          type: 'Lecture Room',
          has_ac: true,
          has_projector: true,
          description: 'Updated mock classroom description',
          student_access: true
        });

      expect(res.statusCode).toBe(200);
      expect(res.body.capacity).toBe(50);
      expect(res.body.name).toBe('CRUD-Room-99-Updated');
      expect(res.body.description).toBe('Updated mock classroom description');
      expect(res.body.student_access).toBe(true);
    });

    it('should prevent non-admins from updating a room', async () => {
      const res = await request(app)
        .patch(`/api/rooms/${newRoomId}`)
        .set('Authorization', `Bearer ${token}`)
        .send({
          capacity: 60
        });

      expect(res.statusCode).toBe(403);
    });

    it('should allow admin to delete a room', async () => {
      const res = await request(app)
        .delete(`/api/rooms/${newRoomId}`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.statusCode).toBe(200);
      expect(res.body.status).toBe('Success');
    });

    it('should prevent non-admins from deleting a room', async () => {
      const res = await request(app)
        .delete(`/api/rooms/${newRoomId || 999}`)
        .set('Authorization', `Bearer ${token}`);

      expect(res.statusCode).toBe(403);
    });

    afterAll(async () => {
      await db.query("DELETE FROM users WHERE email IN ('rep@nsut.ac.in', 'admin-test@nsut.ac.in')");
      await db.query("DELETE FROM rooms WHERE name = 'Test-101'");
    });
  });
});
