// api/shorten.js
// POST /api/shorten
// Body: { url, label?, expiresInHours? }
// Headers: x-api-key: YOUR_ADMIN_API_KEY
// Returns: { token, maskedUrl, expiresAt }

const { generateToken, encryptUrl } = require("../lib/crypto");
const { migrate, insertToken } = require("../lib/db");
const { requireApiKey, setCors } = require("../lib/auth");

let migrated = false;

module.exports = async function handler(req, res) {
  setCors(req, res);
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  if (!requireApiKey(req, res)) return;

  // Run DB migration once
  if (!migrated) {
    await migrate();
    migrated = true;
  }

  const { url, label, expiresInHours } = req.body || {};

  if (!url || typeof url !== "string" || url.trim().length === 0) {
    return res.status(400).json({ error: "url is required" });
  }

  // Validate it looks like a URL
  try {
    new URL(url);
  } catch {
    return res.status(400).json({ error: "Invalid URL format" });
  }

  const hours =
    expiresInHours !== undefined
      ? parseFloat(expiresInHours)
      : parseFloat(process.env.DEFAULT_EXPIRY_HOURS || "24");

  const expiresAt = hours > 0 ? new Date(Date.now() + hours * 3600 * 1000) : null;

  const token = generateToken(20); // 40-char hex token
  const encryptedUrl = encryptUrl(url.trim());

  const row = await insertToken({ token, encryptedUrl, label: label || null, expiresAt });

  const baseUrl = process.env.BASE_URL || `https://${req.headers.host}`;
  const maskedUrl = `${baseUrl}/api/resolve/${token}`;

  return res.status(201).json({
    success: true,
    token,
    maskedUrl,
    label: row.label,
    expiresAt: row.expires_at,
    createdAt: row.created_at,
  });
};
