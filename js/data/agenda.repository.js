// Firebase persistence boundary for meeting agenda records and migration backups.
window.AgendaRepository = Object.freeze({
  ready() { return firebaseDataReady(); },
  read(path = "meetingAgendas") { return firebaseRead(path); },
  transaction(path, updater, event) { return firebaseAuditedTransaction(path, updater, event); },
  key(path = "meetingAgendas") { return firebasePushKey(path); },
  update(updates, event) { return auditedFirebaseUpdate(updates, event); },
  audit(event) { return appendFirebaseAudit(event); }
});
