// Read-only repository for Firebase-backed reference datasets.
window.ReferenceDataRepository = Object.freeze({
  read(path) { return firebaseRead(path); }
});
