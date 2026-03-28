const express = require("express");
const app = express();

app.use(express.json());
app.use(express.static("public"));

// Shorten
app.post("/api/shorten", require("./api/shorten"));

// Resolve — handle :token param
app.get("/api/resolve/:token", (req, res) => {
  req.query.token = req.params.token; // match Vercel's req.query.token
  require("./api/resolve/[token]")(req, res);
});

// Admin & Init
app.use("/api/admin", require("./api/admin"));
app.use("/api/init",  require("./api/init"));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`✅ StreamVault running on port ${PORT}`));
