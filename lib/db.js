// lib/db.js
const { Pool } = require("pg");

let pool;

function getPool() {
  if (!pool) {
    pool = new Pool({
      connectionString: process.env.POSTGRES_URL,
      ssl: process.env.POSTGRES_SSL === "true" ? { rejectUnauthorized: false } : false,
      max: 10,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 5000,
    });
  }
  return pool;
}

/**
 * Run DB migrations — creates the tokens table if it doesn't exist.
 * Call this once at startup / in your setup script.
 */
async function migrate() {
  const db = getPool();
  await db.query(`
    CREATE TABLE IF NOT EXISTS tokens (
      id          SERIAL PRIMARY KEY,
      token       VARCHAR(64)  NOT NULL UNIQUE,
      encrypted_url TEXT       NOT NULL,
      label       VARCHAR(255),
      created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
      expires_at  TIMESTAMPTZ,
      last_used   TIMESTAMPTZ,
      hit_count   INTEGER      NOT NULL DEFAULT 0,
      is_active   BOOLEAN      NOT NULL DEFAULT TRUE
    );
    CREATE INDEX IF NOT EXISTS idx_tokens_token ON tokens(token);
    CREATE INDEX IF NOT EXISTS idx_tokens_expires_at ON tokens(expires_at);
  `);
  return true;
}

/**
 * Insert a new token record
 */
async function insertToken({ token, encryptedUrl, label, expiresAt }) {
  const db = getPool();
  const result = await db.query(
    `INSERT INTO tokens (token, encrypted_url, label, expires_at)
     VALUES ($1, $2, $3, $4)
     RETURNING *`,
    [token, encryptedUrl, label || null, expiresAt || null]
  );
  return result.rows[0];
}

/**
 * Fetch a token record by token string.
 * Returns null if not found, expired, or inactive.
 */
async function getToken(token) {
  const db = getPool();
  const result = await db.query(
    `SELECT * FROM tokens WHERE token = $1 AND is_active = TRUE`,
    [token]
  );
  if (result.rows.length === 0) return null;
  const row = result.rows[0];

  // Check expiry
  if (row.expires_at && new Date(row.expires_at) < new Date()) return null;

  return row;
}

/**
 * Bump hit count and last_used timestamp on access
 */
async function recordHit(token) {
  const db = getPool();
  await db.query(
    `UPDATE tokens SET hit_count = hit_count + 1, last_used = NOW() WHERE token = $1`,
    [token]
  );
}

/**
 * List all tokens (for admin dashboard), newest first
 */
async function listTokens({ limit = 100, offset = 0, search = "" } = {}) {
  const db = getPool();
  const searchClause = search ? `AND (label ILIKE $3 OR token ILIKE $3)` : "";
  const params = [limit, offset];
  if (search) params.push(`%${search}%`);

  const result = await db.query(
    `SELECT id, token, label, created_at, expires_at, last_used, hit_count, is_active
     FROM tokens
     WHERE 1=1 ${searchClause}
     ORDER BY created_at DESC
     LIMIT $1 OFFSET $2`,
    params
  );

  const countRes = await db.query(
    `SELECT COUNT(*) FROM tokens WHERE 1=1 ${searchClause}`,
    search ? [params[2]] : []
  );

  return {
    rows: result.rows,
    total: parseInt(countRes.rows[0].count, 10),
  };
}

/**
 * Deactivate (soft-delete) a token by ID
 */
async function deactivateToken(id) {
  const db = getPool();
  const result = await db.query(
    `UPDATE tokens SET is_active = FALSE WHERE id = $1 RETURNING *`,
    [id]
  );
  return result.rows[0] || null;
}

/**
 * Delete expired tokens (cleanup job)
 */
async function deleteExpired() {
  const db = getPool();
  const result = await db.query(
    `DELETE FROM tokens WHERE expires_at IS NOT NULL AND expires_at < NOW()`
  );
  return result.rowCount;
}

/**
 * Dashboard stats
 */
async function getStats() {
  const db = getPool();
  const result = await db.query(`
    SELECT
      COUNT(*) FILTER (WHERE is_active = TRUE)  AS active_tokens,
      COUNT(*) FILTER (WHERE is_active = FALSE) AS revoked_tokens,
      COUNT(*) FILTER (WHERE expires_at IS NOT NULL AND expires_at < NOW()) AS expired_tokens,
      COALESCE(SUM(hit_count), 0) AS total_hits
    FROM tokens
  `);
  return result.rows[0];
}

module.exports = { migrate, insertToken, getToken, recordHit, listTokens, deactivateToken, deleteExpired, getStats };
