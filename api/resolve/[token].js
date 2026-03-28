// api/resolve/[token].js
// GET /api/resolve/:token
// Protected by domain whitelist — only allowed domains can resolve
// Returns: { url } (the real original URL — only to whitelisted domains)

const { decryptUrl } = require("../../lib/crypto");
const { getToken, recordHit } = require("../../lib/db");
const { requireAllowedDomain, setCors } = require("../../lib/auth");

module.exports = async function handler(req, res) {
  setCors(req, res);
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });

  // Enforce domain whitelist
  if (!requireAllowedDomain(req, res)) return;

  const { token } = req.query;

  if (!token || typeof token !== "string") {
    return res.status(400).json({ error: "Token is required" });
  }

  // Sanitize token — only hex chars allowed
  if (!/^[a-f0-9]+$/i.test(token)) {
    return res.status(400).json({ error: "Invalid token format" });
  }

  let row;
  try {
    row = await getToken(token);
  } catch (err) {
    console.error("DB error fetching token:", err);
    return res.status(500).json({ error: "Database error" });
  }

  if (!row) {
    return res.status(404).json({ error: "Token not found, expired, or revoked" });
  }

  let realUrl;
  try {
    realUrl = decryptUrl(row.encrypted_url);
  } catch (err) {
    console.error("Decryption error:", err);
    return res.status(500).json({ error: "Failed to decrypt URL" });
  }

  // Record usage asynchronously — don't await so it doesn't slow the response
  recordHit(token).catch(console.error);

  // Return the real URL — ONLY visible to whitelisted domains
  return res.status(200).json({
    success: true,
    url: realUrl,
    expiresAt: row.expires_at,
  });
};
