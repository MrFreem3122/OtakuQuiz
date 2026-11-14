/* Host (quiz master) screen. The host runs the game and does not play. */

$$("[data-icon]").forEach((n) => n.append(icon(n.dataset.icon)));

const params = new URLSearchParams(location.search);
const quizId = params.get("quiz");
let quizTitle = "";
const SESSION_KEY = `otakuquiz.host.${quizId}`;

let session = null; // { code, hostToken }
try { session = JSON.parse(sessionStorage.getItem(SESSION_KEY)); } catch {}

let stopTimer = () => {};
let players = [];
let state = { total: 0, qIndex: -1, isLast: false, questionType: null };

function bindTitle(title) {
  $$('[data-bind="title"]').forEach((n) => (n.textContent = title));
  document.title = `${title} | OtaKu Quiz`;
}

function fatal(message) {
  show("loading");
  $(".spinner").hidden = true;
  $("#loadingText").hidden = true;
  $("#loadingErrorText").textContent = message;
  $("#loadingError").hidden = false;
}

if (!quizId) {
  fatal("Aucun quiz choisi.");
} else if (requireAdmin()) {
  var conn = connect({
    onOpen() {
      if (session) conn.send({ type: "host:resume", code: session.code, hostToken: session.hostToken });
      else conn.send({ type: "host:create", quizId, token: Admin.token() });
    },
    onMessage: handle,
  });
}

function joinUrl(code) {
  return `${location.origin}/j/${code}`;
}

function handle(msg) {
  switch (msg.type) {
    case "host:created":
      session = { code: msg.code, hostToken: msg.hostToken };
      sessionStorage.setItem(SESSION_KEY, JSON.stringify(session));
      break;

    case "host:state":
      quizTitle = msg.quizTitle;
      bindTitle(quizTitle);
      state.total = msg.total;
      state.qIndex = msg.qIndex;
      players = msg.players;
      $("#roomCode").textContent = msg.code;
      $("#shareLink").textContent = joinUrl(msg.code).replace(/^https?:\/\//, "");
      renderPlayers();
      if (msg.phase === "lobby") show("lobby");
      break;

    case "players":
      players = msg.players;
      renderPlayers();
      break;

    case "host:question":
      showQuestion(msg.question);
      break;

    case "host:progress":
      $("#qProgress").textContent = `${msg.answered} / ${msg.total}`;
      $("#qAnswered").replaceChildren(
        ...msg.answers.map((a) =>
          el("li", { class: "player-row", style: "min-height:auto;justify-content:center" },
            el("span", { class: "name", style: "flex:none" }, a.name),
            state.questionType === "text" ? el("span", { class: "muted" }, `: ${a.answer}`) : null
          )
        )
      );
      break;

    case "host:review":
      showReview(msg);
      break;

    case "host:results":
      stopTimer();
      state.isLast = msg.isLast;
      $("#resCounter").textContent = `Question ${msg.index + 1} sur ${state.total}`;
      renderBoard($("#resBoard"), msg.leaderboard);
      $("#nextBtn").textContent = msg.isLast ? "Voir le classement final" : "Question suivante";
      show("results");
      break;

    case "host:final":
      stopTimer();
      renderPodium($("#finalPodium"), msg.leaderboard);
      renderBoard($("#finalBoard"), msg.leaderboard);
      sessionStorage.removeItem(SESSION_KEY);
      show("final");
      break;

    case "error":
      if (msg.code === "not_found" && session) {
        // the old game is gone (server restarted or expired): start a fresh one
        sessionStorage.removeItem(SESSION_KEY);
        session = null;
        conn.send({ type: "host:create", quizId, token: Admin.token() });
        return;
      }
      if (msg.code === "not_admin") {
        Admin.clear();
        return fatal(msg.message);
      }
      if ($('[data-view="loading"]').hidden === false) return fatal(msg.message);
      toast(msg.message);
      break;
  }
}

/* ---------- lobby ---------- */

function renderPlayers() {
  const connected = players.filter((p) => p.connected);
  $("#playerCount").textContent = players.length ? `(${connected.length})` : "";
  $("#noPlayers").hidden = players.length > 0;
  $("#startBtn").disabled = connected.length === 0;
  $("#lobbyPlayers").replaceChildren(
    ...players.map((p) =>
      el("li", { class: `card player-row${p.connected ? "" : " offline"}` },
        el("span", { class: "avatar", "aria-hidden": "true" }, initials(p.name)),
        el("span", { class: "name" }, p.name, p.connected ? null : el("span", { class: "muted" }, " (déconnecté)")),
        el("button", {
          class: "icon-btn", type: "button", "aria-label": `Retirer ${p.name} de la partie`, title: "Retirer",
          onclick: () => { if (confirm(`Retirer ${p.name} de la partie ?`)) conn.send({ type: "host:kick", playerId: p.id }); },
        }, icon("close"))
      )
    )
  );
}

$("#copyLink").addEventListener("click", async () => {
  const text = joinUrl(session.code);
  try {
    await navigator.clipboard.writeText(text);
    toast("Lien copié.");
  } catch {
    toast(text);
  }
});

$("#shareWhatsApp").addEventListener("click", () => {
  const text = `🧠 Quiz « ${quizTitle} » sur OtaKu !\nRejoins la partie : ${joinUrl(session.code)}\nCode : ${session.code}`;
  window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, "_blank", "noopener");
});

$("#startBtn").addEventListener("click", () => conn.send({ type: "host:start" }));

$$('[data-action="close"]').forEach((b) =>
  b.addEventListener("click", () => {
    if (!confirm("Fermer la partie ? Les joueurs seront déconnectés.")) return;
    conn.send({ type: "host:close" });
    sessionStorage.removeItem(SESSION_KEY);
    conn.close();
    show("closed");
  })
);

/* ---------- question ---------- */

function showQuestion(q) {
  stopTimer();
  state.qIndex = q.index;
  state.questionType = q.type;
  $("#qCounter").textContent = `Question ${q.index + 1} / ${q.total}`;
  $("#qText").textContent = q.text;
  $("#qImage").hidden = !q.image;
  if (q.image) $("#qImage img").src = q.image;

  const letters = ["A", "B", "C", "D"];
  let rows = [];
  if (q.type === "mcq") rows = q.choices.map((c, i) => ({ label: c, letter: letters[i], correct: c === q.correctText }));
  if (q.type === "truefalse") rows = [{ label: "Vrai", correct: q.correctText === "Vrai" }, { label: "Faux", correct: q.correctText === "Faux" }];
  if (q.type === "text") rows = [{ label: `Réponse attendue : ${q.correctText}`, correct: true }];
  $("#qChoices").replaceChildren(
    ...rows.map((r) =>
      el("div", { class: `host-choice${r.correct ? " is-correct" : ""}` },
        r.letter ? el("span", { class: "letter" }, r.letter) : null,
        el("span", {}, r.label),
        r.correct ? el("span", { style: "margin-left:auto" }, icon("check")) : null
      )
    )
  );
  $("#qProgress").textContent = "0 / 0";
  $("#qAnswered").replaceChildren();
  stopTimer = startCountdown(q.endsAt, q.duration, $("#qTimer"), $("#qBar"));
  show("question");
}

$("#skipBtn").addEventListener("click", () => conn.send({ type: "host:skip" }));

/* ---------- review ---------- */

function showReview(msg) {
  stopTimer();
  const q = msg.question;
  $("#rCounter").textContent = `Question ${msg.index + 1} sur ${state.total}`;
  $("#rText").textContent = q.text;
  $("#rCorrect").textContent = q.correctText;
  $("#rHint").textContent = q.type === "text"
    ? "Tu peux valider une réponse proche (faute de frappe, autre nom…) avant d'afficher les résultats."
    : "Les réponses sont corrigées automatiquement.";

  $("#rRows").replaceChildren(
    ...msg.rows.map((r) => {
      const toggle = q.type === "text" && r.answered
        ? el("div", { class: "toggle" },
            el("button", {
              type: "button", class: r.correct ? "on-good" : "", "aria-pressed": String(r.correct), "aria-label": `Valider la réponse de ${r.name}`,
              onclick: () => conn.send({ type: "host:validate", playerId: r.id, correct: true }),
            }, "✓"),
            el("button", {
              type: "button", class: !r.correct ? "on-bad" : "", "aria-pressed": String(!r.correct), "aria-label": `Refuser la réponse de ${r.name}`,
              onclick: () => conn.send({ type: "host:validate", playerId: r.id, correct: false }),
            }, "✗")
          )
        : el("div", { class: "toggle" },
            el("span", { style: `font-size:22px;font-weight:800;color:${r.correct ? "var(--good)" : "var(--bad)"}` }, r.answered ? (r.correct ? "✓" : "✗") : "")
          );
      return el("li", { class: "card review-row" },
        el("span", { class: "who" }, r.name),
        el("span", { class: "what" }, r.answered ? r.answer : "Pas de réponse"),
        toggle
      );
    })
  );
  show("review");
}

$("#revealBtn").addEventListener("click", () => conn.send({ type: "host:reveal" }));

/* ---------- results / final ---------- */

$("#nextBtn").addEventListener("click", () => conn.send({ type: "host:next" }));

$("#replayBtn").addEventListener("click", () => {
  sessionStorage.removeItem(SESSION_KEY);
  location.reload();
});
