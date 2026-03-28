// lib/auth.js

/**
 * Check that the request carries a valid ADMIN_API_KEY header.
 * Used to protect POST /api/shorten and admin write endpoints.
 */
function requireApiKey(req, res) {
  const key = req.headers["x-api-key"] || req.query.apiKey;
  if (!key || key !== process.env.ADMIN_API_KEY) {
    res.status(401).json({ error: "Unauthorized: invalid or missing API key" });
    return false;
  }
  return true;
}

/**
 * Check that the request Origin/Referer is in ALLOWED_DOMAINS.
 * Used on GET /api/resolve to protect against hotlinking.
 */
function requireAllowedDomain(req, res) {
  const allowed = (process.env.ALLOWED_DOMAINS || "")
    .split(",")
    .map((d) => d.trim().toLowerCase())
    .filter(Boolean);

  // In dev mode with no ALLOWED_DOMAINS set — allow all
  if (allowed.length === 0) return true;

  const origin = req.headers["origin"] || req.headers["referer"] || "";

  const isAllowed = allowed.some((domain) => {
    try {
      const url = new URL(origin.startsWith("http") ? origin : `https://${origin}`);
      return url.host === domain || url.host === `www.${domain}`;
    } catch {
      return origin.toLowerCase().includes(domain);
    }
  });

  if (!isAllowed) {
    res.status(403).json({ error: "Forbidden: domain not whitelisted" });
    return false;
  }
  return true;
}

/**
 * Validate the admin dashboard password (Basic Auth style via header)
 */
function requireAdminPassword(req, res) {
  const provided = req.headers["x-admin-password"] || req.query.password;
  if (!provided || provided !== process.env.ADMIN_PASSWORD) {
    res.status(401).json({ error: "Unauthorized" });
    return false;
  }
  return true;
}

/**
 * Standard CORS + JSON headers helper
 */
function setCors(req, res) {
  const allowed = (process.env.ALLOWED_DOMAINS || "")
    .split(",")
    .map((d) => d.trim())
    .filter(Boolean);

  const origin = req.headers["origin"] || "";
  if (allowed.length === 0 || allowed.some((d) => origin.includes(d))) {
    res.setHeader("Access-Control-Allow-Origin", origin || "*");
  }
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,DELETE,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, x-api-key, x-admin-password");
  res.setHeader("Content-Type", "application/json");
}

module.exports = { requireApiKey, requireAllowedDomain, requireAdminPassword, setCors };
