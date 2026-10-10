// express-session store backed by the app's existing better-sqlite3
// connection and the `sessions` table defined in config/db.js.
//
// This replaces connect-sqlite3, which pulled in a second (native) SQLite
// driver and, through its build toolchain, the critical/high npm audit
// findings in tar, node-gyp and cacache.
const session = require('express-session');
const { getDatabase } = require('./db');

const DEFAULT_TTL_MS = 24 * 60 * 60 * 1000;

class SqliteSessionStore extends session.Store {
  constructor(options = {}) {
    super();
    this.ttlMs = options.ttlMs || DEFAULT_TTL_MS;
    // Opportunistic cleanup of expired rows.
    this.pruneIntervalMs = options.pruneIntervalMs ?? 15 * 60 * 1000;
    if (this.pruneIntervalMs > 0) {
      this.pruneTimer = setInterval(() => this.prune(), this.pruneIntervalMs);
      this.pruneTimer.unref();
    }
  }

  expiryFor(sess) {
    const maxAge = sess && sess.cookie && sess.cookie.maxAge;
    return Date.now() + (typeof maxAge === 'number' ? maxAge : this.ttlMs);
  }

  get(sid, callback) {
    try {
      const row = getDatabase().prepare('SELECT sess, expired FROM sessions WHERE sid = ?').get(sid);
      if (!row) return callback(null, null);
      if (Number(row.expired) <= Date.now()) {
        this.destroy(sid, () => callback(null, null));
        return undefined;
      }
      return callback(null, JSON.parse(row.sess));
    } catch (err) {
      return callback(err);
    }
  }

  set(sid, sess, callback = () => {}) {
    try {
      getDatabase().prepare(`
        INSERT INTO sessions (sid, sess, expired) VALUES (?, ?, ?)
        ON CONFLICT(sid) DO UPDATE SET sess = excluded.sess, expired = excluded.expired
      `).run(sid, JSON.stringify(sess), String(this.expiryFor(sess)));
      callback(null);
    } catch (err) {
      callback(err);
    }
  }

  touch(sid, sess, callback = () => {}) {
    try {
      getDatabase().prepare('UPDATE sessions SET expired = ? WHERE sid = ?')
        .run(String(this.expiryFor(sess)), sid);
      callback(null);
    } catch (err) {
      callback(err);
    }
  }

  destroy(sid, callback = () => {}) {
    try {
      getDatabase().prepare('DELETE FROM sessions WHERE sid = ?').run(sid);
      callback(null);
    } catch (err) {
      callback(err);
    }
  }

  prune() {
    try {
      getDatabase().prepare('DELETE FROM sessions WHERE CAST(expired AS INTEGER) <= ?').run(Date.now());
    } catch (err) {
      // Database may be closed during shutdown/tests; nothing to prune then.
    }
  }
}

module.exports = SqliteSessionStore;
