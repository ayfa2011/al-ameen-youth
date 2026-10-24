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
  newProjectId() { return firebasePushKey("houseConstructionFundProjects"); },
  updateProject(projectId, project, auditEvent) {
    const id = String(projectId || "");
    if (!/^[A-Za-z0-9_-]{1,128}$/.test(id)) throw new Error("Invalid project reference.");
    return auditedFirebaseUpdate({ [`houseConstructionFundProjects/${id}`]: project }, auditEvent);
  },
  deleteProject(projectId, auditEvent) {
    const id = String(projectId || "");
    if (!/^[A-Za-z0-9_-]{1,128}$/.test(id)) throw new Error("Invalid project reference.");
    return auditedFirebaseUpdate({ [`houseConstructionFundProjects/${id}`]: null, [`houseConstructionFundContributions/${id}`]: null }, auditEvent);
  },
  newContributionId(projectId) { return firebasePushKey(`houseConstructionFundContributions/${projectId}`); },
  updateContribution(projectId, contributionId, contribution, auditEvent) {
    const id = String(projectId || "");
    const recordId = String(contributionId || "");
    if (!/^[A-Za-z0-9_-]{1,128}$/.test(id) || !/^[A-Za-z0-9_-]{1,128}$/.test(recordId)) throw new Error("Invalid contribution reference.");
    return auditedFirebaseUpdate({ [`houseConstructionFundContributions/${id}/${recordId}`]: contribution }, { ...auditEvent, recordId });
  },
  deleteContribution(projectId, contributionId, auditEvent) {
    const id = String(projectId || "");
    const recordId = String(contributionId || "");
    if (!/^[A-Za-z0-9_-]{1,128}$/.test(id) || !/^[A-Za-z0-9_-]{1,128}$/.test(recordId)) throw new Error("Invalid contribution reference.");
    return auditedFirebaseUpdate({ [`houseConstructionFundContributions/${id}/${recordId}`]: null }, { ...auditEvent, recordId });
  }
});
