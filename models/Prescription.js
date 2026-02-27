const { getDatabase } = require('../config/db');

class Prescription {
  static findById(id) {
    const db = getDatabase();
    return db.prepare(`
      SELECT pr.*,
             p.first_name as patient_first, p.last_name as patient_last,
             d.first_name as doctor_first, d.last_name as doctor_last, d.specialty as doctor_specialty
      FROM prescriptions pr
      JOIN users p ON pr.patient_id = p.id
      JOIN users d ON pr.doctor_id = d.id
      WHERE pr.id = ?
    `).get(id);
  }

  static create(data) {
    const db = getDatabase();
    const stmt = db.prepare(`
      INSERT INTO prescriptions (patient_id, doctor_id, medication, dosage, frequency,
                                  start_date, end_date, refills_remaining, refills_total,
                                  pharmacy, instructions, side_effects)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const result = stmt.run(
      data.patient_id,
      data.doctor_id,
      data.medication,
      data.dosage,
      data.frequency,
      data.start_date,
      data.end_date || null,
      data.refills_remaining || 0,
      data.refills_total || 0,
      data.pharmacy || null,
      data.instructions || null,
      data.side_effects || null
    );

    return Prescription.findById(result.lastInsertRowid);
  }

  static update(id, updates) {
    const db = getDatabase();
    const allowedFields = [
      'medication', 'dosage', 'frequency', 'start_date', 'end_date',
      'refills_remaining', 'refills_total', 'status', 'pharmacy',
      'instructions', 'side_effects'
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
    values.push(id);

    db.prepare(`UPDATE prescriptions SET ${setClauses.join(', ')} WHERE id = ?`).run(...values);
    return Prescription.findById(id);
  }

  static getByPatient(patientId, filters = {}) {
    const db = getDatabase();
    let query = `
      SELECT pr.*,
             d.first_name as doctor_first, d.last_name as doctor_last, d.specialty as doctor_specialty
      FROM prescriptions pr
      JOIN users d ON pr.doctor_id = d.id
      WHERE pr.patient_id = ?
    `;
    const params = [patientId];

    if (filters.status) {
      query += ' AND pr.status = ?';
      params.push(filters.status);
    }

    query += ' ORDER BY pr.created_at DESC';

    if (filters.limit) {
      query += ' LIMIT ?';
      params.push(filters.limit);
    }

    return db.prepare(query).all(...params);
  }

  static getByDoctor(doctorId, filters = {}) {
    const db = getDatabase();
    let query = `
      SELECT pr.*,
             p.first_name as patient_first, p.last_name as patient_last
      FROM prescriptions pr
      JOIN users p ON pr.patient_id = p.id
      WHERE pr.doctor_id = ?
    `;
    const params = [doctorId];

    if (filters.status) {
      query += ' AND pr.status = ?';
      params.push(filters.status);
    }
    if (filters.patient_id) {
      query += ' AND pr.patient_id = ?';
      params.push(filters.patient_id);
    }

    query += ' ORDER BY pr.created_at DESC';

    if (filters.limit) {
      query += ' LIMIT ?';
      params.push(filters.limit);
    }

    return db.prepare(query).all(...params);
  }

  static requestRefill(id) {
    const db = getDatabase();
    const rx = db.prepare('SELECT refills_remaining FROM prescriptions WHERE id = ?').get(id);

    if (!rx || rx.refills_remaining <= 0) {
      return { error: 'No refills remaining for this prescription.' };
    }

    db.prepare(`
      UPDATE prescriptions
      SET refills_remaining = refills_remaining - 1, updated_at = datetime('now')
      WHERE id = ?
    `).run(id);

    return Prescription.findById(id);
  }

  static getActiveMedications(patientId) {
    const db = getDatabase();
    return db.prepare(`
      SELECT pr.*, d.first_name as doctor_first, d.last_name as doctor_last
      FROM prescriptions pr
      JOIN users d ON pr.doctor_id = d.id
      WHERE pr.patient_id = ? AND pr.status = 'active'
      ORDER BY pr.start_date DESC
    `).all(patientId);
  }

  static delete(id) {
    const db = getDatabase();
    db.prepare('DELETE FROM prescriptions WHERE id = ?').run(id);
  }
}

module.exports = Prescription;
