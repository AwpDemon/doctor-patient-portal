const express = require('express');
const router = express.Router();
const { body, validationResult } = require('express-validator');
const Message = require('../models/Message');
const User = require('../models/User');
const { isAuthenticated, logAction } = require('../middleware/auth');
const { getDatabase } = require('../config/db');

router.use(isAuthenticated);

// ============================================================
// GET /api/messages/inbox - Get user's inbox
// ============================================================
router.get('/inbox', (req, res) => {
  try {
    const { unread, urgent, limit } = req.query;
    const filters = {
      unread: unread === 'true',
      urgent: urgent === 'true',
      limit: limit ? parseInt(limit) : undefined,
    };
    const messages = Message.getInbox(req.user.id, filters);
    res.json({ messages });
  } catch (err) {
    console.error('Get inbox error:', err);
    res.status(500).json({ error: 'Failed to retrieve inbox.' });
  }
});

// ============================================================
// GET /api/messages/sent - Get sent messages
// ============================================================
router.get('/sent', (req, res) => {
  try {
    const limit = req.query.limit ? parseInt(req.query.limit) : undefined;
    const messages = Message.getSent(req.user.id, limit);
    res.json({ messages });
  } catch (err) {
    console.error('Get sent messages error:', err);
    res.status(500).json({ error: 'Failed to retrieve sent messages.' });
  }
});

// ============================================================
// GET /api/messages/conversations - Get conversation list
// ============================================================
router.get('/conversations', (req, res) => {
  try {
    const conversations = Message.getConversations(req.user.id);
    res.json({ conversations });
  } catch (err) {
    console.error('Get conversations error:', err);
    res.status(500).json({ error: 'Failed to retrieve conversations.' });
  }
});

// ============================================================
// GET /api/messages/unread-count - Unread message count
// ============================================================
router.get('/unread-count', (req, res) => {
  try {
    const count = Message.getUnreadCount(req.user.id);
    res.json({ count });
  } catch (err) {
    console.error('Get unread count error:', err);
    res.status(500).json({ error: 'Failed to get unread count.' });
  }
});

// ============================================================
// GET /api/messages/contacts - Get available contacts
// ============================================================
router.get('/contacts', (req, res) => {
  try {
    const db = getDatabase();
    let contacts;

    if (req.user.role === 'patient') {
      // Patients can message their doctors
      contacts = db.prepare(`
        SELECT DISTINCT u.id, u.first_name, u.last_name, u.role, u.specialty
        FROM users u
        JOIN appointments a ON u.id = a.doctor_id
        WHERE a.patient_id = ? AND u.is_active = 1
        ORDER BY u.last_name
      `).all(req.user.id);
    } else if (req.user.role === 'doctor') {
      // Doctors can message their patients and other doctors
      contacts = db.prepare(`
        SELECT DISTINCT u.id, u.first_name, u.last_name, u.role, u.specialty
        FROM users u
        WHERE (u.id IN (SELECT DISTINCT patient_id FROM appointments WHERE doctor_id = ?)
               OR u.role = 'doctor')
          AND u.id != ? AND u.is_active = 1
        ORDER BY u.role, u.last_name
      `).all(req.user.id, req.user.id);
    } else {
      // Admin can message everyone
      contacts = db.prepare(`
        SELECT id, first_name, last_name, role, specialty
        FROM users WHERE id != ? AND is_active = 1
        ORDER BY role, last_name
      `).all(req.user.id);
    }

    res.json({ contacts });
  } catch (err) {
    console.error('Get contacts error:', err);
    res.status(500).json({ error: 'Failed to retrieve contacts.' });
  }
});

// ============================================================
// GET /api/messages/:id - Get single message
// ============================================================
router.get('/:id', (req, res) => {
  try {
    const message = Message.findById(parseInt(req.params.id));

    if (!message) {
      return res.status(404).json({ error: 'Message not found.' });
    }

    // Check access
    if (message.sender_id !== req.user.id && message.recipient_id !== req.user.id) {
      if (req.user.role !== 'admin') {
        return res.status(403).json({ error: 'Access denied.' });
      }
    }

    // Mark as read if recipient
    if (message.recipient_id === req.user.id && !message.is_read) {
      Message.markAsRead(message.id);
      message.is_read = 1;
    }

    res.json({ message });
  } catch (err) {
    console.error('Get message error:', err);
    res.status(500).json({ error: 'Failed to retrieve message.' });
  }
});

// ============================================================
// GET /api/messages/:id/thread - Get message thread
// ============================================================
router.get('/:id/thread', (req, res) => {
  try {
    const thread = Message.getThread(parseInt(req.params.id));
    res.json({ messages: thread });
  } catch (err) {
    console.error('Get thread error:', err);
    res.status(500).json({ error: 'Failed to retrieve message thread.' });
  }
});

// ============================================================
// POST /api/messages - Send a message
// ============================================================
router.post('/', [
  body('recipient_id').isInt().withMessage('Recipient is required'),
  body('subject').trim().notEmpty().withMessage('Subject is required'),
  body('body').trim().notEmpty().withMessage('Message body is required'),
  body('is_urgent').optional().isBoolean(),
  body('parent_id').optional().isInt(),
], (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    // Verify recipient exists
    const recipient = User.findById(parseInt(req.body.recipient_id));
    if (!recipient) {
      return res.status(404).json({ error: 'Recipient not found.' });
    }

    const message = Message.create({
      sender_id: req.user.id,
      recipient_id: parseInt(req.body.recipient_id),
      subject: req.body.subject,
      body: req.body.body,
      is_urgent: req.body.is_urgent || false,
      parent_id: req.body.parent_id ? parseInt(req.body.parent_id) : null,
    });

    // Create notification
    const db = getDatabase();
    db.prepare(`
      INSERT INTO notifications (user_id, type, title, message, link)
      VALUES (?, 'message', ?, ?, '/messages')
    `).run(
      parseInt(req.body.recipient_id),
      req.body.is_urgent ? 'Urgent Message' : 'New Message',
      `${req.user.first_name} ${req.user.last_name}: ${req.body.subject}`
    );

    logAction(req.user.id, 'SEND_MESSAGE', 'messages', message.id,
      `Message sent to user ${req.body.recipient_id}`, req.ip);

    res.status(201).json({ message: 'Message sent.', data: message });
  } catch (err) {
    console.error('Send message error:', err);
    res.status(500).json({ error: 'Failed to send message.' });
  }
});

// ============================================================
// PUT /api/messages/mark-all-read - Mark all as read
// ============================================================
router.put('/mark-all-read', (req, res) => {
  try {
    Message.markAllAsRead(req.user.id);
    res.json({ message: 'All messages marked as read.' });
  } catch (err) {
    console.error('Mark all read error:', err);
    res.status(500).json({ error: 'Failed to mark messages as read.' });
  }
});

// ============================================================
// PUT /api/messages/:id/read - Mark single message as read
// ============================================================
router.put('/:id/read', (req, res) => {
  try {
    const message = Message.findById(parseInt(req.params.id));
    if (!message || message.recipient_id !== req.user.id) {
      return res.status(404).json({ error: 'Message not found.' });
    }

    Message.markAsRead(parseInt(req.params.id));
    res.json({ message: 'Message marked as read.' });
  } catch (err) {
    console.error('Mark read error:', err);
    res.status(500).json({ error: 'Failed to mark message as read.' });
  }
});

// ============================================================
// DELETE /api/messages/:id - Delete message
// ============================================================
router.delete('/:id', (req, res) => {
  try {
    const message = Message.findById(parseInt(req.params.id));

    if (!message) {
      return res.status(404).json({ error: 'Message not found.' });
    }

    if (message.sender_id !== req.user.id && message.recipient_id !== req.user.id && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Access denied.' });
    }

    Message.delete(parseInt(req.params.id));
    logAction(req.user.id, 'DELETE_MESSAGE', 'messages', parseInt(req.params.id),
      'Message deleted', req.ip);

    res.json({ message: 'Message deleted.' });
  } catch (err) {
    console.error('Delete message error:', err);
    res.status(500).json({ error: 'Failed to delete message.' });
  }
});

module.exports = router;
