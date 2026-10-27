// Collections page UI. Database access stays in HouseFundRepository and
// validation/calculations stay in HouseFundService.
let houseFundProjects = [];
let houseFundCurrentProject = null;
let houseFundContributions = [];
let houseFundFilter = "all";
let houseFundBusy = false;

function houseFundMoney(value) {
  return `₹${new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 }).format(Number(value) || 0)}`;
}

function houseFundDate(value) {
  const match = String(value || "").match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return match ? new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3])).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }) : String(value || "");
}

function houseFundCanEdit() {
  return typeof isSupervisorLoggedIn === "function" && isSupervisorLoggedIn();
}

async function renderCollectionsPage() {
  const target = document.getElementById("houseFundContent");
  if (!target) return;
  target.innerHTML = '<div class="house-fund-loading" role="status">ಯೋಜನೆಗಳನ್ನು ಲೋಡ್ ಮಾಡಲಾಗುತ್ತಿದೆ…</div>';
  try {
    await HouseFundRepository.ready?.();
    const snapshot = await HouseFundRepository.readProjects();
    houseFundProjects = HouseFundService.list(snapshot.val());
    houseFundProjects.sort((a, b) => String(b.createdAt || "").localeCompare(String(a.createdAt || "")));
    houseFundCurrentProject = null;
    renderHouseFundProjects();
  } catch (error) {
    console.error("House fund projects could not be loaded:", error);
    target.innerHTML = `<div class="house-fund-error" role="alert">${escapeHTML(error?.message || "ಯೋಜನೆಗಳನ್ನು ಲೋಡ್ ಮಾಡಲು ಸಾಧ್ಯವಾಗಲಿಲ್ಲ.")}</div>`;
  }
}

function renderHouseFundProjects() {
  const target = document.getElementById("houseFundContent");
  if (!target) return;
  document.querySelector("#collectionsView .collections-page-card")?.classList.remove("house-fund-detail-active");
  const canEdit = houseFundCanEdit();
  target.innerHTML = `
    <div class="house-fund-toolbar">${canEdit ? '<button type="button" class="house-fund-primary" data-fund-action="toggle-project-form"><i class="fa-solid fa-plus"></i> New Project</button>' : ""}</div>
    ${canEdit ? `<form class="house-fund-form house-fund-project-form hidden" data-fund-form="project"><h3>ಹೊಸ ಯೋಜನೆ</h3><label>Project Name<input name="projectName" maxlength="120" placeholder="ಉದಾ: ಮನೆ ನಿರ್ಮಾಣ ಸಹಾಯಧನ ಸಂಗ್ರಹ" required></label><label>Closes on<input name="closingDate" type="date" value="2026-12-31"></label><p class="house-fund-form-error" aria-live="polite"></p><button class="house-fund-primary" type="submit">Create Project</button></form>` : ""}
    <div class="house-fund-project-grid">${houseFundProjects.length ? houseFundProjects.map(project => {
      const projectName = escapeHTML(project.projectName || project.title || "Fund Project");
      const subtitle = project.closingDate ? `Closes ${escapeHTML(houseFundDate(project.closingDate))}` : "Closing date not set";
      const id = escapeHTML(project.id);
      const titleMarkup = canEdit
        ? `<button type="button" class="house-fund-project-name" data-fund-action="edit-project" data-project-id="${id}" title="Tap to edit project name">${projectName}</button>`
        : `<strong class="house-fund-project-title">${projectName}</strong>`;
      return `<div class="house-fund-project-card-wrap"><div class="house-fund-project-card"><button type="button" class="house-fund-project-open" data-fund-action="open-project" data-project-id="${id}" aria-label="Open ${projectName}"></button><span class="house-fund-project-icon" aria-hidden="true"><i class="fa-solid fa-house-chimney"></i></span><span class="house-fund-project-copy"><span class="house-fund-project-name-row">${titleMarkup}</span><small>${subtitle}</small></span><i class="fa-solid fa-chevron-right" aria-hidden="true"></i></div></div>`;
    }).join("") : '<div class="house-fund-empty"><i class="fa-solid fa-house-chimney"></i><strong>ಯಾವುದೇ project ಇನ್ನೂ ಇಲ್ಲ</strong><span>ಮೇಲಿನ “New Project” ಬಳಸಿ ಮೊದಲ ಯೋಜನೆ ಆರಂಭಿಸಿ.</span></div>'}</div>
  `;
}

async function openHouseFundProject(projectId) {
  const project = houseFundProjects.find(item => item.id === projectId);
  if (!project) return;
  houseFundCurrentProject = project;
  houseFundFilter = "all";
  const target = document.getElementById("houseFundContent");
  if (!target) return;
  target.innerHTML = '<div class="house-fund-loading" role="status">ದೇಣಿಗೆಗಳನ್ನು ಲೋಡ್ ಮಾಡಲಾಗುತ್ತಿದೆ…</div>';
  try {
    const snapshot = await HouseFundRepository.readContributions(project.id);
    houseFundContributions = HouseFundService.list(snapshot.val());
    renderHouseFundProjectDetail();
  } catch (error) {
    console.error("House fund contributions could not be loaded:", error);
    target.innerHTML = `<div class="house-fund-error" role="alert">${escapeHTML(error?.message || "ದೇಣಿಗೆಗಳನ್ನು ಲೋಡ್ ಮಾಡಲು ಸಾಧ್ಯವಾಗಲಿಲ್ಲ.")}</div><button class="house-fund-secondary" data-fund-action="back-projects">ಹಿಂದಕ್ಕೆ</button>`;
  }
}

function renderHouseFundProjectDetail() {
  const target = document.getElementById("houseFundContent");
  const project = houseFundCurrentProject;
  if (!target || !project) return;
  document.querySelector("#collectionsView .collections-page-card")?.classList.add("house-fund-detail-active");
  const totals = HouseFundService.totals(houseFundContributions);
  const rows = HouseFundService.sort(houseFundContributions, houseFundFilter);
  const canEdit = houseFundCanEdit();
  const filters = [["all", "All"], ["paid", "Paid Only"], ["pledged", "Promise Only"], ["top", "Top Donors"], ["recent", "Recent First"], ["members", "Members"], ["supporters", "Non-Members"]];
  target.innerHTML = `
    <header class="house-fund-detail-heading"><div class="house-fund-detail-title"><button type="button" class="house-fund-back-icon" data-fund-action="back-projects" aria-label="Back to projects" title="Back to projects"><i class="fa-solid fa-arrow-left"></i></button><h2>${canEdit ? `<button type="button" class="house-fund-editable house-fund-detail-name" data-fund-action="edit-project-name" data-project-id="${escapeHTML(project.id)}" title="Tap to edit project">${escapeHTML(project.projectName || project.title || "Fund Project")}</button>` : escapeHTML(project.projectName || project.title || "Fund Project")}</h2></div><div class="house-fund-detail-actions">${project.closingDate ? `<span class="house-fund-closing-pill"><i class="fa-regular fa-calendar"></i> Closes: ${escapeHTML(houseFundDate(project.closingDate))}</span>` : ""}${canEdit ? `<button type="button" class="house-fund-icon-btn" data-fund-action="edit-project-date" aria-label="Edit closing date" title="Edit closing date"><i class="fa-regular fa-calendar"></i></button><button type="button" class="house-fund-primary house-fund-add-trigger" data-fund-action="open-contribution-form"><i class="fa-solid fa-plus"></i> Add Contribution</button>` : ""}</div></header>
    <section class="house-fund-summary" aria-label="Fund summary"><div class="house-fund-summary-metric"><span>Total Collected</span><strong>${houseFundMoney(totals.collected)}</strong><small>${houseFundContributions.filter(item => item.status === "paid").length} paid</small></div><span class="house-fund-summary-divider" aria-hidden="true"></span><div class="house-fund-summary-metric"><span>Total Promise</span><strong>${houseFundMoney(totals.pledged)}</strong><small>${houseFundContributions.filter(item => item.status === "pledged").length} Promise</small></div></section>
    ${canEdit ? `<dialog id="houseFundContributionDialog" class="house-fund-dialog" data-fund-action="dismiss-contribution-form"><form class="house-fund-form house-fund-contribution-form" data-fund-form="contribution"><div class="house-fund-dialog-heading"><div><p class="house-fund-eyebrow">${escapeHTML(project.projectName || "Fund Project")}</p><h3>Add Contribution</h3></div><button type="button" class="house-fund-dialog-close" data-fund-action="close-contribution-form" aria-label="Close"><i class="fa-solid fa-xmark"></i></button></div><label>Name<input name="name" maxlength="120" required></label><label>Place<input name="place" maxlength="120" placeholder="Place / town"></label><label>Amount (₹)<input name="amount" type="number" min="1" max="1000000000" step="1" inputmode="numeric" required></label><label>Contributor Type<select name="contributorType" required><option value="member">Al-Ameen Member</option><option value="supporter">Supporter / Well-Wisher</option></select></label><label>Status<select name="status" required><option value="paid">Paid</option><option value="pledged">Promise</option></select></label><p class="house-fund-form-error" aria-live="polite"></p><button type="submit" class="house-fund-primary"><i class="fa-solid fa-plus"></i> Save Contribution</button></form></dialog>` : ""}
    <section class="house-fund-list-section"><div class="house-fund-list-heading"><h3>Contributors</h3><span>${rows.length} records</span></div><div class="house-fund-filters" role="group" aria-label="Filter contributions">${filters.map(([id, label]) => `<button type="button" class="house-fund-filter ${houseFundFilter === id ? "active" : ""}" data-fund-action="filter" data-filter="${id}" aria-pressed="${houseFundFilter === id}">${label}</button>`).join("")}</div>
      <div class="house-fund-donor-list">${rows.length ? rows.map((item, index) => `<article class="house-fund-donor-card"><span class="house-fund-rank">${index + 1}</span><div class="house-fund-donor-main"><div class="house-fund-donor-identity">${canEdit ? `<button type="button" class="house-fund-editable house-fund-donor-name" data-fund-action="edit-donor-name" data-record-id="${escapeHTML(item.id)}" title="Tap to edit name">${escapeHTML(item.name || "—")}</button>` : `<strong>${escapeHTML(item.name || "—")}</strong>`}<span>${escapeHTML(item.place || "Place not provided")}</span></div><div class="house-fund-badges"><span class="house-fund-donor-tag ${item.contributorType === "member" ? "member" : "supporter"}"><i></i>${item.contributorType === "member" ? "Member" : "Supporter"}</span><span class="house-fund-donor-tag ${item.status === "paid" ? "paid" : "promise"}"><i></i>${item.status === "paid" ? "Paid" : "Promise"}</span></div></div><strong class="house-fund-donor-amount">${item.status === "paid" ? '<i class="fa-solid fa-circle-check" aria-label="Paid"></i>' : ""}${canEdit ? `<button type="button" class="house-fund-editable house-fund-donor-amount-btn" data-fund-action="edit-donor-amount" data-record-id="${escapeHTML(item.id)}" title="Tap to edit amount"><span>${houseFundMoney(item.amount)}</span></button>` : `<span>${houseFundMoney(item.amount)}</span>`}</strong></article>`).join("") : '<div class="house-fund-empty">No records match this filter.</div>'}</div>
    </section><button type="button" class="house-fund-whatsapp" data-fund-action="share-whatsapp"><i class="fa-brands fa-whatsapp"></i> Share Summary to WhatsApp</button>
  `;
}

function setHouseFundFilter(filter) {
  const allowed = ["all", "paid", "pledged", "top", "recent", "members", "supporters"];
  houseFundFilter = allowed.includes(filter) ? filter : "all";
  renderHouseFundProjectDetail();
}

function houseFundProjectDialog(project) {
  document.getElementById("houseFundProjectDialog")?.remove();
  document.body.insertAdjacentHTML("beforeend", `<dialog id="houseFundProjectDialog" class="house-fund-dialog"><form class="house-fund-form" data-fund-form="project-edit" data-project-id="${escapeHTML(project.id)}"><div class="house-fund-dialog-heading"><div><h3>Edit Project</h3></div><button type="button" class="house-fund-dialog-close" data-fund-action="close-project-form" aria-label="Close"><i class="fa-solid fa-xmark"></i></button></div><label>Project Name<input name="projectName" maxlength="120" value="${escapeHTML(project.projectName || "")}" required></label><label>Closes on<input name="closingDate" type="date" value="${escapeHTML(project.closingDate || "")}"></label><p class="house-fund-form-error" aria-live="polite"></p><div class="house-fund-dialog-actions"><button type="button" class="house-fund-secondary house-fund-dialog-delete" data-fund-action="delete-project" data-project-id="${escapeHTML(project.id)}"><i class="fa-solid fa-trash"></i> Delete Project</button><button type="submit" class="house-fund-primary"><i class="fa-solid fa-check"></i> Save Changes</button></div></form></dialog>`);
  document.getElementById("houseFundProjectDialog").showModal();
}

function houseFundDonorDialog(record, field) {
  const editingName = field === "name";
  document.getElementById("houseFundDonorDialog")?.remove();
  document.body.insertAdjacentHTML("beforeend", `<dialog id="houseFundDonorDialog" class="house-fund-dialog"><form class="house-fund-form" data-fund-form="donor-edit" data-edit-field="${field}" data-record-id="${escapeHTML(record.id)}"><div class="house-fund-dialog-heading"><div><h3>Edit ${editingName ? "Name" : "Amount"}</h3><p class="house-fund-eyebrow">${escapeHTML(record.name || "")}</p></div><button type="button" class="house-fund-dialog-close" data-fund-action="close-donor-form" aria-label="Close"><i class="fa-solid fa-xmark"></i></button></div>${editingName
    ? `<label>Donor Name<input name="name" maxlength="120" value="${escapeHTML(record.name || "")}" required></label><label>Place<input name="place" maxlength="120" value="${escapeHTML(record.place || "")}"></label>`
    : `<label>Amount (₹)<input name="amount" type="number" min="1" max="1000000000" step="1" inputmode="numeric" value="${escapeHTML(String(record.amount || ""))}" required></label>`}<p class="house-fund-form-error" aria-live="polite"></p><button type="submit" class="house-fund-primary">Save Changes</button></form></dialog>`);
  document.getElementById("houseFundDonorDialog").showModal();
}

function houseFundWhatsAppSummary() {
  const project = houseFundCurrentProject;
  const totals = HouseFundService.totals(houseFundContributions);
  const donors = HouseFundService.sort(houseFundContributions, "top");
  const donorLines = donors.length ? donors.map((item, index) => `${index + 1}. ${item.name} - ${houseFundMoney(item.amount)}${item.status === "paid" ? " ✅" : ""}`).join("\n") : "ಇನ್ನೂ ಯಾವುದೇ ದೇಣಿಗೆ ದಾಖಲಾಗಿಲ್ಲ.";
  return `*ಅಲ್-ಅಮೀನ್ ಅರಂಬೂರು*\n*${project?.projectName || "Egu ಮನೆ ನಿರ್ಮಾಣ ಸಹಾಯಧನ ಸಂಗ್ರಹ"}*\n\nಒಟ್ಟು ಸಂಗ್ರಹ: ${houseFundMoney(totals.collected)}\nಒಟ್ಟು ವಾಗ್ದಾನ: ${houseFundMoney(totals.pledged)}\n\nDonors List\n${donorLines}\n\n🌐 ಸಂಪೂರ್ಣ ಪಟ್ಟಿ ಮತ್ತು ವಿವರಗಳಿಗಾಗಿ ಭೇಟಿ ನೀಡಿ:\nhttps://ayfa2011.github.io/al-ameen-youth/`;
}

document.addEventListener("click", event => {
  const button = event.target.closest("[data-fund-action]");
  if (!button) return;
  const action = button.dataset.fundAction;
  if (action === "toggle-project-form") {
    document.querySelector(".house-fund-project-form")?.classList.toggle("hidden");
    return;
  }
  if (action === "open-contribution-form") { document.getElementById("houseFundContributionDialog")?.showModal(); return; }
  if (action === "close-contribution-form") { document.getElementById("houseFundContributionDialog")?.close(); return; }
  if (action === "close-project-form") { document.getElementById("houseFundProjectDialog")?.close(); return; }
  if (action === "close-donor-form") { document.getElementById("houseFundDonorDialog")?.close(); return; }
  if (action === "edit-project" || action === "edit-project-date" || action === "edit-project-name") {
    if (!houseFundCanEdit()) return;
    const id = button.dataset.projectId || houseFundCurrentProject?.id;
    const project = houseFundProjects.find(item => item.id === id);
    if (project) houseFundProjectDialog(project);
    return;
  }
  if (action === "edit-donor-name" || action === "edit-donor-amount") {
    if (!houseFundCanEdit()) return;
    const record = houseFundContributions.find(item => item.id === button.dataset.recordId);
    if (record) houseFundDonorDialog(record, action === "edit-donor-name" ? "name" : "amount");
    return;
  }
  if (action === "delete-project") {
    if (!houseFundCanEdit()) return;
    const id = button.dataset.projectId || houseFundCurrentProject?.id;
    const project = houseFundProjects.find(item => item.id === id);
    if (!project) return;
    void (async () => {
      if (!await showDeleteConfirmSheet({
        title: "Delete project permanently?",
        message: `Delete project "${project.projectName || "Fund Project"}" and all its contribution records? This cannot be undone.`,
        confirmLabel: "Delete"
      })) return;
      document.getElementById("houseFundProjectDialog")?.close();
      try {
        await HouseFundRepository.deleteProject(id, { action: "houseFund.project.delete", path: `houseConstructionFundProjects/${id}`, recordId: id });
        showToast("Project deleted successfully.", "success");
        houseFundCurrentProject = null;
        await renderCollectionsPage();
      } catch (deleteError) {
        console.error("House fund project could not be deleted:", deleteError);
        showToast(deleteError?.message || "Project ಅಳಿಸಲು ಸಾಧ್ಯವಾಗಲಿಲ್ಲ.");
      }
    })();
    return;
  }
  if (action === "dismiss-contribution-form" && event.target === button) { button.close(); return; }
  if (action === "dismiss-project-form" && event.target === button) { button.close(); return; }
  if (action === "open-project") { void openHouseFundProject(button.dataset.projectId); return; }
  if (action === "back-projects") { houseFundCurrentProject = null; renderHouseFundProjects(); return; }
  if (action === "filter") { setHouseFundFilter(button.dataset.filter); return; }
  if (action === "share-whatsapp") {
    const url = `https://wa.me/?text=${encodeURIComponent(houseFundWhatsAppSummary())}`;
    window.open(url, "_blank", "noopener,noreferrer");
  }
});

document.addEventListener("submit", async event => {
  const form = event.target.closest("form[data-fund-form]");
  if (!form) return;
  event.preventDefault();
  if (!houseFundCanEdit()) { showToast("Officials access is required to add fund records."); return; }
  if (houseFundBusy) return;
  const error = form.querySelector(".house-fund-form-error");
  if (error) error.textContent = "";
  houseFundBusy = true;
  const submit = form.querySelector('[type="submit"]');
  if (submit) submit.disabled = true;
  try {
    const values = Object.fromEntries(new FormData(form));
    if (form.dataset.fundForm === "project") {
      const project = HouseFundService.createProject(values);
      const id = HouseFundRepository.newProjectId();
      await HouseFundRepository.createProject(id, project, { action: "houseFund.project.create", path: `houseConstructionFundProjects/${id}`, recordId: id });
      showToast("Project created successfully.", "success");
      await renderCollectionsPage();
    } else if (form.dataset.fundForm === "project-edit") {
      const projectId = form.dataset.projectId;
      const existing = houseFundProjects.find(item => item.id === projectId) || houseFundCurrentProject;
      if (!existing) throw new Error("Project not found.");
      const project = HouseFundService.updateProject(values, existing);
      await HouseFundRepository.updateProject(existing.id, project, { action: "houseFund.project.update", path: `houseConstructionFundProjects/${existing.id}`, recordId: existing.id });
      const index = houseFundProjects.findIndex(item => item.id === existing.id);
      if (index >= 0) houseFundProjects[index] = { ...existing, ...project };
      houseFundCurrentProject = houseFundProjects[index] || houseFundCurrentProject;
      document.getElementById("houseFundProjectDialog")?.close();
      if (houseFundCurrentProject) renderHouseFundProjectDetail();
      else renderHouseFundProjects();
      showToast("Project updated successfully.", "success");
    } else if (form.dataset.fundForm === "donor-edit" && houseFundCurrentProject) {
      const recordId = form.dataset.recordId;
      const existing = houseFundContributions.find(item => item.id === recordId);
      if (!existing) throw new Error("Record not found.");
      const field = form.dataset.editField;
      let updated;
      if (field === "name") {
        updated = HouseFundService.createContribution({ name: values.name, place: values.place, amount: existing.amount, contributorType: existing.contributorType, status: existing.status });
      } else {
        updated = HouseFundService.createContribution({ name: existing.name, place: existing.place, amount: values.amount, contributorType: existing.contributorType, status: existing.status });
      }
      await HouseFundRepository.updateContribution(houseFundCurrentProject.id, recordId, updated, { action: "houseFund.contribution.update", path: `houseConstructionFundContributions/${houseFundCurrentProject.id}` });
      const index = houseFundContributions.findIndex(item => item.id === recordId);
      if (index >= 0) houseFundContributions[index] = { ...updated, id: recordId };
      document.getElementById("houseFundDonorDialog")?.close();
      renderHouseFundProjectDetail();
      showToast("Record updated successfully.", "success");
    } else if (form.dataset.fundForm === "contribution" && houseFundCurrentProject) {
      const contribution = HouseFundService.createContribution(values);
      await HouseFundRepository.createContribution(houseFundCurrentProject.id, contribution, { action: "houseFund.contribution.create", path: `houseConstructionFundContributions/${houseFundCurrentProject.id}` });
      const snapshot = await HouseFundRepository.readContributions(houseFundCurrentProject.id);
      houseFundContributions = HouseFundService.list(snapshot.val());
      renderHouseFundProjectDetail();
      showToast("Contribution saved successfully.", "success");
    }
  } catch (saveError) {
    console.error("House fund record could not be saved:", saveError);
    if (error) error.textContent = saveError?.message || "ದಾಖಲೆಯನ್ನು ಉಳಿಸಲು ಸಾಧ್ಯವಾಗಲಿಲ್ಲ.";
    else showToast(saveError?.message || "ದಾಖಲೆಯನ್ನು ಉಳಿಸಲು ಸಾಧ್ಯವಾಗಲಿಲ್ಲ.");
  } finally {
    houseFundBusy = false;
    if (submit?.isConnected) submit.disabled = false;
  }
});

window.renderCollectionsPage = renderCollectionsPage;
