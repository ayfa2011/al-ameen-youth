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
  const display = value => {
    if (value == null) return "—";
    if (typeof value === "object") return JSON.stringify(value);
    return String(value);
  };
  const escapeHtml = value => display(value).replace(/[&<>"']/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char]));

  async function loadRecords() {
    const collection = document.getElementById("firebaseExportCollection")?.value || "members";
    const host = document.getElementById("firebaseExportRecords");
    if (!host) return;
    host.replaceChildren();
    status("Loading records…");
    try {
      if (typeof isSupervisorLoggedIn !== "function" || !isSupervisorLoggedIn()) throw new Error("Sign in as an official to view Firebase records.");
      if (typeof firebaseRead !== "function") throw new Error("Firebase is not configured.");
      const snapshot = await firebaseRead(paths[collection]);
      const rows = toRows(snapshot.val());
      if (!rows.length) { status("No records found in this collection."); return; }
      const columns = [...new Set(rows.flatMap(row => Object.keys(row)))];
      host.innerHTML = `<div class="firebase-export-table-wrap"><table class="firebase-export-table"><thead><tr>${columns.map(column => `<th scope="col">${escapeHtml(column)}</th>`).join("")}</tr></thead><tbody>${rows.map(row => `<tr>${columns.map(column => `<td data-label="${escapeHtml(column)}">${escapeHtml(row[column])}</td>`).join("")}</tr>`).join("")}</tbody></table></div>`;
      status(`${rows.length} ${rows.length === 1 ? "record" : "records"}`);
    } catch (error) {
      status(error?.message || "Could not load records.");
    }
  }

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
      status(`Exported ${rows.length} ${rows.length === 1 ? "record" : "records"}.`);
    } catch (error) {
      status(error?.message || "Could not export records.");
    }
  }

  function updateVisibility() {
    const visible = typeof isSupervisorLoggedIn === "function" && isSupervisorLoggedIn();
    panel()?.classList.toggle("hidden", !visible);
    if (!visible) {
      panel()?.classList.add("hidden");
      document.getElementById("moreDashboardPanel")?.classList.add("hidden");
    }
  }
  window.toggleMoreDashboard = function () {
    const more = document.getElementById("moreDashboardPanel");
    more?.classList.toggle("hidden");
    panel()?.classList.add("hidden");
  };
  window.openFirebaseExportPanel = function () {
    const more = document.getElementById("moreDashboardPanel");
    const exportPanel = panel();
    if (typeof isSupervisorLoggedIn !== "function" || !isSupervisorLoggedIn()) {
      status("Sign in as an official to export Firebase records.");
      exportPanel?.classList.remove("hidden");
      more?.classList.add("hidden");
      return;
    }
    exportPanel?.classList.toggle("hidden");
    more?.classList.add("hidden");
    if (!exportPanel?.classList.contains("hidden")) loadRecords();
  };
  document.addEventListener("DOMContentLoaded", () => {
    document.getElementById("firebaseExportCollection")?.addEventListener("change", loadRecords);
    document.getElementById("exportFirebaseExcel")?.addEventListener("click", exportExcel);
    updateVisibility();
    setInterval(updateVisibility, 1500);
  });
})();
