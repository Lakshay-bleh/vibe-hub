const path = require("path");
const { createServer } = require("./index");
const express = require("express");
const { fileURLToPath } = require("url");

const app = createServer();
const port = process.env.PORT || 3000;

// Required to emulate __dirname in ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const distPath = path.join(__dirname, "../spa");

app.use(express.static(distPath));

// Fallback to index.html for SPA routes (but not for /api or /health)
app.get("*", (req, res) => {
  if (req.path.startsWith("/api/") || req.path.startsWith("/health")) {
    return res.status(404).json({ error: "API endpoint not found" });
  }

  res.sendFile(path.join(distPath, "index.html"));
});

app.listen(port, () => {
  console.log(`🚀 Server running on http://localhost:${port}`);
  console.log(`📱 Frontend served from /spa`);
  console.log(`🔧 API available at /api`);
});

// Graceful shutdown
process.on("SIGTERM", () => {
  console.log("🛑 SIGTERM received. Exiting...");
  process.exit(0);
});

process.on("SIGINT", () => {
  console.log("🛑 SIGINT received. Exiting...");
  process.exit(0);
});
