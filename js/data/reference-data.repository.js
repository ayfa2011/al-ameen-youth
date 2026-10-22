// Firebase-backed reference datasets and official-only office bearer edits.
window.ReferenceDataRepository = Object.freeze({
  read(path) { return firebaseRead(path); },
  writeOfficeBearers(year, roster, event) {
    if (typeof isSupervisorLoggedIn !== "function" || !isSupervisorLoggedIn()) {
      throw new Error("Officials access is required to edit office bearers.");
    }
    return auditedFirebaseUpdate({ [`officeBearers/${year}`]: roster }, event);
  }
});
