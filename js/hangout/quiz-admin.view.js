// ONLINE QUIZ — admin controls (UI only). Visible only to the approved quiz
// admin account. Writes go through HangoutAdminRepository.
window.HangoutQuizAdmin = (() => {
  const MAX_IMAGE_CHARS = 380000; // below the 400000 limit in the database rules

  // Shrinks an uploaded picture so it can be stored with the question.
  async function compressImage(file) {
    const url = URL.createObjectURL(file);
    try {
      const img = await new Promise((resolve, reject) => { const i = new Image(); i.onload = () => resolve(i); i.onerror = reject; i.src = url; });
      for (const [side, quality] of [[900, 0.78], [800, 0.65], [640, 0.55], [480, 0.45]]) {
        const scale = Math.min(1, side / Math.max(img.width, img.height));
        const canvas = document.createElement("canvas");
        canvas.width = Math.round(img.width * scale); canvas.height = Math.round(img.height * scale);
        canvas.getContext("2d").drawImage(img, 0, 0, canvas.width, canvas.height);
        const dataUrl = canvas.toDataURL("image/jpeg", quality);
        if (dataUrl.length <= MAX_IMAGE_CHARS) return dataUrl;
      }
      throw new Error("Picture is too large. Choose a smaller one.");
    } finally { URL.revokeObjectURL(url); }
  }

  function open(source) {
    if (!HangoutAdminRepository.isQuizAdmin()) { showToast("Quiz admin access is required.", "error"); return; }
    document.getElementById("hgAdminSheet")?.remove();
    const modal = document.createElement("div");
    modal.id = "hgAdminSheet";
    modal.className = "hg-modal";
    modal.innerHTML = `<section class="hg-sheet" role="dialog" aria-modal="true" aria-label="Quiz admin">
      <h3>Quiz admin <button type="button" class="hg-icon-btn" data-act="close" aria-label="Close"><i class="fa-solid fa-xmark"></i></button></h3>
      <div class="hg-tabs"><button type="button" class="is-active" data-tab="question">Question</button><button type="button" data-tab="scores">Scores</button></div>
      <div data-tabpanel="question"></div><div data-tabpanel="scores" hidden></div>
    </section>`;
    document.body.appendChild(modal);
    const close = () => modal.remove();
    modal.addEventListener("click", event => {
      if (event.target === modal || event.target.closest('[data-act="close"]')) close();
      const tab = event.target.closest("[data-tab]");
      if (tab) {
        modal.querySelectorAll("[data-tab]").forEach(b => b.classList.toggle("is-active", b === tab));
        modal.querySelectorAll("[data-tabpanel]").forEach(p => { p.hidden = p.dataset.tabpanel !== tab.dataset.tab; });
      }
    });
    buildQuestionTab(modal.querySelector('[data-tabpanel="question"]'), source);
    buildScoresTab(modal.querySelector('[data-tabpanel="scores"]'), source);
  }

  function buildQuestionTab(host, source) {
    const quiz = HangoutService.cleanQuiz(source.quiz());
    host.innerHTML = `<form class="hg-form">
      <label>Month label<input name="monthLabel" maxlength="40" placeholder="Auto: ${escapeHTML(HangoutService.monthLabel())}" value="${escapeHTML(quiz.monthLabel)}"></label>
      <label>Title<input name="title" maxlength="200" value="${escapeHTML(quiz.title)}"></label>
      <label>Question / content<textarea name="text" maxlength="4000">${escapeHTML(quiz.text)}</textarea></label>
      <label>Picture link (https)<input name="imageUrl" type="url" placeholder="https://…" value="${quiz.imageUrl.startsWith("data:") ? "" : escapeHTML(quiz.imageUrl)}"></label>
      <label>…or upload a picture<input name="imageFile" type="file" accept="image/*"></label>
      <img class="hg-preview" alt="" ${quiz.imageUrl ? `src="${escapeHTML(quiz.imageUrl)}"` : "hidden"}>
      <p class="hg-hint">Leave the month label empty to show the current month automatically.</p>
      <div class="hg-form-actions"><button type="button" class="hg-btn is-light" data-act="clear">Clear question</button><button type="submit" class="hg-btn">Publish</button></div>
    </form>`;
    const form = host.querySelector("form");
    const preview = host.querySelector(".hg-preview");
    let uploaded = quiz.imageUrl.startsWith("data:") ? quiz.imageUrl : "";

    form.elements.imageFile.addEventListener("change", async () => {
      const file = form.elements.imageFile.files[0];
      if (!file) return;
      try { uploaded = await compressImage(file); form.elements.imageUrl.value = ""; preview.src = uploaded; preview.hidden = false; }
      catch (error) { showToast(error.message || "Could not read this picture.", "error"); form.elements.imageFile.value = ""; }
    });

    async function save(values) {
      const button = form.querySelector('[type="submit"]');
      button.disabled = true;
      try { await HangoutAdminRepository.saveQuiz(values); showToast("Question published.", "success"); }
      catch (error) { console.error("Hangout quiz save failed:", error); showToast("Could not publish. Check Quiz Admin access and database rules.", "error"); }
      finally { button.disabled = false; }
    }

    form.addEventListener("submit", event => {
      event.preventDefault();
      const link = form.elements.imageUrl.value.trim();
      if (link && !HangoutService.safeImage(link)) { showToast("Picture link must start with https://", "warning"); return; }
      void save({
        monthLabel: form.elements.monthLabel.value.trim(),
        title: form.elements.title.value.trim(),
        text: form.elements.text.value.trim(),
        imageUrl: link || uploaded
      });
    });
    host.querySelector('[data-act="clear"]').addEventListener("click", async () => {
      if (!await showConfirmSheet({ title: "Clear the question?", message: "Players will see an empty question area.", confirmLabel: "Clear", danger: true })) return;
      form.reset(); uploaded = ""; preview.hidden = true;
      void save({ monthLabel: form.elements.monthLabel.value.trim(), title: "", text: "", imageUrl: "" });
    });
  }

  function buildScoresTab(host, source) {
    const rows = HangoutService.buildLeaderboard(source.users(), source.scores());
    if (!rows.length) { host.innerHTML = '<div class="hg-empty">No players yet. Players appear here after they sign in with Google.</div>'; return; }
    host.innerHTML = `<form class="hg-form">
      <label>Player<select name="uid">${rows.map(row => `<option value="${escapeHTML(row.uid)}">${escapeHTML(HangoutService.rankLabel(row.rank))} · ${escapeHTML(row.name)} — ${row.points} pts</option>`).join("")}</select></label>
      <label>Points to add (use a minus sign to subtract)<input name="points" type="number" step="1" min="-100000" max="100000" required></label>
      <label>Note (optional)<input name="note" maxlength="200" placeholder="e.g. Round 3 correct answer"></label>
      <div class="hg-form-actions"><button type="submit" class="hg-btn">Apply points</button></div>
    </form>`;
    const form = host.querySelector("form");
    form.addEventListener("submit", async event => {
      event.preventDefault();
      const delta = Number(form.elements.points.value);
      if (!Number.isInteger(delta) || delta === 0 || Math.abs(delta) > 100000) { showToast("Enter a whole number of points.", "warning"); return; }
      const button = form.querySelector('[type="submit"]');
      button.disabled = true;
      try {
        const total = await HangoutAdminRepository.awardPoints(form.elements.uid.value, delta, form.elements.note.value.trim());
        showToast(`Saved. New total: ${total} points.`, "success");
        form.elements.points.value = ""; form.elements.note.value = "";
      } catch (error) { console.error("Hangout score save failed:", error); showToast("Could not save points. Check Quiz Admin access and database rules.", "error"); }
      finally { button.disabled = false; }
    });
  }

  return Object.freeze({ open });
})();
