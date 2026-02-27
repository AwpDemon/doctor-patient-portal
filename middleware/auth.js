const { getDatabase } = require('../config/db');

// Check if user is authenticated
function isAuthenticated(req, res, next) {
  if (req.session && req.session.userId) {
    const db = getDatabase();
    const user = db.prepare('SELECT id, email, role, first_name, last_name, is_active FROM users WHERE id = ?').get(req.session.userId);

    if (user && user.is_active) {
      req.user = user;
      return next();
    }
  }
  return res.status(401).json({ error: 'Authentication required. Please log in.' });
}

// Check if 2FA verification is complete (for users with 2FA enabled)
function is2FAVerified(req, res, next) {
  if (req.session && req.session.userId) {
    const db = getDatabase();
    const user = db.prepare('SELECT two_factor_enabled FROM users WHERE id = ?').get(req.session.userId);

    if (user && user.two_factor_enabled && !req.session.twoFactorVerified) {
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

// Check if user can access a specific patient's data
function canAccessPatient(req, res, next) {
  const patientId = parseInt(req.params.patientId || req.body.patient_id || req.query.patient_id);

  if (!req.user) {
    return res.status(401).json({ error: 'Authentication required.' });
  }

  // Admins can access all patient data
  if (req.user.role === 'admin') {
    return next();
  }

  // Patients can only access their own data
  if (req.user.role === 'patient') {
    if (req.user.id !== patientId) {
      return res.status(403).json({ error: 'Access denied. You can only view your own records.' });
    }
    return next();
  }

  // Doctors can access their assigned patients
  if (req.user.role === 'doctor') {
    const db = getDatabase();
    const relationship = db.prepare(`
      SELECT COUNT(*) as count FROM appointments
      WHERE doctor_id = ? AND patient_id = ?
    `).get(req.user.id, patientId);

    if (relationship.count > 0) {
      return next();
    }
    return res.status(403).json({ error: 'Access denied. This patient is not assigned to you.' });
  }

  return res.status(403).json({ error: 'Access denied.' });
}

// Rate limiting for auth endpoints
const loginAttempts = new Map();

function rateLimitLogin(req, res, next) {
  const ip = req.ip;
  const now = Date.now();
  const windowMs = 15 * 60 * 1000; // 15 minutes
  const maxAttempts = 5;

  if (!loginAttempts.has(ip)) {
    loginAttempts.set(ip, []);
  }

  const attempts = loginAttempts.get(ip).filter(time => now - time < windowMs);
  loginAttempts.set(ip, attempts);

  if (attempts.length >= maxAttempts && process.env.NODE_ENV !== 'test') {
    logAction(null, 'RATE_LIMIT_HIT', null, null, `IP ${ip} exceeded login rate limit`, ip);
    return res.status(429).json({
      error: 'Too many login attempts. Please try again in 15 minutes.'
    });
  }

  attempts.push(now);
  return next();
}

// Session activity tracking
function trackActivity(req, res, next) {
  if (req.session && req.session.userId) {
    req.session.lastActivity = Date.now();

    // Check session timeout (30 minutes of inactivity)
    const timeout = 30 * 60 * 1000;
    if (req.session.lastActivity && (Date.now() - req.session.lastActivity > timeout)) {
      req.session.destroy();
      return res.status(440).json({ error: 'Session expired due to inactivity. Please log in again.' });
    }
  }
  next();
}

// Audit logging
function logAction(userId, action, resource, resourceId, details, ipAddress) {
  try {
    const db = getDatabase();
    db.prepare(`
      INSERT INTO audit_log (user_id, action, resource, resource_id, details, ip_address)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(userId, action, resource, resourceId, details, ipAddress);
  } catch (err) {
    console.error('Audit log error:', err.message);
  }
}

module.exports = {
  isAuthenticated,
  is2FAVerified,
  requireRole,
  canAccessPatient,
  rateLimitLogin,
  trackActivity,
  logAction
};
