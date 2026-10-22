// Firebase persistence boundary for program reports and Drive folder metadata.
window.ActivityReportsRepository = Object.freeze({
  ready() { return firebaseDataReady(); },
  read(path) { return firebaseRead(path); },
  transaction(path, updater, event) { return firebaseAuditedTransaction(path, updater, event); },
  key(path = "programReports") { return firebasePushKey(path); },
  create(updates, event) { return auditedFirebaseUpdate(updates, event); },
  update(updates, event) { return auditedFirebaseUpdate(updates, event); },
  async set(path, value, event) {
    await firebaseDataReady();
    await window.firebaseDb.ref(String(path || "")).set(value);
    if (event) await appendFirebaseAudit(event);
  },
  async remove(path, event) {
    await firebaseDataReady();
    await window.firebaseDb.ref(String(path || "")).remove();
    if (event) await appendFirebaseAudit(event);
  },
  audit(event) { return appendFirebaseAudit(event); }
});
