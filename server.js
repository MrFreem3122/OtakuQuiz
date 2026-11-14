// OtakuQuiz server: serves the web app and runs the real-time games.
// No dependencies: run with `node server.js` (Node 18+).

const http = require("http");
const fs = require("fs");
const path = require("path");
const { attachWebSocketServer } = require("./server/websocket");
const { handleConnection, rooms } = require("./server/game");

const PORT = process.env.PORT || 3000;
const PUBLIC_DIR = path.join(__dirname, "public");

const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".webp": "image/webp",
  ".ico": "image/x-icon",
  ".webmanifest": "application/manifest+json",
};

const server = http.createServer((req, res) => {
  const url = new URL(req.url, "http://localhost");

  if (url.pathname === "/health") {
    res.writeHead(200, { "Content-Type": "application/json" });
    return res.end(JSON.stringify({ ok: true, rooms: rooms.size }));
  }

  // Short share link: /j/ABCD -> join page with the code filled in
  const short = url.pathname.match(/^\/j\/([A-Za-z0-9]{4,8})\/?$/);
  if (short) {
    res.writeHead(302, { Location: `/join.html?code=${short[1].toUpperCase()}` });
    return res.end();
  }

  let filePath = decodeURIComponent(url.pathname);
  if (filePath.endsWith("/")) filePath += "index.html";
  const full = path.normalize(path.join(PUBLIC_DIR, filePath));
  if (!full.startsWith(PUBLIC_DIR)) {
    res.writeHead(403);
    return res.end();
  }

  fs.readFile(full, (err, data) => {
    if (err) {
      res.writeHead(404, { "Content-Type": "text/html; charset=utf-8" });
      return res.end('<p style="font-family:sans-serif">Page introuvable. <a href="/">Retour à l\'accueil</a></p>');
    }
    const ext = path.extname(full).toLowerCase();
    res.writeHead(200, {
      "Content-Type": TYPES[ext] || "application/octet-stream",
      "Cache-Control": ext === ".html" ? "no-cache" : "public, max-age=3600",
    });
    res.end(data);
  });
});

attachWebSocketServer(server, "/ws", (ws) => handleConnection(ws));

server.listen(PORT, () => {
  console.log(`OtakuQuiz running on http://localhost:${PORT}`);
});
