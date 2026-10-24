// House fund validation and report calculations, independent of the UI.
window.HouseFundService = Object.freeze({
  list(value) {
    if (!value || typeof value !== "object") return [];
    return Object.entries(value).filter(([, item]) => item && typeof item === "object").map(([id, item]) => ({ ...item, id }));
  },
  createProject(values) {
    const projectName = String(values?.projectName || "").trim();
    const closingDate = String(values?.closingDate || "").trim();
    if (!projectName) throw new Error("Project name is required.");
    if (projectName.length > 120) throw new Error("Project name must be 120 characters or fewer.");
    if (closingDate && !/^\d{4}-\d{2}-\d{2}$/.test(closingDate)) throw new Error("Choose a valid closing date.");
    return { projectName, title: "ಮನೆ ನಿರ್ಮಾಣ ಸಹಾಯಧನ ಸಂಗ್ರಹ", closingDate, createdAt: new Date().toISOString() };
  },
  createContribution(values) {
    const name = String(values?.name || "").trim();
    const place = String(values?.place || "").trim();
    const amount = Number(values?.amount);
    const contributorType = String(values?.contributorType || "");
    const status = String(values?.status || "");
    if (!name) throw new Error("Contributor name is required.");
    if (name.length > 120 || place.length > 120) throw new Error("Name and place must be 120 characters or fewer.");
    if (!Number.isFinite(amount) || amount <= 0 || amount > 1000000000) throw new Error("Enter a valid contribution amount.");
    if (!["member", "supporter"].includes(contributorType)) throw new Error("Choose a contributor type.");
    if (!["paid", "pledged"].includes(status)) throw new Error("Choose a contribution status.");
    return { name, place, amount, contributorType, status, createdAt: new Date().toISOString() };
  },
  updateProject(values, existing) {
    const projectName = String(values?.projectName || "").trim();
    const closingDate = String(values?.closingDate || "").trim();
    if (!projectName) throw new Error("Project name is required.");
    if (projectName.length > 120) throw new Error("Project name must be 120 characters or fewer.");
    if (closingDate && !/^\d{4}-\d{2}-\d{2}$/.test(closingDate)) throw new Error("Choose a valid closing date.");
    return { projectName, title: existing?.title || "ಮನೆ ನಿರ್ಮಾಣ ಸಹಾಯಧನ ಸಂಗ್ರಹ", closingDate, createdAt: existing?.createdAt || new Date().toISOString() };
  },
  totals(contributions) {
    return (contributions || []).reduce((result, item) => {
      const amount = Number(item.amount) || 0;
      if (item.status === "paid") result.collected += amount;
      if (item.status === "pledged") result.pledged += amount;
      return result;
    }, { collected: 0, pledged: 0 });
  },
  sort(contributions, filter) {
    let rows = [...(contributions || [])];
    if (filter === "paid") rows = rows.filter(item => item.status === "paid");
    if (filter === "pledged") rows = rows.filter(item => item.status === "pledged");
    if (filter === "members") rows = rows.filter(item => item.contributorType === "member");
    if (filter === "supporters") rows = rows.filter(item => item.contributorType === "supporter");
    if (filter === "recent") rows.sort((a, b) => String(b.createdAt || "").localeCompare(String(a.createdAt || "")));
    else rows.sort((a, b) => (Number(b.amount) || 0) - (Number(a.amount) || 0));
    return rows;
  }
});
