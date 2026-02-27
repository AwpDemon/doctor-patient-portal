const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const speakeasy = require('speakeasy');
const QRCode = require('qrcode');
const { body, validationResult } = require('express-validator');
const User = require('../models/User');
const { isAuthenticated, rateLimitLogin, logAction } = require('../middleware/auth');

// ============================================================
// POST /api/auth/register - Create new account
// ============================================================
router.post('/register', [
  body('email').isEmail().normalizeEmail().withMessage('Valid email is required'),
  body('password').isLength({ min: 8 }).withMessage('Password must be at least 8 characters')
    .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/).withMessage('Password must contain uppercase, lowercase, and number'),
  body('first_name').trim().notEmpty().withMessage('First name is required'),
  body('last_name').trim().notEmpty().withMessage('Last name is required'),
  body('role').isIn(['patient', 'doctor']).withMessage('Role must be patient or doctor'),
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const existing = User.findByEmail(req.body.email);
    if (existing) {
      return res.status(409).json({ error: 'An account with this email already exists.' });
    }

    const user = await User.create(req.body);

    logAction(user.id, 'REGISTER', 'users', user.id, `New ${req.body.role} account created`, req.ip);

    // Auto-login after registration
    req.session.userId = user.id;
    req.session.role = user.role;
    req.session.lastActivity = Date.now();

    res.status(201).json({
      message: 'Account created successfully.',
      user: {
        id: user.id,
        email: user.email,
        first_name: user.first_name,
        last_name: user.last_name,
        role: user.role,
      }
    });
  } catch (err) {
    console.error('Registration error:', err);
    res.status(500).json({ error: 'Registration failed. Please try again.' });
  }
});

// ============================================================
// POST /api/auth/login - Authenticate user
// ============================================================
router.post('/login', rateLimitLogin, [
  body('email').isEmail().normalizeEmail(),
  body('password').notEmpty(),
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { email, password } = req.body;
    const user = User.findByEmail(email);

    if (!user) {
      return res.status(401).json({ error: 'Invalid email or password.' });
    }

    if (!user.is_active) {
      return res.status(403).json({ error: 'This account has been deactivated. Contact an administrator.' });
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      logAction(null, 'LOGIN_FAILED', 'users', null, `Failed login attempt for ${email}`, req.ip);
      return res.status(401).json({ error: 'Invalid email or password.' });
    }

    // Set session
    req.session.userId = user.id;
    req.session.role = user.role;
    req.session.lastActivity = Date.now();

    // Check if 2FA is enabled
    if (user.two_factor_enabled) {
      req.session.twoFactorVerified = false;
      logAction(user.id, 'LOGIN_2FA_PENDING', 'users', user.id, '2FA verification pending', req.ip);
      return res.json({
        message: 'Two-factor authentication required.',
        requires2FA: true,
        user: { id: user.id, email: user.email, role: user.role }
      });
    }

    req.session.twoFactorVerified = true;
    User.updateLastLogin(user.id);
    logAction(user.id, 'LOGIN', 'users', user.id, 'Successful login', req.ip);

    res.json({
      message: 'Login successful.',
      user: {
        id: user.id,
        email: user.email,
        first_name: user.first_name,
        last_name: user.last_name,
        role: user.role,
      }
    });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ error: 'Login failed. Please try again.' });
  }
});

// ============================================================
// POST /api/auth/verify-2fa - Verify TOTP code
// ============================================================
router.post('/verify-2fa', [
  body('token').isLength({ min: 6, max: 6 }).isNumeric(),
], (req, res) => {
  try {
    if (!req.session.userId) {
      return res.status(401).json({ error: 'Please log in first.' });
    }

    const user = User.findByEmail(
      require('../config/db').getDatabase()
        .prepare('SELECT email FROM users WHERE id = ?')
        .get(req.session.userId).email
    );

    if (!user || !user.two_factor_secret) {
      return res.status(400).json({ error: '2FA not configured for this account.' });
    }

    const verified = speakeasy.totp.verify({
      secret: user.two_factor_secret,
      encoding: 'base32',
      token: req.body.token,
      window: 1,
    });

    if (!verified) {
      return res.status(401).json({ error: 'Invalid verification code.' });
    }

    req.session.twoFactorVerified = true;
    User.updateLastLogin(user.id);
    logAction(user.id, 'LOGIN_2FA_VERIFIED', 'users', user.id, '2FA verification successful', req.ip);

    res.json({
      message: 'Two-factor authentication verified.',
      user: {
        id: user.id,
        email: user.email,
        first_name: user.first_name,
        last_name: user.last_name,
        role: user.role,
      }
    });
  } catch (err) {
    console.error('2FA verification error:', err);
    res.status(500).json({ error: '2FA verification failed.' });
  }
});

// ============================================================
// POST /api/auth/setup-2fa - Generate 2FA secret & QR code
// ============================================================
router.post('/setup-2fa', isAuthenticated, async (req, res) => {
  try {
    const secret = speakeasy.generateSecret({
      name: `HealthBridge Portal (${req.user.email})`,
      issuer: 'HealthBridge',
    });

    User.set2FASecret(req.user.id, secret.base32);

    const qrCodeUrl = await QRCode.toDataURL(secret.otpauth_url);

    res.json({
      secret: secret.base32,
      qrCode: qrCodeUrl,
      message: 'Scan the QR code with your authenticator app, then verify with a code.'
    });
  } catch (err) {
    console.error('2FA setup error:', err);
    res.status(500).json({ error: '2FA setup failed.' });
  }
});

// ============================================================
// POST /api/auth/enable-2fa - Confirm and enable 2FA
// ============================================================
router.post('/enable-2fa', isAuthenticated, [
  body('token').isLength({ min: 6, max: 6 }).isNumeric(),
], (req, res) => {
  try {
    const fullUser = User.findByEmail(req.user.email);
    if (!fullUser || !fullUser.two_factor_secret) {
      return res.status(400).json({ error: 'Please set up 2FA first.' });
    }

    const verified = speakeasy.totp.verify({
      secret: fullUser.two_factor_secret,
      encoding: 'base32',
      token: req.body.token,
      window: 1,
    });

    if (!verified) {
      return res.status(400).json({ error: 'Invalid code. Please try again.' });
    }

    User.enable2FA(req.user.id);
    logAction(req.user.id, '2FA_ENABLED', 'users', req.user.id, '2FA enabled', req.ip);

    res.json({ message: 'Two-factor authentication enabled successfully.' });
  } catch (err) {
    console.error('Enable 2FA error:', err);
    res.status(500).json({ error: 'Failed to enable 2FA.' });
  }
});

// ============================================================
// POST /api/auth/disable-2fa - Disable 2FA
// ============================================================
router.post('/disable-2fa', isAuthenticated, [
  body('password').notEmpty(),
], async (req, res) => {
  try {
    const fullUser = User.findByEmail(req.user.email);
    const isMatch = await bcrypt.compare(req.body.password, fullUser.password);

    if (!isMatch) {
      return res.status(401).json({ error: 'Invalid password.' });
    }

    User.disable2FA(req.user.id);
    logAction(req.user.id, '2FA_DISABLED', 'users', req.user.id, '2FA disabled', req.ip);

    res.json({ message: 'Two-factor authentication disabled.' });
  } catch (err) {
    console.error('Disable 2FA error:', err);
    res.status(500).json({ error: 'Failed to disable 2FA.' });
  }
});

// ============================================================
// POST /api/auth/forgot-password - Request password reset
// ============================================================
router.post('/forgot-password', [
  body('email').isEmail().normalizeEmail(),
], (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const user = User.findByEmail(req.body.email);

    // Always return success to prevent email enumeration
    if (!user) {
      return res.json({ message: 'If an account with that email exists, a reset link has been sent.' });
    }

    const token = crypto.randomBytes(32).toString('hex');
    const expires = new Date(Date.now() + 3600000).toISOString(); // 1 hour

    User.setResetToken(user.id, token, expires);
    logAction(user.id, 'PASSWORD_RESET_REQUEST', 'users', user.id, 'Password reset requested', req.ip);

    // In production, send an email with the reset link
    // For demo purposes, we return the token
    res.json({
      message: 'If an account with that email exists, a reset link has been sent.',
      // DEV ONLY - remove in production:
      _dev_reset_token: token,
    });
  } catch (err) {
    console.error('Forgot password error:', err);
    res.status(500).json({ error: 'Password reset request failed.' });
  }
});

// ============================================================
// POST /api/auth/reset-password - Reset password with token
// ============================================================
router.post('/reset-password', [
  body('token').notEmpty().withMessage('Reset token is required'),
  body('password').isLength({ min: 8 })
    .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/).withMessage('Password must contain uppercase, lowercase, and number'),
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const user = User.findByResetToken(req.body.token);
    if (!user) {
      return res.status(400).json({ error: 'Invalid or expired reset token.' });
    }

    await User.updatePassword(user.id, req.body.password);
    User.clearResetToken(user.id);
    logAction(user.id, 'PASSWORD_RESET', 'users', user.id, 'Password reset completed', req.ip);

    res.json({ message: 'Password reset successful. You can now log in with your new password.' });
  } catch (err) {
    console.error('Reset password error:', err);
    res.status(500).json({ error: 'Password reset failed.' });
  }
});

// ============================================================
// POST /api/auth/change-password - Change password (logged in)
// ============================================================
router.post('/change-password', isAuthenticated, [
  body('current_password').notEmpty(),
  body('new_password').isLength({ min: 8 })
    .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/),
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const fullUser = User.findByEmail(req.user.email);
    const isMatch = await bcrypt.compare(req.body.current_password, fullUser.password);

    if (!isMatch) {
      return res.status(401).json({ error: 'Current password is incorrect.' });
    }

    await User.updatePassword(req.user.id, req.body.new_password);
    logAction(req.user.id, 'PASSWORD_CHANGED', 'users', req.user.id, 'Password changed', req.ip);

    res.json({ message: 'Password changed successfully.' });
  } catch (err) {
    console.error('Change password error:', err);
    res.status(500).json({ error: 'Password change failed.' });
  }
});

// ============================================================
// POST /api/auth/logout - End session
// ============================================================
router.post('/logout', (req, res) => {
  const userId = req.session?.userId;
  req.session.destroy((err) => {
    if (err) {
      console.error('Logout error:', err);
      return res.status(500).json({ error: 'Logout failed.' });
    }
    if (userId) {
      logAction(userId, 'LOGOUT', 'users', userId, 'User logged out', req.ip);
    }
    res.clearCookie('healthbridge.sid');
    res.json({ message: 'Logged out successfully.' });
  });
});

// ============================================================
// GET /api/auth/me - Get current user info
// ============================================================
router.get('/me', isAuthenticated, (req, res) => {
  const user = User.findById(req.user.id);
  if (!user) {
    return res.status(404).json({ error: 'User not found.' });
  }
  res.json({ user });
});

// ============================================================
// GET /api/auth/session - Check session status
// ============================================================
router.get('/session', (req, res) => {
  if (req.session && req.session.userId) {
    const user = User.findById(req.session.userId);
    if (user && user.is_active) {
      return res.json({
        authenticated: true,
        twoFactorVerified: req.session.twoFactorVerified !== false,
        user: {
          id: user.id,
          email: user.email,
          first_name: user.first_name,
          last_name: user.last_name,
          role: user.role,
        }
      });
    }
  }
  res.json({ authenticated: false });
});

module.exports = router;
