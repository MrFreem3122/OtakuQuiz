// Admin area: one shared admin code (ADMIN_CODE) protects the quiz library.

const crypto = require("crypto");
const store = require("./store");
const { sanitizeQuiz } = require("./game");

const ADMIN_CODE = process.env.ADMIN_CODE || "";
const MAX_BODY = 8 * 1024 * 1024;

// The token is derived from the code: changing ADMIN_CODE signs every admin out.
const TOKEN = ADMIN_CODE ? crypto.createHmac("sha256", ADMIN_CODE).update("otakuquiz-admin-v1").digest("hex") : "";

function safeEqual(a, b) {
  const x = Buffer.from(String(a));
  const y = Buffer.from(String(b));
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}

function isAdminToken(token) {
  return !!TOKEN && safeEqual(token || "", TOKEN);
}

/* ---- simple brute-force protection on the login ---- */
const attempts = new Map(); // ip -> { count, until }
function tooManyAttempts(ip) {
  const a = attempts.get(ip);
  return a && a.count >= 8 && Date.now() < a.until;
}
function recordFailure(ip) {
  const a = attempts.get(ip);
  if (!a || Date.now() > a.until) attempts.set(ip, { count: 1, until: Date.now() + 15 * 60 * 1000 });
  else a.count++;
}

/* ---- helpers ---- */
function send(res, status, body) {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" });
  res.end(JSON.stringify(body));
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on("data", (c) => {
      size += c.length;
      if (size > MAX_BODY) { reject(Object.assign(new Error("Quiz trop lourd (trop d'images)."), { status: 413 })); req.destroy(); return; }
      chunks.push(c);
    });
    req.on("end", () => {
      try { resolve(chunks.length ? JSON.parse(Buffer.concat(chunks).toString("utf8")) : {}); }
      catch { reject(Object.assign(new Error("Requête invalide."), { status: 400 })); }
    });
    req.on("error", reject);
  });
}

function clientIp(req) {
  return (req.headers["x-forwarded-for"] || "").split(",")[0].trim() || req.socket.remoteAddress || "?";
}

function cleanId(id) {
  return /^[a-z0-9]{6,40}$/i.test(id || "") ? id : null;
}

function str(v, max) {
  return String(v ?? "").trim().slice(0, max);
}

/* ---- request handler: returns true if it handled the request ---- */
async function handleApi(req, res, url) {
  if (!url.pathname.startsWith("/api/")) return false;

  try {
    if (url.pathname === "/api/login" && req.method === "POST") {
      if (!ADMIN_CODE) return send(res, 503, { error: "L'espace admin n'est pas encore configuré (ADMIN_CODE manquant sur le serveur)." }), true;
      const ip = clientIp(req);
      if (tooManyAttempts(ip)) return send(res, 429, { error: "Trop d'essais. Réessaie dans 15 minutes." }), true;
      const body = await readBody(req);
      if (!safeEqual(str(body.code, 200), ADMIN_CODE)) {
        recordFailure(ip);
        return send(res, 401, { error: "Code admin incorrect." }), true;
      }
      attempts.delete(ip);
      return send(res, 200, { token: TOKEN }), true;
    }

    // everything below needs the admin token
    const token = (req.headers.authorization || "").replace(/^Bearer\s+/i, "");
    if (!isAdminToken(token)) return send(res, 401, { error: "Session admin expirée. Entre à nouveau le code admin." }), true;

    if (url.pathname === "/api/quizzes" && req.method === "GET") {
      return send(res, 200, { quizzes: await store.list() }), true;
    }

    const m = url.pathname.match(/^\/api\/quizzes\/([^/]+)$/);
    if (m) {
      const id = cleanId(m[1]);
      if (!id) return send(res, 400, { error: "Identifiant invalide." }), true;

      if (req.method === "GET") {
        const quiz = await store.get(id);
        return quiz ? send(res, 200, { quiz }) : send(res, 404, { error: "Quiz introuvable." }), true;
      }

      if (req.method === "PUT") {
        const body = await readBody(req);
        const raw = body.quiz || {};
        // keep the editable fields only; questions may be empty while the quiz is being written
        const questions = Array.isArray(raw.questions) ? raw.questions : [];
        if (questions.length) sanitizeQuiz({ ...raw, questions }); // throws a readable error if a question is broken
        const quiz = {
          id,
          title: str(raw.title, 80) || "Quiz sans titre",
          description: str(raw.description, 300),
          author: str(body.author, 40),
          thumb: String(raw.thumb || "").startsWith("data:image/") && String(raw.thumb).length < 40000 ? raw.thumb : "",
          questions: questions.slice(0, 100),
        };
        const updatedAt = await store.save(quiz);
        return send(res, 200, { ok: true, updatedAt }), true;
      }

      if (req.method === "DELETE") {
        await store.remove(id);
        return send(res, 200, { ok: true }), true;
      }
    }

    return send(res, 404, { error: "Route inconnue." }), true;
  } catch (err) {
    console.error(err);
    return send(res, err.status || 500, { error: err.status ? err.message : "Erreur du serveur, réessaie." }), true;
  }
}

module.exports = { handleApi, isAdminToken, store };
