require('dotenv').config();
const express = require('express');
const session = require('express-session');
const helmet = require('helmet');
const cors = require('cors');
const morgan = require('morgan');
const path = require('path');

const { getDatabase, closeDatabase } = require('./config/db');
const { trackActivity } = require('./middleware/auth');

// Import routes
const authRoutes = require('./routes/auth');
const appointmentRoutes = require('./routes/appointments');
const messageRoutes = require('./routes/messages');
const patientRoutes = require('./routes/patients');
const prescriptionRoutes = require('./routes/prescriptions');
const dashboardRoutes = require('./routes/dashboard');

const app = express();
const PORT = process.env.PORT || 3000;

// ============================================================
// Middleware
// ============================================================

// Security headers, including a Content-Security-Policy (SC-18 / SI-10 defense
// in depth). Scripts may only load from this origin. The UI still uses inline
// onclick="" attributes, so script-src-attr allows them; removing that
// allowance requires refactoring those handlers (listed as a gap in
// docs/CONTROL_MAPPING.md).
app.use(helmet({
  contentSecurityPolicy: {
    useDefaults: true,
    directives: {
      'default-src': ["'self'"],
      'script-src': ["'self'"],
      'script-src-attr': ["'unsafe-inline'"],
      'style-src': ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
      'font-src': ["'self'", 'https://fonts.gstatic.com'],
      'img-src': ["'self'", 'data:'],
      'connect-src': ["'self'"],
      'object-src': ["'none'"],
      'frame-ancestors': ["'none'"],
    },
  },
}));

// CORS
app.use(cors({
  origin: process.env.NODE_ENV === 'production' ? false : true,
  credentials: true,
}));

// Request logging
if (process.env.NODE_ENV !== 'test') {
  app.use(morgan('dev'));
}

// Body parsing
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Session management
// IA-5 / SC-12: refuse to run in production with the published fallback
// secret, which would let anyone forge session cookies.
const DEV_SESSION_SECRET = 'healthbridge-dev-secret-change-in-production';
if (process.env.NODE_ENV === 'production' &&
    (!process.env.SESSION_SECRET || process.env.SESSION_SECRET === DEV_SESSION_SECRET)) {
  throw new Error('SESSION_SECRET must be set to a unique value when NODE_ENV=production.');
}

const SqliteSessionStore = require('./config/sessionStore');

app.use(session({
  store: new SqliteSessionStore(),
  name: 'healthbridge.sid',
  secret: process.env.SESSION_SECRET || DEV_SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    maxAge: 24 * 60 * 60 * 1000, // 24 hours
    sameSite: 'lax',
  },
}));

// Activity tracking
app.use(trackActivity);

// Static files
app.use(express.static(path.join(__dirname, 'public')));

// ============================================================
// API Routes
// ============================================================

app.use('/api/auth', authRoutes);
app.use('/api/appointments', appointmentRoutes);
app.use('/api/messages', messageRoutes);
app.use('/api/patients', patientRoutes);
app.use('/api/prescriptions', prescriptionRoutes);
app.use('/api/dashboard', dashboardRoutes);

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
  });
});

// Doctors list (public, for appointment booking)
app.get('/api/doctors', (req, res) => {
  try {
    const User = require('./models/User');
    const doctors = User.findByRole('doctor');
    res.json({ doctors });
  } catch (err) {
    console.error('Get doctors error:', err);
    res.status(500).json({ error: 'Failed to retrieve doctors.' });
  }
});

// ============================================================
// SPA fallback - serve index.html for all non-API routes
// ============================================================
app.get('*', (req, res) => {
  if (!req.path.startsWith('/api')) {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
  } else {
    res.status(404).json({ error: 'API endpoint not found.' });
  }
});

// ============================================================
// Error handling
// ============================================================

app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({
    error: process.env.NODE_ENV === 'production'
      ? 'An unexpected error occurred.'
      : err.message,
  });
});

// ============================================================
// Start server
// ============================================================

// Initialize database
getDatabase();

if (process.env.NODE_ENV !== 'test') {
  app.listen(PORT, () => {
    console.log(`\n  HealthBridge Portal Server`);
    console.log(`  ========================`);
    console.log(`  Environment: ${process.env.NODE_ENV || 'development'}`);
    console.log(`  Server:      http://localhost:${PORT}`);
    console.log(`  API Base:    http://localhost:${PORT}/api`);
    console.log(`  ========================\n`);
  });
}

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('\nShutting down gracefully...');
  closeDatabase();
  process.exit(0);
});

process.on('SIGTERM', () => {
  closeDatabase();
  process.exit(0);
});

module.exports = app;
