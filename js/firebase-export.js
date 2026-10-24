// Official-only Firebase record browser and Excel export.
// This project uses Firebase Realtime Database; paths below map its data groups.
(() => {
  const paths = {
    members: "members",
    bloodDonations: "bloodDonations",
    activityReports: "programs",
    attendance: "attendance"
  };
  const panel = () => document.getElementById("firebaseExportPanel");
  const status = message => { const node = document.getElementById("firebaseExportStatus"); if (node) node.textContent = message; };
  const toRows = value => {
    if (value == null) return [];
    if (Array.isArray(value)) return value.map((record, index) => ({ id: String(index), ...(record && typeof record === "object" ? record : { value: record }) }));
    if (typeof value !== "object") return [{ value }];
    return Object.entries(value).map(([id, record]) => ({ id, ...(record && typeof record === "object" && !Array.isArray(record) ? record : { value: record }) }));
  };
  async function exportExcel() {
    const collection = document.getElementById("firebaseExportCollection")?.value || "members";
    try {
      if (typeof isSupervisorLoggedIn !== "function" || !isSupervisorLoggedIn()) throw new Error("Sign in as an official to export Firebase records.");
      if (!window.XLSX) throw new Error("Excel export library could not be loaded. Check your connection and try again.");
      status("Preparing Excel file…");
      await window.firebaseReady;
      const snapshot = await firebaseRead(paths[collection]);
      const rows = toRows(snapshot.val());
      if (!rows.length) throw new Error("There are no records to export.");
      const worksheet = XLSX.utils.json_to_sheet(rows);
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, collection.slice(0, 31));
      XLSX.writeFile(workbook, `${collection}-${new Date().toISOString().slice(0, 10)}.xlsx`);
      status(`Downloaded ${rows.length} ${rows.length === 1 ? "record" : "records"}.`);
    } catch (error) {
      status(error?.message || "Could not export records.");
    }
  }

  function updateVisibility() {
    const visible = typeof isSupervisorLoggedIn === "function" && isSupervisorLoggedIn();
    if (!visible) {
      panel()?.classList.add("hidden");
      document.getElementById("moreDashboardPanel")?.classList.add("hidden");
    }
  }
  window.toggleMoreDashboard = function () {
    const more = document.getElementById("moreDashboardPanel");
    more?.classList.toggle("hidden");
  };
  window.openFirebaseExportPanel = function () {
    const more = document.getElementById("moreDashboardPanel");
    const exportView = document.getElementById("firebaseExportView");
    if (typeof isSupervisorLoggedIn !== "function" || !isSupervisorLoggedIn()) {
      status("Sign in as an official to export Firebase records.");
      return;
    }
    if (history.state?.appView !== "firebaseExport") history.pushState({ appView: "firebaseExport" }, "", location.pathname + location.search + "#firebaseExport");
    if (typeof hideAllViews === "function") hideAllViews();
    document.getElementById("appContainer")?.setAttribute("data-active-view", "firebaseExport");
    exportView?.classList.remove("hidden");
    document.getElementById("dashboardHomeActions")?.classList.add("hidden");
    document.getElementById("moreDashboardPanel")?.classList.add("hidden");
    if (typeof updateAppTopBar === "function") updateAppTopBar("firebaseExport");
    window.scrollTo({ top: 0, behavior: "smooth" });
  };
  window.closeFirebaseExportPanel = function () {
    if (history.state?.appView === "firebaseExport") history.back();
    else if (typeof showDashboard === "function") showDashboard();
  };
  window.addEventListener("popstate", event => {
    if (event.state?.appView === "dashboard" && typeof isSupervisorLoggedIn === "function" && isSupervisorLoggedIn()) {
      document.getElementById("moreDashboardPanel")?.classList.remove("hidden");
    }
  });
  document.addEventListener("DOMContentLoaded", () => {
    document.getElementById("exportFirebaseExcel")?.addEventListener("click", exportExcel);
    updateVisibility();
    setInterval(updateVisibility, 1500);
  });
})();
