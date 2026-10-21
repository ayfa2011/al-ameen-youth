// App shell lifecycle and initial view setup.
document.addEventListener("DOMContentLoaded", () => {
    if ("serviceWorker" in navigator && (location.protocol === "https:" || location.hostname === "localhost")) {
      // v10: uniform top bar — drop old shell, force fresh CSS/HTML.
      caches?.keys?.().then(keys => Promise.all((keys || []).filter(k => k.indexOf("alameen-shell-") === 0 && k !== "alameen-shell-v10-topbar-uniform").map(k => caches.delete(k)))).catch(() => {});
      navigator.serviceWorker.getRegistrations?.().then(regs => regs.forEach(r => r.update?.().catch(() => {}))).catch(() => {});
      navigator.serviceWorker.register("service-worker.js").catch(error => console.warn("Offline shell could not be registered:", error));
    }
    if (typeof isRoleAuthenticated === "function" && isRoleAuthenticated() && typeof showDashboard === "function") showDashboard();
  });
