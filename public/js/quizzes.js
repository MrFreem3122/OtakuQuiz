/* Admin login and the shared quiz library. */

$$("[data-icon]").forEach((n) => n.append(icon(n.dataset.icon)));

const next = new URLSearchParams(location.search).get("next");

/* ---------- login ---------- */

$("#adminName").value = Admin.name() || localStorage.getItem("otakuquiz.name") || "";

$("#loginForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const code = $("#adminCode").value.trim();
  const name = $("#adminName").value.trim();
  const fail = (msg) => { $("#loginError").textContent = msg; $("#loginError").hidden = false; };
  if (!code) return fail("Entre le code admin.");
  if (!name) return fail("Entre ton nom, il sera affiché sur tes quiz.");
  $("#loginBtn").disabled = true;
  try {
    const { token } = await Api.login(code);
    Admin.set({ token, name });
    $("#loginError").hidden = true;
    if (next && /^[a-z]+\.html/.test(next)) return (location.href = next);
    openLibrary();
  } catch (err) {
    fail(err.message);
  } finally {
    $("#loginBtn").disabled = false;
  }
});

$("#logoutBtn").addEventListener("click", () => {
  Admin.clear();
  $("#adminCode").value = "";
  show("login");
});

/* ---------- library ---------- */

async function openLibrary() {
  show("list");
  $("#whoami").textContent = Admin.name();
  $("#listLoading").hidden = false;
  $("#listError").hidden = true;
  try {
    render(await Api.list());
  } catch (err) {
    $("#listError").textContent = err.message;
    $("#listError").hidden = false;
  } finally {
    $("#listLoading").hidden = true;
  }
  checkLocalQuizzes();
}

function render(quizzes) {
  $("#empty").hidden = quizzes.length > 0;
  $("#quizList").replaceChildren(
    ...quizzes.map((q) => {
      const n = q.questionCount;
      const count = n === 0 ? "Aucune question" : n === 1 ? "1 question" : `${n} questions`;
      return el("li", { class: "card quiz-card" },
        el("div", { class: "thumb" }, q.thumb ? el("img", { src: q.thumb, alt: "" }) : icon("image")),
        el("h3", {}, q.title || "Sans titre"),
        el("div", { class: "actions" },
          el("a", { class: "icon-btn", href: `editor.html?id=${q.id}`, "aria-label": `Modifier ${q.title}`, title: "Modifier" }, icon("edit")),
          el("div", { class: "row-icons" },
            n ? el("a", { class: "icon-btn", href: `host.html?quiz=${q.id}`, "aria-label": `Lancer une partie avec ${q.title}`, title: "Lancer une partie" }, icon("play")) : null,
            el("button", {
              class: "icon-btn", type: "button", "aria-label": `Exporter ${q.title}`, title: "Exporter le fichier du quiz",
              onclick: async () => { try { exportQuiz(await Api.get(q.id)); } catch (err) { toast(err.message); } },
            }, icon("share"))
          )
        ),
        el("div", { class: "count" }, q.author ? `${count} · par ${q.author}` : count)
      );
    })
  );
}

$("#importInput").addEventListener("change", async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  try {
    const quiz = await importQuizFile(file);
    toast(`« ${quiz.title} » ajouté à la bibliothèque.`);
    openLibrary();
  } catch (err) {
    toast(err.message || "Import impossible.");
  }
  e.target.value = "";
});

/* ---------- quizzes from the first version, saved in this browser ---------- */

function checkLocalQuizzes() {
  const local = LocalStore.all();
  $("#migrateBox").hidden = local.length === 0;
  if (local.length) {
    $("#migrateText").textContent = local.length === 1
      ? "1 quiz est enregistré seulement sur cet appareil."
      : `${local.length} quiz sont enregistrés seulement sur cet appareil.`;
  }
}

$("#migrateBtn").addEventListener("click", async () => {
  $("#migrateBtn").disabled = true;
  let done = 0;
  for (const q of LocalStore.all()) {
    try {
      const quiz = { id: newQuizId(), title: q.title || "Quiz", description: q.description || "", questions: q.questions || [] };
      quiz.thumb = await makeThumb(quiz);
      await Api.save(quiz);
      LocalStore.remove(q.id);
      done++;
    } catch (err) {
      toast(`« ${q.title} » : ${err.message}`);
    }
  }
  $("#migrateBtn").disabled = false;
  if (done) toast(done === 1 ? "1 quiz ajouté à la bibliothèque." : `${done} quiz ajoutés à la bibliothèque.`);
  openLibrary();
});

/* ---------- start ---------- */

if (Admin.token()) openLibrary();
else show("login");
