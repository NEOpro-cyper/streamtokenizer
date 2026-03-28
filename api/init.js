// api/init.js
// GET /api/init?apiKey=YOUR_ADMIN_API_KEY
// Run this once after deploying to create the DB table

const { migrate } = require("../lib/db");
const { requireApiKey, setCors } = require("../lib/auth");

module.exports = async function handler(req, res) {
  setCors(req, res);
  if (req.method === "OPTIONS") return res.status(200).end();
  if (!requireApiKey(req, res)) return;

  try {
    await migrate();
    return res.status(200).json({ success: true, message: "Database tables created successfully" });
  } catch (err) {
    console.error("Migration error:", err);
    return res.status(500).json({ error: "Migration failed", detail: err.message });
  }
};
