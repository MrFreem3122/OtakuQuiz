/* Player screen: join with a code, wait in the lobby, answer questions. */

$$("[data-icon]").forEach((n) => n.append(icon(n.dataset.icon)));

const params = new URLSearchParams(location.search);
const NAME_KEY = "otakuquiz.name";

let conn = null;
let me = null;        // { code, token, playerId, name }
let stopTimer = () => {};
let current = null;   // current question
let joining = false;

const sessionKey = (code) => `otakuquiz.player.${code}`;

/* ---------- join form ---------- */

function codeFrom(text) {
  const s = String(text || "").trim();
  const m = s.match(/\/j\/([A-Za-z0-9]{4,8})/) || s.match(/[?&]code=([A-Za-z0-9]{4,8})/);
  if (m) return m[1].toUpperCase();
  return /^[A-Za-z0-9]{4,8}$/.test(s) ? s.toUpperCase() : "";
}

$("#code").value = (params.get("code") || "").toUpperCase();
$("#name").value = localStorage.getItem(NAME_KEY) || "";

$("#link").addEventListener("input", (e) => {
  const c = codeFrom(e.target.value);
  if (c) $("#code").value = c;
});

$("#pasteBtn").addEventListener("click", async () => {
  try {
    const text = await navigator.clipboard.readText();
    const c = codeFrom(text);
    if (c) { $("#code").value = c; $("#name").focus(); }
    else toast("Le presse-papier ne contient pas de code.");
  } catch {
    toast("Colle le code avec un appui long dans le champ.");
  }
});

function joinError(message) {
  joining = false;
  $("#joinBtn").disabled = false;
  $("#joinError").textContent = message;
  $("#joinError").hidden = false;
  show("join");
}

$("#joinForm").addEventListener("submit", (e) => {
  e.preventDefault();
  const code = codeFrom($("#code").value) || codeFrom($("#link").value);
  const name = $("#name").value.trim();
  if (!code) return joinError("Entre le code de la partie (4 caractères).");
  if (!name) return joinError("Choisis un pseudo.");
  localStorage.setItem(NAME_KEY, name);
  $("#joinError").hidden = true;
  $("#joinBtn").disabled = true;
  joining = true;
  start(code, name);
});

/* ---------- connection ---------- */

function start(code, name) {
  let saved = null;
  try { saved = JSON.parse(sessionStorage.getItem(sessionKey(code))); } catch {}
  me = { code, name, token: saved && saved.token, playerId: saved && saved.playerId };

  if (conn) conn.close();
  conn = connect({
    onOpen() {
      conn.send({ type: "player:join", code: me.code, name: me.name, token: me.token });
    },
    onMessage: handle,
  });
}

function handle(msg) {
  switch (msg.type) {
    case "joined":
      joining = false;
      me = { code: msg.code, token: msg.token, playerId: msg.playerId, name: msg.name };
      sessionStorage.setItem(sessionKey(msg.code), JSON.stringify(me));
      $$('[data-bind="title"]').forEach((n) => (n.textContent = msg.quizTitle));
      document.title = `${msg.quizTitle} | OtaKu Quiz`;
      history.replaceState(null, "", `join.html?code=${msg.code}`);
      break;

    case "state":
      applyState(msg);
      break;

    case "players":
      renderLobby(msg.players);
      break;

    case "question":
      showQuestion(msg.question, false);
      break;

    case "answer:ok":
      waitScreen("✅", "Réponse envoyée !", "En attente des autres joueurs…");
      break;

    case "question:closed":
      stopTimer();
      if (!$('[data-view="question"]').hidden) waitScreen("⏰", "Temps écoulé !", "En attente des résultats…");
      else $("#waitText").textContent = "En attente des résultats…";
      break;

    case "results":
      showResults(msg);
      break;

    case "final":
      showFinal(msg);
      break;

    case "host:status":
      if (!msg.connected) toast("L'animateur s'est déconnecté, il va revenir…");
      break;

    case "kicked":
      end("Tu as été retiré de la partie par l'animateur.");
      break;

    case "room:closed":
      end(msg.reason);
      break;

    case "error":
      if (msg.code === "not_found" && me && me.token && !joining) {
        return end("Cette partie n'existe plus.");
      }
      if (joining || !$('[data-view="join"]').hidden) {
        sessionStorage.removeItem(sessionKey(me.code));
        conn && conn.close();
        conn = null;
        return joinError(msg.message);
      }
      toast(msg.message);
      break;
  }
}

function end(text) {
  stopTimer();
  if (me) sessionStorage.removeItem(sessionKey(me.code));
  conn && conn.close();
  conn = null;
  $("#closedText").textContent = text;
  show("closed");
}

function applyState(s) {
  if (s.phase === "lobby") {
    renderLobby(s.players);
    show("lobby");
  } else if (s.phase === "question") {
    showQuestion(s.question, s.answered);
  } else if (s.phase === "review") {
    waitScreen("⏳", "Question terminée", "En attente des résultats…");
  } else if (s.phase === "results") {
    waitScreen("📊", "Résultats affichés", "En attente de la question suivante…");
  } else if (s.phase === "final") {
    showFinal({ leaderboard: s.leaderboard, rank: s.leaderboard.find((r) => r.id === me.playerId)?.rank, score: s.you.score });
  }
}

/* ---------- lobby ---------- */

function renderLobby(players) {
  $("#lobbyPlayers").replaceChildren(
    ...players.map((p) =>
      el("li", { class: `card player-row${p.connected ? "" : " offline"}` },
        el("span", { class: "avatar", "aria-hidden": "true" }, initials(p.name)),
        el("span", { class: "name" }, p.name, p.id === me?.playerId ? el("span", { class: "you-tag" }, "toi") : null),
        el("span", { class: "check", "aria-label": p.connected ? "connecté" : "déconnecté" }, p.connected ? icon("check") : "")
      )
    )
  );
}

$("#leaveBtn").addEventListener("click", () => {
  conn && conn.send({ type: "player:leave" });
  if (me) sessionStorage.removeItem(sessionKey(me.code));
  setTimeout(() => (location.href = "index.html"), 150);
});

/* ---------- question ---------- */

function showQuestion(q, alreadyAnswered) {
  stopTimer();
  current = q;
  if (alreadyAnswered) return waitScreen("✅", "Réponse envoyée !", "En attente des autres joueurs…");

  $("#qCounter").textContent = `Question ${q.index + 1} / ${q.total}`;
  $("#qText").textContent = q.text;
  $("#qImage").hidden = !q.image;
  if (q.image) $("#qImage img").src = q.image;

  const box = $("#qAnswers");
  box.className = "answers";
  $("#textForm").hidden = q.type !== "text";
  box.hidden = q.type === "text";

  if (q.type === "mcq") {
    const letters = ["A", "B", "C", "D"];
    box.replaceChildren(
      ...q.choices.map((c, i) =>
        el("button", { class: "answer-btn", type: "button", onclick: (e) => answer(i, e.currentTarget) },
          el("span", { class: "letter" }, letters[i]),
          el("span", {}, c)
        )
      )
    );
  } else if (q.type === "truefalse") {
    box.classList.add("two");
    box.replaceChildren(
      el("button", { class: "answer-btn", type: "button", onclick: (e) => answer(true, e.currentTarget) }, "Vrai"),
      el("button", { class: "answer-btn", type: "button", onclick: (e) => answer(false, e.currentTarget) }, "Faux")
    );
  } else {
    $("#textAnswer").value = "";
    setTimeout(() => $("#textAnswer").focus(), 50);
  }

  stopTimer = startCountdown(q.endsAt, q.duration, $("#qTimer"), $("#qBar"));
  show("question");
}

function answer(value, button) {
  if (!current) return;
  $$("#qAnswers .answer-btn").forEach((b) => {
    b.disabled = true;
    b.classList.toggle("picked", b === button);
    b.classList.toggle("dim", b !== button);
  });
  conn.send({ type: "player:answer", index: current.index, answer: value });
}

$("#textForm").addEventListener("submit", (e) => {
  e.preventDefault();
  const value = $("#textAnswer").value.trim();
  if (!value) return $("#textAnswer").focus();
  conn.send({ type: "player:answer", index: current.index, answer: value });
});

function waitScreen(iconText, title, text) {
  stopTimer();
  $("#waitIcon").textContent = iconText;
  $("#waitTitle").textContent = title;
  $("#waitText").textContent = text;
  show("wait");
}

/* ---------- results ---------- */

function showResults(r) {
  stopTimer();
  const card = $("#resCard");
  card.classList.toggle("result-good", r.correct);
  card.classList.toggle("result-bad", !r.correct);
  $("#resIcon").textContent = r.correct ? "🎉" : r.yourAnswer ? "😵" : "⏰";
  $("#resTitle").textContent = r.correct ? "Bonne réponse !" : r.yourAnswer ? "Raté !" : "Pas de réponse";
  $("#resAnswer").textContent = r.correct ? "" : `La bonne réponse : ${r.correctText}`;
  $("#resPoints").textContent = r.correct ? `+${r.points} pts` : "";
  $("#resRank").innerHTML = "";
  $("#resRank").append("Tu es ", el("strong", {}, `${r.rank}${r.rank === 1 ? "er" : "e"}`), ` avec ${r.score} pts`);
  renderBoard($("#resBoard"), r.leaderboard, me.playerId);
  $("#resNext").textContent = r.isLast ? "En attente du classement final…" : "En attente de la question suivante…";
  show("results");
}

function showFinal(f) {
  stopTimer();
  const rank = f.rank;
  $("#finalRank").textContent = rank
    ? rank === 1 ? `🏆 Tu as gagné avec ${f.score} pts !` : `Tu termines ${rank}e avec ${f.score} pts`
    : "";
  renderPodium($("#finalPodium"), f.leaderboard);
  renderBoard($("#finalBoard"), f.leaderboard, me && me.playerId);
  if (me) sessionStorage.removeItem(sessionKey(me.code));
  show("final");
}

/* ---------- auto-rejoin after a page reload ---------- */

(() => {
  const code = codeFrom(params.get("code"));
  if (!code) return;
  let saved = null;
  try { saved = JSON.parse(sessionStorage.getItem(sessionKey(code))); } catch {}
  if (saved && saved.token) {
    joining = false;
    start(code, saved.name);
  } else {
    $("#name").focus();
  }
})();
