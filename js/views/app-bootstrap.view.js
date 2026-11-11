// App shell lifecycle and initial view setup.
document.addEventListener("DOMContentLoaded", () => {
    if ("serviceWorker" in navigator && (location.protocol === "https:" || location.hostname === "localhost")) {
      navigator.serviceWorker.getRegistrations?.().then(regs => regs.forEach(r => r.update?.().catch(() => {}))).catch(() => {});
      navigator.serviceWorker.register("service-worker.js").catch(error => console.warn("Offline shell could not be registered:", error));
      navigator.serviceWorker.addEventListener("controllerchange", () => window.location.reload());
      navigator.serviceWorker.addEventListener("message", event => {
        if (event.data && event.data.type === "SW_UPDATE" && event.data.reload) window.location.reload();
      });
    }
    if (typeof isRoleAuthenticated === "function" && isRoleAuthenticated() && typeof showDashboard === "function") showDashboard();
  });
