const { getDatabase } = require('../config/db');

class Message {
  static findById(id) {
    const db = getDatabase();
    return db.prepare(`
      SELECT m.*,
             s.first_name as sender_first, s.last_name as sender_last, s.role as sender_role,
             r.first_name as recipient_first, r.last_name as recipient_last, r.role as recipient_role
      FROM messages m
      JOIN users s ON m.sender_id = s.id
      JOIN users r ON m.recipient_id = r.id
      WHERE m.id = ?
    `).get(id);
  }

  static create(data) {
    const db = getDatabase();
    const stmt = db.prepare(`
      INSERT INTO messages (sender_id, recipient_id, subject, body, is_urgent, parent_id, attachment_name)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);

    const result = stmt.run(
      data.sender_id,
      data.recipient_id,
      data.subject,
      data.body,
      data.is_urgent ? 1 : 0,
      data.parent_id || null,
      data.attachment_name || null
    );

    return Message.findById(result.lastInsertRowid);
  }

  static getInbox(userId, filters = {}) {
    const db = getDatabase();
    let query = `
      SELECT m.*,
             s.first_name as sender_first, s.last_name as sender_last, s.role as sender_role
      FROM messages m
      JOIN users s ON m.sender_id = s.id
      WHERE m.recipient_id = ?
    `;
    const params = [userId];

    if (filters.unread) {
      query += ' AND m.is_read = 0';
    }
    if (filters.urgent) {
      query += ' AND m.is_urgent = 1';
    }

    query += ' ORDER BY m.created_at DESC';

    if (filters.limit) {
      query += ' LIMIT ?';
      params.push(filters.limit);
    }

    return db.prepare(query).all(...params);
  }

  static getSent(userId, limit) {
    const db = getDatabase();
    let query = `
      SELECT m.*,
             r.first_name as recipient_first, r.last_name as recipient_last, r.role as recipient_role
      FROM messages m
      JOIN users r ON m.recipient_id = r.id
      WHERE m.sender_id = ?
      ORDER BY m.created_at DESC
    `;
    const params = [userId];

    if (limit) {
      query += ' LIMIT ?';
      params.push(limit);
    }

    return db.prepare(query).all(...params);
  }

  static getThread(messageId) {
    const db = getDatabase();
    // Get the root message
    let rootId = messageId;
    let msg = db.prepare('SELECT parent_id FROM messages WHERE id = ?').get(messageId);
    while (msg && msg.parent_id) {
      rootId = msg.parent_id;
      msg = db.prepare('SELECT parent_id FROM messages WHERE id = ?').get(rootId);
    }

    return db.prepare(`
      SELECT m.*,
             s.first_name as sender_first, s.last_name as sender_last, s.role as sender_role
      FROM messages m
      JOIN users s ON m.sender_id = s.id
      WHERE m.id = ? OR m.parent_id = ?
      ORDER BY m.created_at ASC
    `).all(rootId, rootId);
  }

  static markAsRead(id) {
    const db = getDatabase();
    db.prepare('UPDATE messages SET is_read = 1 WHERE id = ?').run(id);
  }

  static markAllAsRead(userId) {
    const db = getDatabase();
    db.prepare('UPDATE messages SET is_read = 1 WHERE recipient_id = ? AND is_read = 0').run(userId);
  }

  static getUnreadCount(userId) {
    const db = getDatabase();
    return db.prepare('SELECT COUNT(*) as count FROM messages WHERE recipient_id = ? AND is_read = 0').get(userId).count;
  }

  static delete(id) {
    const db = getDatabase();
    db.prepare('DELETE FROM messages WHERE id = ?').run(id);
  }

  static getConversations(userId) {
    const db = getDatabase();
    return db.prepare(`
      SELECT
        CASE WHEN m.sender_id = ? THEN m.recipient_id ELSE m.sender_id END as other_user_id,
        CASE WHEN m.sender_id = ? THEN r.first_name ELSE s.first_name END as other_first,
        CASE WHEN m.sender_id = ? THEN r.last_name ELSE s.last_name END as other_last,
        CASE WHEN m.sender_id = ? THEN r.role ELSE s.role END as other_role,
        m.subject as last_subject,
        m.body as last_body,
        m.created_at as last_message_at,
        SUM(CASE WHEN m.recipient_id = ? AND m.is_read = 0 THEN 1 ELSE 0 END) as unread_count
      FROM messages m
      JOIN users s ON m.sender_id = s.id
      JOIN users r ON m.recipient_id = r.id
      WHERE m.sender_id = ? OR m.recipient_id = ?
      GROUP BY other_user_id
      ORDER BY last_message_at DESC
    `).all(userId, userId, userId, userId, userId, userId, userId);
  }
}

module.exports = Message;
