// Firebase write helpers live separately from page rendering. Keep UI/design
// changes out of this module and always pass mutation writes through helpers.
async function firebaseDataReady() {
  if (!window.firebaseReady || !window.firebaseDb) throw new Error(window.firebaseConfigError || "Firebase Database is unavailable.");
  await window.firebaseReady;
  if (!window.firebaseDb) throw new Error(window.firebaseConfigError || "Firebase Database is unavailable.");
}

async function firebaseRead(path) {
  await firebaseDataReady();
  return window.firebaseDb.ref(String(path || "")).once("value");
}

async function firebaseTransaction(path, updater) {
  await firebaseDataReady();
  const ref = window.firebaseDb.ref(String(path || ""));
  // RTDB can invoke a transaction updater immediately with its local cached
  // value (including null) and abort before checking the server. Prime this
  // exact path first so existing records are not mistaken for missing ones.
  await ref.once("value");
  return ref.transaction(updater);
}

async function firebaseAuditedTransaction(path, updater, auditEvent) {
  const result = await firebaseTransaction(path, updater);
  if (result.committed && auditEvent) await appendFirebaseAudit(auditEvent);
  return result;
}

function firebasePushKey(path) {
  if (!window.firebaseDb) throw new Error(window.firebaseConfigError || "Firebase Database is unavailable.");
  return window.firebaseDb.ref(String(path || "")).push().key;
}

async function firebasePush(path, value) {
  await firebaseDataReady();
  return window.firebaseDb.ref(String(path || "")).push(value);
}

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

async function auditedFirebaseUpdate(updates, event) {
  await window.firebaseReady;
  if (!window.firebaseDb) throw new Error(window.firebaseConfigError || "Firebase Database is unavailable.");
  // Write the business data first and on its own. Bundling the audit record into
  // the same root update() made one atomic write whose failure surfaced as
  // "update at / failed: permission_denied" — impossible to attribute, and it
  // rolled back a legitimate save because of a logging rule.
  // Also avoid a root-level update() entirely: the rules grant writes at
  // individual nodes (e.g. /officeBearers/$year) but not at "/", so a
  // multi-location update() at the root is always denied even for officials.
  // Write each path to its own ref so the node-level .write rules apply.
  const entries = Object.entries(updates || {});
  if (entries.length === 1) {
    await window.firebaseDb.ref(entries[0][0]).set(entries[0][1]);
  } else {
    await Promise.all(entries.map(([path, value]) => window.firebaseDb.ref(path).set(value)));
  }
  // The data is already committed, so an audit failure must not fail the save.
  if (event) await appendFirebaseAudit(event);
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
