// api/admin.js
// All admin operations behind x-admin-password header
//
// GET  /api/admin?action=list&limit=50&offset=0&search=
// GET  /api/admin?action=stats
// POST /api/admin  { action: "revoke", id: 123 }
// POST /api/admin  { action: "cleanup" }

const { listTokens, deactivateToken, deleteExpired, getStats } = require("../lib/db");
const { requireAdminPassword, setCors } = require("../lib/auth");

module.exports = async function handler(req, res) {
  setCors(req, res);
  if (req.method === "OPTIONS") return res.status(200).end();
  if (!requireAdminPassword(req, res)) return;

  try {
    if (req.method === "GET") {
      const { action = "list", limit = 50, offset = 0, search = "" } = req.query;

      if (action === "stats") {
        const stats = await getStats();
        return res.status(200).json({ success: true, stats });
      }

      // Default: list tokens
      const data = await listTokens({
        limit: Math.min(parseInt(limit, 10) || 50, 200),
        offset: parseInt(offset, 10) || 0,
        search: search.trim(),
      });

      return res.status(200).json({ success: true, ...data });
    }

    if (req.method === "POST") {
      const { action, id } = req.body || {};

      if (action === "revoke") {
        if (!id) return res.status(400).json({ error: "id is required" });
        const row = await deactivateToken(parseInt(id, 10));
        if (!row) return res.status(404).json({ error: "Token not found" });
        return res.status(200).json({ success: true, message: "Token revoked", token: row });
      }

      if (action === "cleanup") {
        const deleted = await deleteExpired();
        return res.status(200).json({ success: true, deleted, message: `Deleted ${deleted} expired tokens` });
      }

      return res.status(400).json({ error: "Unknown action" });
    }

    return res.status(405).json({ error: "Method not allowed" });
  } catch (err) {
    console.error("Admin API error:", err);
    return res.status(500).json({ error: "Internal server error", detail: err.message });
  }
};
