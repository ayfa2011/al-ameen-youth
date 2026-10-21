// Firebase persistence boundary for chair/table and speaker rental records.
window.RentalsRepository = Object.freeze({
  ready() { return firebaseDataReady(); },
  read(path = "rentals") { return firebaseRead(path); },
  transaction(path, updater, event) { return firebaseAuditedTransaction(path, updater, event); },
  key(path = "rentals") { return firebasePushKey(path); },
  create(updates, event) { return auditedFirebaseUpdate(updates, event); },
  audit(event) { return appendFirebaseAudit(event); }
});
