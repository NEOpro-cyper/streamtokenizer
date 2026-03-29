const express = require("express");
const app = express();

app.use(express.json());
app.use(express.static("public"));

app.post("/api/shorten", require("./api/shorten"));
app.get("/api/resolve/:token", (req, res) => {
  req.query.token = req.params.token;
  require("./api/resolve/[token]")(req, res);
});
app.use("/api/admin", require("./api/admin"));
app.use("/api/init",  require("./api/init"));

// ─── M3U8 PROXY ───────────────────────────────────────────
app.get("/proxy/m3u8", async (req, res) => {
  const targetUrl = req.query.url;
  if (!targetUrl) return res.status(400).send("url param required");

  try {
    const response = await fetch(targetUrl);
    const text = await response.text();
    const base = process.env.BASE_URL || `https://${req.headers.host}`;

    // Rewrite all URLs in the m3u8 to go through this proxy
    const rewritten = text.split("\n").map(line => {
      line = line.trim();
      if (line.startsWith("http")) {
        return `${base}/proxy/m3u8?url=${encodeURIComponent(line)}`;
      }
      if (line.startsWith("URI=\"http")) {
        return line.replace(/URI="(https?[^"]+)"/, (_, u) =>
          `URI="${base}/proxy/m3u8?url=${encodeURIComponent(u)}"`
        );
      }
      return line;
    }).join("\n");

    res.setHeader("Content-Type", "application/vnd.apple.mpegurl");
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.send(rewritten);
  } catch (err) {
    console.error("Proxy error:", err);
    res.status(502).send("Proxy error");
  }
});
// ──────────────────────────────────────────────────────────

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`✅ Running on port ${PORT}`));
