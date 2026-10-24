// Official-only Firebase record browser and Excel export.
// This project uses Firebase Realtime Database; paths below map its data groups.
(() => {
  const paths = {
    members: "members",
    bloodDonations: "bloodDonations",
    activityReports: "programs",
    attendance: "attendance"
  };
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
  window.exportSelectedFirebaseExcel = function () {
    if (typeof isSupervisorLoggedIn !== "function" || !isSupervisorLoggedIn()) {
      status("Sign in as an official to export Firebase records.");
      return;
    }
    exportExcel();
  };

  function updateVisibility() {
    const visible = typeof isSupervisorLoggedIn === "function" && isSupervisorLoggedIn();
    if (!visible) {
      document.getElementById("moreDashboardPanel")?.classList.add("hidden");
    }
  }
  window.toggleMoreDashboard = function () {
    const more = document.getElementById("moreDashboardPanel");
    if (!more) return;
    const opening = more.classList.contains("hidden");
    more.classList.toggle("hidden", !opening);
    const button = document.querySelector('[data-view-handler="toggleMoreDashboard"]');
    button?.setAttribute("aria-expanded", String(opening));
  };
  window.addEventListener("popstate", event => {
    if (event.state?.appView === "dashboard" && typeof isSupervisorLoggedIn === "function" && isSupervisorLoggedIn()) {
      document.getElementById("moreDashboardPanel")?.classList.remove("hidden");
    }
  });
  document.addEventListener("DOMContentLoaded", () => {
    updateVisibility();
    setInterval(updateVisibility, 1500);
  });
})();
