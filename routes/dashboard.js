const express = require('express');
const router = express.Router();
const User = require('../models/User');
const Appointment = require('../models/Appointment');
const Message = require('../models/Message');
const Prescription = require('../models/Prescription');
const { isAuthenticated, requireRole } = require('../middleware/auth');
const { getDatabase } = require('../config/db');

router.use(isAuthenticated);

// ============================================================
// GET /api/dashboard - Role-specific dashboard data
// ============================================================
router.get('/', (req, res) => {
  try {
    const db = getDatabase();

    if (req.user.role === 'doctor') {
      return res.json(getDoctorDashboard(req.user.id, db));
    } else if (req.user.role === 'patient') {
      return res.json(getPatientDashboard(req.user.id, db));
    } else if (req.user.role === 'admin') {
      return res.json(getAdminDashboard(db));
    }

    res.status(400).json({ error: 'Unknown role.' });
  } catch (err) {
    console.error('Dashboard error:', err);
    res.status(500).json({ error: 'Failed to load dashboard data.' });
  }
});

// ============================================================
// GET /api/dashboard/notifications - Get user notifications
// ============================================================
router.get('/notifications', (req, res) => {
  try {
    const db = getDatabase();
    const limit = parseInt(req.query.limit) || 20;

    const notifications = db.prepare(`
      SELECT * FROM notifications
      WHERE user_id = ?
      ORDER BY created_at DESC
      LIMIT ?
    `).all(req.user.id, limit);

    const unreadCount = db.prepare(
      'SELECT COUNT(*) as count FROM notifications WHERE user_id = ? AND is_read = 0'
    ).get(req.user.id).count;

    res.json({ notifications, unreadCount });
  } catch (err) {
    console.error('Get notifications error:', err);
    res.status(500).json({ error: 'Failed to retrieve notifications.' });
  }
});

// ============================================================
// PUT /api/dashboard/notifications/:id/read - Mark notification read
// ============================================================
router.put('/notifications/:id/read', (req, res) => {
  try {
    const db = getDatabase();
    db.prepare('UPDATE notifications SET is_read = 1 WHERE id = ? AND user_id = ?')
      .run(parseInt(req.params.id), req.user.id);
    res.json({ message: 'Notification marked as read.' });
  } catch (err) {
    console.error('Mark notification read error:', err);
    res.status(500).json({ error: 'Failed to update notification.' });
  }
});

// ============================================================
// PUT /api/dashboard/notifications/read-all - Mark all read
// ============================================================
router.put('/notifications/read-all', (req, res) => {
  try {
    const db = getDatabase();
    db.prepare('UPDATE notifications SET is_read = 1 WHERE user_id = ? AND is_read = 0')
      .run(req.user.id);
    res.json({ message: 'All notifications marked as read.' });
  } catch (err) {
    console.error('Mark all notifications read error:', err);
    res.status(500).json({ error: 'Failed to update notifications.' });
  }
});

// ============================================================
// GET /api/dashboard/search - Global search
// ============================================================
router.get('/search', (req, res) => {
  try {
    const { q } = req.query;
    if (!q || q.trim().length < 2) {
      return res.status(400).json({ error: 'Search query must be at least 2 characters.' });
    }

    const db = getDatabase();
    const searchTerm = `%${q.trim()}%`;
    const results = { patients: [], doctors: [], appointments: [], prescriptions: [] };

    if (req.user.role === 'doctor' || req.user.role === 'admin') {
      results.patients = db.prepare(`
        SELECT id, first_name, last_name, email, phone
        FROM users WHERE role = 'patient' AND is_active = 1
        AND (first_name LIKE ? OR last_name LIKE ? OR email LIKE ?)
        LIMIT 10
      `).all(searchTerm, searchTerm, searchTerm);
    }

    if (req.user.role === 'patient' || req.user.role === 'admin') {
      results.doctors = db.prepare(`
        SELECT id, first_name, last_name, specialty
        FROM users WHERE role = 'doctor' AND is_active = 1
        AND (first_name LIKE ? OR last_name LIKE ? OR specialty LIKE ?)
        LIMIT 10
      `).all(searchTerm, searchTerm, searchTerm);
    }

    // Search appointments
    const apptField = req.user.role === 'doctor' ? 'doctor_id' : 'patient_id';
    results.appointments = db.prepare(`
      SELECT a.id, a.date, a.time, a.type, a.status,
             p.first_name as patient_first, p.last_name as patient_last,
             d.first_name as doctor_first, d.last_name as doctor_last
      FROM appointments a
      JOIN users p ON a.patient_id = p.id
      JOIN users d ON a.doctor_id = d.id
      WHERE ${req.user.role === 'admin' ? '1=1' : `a.${apptField} = ${req.user.id}`}
      AND (a.reason LIKE ? OR a.type LIKE ? OR p.first_name LIKE ? OR p.last_name LIKE ?
           OR d.first_name LIKE ? OR d.last_name LIKE ?)
      ORDER BY a.date DESC
      LIMIT 10
    `).all(searchTerm, searchTerm, searchTerm, searchTerm, searchTerm, searchTerm);

    // Search prescriptions
    if (req.user.role === 'patient') {
      results.prescriptions = db.prepare(`
        SELECT pr.id, pr.medication, pr.dosage, pr.status,
               d.first_name as doctor_first, d.last_name as doctor_last
        FROM prescriptions pr
        JOIN users d ON pr.doctor_id = d.id
        WHERE pr.patient_id = ? AND pr.medication LIKE ?
        LIMIT 10
      `).all(req.user.id, searchTerm);
    } else if (req.user.role === 'doctor') {
      results.prescriptions = db.prepare(`
        SELECT pr.id, pr.medication, pr.dosage, pr.status,
               p.first_name as patient_first, p.last_name as patient_last
        FROM prescriptions pr
        JOIN users p ON pr.patient_id = p.id
        WHERE pr.doctor_id = ? AND (pr.medication LIKE ? OR p.first_name LIKE ? OR p.last_name LIKE ?)
        LIMIT 10
      `).all(req.user.id, searchTerm, searchTerm, searchTerm);
    }

    res.json({ results, query: q.trim() });
  } catch (err) {
    console.error('Search error:', err);
    res.status(500).json({ error: 'Search failed.' });
  }
});

// ============================================================
// GET /api/dashboard/admin/users - Admin user management
// ============================================================
router.get('/admin/users', requireRole('admin'), (req, res) => {
  try {
    const users = User.getAll(req.query);
    const stats = User.getStats();
    res.json({ users, stats });
  } catch (err) {
    console.error('Admin get users error:', err);
    res.status(500).json({ error: 'Failed to retrieve users.' });
  }
});

// ============================================================
// PUT /api/dashboard/admin/users/:id/toggle-active - Toggle user active status
// ============================================================
router.put('/admin/users/:id/toggle-active', requireRole('admin'), (req, res) => {
  try {
    const user = User.findById(parseInt(req.params.id));
    if (!user) {
      return res.status(404).json({ error: 'User not found.' });
    }
    if (user.is_active) {
      User.deactivate(user.id);
    } else {
      User.activate(user.id);
    }
    res.json({ message: `User ${user.is_active ? 'deactivated' : 'activated'}.` });
  } catch (err) {
    console.error('Toggle user active error:', err);
    res.status(500).json({ error: 'Failed to update user status.' });
  }
});

// ============================================================
// GET /api/dashboard/admin/audit-log - Audit log
// ============================================================
router.get('/admin/audit-log', requireRole('admin'), (req, res) => {
  try {
    const db = getDatabase();
    const limit = parseInt(req.query.limit) || 50;

    const logs = db.prepare(`
      SELECT al.*, u.first_name, u.last_name, u.email
      FROM audit_log al
      LEFT JOIN users u ON al.user_id = u.id
      ORDER BY al.created_at DESC
      LIMIT ?
    `).all(limit);

    res.json({ logs });
  } catch (err) {
    console.error('Get audit log error:', err);
    res.status(500).json({ error: 'Failed to retrieve audit log.' });
  }
});

// ============================================================
// Helper functions
// ============================================================

function getDoctorDashboard(doctorId, db) {
  const today = new Date().toISOString().split('T')[0];

  const todayAppointments = Appointment.getTodaysAppointments(doctorId);
  const upcomingAppointments = Appointment.getUpcoming(doctorId, 'doctor', 5);
  const appointmentStats = Appointment.getStats(doctorId, 'doctor');
  const unreadMessages = Message.getUnreadCount(doctorId);

  const patientCount = db.prepare(`
    SELECT COUNT(DISTINCT patient_id) as count
    FROM appointments WHERE doctor_id = ?
  `).get(doctorId).count;

  const recentPatients = db.prepare(`
    SELECT DISTINCT u.id, u.first_name, u.last_name, u.email,
           MAX(a.date) as last_visit
    FROM users u
    JOIN appointments a ON u.id = a.patient_id
    WHERE a.doctor_id = ?
    GROUP BY u.id
    ORDER BY last_visit DESC
    LIMIT 5
  `).all(doctorId);

  const pendingRefills = db.prepare(`
    SELECT COUNT(*) as count FROM prescriptions
    WHERE doctor_id = ? AND status = 'active' AND refills_remaining < refills_total
  `).get(doctorId).count;

  return {
    role: 'doctor',
    todayAppointments,
    upcomingAppointments,
    stats: {
      ...appointmentStats,
      patients: patientCount,
      unreadMessages,
      pendingRefills,
      todayCount: todayAppointments.length,
    },
    recentPatients,
  };
}

function getPatientDashboard(patientId, db) {
  const upcomingAppointments = Appointment.getUpcoming(patientId, 'patient', 5);
  const appointmentStats = Appointment.getStats(patientId, 'patient');
  const unreadMessages = Message.getUnreadCount(patientId);
  const activeMedications = Prescription.getActiveMedications(patientId);

  const recentLabResults = db.prepare(`
    SELECT lr.*, d.first_name as doctor_first, d.last_name as doctor_last
    FROM lab_results lr
    JOIN users d ON lr.doctor_id = d.id
    WHERE lr.patient_id = ?
    ORDER BY lr.test_date DESC
    LIMIT 5
  `).all(patientId);

  const billing = db.prepare(`
    SELECT
      COALESCE(SUM(CASE WHEN status IN ('pending', 'overdue') THEN patient_responsibility ELSE 0 END), 0) as outstanding,
      COUNT(CASE WHEN status IN ('pending', 'overdue') THEN 1 END) as pending_bills
    FROM billing WHERE patient_id = ?
  `).get(patientId);

  const myDoctors = db.prepare(`
    SELECT DISTINCT u.id, u.first_name, u.last_name, u.specialty
    FROM users u
    JOIN appointments a ON u.id = a.doctor_id
    WHERE a.patient_id = ? AND u.is_active = 1
  `).all(patientId);

  return {
    role: 'patient',
    upcomingAppointments,
    stats: {
      ...appointmentStats,
      unreadMessages,
      activeMedications: activeMedications.length,
      outstandingBalance: billing.outstanding,
      pendingBills: billing.pending_bills,
    },
    activeMedications,
    recentLabResults,
    myDoctors,
  };
}

function getAdminDashboard(db) {
  const userStats = User.getStats();

  const appointmentStats = {
    total: db.prepare('SELECT COUNT(*) as count FROM appointments').get().count,
    todayCount: db.prepare(`SELECT COUNT(*) as count FROM appointments WHERE date = date('now')`).get().count,
    thisWeek: db.prepare(`SELECT COUNT(*) as count FROM appointments WHERE date BETWEEN date('now') AND date('now', '+7 days')`).get().count,
  };

  const revenueStats = db.prepare(`
    SELECT
      COALESCE(SUM(amount), 0) as total_revenue,
      COALESCE(SUM(CASE WHEN status = 'paid' THEN patient_responsibility ELSE 0 END), 0) as collected,
      COALESCE(SUM(CASE WHEN status IN ('pending', 'overdue') THEN patient_responsibility ELSE 0 END), 0) as outstanding
    FROM billing
  `).get();

  const recentActivity = db.prepare(`
    SELECT al.*, u.first_name, u.last_name
    FROM audit_log al
    LEFT JOIN users u ON al.user_id = u.id
    ORDER BY al.created_at DESC
    LIMIT 10
  `).all();

  const recentUsers = db.prepare(`
    SELECT id, first_name, last_name, email, role, created_at
    FROM users ORDER BY created_at DESC LIMIT 5
  `).all();

  return {
    role: 'admin',
    stats: {
      users: userStats,
      appointments: appointmentStats,
      revenue: revenueStats,
    },
    recentActivity,
    recentUsers,
  };
}

module.exports = router;
