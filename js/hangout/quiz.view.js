// ONLINE QUIZ — screen layout, question area, scoreboard, profile (UI only).
// Layout rule: the Question Area is built once and has a fixed height. Only the
// panel below it (Quiz/Chat, Score Board, More, Profile) is switched, using
// show/hide — so the question is never re-rendered when the tab changes, and
// the chat keeps its messages and scroll position.
// Data comes from HangoutRepository, rules from HangoutService, Google login
// from HangoutAuth. Chat is in quiz-chat.view.js, admin in quiz-admin.view.js.
(() => {
  let container = null, ctx = null, stops = [], stopAuth = null, answerStop = null, chat = null;
  let questionTimer = 0, revealTimeout = 0, scheduleTimer = 0, authLoadingTimer = 0;
  let screenshotGuardRoot = null, screenshotGuardTimer = 0;
  let stopServerTime = null;
  let screenWakeLock = null, screenWakeLockRequest = 0, screenWakeLockPending = false;
  let observedQuestionKey = null, latestQuestionPublishedAt = "", alertAudioContext = null, alertUnlockContainer = null;
  let answerQuestionKey = "", answerTimerKey = "", answerDraftKey = "", answerSyncKey = "";
  let answerDraft = null, answerSubmissionKey = "";
  let lastQuizKey = null, scoreTimer = 0, panel = "quiz", exitFn = () => {};
  let selectedResultId = "";
  let selectedHistoryRoomId = "";
  const data = { users: {}, scores: {}, publicResults: {}, quizHistory: {}, quizHistoryLoaded: false, quizHistoryError: null, quiz: null, nextQuiz: null, log: {}, answer: null, reveal: null, revealError: false, timeExpired: false, scoreSyncPending: false };

  const $ = selector => container?.querySelector(selector);

  // ---------- mount / unmount ----------
  function mount(el, options) {
    container = el;
    exitFn = options.exit;
    container.innerHTML = '<div class="hg-auth-loading" role="status"><i class="fa-solid fa-spinner fa-spin" aria-hidden="true"></i><span>Restoring quiz session…</span></div>';
    authLoadingTimer = window.setTimeout(() => {
      authLoadingTimer = 0;
      if (container && !ctx && !container.querySelector(".hg-login")) handleAuth(null);
    }, 13000);
    prepareAlertAudioUnlock();
    unlockAlertAudio();
    stopAuth = HangoutAuth.onChange(handleAuth);
  }

  function unmount() {
    teardown();
    removeAlertAudioUnlock();
    if (stopAuth) { stopAuth(); stopAuth = null; }
    container = null;
  }

  function teardown() {
    clearTimeout(authLoadingTimer);
    authLoadingTimer = 0;
    if (container) {
      ["copy", "cut", "contextmenu", "selectstart"].forEach(type => container.removeEventListener(type, protectQuestionText));
    }
    window.removeEventListener("keydown", guardPrintScreen, true);
    clearTimeout(screenshotGuardTimer);
    screenshotGuardTimer = 0;
    screenshotGuardRoot?.classList.remove("is-screenshot-guard");
    screenshotGuardRoot = null;
    stops.forEach(stop => { try { stop(); } catch (error) { /* already stopped */ } });
    stops = [];
    if (answerStop) { answerStop(); answerStop = null; }
    if (stopServerTime) { stopServerTime(); stopServerTime = null; }
    clearInterval(questionTimer);
    clearInterval(scheduleTimer);
    questionTimer = 0;
    scheduleTimer = 0;
    clearTimeout(revealTimeout);
    revealTimeout = 0;
    answerQuestionKey = ""; answerTimerKey = ""; answerDraftKey = ""; answerSyncKey = ""; answerDraft = null; answerSubmissionKey = "";
    data.scoreSyncPending = false;
    clearTimeout(scoreTimer);
    if (chat) { chat.unmount(); chat = null; }
    document.removeEventListener("visibilitychange", handleWakeLockVisibilityChange);
    releaseScreenWakeLock();
    ctx = null; lastQuizKey = null; observedQuestionKey = null; latestQuestionPublishedAt = "";
    data.users = {}; data.scores = {}; data.publicResults = {}; data.quizHistory = {}; data.quizHistoryLoaded = false; data.quizHistoryError = null; data.quiz = null; data.nextQuiz = null; data.log = {}; data.answer = null;
    data.reveal = null; data.revealError = false; data.timeExpired = false;
    selectedHistoryRoomId = "";
    panel = "quiz";
  }

  function handleAuth(profile) {
    if (!container) return;
    clearTimeout(authLoadingTimer);
    authLoadingTimer = 0;
    if (!profile) { teardown(); renderLogin(); return; }
    if (ctx && ctx.user.uid === profile.uid) return;
    teardown();
    ctx = { user: profile };
    buildQuiz();
  }

  // ---------- login gate ----------
  function renderLogin() {
    container.innerHTML = `
      <div class="hg-quiz">
        <header class="hg-qheader"><strong>Online Quiz</strong><span class="hg-month"></span><button type="button" class="hg-exit" data-act="exit">EXIT</button></header>
        <div class="hg-login">
          <div class="hg-login-card">
            <i class="fa-solid fa-circle-question hg-login-icon"></i>
            <h3>Sign in to play</h3>
            <p>Use your Google account to join the quiz and chat.</p>
            <button type="button" class="hg-google-btn" data-act="google"><i class="fa-brands fa-google"></i> Continue with Google</button>
            <div class="hg-login-error" role="alert"></div>
          </div>
        </div>
      </div>`;
    container.querySelector(".hg-month").textContent = HangoutService.monthLabel();
    container.querySelector('[data-act="exit"]').addEventListener("click", () => exitFn());
    const button = container.querySelector('[data-act="google"]');
    const error = container.querySelector(".hg-login-error");
    button.addEventListener("click", async () => {
      button.disabled = true; error.textContent = "";
      try { await HangoutAuth.signIn(); }
      catch (signInError) { console.error("Hangout Google sign-in failed:", signInError); error.textContent = HangoutAuth.errorMessage(signInError); }
      finally { button.disabled = false; }
    });
  }

  // ---------- quiz screen ----------
  function buildQuiz() {
    stopServerTime = HangoutFirebase.watchServerTime();
    document.addEventListener("visibilitychange", handleWakeLockVisibilityChange);
    container.innerHTML = `
      <div class="hg-quiz">
        <header class="hg-qheader">
          <strong>Online Quiz</strong>
          <span class="hg-month" id="hgMonth"></span>
          <button type="button" class="hg-icon-btn hg-admin-btn" data-act="admin" aria-label="Admin controls" hidden><i class="fa-solid fa-gear"></i></button>
          <button type="button" class="hg-exit" data-act="exit">EXIT</button>
        </header>
        <section class="hg-question" id="hgQuestion" aria-live="polite"></section>
        <div class="hg-body">
          <section class="hg-panel" data-panel="quiz"></section>
          <section class="hg-panel" data-panel="score" hidden></section>
          <section class="hg-panel" data-panel="more" hidden></section>
          <section class="hg-panel" data-panel="profile" hidden></section>
        </div>
        <nav class="hg-nav" aria-label="Quiz navigation">
          <button type="button" data-nav="quiz" class="is-active"><i class="fa-solid fa-circle-question"></i><span>Quiz</span></button>
          <button type="button" data-nav="score"><i class="fa-solid fa-ranking-star"></i><span>Score Board</span></button>
          <button type="button" data-nav="more"><i class="fa-solid fa-ellipsis"></i><span>More</span></button>
          <button type="button" data-nav="profile"><i class="fa-solid fa-user"></i><span>Profile</span></button>
        </nav>
      </div>`;

    ["copy", "cut", "contextmenu", "selectstart"].forEach(type => container.addEventListener(type, protectQuestionText));
    window.addEventListener("keydown", guardPrintScreen, true);
    container.querySelector('[data-act="exit"]').addEventListener("click", () => exitFn());
    container.querySelector('[data-act="admin"]').addEventListener("click", () => HangoutQuizAdmin.open({
      users: () => data.users, scores: () => data.scores, quiz: () => data.quiz
    }));
    container.querySelector(".hg-nav").addEventListener("click", event => {
      const button = event.target.closest("[data-nav]");
      if (button) setPanel(button.dataset.nav);
    });
    $('[data-panel="more"]').addEventListener("click", event => {
      if (event.target.closest("[data-history-back]")) {
        selectedHistoryRoomId = "";
        renderMore();
        return;
      }
      const room = event.target.closest("[data-history-room]");
      if (room) {
        selectedHistoryRoomId = room.dataset.historyRoom;
        renderMore();
      }
    });

    ctx.users = () => data.users;
    ctx.isQuizAdmin = () => HangoutAdminRepository.isQuizAdmin();
    refreshAdminButton();
    renderQuestion(null);
    renderMore();
    chat = HangoutQuizChat.mount($('[data-panel="quiz"]'), ctx);

    HangoutRepository.saveOwnProfile(ctx.user).catch(error => {
      console.error("Hangout profile save failed:", error);
      showToast("Could not save your profile. Check your connection.", "error");
    });
    stops.push(
      HangoutRepository.subscribeQuiz(quiz => {
        const cleanQuiz = HangoutService.cleanQuiz(quiz);
      syncScreenWakeLock(cleanQuiz);
      const questionKey = cleanQuiz.roomId && cleanQuiz.questionId ? `${cleanQuiz.roomId}/${cleanQuiz.questionId}` : "";
        const publishedAt = String(cleanQuiz.publishedAt || "");
        const isFirstPublication = publishedAt && (!latestQuestionPublishedAt || publishedAt > latestQuestionPublishedAt);
        if (observedQuestionKey !== null && questionKey && questionKey !== observedQuestionKey
          && cleanQuiz.status === "live" && isFirstPublication) {
          vibrate([12, 36, 12]);
          playNewQuestionAlert();
        }
        if (isFirstPublication) latestQuestionPublishedAt = publishedAt;
        observedQuestionKey = questionKey;
        data.quiz = quiz;
        watchOwnAnswer(quiz);
        renderQuestion(quiz);
      }),
      HangoutRepository.subscribeNextQuiz(nextQuiz => {
        data.nextQuiz = nextQuiz;
        lastQuizKey = null;
        renderQuestion(data.quiz);
      }),
      HangoutRepository.subscribeUsers(users => { data.users = users; chat?.refreshAvatars(); scheduleScoreRender(); }),
      HangoutRepository.subscribeScores(scores => { data.scores = scores; scheduleScoreRender(); }),
      HangoutRepository.subscribePublicResults(results => { data.publicResults = results; scheduleScoreRender(); }),
      HangoutRepository.subscribeOwnQuizHistory(ctx.user.uid, history => {
        data.quizHistory = history;
        data.quizHistoryLoaded = true;
        data.quizHistoryError = null;
        if (panel === "more") renderMore();
      }, error => {
        data.quizHistoryError = error;
        data.quizHistoryLoaded = true;
        if (panel === "more") renderMore();
      }),
      HangoutRepository.subscribeScoreLog(ctx.user.uid, log => { data.log = log; if (panel === "profile") renderProfile(); })
    );
    scheduleTimer = window.setInterval(() => {
      if (!["live", "paused", "revealed"].includes(HangoutService.cleanQuiz(data.quiz).status)) renderQuestion(data.quiz);
    }, 1000);
  }

  function protectQuestionText(event) {
    const target = event.target instanceof Element ? event.target : null;
    if (!target?.closest(".hg-question") || target.closest("input, textarea, [contenteditable='true']")) return;
    event.preventDefault();
  }

  function guardPrintScreen(event) {
    if ((event.key !== "PrintScreen" && event.keyCode !== 44) || !$("#hgQuestion")) return;
    screenshotGuardRoot = container.closest(".hg-root");
    if (!screenshotGuardRoot) return;
    screenshotGuardRoot.classList.add("is-screenshot-guard");
    clearTimeout(screenshotGuardTimer);
    screenshotGuardTimer = window.setTimeout(() => {
      screenshotGuardRoot?.classList.remove("is-screenshot-guard");
      screenshotGuardRoot = null;
      screenshotGuardTimer = 0;
    }, 1500);
  }

  function prepareAlertAudioUnlock() {
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (!AudioContext || !container) return;
    alertUnlockContainer = container;
    container.addEventListener("pointerdown", unlockAlertAudio);
    container.addEventListener("keydown", unlockAlertAudio);
  }

  function removeAlertAudioUnlock() {
    if (!alertUnlockContainer) return;
    alertUnlockContainer.removeEventListener("pointerdown", unlockAlertAudio);
    alertUnlockContainer.removeEventListener("keydown", unlockAlertAudio);
    alertUnlockContainer = null;
  }

  function unlockAlertAudio() {
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (!AudioContext) return;
    try {
      if (!alertAudioContext) alertAudioContext = new AudioContext();
      if (alertAudioContext.state === "suspended") {
        alertAudioContext.resume().then(() => {
          if (alertAudioContext?.state === "running") removeAlertAudioUnlock();
        }).catch(error => console.warn("Quiz question alert audio could not be enabled:", error));
      } else if (alertAudioContext.state === "running") removeAlertAudioUnlock();
    } catch (error) {
      console.warn("Quiz question alert audio could not be enabled:", error);
    }
  }

  function playNewQuestionAlert() {
    if (!alertAudioContext || alertAudioContext.state !== "running") {
      console.warn("Quiz question alert was not played because audio is not enabled in this browser session.");
      return;
    }
    try {
      const context = alertAudioContext;
      const start = context.currentTime + 0.03;
      const master = context.createGain();
      master.gain.setValueAtTime(0.035, start);
      master.gain.setValueAtTime(0.035, start + 4.65);
      master.gain.exponentialRampToValueAtTime(0.0001, start + 4.95);
      master.connect(context.destination);
      [659.25, 783.99, 987.77, 783.99, 987.77, 1174.66].forEach((frequency, index) => {
        const noteStart = start + index * 0.8;
        const noteEnd = noteStart + 0.62;
        const oscillator = context.createOscillator();
        const envelope = context.createGain();
        oscillator.type = "sine";
        oscillator.frequency.setValueAtTime(frequency, noteStart);
        envelope.gain.setValueAtTime(0.0001, noteStart);
        envelope.gain.exponentialRampToValueAtTime(0.8, noteStart + 0.035);
        envelope.gain.exponentialRampToValueAtTime(0.0001, noteEnd);
        oscillator.connect(envelope);
        envelope.connect(master);
        oscillator.start(noteStart);
        oscillator.stop(noteEnd + 0.01);
      });
      master.gain.setValueAtTime(0, start + 5);
      window.setTimeout(() => master.disconnect(), 5200);
    } catch (error) {
      console.warn("Quiz question alert could not be played:", error);
    }
  }

  function vibrate(pattern) {
    try {
      if (typeof navigator.vibrate === "function") navigator.vibrate(pattern);
    } catch {}
  }

  function releaseScreenWakeLock() {
    screenWakeLockRequest += 1;
    screenWakeLockPending = false;
    const lock = screenWakeLock;
    screenWakeLock = null;
    if (!lock) return;
    try { lock.release().catch(() => {}); } catch {}
  }

  function syncScreenWakeLock(quiz = data.quiz) {
    const active = quiz?.status === "live" && Boolean(quiz.questionId);
    if (!active || document.visibilityState !== "visible") {
      releaseScreenWakeLock();
      return;
    }
    const wakeLock = navigator.wakeLock;
    if (screenWakeLock || screenWakeLockPending || !wakeLock || typeof wakeLock.request !== "function") return;
    const requestId = ++screenWakeLockRequest;
    screenWakeLockPending = true;
    try {
      wakeLock.request("screen").then(lock => {
        if (requestId === screenWakeLockRequest) screenWakeLockPending = false;
        if (requestId !== screenWakeLockRequest || document.visibilityState !== "visible"
          || data.quiz?.status !== "live" || !data.quiz.questionId) {
          lock.release().catch(() => {});
          return;
        }
        screenWakeLock = lock;
        lock.addEventListener("release", () => {
          if (screenWakeLock === lock) screenWakeLock = null;
        }, { once: true });
      }).catch(() => {
        if (requestId === screenWakeLockRequest) screenWakeLockPending = false;
      });
    } catch {
      screenWakeLockPending = false;
    }
  }

  function handleWakeLockVisibilityChange() {
    if (document.visibilityState === "hidden") releaseScreenWakeLock();
    else syncScreenWakeLock(data.quiz);
  }

  function refreshAdminButton() {
    const button = $('[data-act="admin"]');
    if (button) button.hidden = !HangoutAdminRepository.isQuizAdmin();
  }

  function setPanel(name, fromHistory = false) {
    if (!["quiz", "score", "more", "profile"].includes(name) || name === panel) return;
    if (!fromHistory) {
      history.pushState({
        ...history.state,
        hangout: "quiz",
        hangoutTab: name,
        hangoutTabDepth: (Number(history.state?.hangoutTabDepth) || 0) + 1
      }, "", location.pathname + location.search + "#hangout");
    }
    panel = name;
    container.querySelectorAll("[data-nav]").forEach(b => b.classList.toggle("is-active", b.dataset.nav === name));
    container.querySelectorAll("[data-panel]").forEach(p => {
      p.classList.remove("is-entering");
      p.hidden = p.dataset.panel !== name;
    });
    const activePanel = container.querySelector(`[data-panel="${name}"]`);
    if (activePanel) requestAnimationFrame(() => activePanel.classList.add("is-entering"));
    refreshAdminButton();
    if (name === "quiz") chat?.onShow();
    if (name === "score") renderScore();
    if (name === "more") renderMore();
    if (name === "profile") renderProfile();
  }

  // ---------- question area (never touched when switching tabs) ----------
  function watchOwnAnswer(raw) {
    const quiz = HangoutService.cleanQuiz(raw);
    const activeStatus = ["live", "paused", "revealed", "completed"].includes(quiz.status);
    const identity = activeStatus && quiz.roomId && quiz.questionId
      ? `${quiz.roomId}/${quiz.questionId}/${ctx.user.uid}` : "";
    if (identity !== answerQuestionKey) {
      if (answerStop) { answerStop(); answerStop = null; }
      answerQuestionKey = identity;
      data.answer = null;
      data.reveal = null;
      data.revealError = false;
      data.timeExpired = false;
      data.scoreSyncPending = false;
      answerDraft = null;
      answerDraftKey = "";
      answerSyncKey = "";
      lastQuizKey = null;
      if (identity) {
        answerStop = HangoutRepository.subscribeOwnAnswer(quiz.roomId, quiz.questionId, ctx.user.uid, answer => {
          data.answer = answer;
          if (answerSubmissionKey !== identity) reconcileSavedAnswer(quiz, answer, identity);
          renderQuestion(data.quiz);
        });
      }
    }

    const timerKey = ["live", "paused"].includes(quiz.status) && quiz.timeLimit
      ? `${identity}/${quiz.status}/${quiz.startedAt}/${quiz.remainingMs}` : "";
    if (timerKey === answerTimerKey) return;
    answerTimerKey = timerKey;
    clearInterval(questionTimer);
    questionTimer = 0;
    clearTimeout(revealTimeout);
    revealTimeout = 0;
    lastQuizKey = null;
    if (timerKey) startQuestionTimer(quiz);
  }

  const answerIdentity = quiz => `${quiz.roomId}/${quiz.questionId}/${ctx.user.uid}`;

  function reconcileSavedAnswer(quiz, answer, identity) {
    if (quiz.type === "short" || !answer?.answer) return;
    const syncKey = `${identity}/${answer.answer}`;
    if (syncKey === answerSyncKey) return;
    answerSyncKey = syncKey;
    HangoutAdminRepository.submitAnswer(quiz, ctx.user, answer.answer).then(() => {
      if (answerQuestionKey === identity && data.scoreSyncPending) {
        data.scoreSyncPending = false;
        lastQuizKey = null;
        renderQuestion(data.quiz);
      }
    }).catch(error => {
      console.error("Saved quiz answer could not be fully synchronized:", error);
      if (answerQuestionKey === identity) {
        data.scoreSyncPending = true;
        lastQuizKey = null;
        renderQuestion(data.quiz);
      }
    });
  }

  function startQuestionTimer(initialQuiz) {
    const update = () => {
      const quiz = HangoutService.cleanQuiz(data.quiz || initialQuiz);
      if (!["live", "paused"].includes(quiz.status) || !quiz.timeLimit) { clearInterval(questionTimer); return; }
      const left = quiz.status === "paused"
        ? Number(quiz.remainingMs) || 0
        : (quiz.remainingMs == null ? quiz.timeLimit * 1000 : quiz.remainingMs) - (HangoutFirebase.now() - Number(quiz.startedAt || 0));
      const countdown = $("#hgQuestion [data-player-countdown]");
      if (countdown) countdown.textContent = formatPlayerCountdown(left);
      if (quiz.status === "live" && left <= 0 && !data.timeExpired) {
        data.timeExpired = true;
        lastQuizKey = null;
        renderQuestion(data.quiz);
        clearInterval(questionTimer);
        revealTimeout = window.setTimeout(() => revealTimedOutAnswer(quiz), 1000);
      }
    };
    update();
    questionTimer = setInterval(update, 250);
  }

  function renderQuestion(raw) {
    const quiz = HangoutService.cleanQuiz(raw);
    const nextStartsAt = Number(data.nextQuiz?.startsAt) || 0;
    const nextCountdown = nextStartsAt ? Math.max(0, Math.ceil((nextStartsAt - HangoutFirebase.now()) / 1000)) : null;
    const key = JSON.stringify([quiz, data.answer, data.reveal, data.timeExpired, data.revealError, data.nextQuiz, nextCountdown]);
    const month = $("#hgMonth");
    if (month) month.textContent = quiz.monthLabel ? formatHistoryMonth(quiz.monthLabel) : HangoutService.monthLabel();
    if (key === lastQuizKey) return;
    lastQuizKey = key;
    const area = $("#hgQuestion");
    if (!area) return;
    if (quiz.status === "completed") {
      area.innerHTML = renderNextQuizState(true, nextStartsAt, nextCountdown);
      return;
    }
    if (!quiz.questionId && data.nextQuiz) {
      area.innerHTML = renderNextQuizState(false, nextStartsAt, nextCountdown);
      return;
    }
    const hasLegacyQuestion = quiz.title || quiz.text || quiz.imageUrl;
    if (!quiz.status && !hasLegacyQuestion) {
      area.innerHTML = '<div class="hg-question-empty"><i class="fa-solid fa-hourglass-half"></i><span>No question yet.<br>Please wait for the admin.</span></div>';
      return;
    }
    const roomQuestion = quiz.questionId && ["live", "paused", "revealed", "completed"].includes(quiz.status);
    const liveQuestion = quiz.status === "live" && quiz.questionId;
    const showTimer = ["live", "paused"].includes(quiz.status) && quiz.timeLimit;
    const roomTitle = quiz.roomName || quiz.title || "Online Quiz";
    const timer = showTimer
      ? `<div class="hg-player-timer ${quiz.status === "paused" ? "is-paused" : ""}"><strong data-player-countdown>${formatPlayerCountdown(quiz.status === "paused" ? quiz.remainingMs || 0 : remainingQuestionTime(quiz))}</strong></div>`
      : "";
    const questionHeader = roomQuestion
      ? `<div class="hg-question-header"><strong class="hg-question-room" title="${escapeHTML(roomTitle)}">${escapeHTML(roomTitle)}</strong><div class="hg-question-badges"><span>Question #${quiz.questionNumber}</span><span>${quiz.points} Points</span></div>${timer}</div>`
      : timer ? `<div class="hg-question-header is-timer-only">${timer}</div>` : "";
    const questionTitle = quiz.title && (!roomQuestion || quiz.title !== roomTitle) ? `<h3>${escapeHTML(quiz.title)}</h3>` : "";
    const submitted = roomQuestion && data.answer;
    const evaluation = submitted?.evaluation;
    const reveal = quiz.answerRevealed ? { correctAnswer: quiz.correctAnswer, explanation: quiz.explanation } : data.reveal;
    let response = "";
    if (submitted) {
      response = `<div class="hg-answer-status">${evaluation
        ? `${evaluation.result === "correct" ? "Correct" : "Wrong"} · ${Number(evaluation.points) || 0} points`
        : quiz.type === "short" ? "Answer received. An admin will evaluate it." : "Answer submitted."}${data.scoreSyncPending ? '<button type="button" class="hg-link-btn" data-act="retry-score-sync">Retry score sync</button>' : ""}</div>`;
    } else if (quiz.status === "paused") {
      response = '<div class="hg-answer-status">Quiz paused. The timer is paused too.</div>';
    } else if (liveQuestion && data.timeExpired) {
      response = `<div class="hg-answer-status">Time is up.${data.revealError ? ' <button type="button" class="hg-link-btn" data-act="retry-reveal">Retry answer reveal</button>' : " Revealing the correct answer…"}</div>`;
    } else if (liveQuestion && quiz.type) {
      const options = quiz.options.map(option => `<label class="hg-answer-option"><input type="radio" name="hgAnswer" value="${escapeHTML(option.id)}" required><span>${escapeHTML(option.text)}</span></label>`).join("");
      response = `<form class="hg-player-answer" data-answer-form>
        ${quiz.type === "short"
          ? '<label class="hg-player-answer-label">Your answer<textarea name="answer" maxlength="1000" required></textarea></label>'
          : `<fieldset><legend>${quiz.type === "trueFalse" ? "Choose True or False" : "Choose an answer"}</legend>${options}</fieldset>`}
        <button type="submit" class="hg-btn">Submit answer</button>
      </form>`;
    }
    if (reveal) {
      const correctText = quiz.options.find(option => option.id === reveal.correctAnswer)?.text
        || (reveal.correctAnswer === "true" ? "True" : reveal.correctAnswer === "false" ? "False" : reveal.correctAnswer);
      response += `<div class="hg-answer-reveal"><strong>Correct answer:</strong> ${escapeHTML(correctText || "Manual evaluation")} ${quiz.points ? `<span>+${quiz.points} points</span>` : ""}${reveal.explanation ? `<p><strong>Explanation:</strong> ${escapeHTML(reveal.explanation)}</p>` : ""}</div>`;
    }
    const currentAnswerIdentity = quiz.roomId && quiz.questionId ? answerIdentity(quiz) : "";
    const currentForm = area.querySelector("[data-answer-form]");
    if (currentForm && currentAnswerIdentity) {
      answerDraftKey = currentAnswerIdentity;
      answerDraft = quiz.type === "short"
        ? { text: currentForm.elements.answer.value }
        : { option: currentForm.querySelector('[name="hgAnswer"]:checked')?.value || "" };
    }
    area.innerHTML = `${questionHeader}${questionTitle}${quiz.text ? `<p>${escapeHTML(quiz.text)}</p>` : ""}${quiz.imageUrl ? `<img src="${escapeHTML(quiz.imageUrl)}" alt="Quiz question image" referrerpolicy="no-referrer">` : ""}${quiz.audioUrl ? `<audio controls preload="metadata" src="${escapeHTML(quiz.audioUrl)}">Your browser does not support audio.</audio>` : ""}${response}`;
    const form = area.querySelector("[data-answer-form]");
    if (form) {
      if (answerDraftKey === currentAnswerIdentity && answerDraft) {
        if (quiz.type === "short") form.elements.answer.value = answerDraft.text || "";
        else {
          const selected = [...form.querySelectorAll('[name="hgAnswer"]')].find(option => option.value === answerDraft.option);
          if (selected) selected.checked = true;
        }
      }
      const saveDraft = () => {
        answerDraftKey = currentAnswerIdentity;
        answerDraft = quiz.type === "short"
          ? { text: form.elements.answer.value }
          : { option: form.querySelector('[name="hgAnswer"]:checked')?.value || "" };
      };
      form.addEventListener("input", saveDraft);
      form.addEventListener("change", event => {
        if (event.target instanceof HTMLInputElement && event.target.matches('[name="hgAnswer"]')) vibrate(10);
        saveDraft();
      });
      form.addEventListener("submit", async event => {
      event.preventDefault();
      const value = quiz.type === "short" ? form.elements.answer.value.trim() : form.querySelector('[name="hgAnswer"]:checked')?.value;
      if (!value) { showToast("Choose or enter an answer first.", "warning"); return; }
      if (data.timeExpired || (quiz.timeLimit && remainingQuestionTime(quiz) <= 0)) {
        data.timeExpired = true;
        lastQuizKey = null;
        renderQuestion(quiz);
        showToast("Time is up. Your answer wasn't submitted.", "warning");
        return;
      }
      const button = form.querySelector('[type="submit"]');
      button.disabled = true;
      vibrate(15);
      answerSubmissionKey = currentAnswerIdentity;
      try {
        const answer = await HangoutAdminRepository.submitAnswer(quiz, ctx.user, value);
        if (answerSubmissionKey === currentAnswerIdentity) answerSubmissionKey = "";
        data.answer = answer;
        answerDraft = null;
        answerDraftKey = "";
        data.scoreSyncPending = false;
        renderQuestion(quiz);
        if (!answer.historySaved) showToast("Answer submitted. Quiz history will sync after this question closes.", "warning");
        else if (quiz.type === "short") showToast("Answer submitted for manual evaluation.", "success");
        else showToast("Answer submitted.", "success");
      } catch (error) {
        if (answerSubmissionKey === currentAnswerIdentity) answerSubmissionKey = "";
        console.error("Quiz answer submission failed:", error);
        if (data.answer?.answer === value) reconcileSavedAnswer(quiz, data.answer, currentAnswerIdentity);
        if (error?.code === "SCORE_SYNC_PENDING") {
          data.scoreSyncPending = true;
          lastQuizKey = null;
          renderQuestion(data.quiz);
          showToast(error.message, "warning");
        } else {
          const currentQuiz = HangoutService.cleanQuiz(data.quiz);
          const timedOut = currentQuiz.status === "live" && currentQuiz.timeLimit
            && (data.timeExpired || remainingQuestionTime(currentQuiz) <= 0);
          showToast(timedOut ? "Time is up. Your answer wasn't submitted." : "Could not submit your answer. Please check your connection and try again.", "error");
          if (timedOut) {
            data.timeExpired = true;
            lastQuizKey = null;
            renderQuestion(currentQuiz);
          } else button.disabled = false;
        }
      }
      });
    }
    area.querySelector('[data-act="retry-score-sync"]')?.addEventListener("click", async event => {
      const button = event.currentTarget;
      button.disabled = true;
      try {
        const answer = await HangoutAdminRepository.submitAnswer(quiz, ctx.user, data.answer.answer);
        data.answer = answer;
        data.scoreSyncPending = false;
        lastQuizKey = null;
        renderQuestion(data.quiz);
        showToast("Answer and score sync completed.", "success");
      } catch (error) {
        console.error("Quiz score sync retry failed:", error);
        showToast(error.message || "Could not sync your score. Please try again.", "error");
        button.disabled = false;
      }
    });
    area.querySelector('[data-act="retry-reveal"]')?.addEventListener("click", () => {
      data.timeExpired = false;
      data.revealError = false;
      lastQuizKey = null;
      startQuestionTimer(quiz);
    });
    area.scrollTop = 0;
  }

  async function revealTimedOutAnswer(quiz) {
    const currentQuiz = HangoutService.cleanQuiz(data.quiz);
    if (currentQuiz.roomId !== quiz.roomId || currentQuiz.questionId !== quiz.questionId) return;
    try {
      const answerKey = await HangoutRepository.readTimedOutAnswerKey(quiz.roomId, quiz.questionId);
      if (!answerKey) throw new Error("The answer key is not available.");
      data.reveal = answerKey;
      data.revealError = false;
      renderQuestion(data.quiz);
    } catch (error) {
      console.error("Timed quiz answer could not be revealed:", error);
      data.revealError = true;
      renderQuestion(data.quiz);
    }
  }

  function remainingQuestionTime(quiz) {
    const duration = quiz.remainingMs == null ? quiz.timeLimit * 1000 : quiz.remainingMs;
    return Math.max(0, duration - (HangoutFirebase.now() - Number(quiz.startedAt || 0)));
  }

  const formatPlayerCountdown = milliseconds => {
    const seconds = Math.ceil(Math.max(0, milliseconds) / 1000);
    return `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
  };

  function renderNextQuizState(ended, startsAt, remainingSeconds) {
    const schedule = data.nextQuiz;
    const startIsDue = remainingSeconds === 0;
    const countdown = remainingSeconds == null ? "" : `${String(Math.floor(remainingSeconds / 3600)).padStart(2, "0")}:${String(Math.floor((remainingSeconds % 3600) / 60)).padStart(2, "0")}:${String(remainingSeconds % 60).padStart(2, "0")}`;
    const startsLabel = startsAt
      ? `${new Intl.DateTimeFormat([], { month: "long", day: "numeric" }).format(new Date(startsAt))} · ${new Intl.DateTimeFormat([], { hour: "2-digit", minute: "2-digit", hour12: true }).format(new Date(startsAt))}`
      : "";
    return `<div class="hg-question-next ${ended ? "is-ended" : ""}">
      ${ended ? "<h2>Quiz Ended!</h2>" : ""}
      ${ended || startIsDue ? "<p>Next Quiz will start soon. Please wait...</p>" : ""}
      ${schedule ? `<strong class="hg-next-title">${escapeHTML(schedule.roomName || "Next Quiz")}</strong><span>Next Quiz Starts In</span><strong class="hg-next-countdown">${countdown}</strong><span class="hg-next-date">${escapeHTML(startsLabel)}</span>` : `<span>${ended ? "The next quiz date and time will be announced soon." : "No quiz is scheduled yet. Please wait."}</span>`}
    </div>`;
  }

  // ---------- personal quiz history ----------
  function renderMore() {
    const host = $('[data-panel="more"]');
    if (!host || !ctx) return;
    const rooms = Object.entries(data.quizHistory || {})
      .filter(([, room]) => room?.questions && Object.keys(room.questions).length)
      .sort((a, b) => String(b[1]?.summary?.updatedAt || "").localeCompare(String(a[1]?.summary?.updatedAt || "")));
    const selected = rooms.find(([roomId]) => roomId === selectedHistoryRoomId);
    if (selected) {
      const [roomId, room] = selected;
      const summary = room.summary || {};
      const questions = Object.entries(room.questions || {})
        .sort((a, b) => Number(a[1]?.questionNumber) - Number(b[1]?.questionNumber));
      const pending = Number(summary.pending) || questions.filter(([, question]) => question?.status === "pending").length;
      const isFinal = summary.isFinal === true;
      const status = summary.status === "completed" ? "Completed"
        : summary.status === "evaluationPending" || pending ? "Evaluation Pending"
          : "In Progress";
      const score = isFinal ? `${Number(summary.totalScore) || 0} / ${Number(summary.maxScore) || 0}` : pending ? "Pending Evaluation" : "In Progress";
      const rank = isFinal ? HangoutService.rankLabel(Number(summary.rank) || 0) : pending ? "Pending" : "—";
      const details = questions.map(([, question]) => {
        const correct = question.status === "correct";
        const wrong = question.status === "wrong";
        const unanswered = question.status === "unanswered";
        const awarded = Number(question.awardedPoints) || 0;
        const state = correct ? `Correct · +${awarded || Number(question.questionPoints) || 0}`
          : wrong ? "Wrong · 0"
            : unanswered ? "Unanswered · 0"
              : question.type === "short" ? "Pending Evaluation" : "Awaiting result";
        return `<article class="hg-history-question">
          <div class="hg-history-question-head"><strong>Question ${String(Number(question.questionNumber) || 0).padStart(2, "0")}</strong><span class="${correct ? "is-correct" : wrong ? "is-wrong" : ""}">${escapeHTML(state)}</span></div>
          <p>${escapeHTML(question.questionText || "Question")}</p>
          <small>Your answer: ${escapeHTML(question.answer || (unanswered ? "No answer" : "—"))}</small>
          ${question.type === "short" && question.status === "pending"
            ? '<small class="hg-history-pending">Your submitted answer is awaiting Admin evaluation.</small>'
            : question.correctAnswer ? `<small>Correct answer: ${escapeHTML(question.correctAnswer)}</small>` : ""}
          ${question.evaluation?.evaluatedAt ? `<small>Evaluated: ${escapeHTML(formatHistoryDate(question.evaluation.evaluatedAt))}</small>` : ""}
          ${Object.values(question.evaluationHistory || {}).length
            ? `<small>Previous evaluations: ${Object.values(question.evaluationHistory).map(item => `${item.result === "correct" ? "Correct" : "Wrong"} · ${Number(item.points) || 0} pts · ${escapeHTML(formatHistoryDate(item.evaluatedAt))}`).join(" | ")}</small>`
            : ""}
        </article>`;
      }).join("");
      host.innerHTML = `<div class="hg-scroll hg-history">
        <button type="button" class="hg-history-back" data-history-back><i class="fa-solid fa-arrow-left"></i> My Quiz History</button>
        <header class="hg-history-title"><h3>${escapeHTML(summary.roomName || questions[0]?.[1]?.roomName || "Quiz Room")}</h3><span>${escapeHTML(formatHistoryMonth(summary.month || questions[0]?.[1]?.roomMonth || ""))} · ${escapeHTML(status)}</span></header>
        <section class="hg-history-summary">
          <div><small>Your Score</small><strong>${escapeHTML(score)}</strong></div>
          <div><small>Your Rank</small><strong>${escapeHTML(rank)}</strong></div>
          <div><small>Correct Answers</small><strong>${Number(summary.correct) || questions.filter(([, q]) => q.status === "correct").length}</strong></div>
          <div><small>Wrong Answers</small><strong>${Number(summary.wrong) || questions.filter(([, q]) => q.status === "wrong").length}</strong></div>
          <div><small>Total Questions</small><strong>${Number(summary.totalQuestions) || questions.length}</strong></div>
          <div><small>Unanswered</small><strong>${Number(summary.unanswered) || 0}</strong></div>
          ${pending ? `<div class="hg-history-evaluation"><small>Evaluation</small><strong>${pending} Pending</strong></div>` : ""}
        </section>
        <h4 class="hg-section-title">Question-wise Performance</h4>
        <div class="hg-history-questions">${details || '<div class="hg-empty">No question details are available.</div>'}</div>
      </div>`;
      return;
    }

    selectedHistoryRoomId = "";
    if (data.quizHistoryError) {
      host.innerHTML = '<div class="hg-empty"><i class="fa-solid fa-triangle-exclamation"></i><br><strong>Quiz history could not be loaded</strong><br>Check your connection and confirm the latest Firebase database rules are deployed.</div>';
      return;
    }
    if (!data.quizHistoryLoaded) {
      host.innerHTML = '<div class="hg-empty"><i class="fa-solid fa-spinner fa-spin"></i><br>Loading your quiz history…</div>';
      return;
    }
    if (!rooms.length) {
      host.innerHTML = '<div class="hg-empty"><i class="fa-solid fa-clock-rotate-left"></i><br><strong>My Quiz History</strong><br>You have not participated in any quiz rooms yet.</div>';
      return;
    }
    host.innerHTML = `<div class="hg-scroll hg-history">
      <header class="hg-history-title"><h3>My Quiz History</h3><span>Quiz rooms you have participated in</span></header>
      <div class="hg-history-rooms">${rooms.map(([roomId, room]) => {
        const summary = room.summary || {};
        const questions = Object.values(room.questions || {});
        const pending = Number(summary.pending) || questions.filter(question => question.status === "pending").length;
        const status = summary.status === "completed" ? "Completed"
          : summary.status === "evaluationPending" || pending ? "Evaluation Pending"
            : "In Progress";
        const score = summary.isFinal
          ? `${Number(summary.totalScore) || 0} / ${Number(summary.maxScore) || 0}`
          : pending ? "Pending" : "In progress";
        const firstQuestion = questions[0] || {};
        return `<button type="button" class="hg-history-room" data-history-room="${escapeHTML(roomId)}">
          <span class="hg-history-room-main"><strong>${escapeHTML(summary.roomName || firstQuestion.roomName || "Quiz Room")}</strong>
            <small>${escapeHTML(status)} · ${escapeHTML(formatHistoryMonth(summary.month || firstQuestion.roomMonth || ""))}</small></span>
          <span class="hg-history-room-score">${escapeHTML(score)}</span><span class="hg-history-view">View Details <i class="fa-solid fa-chevron-right"></i></span>
        </button>`;
      }).join("")}</div>
    </div>`;
  }

  function formatHistoryMonth(value) {
    const month = String(value || "").trim();
    if (!month) return "Month unavailable";
    const date = /^\d{4}-\d{2}$/.test(month) ? new Date(`${month}-01T00:00:00`) : new Date(month);
    return Number.isNaN(date.getTime()) ? month : new Intl.DateTimeFormat("en-US", { month: "long", year: "numeric" }).format(date);
  }

  function formatHistoryDate(value) {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? String(value || "") : date.toLocaleString();
  }

  // ---------- scoreboard ----------
  function scheduleScoreRender() {
    clearTimeout(scoreTimer);
    scoreTimer = setTimeout(() => { if (panel === "score") renderScore(); if (panel === "profile") renderProfile(); }, 120);
  }

  function renderScore() {
    const host = $('[data-panel="score"]');
    if (!host || !ctx) return;
    const publishedResults = Object.entries(data.publicResults || {})
      .filter(([, result]) => result?.published && result.rows && typeof result.rows === "object")
      .sort((a, b) => String(b[1].updatedAt || "").localeCompare(String(a[1].updatedAt || "")));
    if (!publishedResults.length) {
      host.innerHTML = '<div class="hg-score"><div class="hg-score-head"><small>RANKING</small><h3>All Quiz Scores</h3></div><div class="hg-empty">Quiz results have not been published yet.</div></div>';
      return;
    }

    const rows = HangoutService.buildCumulativeLeaderboard(data.publicResults);
    const list = rows.map(row => {
      const rank = Number(row.rank) || 0;
      const medal = HangoutService.medalFor(rank);
      const own = row.uid === ctx.user.uid;
      const profile = data.users[row.uid] || {};
      return `<li class="hg-row ${rank <= 3 ? `rank-${rank}` : ""} ${own ? "is-you" : ""}">
        <span class="hg-rank ${medal ? "is-medal" : ""}">${medal || escapeHTML(HangoutService.rankLabel(rank))}</span>
        ${HangoutUI.avatar(profile.photo, row.name, row.uid)}
        <span class="hg-name">${escapeHTML(row.name)}${own ? '<span class="hg-you-tag">You</span>' : ""}</span>
        <span class="hg-pts">${row.points}</span></li>`;
    }).join("");
    host.innerHTML = `<div class="hg-score">
      <div class="hg-score-head"><small>ALL PUBLISHED QUIZZES</small><h3>Total Quiz Scores</h3>
        <p>${publishedResults.length} quiz${publishedResults.length === 1 ? "" : "zes"} included</p>
      </div>
      ${list ? `<ol class="hg-score-list">${list}</ol>` : '<div class="hg-empty">No participants have been recorded in published quizzes.</div>'}
    </div>`;
  }

  // ---------- profile ----------
  function renderProfile() {
    const host = $('[data-panel="profile"]');
    if (!host || !ctx) return;
    const rows = HangoutService.buildLeaderboard(data.users, data.scores);
    const me = rows.find(row => row.uid === ctx.user.uid);
    const entries = Object.values(data.log || {}).sort((a, b) => String(b.at).localeCompare(String(a.at)));
    const log = entries.map(entry => {
      const points = Number(entry.points) || 0;
      return `<li><div>${escapeHTML(entry.note || "Quiz points")}<small>${escapeHTML(HangoutService.formatDate(entry.at))}</small></div><span class="${points >= 0 ? "hg-plus" : "hg-minus"}">${points >= 0 ? "+" : ""}${points}</span></li>`;
    }).join("");
    host.innerHTML = `<div class="hg-scroll">
      <div class="hg-profile-head">${HangoutUI.avatar(ctx.user.photo, ctx.user.name, ctx.user.uid)}<h3>${escapeHTML(ctx.user.name)}</h3><span>${escapeHTML(ctx.user.email)}</span></div>
      <div class="hg-stats"><div class="hg-stat"><b>${me ? me.points : 0}</b><small>Total points</small></div><div class="hg-stat"><b>${me ? escapeHTML(HangoutService.rankLabel(me.rank)) : "—"}</b><small>Current rank</small></div></div>
      <div class="hg-section-title">Quiz participation</div>
      ${entries.length ? `<ul class="hg-log">${log}</ul>` : '<p class="hg-hint" style="margin-bottom:14px">No points yet. They will appear here after the admin awards them.</p>'}
      <button type="button" class="hg-outline-btn" data-act="signout"><i class="fa-solid fa-arrow-right-from-bracket"></i> ${HangoutAuth.isUsingMainSession() ? "Sign out of website" : "Sign out of Google"}</button>
    </div>`;
    host.querySelector('[data-act="signout"]').addEventListener("click", () => {
      HangoutAuth.signOut().catch(error => console.error("Hangout sign-out failed:", error));
    });
  }

  HangoutHub.registerSection({
    id: "quiz",
    label: "Online Quiz",
    icon: "fa-circle-question",
    mount,
    unmount,
    onHistoryState: name => setPanel(name, true)
  });
})();
