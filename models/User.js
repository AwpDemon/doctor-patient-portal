const { getDatabase } = require('../config/db');
const bcrypt = require('bcryptjs');

class User {
  static findById(id) {
    const db = getDatabase();
    return db.prepare(`
      SELECT id, email, first_name, last_name, role, phone, date_of_birth,
             gender, address, specialty, license_number, insurance_id,
             emergency_contact, emergency_phone, profile_image,
             two_factor_enabled, is_active, last_login, created_at, updated_at
      FROM users WHERE id = ?
    `).get(id);
  }

  static findByEmail(email) {
    const db = getDatabase();
    return db.prepare('SELECT * FROM users WHERE email = ?').get(email.toLowerCase());
  }

  static findByRole(role) {
    const db = getDatabase();
    return db.prepare(`
      SELECT id, email, first_name, last_name, role, phone, specialty,
             license_number, profile_image, is_active, created_at
      FROM users WHERE role = ? AND is_active = 1
      ORDER BY last_name, first_name
    `).all(role);
  }

  static async create(userData) {
    const db = getDatabase();
    const hashedPassword = await bcrypt.hash(userData.password, 12);

    const stmt = db.prepare(`
      INSERT INTO users (email, password, first_name, last_name, role, phone,
                         date_of_birth, gender, address, specialty, license_number,
                         insurance_id, emergency_contact, emergency_phone)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const result = stmt.run(
      userData.email.toLowerCase(),
      hashedPassword,
      userData.first_name,
      userData.last_name,
      userData.role || 'patient',
      userData.phone || null,
      userData.date_of_birth || null,
      userData.gender || null,
      userData.address || null,
      userData.specialty || null,
      userData.license_number || null,
      userData.insurance_id || null,
      userData.emergency_contact || null,
      userData.emergency_phone || null
    );

    return User.findById(result.lastInsertRowid);
  }

  static async updatePassword(userId, newPassword) {
    const db = getDatabase();
    const hashedPassword = await bcrypt.hash(newPassword, 12);
    db.prepare("UPDATE users SET password = ?, updated_at = datetime('now') WHERE id = ?")
      .run(hashedPassword, userId);
  }

  static update(userId, updates) {
    const db = getDatabase();
    const allowedFields = [
      'first_name', 'last_name', 'phone', 'date_of_birth', 'gender',
      'address', 'specialty', 'license_number', 'insurance_id',
      'emergency_contact', 'emergency_phone', 'profile_image'
    ];

    const setClauses = [];
    const values = [];

    for (const [key, value] of Object.entries(updates)) {
      if (allowedFields.includes(key)) {
        setClauses.push(`${key} = ?`);
        values.push(value);
      }
    }

    if (setClauses.length === 0) return null;

    setClauses.push("updated_at = datetime('now')");
    values.push(userId);

    db.prepare(`UPDATE users SET ${setClauses.join(', ')} WHERE id = ?`).run(...values);
    return User.findById(userId);
  }

  static updateLastLogin(userId) {
    const db = getDatabase();
    db.prepare("UPDATE users SET last_login = datetime('now') WHERE id = ?").run(userId);
  }

  static setResetToken(userId, token, expires) {
    const db = getDatabase();
    db.prepare('UPDATE users SET password_reset_token = ?, password_reset_expires = ? WHERE id = ?')
      .run(token, expires, userId);
  }

  static findByResetToken(token) {
    const db = getDatabase();
    return db.prepare(`
      SELECT * FROM users
      WHERE password_reset_token = ? AND password_reset_expires > datetime('now')
    `).get(token);
  }

  static clearResetToken(userId) {
    const db = getDatabase();
    db.prepare('UPDATE users SET password_reset_token = NULL, password_reset_expires = NULL WHERE id = ?')
      .run(userId);
  }

  static set2FASecret(userId, secret) {
    const db = getDatabase();
    db.prepare('UPDATE users SET two_factor_secret = ? WHERE id = ?').run(secret, userId);
  }

  static enable2FA(userId) {
    const db = getDatabase();
    db.prepare('UPDATE users SET two_factor_enabled = 1 WHERE id = ?').run(userId);
  }

  static disable2FA(userId) {
    const db = getDatabase();
    db.prepare('UPDATE users SET two_factor_enabled = 0, two_factor_secret = NULL WHERE id = ?').run(userId);
  }

  static deactivate(userId) {
    const db = getDatabase();
    db.prepare('UPDATE users SET is_active = 0 WHERE id = ?').run(userId);
  }

  static activate(userId) {
    const db = getDatabase();
    db.prepare('UPDATE users SET is_active = 1 WHERE id = ?').run(userId);
  }

  static getAll(filters = {}) {
    const db = getDatabase();
    let query = `
      SELECT id, email, first_name, last_name, role, phone, specialty,
             is_active, last_login, created_at
      FROM users WHERE 1=1
    `;
    const params = [];

    if (filters.role) {
      query += ' AND role = ?';
      params.push(filters.role);
    }
    if (filters.active !== undefined) {
      query += ' AND is_active = ?';
      params.push(filters.active ? 1 : 0);
    }
    if (filters.search) {
      query += ' AND (first_name LIKE ? OR last_name LIKE ? OR email LIKE ?)';
      const searchTerm = `%${filters.search}%`;
      params.push(searchTerm, searchTerm, searchTerm);
    }

    query += ' ORDER BY created_at DESC';

    if (filters.limit) {
      query += ' LIMIT ?';
      params.push(filters.limit);
    }

    return db.prepare(query).all(...params);
  }

  static getStats() {
    const db = getDatabase();
    return {
      total: db.prepare('SELECT COUNT(*) as count FROM users').get().count,
      doctors: db.prepare("SELECT COUNT(*) as count FROM users WHERE role = 'doctor'").get().count,
      patients: db.prepare("SELECT COUNT(*) as count FROM users WHERE role = 'patient'").get().count,
      admins: db.prepare("SELECT COUNT(*) as count FROM users WHERE role = 'admin'").get().count,
      active: db.prepare('SELECT COUNT(*) as count FROM users WHERE is_active = 1').get().count,
    };
  }
}

module.exports = User;
