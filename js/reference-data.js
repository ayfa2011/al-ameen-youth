// Read-only reference datasets used to keep content out of the layout files.
const referenceDataState = { assets: [], bloodGroups: {}, historicalRentals: {}, financeReports: {}, officeBearers: {} };

async function loadReferenceData(path, stateKey) {
  const snapshot = await ReferenceDataRepository.read(path);
  const value = snapshot.val();
  referenceDataState[stateKey] = value || (stateKey === "assets" ? [] : {});
  return referenceDataState[stateKey];
}
