// Firebase persistence boundary for member and blood donation records.
window.MembersRepository = Object.freeze({
  ready() { return firebaseDataReady(); },
  read(path = "members") { return firebaseRead(path); },
  transaction(path, updater, event) { return firebaseAuditedTransaction(path, updater, event); },
  key(path) { return firebasePushKey(path); },
  update(updates, event) { return auditedFirebaseUpdate(updates, event); },
  audit(event) { return appendFirebaseAudit(event); }
});
