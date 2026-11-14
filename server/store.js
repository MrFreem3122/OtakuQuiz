// Quiz library storage.
// - With DATABASE_URL (Neon Postgres): queries go over Neon's SQL-over-HTTP endpoint, no driver needed.
// - Without it (local development): quizzes are kept in data/quizzes.json.

const fs = require("fs");
const path = require("path");

const DATABASE_URL = process.env.DATABASE_URL || "";

/* ---------------- Neon over HTTP ---------------- */

function neonEndpoint(connectionString) {
  const url = new URL(connectionString);
  return `https://${url.hostname}/sql`;
}

async function neonQuery(query, params = []) {
  const res = await fetch(neonEndpoint(DATABASE_URL), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Neon-Connection-String": DATABASE_URL,
      "Neon-Raw-Text-Output": "true",
      "Neon-Array-Mode": "false",
    },
    body: JSON.stringify({ query, params }),
  });
  const text = await res.text();
  let body;
  try { body = JSON.parse(text); } catch { body = { message: text }; }
  if (!res.ok) throw new Error(`Database error: ${body.message || res.status}`);
  return body.rows || [];
}

const neonStore = {
  kind: "neon",
  async init() {
    await neonQuery(`CREATE TABLE IF NOT EXISTS quizzes (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      author TEXT NOT NULL DEFAULT '',
      question_count INTEGER NOT NULL DEFAULT 0,
      thumb TEXT NOT NULL DEFAULT '',
      data TEXT NOT NULL,
      created_at BIGINT NOT NULL,
      updated_at BIGINT NOT NULL
    )`);
  },
  async list() {
    const rows = await neonQuery(
      "SELECT id, title, author, question_count, thumb, updated_at FROM quizzes ORDER BY updated_at DESC"
    );
    return rows.map((r) => ({
      id: r.id,
      title: r.title,
      author: r.author,
      questionCount: Number(r.question_count),
      thumb: r.thumb,
      updatedAt: Number(r.updated_at),
    }));
  },
  async get(id) {
    const rows = await neonQuery("SELECT data, author, updated_at FROM quizzes WHERE id = $1", [id]);
    if (!rows.length) return null;
    return { ...JSON.parse(rows[0].data), id, author: rows[0].author, updatedAt: Number(rows[0].updated_at) };
  },
  async save(quiz) {
    const now = Date.now();
    await neonQuery(
      `INSERT INTO quizzes (id, title, author, question_count, thumb, data, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $7)
       ON CONFLICT (id) DO UPDATE SET
         title = EXCLUDED.title, question_count = EXCLUDED.question_count,
         thumb = EXCLUDED.thumb, data = EXCLUDED.data, updated_at = EXCLUDED.updated_at`,
      [quiz.id, quiz.title, quiz.author || "", String(quiz.questions.length), quiz.thumb || "", JSON.stringify(quiz), String(now)]
    );
    return now;
  },
  async remove(id) {
    await neonQuery("DELETE FROM quizzes WHERE id = $1", [id]);
  },
};

/* ---------------- local JSON file (development) ---------------- */

const FILE = path.join(__dirname, "..", "data", "quizzes.json");

function readFile() {
  try { return JSON.parse(fs.readFileSync(FILE, "utf8")); } catch { return {}; }
}
function writeFile(all) {
  fs.mkdirSync(path.dirname(FILE), { recursive: true });
  fs.writeFileSync(FILE, JSON.stringify(all));
}

const fileStore = {
  kind: "file",
  async init() {},
  async list() {
    return Object.values(readFile())
      .sort((a, b) => b.updatedAt - a.updatedAt)
      .map((q) => ({ id: q.id, title: q.title, author: q.author || "", questionCount: q.questions.length, thumb: q.thumb || "", updatedAt: q.updatedAt }));
  },
  async get(id) {
    return readFile()[id] || null;
  },
  async save(quiz) {
    const all = readFile();
    const now = Date.now();
    const author = all[quiz.id] ? all[quiz.id].author : quiz.author;
    all[quiz.id] = { ...quiz, author, updatedAt: now };
    writeFile(all);
    return now;
  },
  async remove(id) {
    const all = readFile();
    delete all[id];
    writeFile(all);
  },
};

module.exports = DATABASE_URL ? neonStore : fileStore;
