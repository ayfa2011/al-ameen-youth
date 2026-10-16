// Read-only reference datasets used to keep content out of the layout files.
const referenceDataState = { assets: [], bloodGroups: {}, historicalRentals: {}, financeReports: {}, officeBearers: {} };

async function loadReferenceData(path, stateKey) {
  if (!window.firebaseDb || !window.firebaseAuth?.currentUser) throw new Error("Sign in to view this information.");
  await window.firebaseReady;
  const snapshot = await window.firebaseDb.ref(path).once("value");
  const value = snapshot.val();
  referenceDataState[stateKey] = value || (stateKey === "assets" ? [] : {});
  return referenceDataState[stateKey];
}
