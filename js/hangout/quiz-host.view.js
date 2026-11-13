// ONLINE QUIZ — floating Quiz Host window (quiz admin only).
// A small draggable window that stays on top of the player quiz screen, so the
// admin can publish prepared questions while watching the same question and chat
// the players see. All writes go through HangoutAdminRepository; nothing here
// talks to Firebase paths directly except through that repository.
//
// While this window is open it also acts as the "autopilot":
//   1. when a live question's time is over, it reveals the answer (both modes);
//   2. in Auto mode, after the gap it publishes the next question.
// If the window is closed or the admin's browser sleeps, nothing advances.
window.HangoutQuizHost = (() => {
  const PREF_KEY = "hangout_quiz_host_prefs";
  const WIDTH = 360;
  const MIN_GAP = 3, MAX_GAP = 120;
  const TYPE_LABELS = { mcq: "Multiple choice", trueFalse: "True / False", short: "Short answer" };
  const STATUS_LABELS = { live: "Live", paused: "Paused", revealed: "Answer shown", completed: "Completed", ready: "Ready", draft: "Draft" };

  let root = null, st = null;

  const $ = selector => root?.querySelector(selector);
  const clampGap = value => Math.min(MAX_GAP, Math.max(MIN_GAP, Math.round(Number(value)) || 10));
  const isNarrow = () => window.innerWidth <= 760;
  const formatTime = milliseconds => {
    const seconds = Math.ceil(Math.max(0, milliseconds) / 1000);
    return `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
  };

  function loadPrefs() {
    try { return JSON.parse(localStorage.getItem(PREF_KEY)) || {}; } catch { return {}; }
  }
  function savePrefs() {
    if (!st) return;
    try {
      // Auto mode is never remembered: it must be switched on deliberately each session.
      localStorage.setItem(PREF_KEY, JSON.stringify({ gap: st.gap, roomId: st.roomId, min: st.min, x: st.x, y: st.y }));
    } catch { /* storage unavailable */ }
  }

  // ---------- open / close ----------
  function open(source) {
    if (!HangoutAdminRepository.isQuizAdmin()) { showToast("Quiz admin access is required.", "error"); return; }
    if (root) { root.hidden = false; return; }
    const prefs = loadPrefs();
    st = {
      source, roomId: String(prefs.roomId || ""), rooms: {}, room: null, scores: {},
      mode: "manual", gap: clampGap(prefs.gap), min: Boolean(prefs.min), x: Number(prefs.x), y: Number(prefs.y),
      busy: false, loading: true, loadError: false, renderKey: "", selectToken: 0,
      revealingFor: "", gapSetFor: "", advancingFor: "", backoffUntil: 0,
      answerKey: "", answerCount: 0, stopAnswers: null, stopScores: null, timer: 0, drag: null
    };
    root = document.createElement("section");
    root.className = "hg-host";
    root.setAttribute("role", "dialog");
    root.setAttribute("aria-label", "Quiz Host");
    root.innerHTML = `
      <header class="hg-host-head" data-drag>
        <i class="fa-solid fa-grip-vertical hg-host-grip" aria-hidden="true"></i>
        <strong>Quiz Host</strong>
        <span class="hg-host-mini" data-mini></span>
        <span class="hg-status" data-chip>Ready</span>
        <button type="button" class="hg-host-ib" data-h="manage" aria-label="Manage questions" title="Manage questions"><i class="fa-solid fa-gear"></i></button>
        <button type="button" class="hg-host-ib" data-h="min" aria-label="Minimize" title="Minimize"><i class="fa-solid fa-minus"></i></button>
        <button type="button" class="hg-host-ib" data-h="close" aria-label="Close host window" title="Close"><i class="fa-solid fa-xmark"></i></button>
      </header>
      <div class="hg-host-body">
        <div class="hg-host-roomrow">
          <label>Quiz room<select data-room aria-label="Quiz room"></select></label>
          <button type="button" class="hg-host-ib" data-h="refresh" aria-label="Reload questions" title="Reload questions"><i class="fa-solid fa-rotate"></i></button>
        </div>
        <div data-now></div>
        <div class="hg-host-ctl" data-ctl></div>
        <div class="hg-host-auto">
          <div class="hg-host-seg" role="group" aria-label="Publish mode">
            <button type="button" data-h="mode-auto">Auto</button>
            <button type="button" data-h="mode-manual">Manual</button>
          </div>
          <label>Gap <input type="number" data-gap min="${MIN_GAP}" max="${MAX_GAP}" step="1" inputmode="numeric"> sec</label>
        </div>
        <p class="hg-host-note" data-auto-note></p>
        <div><h4 class="hg-host-h">Ready questions</h4><div class="hg-host-list" data-list></div></div>
        <div><h4 class="hg-host-h">Top 3 in this room</h4><div class="hg-host-top" data-top></div></div>
      </div>`;
    document.body.appendChild(root);
    root.classList.toggle("is-min", st.min);
    syncMinButton();
    $("[data-gap]").value = st.gap;
    bindEvents();
    placeWindow();
    window.addEventListener("resize", onResize);
    st.timer = window.setInterval(loop, 500);
    syncAuto();
    renderAll();
    loadRooms();
  }

  function close() {
    if (!root) return;
    clearInterval(st.timer);
    st.stopAnswers?.();
    st.stopScores?.();
    window.removeEventListener("resize", onResize);
    savePrefs();
    root.remove();
    root = null;
    st = null;
  }

  const toggle = source => { if (root) close(); else open(source); };

  // ---------- events ----------
  function bindEvents() {
    root.addEventListener("click", event => {
      const button = event.target.closest("[data-h], [data-publish]");
      if (!button || !root.contains(button)) return;
      if (button.dataset.publish !== undefined) { act(() => publishAt(Number(button.dataset.publish))); return; }
      switch (button.dataset.h) {
        case "close": close(); break;
        case "min": st.min = !st.min; root.classList.toggle("is-min", st.min); syncMinButton(); clampIntoView(); savePrefs(); break;
        case "manage": HangoutQuizAdmin.open(st.source); break;
        case "refresh": loadRooms(); break;
        case "mode-auto": setMode("auto"); break;
        case "mode-manual": setMode("manual"); break;
        case "pause": act(() => HangoutAdminRepository.pauseQuiz(st.roomId)); break;
        case "resume": act(() => HangoutAdminRepository.resumeQuiz(st.roomId)); break;
        case "reveal": act(async () => {
          const quiz = currentQuiz();
          if (quiz) await HangoutAdminRepository.revealQuestion(quiz.roomId, quiz.questionId);
        }); break;
        case "next": act(() => {
          const questions = questionList();
          const quiz = currentQuiz();
          if (quiz) return publishAt(questions.findIndex(([id]) => id === quiz.questionId) + 1);
          const firstNew = questions.findIndex(([, question]) => !question.publishedAt);
          return publishAt(firstNew < 0 ? 0 : firstNew);
        }); break;
        case "end": act(endQuiz); break;
      }
    });
    $("[data-room]").addEventListener("change", event => selectRoom(event.target.value));
    $("[data-gap]").addEventListener("change", event => {
      st.gap = clampGap(event.target.value);
      event.target.value = st.gap;
      savePrefs();
    });
    const head = $("[data-drag]");
    head.addEventListener("pointerdown", event => {
      if (isNarrow() || event.target.closest("button")) return;
      const rect = root.getBoundingClientRect();
      st.drag = { dx: event.clientX - rect.left, dy: event.clientY - rect.top };
      head.setPointerCapture(event.pointerId);
    });
    head.addEventListener("pointermove", event => {
      if (!st?.drag) return;
      moveTo(event.clientX - st.drag.dx, event.clientY - st.drag.dy);
    });
    const stopDrag = () => { if (st?.drag) { st.drag = null; savePrefs(); } };
    head.addEventListener("pointerup", stopDrag);
    head.addEventListener("pointercancel", stopDrag);
  }

  // ---------- window position ----------
  function moveTo(x, y) {
    const maxX = Math.max(0, window.innerWidth - root.offsetWidth);
    const maxY = Math.max(0, window.innerHeight - root.offsetHeight);
    st.x = Math.min(Math.max(0, x), maxX);
    st.y = Math.min(Math.max(0, y), maxY);
    root.style.left = `${st.x}px`;
    root.style.top = `${st.y}px`;
  }
  function placeWindow() {
    if (isNarrow()) { root.style.left = ""; root.style.top = ""; return; }
    if (Number.isFinite(st.x) && Number.isFinite(st.y)) { moveTo(st.x, st.y); return; }
    // Default: just to the right of the centred quiz column when there is room, else the right edge.
    const preferred = window.innerWidth / 2 + 280 + 16;
    const x = preferred + WIDTH <= window.innerWidth - 8 ? preferred : window.innerWidth - WIDTH - 12;
    moveTo(x, 16);
  }
  function clampIntoView() { if (!isNarrow()) moveTo(Number.isFinite(st.x) ? st.x : 0, Number.isFinite(st.y) ? st.y : 16); }
  function onResize() { if (root) placeWindow(); }
  function syncMinButton() {
    const button = $('[data-h="min"]');
    button.innerHTML = `<i class="fa-solid ${st.min ? "fa-plus" : "fa-minus"}"></i>`;
    const label = st.min ? "Expand" : "Minimize";
    button.setAttribute("aria-label", label);
    button.title = label;
  }

  // ---------- data ----------
  async function loadRooms() {
    st.loading = true;
    st.loadError = false;
    renderAll();
    try {
      const rooms = await HangoutAdminRepository.listRooms();
      if (!root) return;
      st.rooms = rooms;
      if (!st.roomId || !rooms[st.roomId]) {
        const live = HangoutService.cleanQuiz(st.source.quiz());
        st.roomId = live.roomId && rooms[live.roomId] ? live.roomId : defaultRoomId(rooms);
      }
    } catch (error) {
      console.error("Quiz host could not load rooms:", error);
      if (!root) return;
      st.loadError = true;
    }
    st.loading = false;
    syncRooms();
    await selectRoom(st.roomId);
  }

  function defaultRoomId(rooms) {
    const ids = Object.keys(rooms).sort((a, b) => String(rooms[b]?.createdAt || "").localeCompare(String(rooms[a]?.createdAt || "")));
    return ids.find(id => ["live", "ready"].includes(rooms[id]?.status)) || ids[0] || "";
  }

  async function selectRoom(roomId) {
    if (!st) return;
    const token = ++st.selectToken;
    st.roomId = roomId;
    st.stopScores?.();
    st.stopScores = null;
    st.scores = {};
    st.room = null;
    st.revealingFor = st.gapSetFor = st.advancingFor = "";
    syncRooms();
    renderAll();
    if (!roomId) return;
    try {
      const { room } = await HangoutAdminRepository.getControlRoomData(roomId);
      if (!st || token !== st.selectToken) return;
      st.room = room;
      st.rooms[roomId] = room;
      st.stopScores = HangoutAdminRepository.subscribeRoomScores(roomId, scores => {
        if (!st || token !== st.selectToken) return;
        st.scores = scores;
        renderTop();
      }, error => console.error("Quiz host score updates failed:", error));
    } catch (error) {
      console.error("Quiz host could not load the room:", error);
      if (st && token === st.selectToken) { st.loadError = true; showToast(error.message || "Could not load this quiz room.", "error"); }
    }
    savePrefs();
    if (st) { st.renderKey = ""; renderAll(); }
  }

  async function refreshRoom() {
    if (!st?.roomId) return;
    const id = st.roomId;
    try {
      const { room } = await HangoutAdminRepository.getControlRoomData(id);
      if (st && st.roomId === id) { st.room = room; st.rooms[id] = room; st.renderKey = ""; }
    } catch (error) { console.error("Quiz host could not refresh the room:", error); }
  }

  const questionList = () => Object.entries(st?.room?.questions || {})
    .filter(([, question]) => !question?.deleted)
    .sort((a, b) => Number(a[1]?.questionNumber) - Number(b[1]?.questionNumber));

  // The quiz currently shown to players, only if it belongs to the selected room.
  function currentQuiz() {
    const quiz = HangoutService.cleanQuiz(st.source.quiz());
    return quiz.roomId === st.roomId && quiz.questionId && ["live", "paused", "revealed"].includes(quiz.status) ? quiz : null;
  }
  function otherRoomLive() {
    const quiz = HangoutService.cleanQuiz(st.source.quiz());
    return quiz.roomId && quiz.roomId !== st.roomId && quiz.questionId && ["live", "paused"].includes(quiz.status) ? quiz : null;
  }
  function remaining(quiz) {
    if (quiz.status === "paused") return Number(quiz.remainingMs) || 0;
    const duration = quiz.remainingMs == null ? quiz.timeLimit * 1000 : quiz.remainingMs;
    return Math.max(0, duration - (HangoutFirebase.now() - Number(quiz.startedAt || 0)));
  }
  const questionKey = quiz => `${quiz.roomId}/${quiz.questionId}/${quiz.startedAt}`;

  // ---------- actions ----------
  async function act(action) {
    if (!st || st.busy) return;
    st.busy = true;
    renderControls();
    try { await action(); }
    catch (error) {
      console.error("Quiz host action failed:", error);
      showToast(error.message || "Could not complete this action.", "error");
    } finally {
      if (st) { st.busy = false; await refreshRoom(); if (st) { st.renderKey = ""; renderAll(); } }
    }
  }

  async function publishAt(index) {
    const entry = questionList()[index];
    if (!entry) throw new Error("There is no question at that position.");
    const active = await HangoutAdminRepository.getCurrentQuiz();
    if (active && active.roomId !== st.roomId && ["live", "paused"].includes(active.status)
      && !await showConfirmSheet({
        title: "Switch the live quiz?",
        message: "Publishing this question will replace the question currently shown to every player.",
        confirmLabel: "Switch Quiz",
        danger: true
      })) return;
    await HangoutAdminRepository.publishQuestion(st.roomId, entry[0]);
    showToast(`Question #${entry[1].questionNumber} is live.`, "success");
  }

  async function endQuiz() {
    if (!await showConfirmSheet({
      title: "End this quiz?",
      message: "The active question's correct answer and explanation will be revealed.",
      confirmLabel: "End Quiz",
      danger: true
    })) return;
    await HangoutAdminRepository.endQuiz(st.roomId);
    showToast("Quiz ended and the answer was revealed.", "success");
  }

  async function setMode(mode) {
    if (st.mode === mode) return;
    st.mode = mode;
    st.advancingFor = "";
    syncAuto();
    const quiz = currentQuiz();
    try {
      if (mode === "manual") {
        await HangoutAdminRepository.clearNextPublishAt(st.roomId);
      } else if (quiz?.status === "revealed") {
        // Start a fresh gap instead of trusting an old nextPublishAt value.
        st.gapSetFor = questionKey(quiz);
        await HangoutAdminRepository.setNextPublishAt(st.roomId, HangoutFirebase.now() + st.gap * 1000);
      }
    } catch (error) {
      console.error("Quiz host could not update the publish mode:", error);
      showToast(error.message || "Could not update the publish mode.", "error");
    }
    if (st) st.renderKey = "";
  }

  // ---------- autopilot (runs every 500 ms while the window is open) ----------
  function loop() {
    if (!root || !st) return;
    const quiz = HangoutService.cleanQuiz(st.source.quiz());
    const key = JSON.stringify([quiz.roomId, quiz.questionId, quiz.status, quiz.startedAt, quiz.remainingMs, quiz.nextPublishAt,
      st.mode, st.busy, st.loading, st.room?.updatedAt || "", Object.keys(st.rooms).length]);
    if (key !== st.renderKey) {
      st.renderKey = key;
      syncAnswerSubscription();
      renderAll();
    }
    updateLive();
    autopilot();
  }

  function autopilot() {
    if (st.busy || st.loading || !st.room) return;
    const quiz = currentQuiz();
    if (!quiz) return;
    const key = questionKey(quiz);
    if (quiz.status === "live" && quiz.timeLimit && remaining(quiz) <= 0) {
      if (st.revealingFor === key || Date.now() < st.backoffUntil) return;
      st.revealingFor = key;
      HangoutAdminRepository.revealQuestion(quiz.roomId, quiz.questionId).then(refreshRoom).catch(error => {
        console.error("Quiz host could not reveal the answer:", error);
        showToast(error.message || "Time ended, but the answer could not be revealed.", "error");
        if (st) { st.revealingFor = ""; st.backoffUntil = Date.now() + 4000; }
      });
      return;
    }
    if (quiz.status !== "revealed" || st.mode !== "auto") return;
    const questions = questionList();
    const index = questions.findIndex(([id]) => id === quiz.questionId);
    if (index < 0 || index >= questions.length - 1) return; // last question: the admin ends the quiz
    if (quiz.nextPublishAt == null) {
      if (st.gapSetFor === key) return;
      st.gapSetFor = key;
      HangoutAdminRepository.setNextPublishAt(quiz.roomId, HangoutFirebase.now() + st.gap * 1000).catch(error => {
        console.error("Quiz host could not start the gap timer:", error);
        if (st) { st.gapSetFor = ""; st.backoffUntil = Date.now() + 4000; }
      });
    } else if (HangoutFirebase.now() >= quiz.nextPublishAt) {
      advance(quiz, index);
    }
  }

  async function advance(quiz, index) {
    const key = `${questionKey(quiz)}/${quiz.nextPublishAt}`;
    if (st.advancingFor === key || Date.now() < st.backoffUntil) return;
    st.advancingFor = key;
    st.busy = true;
    try {
      // Re-read first: another admin or a manual click may already have moved on.
      const fresh = await HangoutAdminRepository.getCurrentQuiz();
      if (!fresh || fresh.roomId !== quiz.roomId || fresh.questionId !== quiz.questionId || fresh.status !== "revealed") return;
      await publishAt(index + 1);
    } catch (error) {
      console.error("Quiz host auto publish stopped:", error);
      showToast(error.message || "Auto publish stopped.", "error");
      if (st) { st.mode = "manual"; st.backoffUntil = Date.now() + 4000; syncAuto(); }
      HangoutAdminRepository.clearNextPublishAt(quiz.roomId).catch(() => {});
    } finally {
      if (st) { st.busy = false; await refreshRoom(); if (st) st.renderKey = ""; }
    }
  }

  function syncAnswerSubscription() {
    const quiz = currentQuiz();
    const key = quiz ? `${quiz.roomId}/${quiz.questionId}` : "";
    if (key === st.answerKey) return;
    st.stopAnswers?.();
    st.stopAnswers = null;
    st.answerKey = key;
    st.answerCount = 0;
    if (!quiz) return;
    try {
      st.stopAnswers = HangoutAdminRepository.subscribeAnswerCount(quiz.roomId, quiz.questionId, count => {
        if (!st || st.answerKey !== key) return;
        st.answerCount = count;
        updateLive();
      }, error => console.error("Quiz host answer count failed:", error));
    } catch (error) { console.error("Quiz host answer count failed:", error); }
  }

  // ---------- rendering ----------
  function renderAll() {
    if (!root || !st) return;
    renderChip();
    renderNow();
    renderControls();
    renderList();
    renderTop();
    updateLive();
  }

  function renderChip() {
    const quiz = currentQuiz();
    const status = quiz?.status || st.room?.status || "draft";
    const chip = $("[data-chip]");
    chip.className = `hg-status is-${status}`;
    chip.textContent = STATUS_LABELS[status] || status;
  }

  function syncRooms() {
    const select = $("[data-room]");
    if (!select) return;
    const ids = Object.keys(st.rooms).sort((a, b) => String(st.rooms[b]?.createdAt || "").localeCompare(String(st.rooms[a]?.createdAt || "")));
    select.innerHTML = ids.length
      ? ids.map(id => `<option value="${escapeHTML(id)}" ${id === st.roomId ? "selected" : ""}>${escapeHTML(st.rooms[id]?.name || "Quiz Room")} (${escapeHTML(STATUS_LABELS[st.rooms[id]?.status] || st.rooms[id]?.status || "Draft")})</option>`).join("")
      : '<option value="">No quiz rooms</option>';
    select.disabled = !ids.length;
  }

  function syncAuto() {
    $('[data-h="mode-auto"]').classList.toggle("is-on", st.mode === "auto");
    $('[data-h="mode-manual"]').classList.toggle("is-on", st.mode === "manual");
    $('[data-h="mode-auto"]').setAttribute("aria-pressed", String(st.mode === "auto"));
    $('[data-h="mode-manual"]').setAttribute("aria-pressed", String(st.mode === "manual"));
    $("[data-auto-note]").textContent = st.mode === "auto"
      ? "Auto: the answer is shown when time ends, then the next question is published after the gap. Keep this window open."
      : "Manual: the answer is shown when time ends. You choose when the next question goes live.";
  }

  function renderNow() {
    const host = $("[data-now]");
    if (st.loading) { host.innerHTML = '<div class="hg-host-empty"><i class="fa-solid fa-spinner fa-spin"></i> Loading quiz rooms…</div>'; return; }
    if (st.loadError && !st.room) { host.innerHTML = '<div class="hg-host-empty">Could not load quiz rooms. Check your connection, then use the reload button.</div>'; return; }
    if (!st.roomId) { host.innerHTML = '<div class="hg-host-empty">Create a quiz room in the admin panel first.</div>'; return; }
    const quiz = currentQuiz();
    const other = otherRoomLive();
    if (!quiz) {
      host.innerHTML = `<div class="hg-host-empty">${other
        ? `Another room is live: <strong>${escapeHTML(other.roomName || "Quiz Room")}</strong>.<br>Publishing here will replace it.`
        : "No question is live in this room.<br>Press Start or publish a question below."}</div>`;
      return;
    }
    const total = questionList().length;
    host.innerHTML = `<div class="hg-host-now">
      <small>Question #${quiz.questionNumber}${total ? ` of ${total}` : ""} · ${quiz.points} points · ${escapeHTML(TYPE_LABELS[quiz.type] || "Question")}</small>
      <p class="hg-host-qtext">${escapeHTML(quiz.text || "Media question")}</p>
      <div class="hg-host-timerrow"><strong data-timer></strong><span data-gap-text></span></div>
      <div class="hg-host-bar"><i data-bar></i></div>
      <div class="hg-host-answered" data-answered></div>
    </div>`;
  }

  function renderControls() {
    const host = $("[data-ctl]");
    if (!host) return;
    const quiz = currentQuiz();
    const questions = questionList();
    const index = quiz ? questions.findIndex(([id]) => id === quiz.questionId) : -1;
    const ready = !st.loading && Boolean(st.room) && !st.busy;
    const live = quiz?.status === "live", paused = quiz?.status === "paused";
    const canNext = ready && (quiz ? index >= 0 && index < questions.length - 1 : questions.length > 0);
    host.innerHTML = `
      <button type="button" class="hg-btn is-light" data-h="${paused ? "resume" : "pause"}" ${ready && (live || paused) ? "" : "disabled"}><i class="fa-solid ${paused ? "fa-play" : "fa-pause"}"></i> ${paused ? "Resume" : "Pause"}</button>
      <button type="button" class="hg-btn is-light" data-h="reveal" ${ready && (live || paused) ? "" : "disabled"}><i class="fa-solid fa-eye"></i> Reveal</button>
      <button type="button" class="hg-btn" data-h="next" ${canNext ? "" : "disabled"}><i class="fa-solid ${quiz ? "fa-forward-step" : "fa-play"}"></i> ${quiz ? "Next" : "Start"}</button>
      <button type="button" class="hg-btn is-danger" data-h="end" ${ready && (quiz || st.room?.status === "live") ? "" : "disabled"}><i class="fa-solid fa-flag-checkered"></i> End</button>`;
  }

  function renderList() {
    const host = $("[data-list]");
    const questions = questionList();
    const quiz = currentQuiz();
    if (!questions.length) {
      host.innerHTML = `<div class="hg-host-empty is-small">${st.loading ? "" : "This room has no questions yet. Add them with the gear button."}</div>`;
      return;
    }
    host.innerHTML = questions.map(([id, question], index) => {
      const isCurrent = quiz?.questionId === id;
      const inProgress = isCurrent && ["live", "paused"].includes(quiz.status);
      const label = inProgress ? "Live" : isCurrent ? "Shown" : question.publishedAt ? "Again" : "Publish";
      const disabled = st.busy || st.loading || inProgress || isCurrent;
      return `<div class="hg-host-q ${isCurrent ? "is-current" : ""}">
        <span class="hg-host-qn">${Number(question.questionNumber) || index + 1}</span>
        <span class="hg-host-qt" title="${escapeHTML(question.text || "Media question")}">${escapeHTML(question.text || "Media question")}<small>${escapeHTML(TYPE_LABELS[question.type] || "")} · ${Number(question.points) || 0} pts · ${Number(question.timeLimit) || 60}s</small></span>
        <button type="button" class="hg-btn ${isCurrent ? "is-light" : ""}" data-publish="${index}" ${disabled ? "disabled" : ""}>${label}</button>
      </div>`;
    }).join("");
  }

  function renderTop() {
    const host = $("[data-top]");
    if (!host) return;
    const users = st.source.users() || {};
    const rows = Object.entries(st.scores || {})
      .map(([uid, score]) => ({ name: users[uid]?.name || "Player", points: Number(score?.points) || 0 }))
      .filter(row => row.points > 0)
      .sort((a, b) => b.points - a.points || a.name.localeCompare(b.name))
      .slice(0, 3);
    host.innerHTML = rows.length
      ? rows.map((row, index) => `<div><span>${HangoutService.medalFor(index + 1) || index + 1}</span><strong>${escapeHTML(row.name)}</strong><b>${row.points}</b></div>`).join("")
      : '<span class="hg-host-empty is-small">No points awarded yet.</span>';
  }

  // Small per-tick updates that must not rebuild the DOM.
  function updateLive() {
    if (!root || !st) return;
    const quiz = currentQuiz();
    const mini = $("[data-mini]");
    if (mini) mini.textContent = quiz && ["live", "paused"].includes(quiz.status) ? `Q${quiz.questionNumber} · ${formatTime(remaining(quiz))}` : "";
    if (!quiz) return;
    const timer = $("[data-timer]");
    if (timer) timer.textContent = quiz.status === "revealed" ? "00:00" : formatTime(remaining(quiz));
    const bar = $("[data-bar]");
    if (bar) bar.style.width = `${quiz.status === "revealed" || !quiz.timeLimit ? 0 : Math.min(100, remaining(quiz) / (quiz.timeLimit * 1000) * 100)}%`;
    const gapText = $("[data-gap-text]");
    if (gapText) {
      const left = quiz.status === "revealed" && quiz.nextPublishAt ? Math.ceil((quiz.nextPublishAt - HangoutFirebase.now()) / 1000) : 0;
      gapText.textContent = quiz.status === "paused" ? "Paused" : left > 0 ? `Next question in ${left}s` : "";
    }
    const answered = $("[data-answered]");
    if (answered) {
      const players = Object.keys(st.source.users() || {}).length;
      answered.textContent = `Answered: ${st.answerCount}${players ? ` of ${players} players` : ""}`;
    }
  }

  const reload = () => { if (root && st) loadRooms(); };

  return Object.freeze({ open, close, toggle, reload, isOpen: () => Boolean(root) });
})();
