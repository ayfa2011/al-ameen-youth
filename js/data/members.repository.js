// Firebase persistence boundary for member and blood donation records.
window.MembersRepository = Object.freeze({
  ready() { return firebaseDataReady(); },
  read(path = "members") { return firebaseRead(path); },
  async resolveMemberKey(memberId) {
    const id = String(memberId ?? "");
    if (!id) throw new Error("Member ID was missing. Refresh the Members page and try again.");

    // Records written by this site are keyed by a push ID and carry a numeric
    // `id`; legacy/imported rows are keyed by the member id itself and may use
    // `Member ID`. Try the direct key first so the common case needs no scan.
    const directSnapshot = await firebaseRead(`members/${id}`);
    if (directSnapshot.val()) return id;

    const snapshot = await firebaseRead("members");
    const records = Object.entries(snapshot.val() || {});
    const matches = records.filter(([, member]) => [member?.id, member?.memberId, member?.["Member ID"]]
      .some(value => value !== null && value !== undefined && String(value) === id));
    if (matches.length === 1) return matches[0][0];
    if (matches.length > 1) throw new Error("Member ID matches more than one database record. No record was changed.");
    throw new Error("Member record could not be found. Refresh the Members page and try again.");
  },
  transaction(path, updater, event) { return firebaseAuditedTransaction(path, updater, event, { retryOnCachedNull: true }); },
  key(path) { return firebasePushKey(path); },
  update(updates, event) { return auditedFirebaseUpdate(updates, event); },
  audit(event) { return appendFirebaseAudit(event); }
});
