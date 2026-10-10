const Database = require('better-sqlite3');
const path = require('path');

const DB_PATH = process.env.DB_PATH || path.join(__dirname, '..', 'data', 'portal.db');

let db;

function getDatabase() {
  if (!db) {
    db = new Database(DB_PATH);
    db.pragma('journal_mode = WAL');
    db.pragma('foreign_keys = ON');
    initializeTables();
    migrateSchema();
    installAuditTriggers();
  }
  return db;
}

// Add columns introduced after the original schema to databases created
// before them. SQLite has no "ADD COLUMN IF NOT EXISTS", so check first.
function ensureColumn(table, column, definition) {
  const cols = db.prepare(`PRAGMA table_info(${table})`).all().map(c => c.name);
  if (!cols.includes(column)) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
  }
}

function migrateSchema() {
  // AC-7: per-account lockout after repeated failed logins
  ensureColumn('users', 'failed_login_count', 'INTEGER DEFAULT 0');
  ensureColumn('users', 'locked_until', 'TEXT');
  // AU-9: hash chain over audit rows (tamper evidence)
  ensureColumn('audit_log', 'prev_hash', 'TEXT');
  ensureColumn('audit_log', 'hash', 'TEXT');
}

// AU-9: the audit log is append-only at the database layer. Application code
// cannot UPDATE or DELETE audit rows; the seed script drops these triggers
// explicitly when it resets the demo database.
function installAuditTriggers() {
  db.exec(`
    CREATE TRIGGER IF NOT EXISTS audit_log_no_update
    BEFORE UPDATE ON audit_log
    BEGIN SELECT RAISE(ABORT, 'audit_log is append-only'); END;

    CREATE TRIGGER IF NOT EXISTS audit_log_no_delete
    BEFORE DELETE ON audit_log
    BEGIN SELECT RAISE(ABORT, 'audit_log is append-only'); END;
  `);
}

function dropAuditTriggers() {
  db.exec(`
    DROP TRIGGER IF EXISTS audit_log_no_update;
    DROP TRIGGER IF EXISTS audit_log_no_delete;
  `);
}

function initializeTables() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT UNIQUE NOT NULL,
      password TEXT NOT NULL,
      first_name TEXT NOT NULL,
      last_name TEXT NOT NULL,
      role TEXT NOT NULL CHECK(role IN ('admin', 'doctor', 'patient')),
      phone TEXT,
      date_of_birth TEXT,
      gender TEXT,
      address TEXT,
      specialty TEXT,
      license_number TEXT,
      insurance_id TEXT,
      emergency_contact TEXT,
      emergency_phone TEXT,
      profile_image TEXT DEFAULT '/images/default-avatar.png',
      two_factor_secret TEXT,
      two_factor_enabled INTEGER DEFAULT 0,
      password_reset_token TEXT,
      password_reset_expires TEXT,
      is_active INTEGER DEFAULT 1,
      last_login TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS appointments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      patient_id INTEGER NOT NULL,
      doctor_id INTEGER NOT NULL,
      date TEXT NOT NULL,
      time TEXT NOT NULL,
      duration INTEGER DEFAULT 30,
      type TEXT NOT NULL DEFAULT 'checkup',
      status TEXT DEFAULT 'scheduled' CHECK(status IN ('scheduled', 'confirmed', 'in-progress', 'completed', 'cancelled', 'no-show')),
      reason TEXT,
      notes TEXT,
      location TEXT DEFAULT 'Main Office',
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (patient_id) REFERENCES users(id),
      FOREIGN KEY (doctor_id) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      sender_id INTEGER NOT NULL,
      recipient_id INTEGER NOT NULL,
      subject TEXT NOT NULL,
      body TEXT NOT NULL,
      is_read INTEGER DEFAULT 0,
      is_urgent INTEGER DEFAULT 0,
      parent_id INTEGER,
      attachment_name TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (sender_id) REFERENCES users(id),
      FOREIGN KEY (recipient_id) REFERENCES users(id),
      FOREIGN KEY (parent_id) REFERENCES messages(id)
    );

    CREATE TABLE IF NOT EXISTS prescriptions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      patient_id INTEGER NOT NULL,
      doctor_id INTEGER NOT NULL,
      medication TEXT NOT NULL,
      dosage TEXT NOT NULL,
      frequency TEXT NOT NULL,
      start_date TEXT NOT NULL,
      end_date TEXT,
      refills_remaining INTEGER DEFAULT 0,
      refills_total INTEGER DEFAULT 0,
      status TEXT DEFAULT 'active' CHECK(status IN ('active', 'completed', 'cancelled', 'expired')),
      pharmacy TEXT,
      instructions TEXT,
      side_effects TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (patient_id) REFERENCES users(id),
      FOREIGN KEY (doctor_id) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS lab_results (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      patient_id INTEGER NOT NULL,
      doctor_id INTEGER NOT NULL,
      test_name TEXT NOT NULL,
      category TEXT NOT NULL,
      result_value TEXT NOT NULL,
      reference_range TEXT,
      unit TEXT,
      status TEXT DEFAULT 'normal' CHECK(status IN ('normal', 'abnormal', 'critical', 'pending')),
      notes TEXT,
      test_date TEXT NOT NULL,
      result_date TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (patient_id) REFERENCES users(id),
      FOREIGN KEY (doctor_id) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS billing (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      patient_id INTEGER NOT NULL,
      appointment_id INTEGER,
      description TEXT NOT NULL,
      amount REAL NOT NULL,
      insurance_covered REAL DEFAULT 0,
      patient_responsibility REAL NOT NULL,
      status TEXT DEFAULT 'pending' CHECK(status IN ('pending', 'paid', 'overdue', 'insurance_processing', 'denied')),
      due_date TEXT,
      paid_date TEXT,
      payment_method TEXT,
      invoice_number TEXT UNIQUE,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (patient_id) REFERENCES users(id),
      FOREIGN KEY (appointment_id) REFERENCES appointments(id)
    );

    CREATE TABLE IF NOT EXISTS notifications (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      type TEXT NOT NULL,
      title TEXT NOT NULL,
      message TEXT NOT NULL,
      is_read INTEGER DEFAULT 0,
      link TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (user_id) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS sessions (
      sid TEXT PRIMARY KEY,
      sess TEXT NOT NULL,
      expired TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS audit_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER,
      action TEXT NOT NULL,
      resource TEXT,
      resource_id INTEGER,
      details TEXT,
      ip_address TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (user_id) REFERENCES users(id)
    );
  `);
}

function closeDatabase() {
  if (db) {
    db.close();
    db = null;
  }
}

module.exports = { getDatabase, closeDatabase, installAuditTriggers, dropAuditTriggers };
