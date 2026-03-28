// lib/db.js
const mysql = require("mysql2/promise");

let pool;

function getPool() {
  if (!pool) {
    pool = mysql.createPool({
      host:     process.env.DB_HOST,
      port:     process.env.DB_PORT || 3306,
      database: process.env.DB_NAME,
      user:     process.env.DB_USER,
      password: process.env.DB_PASSWORD,
      waitForConnections: true,
      connectionLimit: 10,
      connectTimeout: 5000,
    });
  }
  return pool;
}

async function migrate() {
  const db = getPool();
  await db.query(`
    CREATE TABLE IF NOT EXISTS tokens (
      id            INT AUTO_INCREMENT PRIMARY KEY,
      token         VARCHAR(64)   NOT NULL UNIQUE,
      encrypted_url TEXT          NOT NULL,
      label         VARCHAR(255),
      created_at    DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
      expires_at    DATETIME,
      last_used     DATETIME,
      hit_count     INT           NOT NULL DEFAULT 0,
      is_active     TINYINT(1)    NOT NULL DEFAULT 1,
      INDEX idx_tokens_token (token),
      INDEX idx_tokens_expires_at (expires_at)
    )
  `);
  return true;
}

async function insertToken({ token, encryptedUrl, label, expiresAt }) {
  const db = getPool();
  const [result] = await db.query(
    `INSERT INTO tokens (token, encrypted_url, label, expires_at)
     VALUES (?, ?, ?, ?)`,
    [token, encryptedUrl, label || null, expiresAt || null]
  );
  const [rows] = await db.query(`SELECT * FROM tokens WHERE id = ?`, [result.insertId]);
  return rows[0];
}

async function getToken(token) {
  const db = getPool();
  const [rows] = await db.query(
    `SELECT * FROM tokens WHERE token = ? AND is_active = 1`,
    [token]
  );
  if (rows.length === 0) return null;
  const row = rows[0];
  if (row.expires_at && new Date(row.expires_at) < new Date()) return null;
  return row;
}

async function recordHit(token) {
  const db = getPool();
  await db.query(
    `UPDATE tokens SET hit_count = hit_count + 1, last_used = NOW() WHERE token = ?`,
    [token]
  );
}

async function listTokens({ limit = 100, offset = 0, search = "" } = {}) {
  const db = getPool();
  const searchClause = search ? `AND (label LIKE ? OR token LIKE ?)` : "";
  const params = search ? [`%${search}%`, `%${search}%`, limit, offset] : [limit, offset];

  const [rows] = await db.query(
    `SELECT id, token, label, created_at, expires_at, last_used, hit_count, is_active
     FROM tokens
     WHERE 1=1 ${searchClause}
     ORDER BY created_at DESC
     LIMIT ? OFFSET ?`,
    params
  );

  const [countRows] = await db.query(
    `SELECT COUNT(*) as count FROM tokens WHERE 1=1 ${searchClause}`,
    search ? [`%${search}%`, `%${search}%`] : []
  );

  return {
    rows,
    total: countRows[0].count,
  };
}

async function deactivateToken(id) {
  const db = getPool();
  await db.query(`UPDATE tokens SET is_active = 0 WHERE id = ?`, [id]);
  const [rows] = await db.query(`SELECT * FROM tokens WHERE id = ?`, [id]);
  return rows[0] || null;
}

async function deleteExpired() {
  const db = getPool();
  const [result] = await db.query(
    `DELETE FROM tokens WHERE expires_at IS NOT NULL AND expires_at < NOW()`
  );
  return result.affectedRows;
}

async function getStats() {
  const db = getPool();
  const [rows] = await db.query(`
    SELECT
      SUM(is_active = 1)                                    AS active_tokens,
      SUM(is_active = 0)                                    AS revoked_tokens,
      SUM(expires_at IS NOT NULL AND expires_at < NOW())    AS expired_tokens,
      COALESCE(SUM(hit_count), 0)                           AS total_hits
    FROM tokens
  `);
  return rows[0];
}

module.exports = { migrate, insertToken, getToken, recordHit, listTokens, deactivateToken, deleteExpired, getStats };
