// Firebase persistence boundary for programs and attendance records.
window.AttendanceRepository = Object.freeze({
  ready() { return firebaseDataReady(); },
  read(path) { return firebaseRead(path); },
  transaction(path, updater, event) { return firebaseAuditedTransaction(path, updater, event); },
  key(path = "programs") { return firebasePushKey(path); },
  update(updates, event) { return auditedFirebaseUpdate(updates, event); },
  audit(event) { return appendFirebaseAudit(event); },
  async readMemberSummarySources() {
    const [attendance, programs] = await Promise.all([firebaseRead("attendance"), firebaseRead("programs")]);
    return { attendance, programs };
  }
});
