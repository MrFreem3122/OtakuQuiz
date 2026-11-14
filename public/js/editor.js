/* Quiz editor: name and description, then the list of questions. */

$$("[data-icon]").forEach((n) => n.append(icon(n.dataset.icon)));
$$("[data-go]").forEach((n) => n.addEventListener("click", () => show(n.dataset.go)));

const params = new URLSearchParams(location.search);
let quiz = null;
let isNew = true;

// Save the quiz to the shared library. Returns true when it worked.
async function persist() {
  try {
    quiz.thumb = await makeThumb(quiz);
    await Api.save(quiz);
    return true;
  } catch (err) {
    toast(err.message);
    return false;
  }
}

let editingIndex = -1; // -1 = new question
let draft = null;

/* ---------- 1. info ---------- */

$("#infoForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const title = $("#quizTitle").value.trim();
  if (!title) {
    $("#infoError").textContent = "Donne un nom à ton quiz.";
    $("#infoError").hidden = false;
    $("#quizTitle").focus();
    return;
  }
  $("#infoError").hidden = true;
  quiz.title = title;
  quiz.description = $("#quizDescription").value.trim();
  if (!(await persist())) return;
  history.replaceState(null, "", `editor.html?id=${quiz.id}`);
  renderList();
  show("list");
});

/* ---------- 2. list ---------- */

$("#listBack").addEventListener("click", () => show("info"));

function renderList() {
  $("#listTitle").textContent = quiz.title;
  $("#noQuestions").hidden = quiz.questions.length > 0;
  $("#deleteQuiz").hidden = false;
  $("#questionList").replaceChildren(
    ...quiz.questions.map((q, i) =>
      el("li", { class: "card question-row" },
        el("span", { class: "num" }, `Q${i + 1}.`),
        el("span", { class: "qtext" }, q.text),
        el("div", { class: "tools" },
          el("button", { class: "icon-btn", type: "button", "aria-label": `Modifier la question ${i + 1}`, onclick: () => openQuestion(i) }, icon("edit")),
          el("button", { class: "icon-btn", type: "button", "aria-label": `Supprimer la question ${i + 1}`, onclick: () => removeQuestion(i) }, icon("close"))
        ),
        el("span", { class: "qtype" }, TYPE_LABELS[q.type])
      )
    )
  );
}

async function removeQuestion(i) {
  if (!confirm(`Supprimer la question ${i + 1} ?`)) return;
  const removed = quiz.questions.splice(i, 1);
  if (!(await persist())) quiz.questions.splice(i, 0, ...removed);
  renderList();
}

$("#addQuestion").addEventListener("click", () => {
  editingIndex = -1;
  $$('input[name="qtype"]')[0].checked = true;
  show("type");
});

$("#deleteQuiz").addEventListener("click", async () => {
  const by = quiz.author && quiz.author !== Admin.name() ? ` (créé par ${quiz.author})` : "";
  if (!confirm(`Supprimer le quiz « ${quiz.title} »${by} pour tous les admins ? Cette action est définitive.`)) return;
  try {
    await Api.remove(quiz.id);
    location.href = "quizzes.html";
  } catch (err) {
    toast(err.message);
  }
});

/* ---------- 3. type ---------- */

$("#typeForm").addEventListener("submit", (e) => {
  e.preventDefault();
  const type = $('input[name="qtype"]:checked').value;
  openQuestion(-1, type);
});

/* ---------- 4. question ---------- */

function openQuestion(index, type) {
  editingIndex = index;
  const q = index >= 0 ? quiz.questions[index] : null;
  draft = q
    ? JSON.parse(JSON.stringify(q))
    : { type, text: "", image: "", duration: 20, choices: ["", "", "", ""], correct: type === "truefalse" ? true : 0, answers: [] };
  if (draft.type === "mcq") while ((draft.choices || []).length < 4) (draft.choices = draft.choices || []).push("");

  const n = index >= 0 ? index + 1 : quiz.questions.length + 1;
  $("#qFormTitle").textContent = `Question ${n} · ${TYPE_LABELS[draft.type]}`;
  $("#qText").value = draft.text;
  $("#qDuration").value = String(draft.duration || 20);
  if (![...$("#qDuration").options].some((o) => o.value === String(draft.duration))) $("#qDuration").value = "20";
  $$("[data-for]").forEach((n) => (n.hidden = n.dataset.for !== draft.type));

  if (draft.type === "mcq") renderChoices();
  if (draft.type === "truefalse") $(`input[name="tf"][value="${draft.correct ? "true" : "false"}"]`).checked = true;
  if (draft.type === "text") $("#qAnswers").value = (draft.answers || []).join(", ");

  renderImage();
  $("#qError").hidden = true;
  show("question");
  $("#qText").focus();
}

function renderChoices() {
  const letters = ["A", "B", "C", "D"];
  $("#choices").replaceChildren(
    ...draft.choices.map((c, i) =>
      el("div", { class: "answer-edit" },
        el("input", {
          type: "radio", name: "correct", value: i, "aria-label": `Réponse ${letters[i]} est la bonne réponse`,
          checked: draft.correct === i,
          onchange: () => (draft.correct = i),
        }),
        el("input", {
          class: "input", value: c, maxlength: 120, placeholder: `Réponse ${letters[i]}${i >= 2 ? " (optionnel)" : ""}`,
          "aria-label": `Réponse ${letters[i]}`,
          oninput: (e) => (draft.choices[i] = e.target.value),
        })
      )
    )
  );
}

function renderImage() {
  $("#imagePreview").hidden = !draft.image;
  $("#imagePick").hidden = !!draft.image;
  if (draft.image) $("#imagePreview img").src = draft.image;
}

$("#imageInput").addEventListener("change", async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  try {
    draft.image = await resizeImage(file);
    renderImage();
  } catch (err) {
    toast(err.message);
  }
  e.target.value = "";
});

$("#removeImage").addEventListener("click", () => {
  draft.image = "";
  renderImage();
});

$("#questionForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const fail = (msg) => {
    $("#qError").textContent = msg;
    $("#qError").hidden = false;
  };

  draft.text = $("#qText").value.trim();
  draft.duration = parseInt($("#qDuration").value, 10);
  if (!draft.text) return fail("Écris la question.");

  const out = { type: draft.type, text: draft.text, image: draft.image || "", duration: draft.duration };

  if (draft.type === "mcq") {
    // keep filled choices, remember which one is correct
    const filled = draft.choices.map((c, i) => ({ c: c.trim(), i })).filter((x) => x.c);
    if (filled.length < 2) return fail("Remplis au moins 2 réponses.");
    const correctPos = filled.findIndex((x) => x.i === draft.correct);
    if (correctPos < 0) return fail("Coche la bonne réponse (elle doit être remplie).");
    out.choices = filled.map((x) => x.c);
    out.correct = correctPos;
  } else if (draft.type === "truefalse") {
    out.correct = $('input[name="tf"]:checked').value === "true";
  } else {
    out.answers = $("#qAnswers").value.split(",").map((a) => a.trim()).filter(Boolean);
    if (!out.answers.length) return fail("Ajoute au moins une réponse acceptée.");
  }

  const previous = editingIndex >= 0 ? quiz.questions[editingIndex] : null;
  if (editingIndex >= 0) quiz.questions[editingIndex] = out;
  else quiz.questions.push(out);
  $("#saveQuestion").disabled = true;
  const ok = await persist();
  $("#saveQuestion").disabled = false;
  if (!ok) {
    if (previous) quiz.questions[editingIndex] = previous; else quiz.questions.pop();
    return;
  }
  renderList();
  show("list");
  toast("Question enregistrée.");
});

/* ---------- start ---------- */

(async () => {
  if (!requireAdmin()) return;
  const id = params.get("id");
  if (id) {
    try {
      quiz = await Api.get(id);
      isNew = false;
    } catch (err) {
      toast(err.message);
    }
  }
  if (!quiz) quiz = { id: newQuizId(), title: "", description: "", questions: [] };

  $("#quizTitle").value = quiz.title;
  $("#quizDescription").value = quiz.description || "";
  if (!isNew) $("#infoTitle").textContent = "Modifier le Quiz";

  if (isNew) show("info");
  else { renderList(); show("list"); }
})();
