/* Shared helpers for every OtakuQuiz page. */

/* ---------------- DOM ---------------- */

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

// el("div", { class: "card", onclick: fn }, "text", child)
function el(tag, attrs = {}, ...children) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v === undefined || v === null || v === false) continue;
    if (k === "class") node.className = v;
    else if (k === "html") node.innerHTML = v; // only used with our own icon strings
    else if (k.startsWith("on") && typeof v === "function") node.addEventListener(k.slice(2), v);
    else if (k === "dataset") Object.assign(node.dataset, v);
    else node.setAttribute(k, v === true ? "" : v);
  }
  for (const c of children.flat()) {
    if (c === undefined || c === null || c === false) continue;
    node.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
  return node;
}

function show(id) {
  $$("[data-view]").forEach((v) => (v.hidden = v.dataset.view !== id));
  window.scrollTo(0, 0);
}

let toastTimer;
function toast(message) {
  let t = $(".toast");
  if (!t) { t = el("div", { class: "toast", role: "status" }); document.body.append(t); }
  t.textContent = message;
  t.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (t.hidden = true), 2600);
}

function initials(name) {
  return String(name || "?").trim().slice(0, 1).toUpperCase();
}

/* ---------------- icons (Material-style, inline SVG) ---------------- */

const ICONS = {
  back: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 12H5M12 19l-7-7 7-7"/></svg>',
  check: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>',
  close: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M18 6 6 18M6 6l12 12"/></svg>',
  edit: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>',
  play: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><path d="M7 4v16l13-8Z"/></svg>',
  share: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><path d="m8.6 13.5 6.8 4M15.4 6.5l-6.8 4"/></svg>',
  image: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M21 19V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2ZM8.5 13.5l2.5 3 3.5-4.5 4.5 6H5Z"/></svg>',
  plus: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="10"/><path d="M12 8v8M8 12h8"/></svg>',
  copy: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>',
  link: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.7 1.7"/><path d="M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7l1.7-1.7"/></svg>',
  list: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/></svg>',
  upload: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M17 8l-5-5-5 5M12 3v12"/></svg>',
  download: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3"/></svg>',
  user: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/></svg>',
  whatsapp: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2a10 10 0 0 0-8.6 15.1L2 22l5-1.3A10 10 0 1 0 12 2Zm0 18.2a8.2 8.2 0 0 1-4.2-1.2l-.3-.2-3 .8.8-2.9-.2-.3A8.2 8.2 0 1 1 12 20.2Zm4.5-6.1c-.2-.1-1.5-.7-1.7-.8s-.4-.1-.6.1-.7.8-.8 1-.3.2-.5.1a6.7 6.7 0 0 1-3.3-2.9c-.3-.4.3-.4.7-1.3.1-.2 0-.3 0-.4l-.8-1.8c-.2-.5-.4-.4-.6-.4h-.5a1 1 0 0 0-.7.3 3 3 0 0 0-.9 2.2 5.2 5.2 0 0 0 1.1 2.7 11.8 11.8 0 0 0 4.5 4c1.7.7 2.3.8 3.2.6a2.7 2.7 0 0 0 1.8-1.2 2.2 2.2 0 0 0 .1-1.3c0-.1-.2-.2-.4-.3Z"/></svg>',
};

function icon(name) {
  return el("span", { "aria-hidden": "true", style: "display:contents", html: ICONS[name] || "" });
}

/* ---------------- quiz storage (in this browser) ---------------- */

const Store = {
  KEY: "otakuquiz.quizzes",

  all() {
    try { return JSON.parse(localStorage.getItem(this.KEY)) || []; }
    catch { return []; }
  },
  get(id) { return this.all().find((q) => q.id === id) || null; },
  save(quiz) {
    const list = this.all();
    quiz.updatedAt = Date.now();
    const i = list.findIndex((q) => q.id === quiz.id);
    if (i >= 0) list[i] = quiz; else list.unshift(quiz);
    try {
      localStorage.setItem(this.KEY, JSON.stringify(list));
    } catch {
      toast("Stockage plein : retire quelques images ou exporte puis supprime d'anciens quiz.");
      return false;
    }
    return true;
  },
  remove(id) {
    localStorage.setItem(this.KEY, JSON.stringify(this.all().filter((q) => q.id !== id)));
  },
  newId() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  },
};

function exportQuiz(quiz) {
  const data = JSON.stringify({ format: "otakuquiz", version: 1, quiz }, null, 2);
  const name = (quiz.title || "quiz").replace(/[^\w\- ]+/g, "").trim().replace(/\s+/g, "-") || "quiz";
  const blob = new Blob([data], { type: "application/json" });
  const file = new File([blob], `${name}.otakuquiz.json`, { type: "application/json" });
  if (navigator.canShare && navigator.canShare({ files: [file] })) {
    navigator.share({ files: [file], title: quiz.title }).catch(() => {});
    return;
  }
  const a = el("a", { href: URL.createObjectURL(blob), download: file.name });
  document.body.append(a);
  a.click();
  a.remove();
}

async function importQuizFile(file) {
  const text = await file.text();
  const data = JSON.parse(text);
  const quiz = data && data.format === "otakuquiz" ? data.quiz : data;
  if (!quiz || !Array.isArray(quiz.questions)) throw new Error("Ce fichier n'est pas un quiz OtakuQuiz.");
  quiz.id = Store.newId();
  quiz.title = String(quiz.title || "Quiz importé");
  Store.save(quiz);
  return quiz;
}

// Resize an image file to a small JPEG data URL so quizzes stay light.
function resizeImage(file, max = 800, quality = 0.75) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(1, max / Math.max(img.width, img.height));
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(img.width * scale);
      canvas.height = Math.round(img.height * scale);
      canvas.getContext("2d").drawImage(img, 0, 0, canvas.width, canvas.height);
      URL.revokeObjectURL(img.src);
      resolve(canvas.toDataURL("image/jpeg", quality));
    };
    img.onerror = () => reject(new Error("Image illisible."));
    img.src = URL.createObjectURL(file);
  });
}

const TYPE_LABELS = { mcq: "Choix multiple", truefalse: "Vrai / Faux", text: "Réponse libre" };

/* ---------------- real-time connection ---------------- */

// Auto-reconnecting WebSocket. onOpen runs on every (re)connection.
function connect({ onOpen, onMessage }) {
  let ws;
  let retry = 0;
  let closedOnPurpose = false;
  let banner;

  function setBanner(text) {
    if (!text) { banner && banner.remove(); banner = null; return; }
    if (!banner) { banner = el("div", { class: "banner", role: "status" }); document.body.append(banner); }
    banner.textContent = text;
  }

  function open() {
    const proto = location.protocol === "https:" ? "wss" : "ws";
    ws = new WebSocket(`${proto}://${location.host}/ws`);
    ws.onopen = () => { retry = 0; setBanner(null); onOpen && onOpen(); };
    ws.onmessage = (e) => {
      let msg;
      try { msg = JSON.parse(e.data); } catch { return; }
      if (msg.serverNow) Clock.sync(msg.serverNow);
      onMessage(msg);
    };
    ws.onclose = () => {
      if (closedOnPurpose) return;
      setBanner(retry > 1 ? "Connexion perdue, reconnexion…" : "Connexion au serveur…");
      retry++;
      setTimeout(open, Math.min(5000, 600 * retry));
    };
  }

  open();
  return {
    send(obj) { if (ws && ws.readyState === 1) ws.send(JSON.stringify(obj)); },
    close() { closedOnPurpose = true; ws && ws.close(); },
  };
}

// Keeps timers aligned with the server clock.
const Clock = {
  offset: 0,
  sync(serverNow) { this.offset = serverNow - Date.now(); },
  now() { return Date.now() + this.offset; },
};

// Countdown display bound to a question's endsAt.
function startCountdown(endsAt, duration, timerEl, barEl) {
  let raf;
  const tick = () => {
    const left = Math.max(0, endsAt - Clock.now());
    const secs = Math.ceil(left / 1000);
    timerEl.textContent = secs;
    timerEl.classList.toggle("low", secs <= 5);
    if (barEl) barEl.style.width = `${(left / (duration * 1000)) * 100}%`;
    if (left > 0) raf = requestAnimationFrame(tick);
  };
  tick();
  return () => cancelAnimationFrame(raf);
}

function renderBoard(listEl, board, myId) {
  listEl.replaceChildren(
    ...board.map((r) =>
      el("li", { class: r.id === myId ? "me" : "" },
        el("span", { class: "rank" }, `${r.rank}`),
        el("span", {}, r.name),
        el("span", { class: "score" }, `${r.score} pts`)
      )
    )
  );
}

function renderPodium(podiumEl, board) {
  const [first, second, third] = board;
  const step = (p, cls, medal) =>
    el("div", { class: `step ${cls}`, style: p ? null : "visibility:hidden" },
      el("div", { class: "medal" }, medal),
      el("div", { class: "pname" }, p ? p.name : ""),
      el("div", { class: "pscore" }, p ? `${p.score} pts` : "")
    );
  podiumEl.replaceChildren(step(second, "second", second ? "🥈" : ""), step(first, "first", first ? "🥇" : ""), step(third, "third", third ? "🥉" : ""));
}
