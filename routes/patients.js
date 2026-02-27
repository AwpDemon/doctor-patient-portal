const express = require('express');
const router = express.Router();
const User = require('../models/User');
const Appointment = require('../models/Appointment');
const Prescription = require('../models/Prescription');
const { isAuthenticated, requireRole, logAction } = require('../middleware/auth');
const { getDatabase } = require('../config/db');

router.use(isAuthenticated);

// ============================================================
// GET /api/patients - List patients (doctor/admin)
// ============================================================
router.get('/', requireRole('doctor', 'admin'), (req, res) => {
  try {
    const db = getDatabase();
    let patients;

    if (req.user.role === 'doctor') {
      // Doctor sees only their patients
      patients = db.prepare(`
        SELECT DISTINCT u.id, u.first_name, u.last_name, u.email, u.phone,
               u.date_of_birth, u.gender, u.insurance_id, u.created_at,
               (SELECT COUNT(*) FROM appointments WHERE patient_id = u.id AND doctor_id = ?) as appointment_count,
               (SELECT MAX(date) FROM appointments WHERE patient_id = u.id AND doctor_id = ?) as last_visit
        FROM users u
        JOIN appointments a ON u.id = a.patient_id AND a.doctor_id = ?
        WHERE u.role = 'patient' AND u.is_active = 1
        ORDER BY u.last_name, u.first_name
      `).all(req.user.id, req.user.id, req.user.id);
    } else {
      // Admin sees all patients
      patients = db.prepare(`
        SELECT u.id, u.first_name, u.last_name, u.email, u.phone,
               u.date_of_birth, u.gender, u.insurance_id, u.is_active, u.created_at,
               (SELECT COUNT(*) FROM appointments WHERE patient_id = u.id) as appointment_count,
               (SELECT MAX(date) FROM appointments WHERE patient_id = u.id) as last_visit
        FROM users u
        WHERE u.role = 'patient'
        ORDER BY u.last_name, u.first_name
      `).all();
    }

    res.json({ patients });
  } catch (err) {
    console.error('Get patients error:', err);
    res.status(500).json({ error: 'Failed to retrieve patients.' });
  }
});

// ============================================================
// GET /api/patients/:id - Get patient detail
// ============================================================
router.get('/:id', (req, res) => {
  try {
    const patientId = parseInt(req.params.id);

    // Patients can only view their own profile
    if (req.user.role === 'patient' && req.user.id !== patientId) {
      return res.status(403).json({ error: 'Access denied.' });
    }

    const patient = User.findById(patientId);
    if (!patient || patient.role !== 'patient') {
      return res.status(404).json({ error: 'Patient not found.' });
    }

    // If doctor, verify they have access to this patient
    if (req.user.role === 'doctor') {
      const db = getDatabase();
      const hasAccess = db.prepare(
        'SELECT COUNT(*) as count FROM appointments WHERE doctor_id = ? AND patient_id = ?'
      ).get(req.user.id, patientId);

      if (hasAccess.count === 0) {
        return res.status(403).json({ error: 'This patient is not assigned to you.' });
      }
    }

    res.json({ patient });
  } catch (err) {
    console.error('Get patient error:', err);
    res.status(500).json({ error: 'Failed to retrieve patient details.' });
  }
});

// ============================================================
// GET /api/patients/:id/records - Complete patient records
// ============================================================
router.get('/:id/records', requireRole('doctor', 'admin'), (req, res) => {
  try {
    const patientId = parseInt(req.params.id);
    const db = getDatabase();

    const patient = User.findById(patientId);
    if (!patient) {
      return res.status(404).json({ error: 'Patient not found.' });
    }

    const appointments = Appointment.getByPatient(patientId, { limit: 20 });
    const prescriptions = Prescription.getByPatient(patientId);

    const labResults = db.prepare(`
      SELECT lr.*, d.first_name as doctor_first, d.last_name as doctor_last
      FROM lab_results lr
      JOIN users d ON lr.doctor_id = d.id
      WHERE lr.patient_id = ?
      ORDER BY lr.test_date DESC
    `).all(patientId);

    const billing = db.prepare(`
      SELECT * FROM billing WHERE patient_id = ? ORDER BY created_at DESC
    `).all(patientId);

    logAction(req.user.id, 'VIEW_PATIENT_RECORDS', 'users', patientId,
      `Viewed patient records for user ${patientId}`, req.ip);

    res.json({
      patient,
      appointments,
      prescriptions,
      labResults,
      billing,
    });
  } catch (err) {
    console.error('Get patient records error:', err);
    res.status(500).json({ error: 'Failed to retrieve patient records.' });
  }
});

// ============================================================
// GET /api/patients/:id/lab-results - Patient lab results
// ============================================================
router.get('/:id/lab-results', (req, res) => {
  try {
    const patientId = parseInt(req.params.id);

    if (req.user.role === 'patient' && req.user.id !== patientId) {
      return res.status(403).json({ error: 'Access denied.' });
    }

    const db = getDatabase();
    const results = db.prepare(`
      SELECT lr.*, d.first_name as doctor_first, d.last_name as doctor_last
      FROM lab_results lr
      JOIN users d ON lr.doctor_id = d.id
      WHERE lr.patient_id = ?
      ORDER BY lr.test_date DESC
    `).all(patientId);

    res.json({ labResults: results });
  } catch (err) {
    console.error('Get lab results error:', err);
    res.status(500).json({ error: 'Failed to retrieve lab results.' });
  }
});

// ============================================================
// POST /api/patients/:id/lab-results - Add lab result (doctor)
// ============================================================
router.post('/:id/lab-results', requireRole('doctor'), (req, res) => {
  try {
    const patientId = parseInt(req.params.id);
    const db = getDatabase();

    const result = db.prepare(`
      INSERT INTO lab_results (patient_id, doctor_id, test_name, category, result_value,
                                reference_range, unit, status, notes, test_date, result_date)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      patientId,
      req.user.id,
      req.body.test_name,
      req.body.category,
      req.body.result_value,
      req.body.reference_range || null,
      req.body.unit || null,
      req.body.status || 'normal',
      req.body.notes || null,
      req.body.test_date,
      req.body.result_date || new Date().toISOString().split('T')[0]
    );

    // Notify patient
    db.prepare(`
      INSERT INTO notifications (user_id, type, title, message, link)
      VALUES (?, 'lab_result', 'Lab Results Available', ?, '/lab-results')
    `).run(patientId, `New ${req.body.category} results from Dr. ${req.user.last_name} are available.`);

    logAction(req.user.id, 'CREATE_LAB_RESULT', 'lab_results', result.lastInsertRowid,
      `Lab result added for patient ${patientId}`, req.ip);

    res.status(201).json({
      message: 'Lab result added.',
      labResult: db.prepare('SELECT * FROM lab_results WHERE id = ?').get(result.lastInsertRowid),
    });
  } catch (err) {
    console.error('Add lab result error:', err);
    res.status(500).json({ error: 'Failed to add lab result.' });
  }
});

// ============================================================
// GET /api/patients/:id/billing - Patient billing
// ============================================================
router.get('/:id/billing', (req, res) => {
  try {
    const patientId = parseInt(req.params.id);

    if (req.user.role === 'patient' && req.user.id !== patientId) {
      return res.status(403).json({ error: 'Access denied.' });
    }

    const db = getDatabase();
    const bills = db.prepare(`
      SELECT b.*, a.date as appointment_date, a.type as appointment_type
      FROM billing b
      LEFT JOIN appointments a ON b.appointment_id = a.id
      WHERE b.patient_id = ?
      ORDER BY b.created_at DESC
    `).all(patientId);

    const summary = db.prepare(`
      SELECT
        COALESCE(SUM(amount), 0) as total_charges,
        COALESCE(SUM(insurance_covered), 0) as total_insurance,
        COALESCE(SUM(patient_responsibility), 0) as total_patient,
        COALESCE(SUM(CASE WHEN status = 'paid' THEN patient_responsibility ELSE 0 END), 0) as total_paid,
        COALESCE(SUM(CASE WHEN status IN ('pending', 'overdue') THEN patient_responsibility ELSE 0 END), 0) as outstanding
      FROM billing WHERE patient_id = ?
    `).get(patientId);

    res.json({ bills, summary });
  } catch (err) {
    console.error('Get billing error:', err);
    res.status(500).json({ error: 'Failed to retrieve billing information.' });
  }
});

// ============================================================
// POST /api/patients/:id/billing - Create billing entry (admin)
// ============================================================
router.post('/:id/billing', requireRole('admin', 'doctor'), (req, res) => {
  try {
    const patientId = parseInt(req.params.id);
    const db = getDatabase();

    const invoiceNumber = `INV-${Date.now().toString(36).toUpperCase()}`;

    const result = db.prepare(`
      INSERT INTO billing (patient_id, appointment_id, description, amount,
                            insurance_covered, patient_responsibility, status,
                            due_date, invoice_number)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      patientId,
      req.body.appointment_id || null,
      req.body.description,
      req.body.amount,
      req.body.insurance_covered || 0,
      req.body.patient_responsibility || req.body.amount,
      'pending',
      req.body.due_date || null,
      invoiceNumber
    );

    logAction(req.user.id, 'CREATE_BILLING', 'billing', result.lastInsertRowid,
      `Billing entry created for patient ${patientId}`, req.ip);

    res.status(201).json({
      message: 'Billing entry created.',
      bill: db.prepare('SELECT * FROM billing WHERE id = ?').get(result.lastInsertRowid),
    });
  } catch (err) {
    console.error('Create billing error:', err);
    res.status(500).json({ error: 'Failed to create billing entry.' });
  }
});

// ============================================================
// PUT /api/patients/:id/billing/:billId/pay - Mark bill as paid
// ============================================================
router.put('/:id/billing/:billId/pay', (req, res) => {
  try {
    const patientId = parseInt(req.params.id);
    const billId = parseInt(req.params.billId);

    if (req.user.role === 'patient' && req.user.id !== patientId) {
      return res.status(403).json({ error: 'Access denied.' });
    }

    const db = getDatabase();
    db.prepare(`
      UPDATE billing SET status = 'paid', paid_date = datetime('now'),
        payment_method = ?, updated_at = datetime('now')
      WHERE id = ? AND patient_id = ?
    `).run(req.body.payment_method || 'online', billId, patientId);

    logAction(req.user.id, 'PAY_BILL', 'billing', billId,
      `Bill paid for patient ${patientId}`, req.ip);

    res.json({ message: 'Payment recorded.', bill: db.prepare('SELECT * FROM billing WHERE id = ?').get(billId) });
  } catch (err) {
    console.error('Pay bill error:', err);
    res.status(500).json({ error: 'Failed to process payment.' });
  }
});

module.exports = router;
