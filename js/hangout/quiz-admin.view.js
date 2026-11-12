// ONLINE QUIZ — room, question and evaluation admin screens.
window.HangoutQuizAdmin = (() => {
  const MAX_MEDIA_BYTES = 200 * 1024;
  const TYPE_LABELS = { mcq: "Multiple choice", trueFalse: "True / False", short: "Short answer" };

  function remainingTime(quiz, serverTimeOffset = 0) {
    if (quiz?.status === "paused") return Math.max(0, Number(quiz.remainingMs) || 0);
    if (["revealed", "completed"].includes(quiz?.status)) return 0;
    const duration = quiz?.remainingMs == null ? Number(quiz?.timeLimit) * 1000 : Number(quiz.remainingMs);
    const startedAt = Number(quiz?.startedAt);
    if (!Number.isFinite(duration) || !Number.isFinite(startedAt)) return 0;
    return Math.max(0, duration - (Date.now() + serverTimeOffset - startedAt));
  }

  function formatCountdown(milliseconds) {
    const seconds = Math.ceil(Math.max(0, milliseconds) / 1000);
    return `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
  }

  function open(source) {
    if (!HangoutAdminRepository.isQuizAdmin()) { showToast("Quiz admin access is required.", "error"); return; }
    document.getElementById("hgAdminSheet")?.remove();
    const modal = document.createElement("div");
    modal.id = "hgAdminSheet";
    modal.className = "hg-modal";
    modal.innerHTML = `<section class="hg-sheet hg-admin-sheet" role="dialog" aria-modal="true" aria-label="Quiz Admin Panel">
      <h3>Quiz Admin Panel <button type="button" class="hg-icon-btn" data-act="close" aria-label="Close"><i class="fa-solid fa-xmark"></i></button></h3>
      <div class="hg-tabs"><button type="button" class="is-active" data-tab="host">Host</button><button type="button" data-tab="questions">Questions</button><button type="button" data-tab="evaluation">Evaluation</button><button type="button" data-tab="scores">Scores</button></div>
      <div data-tabpanel="host"></div><div data-tabpanel="questions" hidden></div><div data-tabpanel="evaluation" hidden></div><div data-tabpanel="scores" hidden></div>
    </section>`;
    document.body.appendChild(modal);
    const state = { roomId: "", controlRoomId: "", evaluationTab: "pending", controlTimer: 0, revealingFor: "", serverTimeOffset: 0, stopServerTime: null, autoPublish: { active: false, paused: false, currentIndex: 0, startFrom: 1, gapSeconds: 10, gapTimerId: 0, gapEndTime: 0, lastRevealedQuestionId: "" } };
    const autoPublishKey = roomId => `quiz_auto_publish_${roomId}`;
    const dbRef = () => HangoutFirebase.db()?.ref("hangout/quiz");
    const saveAutoPublish = async () => {
      if (!state.roomId) return;
      const config = { ...state.autoPublish, gapTimerId: 0 };
      try { localStorage.setItem(autoPublishKey(state.roomId), JSON.stringify(config)); } catch {}
      try {
        const db = dbRef();
        if (db) await db.child("autoPublish").set(config);
      } catch {}
    };
    const loadAutoPublish = async () => {
      if (!state.roomId) return;
      let saved = null;
      try {
        const snap = await dbRef()?.child("autoPublish").once("value");
        saved = snap?.val() || null;
      } catch {}
      if (!saved) {
        try {
          const raw = localStorage.getItem(autoPublishKey(state.roomId));
          saved = raw ? JSON.parse(raw) : null;
        } catch {}
      }
      if (saved) {
        state.autoPublish.active = Boolean(saved.active);
        state.autoPublish.paused = Boolean(saved.paused);
        state.autoPublish.currentIndex = Number(saved.currentIndex) || 0;
        state.autoPublish.startFrom = Number(saved.startFrom) || 1;
        state.autoPublish.gapSeconds = Number(saved.gapSeconds) || 10;
        state.autoPublish.gapEndTime = Number(saved.gapEndTime) || 0;
        state.autoPublish.lastRevealedQuestionId = saved.lastRevealedQuestionId || "";
      }
    };
    const clearAutoPublishFirebase = async () => {
      if (!state.roomId) return;
      try {
        const db = dbRef();
        if (db) await db.child("autoPublish").remove();
        if (db) await db.child("nextPublishAt").remove();
      } catch {}
      try { localStorage.removeItem(autoPublishKey(state.roomId)); } catch {}
    };
    const close = () => {
      clearInterval(state.autoPublish.gapTimerId);
      clearInterval(state.roomAutoTimer);
      clearInterval(state.roomRevealTimer);
      state.roomAutoTimer = 0;
      state.roomRevealTimer = 0;
      state.stopServerTime?.();
      panels.scores._stopRoomScores?.();
      modal.remove();
    };
    const panels = Object.fromEntries([...modal.querySelectorAll("[data-tabpanel]")].map(panel => [panel.dataset.tabpanel, panel]));
    modal.addEventListener("click", event => {
      if (event.target.closest('[data-act="close"]')) { close(); return; }
      const tab = event.target.closest("[data-tab]");
      if (tab) {
        if (tab.dataset.tab !== "scores") panels.scores._stopRoomScores?.();
        modal.querySelectorAll("[data-tab]").forEach(button => button.classList.toggle("is-active", button === tab));
        Object.values(panels).forEach(panel => { panel.hidden = panel.dataset.tabpanel !== tab.dataset.tab; });
        if (tab.dataset.tab === "host") renderHostDashboard(panels.host, state, source);
        if (tab.dataset.tab === "questions") renderQuestionsTab(panels.questions, state, source);
        if (tab.dataset.tab === "evaluation") renderEvaluations(panels.evaluation, state);
        if (tab.dataset.tab === "scores") buildScoresTab(panels.scores, source);
      }
    });
    renderHostDashboard(panels.host, state, source);
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

  async function renderHostDashboard(host, state, source) {
    const roomId = state.roomId;
    if (!roomId) {
      const rooms = await HangoutAdminRepository.listRooms().catch(() => ({}));
      if (!host.isConnected) return;
      state.rooms = rooms;
      const roomCards = Object.entries(rooms).length
        ? Object.entries(rooms).sort((a, b) => String(b[1]?.createdAt || "").localeCompare(String(a[1]?.createdAt || ""))).map(([id, room]) => {
          const questions = Object.values(room?.questions || {}).filter(q => !q?.deleted).length;
          return `<article class="hg-room-card"><div><strong>${escapeHTML(room.name || "Quiz Room")}</strong><small>${questions} question${questions === 1 ? "" : "s"} · ${escapeHTML(room.status || "Draft")}</small></div><button type="button" class="hg-btn" data-host-select-room="${escapeHTML(id)}">Open Host</button></article>`;
        }).join("")
        : '<div class="hg-empty">No quiz rooms yet.</div>';
      host.innerHTML = `<div class="hg-host-empty">
        <h3>Select a Quiz Room</h3>
        <div class="hg-room-list">${roomCards}</div>
        <div class="hg-form-actions" style="margin-top:16px"><button type="button" class="hg-btn" data-host-create-room>Create New Room</button></div>
      </div>`;
      host.querySelectorAll("[data-host-select-room]").forEach(button => button.addEventListener("click", async () => {
        state.roomId = button.dataset.hostSelectRoom;
        await renderHostDashboard(host, state, source);
      }));
      host.querySelector("[data-host-create-room]").addEventListener("click", () => {
        modal.querySelector('[data-tab="rooms"]').click();
      });
      return;
    }

    const room = state.rooms[roomId];
    if (!room) { state.roomId = ""; await renderHostDashboard(host, state, source); return; }
    const activeQuiz = await HangoutAdminRepository.getCurrentQuiz();
    const questions = Object.entries(room.questions || {}).filter(([, q]) => !q?.deleted).sort((a, b) => Number(a[1]?.questionNumber) - Number(b[1]?.questionNumber));
    const currentIdx = questions.findIndex(([, q]) => q.questionNumber == (activeQuiz?.questionNumber || 0));
    const participants = (await HangoutAdminRepository.getControlRoomData(roomId).catch(() => ({ participants: {} }))).participants || {};
    const participantCount = Object.keys(participants).length;
    const pendingEval = (await HangoutAdminRepository.listEvaluations().catch(() => []))
      .filter(row => row.questionType === "short" && !row.evaluation).length;

    clearInterval(state.roomAutoTimer);
    state.roomAutoTimer = 0;
    clearInterval(state.roomRevealTimer);
    state.roomRevealTimer = 0;
    await loadAutoPublish();

    const statusBadgeClass = room.status === "live" ? "is-live" : room.status === "paused" ? "is-paused" : room.status === "completed" ? "is-completed" : "is-draft";
    const statusLabel = room.status === "live" ? "● LIVE" : room.status === "paused" ? "⏸ PAUSED" : room.status === "completed" ? "✓ COMPLETED" : "○ DRAFT";

    host.innerHTML = `
      <div class="hg-host-topbar">
        <div class="hg-host-room">${escapeHTML(room.name || "Quiz Room")}</div>
        <div class="hg-host-status-badge ${statusBadgeClass}">${statusLabel}</div>
        <div class="hg-host-meta">${participantCount} players</div>
        <div class="hg-host-network"><span class="hg-network-dot"></span> Online</div>
      </div>
      <div class="hg-host-current">
        <div class="hg-host-current-head">
          <div class="hg-host-q-number">Q ${currentIdx >= 0 ? Number(questions[currentIdx][1].questionNumber || currentIdx + 1) : "—"} / ${questions.length}</div>
          <div class="hg-host-q-type">${activeQuiz?.type ? TYPE_LABELS[activeQuiz.type] : "—"} · ${activeQuiz?.points ? activeQuiz.points + " pts" : "—"}</div>
        </div>
        <div class="hg-host-q-text">${activeQuiz?.text ? escapeHTML(activeQuiz.text) : "No question live yet."}</div>
        <div class="hg-host-timer">
          <span class="hg-timer-label">Time</span>
          <span class="hg-timer-value" data-host-timer>${activeQuiz && ["live", "paused"].includes(activeQuiz.status) && activeQuiz.timeLimit ? formatCountdown(remainingTime(activeQuiz, state.serverTimeOffset)) : "--:--"}</span>
          <span class="hg-timer-progress" style="--pct:${activeQuiz && ["live", "paused"].includes(activeQuiz.status) ? Math.max(0, Math.min(100, (remainingTime(activeQuiz, state.serverTimeOffset) / (Number(activeQuiz.remainingMs || activeQuiz.timeLimit * 1000))) * 100)) : 0};"></span>
          <span class="hg-timer-answered">${activeQuiz ? (activeQuiz.answeredCount || 0) + " answered" : "—"}</span>
        </div>
      </div>
      <div class="hg-host-controls">
        <div class="hg-host-btn-row">
          <button type="button" class="hg-btn is-light" data-host-act="pause" ${!activeQuiz || activeQuiz.status !== "live" ? "disabled" : ""}>⏸ Pause</button>
          <button type="button" class="hg-btn is-light" data-host-act="resume" ${!activeQuiz || activeQuiz.status !== "paused" ? "disabled" : ""}>▶ Resume</button>
          <button type="button" class="hg-btn" data-host-act="reveal" ${!activeQuiz || activeQuiz.status !== "live" ? "disabled" : ""}>⚡ Reveal now</button>
          <button type="button" class="hg-btn is-danger" data-host-act="next" ${!activeQuiz || currentIdx < 0 || currentIdx >= questions.length - 1 ? "disabled" : ""}>➡ Next</button>
          <button type="button" class="hg-btn is-light" data-host-act="prev" ${!activeQuiz || currentIdx <= 0 ? "disabled" : ""}>⬅ Prev</button>
          <button type="button" class="hg-btn is-danger" data-host-act="end" ${!activeQuiz || activeQuiz.status === "completed" ? "disabled" : ""}>⏹ End Quiz</button>
        </div>
        <div class="hg-host-mode">
          <label>Mode<label class="hg-host-mode-toggle"><input type="radio" name="hostMode" value="auto" ${state.autoPublish.active ? "checked" : ""}> Auto</label><label class="hg-host-mode-toggle"><input type="radio" name="hostMode" value="manual" ${!state.autoPublish.active ? "checked" : ""}> Manual</label></label>
          <label>Gap<label class="hg-host-mode-toggle"><select name="hostGap" data-host-gap>${[10, 15, 20, 30].map(s => `<option value="${s}" ${s === state.autoPublish.gapSeconds ? "selected" : ""}>${s}s</option>`).join("")}</select></label>
          <div class="hg-host-gap" data-host-gap-timer>${state.autoPublish.active && !state.autoPublish.paused && state.autoPublish.gapEndTime ? `Next in <strong>${Math.max(0, Math.ceil((state.autoPublish.gapEndTime - Date.now()) / 1000))}</strong> sec` : ""}</div>
        </div>
      </div>
      <div class="hg-host-sequence">
        <div class="hg-host-seq-chips">${questions.map(([id, q], i) => {
          const isCurrent = i === currentIdx;
          const isDone = i < currentIdx;
          const chipClass = isDone ? "is-done" : isCurrent ? "is-current" : "";
          const chipLabel = isDone ? "✔" : isCurrent ? "▶" : "○";
          return `<button type="button" class="hg-host-chip ${chipClass}" data-host-jump="${escapeHTML(id)}" ${isCurrent ? "" : "disabled"}>${chipLabel} #${String(q.questionNumber || i + 1).padStart(2, "0")}</button>`;
        }).join("")}</div>
      </div>
      <div class="hg-host-score">
        <div class="hg-host-score-head">
          <div>Top 5 Live Score</div>
          <div class="hg-host-eval-warning">${pendingEval > 0 ? `⚠ ${pendingEval} evaluation${pendingEval === 1 ? "" : "s"} pending` : ""}</div>
        </div>
        <div class="hg-host-score-list" data-host-scores></div>
      </div>
    `;

    // Host control button handlers
    host.querySelectorAll("[data-host-act]").forEach(button => button.addEventListener("click", async () => {
      button.disabled = true;
      try {
        switch (button.dataset.hostAct) {
          case "pause":
            await HangoutAdminRepository.pauseQuiz(roomId);
            showToast("Quiz paused.", "success");
            break;
          case "resume":
            await HangoutAdminRepository.resumeQuiz(roomId);
            showToast("Quiz resumed.", "success");
            break;
          case "reveal":
            if (activeQuiz?.questionId) {
              await HangoutAdminRepository.revealQuestion(roomId, activeQuiz.questionId);
              showToast("Answer revealed.", "success");
            }
            break;
          case "next":
            if (currentIdx >= 0 && currentIdx < questions.length - 1) {
              const [, nextQ] = questions[currentIdx + 1];
              await HangoutAdminRepository.publishQuestion(roomId, nextQ.id);
              state.autoPublish.currentIndex = currentIdx + 1;
              state.autoPublish.lastRevealedQuestionId = "";
              await saveAutoPublish();
              showToast(`Question #${nextQ.questionNumber} is live.`, "success");
            }
            break;
          case "prev":
            if (currentIdx > 0) {
              const [, prevQ] = questions[currentIdx - 1];
              await HangoutAdminRepository.publishQuestion(roomId, prevQ.id);
              state.autoPublish.currentIndex = currentIdx - 1;
              state.autoPublish.lastRevealedQuestionId = "";
              await saveAutoPublish();
              showToast(`Question #${prevQ.questionNumber} is live.`, "success");
            }
            break;
          case "end":
            if (!await showConfirmSheet({ title: "End this quiz?", message: "The active question's correct answer and explanation will be revealed.", confirmLabel: "End Quiz", danger: true })) return;
            await HangoutAdminRepository.endQuiz(roomId);
            showToast("Quiz ended.", "success");
            break;
        }
        await renderHostDashboard(host, state, source);
      } catch (error) {
        console.error("Host action failed:", error);
        showToast(error.message || "Action failed.", "error");
      } finally {
        button.disabled = false;
      }
    }));

    // Mode toggle
    host.querySelectorAll('input[name="hostMode"]').forEach(radio => radio.addEventListener("change", async () => {
      state.autoPublish.active = radio.value === "auto";
      state.autoPublish.paused = false;
      if (state.autoPublish.active) {
        state.autoPublish.currentIndex = currentIdx >= 0 ? currentIdx : 0;
        await saveAutoPublish();
        if (activeQuiz && activeQuiz.status === "revealed" && activeQuiz.questionId) {
          state.autoPublish.lastRevealedQuestionId = activeQuiz.questionId;
          await roomStartAutoGap();
        } else {
          await roomAutoPublishNext();
        }
      } else {
        await roomStopAutoPublish();
      }
      await renderHostDashboard(host, state, source);
    }));

    // Gap select
    host.querySelector("[data-host-gap]").addEventListener("change", async event => {
      state.autoPublish.gapSeconds = Number(event.target.value) || 10;
      await saveAutoPublish();
      await renderHostDashboard(host, state, source);
    });

    // Jump to question
    host.querySelectorAll("[data-host-jump]").forEach(button => button.addEventListener("click", async () => {
      const idx = questions.findIndex(([id]) => id === button.dataset.hostJump);
      if (idx >= 0 && idx !== currentIdx) {
        const [, q] = questions[idx];
        await HangoutAdminRepository.publishQuestion(roomId, q.id);
        state.autoPublish.currentIndex = idx;
        state.autoPublish.lastRevealedQuestionId = "";
        await saveAutoPublish();
        showToast(`Question #${q.questionNumber} is live.`, "success");
        await renderHostDashboard(host, state, source);
      }
    }));

    // Score display + background loop
    const scoreEl = host.querySelector("[data-host-scores]");
    const timerEl = host.querySelector("[data-host-timer]");
    const gapEl = host.querySelector("[data-host-gap-timer]");

    const renderScoreList = () => {
      const scoresData = state._hostScores || {};
      const users = source.users() || {};
      const rows = Object.entries(users).map(([uid, user]) => ({
        uid, name: user?.name || "Player", points: Number(scoresData[uid]?.points) || 0
      })).sort((a, b) => b.points - a.points || a.name.localeCompare(b.name)).slice(0, 5);
      scoreEl.innerHTML = rows.map((row, i) => `<div class="hg-host-score-row"><span>#${i + 1}</span><strong>${escapeHTML(row.name)}</strong><b>${row.points} pts</b></div>`).join("") || '<div class="hg-empty">No scores yet.</div>';
    };

    const roomRemainingTime = quiz => {
      if (quiz?.status === "paused") return Math.max(0, Number(quiz.remainingMs) || 0);
      if (["revealed", "completed"].includes(quiz?.status)) return 0;
      const duration = quiz?.remainingMs == null ? Number(quiz?.timeLimit) * 1000 : Number(quiz.remainingMs);
      const startedAt = Number(quiz?.startedAt);
      if (!Number.isFinite(duration) || !Number.isFinite(startedAt)) return 0;
      return Math.max(0, duration - (Date.now() + state.serverTimeOffset - startedAt));
    };

    const roomAutoGapDisplay = () => {
      if (!gapEl) return;
      if (!state.autoPublish.active || state.autoPublish.paused) { gapEl.textContent = ""; return; }
      const remaining = Math.max(0, Math.ceil((state.autoPublish.gapEndTime - Date.now()) / 1000));
      gapEl.innerHTML = remaining > 0 ? `Next in <strong>${remaining}</strong> sec` : "";
    };

    const roomStopAutoPublish = async () => {
      state.autoPublish.active = false;
      state.autoPublish.paused = false;
      state.autoPublish.gapEndTime = 0;
      clearInterval(state.autoPublish.gapTimerId);
      state.autoPublish.gapTimerId = 0;
      roomAutoGapDisplay();
      await saveAutoPublish();
      await clearAutoPublishFirebase();
    };

    const roomStartAutoGap = async () => {
      state.autoPublish.gapEndTime = Date.now() + state.autoPublish.gapSeconds * 1000;
      clearInterval(state.autoPublish.gapTimerId);
      state.autoPublish.gapTimerId = 0;
      roomAutoGapDisplay();
      await saveAutoPublish();
      try {
        const db = HangoutFirebase.db()?.ref("hangout/quiz");
        if (db) await db.child("nextPublishAt").set(state.autoPublish.gapEndTime);
      } catch {}
    };

    const roomAutoPublishNext = async () => {
      const idx = state.autoPublish.currentIndex;
      const [questionId] = questions[idx] || [];
      if (!questionId) {
        await roomStopAutoPublish();
        showToast("All questions published.", "success");
        await renderHostDashboard(host, state, source);
        return;
      }
      try {
        await HangoutAdminRepository.publishQuestion(roomId, questionId);
        state.autoPublish.currentIndex = idx + 1;
        state.autoPublish.lastRevealedQuestionId = "";
        await saveAutoPublish();
        try {
          const db = HangoutFirebase.db()?.ref("hangout/quiz");
          if (db) await db.child("nextPublishAt").remove();
        } catch {}
        await renderHostDashboard(host, state, source);
      } catch (error) {
        console.error("Auto publish next failed:", error);
        await roomStopAutoPublish();
        showToast(error.message || "Auto publish stopped.", "error");
      }
    };

    const roomRevealActiveQuiz = async () => {
      if (!state.autoPublish.active || !activeQuiz || activeQuiz.roomId !== roomId) return;
      if (activeQuiz.status !== "live") return;
      const left = roomRemainingTime(activeQuiz);
      if (left > 0) return;
      clearInterval(state.roomRevealTimer);
      state.roomRevealTimer = 0;
      try {
        state.revealingFor = `${activeQuiz.roomId}/${activeQuiz.questionId}`;
        await HangoutAdminRepository.revealQuestion(activeQuiz.roomId, activeQuiz.questionId);
        state.revealingFor = "";
        await renderHostDashboard(host, state, source);
        if (state.autoPublish.active && !state.autoPublish.paused) {
          state.autoPublish.lastRevealedQuestionId = activeQuiz.questionId;
          await roomStartAutoGap();
          await renderHostDashboard(host, state, source);
        }
      } catch (error) {
        console.error("Reveal-on-timeout failed:", error);
        state.revealingFor = "";
        showToast(error.message || "Time ended, answer not revealed.", "error");
      }
    };

    // Subscribe to score updates
    state._hostScoreUnsub = HangoutAdminRepository.subscribeRoomScores(roomId, () => {
      HangoutAdminRepository.getRoomScoreData(roomId).then(({ scores }) => {
        state._hostScores = scores;
        renderScoreList();
      }).catch(() => {});
    });

    renderScoreList();

    // Background loop: countdown + reveal + auto-publish
    state.roomAutoTimer = setInterval(async () => {
      const freshQuiz = await HangoutAdminRepository.getCurrentQuiz().catch(() => null);
      if (!freshQuiz || freshQuiz.roomId !== roomId) return;
      if (timerEl) {
        const left = remainingTime(freshQuiz, state.serverTimeOffset);
        timerEl.textContent = ["live", "paused"].includes(freshQuiz.status) && freshQuiz.timeLimit ? formatCountdown(left) : "--:--";
      }
      if (freshQuiz.status === "live" && freshQuiz.questionId) {
        const left = roomRemainingTime(freshQuiz);
        if (left <= 0) {
          clearInterval(state.roomRevealTimer);
          state.roomRevealTimer = 0;
          try {
            state.revealingFor = `${freshQuiz.roomId}/${freshQuiz.questionId}`;
            await HangoutAdminRepository.revealQuestion(freshQuiz.roomId, freshQuiz.questionId);
            state.revealingFor = "";
            await renderHostDashboard(host, state, source);
            if (state.autoPublish.active && !state.autoPublish.paused) {
              state.autoPublish.lastRevealedQuestionId = freshQuiz.questionId;
              await roomStartAutoGap();
              await renderHostDashboard(host, state, source);
            }
          } catch (error) {
            console.error("Reveal-on-timeout failed:", error);
            state.revealingFor = "";
          }
          return;
        }
      }
      if (state.autoPublish.active && !state.autoPublish.paused && state.autoPublish.gapEndTime) {
        roomAutoGapDisplay();
        const remaining = Math.max(0, Math.ceil((state.autoPublish.gapEndTime - Date.now()) / 1000));
        if (remaining <= 0) {
          clearInterval(state.roomAutoTimer);
          state.roomAutoTimer = 0;
          await roomAutoPublishNext();
        }
      }
    }, 500);

    // Return on gap expiry if admin was away
    if (state.autoPublish.active && !state.autoPublish.paused && state.autoPublish.gapEndTime && Date.now() >= state.autoPublish.gapEndTime) {
      await roomAutoPublishNext();
    }
  }

  async function renderQuestionsTab(host, state, source) {
    const roomId = state.roomId;
    if (!roomId) {
      host.innerHTML = '<div class="hg-empty">Select a room from the Host tab first.</div>';
      return;
    }
    const room = state.rooms[roomId];
    if (!room) { state.roomId = ""; await renderHostDashboard(host, state, source); return; }
    const questions = Object.entries(room.questions || {}).filter(([, q]) => !q?.deleted).sort((a, b) => Number(a[1]?.questionNumber) - Number(b[1]?.questionNumber));
    host.innerHTML = `
      <div class="hg-room-heading"><div><h4>${escapeHTML(room.name || "Quiz Room")}</h4><p>${escapeHTML(room.description || room.month || "No description")}</p></div></div>
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
      </article>`).join("")}</div>` : '<div class="hg-empty">No questions in this room yet.</div>'}`;

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
        const question = { text: questionForm.elements.text.value.trim(), type, points, timeLimit, options, correctAnswer, explanation: questionForm.elements.explanation.value.trim(), imageUrl, audioUrl };
        if (editingId) {
          await HangoutAdminRepository.updateQuestion(roomId, questionId, question);
          showToast("Question updated as a draft.", "success");
        } else {
          const questionNumber = await HangoutAdminRepository.addQuestion(roomId, questionId, question);
          showToast(`Question #${questionNumber} saved as a draft.`, "success");
        }
        await renderQuestionsTab(host, state, source);
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
        await renderQuestionsTab(host, state, source);
      } catch (error) {
        console.error("Quiz question could not be deleted:", error);
        showToast(error.message || "Could not delete this question.", "error");
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
        await renderQuestionsTab(host, state, source);
      } catch (error) {
        console.error("Quiz question could not go live:", error);
        showToast(error.message || "Could not publish this question.", "error");
      } finally { button.disabled = false; }
    }));
  }

  async function renderRoomManager(host, state, roomId) {
    const room = state.rooms[roomId];
    if (!room) { state.roomId = ""; renderRooms(host, state); return; }
    const activeQuiz = await HangoutAdminRepository.getCurrentQuiz();
    clearInterval(state.roomAutoTimer);
    state.roomAutoTimer = 0;
    clearInterval(state.roomRevealTimer);
    state.roomRevealTimer = 0;
    await loadAutoPublish();
    const questions = Object.entries(room.questions || {}).filter(([, question]) => !question?.deleted).sort((a, b) => Number(a[1]?.questionNumber) - Number(b[1]?.questionNumber));
    host.innerHTML = `<button type="button" class="hg-back-btn" data-act="back-rooms"><i class="fa-solid fa-arrow-left"></i> All rooms</button>
      <div class="hg-room-heading"><div><h4>${escapeHTML(room.name || "Quiz Room")}</h4><p>${escapeHTML(room.description || room.month || "No description")}</p></div>
      <label class="hg-form hg-room-status-wrap">Room status<select class="hg-room-status">${room.status === "live" ? '<option value="live" selected disabled>Live</option>' : ""}<option value="draft" ${room.status === "draft" ? "selected" : ""} ${room.status === "live" ? "disabled" : ""}>Draft</option><option value="ready" ${room.status === "ready" ? "selected" : ""} ${room.status === "live" ? "disabled" : ""}>Ready</option><option value="completed" ${room.status === "completed" ? "selected" : ""}>Completed</option></select><button type="button" class="hg-btn is-danger hg-room-end-quiz" data-room-act="end-quiz" ${room.status !== "live" ? "disabled" : ""}>End Quiz</button></label></div>
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
      ${questions.length ? `<div class="hg-auto-publish-room">
        <h4>Auto Publish</h4>
        <label>Start From<select name="roomAutoStartFrom">${questions.map(([, q], i) => `<option value="${i + 1}" ${i + 1 === state.autoPublish.startFrom ? "selected" : ""}>#${String(q.questionNumber || i + 1).padStart(2, "0")}</option>`).join("")}</select></label>
        <div class="hg-auto-actions">
          <button type="button" class="hg-btn" data-room-auto="start" ${!questions.length || state.autoPublish.active ? "disabled" : ""}>Auto Start</button>
          <button type="button" class="hg-btn is-light" data-room-auto="pause" ${!state.autoPublish.active || state.autoPublish.paused ? "disabled" : ""}>Pause Auto</button>
          <button type="button" class="hg-btn is-light" data-room-auto="resume" ${!state.autoPublish.active || !state.autoPublish.paused ? "disabled" : ""}>Resume Auto</button>
        </div>
        <div class="hg-room-auto-gap" data-room-auto-gap>${(state.autoPublish.active && !state.autoPublish.paused && state.autoPublish.gapEndTime) ? `Next Question will appear in <strong>${Math.max(0, Math.ceil((state.autoPublish.gapEndTime - Date.now()) / 1000))}</strong> sec` : ""}</div>
      </div>` : ''}</div>`;

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

    host.querySelector('[name="roomAutoStartFrom"]').addEventListener("change", async event => {
      const idx = Number(event.target.value) - 1;
      state.autoPublish.startFrom = Number(event.target.value) || 1;
      state.autoPublish.currentIndex = idx < 0 ? 0 : idx;
      await roomStopAutoPublish();
      await renderRoomManager(host, state, roomId);
    });

    host.querySelectorAll("[data-room-auto]").forEach(button => button.addEventListener("click", async () => {
      button.disabled = true;
      try {
        switch (button.dataset.roomAuto) {
          case "start":
            state.autoPublish.active = true;
            state.autoPublish.paused = false;
            state.autoPublish.currentIndex = state.autoPublish.startFrom - 1;
            if (activeQuiz && activeQuiz.status === "revealed" && activeQuiz.questionId && activeQuiz.roomId === roomId) {
              state.autoPublish.lastRevealedQuestionId = activeQuiz.questionId;
              await roomStartAutoGap();
              await renderRoomManager(host, state, roomId);
            } else {
              await roomAutoPublishNext();
            }
            break;
          case "pause":
            state.autoPublish.paused = true;
            clearInterval(state.autoPublish.gapTimerId);
            state.autoPublish.gapTimerId = 0;
            roomAutoGapDisplay();
            await saveAutoPublish();
            showToast("Auto publish paused.", "success");
            break;
          case "resume":
            state.autoPublish.paused = false;
            if (state.autoPublish.lastRevealedQuestionId && !state.autoPublish.gapTimerId) {
              await roomStartAutoGap();
            }
            await saveAutoPublish();
            showToast("Auto publish resumed.", "success");
            break;
        }
        await renderRoomManager(host, state, roomId);
      } catch (error) {
        console.error("Room auto publish failed:", error);
        showToast(error.message || "Could not update auto publish.", "error");
      } finally {
        if (button.isConnected) button.disabled = false;
      }
    }));

    // ---- Room-level auto-publish helpers (reuse same publish logic) ----
    const roomAutoGapDisplay = () => {
      const el = host.querySelector("[data-room-auto-gap]");
      if (!el) return;
      if (!state.autoPublish.active || state.autoPublish.paused) { el.textContent = ""; return; }
      const remaining = Math.max(0, Math.ceil((state.autoPublish.gapEndTime - Date.now()) / 1000));
      el.innerHTML = remaining > 0 ? `Next Question will appear in <strong>${remaining}</strong> sec` : "";
    };

    const roomStopAutoPublish = async () => {
      state.autoPublish.active = false;
      state.autoPublish.paused = false;
      state.autoPublish.gapEndTime = 0;
      clearInterval(state.autoPublish.gapTimerId);
      state.autoPublish.gapTimerId = 0;
      roomAutoGapDisplay();
      await saveAutoPublish();
      await clearAutoPublishFirebase();
    };

    const roomStartAutoGap = async () => {
      state.autoPublish.gapEndTime = Date.now() + state.autoPublish.gapSeconds * 1000;
      clearInterval(state.autoPublish.gapTimerId);
      state.autoPublish.gapTimerId = 0;
      roomAutoGapDisplay();
      await saveAutoPublish();
      try {
        const db = dbRef();
        if (db) await db.child("nextPublishAt").set(state.autoPublish.gapEndTime);
      } catch {}
    };

    const roomAutoPublishNext = async () => {
      const idx = state.autoPublish.currentIndex;
      const [questionId] = questions[idx] || [];
      if (!questionId) {
        await roomStopAutoPublish();
        showToast("All questions have been published.", "success");
        await renderRoomManager(host, state, roomId);
        return;
      }
      try {
        await HangoutAdminRepository.publishQuestion(roomId, questionId);
        state.autoPublish.currentIndex = idx + 1;
        state.autoPublish.lastRevealedQuestionId = "";
        await saveAutoPublish();
        try {
          const db = dbRef();
          if (db) await db.child("nextPublishAt").remove();
        } catch {}
        await renderRoomManager(host, state, roomId);
      } catch (error) {
        console.error("Room auto publish next failed:", error);
        await roomStopAutoPublish();
        showToast(error.message || "Auto publish stopped.", "error");
      }
    };

    // Local loop: publish next question when the 10-second gap ends.
    state.roomAutoTimer = setInterval(async () => {
      if (!state.autoPublish.active || state.autoPublish.paused || !state.autoPublish.gapEndTime) return;
      const remaining = Math.max(0, Math.ceil((state.autoPublish.gapEndTime - Date.now()) / 1000));
      roomAutoGapDisplay();
      if (remaining <= 0) {
        clearInterval(state.roomAutoTimer);
        state.roomAutoTimer = 0;
        await roomAutoPublishNext();
      }
    }, 1000);

    // If admin was away and the gap expired, publish the next question immediately on return.
    if (state.autoPublish.active && !state.autoPublish.paused && state.autoPublish.gapEndTime && Date.now() >= state.autoPublish.gapEndTime) {
      await roomAutoPublishNext();
    }

    // ---- Reveal on time expiry (replaces what was previously in renderQuizControl) ----
    const roomRemainingTime = quiz => {
      if (quiz?.status === "paused") return Math.max(0, Number(quiz.remainingMs) || 0);
      if (["revealed", "completed"].includes(quiz?.status)) return 0;
      const duration = quiz?.remainingMs == null ? Number(quiz?.timeLimit) * 1000 : Number(quiz.remainingMs);
      const startedAt = Number(quiz?.startedAt);
      if (!Number.isFinite(duration) || !Number.isFinite(startedAt)) return 0;
      return Math.max(0, duration - (Date.now() + state.serverTimeOffset - startedAt));
    };

    let roomRevealTimer = 0;
    const roomRevealActiveQuiz = async () => {
      if (!state.autoPublish.active || !activeQuiz || activeQuiz.roomId !== roomId) return;
      if (activeQuiz.status !== "live") return;
      const left = roomRemainingTime(activeQuiz);
      if (left > 0) return;
      clearInterval(roomRevealTimer);
      roomRevealTimer = 0;
      try {
        state.revealingFor = `${activeQuiz.roomId}/${activeQuiz.questionId}`;
        await HangoutAdminRepository.revealQuestion(activeQuiz.roomId, activeQuiz.questionId);
        state.revealingFor = "";
        await renderRoomManager(host, state, roomId);
        if (state.autoPublish.active && !state.autoPublish.paused) {
          state.autoPublish.lastRevealedQuestionId = activeQuiz.questionId;
          await roomStartAutoGap();
          await renderRoomManager(host, state, roomId);
        }
      } catch (error) {
        console.error("Room reveal-on-timeout failed:", error);
        state.revealingFor = "";
        showToast(error.message || "Time ended, but the answer could not be revealed.", "error");
      }
    };

    state.roomRevealTimer = setInterval(roomRevealActiveQuiz, 500);

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

  return Object.freeze({ open });
}
})();
