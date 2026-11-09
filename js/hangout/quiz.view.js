// ONLINE QUIZ — screen layout, question area, scoreboard, profile (UI only).
// Layout rule: the Question Area is built once and has a fixed height. Only the
// panel below it (Quiz/Chat, Score Board, More, Profile) is switched, using
// show/hide — so the question is never re-rendered when the tab changes, and
// the chat keeps its messages and scroll position.
// Data comes from HangoutRepository, rules from HangoutService, Google login
// from HangoutAuth. Chat is in quiz-chat.view.js, admin in quiz-admin.view.js.
(() => {
  let container = null, ctx = null, stops = [], stopAuth = null, chat = null;
  let lastQuizKey = null, scoreTimer = 0, panel = "quiz", exitFn = () => {};
  const data = { users: {}, scores: {}, quiz: null, log: {} };

  const $ = selector => container?.querySelector(selector);

  // ---------- mount / unmount ----------
  function mount(el, options) {
    container = el;
    exitFn = options.exit;
    stopAuth = HangoutAuth.onChange(handleAuth);
  }

  function unmount() {
    teardown();
    if (stopAuth) { stopAuth(); stopAuth = null; }
    container = null;
  }

  function teardown() {
    stops.forEach(stop => { try { stop(); } catch (error) { /* already stopped */ } });
    stops = [];
    clearTimeout(scoreTimer);
    if (chat) { chat.unmount(); chat = null; }
    ctx = null; lastQuizKey = null;
    data.users = {}; data.scores = {}; data.quiz = null; data.log = {};
    panel = "quiz";
  }

  function handleAuth(profile) {
    if (!container) return;
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

    container.querySelector('[data-act="exit"]').addEventListener("click", () => exitFn());
    container.querySelector('[data-act="admin"]').addEventListener("click", () => HangoutQuizAdmin.open({
      users: () => data.users, scores: () => data.scores, quiz: () => data.quiz
    }));
    container.querySelector(".hg-nav").addEventListener("click", event => {
      const button = event.target.closest("[data-nav]");
      if (button) setPanel(button.dataset.nav);
    });

    ctx.users = () => data.users;
    ctx.isOfficial = () => HangoutAdminRepository.isOfficial();
    refreshAdminButton();
    renderQuestion(null);
    $('[data-panel="more"]').innerHTML = '<div class="hg-empty"><i class="fa-solid fa-ellipsis"></i><br>More features are coming soon.</div>';
    chat = HangoutQuizChat.mount($('[data-panel="quiz"]'), ctx);

    HangoutRepository.saveOwnProfile(ctx.user).catch(error => {
      console.error("Hangout profile save failed:", error);
      showToast("Could not save your profile. Check your connection.", "error");
    });
    stops.push(
      HangoutRepository.subscribeQuiz(quiz => { data.quiz = quiz; renderQuestion(quiz); }),
      HangoutRepository.subscribeUsers(users => { data.users = users; chat?.refreshAvatars(); scheduleScoreRender(); }),
      HangoutRepository.subscribeScores(scores => { data.scores = scores; scheduleScoreRender(); }),
      HangoutRepository.subscribeScoreLog(ctx.user.uid, log => { data.log = log; if (panel === "profile") renderProfile(); })
    );
  }

  function refreshAdminButton() {
    const button = $('[data-act="admin"]');
    if (button) button.hidden = !HangoutAdminRepository.isOfficial();
  }

  function setPanel(name) {
    panel = name;
    container.querySelectorAll("[data-nav]").forEach(b => b.classList.toggle("is-active", b.dataset.nav === name));
    container.querySelectorAll("[data-panel]").forEach(p => { p.hidden = p.dataset.panel !== name; });
    refreshAdminButton();
    if (name === "quiz") chat?.onShow();
    if (name === "score") renderScore();
    if (name === "profile") renderProfile();
  }

  // ---------- question area (never touched when switching tabs) ----------
  function renderQuestion(raw) {
    const quiz = HangoutService.cleanQuiz(raw);
    const key = JSON.stringify(quiz);
    const month = $("#hgMonth");
    if (month) month.textContent = quiz.monthLabel || HangoutService.monthLabel();
    if (key === lastQuizKey) return;
    lastQuizKey = key;
    const area = $("#hgQuestion");
    if (!area) return;
    if (!quiz.title && !quiz.text && !quiz.imageUrl) {
      area.innerHTML = '<div class="hg-question-empty"><i class="fa-solid fa-hourglass-half"></i><span>No question yet.<br>Please wait for the admin.</span></div>';
      return;
    }
    area.innerHTML = `${quiz.title ? `<h3>${escapeHTML(quiz.title)}</h3>` : ""}${quiz.text ? `<p>${escapeHTML(quiz.text)}</p>` : ""}${quiz.imageUrl ? `<img src="${escapeHTML(quiz.imageUrl)}" alt="Quiz picture" referrerpolicy="no-referrer">` : ""}`;
    area.scrollTop = 0;
  }

  // ---------- scoreboard ----------
  function scheduleScoreRender() {
    clearTimeout(scoreTimer);
    scoreTimer = setTimeout(() => { if (panel === "score") renderScore(); if (panel === "profile") renderProfile(); }, 120);
  }

  function renderScore() {
    const host = $('[data-panel="score"]');
    if (!host || !ctx) return;
    const rows = HangoutService.buildLeaderboard(data.users, data.scores);
    const me = rows.find(row => row.uid === ctx.user.uid);
    const list = rows.map(row => {
      const medal = HangoutService.medalFor(row.rank);
      const own = row.uid === ctx.user.uid;
      return `<li class="hg-row ${row.rank <= 3 ? `rank-${row.rank}` : ""} ${own ? "is-you" : ""}">
        <span class="hg-rank ${medal ? "is-medal" : ""}">${medal || escapeHTML(HangoutService.rankLabel(row.rank))}</span>
        ${HangoutUI.avatar(row.photo, row.name, row.uid)}
        <span class="hg-name">${escapeHTML(row.name)}${own ? '<span class="hg-you-tag">You</span>' : ""}</span>
        <span class="hg-pts">${row.points}</span></li>`;
    }).join("");
    host.innerHTML = `<div class="hg-score">
      <div class="hg-score-head"><small>RANKING</small><h3>Live Scoreboard</h3></div>
      ${me ? `<div class="hg-yourpos">Your Position: ${escapeHTML(HangoutService.rankLabel(me.rank))}</div>` : ""}
      ${rows.length ? `<ol class="hg-score-list">${list}</ol>` : '<div class="hg-empty">No players yet.</div>'}
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

  HangoutHub.registerSection({ id: "quiz", label: "Online Quiz", icon: "fa-circle-question", mount, unmount });
})();
