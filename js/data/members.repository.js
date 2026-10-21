// Firebase persistence boundary for member and blood donation records.
window.MembersRepository = Object.freeze({
  ready() { return firebaseDataReady(); },
  read(path = "members") { return firebaseRead(path); },
  async resolveMemberKey(memberId) {
    const id = String(memberId ?? "");
    const snapshot = await firebaseRead("members");
    const records = Object.entries(snapshot.val() || {});
    const matches = records.filter(([, member]) => [member?.id, member?.["Member ID"]]
      .some(value => value !== null && value !== undefined && String(value) === id));
    if (matches.length === 1) return matches[0][0];
    if (matches.length > 1) throw new Error("Member ID matches more than one database record. No record was changed.");
    const direct = records.find(([key]) => key === id);
    if (direct) return direct[0];
    throw new Error("Member record could not be found. Refresh the Members page and try again.");
  },
  transaction(path, updater, event) { return firebaseAuditedTransaction(path, updater, event); },
  key(path) { return firebasePushKey(path); },
  update(updates, event) { return auditedFirebaseUpdate(updates, event); },
  audit(event) { return appendFirebaseAudit(event); }
});
