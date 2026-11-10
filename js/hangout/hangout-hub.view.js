// HANGOUT — hub screen + full-screen shell (UI only).
// The Hangout hub lists sections (today: Online Quiz). To add a future
// section, create its own view file and call HangoutHub.registerSection({...}).
// This file never touches Firebase or Google login directly.
(() => {
  const sections = [];
  let root = null, shell = null, openSection = null, isOpen = false;

  const HASH = "#hangout";
  const url = () => location.pathname + location.search + HASH;
  const authedOnMainSite = () => typeof isRoleAuthenticated !== "function" || isRoleAuthenticated();

  // Small shared UI helper (avatar with photo, falling back to the initial).
  window.HangoutUI = Object.freeze({
    avatar(photo, name, uid = "") {
      const initial = escapeHTML(HangoutService.initialOf(name));
      const img = photo ? `<img src="${escapeHTML(photo)}" alt="" referrerpolicy="no-referrer" loading="lazy">` : initial;
      return `<span class="hg-avatar" data-uid="${escapeHTML(uid)}" data-initial="${initial}">${img}</span>`;
    }
  });

  function ensureRoot() {
    if (root) return;
    root = document.createElement("div");
    root.className = "hg-root";
    root.hidden = true;
    root.setAttribute("role", "dialog");
    root.setAttribute("aria-label", "Hangout");
    root.innerHTML = '<div class="hg-shell"></div>';
    shell = root.firstElementChild;
    document.body.appendChild(root);
    // Broken pictures: avatar -> initial letter, question picture -> hidden.
    root.addEventListener("error", event => {
      const img = event.target;
      if (!(img instanceof HTMLImageElement)) return;
      const avatar = img.closest(".hg-avatar");
      if (avatar) avatar.textContent = avatar.dataset.initial || "?";
      else if (img.closest(".hg-question")) img.remove();
    }, true);
  }

  function leaveSection() {
    if (openSection) { try { openSection.unmount(); } catch (error) { console.error(error); } openSection = null; }
  }

  function renderHub() {
    leaveSection();
    shell.innerHTML = `
      <div class="hg-hub">
        <header class="hg-topbar">
          <button type="button" class="hg-icon-btn" data-act="close" aria-label="Back"><i class="fa-solid fa-arrow-left"></i></button>
          <h2>Hangout</h2>
        </header>
        <div class="hg-hub-body"><div class="hg-hub-grid">
          ${sections.map(s => s.id === "quiz"
            ? `<button type="button" class="hg-hub-card is-quiz" data-section="${escapeHTML(s.id)}">
                <img class="hg-quiz-card-image" src="assets/images/online-quiz-icon.png" alt="">
                <span class="hg-quiz-card-label">${escapeHTML(s.label)}</span>
              </button>`
            : `<button type="button" class="hg-hub-card" data-section="${escapeHTML(s.id)}"><i class="fa-solid ${escapeHTML(s.icon)}"></i><span>${escapeHTML(s.label)}</span></button>`).join("")}
        </div></div>
      </div>`;
  }

  function renderSection(id) {
    const section = sections.find(s => s.id === id);
    if (!section) { renderHub(); return; }
    if (!HangoutFirebase.isAvailable()) { showToast(HangoutFirebase.unavailableMessage(), "error"); renderHub(); return; }
    leaveSection();
    shell.innerHTML = "";
    openSection = section;
    section.mount(shell, { exit: () => history.back() });
  }

  function showState(state) {
    if (state?.hangout && state.hangout !== "hub") renderSection(state.hangout);
    else renderHub();
  }

  function open() {
    ensureRoot();
    if (!isOpen) {
      history.pushState({ hangout: "hub" }, "", url());
      root.hidden = false;
      isOpen = true;
      document.documentElement.style.overflow = "hidden";
    }
    renderHub();
  }

  function close() {
    leaveSection();
    if (root) root.hidden = true;
    isOpen = false;
    document.documentElement.style.overflow = "";
  }

  // The hub's Back button goes back one history step (which closes the overlay).
  function back() { history.back(); }

  document.addEventListener("click", event => {
    if (!root || !root.contains(event.target)) return;
    const card = event.target.closest("[data-section]");
    if (card) {
      history.pushState({ hangout: card.dataset.section }, "", url());
      renderSection(card.dataset.section);
      return;
    }
    if (event.target.closest('[data-act="close"]')) back();
  });

  // Phone back button / browser back.
  window.addEventListener("popstate", event => {
    const state = event.state;
    if (state?.hangout) {
      if (!authedOnMainSite()) { history.replaceState({ appView: "dashboard" }, "", location.pathname + location.search); close(); return; }
      ensureRoot();
      root.hidden = false;
      isOpen = true;
      document.documentElement.style.overflow = "hidden";
      showState(state);
    } else if (isOpen) {
      close();
    }
  });

  window.HangoutHub = Object.freeze({
    registerSection(section) { if (!sections.some(s => s.id === section.id)) sections.push(section); },
    open, close, back
  });
  // Used by the dashboard button in index.html (data-view-handler="openHangout").
  window.openHangout = open;
})();
