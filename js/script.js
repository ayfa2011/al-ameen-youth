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


// ============================================================
// HIDE ALL APPLICATION VIEWS
// ============================================================

function hideAllViews() {

  document.getElementById("appContainer")?.setAttribute("data-active-view", "other");
  document.getElementById("dashboardHomeActions")?.classList.add("hidden");

  const views = [

    "dashboardView",
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
  updateAppTopBar(viewName);
}

// Universal back button on every page (top bar)
function goBackToDashboard() {
  showDashboard();
  history.replaceState({ appView: "dashboard" }, "", location.pathname + location.search + "#dashboard");
  updateAppTopBar("dashboard");
  window.scrollTo({ top: 0, behavior: "smooth" });
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
  const view = event.state?.appView || "dashboard";
  if (location.hash !== `#${view}` && view !== "dashboard") history.replaceState({ appView: view }, "", location.pathname + location.search + `#${view}`);
  const routes = {
    dashboard: showDashboard,
    members: openMembersProfile,
    officeBearers: openOfficeBearers,
    activities: openActivityReports,
    blood: openBloodDonors,
    agenda: openAgendaManagement,
    finance: openFinanceReport,
    assets: openAssetInventory,
    attendance: openAttendance,
    rentals: openRentalManagement,
    about: openAboutPage,
    poster: openPosterGenerator
  };
  (routes[view] || showDashboard)();
  updateAppTopBar(view);
});

const APP_PAGE_TITLES = { dashboard: "ಅಲ್ ಅಮೀನ್ ಯೂತ್ ಫೆಡರೇಶನ್", members: "Members", officeBearers: "Office Bearers", activities: "Activities", blood: "Blood Donors", agenda: "Agenda", finance: "Finance", assets: "Assets", attendance: "Attendance", rentals: "Rentals", poster: "Blood Donation Poster", about: "About" };

function updateAppTopBar(view = history.state?.appView || "dashboard") {
  const back = document.getElementById("appBackButton");
  // Uniform top bar on ALL pages: Logo left + Logout right. No center page name.
  document.getElementById("appPageTitle")?.classList.add("hidden");
  if (back) back.classList.toggle("hidden", view === "dashboard");
}

function openAboutPage() {
  if (history.state?.appView !== "about") history.pushState({ appView: "about" }, "", location.pathname + location.search + "#about");
  hideAllViews();
  document.getElementById("aboutView")?.classList.remove("hidden");
  updateAppTopBar("about");
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

async function loadBearers(year) {

  hideAllViews();


  const tableView =
    document.getElementById("bearersTableView");

  if (tableView) {

    tableView.classList.remove("hidden");

  }


  const title =
    document.getElementById("selectedYearTitle");

  const tbody =
    document.getElementById("bearersTableBody");


  if (!tbody) {

    return;

  }


  if (title) {

    title.textContent = year;

  }


  tbody.innerHTML = "";


  let roster;
  try { roster = await loadReferenceData(`officeBearers/${year}`, "officeBearers"); }
  catch (error) { console.error("Office bearers read failed:", error); }
  roster = Array.isArray(roster) ? roster : Object.values(roster || {});

  if (!roster.length) {

    tbody.innerHTML = `

      <tr>

        <td
          colspan="3"
          class="empty-cell"
        >

          ${escapeHTML(year)}
          ರ Office Bearers data
          ಇನ್ನೂ ಸೇರಿಸಲಾಗಿಲ್ಲ.

        </td>

      </tr>

    `;

    return;

  }


  roster.forEach((item, index) => {
    // Historical 2025/26 imports may still be [designation, name] pairs.
    // Normalize those while keeping the newer object-shaped records intact.
    const bearer = Array.isArray(item)
      ? { sl: index + 1, designation: item[0], name: item[1] }
      : (item || {});

    tbody.insertAdjacentHTML(

      "beforeend",

      `

      <tr>

        <td>
          ${escapeHTML(bearer.sl ?? index + 1)}
        </td>

        <td>
          ${escapeHTML(bearer.designation)}
        </td>

        <td>
          ${escapeHTML(bearer.name)}
        </td>

      </tr>

      `

    );

  });

}


// ============================================================
// PDF PRINT
// ============================================================

function downloadPDF() {

  window.print();

}


// ============================================================
// COMING SOON
// ============================================================

function showComingSoon(title) {

  alert(

    `${title}\n\n` +
    `ಈ ವಿಭಾಗಕ್ಕೆ ಇನ್ನೂ Google Sheet / backend data connect ಮಾಡಲಾಗಿಲ್ಲ.`

  );

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
