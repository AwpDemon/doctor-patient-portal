const express = require('express');
const router = express.Router();
const { body, validationResult } = require('express-validator');
const Prescription = require('../models/Prescription');
const User = require('../models/User');
const { isAuthenticated, requireRole, logAction } = require('../middleware/auth');
const { getDatabase } = require('../config/db');

router.use(isAuthenticated);

// ============================================================
// GET /api/prescriptions - List prescriptions for current user
// ============================================================
router.get('/', (req, res) => {
  try {
    const { status, limit } = req.query;
    const filters = { status, limit: limit ? parseInt(limit) : undefined };

    let prescriptions;
    if (req.user.role === 'patient') {
      prescriptions = Prescription.getByPatient(req.user.id, filters);
    } else if (req.user.role === 'doctor') {
      prescriptions = Prescription.getByDoctor(req.user.id, filters);
    } else {
      const db = getDatabase();
      prescriptions = db.prepare(`
        SELECT pr.*,
               p.first_name as patient_first, p.last_name as patient_last,
               d.first_name as doctor_first, d.last_name as doctor_last
        FROM prescriptions pr
        JOIN users p ON pr.patient_id = p.id
        JOIN users d ON pr.doctor_id = d.id
        ORDER BY pr.created_at DESC
        ${limit ? 'LIMIT ?' : ''}
      `).all(...(limit ? [parseInt(limit)] : []));
    }

    res.json({ prescriptions });
  } catch (err) {
    console.error('Get prescriptions error:', err);
    res.status(500).json({ error: 'Failed to retrieve prescriptions.' });
  }
});

// ============================================================
// GET /api/prescriptions/active - Active medications
// ============================================================
router.get('/active', (req, res) => {
  try {
    let patientId;
    if (req.user.role === 'patient') {
      patientId = req.user.id;
    } else if (req.query.patient_id) {
      patientId = parseInt(req.query.patient_id);
    } else {
      return res.status(400).json({ error: 'patient_id is required.' });
    }

    const medications = Prescription.getActiveMedications(patientId);
    res.json({ medications });
  } catch (err) {
    console.error('Get active medications error:', err);
    res.status(500).json({ error: 'Failed to retrieve active medications.' });
  }
});

// ============================================================
// GET /api/prescriptions/:id - Get single prescription
// ============================================================
router.get('/:id', (req, res) => {
  try {
    const prescription = Prescription.findById(parseInt(req.params.id));

    if (!prescription) {
      return res.status(404).json({ error: 'Prescription not found.' });
    }

    if (req.user.role === 'patient' && prescription.patient_id !== req.user.id) {
      return res.status(403).json({ error: 'Access denied.' });
    }
    if (req.user.role === 'doctor' && prescription.doctor_id !== req.user.id) {
      return res.status(403).json({ error: 'Access denied.' });
    }

    res.json({ prescription });
  } catch (err) {
    console.error('Get prescription error:', err);
    res.status(500).json({ error: 'Failed to retrieve prescription.' });
  }
});

// ============================================================
// POST /api/prescriptions - Create prescription (doctor only)
// ============================================================
router.post('/', requireRole('doctor'), [
  body('patient_id').isInt().withMessage('Patient is required'),
  body('medication').trim().notEmpty().withMessage('Medication name is required'),
  body('dosage').trim().notEmpty().withMessage('Dosage is required'),
  body('frequency').trim().notEmpty().withMessage('Frequency is required'),
  body('start_date').isDate().withMessage('Start date is required'),
], (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    // Verify patient exists
    const patient = User.findById(parseInt(req.body.patient_id));
    if (!patient || patient.role !== 'patient') {
      return res.status(400).json({ error: 'Invalid patient.' });
    }

    const prescription = Prescription.create({
      patient_id: parseInt(req.body.patient_id),
      doctor_id: req.user.id,
      medication: req.body.medication,
      dosage: req.body.dosage,
      frequency: req.body.frequency,
      start_date: req.body.start_date,
      end_date: req.body.end_date,
      refills_remaining: req.body.refills || 0,
      refills_total: req.body.refills || 0,
      pharmacy: req.body.pharmacy,
      instructions: req.body.instructions,
      side_effects: req.body.side_effects,
    });

    // Notify patient
    const db = getDatabase();
    db.prepare(`
      INSERT INTO notifications (user_id, type, title, message, link)
      VALUES (?, 'prescription', 'New Prescription', ?, '/prescriptions')
    `).run(
      parseInt(req.body.patient_id),
      `Dr. ${req.user.last_name} prescribed ${req.body.medication} (${req.body.dosage}).`
    );

    logAction(req.user.id, 'CREATE_PRESCRIPTION', 'prescriptions', prescription.id,
      `Prescription created: ${req.body.medication} for patient ${req.body.patient_id}`, req.ip);

    res.status(201).json({ message: 'Prescription created.', prescription });
  } catch (err) {
    console.error('Create prescription error:', err);
    res.status(500).json({ error: 'Failed to create prescription.' });
  }
});

// ============================================================
// PUT /api/prescriptions/:id - Update prescription (doctor)
// ============================================================
router.put('/:id', requireRole('doctor'), (req, res) => {
  try {
    const prescription = Prescription.findById(parseInt(req.params.id));

    if (!prescription) {
      return res.status(404).json({ error: 'Prescription not found.' });
    }
    if (prescription.doctor_id !== req.user.id) {
      return res.status(403).json({ error: 'You can only modify your own prescriptions.' });
    }

    const updated = Prescription.update(parseInt(req.params.id), req.body);
    logAction(req.user.id, 'UPDATE_PRESCRIPTION', 'prescriptions', parseInt(req.params.id),
      'Prescription updated', req.ip);

    res.json({ message: 'Prescription updated.', prescription: updated });
  } catch (err) {
    console.error('Update prescription error:', err);
    res.status(500).json({ error: 'Failed to update prescription.' });
  }
});

// ============================================================
// POST /api/prescriptions/:id/refill - Request refill (patient)
// ============================================================
router.post('/:id/refill', requireRole('patient'), (req, res) => {
  try {
    const prescription = Prescription.findById(parseInt(req.params.id));

    if (!prescription) {
      return res.status(404).json({ error: 'Prescription not found.' });
    }
    if (prescription.patient_id !== req.user.id) {
      return res.status(403).json({ error: 'Access denied.' });
    }

    const result = Prescription.requestRefill(parseInt(req.params.id));

    if (result.error) {
      return res.status(400).json({ error: result.error });
    }

    // Notify doctor
    const db = getDatabase();
    db.prepare(`
      INSERT INTO notifications (user_id, type, title, message, link)
      VALUES (?, 'refill_request', 'Refill Request', ?, '/prescriptions')
    `).run(
      prescription.doctor_id,
      `${req.user.first_name} ${req.user.last_name} requested a refill for ${prescription.medication}.`
    );

    logAction(req.user.id, 'REFILL_REQUEST', 'prescriptions', parseInt(req.params.id),
      `Refill requested for ${prescription.medication}`, req.ip);

    res.json({ message: 'Refill requested.', prescription: result });
  } catch (err) {
    console.error('Refill request error:', err);
    res.status(500).json({ error: 'Failed to request refill.' });
  }
});

// ============================================================
// DELETE /api/prescriptions/:id - Delete prescription (admin)
// ============================================================
router.delete('/:id', requireRole('admin'), (req, res) => {
  try {
    const prescription = Prescription.findById(parseInt(req.params.id));
    if (!prescription) {
      return res.status(404).json({ error: 'Prescription not found.' });
    }

    Prescription.delete(parseInt(req.params.id));
    logAction(req.user.id, 'DELETE_PRESCRIPTION', 'prescriptions', parseInt(req.params.id),
      'Prescription deleted', req.ip);

    res.json({ message: 'Prescription deleted.' });
  } catch (err) {
    console.error('Delete prescription error:', err);
    res.status(500).json({ error: 'Failed to delete prescription.' });
  }
});

module.exports = router;
