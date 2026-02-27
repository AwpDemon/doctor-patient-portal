const express = require('express');
const router = express.Router();
const { body, validationResult } = require('express-validator');
const Appointment = require('../models/Appointment');
const User = require('../models/User');
const { isAuthenticated, requireRole, logAction } = require('../middleware/auth');
const { getDatabase } = require('../config/db');

// All routes require authentication
router.use(isAuthenticated);

// ============================================================
// GET /api/appointments - List appointments for current user
// ============================================================
router.get('/', (req, res) => {
  try {
    const { status, from, to, limit } = req.query;
    const filters = { status, from, to, limit: limit ? parseInt(limit) : undefined };

    let appointments;
    if (req.user.role === 'doctor') {
      appointments = Appointment.getByDoctor(req.user.id, filters);
    } else if (req.user.role === 'patient') {
      appointments = Appointment.getByPatient(req.user.id, filters);
    } else {
      // Admin: get all
      const db = getDatabase();
      appointments = db.prepare(`
        SELECT a.*,
               p.first_name as patient_first, p.last_name as patient_last,
               d.first_name as doctor_first, d.last_name as doctor_last, d.specialty as doctor_specialty
        FROM appointments a
        JOIN users p ON a.patient_id = p.id
        JOIN users d ON a.doctor_id = d.id
        ORDER BY a.date DESC, a.time DESC
        ${limit ? 'LIMIT ?' : ''}
      `).all(...(limit ? [parseInt(limit)] : []));
    }

    res.json({ appointments });
  } catch (err) {
    console.error('Get appointments error:', err);
    res.status(500).json({ error: 'Failed to retrieve appointments.' });
  }
});

// ============================================================
// GET /api/appointments/upcoming - Upcoming appointments
// ============================================================
router.get('/upcoming', (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 5;
    const appointments = Appointment.getUpcoming(req.user.id, req.user.role, limit);
    res.json({ appointments });
  } catch (err) {
    console.error('Get upcoming appointments error:', err);
    res.status(500).json({ error: 'Failed to retrieve upcoming appointments.' });
  }
});

// ============================================================
// GET /api/appointments/today - Today's appointments (doctor)
// ============================================================
router.get('/today', requireRole('doctor'), (req, res) => {
  try {
    const appointments = Appointment.getTodaysAppointments(req.user.id);
    res.json({ appointments });
  } catch (err) {
    console.error('Get today appointments error:', err);
    res.status(500).json({ error: 'Failed to retrieve today\'s appointments.' });
  }
});

// ============================================================
// GET /api/appointments/available-slots - Available time slots
// ============================================================
router.get('/available-slots', (req, res) => {
  try {
    const { doctor_id, date } = req.query;
    if (!doctor_id || !date) {
      return res.status(400).json({ error: 'doctor_id and date are required.' });
    }
    const slots = Appointment.getAvailableSlots(parseInt(doctor_id), date);
    res.json({ slots });
  } catch (err) {
    console.error('Get available slots error:', err);
    res.status(500).json({ error: 'Failed to retrieve available slots.' });
  }
});

// ============================================================
// GET /api/appointments/stats - Appointment statistics
// ============================================================
router.get('/stats', (req, res) => {
  try {
    const stats = Appointment.getStats(req.user.id, req.user.role);
    res.json({ stats });
  } catch (err) {
    console.error('Get appointment stats error:', err);
    res.status(500).json({ error: 'Failed to retrieve appointment stats.' });
  }
});

// ============================================================
// GET /api/appointments/:id - Get single appointment
// ============================================================
router.get('/:id', (req, res) => {
  try {
    const appointment = Appointment.findById(parseInt(req.params.id));

    if (!appointment) {
      return res.status(404).json({ error: 'Appointment not found.' });
    }

    // Check access
    if (req.user.role === 'patient' && appointment.patient_id !== req.user.id) {
      return res.status(403).json({ error: 'Access denied.' });
    }
    if (req.user.role === 'doctor' && appointment.doctor_id !== req.user.id) {
      return res.status(403).json({ error: 'Access denied.' });
    }

    res.json({ appointment });
  } catch (err) {
    console.error('Get appointment error:', err);
    res.status(500).json({ error: 'Failed to retrieve appointment.' });
  }
});

// ============================================================
// POST /api/appointments - Create appointment
// ============================================================
router.post('/', [
  body('doctor_id').isInt().withMessage('Doctor is required'),
  body('date').isDate().withMessage('Valid date is required'),
  body('time').matches(/^\d{2}:\d{2}$/).withMessage('Valid time is required (HH:MM)'),
  body('type').optional().isIn(['checkup', 'follow-up', 'consultation', 'emergency', 'procedure', 'lab-work']),
  body('reason').optional().trim(),
], (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    // Determine patient_id based on role
    let patientId;
    if (req.user.role === 'patient') {
      patientId = req.user.id;
    } else if (req.body.patient_id) {
      patientId = parseInt(req.body.patient_id);
    } else {
      return res.status(400).json({ error: 'Patient ID is required.' });
    }

    // Verify doctor exists
    const doctor = User.findById(parseInt(req.body.doctor_id));
    if (!doctor || doctor.role !== 'doctor') {
      return res.status(400).json({ error: 'Invalid doctor selected.' });
    }

    // Check slot availability
    const available = Appointment.getAvailableSlots(parseInt(req.body.doctor_id), req.body.date);
    if (!available.includes(req.body.time)) {
      return res.status(409).json({ error: 'This time slot is no longer available.' });
    }

    const appointment = Appointment.create({
      patient_id: patientId,
      doctor_id: parseInt(req.body.doctor_id),
      date: req.body.date,
      time: req.body.time,
      duration: req.body.duration || 30,
      type: req.body.type || 'checkup',
      reason: req.body.reason,
      location: req.body.location,
    });

    // Create notification for doctor
    const db = getDatabase();
    const patient = User.findById(patientId);
    db.prepare(`
      INSERT INTO notifications (user_id, type, title, message, link)
      VALUES (?, 'appointment', 'New Appointment', ?, '/appointments')
    `).run(
      parseInt(req.body.doctor_id),
      `${patient.first_name} ${patient.last_name} booked a ${req.body.type || 'checkup'} on ${req.body.date} at ${req.body.time}.`
    );

    logAction(req.user.id, 'CREATE_APPOINTMENT', 'appointments', appointment.id,
      `Appointment created for ${req.body.date} at ${req.body.time}`, req.ip);

    res.status(201).json({ message: 'Appointment scheduled successfully.', appointment });
  } catch (err) {
    console.error('Create appointment error:', err);
    res.status(500).json({ error: 'Failed to schedule appointment.' });
  }
});

// ============================================================
// PUT /api/appointments/:id - Update appointment
// ============================================================
router.put('/:id', (req, res) => {
  try {
    const appointment = Appointment.findById(parseInt(req.params.id));

    if (!appointment) {
      return res.status(404).json({ error: 'Appointment not found.' });
    }

    // Check access
    if (req.user.role === 'patient' && appointment.patient_id !== req.user.id) {
      return res.status(403).json({ error: 'Access denied.' });
    }
    if (req.user.role === 'doctor' && appointment.doctor_id !== req.user.id) {
      return res.status(403).json({ error: 'Access denied.' });
    }

    const updated = Appointment.update(parseInt(req.params.id), req.body);
    logAction(req.user.id, 'UPDATE_APPOINTMENT', 'appointments', parseInt(req.params.id),
      `Appointment updated`, req.ip);

    res.json({ message: 'Appointment updated.', appointment: updated });
  } catch (err) {
    console.error('Update appointment error:', err);
    res.status(500).json({ error: 'Failed to update appointment.' });
  }
});

// ============================================================
// PUT /api/appointments/:id/cancel - Cancel appointment
// ============================================================
router.put('/:id/cancel', (req, res) => {
  try {
    const appointment = Appointment.findById(parseInt(req.params.id));

    if (!appointment) {
      return res.status(404).json({ error: 'Appointment not found.' });
    }

    if (req.user.role === 'patient' && appointment.patient_id !== req.user.id) {
      return res.status(403).json({ error: 'Access denied.' });
    }

    const cancelled = Appointment.cancel(parseInt(req.params.id));
    logAction(req.user.id, 'CANCEL_APPOINTMENT', 'appointments', parseInt(req.params.id),
      'Appointment cancelled', req.ip);

    res.json({ message: 'Appointment cancelled.', appointment: cancelled });
  } catch (err) {
    console.error('Cancel appointment error:', err);
    res.status(500).json({ error: 'Failed to cancel appointment.' });
  }
});

// ============================================================
// DELETE /api/appointments/:id - Delete appointment (admin only)
// ============================================================
router.delete('/:id', requireRole('admin'), (req, res) => {
  try {
    const appointment = Appointment.findById(parseInt(req.params.id));
    if (!appointment) {
      return res.status(404).json({ error: 'Appointment not found.' });
    }

    Appointment.delete(parseInt(req.params.id));
    logAction(req.user.id, 'DELETE_APPOINTMENT', 'appointments', parseInt(req.params.id),
      'Appointment deleted', req.ip);

    res.json({ message: 'Appointment deleted.' });
  } catch (err) {
    console.error('Delete appointment error:', err);
    res.status(500).json({ error: 'Failed to delete appointment.' });
  }
});

module.exports = router;
