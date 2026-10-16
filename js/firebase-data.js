// Firebase write helpers live separately from page rendering. Keep UI/design
// changes out of this module and always pass mutation writes through helpers.
function createFirebaseAuditEvent({ action, path, recordId = "", beforeUpdatedAt = "", afterUpdatedAt = "" }) {
  const user = window.firebaseAuth?.currentUser;
  const role = typeof currentUserRole === "function" ? currentUserRole() : "";
  if (!user || role !== "official") throw new Error("An authenticated official session is required to change records.");
  return {
    action: String(action || "update").slice(0, 80),
    path: String(path || "").slice(0, 240),
    recordId: String(recordId || "").slice(0, 160),
    actorUid: String(user.uid || "").slice(0, 128),
    actorRole: role,
    beforeUpdatedAt: String(beforeUpdatedAt || "").slice(0, 80),
    afterUpdatedAt: String(afterUpdatedAt || "").slice(0, 80),
    clientAt: new Date().toISOString(),
    createdAt: firebase.database.ServerValue.TIMESTAMP
  };
}

function createFirebaseAuditUpdate(event) {
  const auditId = window.firebaseDb.ref("auditLog").push().key;
  return { [`auditLog/${auditId}`]: createFirebaseAuditEvent(event) };
}

async function auditedFirebaseUpdate(updates, event) {
  await window.firebaseReady;
  if (!window.firebaseDb) throw new Error(window.firebaseConfigError || "Firebase Database is unavailable.");
  await window.firebaseDb.ref().update({ ...updates, ...createFirebaseAuditUpdate(event) });
}

// Record transactions only after their data transaction commits. If this
// secondary append fails, preserve the successful business write and surface
// the audit failure for monitoring instead of encouraging a duplicate retry.
async function appendFirebaseAudit(event) {
  try {
    await window.firebaseReady;
    if (!window.firebaseDb) throw new Error("Firebase Database is unavailable.");
    await window.firebaseDb.ref("auditLog").push(createFirebaseAuditEvent(event));
  } catch (error) {
    console.error("Firebase audit event could not be recorded:", error);
    return false;
  }
  return true;
}
