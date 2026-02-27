const { getDatabase } = require('../config/db');

class Appointment {
  static findById(id) {
    const db = getDatabase();
    return db.prepare(`
      SELECT a.*,
             p.first_name as patient_first, p.last_name as patient_last, p.email as patient_email,
             d.first_name as doctor_first, d.last_name as doctor_last, d.specialty as doctor_specialty
      FROM appointments a
      JOIN users p ON a.patient_id = p.id
      JOIN users d ON a.doctor_id = d.id
      WHERE a.id = ?
    `).get(id);
  }

  static create(data) {
    const db = getDatabase();
    const stmt = db.prepare(`
      INSERT INTO appointments (patient_id, doctor_id, date, time, duration, type, status, reason, notes, location)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const result = stmt.run(
      data.patient_id,
      data.doctor_id,
      data.date,
      data.time,
      data.duration || 30,
      data.type || 'checkup',
      data.status || 'scheduled',
      data.reason || null,
      data.notes || null,
      data.location || 'Main Office'
    );

    return Appointment.findById(result.lastInsertRowid);
  }

  static update(id, updates) {
    const db = getDatabase();
    const allowedFields = ['date', 'time', 'duration', 'type', 'status', 'reason', 'notes', 'location'];
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
    values.push(id);

    db.prepare(`UPDATE appointments SET ${setClauses.join(', ')} WHERE id = ?`).run(...values);
    return Appointment.findById(id);
  }

  static cancel(id) {
    return Appointment.update(id, { status: 'cancelled' });
  }

  static getByPatient(patientId, filters = {}) {
    const db = getDatabase();
    let query = `
      SELECT a.*,
             d.first_name as doctor_first, d.last_name as doctor_last, d.specialty as doctor_specialty
      FROM appointments a
      JOIN users d ON a.doctor_id = d.id
      WHERE a.patient_id = ?
    `;
    const params = [patientId];

    if (filters.status) {
      query += ' AND a.status = ?';
      params.push(filters.status);
    }
    if (filters.from) {
      query += ' AND a.date >= ?';
      params.push(filters.from);
    }
    if (filters.to) {
      query += ' AND a.date <= ?';
      params.push(filters.to);
    }

    query += ' ORDER BY a.date DESC, a.time DESC';

    if (filters.limit) {
      query += ' LIMIT ?';
      params.push(filters.limit);
    }

    return db.prepare(query).all(...params);
  }

  static getByDoctor(doctorId, filters = {}) {
    const db = getDatabase();
    let query = `
      SELECT a.*,
             p.first_name as patient_first, p.last_name as patient_last, p.email as patient_email, p.phone as patient_phone
      FROM appointments a
      JOIN users p ON a.patient_id = p.id
      WHERE a.doctor_id = ?
    `;
    const params = [doctorId];

    if (filters.status) {
      query += ' AND a.status = ?';
      params.push(filters.status);
    }
    if (filters.date) {
      query += ' AND a.date = ?';
      params.push(filters.date);
    }
    if (filters.from) {
      query += ' AND a.date >= ?';
      params.push(filters.from);
    }
    if (filters.to) {
      query += ' AND a.date <= ?';
      params.push(filters.to);
    }

    query += ' ORDER BY a.date ASC, a.time ASC';

    if (filters.limit) {
      query += ' LIMIT ?';
      params.push(filters.limit);
    }

    return db.prepare(query).all(...params);
  }

  static getUpcoming(userId, role, limit = 5) {
    const db = getDatabase();
    const today = new Date().toISOString().split('T')[0];
    const field = role === 'doctor' ? 'doctor_id' : 'patient_id';

    return db.prepare(`
      SELECT a.*,
             p.first_name as patient_first, p.last_name as patient_last,
             d.first_name as doctor_first, d.last_name as doctor_last, d.specialty as doctor_specialty
      FROM appointments a
      JOIN users p ON a.patient_id = p.id
      JOIN users d ON a.doctor_id = d.id
      WHERE a.${field} = ? AND a.date >= ? AND a.status IN ('scheduled', 'confirmed')
      ORDER BY a.date ASC, a.time ASC
      LIMIT ?
    `).all(userId, today, limit);
  }

  static getTodaysAppointments(doctorId) {
    const db = getDatabase();
    const today = new Date().toISOString().split('T')[0];

    return db.prepare(`
      SELECT a.*,
             p.first_name as patient_first, p.last_name as patient_last, p.phone as patient_phone
      FROM appointments a
      JOIN users p ON a.patient_id = p.id
      WHERE a.doctor_id = ? AND a.date = ? AND a.status != 'cancelled'
      ORDER BY a.time ASC
    `).all(doctorId, today);
  }

  static getAvailableSlots(doctorId, date) {
    const db = getDatabase();
    const booked = db.prepare(`
      SELECT time, duration FROM appointments
      WHERE doctor_id = ? AND date = ? AND status != 'cancelled'
    `).all(doctorId, date);

    const allSlots = [];
    for (let hour = 8; hour < 17; hour++) {
      for (let min = 0; min < 60; min += 30) {
        allSlots.push(`${String(hour).padStart(2, '0')}:${String(min).padStart(2, '0')}`);
      }
    }

    const bookedTimes = new Set(booked.map(b => b.time));
    return allSlots.filter(slot => !bookedTimes.has(slot));
  }

  static getStats(userId, role) {
    const db = getDatabase();
    const field = role === 'doctor' ? 'doctor_id' : 'patient_id';
    const today = new Date().toISOString().split('T')[0];

    return {
      total: db.prepare(`SELECT COUNT(*) as count FROM appointments WHERE ${field} = ?`).get(userId).count,
      upcoming: db.prepare(`SELECT COUNT(*) as count FROM appointments WHERE ${field} = ? AND date >= ? AND status IN ('scheduled', 'confirmed')`).get(userId, today).count,
      completed: db.prepare(`SELECT COUNT(*) as count FROM appointments WHERE ${field} = ? AND status = 'completed'`).get(userId).count,
      cancelled: db.prepare(`SELECT COUNT(*) as count FROM appointments WHERE ${field} = ? AND status = 'cancelled'`).get(userId).count,
    };
  }

  static delete(id) {
    const db = getDatabase();
    db.prepare('DELETE FROM appointments WHERE id = ?').run(id);
  }
}

module.exports = Appointment;
