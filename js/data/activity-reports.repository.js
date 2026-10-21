// Firebase persistence boundary for program reports and Drive folder metadata.
window.ActivityReportsRepository = Object.freeze({
  ready() { return firebaseDataReady(); },
  read(path) { return firebaseRead(path); },
  transaction(path, updater, event) { return firebaseAuditedTransaction(path, updater, event); },
  key(path = "programReports") { return firebasePushKey(path); },
  create(updates, event) { return auditedFirebaseUpdate(updates, event); },
  audit(event) { return appendFirebaseAudit(event); }
});
