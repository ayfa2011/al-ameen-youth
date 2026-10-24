// Firebase Realtime Database boundary for house construction fund data.
window.HouseFundRepository = Object.freeze({
  ready() { return firebaseDataReady(); },
  readProjects() { return firebaseRead("houseConstructionFundProjects"); },
  readContributions(projectId) {
    const id = String(projectId || "");
    if (!/^[A-Za-z0-9_-]{1,128}$/.test(id)) throw new Error("Invalid project reference.");
    return firebaseRead(`houseConstructionFundContributions/${id}`);
  },
  createProject(projectId, project, auditEvent) {
    const id = String(projectId || "");
    if (!/^[A-Za-z0-9_-]{1,128}$/.test(id)) throw new Error("Invalid project reference.");
    return auditedFirebaseUpdate({ [`houseConstructionFundProjects/${id}`]: project }, auditEvent);
  },
  createContribution(projectId, contribution, auditEvent) {
    const id = String(projectId || "");
    if (!/^[A-Za-z0-9_-]{1,128}$/.test(id)) throw new Error("Invalid project reference.");
    const contributionId = firebasePushKey(`houseConstructionFundContributions/${id}`);
    return auditedFirebaseUpdate({ [`houseConstructionFundContributions/${id}/${contributionId}`]: contribution }, {
      ...auditEvent,
      recordId: contributionId
    });
  },
  newProjectId() { return firebasePushKey("houseConstructionFundProjects"); }
});
