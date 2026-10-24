// ============================================================
// AL-AMEEN YOUTH FEDERATION
// MAIN SCRIPT
// ============================================================


// ============================================================
// GOOGLE APPS SCRIPT URL
// ============================================================

const SCRIPT_URL =
  window.AYFA_SCRIPT_URL || (["localhost", "127.0.0.1", "::1"].includes(location.hostname) ? "" : "https://script.google.com/macros/s/AKfycbzPxZ0zX0ZjsHepbOM4AYYzvq3hx3ckqz7LAh-hsnalaRvbNr2YbwD47cS8kjDZWk40/exec");


// ============================================================
// SECURITY / HTML HELPERS
// ============================================================

function escapeHTML(value) {

  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");

}

function showToast(message, type = "info") {
  let stack = document.querySelector(".app-toast-stack");
  if (!stack) {
    stack = document.createElement("div");
    stack.className = "app-toast-stack";
    stack.setAttribute("aria-live", "polite");
    stack.setAttribute("aria-atomic", "false");
    document.body.appendChild(stack);
  }
  const toast = document.createElement("div");
  toast.className = `app-toast app-toast-${["success", "error", "warning"].includes(type) ? type : "info"}`;
  toast.setAttribute("role", type === "error" ? "alert" : "status");
  toast.textContent = String(message ?? "");
  stack.appendChild(toast);
  requestAnimationFrame(() => toast.classList.add("is-visible"));
  window.setTimeout(() => {
    toast.classList.remove("is-visible");
    window.setTimeout(() => toast.remove(), 220);
  }, 4200);
}

function showConfirmSheet({ title = "Please confirm", message = "Are you sure?", confirmLabel = "Confirm", cancelLabel = "Cancel", danger = false } = {}) {
  return new Promise(resolve => {
    const sheet = document.createElement("dialog");
    sheet.className = "app-confirm-sheet";
    sheet.setAttribute("aria-labelledby", "appConfirmTitle");
    sheet.innerHTML = `<form method="dialog"><h2 id="appConfirmTitle"></h2><p class="app-confirm-message"></p><div class="app-confirm-actions"><button type="button" class="app-confirm-cancel"></button><button type="button" class="app-confirm-accept"></button></div></form>`;
    sheet.querySelector("#appConfirmTitle").textContent = title;
    sheet.querySelector(".app-confirm-message").textContent = message;
    sheet.querySelector(".app-confirm-cancel").textContent = cancelLabel;
    const accept = sheet.querySelector(".app-confirm-accept");
    accept.textContent = confirmLabel;
    if (danger) accept.classList.add("is-danger");

    let settled = false;
    const finish = accepted => {
      if (settled) return;
      settled = true;
      sheet.close();
      sheet.remove();
      resolve(accepted);
    };
    sheet.querySelector(".app-confirm-cancel").addEventListener("click", () => finish(false));
    accept.addEventListener("click", () => finish(true));
    sheet.addEventListener("cancel", event => { event.preventDefault(); finish(false); });
    sheet.addEventListener("click", event => { if (event.target === sheet) finish(false); });
    document.body.appendChild(sheet);
    sheet.showModal();
    sheet.querySelector(".app-confirm-cancel").focus();
  });
}


// ============================================================
// HIDE ALL APPLICATION VIEWS
// ============================================================

function hideAllViews() {

  document.getElementById("appContainer")?.setAttribute("data-active-view", "other");
  document.getElementById("dashboardHomeActions")?.classList.add("hidden");

  const views = [

    "dashboardView",
    "moreView",
    "collectionsView",
    "excelExportView",
    "activityReportsView",
    "yearSelectView",
    "bearersTableView",
    "attendanceView",
    "membersView",
    "bloodDonorsView",
    "aboutView",
    "assetInventoryView",
    "financeView",
    "posterGeneratorView",
    "rentalView",
    "agendaView"

  ];


  views.forEach(id => {

    const element =
      document.getElementById(id);

    if (element) {

      element.classList.add("hidden");

    }

  });

}

function navigateAppView(viewName, callback) {
  if (history.state?.appView !== viewName) history.pushState({ appView: viewName }, "", location.pathname + location.search + `#${viewName}`);
  callback();
  document.getElementById("appContainer")?.setAttribute("data-active-view", viewName);
  updateAppTopBar(viewName);
}

// Back icon in the top bar: visible on every page except the dashboard.
// Uses history.back() when there is a previous in-app view, otherwise goes to the dashboard.
function goBackToDashboard() {
  const view = history.state?.appView || "dashboard";
  if (view !== "dashboard") {
    history.back();
    // Fallback: if browser history has no in-app entry, force the dashboard.
    setTimeout(() => {
      if ((history.state?.appView || "dashboard") === view && document.getElementById("dashboardView")?.classList.contains("hidden")) showDashboard();
    }, 350);
  } else {
    showDashboard();
  }
}

window.addEventListener("popstate", event => {
  if (!isRoleAuthenticated()) return;
  const state = event.state;
  const view = state?.appView || "dashboard";
  if (location.hash !== `#${view}` && view !== "dashboard") history.replaceState({ appView: view }, "", location.pathname + location.search + `#${view}`);
  const routes = {
    dashboard: showDashboard,
    members: openMembersProfile,
    officeBearers: openOfficeBearers,
    bearersTable: () => loadBearers(state?.year || "", { updateHistory: false }),
    activities: openActivityReports,
    blood: openBloodDonors,
    agenda: openAgendaManagement,
    finance: openFinanceReport,
    assets: openAssetInventory,
    attendance: openAttendance,
    rentals: openRentalManagement,
    about: openAboutPage,
    more: openMorePage,
    collections: openCollectionsPage,
    excelExport: openExcelExportPage,
    poster: openPosterGenerator
  };
  (routes[view] || showDashboard)();
  updateAppTopBar(view);
});

const APP_PAGE_TITLES = { dashboard: "ಅಲ್ ಅಮೀನ್ ಯೂತ್ ಫೆಡರೇಶನ್", members: "Members", officeBearers: "Office Bearers", bearersTable: "Office Bearers", activities: "Activities", blood: "Blood Donors", agenda: "Agenda", finance: "Finance", assets: "Assets", attendance: "Attendance", rentals: "Rentals", poster: "Blood Donation Poster", about: "About", more: "More", collections: "Collections", excelExport: "Export Excel" };

function updateAppTopBar(view = history.state?.appView || "dashboard") {
  const back = document.getElementById("appBackButton");
  const pageTitle = document.getElementById("appPageTitle");
  if (pageTitle) {
    pageTitle.textContent = APP_PAGE_TITLES[view] || APP_PAGE_TITLES.dashboard;
    pageTitle.classList.remove("hidden");
  }
  if (back) back.classList.toggle("hidden", view === "dashboard");
}

function openAboutPage() {
  if (history.state?.appView !== "about") history.pushState({ appView: "about" }, "", location.pathname + location.search + "#about");
  hideAllViews();
  document.getElementById("aboutView")?.classList.remove("hidden");
  updateAppTopBar("about");
}

function openMorePage() {
  navigateAppView("more", () => {
    hideAllViews();
    document.getElementById("moreView")?.classList.remove("hidden");
    window.scrollTo({ top: 0, behavior: "smooth" });
  });
}


// ============================================================
// SHOW DASHBOARD
// ============================================================

function showDashboard() {

  if (typeof isRoleAuthenticated === "function" && !isRoleAuthenticated()) {
    showAuthScreen();
    return;
  }

  if (history.state?.appView) history.replaceState({ appView: "dashboard" }, "", location.pathname + location.search);
  hideAllViews();

  document.getElementById("appContainer")?.setAttribute("data-active-view", "dashboard");
  document.getElementById("dashboardHomeActions")?.classList.remove("hidden");

  const dashboard =
    document.getElementById("dashboardView");

  if (dashboard) {

    dashboard.classList.remove("hidden");

  }
  updateAppTopBar("dashboard");

  window.scrollTo({
    top: 0,
    behavior: "smooth"
  });

}

if (!history.state?.appView) history.replaceState({ appView: "dashboard" }, "", location.pathname + location.search);


// ============================================================
// ACTIVITY REPORTS
// ============================================================

function openActivityReports(openForm = false) {
  navigateAppView("activities", () => {
  hideAllViews();

  const activityView =
    document.getElementById("activityReportsView");

  if (activityView) {

    activityView.classList.remove("hidden");

  }

  if (typeof loadProgramReports === "function") {
    loadProgramReports().then(() => {
      if (openForm && typeof openProgramReportForm === "function") openProgramReportForm();
    });
  }

  window.scrollTo({
    top: 0,
    behavior: "smooth"
  });

  });

}


// ============================================================
// OFFICE BEARERS
// ============================================================

function openOfficeBearers() {
  navigateAppView("officeBearers", () => {
  hideAllViews();

  const view =
    document.getElementById("yearSelectView");

  if (view) {

    view.classList.remove("hidden");

  }

  });
  void loadOfficeBearerYears();

}


// ============================================================
// MEMBERS PROFILE
// ============================================================

function openMembersProfile() {
  navigateAppView("members", () => {
  hideAllViews();

  const view =
    document.getElementById("membersView");

  if (view) {

    view.classList.remove("hidden");

  }


  if (
    typeof renderMemberCards === "function"
  ) {

    renderMemberCards();

  }

  });

}


// ============================================================
// BLOOD DONORS
// ============================================================

function openBloodDonors() {
  navigateAppView("blood", () => {
  hideAllViews();

  const view =
    document.getElementById("bloodDonorsView");

  if (view) {

    view.classList.remove("hidden");

  }


  if (
    typeof renderBloodDonors === "function"
  ) {

    renderBloodDonors();

  }

  });

}


// ============================================================
// ATTENDANCE
// ============================================================

function openAttendance() {
  navigateAppView("attendance", () => {
  hideAllViews();

  const view =
    document.getElementById("attendanceView");

  if (view) {

    view.classList.remove("hidden");

  }
  if (
    typeof loadAttendanceSheet === "function"
  ) {

    loadAttendanceSheet();

  }

  if (typeof isSupervisorLoggedIn === "function" && !isSupervisorLoggedIn() && typeof switchAttTab === "function") {
    switchAttTab("report");
  }

  });

}


// ============================================================
// OFFICE BEARERS TABLE
// ============================================================

let activeOfficeBearerYear = "";
let activeOfficeBearerRoster = [];

function normalizeOfficeBearer(item, index) {
  if (Array.isArray(item)) return { sl: index + 1, designation: item[0] || "", name: item[1] || "" };
  return { ...(item || {}), sl: item?.sl ?? index + 1, designation: item?.designation || "", name: item?.name || "" };
}

function renderOfficeBearerAdminActions() {
  const host = document.getElementById("bearerAdminActions");
  if (!host) return;
  host.innerHTML = typeof isSupervisorLoggedIn === "function" && isSupervisorLoggedIn()
    ? '<button type="button" class="bearer-add-button" aria-label="Add office bearer" title="Add office bearer" onclick="openOfficeBearerAdd()"><i class="fa-solid fa-plus"></i></button>'
    : "";
}

function ensureOfficeBearerYearButton(year) {
  const list = document.querySelector(".year-list");
  if (!list || [...list.querySelectorAll(".year-btn")].some(button => button.querySelector(".year-num")?.textContent.trim() === String(year))) return;
  const button = document.createElement("button");
  button.type = "button";
  button.className = "year-btn";
  button.innerHTML = '<span class="year-btn-top"><i class="fa-solid fa-calendar-days"></i><i class="fa-solid fa-arrow-right"></i></span><span class="year-num"></span><span class="year-sub">View committee</span>';
  button.querySelector(".year-num").textContent = String(year);
  button.addEventListener("click", () => loadBearers(String(year)));
  const nextYear = [...list.querySelectorAll(".year-btn")].find(existing => Number(existing.querySelector(".year-num")?.textContent) < Number(year));
  if (nextYear) list.insertBefore(button, nextYear);
  else list.append(button);
}

async function loadOfficeBearerYears() {
  try {
    const snapshot = await ReferenceDataRepository.read("officeBearers");
    const years = Object.keys(snapshot.val() || {}).filter(year => /^\d{4}$/.test(year)).sort((a, b) => Number(a) - Number(b));
    years.forEach(ensureOfficeBearerYearButton);
  } catch (error) {
    console.error("Office bearer years could not be loaded:", error);
  }
}

async function loadBearers(year, options = {}) {
  year = String(year);
  const search = document.getElementById("bearerSearch");
  if (search) search.value = "";
  if (options.updateHistory !== false && (history.state?.appView !== "bearersTable" || history.state?.year !== year)) {
    history.pushState({ appView: "bearersTable", year }, "", location.pathname + location.search + "#bearersTable");
  }
  hideAllViews();
  const tableView = document.getElementById("bearersTableView");
  if (tableView) tableView.classList.remove("hidden");
  const title = document.getElementById("selectedYearTitle");
  const tbody = document.getElementById("bearersTableBody");
  if (!tbody) return;
  activeOfficeBearerYear = year;
  activeOfficeBearerRoster = [];
  if (title) title.textContent = year;
  renderOfficeBearerAdminActions();
  tbody.innerHTML = "";
  let roster;
  try { roster = await loadReferenceData(`officeBearers/${year}`, "officeBearers"); }
  catch (error) { console.error("Office bearers read failed:", error); }
  roster = Array.isArray(roster) ? roster : Object.values(roster || {});
  activeOfficeBearerRoster = roster.map(normalizeOfficeBearer);
  if (!activeOfficeBearerRoster.length) {
    tbody.innerHTML = `<tr><td colspan="3" class="empty-cell">${escapeHTML(year)} ರ Office Bearers data ಇನ್ನೂ ಸೇರಿಸಲಾಗಿಲ್ಲ.</td></tr>`;
    return;
  }
  activeOfficeBearerRoster.forEach((bearer, index) => {
    tbody.insertAdjacentHTML("beforeend", `
      <tr>
        <td>${escapeHTML(bearer.sl)}</td>
        <td><button type="button" class="bearer-text-edit" onclick="openOfficeBearerEdit(${index})">${escapeHTML(bearer.designation)}</button></td>
        <td><button type="button" class="bearer-text-edit" onclick="openOfficeBearerEdit(${index})">${escapeHTML(bearer.name)}</button></td>
      </tr>`);
  });
}

function openOfficeBearerAdd() {
  if (!requireSupervisor()) return;
  openOfficeBearerEditor("add", -1);
}

function openOfficeBearerEdit(index) {
  if (!requireSupervisor()) return;
  openOfficeBearerEditor("edit", Number(index));
}

function openOfficeBearerEditor(mode, index) {
  const editing = mode === "edit";
  const bearer = editing ? activeOfficeBearerRoster[index] : { designation: "", name: "" };
  if (editing && !bearer) return;
  document.getElementById("officeBearerEditor")?.remove();
  const modal = document.createElement("div");
  modal.id = "officeBearerEditor";
  modal.className = "office-bearer-modal";
  modal.innerHTML = `<section class="office-bearer-dialog" role="dialog" aria-modal="true" aria-labelledby="officeBearerDialogTitle">
    <h3 id="officeBearerDialogTitle">${editing ? "Edit office bearer" : "Add office bearer"}</h3>
    <form id="officeBearerEditorForm">
      ${editing ? "" : `<label>Year<input name="year" type="number" min="1900" max="2200" step="1" value="${escapeHTML(activeOfficeBearerYear || new Date().getFullYear())}" required></label>`}
      <label>Designation<input name="designation" type="text" maxlength="150" value="${escapeHTML(bearer.designation)}" required></label>
      <label>Name<input name="name" type="text" maxlength="150" value="${escapeHTML(bearer.name)}" required></label>
      <div class="office-bearer-dialog-actions">${editing ? '<button type="button" class="office-bearer-delete">Delete</button>' : ""}<button type="button" class="office-bearer-cancel">Cancel</button><button type="submit" class="office-bearer-save">Save</button></div>
    </form>
  </section>`;
  document.body.append(modal);
  const close = () => modal.remove();
  modal.querySelector(".office-bearer-cancel").addEventListener("click", close);
  modal.querySelector(".office-bearer-delete")?.addEventListener("click", async () => {
    close();
    await deleteOfficeBearer(index);
  });
  modal.addEventListener("click", event => { if (event.target === modal) close(); });
  modal.querySelector("form").addEventListener("submit", event => {
    event.preventDefault();
    void saveOfficeBearerEditor(mode, index, new FormData(event.currentTarget));
  });
  modal.querySelector('input[name="designation"]').focus();
}

async function saveOfficeBearerEditor(mode, index, formData) {
  if (!requireSupervisor()) return;
  const editing = mode === "edit";
  const year = editing ? activeOfficeBearerYear : String(formData.get("year") || "").trim();
  const parsedYear = Number(year);
  const designation = String(formData.get("designation") || "").trim();
  const name = String(formData.get("name") || "").trim();
  if (!/^\d{4}$/.test(year) || parsedYear < 1900 || parsedYear > 2200) { showToast("Enter a valid year."); return; }
  if (!designation || !name) { showToast("Enter both designation and name."); return; }
  try {
    let roster;
    if (editing) roster = activeOfficeBearerRoster.map(item => ({ ...item }));
    else {
      const snapshot = await ReferenceDataRepository.read(`officeBearers/${year}`);
      const current = snapshot.val();
      roster = (Array.isArray(current) ? current : Object.values(current || {})).map(normalizeOfficeBearer);
    }
    if (editing) {
      if (!roster[index]) throw new Error("This office bearer record is no longer available.");
      roster[index] = { ...roster[index], designation, name };
    } else {
      roster.push({ sl: roster.length + 1, designation, name });
    }
    const now = new Date().toISOString();
    await ReferenceDataRepository.writeOfficeBearers(year, roster, {
      action: editing ? "officeBearer.update" : "officeBearer.create",
      path: `officeBearers/${year}`,
      recordId: editing ? `${year}:${index + 1}` : year,
      afterUpdatedAt: now
    });
    document.getElementById("officeBearerEditor")?.remove();
    ensureOfficeBearerYearButton(year);
    showToast(editing ? "Office bearer updated." : "Office bearer added.", "success");
    await loadBearers(year);
  } catch (error) {
    console.error("Office bearer save failed:", error);
    const details = String(error?.code || error?.message || "").toLowerCase();
    showToast(details.includes("permission_denied") || details.includes("permission denied")
      ? "Firebase denied this write. Sign in again as an official. If the problem continues, the deployed database rules may need updating."
      : "Could not save office bearer. Check the connection and try again.");
  }
}

async function deleteOfficeBearer(index) {
  if (!requireSupervisor()) return;
  const bearer = activeOfficeBearerRoster[Number(index)];
  if (!bearer) return;
  if (!await showConfirmSheet({ title: "Delete office bearer?", message: `${bearer.name} (${bearer.designation}) will be removed from ${activeOfficeBearerYear}.`, confirmLabel: "Delete", danger: true })) return;
  try {
    const roster = activeOfficeBearerRoster
      .filter((_, itemIndex) => itemIndex !== Number(index))
      .map((item, itemIndex) => ({ ...item, sl: itemIndex + 1 }));
    const now = new Date().toISOString();
    await ReferenceDataRepository.writeOfficeBearers(activeOfficeBearerYear, roster, {
      action: "officeBearer.delete",
      path: `officeBearers/${activeOfficeBearerYear}`,
      recordId: `${activeOfficeBearerYear}:${Number(index) + 1}`,
      beforeUpdatedAt: "",
      afterUpdatedAt: now
    });
    showToast("Office bearer deleted.", "success");
    await loadBearers(activeOfficeBearerYear);
  } catch (error) {
    console.error("Office bearer delete failed:", error);
    const details = String(error?.code || error?.message || "").toLowerCase();
    showToast(details.includes("permission_denied") || details.includes("permission denied")
      ? "Firebase denied this change. Sign in again as an official, and verify the deployed database rules."
      : "Could not delete office bearer. Check the connection and try again.");
  }
}

function filterBearerTable(query) {
  const term = String(query || "").trim().toLowerCase();
  document.querySelectorAll("#bearersTableBody tr").forEach(row => {
    row.hidden = Boolean(term) && !row.textContent.toLowerCase().includes(term);
  });
}


// ============================================================
// PDF PRINT
// ============================================================

function downloadPDF() {

  window.print();

}


// ============================================================
// BLOOD DONATION POSTER GENERATOR
// ============================================================

function openPosterGenerator() {

  if (history.state?.appView !== "poster") history.pushState({ appView: "poster" }, "", location.pathname + location.search + "#poster");

  if (history.state?.appView !== "poster") history.pushState({ appView: "poster" }, "", location.pathname + location.search + "#poster");

  hideAllViews();

  const view = document.getElementById("posterGeneratorView");

  if (view) {
    view.classList.remove("hidden");
  }
  updateAppTopBar("poster");
  updateAppTopBar("poster");

  // Set today's date automatically
  const dateInput = document.getElementById("posterDate");

  if (dateInput && !dateInput.value) {

    const today = new Date();

    const yyyy = today.getFullYear();
    const mm = String(today.getMonth() + 1).padStart(2, "0");
    const dd = String(today.getDate()).padStart(2, "0");

    dateInput.value = `${yyyy}-${mm}-${dd}`;
  }
}
