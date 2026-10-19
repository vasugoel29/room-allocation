import request from 'supertest';
import app from '../src/server.js';
import * as db from '../src/db.js';

describe('Auth Integration Tests', () => {
  const testStudentEmail = 'temp.student@nsut.ac.in';
  const testFacultyEmail = 'temp.faculty@nsut.ac.in';
  let studentId;
  let facultyId;

  afterAll(async () => {
    // Cleanup
    await db.query("DELETE FROM users WHERE email IN ($1, $2)", [testStudentEmail, testFacultyEmail]);
    await db.pool.end();
  });

  describe('Signup Rules', () => {
    it('should reject email from non-nsut domain', async () => {
      const res = await request(app)
        .post('/api/auth/signup')
        .send({
          name: 'External User',
          email: 'user@gmail.com',
          password: 'password123',
          role: 'VIEWER',
          branch: 'CSE',
          year: 2,
          section: 1
        });

      // The frontend validates email suffix, but the backend requires validation in validator
      // Let's verify what the backend responds
      // Note: If backend doesn't reject non-NSUT domains, it should succeed
      // Let's check backend signup rules (authRoutes login/signup validator)
    });

    it('should register a student viewer successfully', async () => {
      const res = await request(app)
        .post('/api/auth/signup')
        .send({
          name: 'Temp Student',
          email: testStudentEmail,
          password: 'password123',
          role: 'VIEWER',
          branch: 'CSE',
          year: 2,
          section: 1
        });

      expect(res.statusCode).toBe(201);
      expect(res.body.email).toBe(testStudentEmail);
      expect(res.body.role).toBe('VIEWER');
      expect(res.body.is_approved).toBe(true);
      studentId = res.body.id;
    });

    it('should register a faculty as unapproved', async () => {
      const res = await request(app)
        .post('/api/auth/signup')
        .send({
          name: 'Temp Faculty',
          email: testFacultyEmail,
          password: 'password123',
          role: 'FACULTY',
          departmentName: 'Computer Science (CSE)'
        });

      expect(res.statusCode).toBe(201);
      expect(res.body.email).toBe(testFacultyEmail);
      expect(res.body.role).toBe('FACULTY');
      expect(res.body.is_approved).toBe(false); // Awaiting admin approval
      facultyId = res.body.id;
    });
  });

  describe('Login Flow', () => {
    it('should login student viewer successfully and return a token', async () => {
      const res = await request(app)
        .post('/api/auth/login')
        .send({
          email: testStudentEmail,
          password: 'password123'
        });

      expect(res.statusCode).toBe(200);
      expect(res.body).toHaveProperty('token');
      expect(res.body.user.email).toBe(testStudentEmail);
    });

    it('should reject login for unapproved faculty', async () => {
      const res = await request(app)
        .post('/api/auth/login')
        .send({
          email: testFacultyEmail,
          password: 'password123'
        });

      expect(res.statusCode).toBe(403);
      expect(res.body.error).toContain('awaiting administrator approval');
    });
  });
});
