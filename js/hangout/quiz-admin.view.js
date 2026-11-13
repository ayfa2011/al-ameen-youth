// ONLINE QUIZ — room, question and evaluation admin screens.
window.HangoutQuizAdmin = (() => {
  const MAX_MEDIA_BYTES = 200 * 1024;
  const TYPE_LABELS = { mcq: "Multiple choice", trueFalse: "True / False", short: "Short answer" };

  function open(source) {
    if (!HangoutAdminRepository.isQuizAdmin()) { showToast("Quiz admin access is required.", "error"); return; }
    document.getElementById("hgAdminSheet")?.remove();
    const modal = document.createElement("div");
    modal.id = "hgAdminSheet";
    modal.className = "hg-modal";
    modal.innerHTML = `<section class="hg-sheet hg-admin-sheet" role="dialog" aria-modal="true" aria-label="Quiz Admin Panel">
      <h3>Quiz Admin Panel <button type="button" class="hg-icon-btn" data-act="close" aria-label="Close"><i class="fa-solid fa-xmark"></i></button></h3>
      <div class="hg-tabs"><button type="button" class="is-active" data-tab="rooms">Quiz Rooms</button><button type="button" data-tab="evaluation">Evaluation</button><button type="button" data-tab="scores">Scores</button></div>
      <div data-tabpanel="rooms"></div><div data-tabpanel="evaluation" hidden></div><div data-tabpanel="scores" hidden></div>
    </section>`;
    document.body.appendChild(modal);
    const state = { roomId: "", evaluationTab: "pending" };
    const close = () => {
      panels.scores._stopRoomScores?.();
      modal.remove();
      window.HangoutQuizHost?.reload();
    };
    const panels = Object.fromEntries([...modal.querySelectorAll("[data-tabpanel]")].map(panel => [panel.dataset.tabpanel, panel]));
    modal.addEventListener("click", event => {
      if (event.target.closest('[data-act="close"]')) { close(); return; }
      const tab = event.target.closest("[data-tab]");
      if (tab) {
        if (tab.dataset.tab !== "scores") panels.scores._stopRoomScores?.();
        modal.querySelectorAll("[data-tab]").forEach(button => button.classList.toggle("is-active", button === tab));
        Object.values(panels).forEach(panel => { panel.hidden = panel.dataset.tabpanel !== tab.dataset.tab; });
        if (tab.dataset.tab === "rooms") renderRooms(panels.rooms, state);
        if (tab.dataset.tab === "evaluation") renderEvaluations(panels.evaluation, state);
        if (tab.dataset.tab === "scores") buildScoresTab(panels.scores, source);
      }
    });
    renderRooms(panels.rooms, state);
  }

  async function renderRooms(host, state) {
    host.innerHTML = '<div class="hg-empty">Loading quiz rooms…</div>';
    try {
      const rooms = await HangoutAdminRepository.listRooms();
      if (!host.isConnected) return;
      state.rooms = rooms;
      if (state.roomId && rooms[state.roomId]) {
        await renderRoomManager(host, state, state.roomId);
        return;
      }
      state.roomId = "";
      host.innerHTML = `<form class="hg-form hg-room-create">
        <h4>Create a Quiz Room</h4>
        <label>Quiz Name<input name="name" maxlength="120" placeholder="e.g. Children's Day Special Quiz" required></label>
        <label>Description (optional)<textarea name="description" maxlength="500"></textarea></label>
        <label>Quiz Month<input name="month" type="month"></label>
        <label>Quiz Start Date (optional)<input name="startDate" type="date"></label>
        <label>Quiz Start Time (optional)<input name="startTime" type="time"></label>
        <label>Quiz Status<select name="status"><option value="draft">Draft</option><option value="ready">Ready</option></select></label>
        <div class="hg-form-actions"><button type="submit" class="hg-btn">Create Room</button></div>
      </form>
      <h4 class="hg-section-title">Quiz Rooms</h4>
      ${Object.entries(rooms).length ? `<div class="hg-room-list">${Object.entries(rooms).sort((a, b) => String(b[1]?.createdAt || "").localeCompare(String(a[1]?.createdAt || ""))).map(([id, room]) => {
        const questions = Object.values(room?.questions || {}).filter(question => !question?.deleted).length;
        const scheduled = room.scheduledStartAt ? new Date(Number(room.scheduledStartAt)).toLocaleString([], { month: "long", day: "numeric", hour: "2-digit", minute: "2-digit" }) : "";
        return `<article class="hg-room-card"><div><strong>${escapeHTML(room.name || "Quiz Room")}</strong><small>${escapeHTML(room.month || "No month")} · ${questions} question${questions === 1 ? "" : "s"}${scheduled ? ` · Starts ${escapeHTML(scheduled)}` : ""}</small></div><span class="hg-status is-${escapeHTML(room.status || "draft")}">${escapeHTML(room.status || "Draft")}</span><button type="button" class="hg-btn is-light" data-manage-room="${escapeHTML(id)}">Manage</button></article>`;
      }).join("")}</div>` : '<div class="hg-empty">No quiz rooms yet. Create your first room above.</div>'}`;
      host.querySelector("form").addEventListener("submit", async event => {
        event.preventDefault();
        const form = event.currentTarget;
        const button = form.querySelector('[type="submit"]');
        button.disabled = true;
        try {
          const roomId = await HangoutAdminRepository.createRoom({
            name: form.elements.name.value.trim(),
            description: form.elements.description.value.trim(),
            month: form.elements.month.value,
            startDate: form.elements.startDate.value,
            startTime: form.elements.startTime.value,
            status: form.elements.status.value
          });
          showToast("Quiz room created.", "success");
          state.roomId = roomId;
          await renderRooms(host, state);
        } catch (error) {
          console.error("Quiz room creation failed:", error);
          showToast(error.message || "Could not create the quiz room.", "error");
        } finally { button.disabled = false; }
      });
      host.querySelectorAll("[data-manage-room]").forEach(button => button.addEventListener("click", async () => {
        state.roomId = button.dataset.manageRoom;
        await renderRoomManager(host, state, state.roomId);
      }));
    } catch (error) {
      console.error("Quiz rooms could not be loaded:", error);
      host.innerHTML = '<div class="hg-empty">Could not load quiz rooms. Check Quiz Admin access and database rules.</div>';
    }
  }

  // Paste-many-questions importer. Parsing lives in quiz-import.parser.js; this only
  // handles the form, the preview and saving. Saving is all-or-nothing in the UI:
  // Submit stays disabled while any pasted question has a problem.
  function wireBulkImport(host, state, roomId, existing) {
    const box = host.querySelector(".hg-bulk");
    if (!box) return;
    const field = selector => box.querySelector(selector);
    const textarea = field('[name="bulkText"]');
    const pointsInput = field('[name="bulkPoints"]');
    const timeInput = field('[name="bulkTime"]');
    const summary = field(".hg-bulk-summary");
    const preview = field(".hg-bulk-preview");
    const submit = field('[data-bulk="submit"]');
    const clear = field('[data-bulk="clear"]');
    const existingTexts = existing.map(([, question]) => question.text).filter(Boolean);
    let latest = { items: [], ignored: [] };
    let busy = false;

    const render = () => {
      const points = Number(pointsInput.value);
      const timeLimit = Number(timeInput.value);
      const defaultsOk = Number.isInteger(points) && points >= 1 && points <= 10000 && Number.isInteger(timeLimit) && timeLimit >= 1 && timeLimit <= 3600;
      latest = HangoutQuizImport.parse(textarea.value, { points, timeLimit, existingTexts });
      const items = latest.items;
      const bad = items.filter(item => item.errors.length).length;
      const skipped = items.filter(item => !item.errors.length && item.duplicate).length;
      const ready = items.length - bad - skipped;
      let message = "";
      if (!textarea.value.trim()) message = "";
      else if (!items.length) message = '<span class="is-bad">No questions found. Every question must start with <strong>Q:</strong></span>';
      else {
        message = [
          ready ? `<span class="is-ok">${ready} ready</span>` : "",
          skipped ? `<span class="is-muted">${skipped} skipped (already in this room or pasted twice)</span>` : "",
          bad ? `<span class="is-bad">${bad} need fixing</span>` : "",
          !defaultsOk ? '<span class="is-bad">Default points must be 1–10,000 and time 1–3,600 seconds</span>' : "",
          latest.ignored.length ? `<span class="is-muted">Ignored ${latest.ignored.length} line(s) before the first Q:</span>` : ""
        ].filter(Boolean).join(" · ");
      }
      summary.innerHTML = message;
      preview.innerHTML = items.map(item => {
        const status = item.errors.length ? "is-bad" : item.duplicate ? "is-muted" : "is-ok";
        const icon = item.errors.length ? "fa-triangle-exclamation" : item.duplicate ? "fa-clone" : "fa-circle-check";
        const typeLabel = TYPE_LABELS[item.question.type] || item.question.type;
        return `<article class="hg-bulk-item ${status}">
          <div><i class="fa-solid ${icon}" aria-hidden="true"></i> <strong>#${item.number}</strong> · ${escapeHTML(typeLabel)} · ${item.question.points} pts · ${item.question.timeLimit}s</div>
          <p>${escapeHTML(item.question.text.slice(0, 160) || "(no text)")}</p>
          ${item.answerLabel ? `<small>Answer: ${escapeHTML(item.answerLabel.slice(0, 120))}</small>` : ""}
          ${item.duplicate && !item.errors.length ? "<small>Skipped: this question already exists.</small>" : ""}
          ${item.errors.map(error => `<small class="is-bad">${escapeHTML(error)}</small>`).join("")}
          ${item.warnings.map(warning => `<small class="is-muted">${escapeHTML(warning)}</small>`).join("")}
        </article>`;
      }).join("");
      submit.disabled = busy || !defaultsOk || bad > 0 || ready === 0;
      submit.textContent = ready ? `Submit ${ready} as drafts` : "Submit all as drafts";
    };

    const setBusy = value => {
      busy = value;
      [textarea, pointsInput, timeInput, clear].forEach(element => { element.disabled = value; });
      render();
    };

    [textarea, pointsInput, timeInput].forEach(element => element.addEventListener("input", render));
    clear.addEventListener("click", () => { textarea.value = ""; render(); textarea.focus(); });

    submit.addEventListener("click", async () => {
      const ready = latest.items.filter(item => !item.errors.length && !item.duplicate);
      if (!ready.length || busy) return;
      if (!await showConfirmSheet({
        title: `Add ${ready.length} question${ready.length === 1 ? "" : "s"}?`,
        message: "They will be saved as drafts in this room. Nothing is published to players.",
        confirmLabel: "Add as Drafts"
      })) return;
      const snapshot = latest.items; // setBusy() re-parses, so keep the list this submit started from
      setBusy(true);
      const savedItems = new Set();
      try {
        for (const item of ready) {
          summary.innerHTML = `<span class="is-muted">Saving ${savedItems.size + 1} of ${ready.length}…</span>`;
          const questionId = HangoutAdminRepository.newQuestionId(roomId);
          await HangoutAdminRepository.addQuestion(roomId, questionId, item.question);
          savedItems.add(item);
          existingTexts.push(item.question.text);
        }
        showToast(`${savedItems.size} question${savedItems.size === 1 ? "" : "s"} saved as drafts.`, "success");
        await renderRooms(host, state);
      } catch (error) {
        console.error("Bulk question import failed:", error);
        // Keep only what was NOT saved, so pressing Submit again cannot create duplicates.
        textarea.value = snapshot.filter(item => !savedItems.has(item)).map(item => item.raw).join("\n---\n");
        showToast(`${error.message || "Could not save the questions."} ${savedItems.size} of ${ready.length} were saved; the rest are still in the box.`, "error");
        setBusy(false);
      }
    });

    render();
  }

  async function renderRoomManager(host, state, roomId) {
    const room = state.rooms[roomId];
    if (!room) { state.roomId = ""; renderRooms(host, state); return; }
    const questions = Object.entries(room.questions || {}).filter(([, question]) => !question?.deleted).sort((a, b) => Number(a[1]?.questionNumber) - Number(b[1]?.questionNumber));
    host.innerHTML = `<button type="button" class="hg-back-btn" data-act="back-rooms"><i class="fa-solid fa-arrow-left"></i> All rooms</button>
      <div class="hg-room-heading"><div><h4>${escapeHTML(room.name || "Quiz Room")}</h4><p>${escapeHTML(room.description || room.month || "No description")}</p></div>
      <label class="hg-form hg-room-status-wrap">Room status<select class="hg-room-status">${room.status === "live" ? '<option value="live" selected disabled>Live</option>' : ""}<option value="draft" ${room.status === "draft" ? "selected" : ""} ${room.status === "live" ? "disabled" : ""}>Draft</option><option value="ready" ${room.status === "ready" ? "selected" : ""} ${room.status === "live" ? "disabled" : ""}>Ready</option><option value="completed" ${room.status === "completed" ? "selected" : ""}>Completed</option></select><button type="button" class="hg-btn is-danger hg-room-end-quiz" data-room-act="end-quiz" ${room.status !== "live" ? "disabled" : ""}>End Quiz</button></label></div>
      <details class="hg-bulk">
        <summary><i class="fa-solid fa-paste"></i> Paste many questions at once</summary>
        <div class="hg-form hg-bulk-body">
          <p class="hg-hint">Paste text prepared in the standard format (each question starts with <strong>Q:</strong>). Everything is saved as a draft; nothing is published to players.</p>
          <pre class="hg-bulk-example">Q: Which planet is the Red Planet?
A) Venus
B) Mars
C) Jupiter
D) Saturn
ANSWER: B
EXPLAIN: Iron oxide gives Mars its colour.
POINTS: 5
TIME: 30
---
Q: Name the author of Sri Ramayana Darshanam.
TYPE: SHORT
ANSWER: Kuvempu
---
Q: The Sun is a star.
TYPE: TF
ANSWER: TRUE</pre>
          <div class="hg-bulk-defaults">
            <label>Default points<input name="bulkPoints" type="number" min="1" max="10000" step="1" value="1"></label>
            <label>Default time (seconds)<input name="bulkTime" type="number" min="1" max="3600" step="1" value="60"></label>
          </div>
          <label>Questions<textarea name="bulkText" class="hg-bulk-text" rows="10" spellcheck="false" placeholder="Paste the questions here"></textarea></label>
          <div class="hg-bulk-summary" aria-live="polite"></div>
          <div class="hg-bulk-preview"></div>
          <div class="hg-form-actions"><button type="button" class="hg-btn is-light" data-bulk="clear">Clear</button><button type="button" class="hg-btn" data-bulk="submit" disabled>Submit all as drafts</button></div>
        </div>
      </details>
      <form class="hg-form hg-question-create">
        <h4>New Question</h4>
        <label>Enter Question<textarea name="text" maxlength="4000"></textarea></label>
        <label>Question Type<select name="type"><option value="mcq">Multiple Choice</option><option value="trueFalse">True / False</option><option value="short">Short Answer</option></select></label>
        <div data-options></div>
        <label>Time Limit<select name="timePreset"><option value="30">30 seconds</option><option value="60" selected>1 minute</option><option value="custom">Custom</option></select></label>
        <label data-custom-time hidden>Custom time (seconds)<input name="customTime" type="number" min="1" max="3600" step="1" value="90"></label>
        <label>Points for a correct answer<input name="points" type="number" min="1" max="10000" step="1" value="1" required></label>
        <p class="hg-hint">Wrong answer and no answer both receive 0 points.</p>
        <label>Explanation (optional)<textarea name="explanation" maxlength="2000"></textarea></label>
        <label>Question Image (optional)<input name="image" type="file" accept="image/jpeg,image/png,image/webp,image/gif"></label>
        <label>Audio (optional)<input name="audio" type="file" accept="audio/*"></label>
        <p class="hg-hint">Image and audio files must be 200 KB or smaller and are stored in the database. Text, image and audio may be used together. Questions are saved as drafts until published.</p>
        <div class="hg-form-actions"><button type="submit" class="hg-btn">Save as Draft</button></div>
      </form>
      <h4 class="hg-section-title">Questions (${questions.length})</h4>
      ${questions.length ? `<div class="hg-question-list">${questions.map(([id, question]) => `<article class="hg-question-card">
        <div><strong>Question #${Number(question.questionNumber) || "—"} · ${escapeHTML(TYPE_LABELS[question.type] || question.type || "Question")}</strong><p>${escapeHTML(question.text || "Media question")}</p><small>${Number(question.points) || 0} points · ${Number(question.timeLimit) || 60} sec${question.imageUrl ? " · Image" : ""}${question.audioUrl ? " · Audio" : ""}</small></div>
        <div class="hg-question-actions"><button type="button" class="hg-btn is-light" data-edit-question="${escapeHTML(id)}">Edit</button><button type="button" class="hg-btn is-danger" data-delete-question="${escapeHTML(id)}">Delete</button><button type="button" class="hg-btn" data-publish-question="${escapeHTML(id)}">Publish Question</button></div>
      </article>`).join("")}</div>` : '<div class="hg-empty">No questions in this room yet.</div>'} 
</div>`;

    host.querySelector('[data-act="back-rooms"]').addEventListener("click", () => { state.roomId = ""; renderRooms(host, state); });

    host.querySelector('[data-room-act="end-quiz"]').addEventListener("click", async event => {
      event.currentTarget.disabled = true;
      try {
        if (!await showConfirmSheet({ title: "End this quiz?", message: "The active question's correct answer and explanation will be revealed.", confirmLabel: "End Quiz", danger: true })) return;
        await HangoutAdminRepository.endQuiz(state.roomId);
        showToast("Quiz ended and the answer was revealed.", "success");
        await renderRoomManager(host, state, state.roomId);
      } catch (error) {
        console.error("End quiz failed:", error);
        showToast(error.message || "Could not end the quiz.", "error");
      } finally {
        event.currentTarget.disabled = false;
      }
    });

    wireBulkImport(host, state, roomId, questions);
    const questionForm = host.querySelector(".hg-question-create");
    const optionsHost = questionForm.querySelector("[data-options]");
    let optionCount = 4;
    let editingId = "";
    let editingQuestion = null;
    const renderOptions = () => {
      const type = questionForm.elements.type.value;
      if (type === "short") {
        optionsHost.innerHTML = '<p class="hg-hint">Player responses will appear in Manual Evaluation.</p><label>Reference answer (optional)<textarea name="correctAnswer" maxlength="1000"></textarea></label>';
        return;
      }
      if (type === "trueFalse") {
        optionsHost.innerHTML = `<fieldset class="hg-option-fieldset"><legend>Select correct answer</legend>${["true", "false"].map(value => `<label class="hg-option-row"><input type="radio" name="correctAnswer" value="${value}" ${value === (editingQuestion?.correctAnswer || "true") ? "checked" : ""}><span>${value === "true" ? "True" : "False"}</span></label>`).join("")}</fieldset>`;
        return;
      }
      const savedOptions = Object.entries(editingQuestion?.options || {});
      optionsHost.innerHTML = `<fieldset class="hg-option-fieldset"><legend>Options (select the correct answer)</legend><div class="hg-option-list">${Array.from({ length: optionCount }, (_, index) => `<label class="hg-option-row"><input type="radio" name="correctAnswer" value="option${index + 1}" ${`option${index + 1}` === (editingQuestion?.correctAnswer || "option1") ? "checked" : ""}><span>Option ${String.fromCharCode(65 + index)}</span><input type="text" name="option${index + 1}" maxlength="300" required placeholder="Enter option ${String.fromCharCode(65 + index)}" value="${escapeHTML(savedOptions[index]?.[1] || "")}"></label>`).join("")}</div><button type="button" class="hg-btn is-light" data-act="add-option" ${optionCount >= 8 ? "disabled" : ""}>Add option</button></fieldset>`;
    };
    questionForm.elements.type.addEventListener("change", renderOptions);
    questionForm.elements.timePreset.addEventListener("change", () => {
      questionForm.querySelector("[data-custom-time]").hidden = questionForm.elements.timePreset.value !== "custom";
    });
    optionsHost.addEventListener("click", event => {
      if (!event.target.closest('[data-act="add-option"]') || optionCount >= 8) return;
      optionCount += 1;
      renderOptions();
    });
    renderOptions();
    const resetEditor = () => {
      editingId = "";
      editingQuestion = null;
      optionCount = 4;
      questionForm.reset();
      questionForm.elements.points.value = "1";
      questionForm.elements.timePreset.value = "60";
      questionForm.querySelector("[data-custom-time]").hidden = true;
      renderOptions();
      questionForm.querySelector('[type="submit"]').textContent = "Save as Draft";
      questionForm.querySelector("[data-cancel-edit]")?.remove();
      questionForm.querySelector("[data-editing-media]")?.remove();
    };
    const fillEditor = questionId => {
      editingId = questionId;
      editingQuestion = room.questions[questionId];
      questionForm.elements.text.value = editingQuestion.text || "";
      questionForm.elements.type.value = editingQuestion.type;
      questionForm.elements.points.value = String(editingQuestion.points || 1);
      questionForm.elements.explanation.value = editingQuestion.explanation || "";
      const time = Number(editingQuestion.timeLimit) || 60;
      questionForm.elements.timePreset.value = [30, 60].includes(time) ? String(time) : "custom";
      questionForm.elements.customTime.value = String(time);
      questionForm.querySelector("[data-custom-time]").hidden = questionForm.elements.timePreset.value !== "custom";
      const savedOptions = Object.entries(editingQuestion.options || {});
      optionCount = Math.max(2, savedOptions.length);
      renderOptions();
      if (editingQuestion.type === "short") {
        questionForm.elements.correctAnswer.value = editingQuestion.correctAnswer || "";
      } else if (editingQuestion.type === "mcq") {
        savedOptions.forEach(([id, text], index) => {
          const input = questionForm.elements[`option${index + 1}`];
          if (input) input.value = text;
        });
        const correctRadio = questionForm.querySelector(`[name="correctAnswer"][value="${CSS.escape(editingQuestion.correctAnswer || "option1")}"]`);
        if (correctRadio) correctRadio.checked = true;
      } else {
        const radio = questionForm.querySelector(`[name="correctAnswer"][value="${CSS.escape(editingQuestion.correctAnswer || "true")}"]`);
        if (radio) radio.checked = true;
      }
      questionForm.querySelector('[type="submit"]').textContent = "Save Changes";
      if (!questionForm.querySelector("[data-cancel-edit]")) {
        const cancel = document.createElement("button");
        cancel.type = "button";
        cancel.className = "hg-btn is-light";
        cancel.dataset.cancelEdit = "";
        cancel.textContent = "Cancel";
        cancel.addEventListener("click", resetEditor);
        questionForm.querySelector(".hg-form-actions").prepend(cancel);
      }
      const media = document.createElement("p");
      media.className = "hg-hint";
      media.dataset.editingMedia = "";
      media.textContent = [editingQuestion.imageUrl && "Current image attached", editingQuestion.audioUrl && "Current audio attached"].filter(Boolean).join(" · ") || "No media attached";
      questionForm.querySelector(".hg-form-actions").before(media);
    };
    questionForm.addEventListener("submit", async event => {
      event.preventDefault();
      const button = questionForm.querySelector('[type="submit"]');
      button.disabled = true;
      try {
        const type = questionForm.elements.type.value;
        const points = Number(questionForm.elements.points.value);
        if (!Number.isInteger(points) || points < 1 || points > 10000) throw new Error("Points must be a whole number between 1 and 10,000.");
        const timeLimit = questionForm.elements.timePreset.value === "custom" ? Number(questionForm.elements.customTime.value) : Number(questionForm.elements.timePreset.value);
        if (!Number.isInteger(timeLimit) || timeLimit < 1 || timeLimit > 3600) throw new Error("Time limit must be a whole number between 1 and 3,600 seconds.");
        const correctAnswer = type === "short" ? questionForm.elements.correctAnswer.value.trim() : questionForm.querySelector('[name="correctAnswer"]:checked')?.value;
        if (type !== "short" && !correctAnswer) throw new Error("Select the correct answer.");
        const options = {};
        if (type === "trueFalse") { options.true = "True"; options.false = "False"; }
        if (type === "mcq") {
          for (let index = 0; index < optionCount; index += 1) {
            const value = questionForm.elements[`option${index + 1}`]?.value.trim();
            if (!value) throw new Error("Fill in every answer option.");
            options[`option${index + 1}`] = value;
          }
        }
        const image = questionForm.elements.image.files[0];
        const audio = questionForm.elements.audio.files[0];
        if (!questionForm.elements.text.value.trim() && !image && !audio) {
          throw new Error("Enter a question or attach an image/audio prompt.");
        }
        [image, audio].filter(Boolean).forEach(file => {
          if (file.size > MAX_MEDIA_BYTES) throw new Error("Image and audio files must be 200 KB or smaller.");
        });
        const questionId = editingId || HangoutAdminRepository.newQuestionId(roomId);
        const imageUrl = image ? await HangoutAdminRepository.encodeQuestionMedia(image, "image") : editingQuestion?.imageUrl || "";
        const audioUrl = audio ? await HangoutAdminRepository.encodeQuestionMedia(audio, "audio") : editingQuestion?.audioUrl || "";
        const question = {
          text: questionForm.elements.text.value.trim(),
          type, points, timeLimit, options, correctAnswer, explanation: questionForm.elements.explanation.value.trim(), imageUrl, audioUrl
        };
        if (editingId) {
          await HangoutAdminRepository.updateQuestion(roomId, questionId, question);
          showToast("Question updated as a draft.", "success");
        } else {
          const questionNumber = await HangoutAdminRepository.addQuestion(roomId, questionId, question);
          showToast(`Question #${questionNumber} saved as a draft.`, "success");
        }
        await renderRooms(host, state);
      } catch (error) {
        console.error("Quiz question could not be saved:", error);
        showToast(error.message || "Could not save this question.", "error");
      } finally { button.disabled = false; }
    });
    host.querySelectorAll("[data-edit-question]").forEach(button => button.addEventListener("click", () => fillEditor(button.dataset.editQuestion)));
    host.querySelectorAll("[data-delete-question]").forEach(button => button.addEventListener("click", async () => {
      if (!await showConfirmSheet({ title: "Delete this question?", message: "The question will be removed from publishing. Existing answers and evaluation history will be retained.", confirmLabel: "Delete", danger: true })) return;
      button.disabled = true;
      try {
        await HangoutAdminRepository.deleteQuestion(roomId, button.dataset.deleteQuestion);
        showToast("Question deleted.", "success");
        await renderRooms(host, state);
      } catch (error) {
        console.error("Quiz question could not be deleted:", error);
        showToast(error.message || "Could not delete the question.", "error");
        button.disabled = false;
      }
    }));
    host.querySelectorAll("[data-publish-question]").forEach(button => button.addEventListener("click", async () => {
      button.disabled = true;
      try {
        const active = await HangoutAdminRepository.getCurrentQuiz();
        if (active && active.roomId !== roomId && ["live", "paused"].includes(active.status)
          && !await showConfirmSheet({
            title: "Switch the live quiz?",
            message: "Publishing this question will replace the question currently shown to every player.",
            confirmLabel: "Switch Quiz",
            danger: true
          })) return;
        await HangoutAdminRepository.publishQuestion(roomId, button.dataset.publishQuestion);
        showToast("Question is live for players.", "success");
        await renderRooms(host, state);
      } catch (error) {
        console.error("Quiz question could not go live:", error);
        showToast(error.message || "Could not publish this question.", "error");
      } finally { button.disabled = false; }
    }));
    const statusControl = host.querySelector(".hg-room-status");
    if (statusControl) statusControl.addEventListener("change", async () => {
      try {
        await HangoutAdminRepository.setRoomStatus(roomId, statusControl.value);
        await renderRooms(host, state);
      } catch (error) {
        console.error("Quiz room status could not be updated:", error);
        showToast(error.message || "Could not update room status.", "error");
      }
    });
  }

  async function renderEvaluations(host, state) {
    host.innerHTML = '<div class="hg-empty">Loading answers…</div>';
    try {
      const rows = (await HangoutAdminRepository.listEvaluations()).filter(row => row.questionType === "short");
      if (!host.isConnected) return;
      const pending = rows.filter(row => !row.evaluation);
      const history = rows.filter(row => row.evaluation);
      const items = state.evaluationTab === "pending" ? pending : history;
      host.innerHTML = `<div class="hg-evaluation-head"><h4>Manual Evaluation</h4><div class="hg-tabs hg-subtabs"><button type="button" data-eval-tab="pending" class="${state.evaluationTab === "pending" ? "is-active" : ""}">Pending Evaluation (${pending.length})</button><button type="button" data-eval-tab="history" class="${state.evaluationTab === "history" ? "is-active" : ""}">History (${history.length})</button></div></div>
      ${items.length ? `<div class="hg-evaluation-list">${items.map(row => `<article class="hg-evaluation-card">
        <small>${escapeHTML(row.roomName)} · Question #${Number(row.questionNumber) || "—"} · ${escapeHTML(row.playerName || "Player")}</small>
        <strong>${escapeHTML(row.questionText)}</strong><p>Answer: ${escapeHTML(row.answer || "")}</p>
        ${row.evaluation ? `<div class="hg-evaluation-result ${row.evaluation.result === "correct" ? "is-correct" : "is-wrong"}">${row.evaluation.result === "correct" ? "Correct" : "Wrong"} · ${Number(row.evaluation.points) || 0} points · ${escapeHTML(new Date(row.evaluation.evaluatedAt).toLocaleString())}</div>
          ${Object.values(row.evaluation.history || {}).length ? `<small>Previous evaluations: ${Object.values(row.evaluation.history).map(item => `${item.result === "correct" ? "Correct" : "Wrong"} · ${Number(item.points) || 0} pts · ${escapeHTML(new Date(item.evaluatedAt).toLocaleString())}`).join(" | ")}</small>` : ""}
          ${row.evaluation.pointsAwarded ? "" : `<button type="button" class="hg-btn is-light" data-retry-evaluation="${escapeHTML(row.answerId)}">Retry score update</button>`}
          <div class="hg-form-actions"><button type="button" class="hg-btn" data-evaluate="correct" data-answer-id="${escapeHTML(row.answerId)}">Re-evaluate as Correct · ${Number(row.questionPoints) || 0} pts</button><button type="button" class="hg-btn is-danger" data-evaluate="wrong" data-answer-id="${escapeHTML(row.answerId)}">Re-evaluate as Wrong · 0 pts</button></div>` : `<div class="hg-form-actions"><button type="button" class="hg-btn" data-evaluate="correct" data-answer-id="${escapeHTML(row.answerId)}">Correct · ${Number(row.questionPoints) || 0} pts</button><button type="button" class="hg-btn is-danger" data-evaluate="wrong" data-answer-id="${escapeHTML(row.answerId)}">Wrong · 0 pts</button></div>`}
      </article>`).join("")}</div>` : `<div class="hg-empty">${state.evaluationTab === "pending" ? "No pending short answers." : "No evaluated answers yet."}</div>`}`;
      host.querySelectorAll("[data-eval-tab]").forEach(button => button.addEventListener("click", () => {
        state.evaluationTab = button.dataset.evalTab;
        renderEvaluations(host, state);
      }));
      host.querySelectorAll("[data-evaluate], [data-retry-evaluation]").forEach(button => button.addEventListener("click", async () => {
        const row = rows.find(item => item.answerId === (button.dataset.answerId || button.dataset.retryEvaluation));
        if (!row) return;
        const result = button.dataset.evaluate || row.evaluation?.result;
        button.disabled = true;
        try {
          await HangoutAdminRepository.evaluateAnswer(row, result);
          showToast(row.evaluation
            ? "Evaluation history and score updated."
            : result === "correct" ? "Correct answer saved and points awarded." : "Wrong answer saved.", "success");
          renderEvaluations(host, state);
        } catch (error) {
          console.error("Short answer evaluation failed:", error);
          showToast(error.message || "Could not evaluate this answer.", "error");
          button.disabled = false;
        }
      }));
    } catch (error) {
      console.error("Quiz answers could not be loaded:", error);
      host.innerHTML = '<div class="hg-empty">Could not load evaluations. Check Quiz Admin access and database rules.</div>';
    }
  }

  async function buildScoresTab(host, source, selectedRoomId = "") {
    host._stopRoomScores?.();
    host.innerHTML = '<div class="hg-empty">Loading room scores…</div>';
    try {
      const rooms = await HangoutAdminRepository.listRooms();
      if (!host.isConnected) return;
      const roomIds = Object.keys(rooms);
      if (!roomIds.length) {
        host.innerHTML = '<div class="hg-empty">Create a quiz room before managing its scoreboard.</div>';
        return;
      }
      const roomId = roomIds.includes(selectedRoomId) ? selectedRoomId : roomIds[0];
      host.innerHTML = `<div class="hg-score-admin-head"><h4>Scoreboard Management</h4>
        <label>Select Quiz Room<select data-score-room>${roomIds.map(id => `<option value="${escapeHTML(id)}" ${id === roomId ? "selected" : ""}>${escapeHTML(rooms[id]?.name || "Quiz Room")}</option>`).join("")}</select></label>
        <button type="button" class="hg-btn is-light" data-score-refresh>Refresh</button></div>
        <div data-score-room-content></div>`;
      const roomSelect = host.querySelector("[data-score-room]");
      const renderRoom = id => renderRoomScores(host.querySelector("[data-score-room-content]"), source, id, rooms[id]);
      roomSelect.addEventListener("change", () => renderRoom(roomSelect.value));
      host.querySelector("[data-score-refresh]").addEventListener("click", () => renderRoom(roomSelect.value));
      await renderRoom(roomId);
    } catch (error) {
      console.error("Room scoreboard could not be loaded:", error);
      host.innerHTML = '<div class="hg-empty">Could not load room scores. Check Quiz Admin access and database rules.</div>';
    }
  }

  async function renderRoomScores(host, source, roomId, room) {
    host._stopRoomScores?.();
    host._stopRoomScores = null;
    host.innerHTML = '<div class="hg-empty">Loading players and score history…</div>';
    try {
      const { scores, publicResult } = await HangoutAdminRepository.getRoomScoreData(roomId);
      if (!host.isConnected) return;
      const users = source.users() || {};
      const rows = Object.entries(users).map(([uid, user]) => ({
        uid,
        name: user?.name || "Player",
        photo: user?.photo || "",
        points: Number(scores[uid]?.points) || 0
      })).sort((a, b) => b.points - a.points || a.name.localeCompare(b.name));
      rows.forEach((row, index) => {
        row.rank = index > 0 && row.points === rows[index - 1].points ? rows[index - 1].rank : index + 1;
      });
      if (!rows.length) {
        host.innerHTML = '<div class="hg-empty">No players yet. Players appear here after they sign in with Google.</div>';
        return;
      }
      host.innerHTML = `<div class="hg-result-publish">
        <div><strong>Quiz results</strong><small>${publicResult?.published ? "Published to players" : "Not published"}</small></div>
        <button type="button" class="hg-btn ${publicResult?.published ? "is-danger" : ""}" data-publish-results="${publicResult?.published ? "false" : "true"}">${publicResult?.published ? "Unpublish Results" : "Publish Results"}</button>
      </div>
      <div class="hg-room-score-layout">
        <section class="hg-room-score-board"><h4>${escapeHTML(room?.name || "Quiz Room")} · Ranking</h4>
          <div class="hg-room-score-list">${rows.map(row => `<article class="hg-room-score-row"><span>${escapeHTML(HangoutService.rankLabel(row.rank))}</span><strong>${escapeHTML(row.name)}</strong><b>${row.points} pts</b></article>`).join("")}</div>
        </section>
        <section class="hg-room-score-editor"><h4>Inspect / Adjust Player Score</h4>
          <form class="hg-form" data-score-adjust>
            <label>Player<select name="uid">${rows.map(row => `<option value="${escapeHTML(row.uid)}">${escapeHTML(HangoutService.rankLabel(row.rank))} · ${escapeHTML(row.name)} — ${row.points} pts</option>`).join("")}</select></label>
            <div class="hg-score-totals" data-score-preview></div>
            <label>Adjustment Type<select name="mode"><option value="adjust">Add / subtract points</option><option value="set">Set exact total</option></select></label>
            <label data-points-label>Points to add or subtract<input name="points" type="number" step="1" min="-100000" max="100000" required></label>
            <label>Reason (required)<textarea name="reason" maxlength="200" required></textarea></label>
            <div class="hg-form-actions"><button type="submit" class="hg-btn">Save Score Adjustment</button></div>
          </form>
          <h4>Score History</h4><div data-score-history></div>
        </section>
      </div>`;
      const form = host.querySelector("[data-score-adjust]");
      const getSelectedRow = () => rows.find(row => row.uid === form.elements.uid.value) || rows[0];
      const renderPreview = () => {
        const row = getSelectedRow();
        const enteredPoints = Number(form.elements.points.value) || 0;
        const delta = form.elements.mode.value === "set" ? enteredPoints - row.points : enteredPoints;
        const newTotal = Math.max(0, row.points + delta);
        const projectedRows = rows.map(item => ({ ...item, projected: item.uid === row.uid ? newTotal : item.points }))
          .sort((a, b) => b.projected - a.projected || a.name.localeCompare(b.name));
        projectedRows.forEach((item, index) => {
          item.rank = index > 0 && item.projected === projectedRows[index - 1].projected
            ? projectedRows[index - 1].rank
            : index + 1;
        });
        const projectedIndex = projectedRows.findIndex(item => item.uid === row.uid);
        const projectedRank = projectedRows[projectedIndex].rank;
        host.querySelector("[data-score-preview]").innerHTML = `<span>Player: <strong>${escapeHTML(row.name)}</strong></span><span>Previous score: <strong>${row.points}</strong></span><span>Adjusted points: <strong>${delta > 0 ? "+" : ""}${delta}</strong></span><span>New total: <strong>${newTotal}</strong> · Projected rank ${escapeHTML(HangoutService.rankLabel(projectedRank))}</span>`;
        const playerScore = scores[row.uid] || {};
        const history = [
          ...Object.entries(playerScore.adjustments || {}).map(([, item]) => ({
            at: item.editedAt,
            actor: item.editedBy || "Quiz admin",
            note: item.reason || "Score adjustment",
            details: `${Number(item.previousScore) || 0} → ${Number(item.newTotal) || 0} (${Number(item.adjustedPoints) > 0 ? "+" : ""}${Number(item.adjustedPoints) || 0})`
          })),
          ...Object.entries(playerScore.awards || {}).map(([questionId, item]) => ({
            at: item.at,
            actor: item.kind === "manual" ? "Manual evaluation" : "Quiz answer",
            note: `Question #${Number(room?.questions?.[questionId]?.questionNumber) || "—"}`,
            details: `${Number(item.points) > 0 ? "+" : ""}${Number(item.points) || 0} points`
          }))
        ].sort((a, b) => String(b.at || "").localeCompare(String(a.at || "")));
        host.querySelector("[data-score-history]").innerHTML = history.length
          ? `<ul class="hg-score-history">${history.map(item => `<li><div><strong>${escapeHTML(item.actor)}</strong><small>${escapeHTML(new Date(item.at).toLocaleString())} · ${escapeHTML(item.note)}</small><small>${escapeHTML(item.details)}</small></div></li>`).join("")}</ul>`
          : '<div class="hg-empty">No score history for this player in this room.</div>';
      };
      form.elements.uid.addEventListener("change", renderPreview);
      form.elements.points.addEventListener("input", renderPreview);
      form.elements.mode.addEventListener("change", () => {
        const exact = form.elements.mode.value === "set";
        form.elements.points.min = exact ? "0" : "-100000";
        form.elements.points.value = "";
        host.querySelector("[data-points-label]").firstChild.textContent = exact ? "Set new total score" : "Points to add or subtract";
        renderPreview();
      });
      form.addEventListener("focusout", event => {
        const nextFocused = event.relatedTarget;
        if (nextFocused && form.contains(nextFocused)) return;
        if (nextFocused) window.setTimeout(() => renderRoomScores(host, source, roomId, room), 0);
      });
      renderPreview();
      let firstScoreSnapshot = true;
      host._stopRoomScores = HangoutAdminRepository.subscribeRoomScores(roomId, () => {
        if (firstScoreSnapshot) {
          firstScoreSnapshot = false;
          return;
        }
        if (host.isConnected && !form.contains(document.activeElement)) renderRoomScores(host, source, roomId, room);
      }, error => {
        console.error("Room score updates could not be received:", error);
        showToast("Room score updates were interrupted. Use Refresh to reload.", "error");
      });
      host.querySelector("[data-publish-results]").addEventListener("click", async event => {
        const button = event.currentTarget;
        button.disabled = true;
        try {
          await HangoutAdminRepository.setRoomResultsPublished(roomId, button.dataset.publishResults === "true");
          showToast(button.dataset.publishResults === "true" ? "Room results published." : "Room results unpublished.", "success");
          await renderRoomScores(host, source, roomId, room);
        } catch (error) {
          console.error("Quiz results publishing failed:", error);
          showToast(error.message || "Could not update result visibility.", "error");
          button.disabled = false;
        }
      });
      form.addEventListener("submit", async event => {
        event.preventDefault();
        const row = getSelectedRow();
        const enteredPoints = Number(form.elements.points.value);
        const delta = form.elements.mode.value === "set" ? enteredPoints - row.points : enteredPoints;
        if (!Number.isInteger(delta) || delta === 0 || Math.abs(delta) > 100000) {
          showToast("Enter a non-zero whole number of points.", "warning");
          return;
        }
        if (row.points + delta < 0) {
          showToast("The adjustment cannot make a player's score negative.", "warning");
          return;
        }
        const button = form.querySelector('[type="submit"]');
        button.disabled = true;
        try {
          await HangoutAdminRepository.adjustRoomScore(roomId, row.uid, delta, form.elements.reason.value);
          showToast(`Updated ${row.name}'s room score.`, "success");
          await renderRoomScores(host, source, roomId, room);
        } catch (error) {
          console.error("Room score adjustment failed:", error);
          showToast(error.message || "Could not save the score adjustment.", "error");
          button.disabled = false;
        }
      });
    } catch (error) {
      console.error("Player room score data could not be loaded:", error);
      host.innerHTML = '<div class="hg-empty">Could not load this room’s scoreboard. Check Quiz Admin access and database rules.</div>';
    }
  }

  return Object.freeze({ open });
})();
