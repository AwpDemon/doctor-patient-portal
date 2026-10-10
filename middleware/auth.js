const crypto = require('crypto');
const { getDatabase } = require('../config/db');

// Inactivity limit for a session (AC-12, HIPAA 164.312(a)(2)(iii) automatic logoff).
const SESSION_IDLE_TIMEOUT_MS =
  parseInt(process.env.SESSION_IDLE_TIMEOUT_MS, 10) || 30 * 60 * 1000;

// Check if user is authenticated.
// A session only counts as authenticated once every required factor is done:
// if the account has 2FA enabled, a password-only session is rejected here
// (IA-2(1)). Before this check existed, a user who passed the password step
// but never entered a TOTP code could call every protected API.
function isAuthenticated(req, res, next) {
  if (req.session && req.session.userId) {
    const db = getDatabase();
    const user = db.prepare(
      'SELECT id, email, role, first_name, last_name, is_active, two_factor_enabled FROM users WHERE id = ?'
    ).get(req.session.userId);

    if (user && user.is_active) {
      if (user.two_factor_enabled && req.session.twoFactorVerified !== true) {
        return res.status(403).json({
          error: 'Two-factor authentication required.',
          requires2FA: true,
        });
      }
      req.user = user;
      return next();
    }
  }
  return res.status(401).json({ error: 'Authentication required. Please log in.' });
}

// Kept for backwards compatibility; isAuthenticated now enforces this itself.
function is2FAVerified(req, res, next) {
  if (req.session && req.session.userId) {
    const db = getDatabase();
    const user = db.prepare('SELECT two_factor_enabled FROM users WHERE id = ?').get(req.session.userId);

    if (user && user.two_factor_enabled && req.session.twoFactorVerified !== true) {
      return res.status(403).json({
        error: 'Two-factor authentication required.',
        requires2FA: true
      });
    }
    return next();
  }
  return res.status(401).json({ error: 'Authentication required.' });
}

// Role-based access control
function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required.' });
    }
    if (!roles.includes(req.user.role)) {
      logAction(req.user.id, 'ACCESS_DENIED', null, null,
        `User with role '${req.user.role}' attempted to access route requiring: ${roles.join(', ')}`,
        req.ip
      );
      return res.status(403).json({ error: 'Access denied. Insufficient permissions.' });
    }
    return next();
  };
}

// Object-level access rule for patient data (AC-3, AC-6):
// - admin: any patient
// - patient: only themselves
// - doctor: only patients they have (or had) an appointment with
function hasPatientAccess(user, patientId) {
  if (!user || !Number.isInteger(patientId)) return false;
  if (user.role === 'admin') return true;
  if (user.role === 'patient') return user.id === patientId;
  if (user.role === 'doctor') {
    const db = getDatabase();
    const relationship = db.prepare(
      'SELECT COUNT(*) as count FROM appointments WHERE doctor_id = ? AND patient_id = ?'
    ).get(user.id, patientId);
    return relationship.count > 0;
  }
  return false;
}

// Route guard built on hasPatientAccess. Reads the patient id from
// :patientId, :id, body.patient_id or query.patient_id (in that order).
function canAccessPatient(req, res, next) {
  if (!req.user) {
    return res.status(401).json({ error: 'Authentication required.' });
  }

  const raw = req.params.patientId ?? req.params.id ?? req.body?.patient_id ?? req.query.patient_id;
  const patientId = parseInt(raw, 10);

  if (hasPatientAccess(req.user, patientId)) {
    return next();
  }

  logAction(req.user.id, 'ACCESS_DENIED', 'users', Number.isInteger(patientId) ? patientId : null,
    `${req.user.role} ${req.user.id} denied access to patient ${raw}`, req.ip);
  return res.status(403).json({ error: 'Access denied. You do not have access to this patient.' });
}

// Per-IP rate limiting for auth endpoints (AC-7). Limits are configurable so
// the test suite can exercise the limiter instead of bypassing it.
const loginAttempts = new Map();

function rateLimitLogin(req, res, next) {
  const ip = req.ip;
  const now = Date.now();
  const windowMs = parseInt(process.env.LOGIN_RATE_WINDOW_MS, 10) || 15 * 60 * 1000;
  const maxAttempts = parseInt(process.env.LOGIN_RATE_MAX, 10) || 5;

  if (!loginAttempts.has(ip)) {
    loginAttempts.set(ip, []);
  }

  const attempts = loginAttempts.get(ip).filter(time => now - time < windowMs);
  loginAttempts.set(ip, attempts);

  if (attempts.length >= maxAttempts) {
    logAction(null, 'RATE_LIMIT_HIT', null, null, `IP ${ip} exceeded login rate limit`, ip);
    return res.status(429).json({
      error: 'Too many login attempts. Please try again later.'
    });
  }

  attempts.push(now);
  return next();
}

function resetRateLimits() {
  loginAttempts.clear();
}

// Session inactivity timeout (AC-12).
// The idle time is measured against the PREVIOUS request's timestamp, then the
// timestamp is refreshed. (The original version refreshed it first, so the
// timeout could never fire.)
function trackActivity(req, res, next) {
  if (req.session && req.session.userId) {
    const now = Date.now();
    const last = req.session.lastActivity;

    if (last && now - last > SESSION_IDLE_TIMEOUT_MS) {
      const userId = req.session.userId;
      return req.session.destroy(() => {
        logAction(userId, 'SESSION_TIMEOUT', 'users', userId, 'Session expired after inactivity', req.ip);
        res.clearCookie('healthbridge.sid');
        res.status(440).json({ error: 'Session expired due to inactivity. Please log in again.' });
      });
    }

    req.session.lastActivity = now;
  }
  next();
}

// ============================================================
// Audit logging (AU-2, AU-3, AU-9, AU-12)
// ============================================================
// Every row stores hash = SHA-256(prev_hash || canonical row content), so
// editing or deleting a past row breaks every hash after it. Combined with the
// append-only triggers in config/db.js this gives tamper evidence; it is not
// tamper-proof against someone with direct write access to the database file
// who recomputes the whole chain (that needs an external anchor, see
// docs/CONTROL_MAPPING.md, gaps).
const GENESIS_HASH = '0'.repeat(64);

// SQLite coerces values by column affinity, so normalize integer columns the
// same way before hashing; otherwise "5" vs 5 would hash differently after a
// round trip through the database.
function toIntOrNull(value) {
  if (value === null || value === undefined) return null;
  const n = Number(value);
  return Number.isInteger(n) ? n : null;
}

function auditRowHash(prevHash, row) {
  const canonical = JSON.stringify([
    row.user_id ?? null,
    row.action,
    row.resource ?? null,
    row.resource_id ?? null,
    row.details ?? null,
    row.ip_address ?? null,
    row.created_at,
  ]);
  return crypto.createHash('sha256').update(prevHash + canonical).digest('hex');
}

function logAction(userId, action, resource, resourceId, details, ipAddress) {
  try {
    const db = getDatabase();
    const append = db.transaction(() => {
      const last = db.prepare('SELECT hash FROM audit_log ORDER BY id DESC LIMIT 1').get();
      const prevHash = (last && last.hash) || GENESIS_HASH;
      const row = {
        user_id: toIntOrNull(userId),
        action,
        resource: resource ?? null,
        resource_id: toIntOrNull(resourceId),
        details: details ?? null,
        ip_address: ipAddress ?? null,
        created_at: new Date().toISOString(),
      };
      const hash = auditRowHash(prevHash, row);
      db.prepare(`
        INSERT INTO audit_log (user_id, action, resource, resource_id, details, ip_address, created_at, prev_hash, hash)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(row.user_id, row.action, row.resource, row.resource_id, row.details,
        row.ip_address, row.created_at, prevHash, hash);
    });
    append();
  } catch (err) {
    console.error('Audit log error:', err.message);
  }
}

// Walk the chain in insertion order and report the first row whose stored
// hash or back-link does not match a recomputation.
function verifyAuditChain() {
  const db = getDatabase();
  const rows = db.prepare('SELECT * FROM audit_log ORDER BY id ASC').all();
  let prevHash = GENESIS_HASH;
  let checked = 0;

  for (const row of rows) {
    if (!row.hash) {
      // Rows written before hash chaining existed are skipped, not trusted.
      continue;
    }
    if (row.prev_hash !== prevHash || auditRowHash(prevHash, row) !== row.hash) {
      return { ok: false, checked, firstBadId: row.id };
    }
    prevHash = row.hash;
    checked += 1;
  }
  return { ok: true, checked, firstBadId: null };
}

module.exports = {
  isAuthenticated,
  is2FAVerified,
  requireRole,
  hasPatientAccess,
  canAccessPatient,
  rateLimitLogin,
  resetRateLimits,
  trackActivity,
  logAction,
  verifyAuditChain,
  auditRowHash,
  SESSION_IDLE_TIMEOUT_MS,
};
