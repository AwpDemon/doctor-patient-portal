// Security-control tests. Each describe block names the NIST SP 800-53 control
// it provides evidence for; docs/CONTROL_MAPPING.md links back to these tests.
const request = require('supertest');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const speakeasy = require('speakeasy');

const testDbPath = path.join(__dirname, '..', 'data', 'security-test.db');
process.env.DB_PATH = testDbPath;
process.env.NODE_ENV = 'test';
process.env.SESSION_SECRET = 'test-secret';
process.env.LOGIN_RATE_MAX = '1000';

function removeDb() {
  for (const suffix of ['', '-wal', '-shm']) {
    try { fs.unlinkSync(testDbPath + suffix); } catch (e) { /* ignore */ }
  }
}
removeDb();

const app = require('../server');
const { getDatabase, closeDatabase, installAuditTriggers, dropAuditTriggers } = require('../config/db');
const User = require('../models/User');
const { verifyAuditChain, resetRateLimits, SESSION_IDLE_TIMEOUT_MS } = require('../middleware/auth');

const PASSWORD = 'Password123';
const ids = {};

async function makeUser(email, role, extra = {}) {
  const user = await User.create({
    email, password: PASSWORD, first_name: role, last_name: email.split('@')[0], role, ...extra,
  });
  return user.id;
}

async function loginAs(email, password = PASSWORD) {
  const agent = request.agent(app);
  const res = await agent.post('/api/auth/login').send({ email, password });
  return { agent, res };
}

function auditActions() {
  return getDatabase().prepare('SELECT action FROM audit_log').all().map(r => r.action);
}

function sessionCookie(res) {
  const cookie = (res.headers['set-cookie'] || []).find(c => c.startsWith('healthbridge.sid='));
  return cookie ? cookie.split(';')[0] : null;
}

beforeAll(async () => {
  const db = getDatabase();
  ids.admin = await makeUser('admin@test.local', 'admin');
  ids.docA = await makeUser('doc.a@test.local', 'doctor');
  ids.docB = await makeUser('doc.b@test.local', 'doctor');
  ids.patP = await makeUser('pat.p@test.local', 'patient');
  ids.patQ = await makeUser('pat.q@test.local', 'patient');
  ids.mfa = await makeUser('mfa.user@test.local', 'patient');
  ids.locky = await makeUser('locky@test.local', 'patient');

  // Doctor A treats patient P. Doctor B has no relationship with P.
  ids.appt = db.prepare(`INSERT INTO appointments (patient_id, doctor_id, date, time, type)
    VALUES (?, ?, '2030-01-15', '09:00', 'checkup')`).run(ids.patP, ids.docA).lastInsertRowid;
  db.prepare(`INSERT INTO lab_results (patient_id, doctor_id, test_name, category, result_value, test_date)
    VALUES (?, ?, 'A1C', 'Blood', '5.4', '2030-01-15')`).run(ids.patP, ids.docA);
  db.prepare(`INSERT INTO billing (patient_id, description, amount, patient_responsibility, invoice_number)
    VALUES (?, 'Visit', 100, 20, 'INV-TEST-1')`).run(ids.patP);
  ids.msg = db.prepare(`INSERT INTO messages (sender_id, recipient_id, subject, body)
    VALUES (?, ?, 'Results', 'Your results are normal.')`).run(ids.docA, ids.patP).lastInsertRowid;

  // MFA user: enrolled in TOTP.
  ids.mfaSecret = speakeasy.generateSecret().base32;
  User.set2FASecret(ids.mfa, ids.mfaSecret);
  User.enable2FA(ids.mfa);
});

afterAll(() => {
  closeDatabase();
  removeDb();
});

// ------------------------------------------------------------------
describe('IA-2(1) multi-factor authentication is enforced', () => {
  it('a password-only session cannot reach protected APIs when 2FA is enabled', async () => {
    const { agent, res } = await loginAs('mfa.user@test.local');
    expect(res.body.requires2FA).toBe(true);

    const me = await agent.get('/api/auth/me');
    expect(me.statusCode).toBe(403);
    expect(me.body.requires2FA).toBe(true);

    const appts = await agent.get('/api/appointments');
    expect(appts.statusCode).toBe(403);
  });

  it('a valid TOTP code completes login and unlocks the session', async () => {
    const { agent } = await loginAs('mfa.user@test.local');
    const token = speakeasy.totp({ secret: ids.mfaSecret, encoding: 'base32' });
    const verify = await agent.post('/api/auth/verify-2fa').send({ token });
    expect(verify.statusCode).toBe(200);

    const me = await agent.get('/api/auth/me');
    expect(me.statusCode).toBe(200);
    expect(me.body.user.id).toBe(ids.mfa);
  });

  it('a wrong TOTP code is rejected and audited', async () => {
    const { agent } = await loginAs('mfa.user@test.local');
    const res = await agent.post('/api/auth/verify-2fa').send({ token: '000000' });
    expect(res.statusCode).toBe(401);
    expect(auditActions()).toContain('LOGIN_2FA_FAILED');
    User.clearFailedLogins(ids.mfa);
  });
});

// ------------------------------------------------------------------
describe('AC-12 session termination after inactivity', () => {
  it('expires a session that has been idle longer than the limit', async () => {
    const { agent } = await loginAs('pat.q@test.local');
    expect((await agent.get('/api/auth/me')).statusCode).toBe(200);

    const realNow = Date.now;
    const later = realNow() + SESSION_IDLE_TIMEOUT_MS + 60 * 1000;
    Date.now = () => later;
    try {
      const res = await agent.get('/api/auth/me');
      expect(res.statusCode).toBe(440);
    } finally {
      Date.now = realNow;
    }

    // The session was destroyed, not just refused once.
    expect((await agent.get('/api/auth/me')).statusCode).toBe(401);
    expect(auditActions()).toContain('SESSION_TIMEOUT');
  });

  it('does not expire an active session', async () => {
    const { agent } = await loginAs('pat.q@test.local');
    expect((await agent.get('/api/auth/me')).statusCode).toBe(200);
    expect((await agent.get('/api/auth/me')).statusCode).toBe(200);
  });
});

// ------------------------------------------------------------------
describe('SC-23 session ID is regenerated at login', () => {
  it('issues a new session cookie on each successful login', async () => {
    const agent = request.agent(app);
    const first = await agent.post('/api/auth/login').send({ email: 'pat.q@test.local', password: PASSWORD });
    const second = await agent.post('/api/auth/login').send({ email: 'pat.p@test.local', password: PASSWORD });
    const c1 = sessionCookie(first);
    const c2 = sessionCookie(second);
    expect(c1).toBeTruthy();
    expect(c2).toBeTruthy();
    expect(c2).not.toBe(c1);
  });
});

// ------------------------------------------------------------------
describe('AC-7 unsuccessful logon attempts', () => {
  it('locks an account after 5 consecutive failed passwords, even with the right password next', async () => {
    for (let i = 0; i < 5; i++) {
      const { res } = await loginAs('locky@test.local', 'WrongPass999');
      expect(res.statusCode).toBe(401);
    }
    const { res } = await loginAs('locky@test.local', PASSWORD);
    expect(res.statusCode).toBe(423);
    expect(auditActions()).toContain('ACCOUNT_LOCKED');
  });

  it('unlocks after the lockout window', async () => {
    getDatabase().prepare('UPDATE users SET locked_until = ? WHERE id = ?')
      .run(new Date(Date.now() - 1000).toISOString(), ids.locky);
    const { res } = await loginAs('locky@test.local', PASSWORD);
    expect(res.statusCode).toBe(200);
  });

  it('rate-limits login attempts per IP', async () => {
    const saved = process.env.LOGIN_RATE_MAX;
    process.env.LOGIN_RATE_MAX = '3';
    resetRateLimits();
    try {
      const statuses = [];
      for (let i = 0; i < 4; i++) {
        const { res } = await loginAs('nobody@test.local', 'WrongPass999');
        statuses.push(res.statusCode);
      }
      expect(statuses).toEqual([401, 401, 401, 429]);
      expect(auditActions()).toContain('RATE_LIMIT_HIT');
    } finally {
      process.env.LOGIN_RATE_MAX = saved;
      resetRateLimits();
    }
  });

  it('audits failed logins for unknown accounts', () => {
    const rows = getDatabase().prepare(
      "SELECT details FROM audit_log WHERE action = 'LOGIN_FAILED' AND user_id IS NULL"
    ).all();
    expect(rows.some(r => r.details.includes('nobody@test.local'))).toBe(true);
  });
});

// ------------------------------------------------------------------
describe('AC-2 account management', () => {
  it('a self-registered doctor cannot log in until an admin activates the account', async () => {
    const reg = await request(app).post('/api/auth/register').send({
      email: 'new.doc@test.local', password: PASSWORD, first_name: 'New', last_name: 'Doc', role: 'doctor',
    });
    expect(reg.statusCode).toBe(201);
    expect(reg.body.pendingApproval).toBe(true);
    expect(sessionCookie(reg)).toBeNull();

    const before = await loginAs('new.doc@test.local');
    expect(before.res.statusCode).toBe(403);

    const { agent: admin } = await loginAs('admin@test.local');
    const toggle = await admin.put(`/api/dashboard/admin/users/${reg.body.user.id}/toggle-active`);
    expect(toggle.statusCode).toBe(200);
    expect(auditActions()).toContain('USER_ACTIVATED');

    const after = await loginAs('new.doc@test.local');
    expect(after.res.statusCode).toBe(200);
  });

  it('a self-registered patient is active immediately', async () => {
    const agent = request.agent(app);
    const reg = await agent.post('/api/auth/register').send({
      email: 'new.pat@test.local', password: PASSWORD, first_name: 'New', last_name: 'Pat', role: 'patient',
    });
    expect(reg.statusCode).toBe(201);
    expect((await agent.get('/api/auth/me')).statusCode).toBe(200);
  });

  it('an admin cannot deactivate their own account', async () => {
    const { agent } = await loginAs('admin@test.local');
    const res = await agent.put(`/api/dashboard/admin/users/${ids.admin}/toggle-active`);
    expect(res.statusCode).toBe(400);
  });
});

// ------------------------------------------------------------------
describe('IA-5 authenticator management (password reset tokens)', () => {
  it('stores only a SHA-256 digest of the reset token', async () => {
    const res = await request(app).post('/api/auth/forgot-password').send({ email: 'pat.q@test.local' });
    const token = res.body._dev_reset_token;
    expect(token).toBeTruthy();
    const stored = getDatabase().prepare('SELECT password_reset_token FROM users WHERE id = ?').get(ids.patQ);
    expect(stored.password_reset_token).not.toBe(token);
    expect(stored.password_reset_token).toBe(crypto.createHash('sha256').update(token).digest('hex'));
  });

  it('rejects a reset token that expired earlier the same day', async () => {
    const res = await request(app).post('/api/auth/forgot-password').send({ email: 'pat.q@test.local' });
    const token = res.body._dev_reset_token;
    getDatabase().prepare('UPDATE users SET password_reset_expires = ? WHERE id = ?')
      .run(new Date(Date.now() - 60 * 1000).toISOString(), ids.patQ);
    const reset = await request(app).post('/api/auth/reset-password').send({ token, password: 'NewPass1234' });
    expect(reset.statusCode).toBe(400);
  });

  it('never returns the reset token when NODE_ENV=production', async () => {
    process.env.NODE_ENV = 'production';
    try {
      const res = await request(app).post('/api/auth/forgot-password').send({ email: 'pat.q@test.local' });
      expect(res.statusCode).toBe(200);
      expect(res.body._dev_reset_token).toBeUndefined();
    } finally {
      process.env.NODE_ENV = 'test';
    }
  });

  it('refuses to start in production without a session secret', () => {
    const saved = { env: process.env.NODE_ENV, secret: process.env.SESSION_SECRET };
    process.env.NODE_ENV = 'production';
    delete process.env.SESSION_SECRET;
    try {
      jest.isolateModules(() => {
        expect(() => require('../server')).toThrow(/SESSION_SECRET/);
      });
    } finally {
      process.env.NODE_ENV = saved.env;
      process.env.SESSION_SECRET = saved.secret;
    }
  });
});

// ------------------------------------------------------------------
describe('AC-3 / AC-6 object-level access to patient data', () => {
  let docA, docB, patP, patQ;
  beforeAll(async () => {
    ({ agent: docA } = await loginAs('doc.a@test.local'));
    ({ agent: docB } = await loginAs('doc.b@test.local'));
    ({ agent: patP } = await loginAs('pat.p@test.local'));
    ({ agent: patQ } = await loginAs('pat.q@test.local'));
  });

  it('lab results: treating doctor and the patient can read; others cannot', async () => {
    expect((await docA.get(`/api/patients/${ids.patP}/lab-results`)).statusCode).toBe(200);
    expect((await patP.get(`/api/patients/${ids.patP}/lab-results`)).statusCode).toBe(200);
    expect((await docB.get(`/api/patients/${ids.patP}/lab-results`)).statusCode).toBe(403);
    expect((await patQ.get(`/api/patients/${ids.patP}/lab-results`)).statusCode).toBe(403);
  });

  it('lab result reads are audited', () => {
    expect(auditActions()).toContain('VIEW_LAB_RESULTS');
  });

  it('full records: unassigned doctor is denied and the denial is audited', async () => {
    expect((await docA.get(`/api/patients/${ids.patP}/records`)).statusCode).toBe(200);
    expect((await docB.get(`/api/patients/${ids.patP}/records`)).statusCode).toBe(403);
    expect((await patP.get(`/api/patients/${ids.patP}/records`)).statusCode).toBe(403); // role gate
    expect(auditActions()).toContain('ACCESS_DENIED');
  });

  it('billing: unassigned doctor cannot read or create bills', async () => {
    expect((await docB.get(`/api/patients/${ids.patP}/billing`)).statusCode).toBe(403);
    const create = await docB.post(`/api/patients/${ids.patP}/billing`).send({ description: 'x', amount: 1 });
    expect(create.statusCode).toBe(403);
    expect((await patP.get(`/api/patients/${ids.patP}/billing`)).statusCode).toBe(200);
  });

  it('lab results: unassigned doctor cannot write a result into another doctor\'s patient', async () => {
    const res = await docB.post(`/api/patients/${ids.patP}/lab-results`).send({
      test_name: 'x', category: 'x', result_value: '1', test_date: '2030-01-01',
    });
    expect(res.statusCode).toBe(403);
  });

  it('prescriptions: unassigned doctor cannot list active meds or prescribe', async () => {
    expect((await docA.get(`/api/prescriptions/active?patient_id=${ids.patP}`)).statusCode).toBe(200);
    expect((await docB.get(`/api/prescriptions/active?patient_id=${ids.patP}`)).statusCode).toBe(403);
    const rx = await docB.post('/api/prescriptions').send({
      patient_id: ids.patP, medication: 'X', dosage: '1mg', frequency: 'daily', start_date: '2030-01-01',
    });
    expect(rx.statusCode).toBe(403);
  });

  it('prescriptions: patients cannot create prescriptions (role gate)', async () => {
    const rx = await patP.post('/api/prescriptions').send({
      patient_id: ids.patP, medication: 'X', dosage: '1mg', frequency: 'daily', start_date: '2030-01-01',
    });
    expect(rx.statusCode).toBe(403);
  });

  it('messages: only participants can read a thread', async () => {
    expect((await patP.get(`/api/messages/${ids.msg}/thread`)).statusCode).toBe(200);
    expect((await docA.get(`/api/messages/${ids.msg}/thread`)).statusCode).toBe(200);
    expect((await patQ.get(`/api/messages/${ids.msg}/thread`)).statusCode).toBe(403);
    expect((await docB.get(`/api/messages/${ids.msg}/thread`)).statusCode).toBe(403);
  });

  it('appointments: an unassigned doctor cannot cancel; only admins can delete', async () => {
    expect((await docB.put(`/api/appointments/${ids.appt}/cancel`)).statusCode).toBe(403);
    expect((await patQ.get(`/api/appointments/${ids.appt}`)).statusCode).toBe(403);
    expect((await patP.delete(`/api/appointments/${ids.appt}`)).statusCode).toBe(403);
  });

  it('appointments: a patient cannot change clinical fields (status, notes)', async () => {
    const res = await patP.put(`/api/appointments/${ids.appt}`).send({ status: 'completed', notes: 'edited' });
    expect(res.statusCode).toBe(403);
    const row = getDatabase().prepare('SELECT status, notes FROM appointments WHERE id = ?').get(ids.appt);
    expect(row.status).not.toBe('completed');
    expect(row.notes).not.toBe('edited');

    const ok = await patP.put(`/api/appointments/${ids.appt}`).send({ reason: 'Follow-up on A1C' });
    expect(ok.statusCode).toBe(200);
    expect((await docA.put(`/api/appointments/${ids.appt}`).send({ notes: 'Reviewed labs' })).statusCode).toBe(200);
  });

  it('search: a doctor only finds their own patients', async () => {
    const a = await docA.get('/api/dashboard/search?q=pat');
    const b = await docB.get('/api/dashboard/search?q=pat');
    expect(a.body.results.patients.map(p => p.id)).toContain(ids.patP);
    expect(b.body.results.patients.map(p => p.id)).not.toContain(ids.patP);
  });

  it('admin endpoints reject non-admins', async () => {
    expect((await docA.get('/api/dashboard/admin/audit-log')).statusCode).toBe(403);
    expect((await patP.get('/api/dashboard/admin/users')).statusCode).toBe(403);
  });
});

// ------------------------------------------------------------------
describe('AU-9 protection of audit information', () => {
  it('the hash chain verifies over all rows written by the tests above', () => {
    const result = verifyAuditChain();
    expect(result.ok).toBe(true);
    expect(result.checked).toBeGreaterThan(20);
  });

  it('the admin verify endpoint reports an intact chain', async () => {
    const { agent } = await loginAs('admin@test.local');
    const res = await agent.get('/api/dashboard/admin/audit-log/verify');
    expect(res.statusCode).toBe(200);
    expect(res.body.ok).toBe(true);
  });

  it('the database refuses UPDATE and DELETE on audit rows', () => {
    const db = getDatabase();
    expect(() => db.prepare("UPDATE audit_log SET details = 'x' WHERE id = 1").run()).toThrow(/append-only/);
    expect(() => db.prepare('DELETE FROM audit_log WHERE id = 1').run()).toThrow(/append-only/);
  });

  it('detects a row edited behind the triggers\' back', () => {
    const db = getDatabase();
    dropAuditTriggers();
    try {
      db.prepare("UPDATE audit_log SET details = 'tampered' WHERE id = 3").run();
      const result = verifyAuditChain();
      expect(result.ok).toBe(false);
      expect(result.firstBadId).toBe(3);
    } finally {
      installAuditTriggers();
    }
  });
});

// ------------------------------------------------------------------
describe('SC-18 / SI-10 security headers', () => {
  it('sends a Content-Security-Policy that restricts script sources', async () => {
    const res = await request(app).get('/');
    const csp = res.headers['content-security-policy'];
    expect(csp).toMatch(/script-src 'self'/);
    expect(csp).toMatch(/object-src 'none'/);
    expect(csp).toMatch(/frame-ancestors 'none'/);
  });
});
