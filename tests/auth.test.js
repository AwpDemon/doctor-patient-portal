const request = require('supertest');
const path = require('path');
const fs = require('fs');

// Use a test database
const testDbPath = path.join(__dirname, '..', 'data', 'test.db');
process.env.DB_PATH = testDbPath;
process.env.NODE_ENV = 'test';
process.env.SESSION_SECRET = 'test-secret';

// Remove old test DB before importing app (which initializes DB)
try { fs.unlinkSync(testDbPath); } catch (e) { /* ignore */ }
try { fs.unlinkSync(testDbPath + '-wal'); } catch (e) { /* ignore */ }
try { fs.unlinkSync(testDbPath + '-shm'); } catch (e) { /* ignore */ }

const app = require('../server');
const { getDatabase, closeDatabase } = require('../config/db');

let agent;

beforeAll(async () => {
  agent = request.agent(app);
});

afterAll(() => {
  closeDatabase();
  // Clean up test DB
  try { fs.unlinkSync(testDbPath); } catch (e) { /* ignore */ }
  try { fs.unlinkSync(testDbPath + '-wal'); } catch (e) { /* ignore */ }
  try { fs.unlinkSync(testDbPath + '-shm'); } catch (e) { /* ignore */ }
});

describe('Auth Routes', () => {

  // ============================================================
  // Registration
  // ============================================================
  describe('POST /api/auth/register', () => {
    it('should register a new patient account', async () => {
      const res = await agent
        .post('/api/auth/register')
        .send({
          email: 'test.patient@example.com',
          password: 'TestPass123',
          first_name: 'Test',
          last_name: 'Patient',
          role: 'patient',
        });

      expect(res.statusCode).toBe(201);
      expect(res.body.user).toBeDefined();
      expect(res.body.user.email).toBe('test.patient@example.com');
      expect(res.body.user.role).toBe('patient');
    });

    it('should register a new doctor account', async () => {
      const res = await agent
        .post('/api/auth/register')
        .send({
          email: 'test.doctor@example.com',
          password: 'TestPass123',
          first_name: 'Test',
          last_name: 'Doctor',
          role: 'doctor',
        });

      expect(res.statusCode).toBe(201);
      expect(res.body.user.role).toBe('doctor');
    });

    it('should reject duplicate email', async () => {
      const res = await agent
        .post('/api/auth/register')
        .send({
          email: 'test.patient@example.com',
          password: 'TestPass123',
          first_name: 'Duplicate',
          last_name: 'User',
          role: 'patient',
        });

      expect(res.statusCode).toBe(409);
      expect(res.body.error).toContain('already exists');
    });

    it('should reject weak password', async () => {
      const res = await agent
        .post('/api/auth/register')
        .send({
          email: 'weak.password@example.com',
          password: '123',
          first_name: 'Weak',
          last_name: 'Pass',
          role: 'patient',
        });

      expect(res.statusCode).toBe(400);
    });

    it('should reject invalid email', async () => {
      const res = await agent
        .post('/api/auth/register')
        .send({
          email: 'not-an-email',
          password: 'TestPass123',
          first_name: 'Bad',
          last_name: 'Email',
          role: 'patient',
        });

      expect(res.statusCode).toBe(400);
    });

    it('should reject missing required fields', async () => {
      const res = await agent
        .post('/api/auth/register')
        .send({
          email: 'missing.fields@example.com',
        });

      expect(res.statusCode).toBe(400);
    });
  });

  // ============================================================
  // Login
  // ============================================================
  describe('POST /api/auth/login', () => {
    it('should login with valid credentials', async () => {
      const res = await agent
        .post('/api/auth/login')
        .send({
          email: 'test.patient@example.com',
          password: 'TestPass123',
        });

      expect(res.statusCode).toBe(200);
      expect(res.body.user).toBeDefined();
      expect(res.body.user.email).toBe('test.patient@example.com');
      expect(res.body.message).toBe('Login successful.');
    });

    it('should reject invalid password', async () => {
      const res = await agent
        .post('/api/auth/login')
        .send({
          email: 'test.patient@example.com',
          password: 'WrongPassword123',
        });

      expect(res.statusCode).toBe(401);
      expect(res.body.error).toContain('Invalid');
    });

    it('should reject non-existent email', async () => {
      const res = await agent
        .post('/api/auth/login')
        .send({
          email: 'nonexistent@example.com',
          password: 'TestPass123',
        });

      expect(res.statusCode).toBe(401);
    });
  });

  // ============================================================
  // Session
  // ============================================================
  describe('GET /api/auth/session', () => {
    it('should return authenticated session for logged-in user', async () => {
      // Login first
      await agent
        .post('/api/auth/login')
        .send({
          email: 'test.patient@example.com',
          password: 'TestPass123',
        });

      const res = await agent.get('/api/auth/session');

      expect(res.statusCode).toBe(200);
      expect(res.body.authenticated).toBe(true);
      expect(res.body.user).toBeDefined();
    });
  });

  // ============================================================
  // Get Current User
  // ============================================================
  describe('GET /api/auth/me', () => {
    it('should return current user profile', async () => {
      await agent
        .post('/api/auth/login')
        .send({
          email: 'test.patient@example.com',
          password: 'TestPass123',
        });

      const res = await agent.get('/api/auth/me');

      expect(res.statusCode).toBe(200);
      expect(res.body.user).toBeDefined();
      expect(res.body.user.first_name).toBe('Test');
      expect(res.body.user.last_name).toBe('Patient');
    });
  });

  // ============================================================
  // Password Reset Flow
  // ============================================================
  describe('Password Reset', () => {
    it('should generate reset token', async () => {
      const res = await agent
        .post('/api/auth/forgot-password')
        .send({ email: 'test.patient@example.com' });

      expect(res.statusCode).toBe(200);
      expect(res.body._dev_reset_token).toBeDefined();
    });

    it('should not reveal if email exists', async () => {
      const res = await agent
        .post('/api/auth/forgot-password')
        .send({ email: 'nonexistent@example.com' });

      expect(res.statusCode).toBe(200);
      expect(res.body.message).toContain('If an account');
    });

    it('should reset password with valid token', async () => {
      // Get reset token
      const forgotRes = await agent
        .post('/api/auth/forgot-password')
        .send({ email: 'test.patient@example.com' });

      const token = forgotRes.body._dev_reset_token;

      // Reset password
      const resetRes = await agent
        .post('/api/auth/reset-password')
        .send({
          token,
          password: 'NewPassword123',
        });

      expect(resetRes.statusCode).toBe(200);
      expect(resetRes.body.message).toContain('successful');

      // Login with new password
      const loginRes = await agent
        .post('/api/auth/login')
        .send({
          email: 'test.patient@example.com',
          password: 'NewPassword123',
        });

      expect(loginRes.statusCode).toBe(200);
    });

    it('should reject invalid reset token', async () => {
      const res = await agent
        .post('/api/auth/reset-password')
        .send({
          token: 'invalid-token',
          password: 'NewPassword123',
        });

      expect(res.statusCode).toBe(400);
    });
  });

  // ============================================================
  // Change Password
  // ============================================================
  describe('POST /api/auth/change-password', () => {
    it('should change password for authenticated user', async () => {
      await agent
        .post('/api/auth/login')
        .send({
          email: 'test.patient@example.com',
          password: 'NewPassword123',
        });

      const res = await agent
        .post('/api/auth/change-password')
        .send({
          current_password: 'NewPassword123',
          new_password: 'UpdatedPass456',
        });

      expect(res.statusCode).toBe(200);
      expect(res.body.message).toContain('changed');
    });

    it('should reject wrong current password', async () => {
      await agent
        .post('/api/auth/login')
        .send({
          email: 'test.patient@example.com',
          password: 'UpdatedPass456',
        });

      const res = await agent
        .post('/api/auth/change-password')
        .send({
          current_password: 'WrongPassword',
          new_password: 'SomeNewPass789',
        });

      expect(res.statusCode).toBe(401);
    });
  });

  // ============================================================
  // Logout
  // ============================================================
  describe('POST /api/auth/logout', () => {
    it('should log out and destroy session', async () => {
      await agent
        .post('/api/auth/login')
        .send({
          email: 'test.patient@example.com',
          password: 'UpdatedPass456',
        });

      const logoutRes = await agent.post('/api/auth/logout');
      expect(logoutRes.statusCode).toBe(200);

      // Verify session is gone
      const sessionRes = await agent.get('/api/auth/session');
      expect(sessionRes.body.authenticated).toBe(false);
    });
  });

  // ============================================================
  // Protected Routes
  // ============================================================
  describe('Protected Routes', () => {
    it('should reject unauthenticated access to /api/auth/me', async () => {
      const freshAgent = request(app);
      const res = await freshAgent.get('/api/auth/me');
      expect(res.statusCode).toBe(401);
    });

    it('should reject unauthenticated access to /api/dashboard', async () => {
      const freshAgent = request(app);
      const res = await freshAgent.get('/api/dashboard');
      expect(res.statusCode).toBe(401);
    });
  });

  // ============================================================
  // Health Check
  // ============================================================
  describe('GET /api/health', () => {
    it('should return health status', async () => {
      const res = await request(app).get('/api/health');
      expect(res.statusCode).toBe(200);
      expect(res.body.status).toBe('ok');
    });
  });
});
