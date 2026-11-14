// Game rooms: one host (the quiz master) and many players.
// The server keeps the quiz and its answers; players only ever receive the questions.

const crypto = require("crypto");

const CODE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const MAX_PLAYERS = 60;
const ROOM_TTL_MS = 3 * 60 * 60 * 1000; // rooms are removed after 3h without activity
const BASE_POINTS = 500;
const SPEED_POINTS = 500;

const rooms = new Map();

// Set by server.js: how to check an admin token and load a quiz from the library.
let deps = { isAdmin: () => false, loadQuiz: async () => null };
function configure(d) { deps = { ...deps, ...d }; }

/* ---------------- helpers ---------------- */

const token = () => crypto.randomBytes(16).toString("hex");

function newCode() {
  let code;
  do {
    code = Array.from({ length: 4 }, () => CODE_CHARS[crypto.randomInt(CODE_CHARS.length)]).join("");
  } while (rooms.has(code));
  return code;
}

function str(value, max) {
  return String(value ?? "").trim().slice(0, max);
}

// "Marine Ford" == "marineford" == "Marinéford"
function normalize(text) {
  return String(text ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

function cleanImage(value) {
  const s = String(value ?? "");
  if (s.startsWith("data:image/") && s.length < 400000) return s;
  if (/^https:\/\/\S+$/.test(s) && s.length < 2000) return s;
  return "";
}

// Validate and clean a quiz sent by the host.
function sanitizeQuiz(raw) {
  if (!raw || typeof raw !== "object") throw new Error("Quiz invalide.");
  const questions = (Array.isArray(raw.questions) ? raw.questions : []).slice(0, 100).map((q) => {
    const type = ["mcq", "truefalse", "text"].includes(q.type) ? q.type : "mcq";
    const out = {
      type,
      text: str(q.text, 300),
      image: cleanImage(q.image),
      duration: Math.min(120, Math.max(5, parseInt(q.duration, 10) || 20)),
    };
    if (type === "mcq") {
      out.choices = (Array.isArray(q.choices) ? q.choices : []).map((c) => str(c, 120)).filter(Boolean).slice(0, 4);
      out.correct = Math.min(Math.max(parseInt(q.correct, 10) || 0, 0), Math.max(out.choices.length - 1, 0));
      if (out.choices.length < 2) throw new Error(`La question « ${out.text || "sans titre"} » a besoin d'au moins 2 choix.`);
    } else if (type === "truefalse") {
      out.correct = q.correct === true || q.correct === "true";
    } else {
      out.answers = (Array.isArray(q.answers) ? q.answers : String(q.answers ?? "").split(","))
        .map((a) => str(a, 120)).filter(Boolean).slice(0, 20);
    }
    if (!out.text) throw new Error("Une question n'a pas de texte.");
    return out;
  });
  if (!questions.length) throw new Error("Ajoute au moins une question avant de lancer la partie.");
  return {
    title: str(raw.title, 80) || "Quiz Otaku",
    description: str(raw.description, 300),
    questions,
  };
}

function publicQuestion(room) {
  const q = room.quiz.questions[room.qIndex];
  const out = {
    index: room.qIndex,
    total: room.quiz.questions.length,
    type: q.type,
    text: q.text,
    image: q.image,
    duration: q.duration,
    endsAt: room.endsAt,
  };
  if (q.type === "mcq") out.choices = q.choices;
  return out;
}

function correctAnswerText(q) {
  if (q.type === "mcq") return q.choices[q.correct];
  if (q.type === "truefalse") return q.correct ? "Vrai" : "Faux";
  return q.answers.join(" / ") || "(validée par l'animateur)";
}

function isCorrect(q, answer) {
  if (q.type === "mcq") return Number(answer) === q.correct;
  if (q.type === "truefalse") return (answer === true || answer === "true") === q.correct;
  const given = normalize(answer);
  return !!given && q.answers.some((a) => normalize(a) === given);
}

function answerLabel(q, answer) {
  if (answer === undefined || answer === null || answer === "") return "";
  if (q.type === "mcq") return q.choices[Number(answer)] ?? "";
  if (q.type === "truefalse") return answer === true || answer === "true" ? "Vrai" : "Faux";
  return String(answer);
}

function playerList(room) {
  return [...room.players.values()].map((p) => ({ id: p.id, name: p.name, connected: p.connected, score: p.score }));
}

function leaderboard(room) {
  return [...room.players.values()]
    .sort((a, b) => b.score - a.score || a.name.localeCompare(b.name))
    .map((p, i) => ({ rank: i + 1, id: p.id, name: p.name, score: p.score }));
}

/* ---------------- sending ---------------- */

function toHost(room, msg) {
  if (room.hostWs) room.hostWs.sendJSON(msg);
}

function toPlayers(room, msgOrFn) {
  for (const p of room.players.values()) {
    if (!p.ws) continue;
    p.ws.sendJSON(typeof msgOrFn === "function" ? msgOrFn(p) : msgOrFn);
  }
}

function broadcastLobby(room) {
  const msg = { type: "players", players: playerList(room) };
  toHost(room, msg);
  toPlayers(room, msg);
}

function hostProgress(room) {
  const q = room.quiz.questions[room.qIndex];
  const answers = [...room.players.values()]
    .filter((p) => p.answers[room.qIndex])
    .map((p) => ({ id: p.id, name: p.name, answer: answerLabel(q, p.answers[room.qIndex].value) }));
  toHost(room, {
    type: "host:progress",
    answered: answers.length,
    total: [...room.players.values()].filter((p) => p.connected).length,
    answers,
  });
}

function hostReview(room) {
  const q = room.quiz.questions[room.qIndex];
  const rows = [...room.players.values()].map((p) => {
    const a = p.answers[room.qIndex];
    return {
      id: p.id,
      name: p.name,
      answer: a ? answerLabel(q, a.value) : "",
      answered: !!a,
      correct: !!(a && a.correct),
    };
  });
  toHost(room, {
    type: "host:review",
    index: room.qIndex,
    question: { ...q, correctText: correctAnswerText(q) },
    rows,
  });
}

/* ---------------- game flow ---------------- */

function touch(room) {
  room.lastActivity = Date.now();
}

function startQuestion(room, index) {
  clearTimeout(room.timer);
  room.qIndex = index;
  room.phase = "question";
  const q = room.quiz.questions[index];
  room.startedAt = Date.now();
  room.endsAt = room.startedAt + q.duration * 1000;
  room.timer = setTimeout(() => endQuestion(room), q.duration * 1000 + 300);

  const question = publicQuestion(room);
  toPlayers(room, { type: "question", question, serverNow: Date.now() });
  toHost(room, {
    type: "host:question",
    question: { ...question, correctText: correctAnswerText(q) },
    serverNow: Date.now(),
  });
  hostProgress(room);
}

function endQuestion(room) {
  if (room.phase !== "question") return;
  clearTimeout(room.timer);
  room.phase = "review";
  toPlayers(room, { type: "question:closed", index: room.qIndex });
  hostReview(room);
}

function reveal(room) {
  if (room.phase !== "review") return;
  const q = room.quiz.questions[room.qIndex];
  room.phase = "results";

  for (const p of room.players.values()) {
    const a = p.answers[room.qIndex];
    a && (a.points = 0);
    if (a && a.correct) {
      a.points = BASE_POINTS + Math.round(SPEED_POINTS * a.timeLeft);
      p.score += a.points;
    }
  }

  const board = leaderboard(room);
  const isLast = room.qIndex >= room.quiz.questions.length - 1;
  toPlayers(room, (p) => {
    const a = p.answers[room.qIndex];
    return {
      type: "results",
      index: room.qIndex,
      isLast,
      correctText: correctAnswerText(q),
      yourAnswer: a ? answerLabel(q, a.value) : "",
      correct: !!(a && a.correct),
      points: a ? a.points || 0 : 0,
      score: p.score,
      rank: board.find((r) => r.id === p.id)?.rank,
      leaderboard: board.slice(0, 10),
    };
  });
  toHost(room, { type: "host:results", index: room.qIndex, isLast, correctText: correctAnswerText(q), leaderboard: board });
}

function finish(room) {
  clearTimeout(room.timer);
  room.phase = "final";
  const board = leaderboard(room);
  toPlayers(room, (p) => ({
    type: "final",
    leaderboard: board,
    rank: board.find((r) => r.id === p.id)?.rank,
    score: p.score,
  }));
  toHost(room, { type: "host:final", leaderboard: board });
}

function closeRoom(room, reason = "La partie a été fermée par l'animateur.") {
  clearTimeout(room.timer);
  toPlayers(room, { type: "room:closed", reason });
  rooms.delete(room.code);
}

/* ---------------- state snapshots (for reconnects) ---------------- */

function playerSnapshot(room, p) {
  const snap = {
    type: "state",
    phase: room.phase,
    quizTitle: room.quiz.title,
    you: { id: p.id, name: p.name, score: p.score },
    players: playerList(room),
    serverNow: Date.now(),
  };
  if (room.phase === "question") {
    snap.question = publicQuestion(room);
    snap.answered = !!p.answers[room.qIndex];
  }
  if (room.phase === "results" || room.phase === "final" || room.phase === "review") {
    snap.leaderboard = leaderboard(room).slice(0, 10);
  }
  return snap;
}

function hostSnapshot(room) {
  return {
    type: "host:state",
    code: room.code,
    phase: room.phase,
    quizTitle: room.quiz.title,
    total: room.quiz.questions.length,
    qIndex: room.qIndex,
    players: playerList(room),
    serverNow: Date.now(),
  };
}

/* ---------------- message handling ---------------- */

function handleConnection(ws) {
  let role = null; // { kind: "host", room } | { kind: "player", room, player }

  const fail = (message, code = "error") => ws.sendJSON({ type: "error", code, message });

  ws.on("close", () => {
    if (!role || !role.room) return;
    const room = role.room;
    if (!rooms.has(room.code)) return;
    if (role.kind === "host") {
      if (room.hostWs === ws) room.hostWs = null;
      toPlayers(room, { type: "host:status", connected: false });
    } else if (role.player.ws === ws) {
      role.player.ws = null;
      role.player.connected = false;
      broadcastLobby(room);
      if (room.phase === "question") hostProgress(room);
    }
  });

  ws.on("message", (raw) => {
    let msg;
    try { msg = JSON.parse(raw); } catch { return; }
    if (!msg || typeof msg.type !== "string") return;

    try {
      /* ----- host ----- */
      if (msg.type === "host:create") {
        if (!deps.isAdmin(msg.token)) return fail("Seuls les admins peuvent lancer une partie. Reconnecte-toi avec le code admin.", "not_admin");
        if (role) return; // already hosting from this connection
        role = { kind: "pending" };
        deps.loadQuiz(str(msg.quizId, 40)).then((raw) => {
          if (!raw) { role = null; return fail("Ce quiz n'existe plus dans la bibliothèque.", "quiz_not_found"); }
          let quiz;
          try { quiz = sanitizeQuiz(raw); } catch (e) { role = null; return fail(e.message, "invalid_quiz"); }
          const room = {
            code: newCode(),
            hostToken: token(),
            hostWs: ws,
            quiz,
            players: new Map(),
            phase: "lobby",
            qIndex: -1,
            timer: null,
            createdAt: Date.now(),
            lastActivity: Date.now(),
          };
          rooms.set(room.code, room);
          role = { kind: "host", room };
          ws.sendJSON({ type: "host:created", code: room.code, hostToken: room.hostToken });
          ws.sendJSON(hostSnapshot(room));
        }).catch((e) => { role = null; console.error(e); fail("Impossible de charger le quiz, réessaie."); });
        return;
      }

      if (msg.type === "host:resume") {
        const room = rooms.get(str(msg.code, 8).toUpperCase());
        if (!room || room.hostToken !== msg.hostToken) return fail("Cette partie n'existe plus.", "not_found");
        if (room.hostWs && room.hostWs !== ws) room.hostWs.close(4000, "Replaced");
        room.hostWs = ws;
        role = { kind: "host", room };
        touch(room);
        ws.sendJSON(hostSnapshot(room));
        if (room.phase === "question") {
          const q = room.quiz.questions[room.qIndex];
          ws.sendJSON({ type: "host:question", question: { ...publicQuestion(room), correctText: correctAnswerText(q) }, serverNow: Date.now() });
          hostProgress(room);
        } else if (room.phase === "review") hostReview(room);
        else if (room.phase === "results") {
          const q = room.quiz.questions[room.qIndex];
          ws.sendJSON({ type: "host:results", index: room.qIndex, isLast: room.qIndex >= room.quiz.questions.length - 1, correctText: correctAnswerText(q), leaderboard: leaderboard(room) });
        } else if (room.phase === "final") ws.sendJSON({ type: "host:final", leaderboard: leaderboard(room) });
        toPlayers(room, { type: "host:status", connected: true });
        return;
      }

      if (role?.kind === "host") {
        const room = role.room;
        if (!rooms.has(room.code)) return fail("Cette partie n'existe plus.", "not_found");
        touch(room);
        switch (msg.type) {
          case "host:start":
            if (room.phase !== "lobby") return;
            if (![...room.players.values()].some((p) => p.connected)) return fail("Attends qu'au moins un joueur soit connecté.");
            return startQuestion(room, 0);
          case "host:skip":
            return endQuestion(room);
          case "host:validate": {
            if (room.phase !== "review") return;
            const p = room.players.get(msg.playerId);
            const a = p && p.answers[room.qIndex];
            if (a) a.correct = !!msg.correct;
            return hostReview(room);
          }
          case "host:reveal":
            return reveal(room);
          case "host:next":
            if (room.phase !== "results") return;
            if (room.qIndex >= room.quiz.questions.length - 1) return finish(room);
            return startQuestion(room, room.qIndex + 1);
          case "host:kick": {
            const p = room.players.get(msg.playerId);
            if (!p) return;
            if (p.ws) { p.ws.sendJSON({ type: "kicked" }); p.ws.close(4001, "Kicked"); }
            room.players.delete(p.id);
            broadcastLobby(room);
            if (room.phase === "question") hostProgress(room);
            return;
          }
          case "host:close":
            return closeRoom(room);
        }
        return;
      }

      /* ----- player ----- */
      if (msg.type === "player:join") {
        const code = str(msg.code, 8).toUpperCase();
        const room = rooms.get(code);
        if (!room) return fail("Aucune partie avec ce code. Vérifie le code avec l'animateur.", "not_found");
        touch(room);

        // Reconnect with a token
        const existing = msg.token && [...room.players.values()].find((p) => p.token === msg.token);
        if (existing) {
          if (existing.ws && existing.ws !== ws) existing.ws.close(4000, "Replaced");
          existing.ws = ws;
          existing.connected = true;
          role = { kind: "player", room, player: existing };
          ws.sendJSON({ type: "joined", code, token: existing.token, playerId: existing.id, name: existing.name, quizTitle: room.quiz.title });
          ws.sendJSON(playerSnapshot(room, existing));
          broadcastLobby(room);
          if (room.phase === "question") hostProgress(room);
          return;
        }

        const name = str(msg.name, 20);
        if (!name) return fail("Choisis un pseudo.", "name_required");
        if (room.phase === "final") return fail("Cette partie est terminée.", "finished");
        if (room.players.size >= MAX_PLAYERS) return fail("La partie est complète.", "full");
        if ([...room.players.values()].some((p) => normalize(p.name) === normalize(name))) {
          return fail("Ce pseudo est déjà pris dans cette partie. Choisis-en un autre.", "name_taken");
        }

        const player = { id: token().slice(0, 8), token: token(), name, ws, connected: true, score: 0, answers: {} };
        room.players.set(player.id, player);
        role = { kind: "player", room, player };
        ws.sendJSON({ type: "joined", code, token: player.token, playerId: player.id, name, quizTitle: room.quiz.title });
        ws.sendJSON(playerSnapshot(room, player));
        broadcastLobby(room);
        if (room.phase === "question") hostProgress(room);
        return;
      }

      if (role?.kind === "player") {
        const { room, player } = role;
        if (!rooms.has(room.code)) return fail("Cette partie n'existe plus.", "not_found");
        touch(room);

        if (msg.type === "player:answer") {
          if (room.phase !== "question" || msg.index !== room.qIndex) return;
          if (player.answers[room.qIndex]) return; // one answer per question
          const q = room.quiz.questions[room.qIndex];
          let value = msg.answer;
          if (q.type === "mcq") value = parseInt(value, 10);
          if (q.type === "mcq" && !(value >= 0 && value < q.choices.length)) return;
          if (q.type === "text") value = str(value, 120);
          const now = Date.now();
          const timeLeft = Math.max(0, Math.min(1, (room.endsAt - now) / (q.duration * 1000)));
          player.answers[room.qIndex] = { value, at: now, timeLeft, correct: isCorrect(q, value), points: 0 };
          ws.sendJSON({ type: "answer:ok", index: room.qIndex });
          hostProgress(room);
          const connected = [...room.players.values()].filter((p) => p.connected);
          if (connected.every((p) => p.answers[room.qIndex])) endQuestion(room);
          return;
        }

        if (msg.type === "player:leave") {
          room.players.delete(player.id);
          role = null;
          broadcastLobby(room);
          if (room.phase === "question") hostProgress(room);
          return;
        }
      }
    } catch (err) {
      fail(err.message || "Erreur inattendue.");
    }
  });
}

// Clean up old rooms
setInterval(() => {
  const now = Date.now();
  for (const room of rooms.values()) {
    if (now - room.lastActivity > ROOM_TTL_MS) closeRoom(room, "La partie a expiré.");
  }
}, 10 * 60 * 1000).unref();

module.exports = { handleConnection, configure, rooms, normalize, sanitizeQuiz };
