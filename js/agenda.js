const agendaState = { items: [] };

async function openAgendaManagement() {
  hideAllViews();
  document.getElementById("agendaView")?.classList.remove("hidden");
  window.scrollTo({ top: 0, behavior: "smooth" });
  try {
    await window.firebaseReady;
    const data = (await window.firebaseDb.ref("meetingAgendas").once("value")).val() || {};
    agendaState.items = Object.entries(data).map(([id, value]) => ({ id, ...value }));
    agendaState.items.sort((a,b) => String(b.createdAt || b.meetingDate || "").localeCompare(String(a.createdAt || a.meetingDate || "")));
    renderAgendas();
  } catch (error) {
    console.error("Agenda load error:", error);
    const el = document.getElementById("agendaError");
    if (el) el.textContent = "Agenda could not be loaded. Check your connection and try again.";
  }
}

function agendaStatus(item) {
  return item.status || "Upcoming";
}

function agendaInjectStyles() {
  if (document.getElementById("agendaEnhancedStyles")) return;
  document.head.insertAdjacentHTML("beforeend", `<style id="agendaEnhancedStyles">
    .agenda-item{display:grid;grid-template-columns:minmax(0,1fr) auto;align-items:start;gap:8px;margin:0;padding:9px 14px;border:0;border-bottom:1px solid #e1e7ed;background:#fff}
    .agenda-item:last-child{border-bottom:0}
    .agenda-item-number{display:none}
    .agenda-item-title{min-width:0;color:#263b31;font-size:14px;font-weight:600;line-height:1.4;overflow-wrap:anywhere;text-align:left}
    .agenda-item-date{color:#53665b;font-size:12px;white-space:nowrap;padding-top:2px}
    .agenda-expand{width:100%;padding:0;border:0;background:transparent;text-align:left;color:inherit;font:inherit;cursor:pointer}
    .agenda-detail{grid-column:1/-1;width:100%;padding:8px 0 2px;color:#566a5e;font-size:12px;line-height:1.55;white-space:pre-wrap;overflow-wrap:anywhere}
    .agenda-detail[hidden]{display:none}
    .agenda-item-actions{display:flex;grid-column:1/-1;gap:8px;flex-wrap:wrap;margin-top:2px}
    .agenda-item-actions button{border:0;border-radius:0;padding:3px 4px;min-height:27px;background:transparent;cursor:pointer;font-weight:700;font-size:11px;display:inline-flex;align-items:center;gap:5px}
    .agenda-edit-btn{color:#175ea8}.agenda-delete-btn{color:#b42318}
    .agenda-discussed-btn{color:#165a9e}.agenda-back-btn{color:#46544b}.agenda-complete-btn{color:#177245}
    .agenda-completed{display:inline-flex;align-items:center;margin-left:5px;padding:3px 6px;border-radius:999px;background:#e6f7ed;color:#177245;font-size:10px;font-weight:800;vertical-align:middle}
    @media(max-width:640px){.agenda-item{grid-template-columns:minmax(0,1fr) auto;gap:5px;padding:9px 10px}.agenda-item-date{grid-column:2;grid-row:1;white-space:nowrap;font-size:11px}.agenda-item-actions{grid-column:1/-1}.agenda-item-title{font-size:14px}.agenda-item-actions button{min-height:30px}}
  </style>`);
}

function agendaItemHTML(item, index) {
  const status = agendaStatus(item);
  const isDecision = ["Decision Taken", "Under Action", "Completed"].includes(status);
  const isCompleted = status === "Completed" || item.decisionStatus === "Completed";
  const actions = `
    ${isSupervisorLoggedIn() ? `<button type="button" class="agenda-edit-btn" onclick="editAgenda('${item.id}')"><i class="fa-solid fa-pen"></i><span>Edit</span></button>` : ""}
    ${isSupervisorLoggedIn() && !isDecision && status !== "Cancelled" ? `<button type="button" class="agenda-discussed-btn" onclick="moveAgendaToDecision('${item.id}')">Discussed</button>` : ""}
    ${isSupervisorLoggedIn() && isDecision && !isCompleted ? `<button type="button" class="agenda-complete-btn" onclick="completeAgenda('${item.id}')">Implemented</button>` : ""}
    ${isSupervisorLoggedIn() && isCompleted ? `<button type="button" class="agenda-discussed-btn" onclick="moveAgendaToDecision('${item.id}')">Move back to Topics Discussed</button>` : ""}
    ${isSupervisorLoggedIn() && isDecision ? `<button type="button" class="agenda-back-btn" onclick="moveAgendaBackToAgenda('${item.id}')">Move back to Meeting Agenda</button>` : ""}
    ${isSupervisorLoggedIn() ? `<button type="button" class="agenda-delete-btn" onclick="deleteAgenda('${item.id}')"><i class="fa-solid fa-trash"></i> Delete</button>` : ""}
  `;
  const addedDate = String(item.createdAt || item.meetingDate || "—").slice(0, 10);
  const detail = [item.description, item.decision ? `Decision: ${item.decision}` : "", item.responsible ? `Responsible: ${item.responsible}` : "", item.targetDate ? `Target date: ${item.targetDate}` : ""].filter(Boolean).join("\n") || "No additional details.";
  return `<article class="agenda-item">
    <div class="agenda-item-title"><button class="agenda-expand" type="button" aria-expanded="false" onclick="toggleAgendaDetails('${item.id}', this)">${escapeHTML(item.title || "—")}${isCompleted ? ` <span class="agenda-completed">Completed</span>` : ""}</button></div>
    <time class="agenda-item-date" datetime="${escapeHTML(addedDate)}">${escapeHTML(addedDate)}</time>
    <div class="agenda-detail" hidden>${escapeHTML(detail)}</div>
    ${isSupervisorLoggedIn() ? `<div class="agenda-item-actions" hidden>${actions}</div>` : ""}
  </article>`;
}

function toggleAgendaDetails(id, button) {
  const card = button.closest(".agenda-item");
  const expanded = button.getAttribute("aria-expanded") !== "true";
  button.setAttribute("aria-expanded", String(expanded));
  const details = card?.querySelector(".agenda-detail");
  const actions = card?.querySelector(".agenda-item-actions");
  if (details) details.hidden = !expanded;
  if (actions) actions.hidden = !expanded;
}

function renderAgendas() { agendaInjectStyles(); const b=document.querySelector("#agendaView .agenda-add-button"); if(b)b.style.display=isSupervisorLoggedIn()?"inline-flex":"none";
  const importButton=document.getElementById("agendaImportButton"); if(importButton) importButton.hidden=!isSupervisorLoggedIn();

  const allAgendas = agendaState.items.filter(item => !["Decision Taken", "Under Action", "Completed"].includes(agendaStatus(item)));
  const underAction = agendaState.items.filter(item => ["Decision Taken", "Under Action"].includes(agendaStatus(item)) && item.decisionStatus !== "Completed");
  const completed = agendaState.items.filter(item => agendaStatus(item) === "Completed" || item.decisionStatus === "Completed");

  const put = (id, data, empty) => {
    const el = document.getElementById(id);
    if (el) {
      el.innerHTML = data.length
        ? data.map((item, index) => agendaItemHTML(item, index)).join("")
        : `<p class="agenda-empty">${empty}</p>`;
    }
  };

  put("allAgendaList", allAgendas, "No agenda items yet.");
  put("actionAgendaList", underAction, "No topics discussed yet.");
  put("completedAgendaList", completed, "No decisions taken yet.");
}

async function importLegacyAgendas() {
  if (!requireSupervisor()) return;
  const button = document.getElementById("agendaImportButton");
  if (!button || button.dataset.importing === "true") return;
  button.dataset.importing = "true";
  button.disabled = true;
  button.textContent = "Backing up and importing…";
  try {
    await window.firebaseReady;
    const firebaseRef = window.firebaseDb.ref("meetingAgendas");
    const current = (await firebaseRef.once("value")).val() || {};
    const backupId = new Date().toISOString().replace(/[:.]/g,"-");
    await window.firebaseDb.ref(`meetingAgendasMigrationBackups/${backupId}`).set({createdAt:new Date().toISOString(),source:"pre-legacy-agenda-import",items:current});
    const authToken = await window.firebaseAuth.currentUser.getIdToken();
    const response = await fetch(SCRIPT_URL,{method:"POST",mode:"cors",headers:{"Content-Type":"text/plain;charset=utf-8"},body:JSON.stringify({action:"getAgendas",authToken})});
    const legacy = await response.json();
    if (!response.ok || legacy.success === false || legacy.error || !Array.isArray(legacy)) throw new Error(legacy.error || "Legacy agenda source returned invalid data.");
    const additions = {};
    legacy.forEach(item => {
      const id=String(item.id || "").trim();
      const title=String(item.title || "").trim();
      const meetingDate=String(item.meetingDate || "").trim();
      if (!id || !title || !meetingDate || current[id]) return;
      additions[id]={...item,id,title,meetingDate,createdAt:item.createdAt || new Date().toISOString(),updatedAt:item.updatedAt || new Date().toISOString()};
    });
    if (Object.keys(additions).length) await firebaseRef.update(additions);
    await openAgendaManagement();
    alert(`${Object.keys(additions).length} legacy agenda record(s) imported. Existing Firebase records were kept. Backup: ${backupId}`);
  } catch(error) {
    console.error("Legacy agenda import error:",error);
    alert(`Legacy agenda import failed: ${error.message || error}. Firebase data was not overwritten; the pre-import backup is retained if it completed.`);
  } finally {
    delete button.dataset.importing;
    button.disabled = false;
    button.innerHTML = "Import legacy records";
  }
}

function openAgendaForm(editId = "") { if(!requireSupervisor())return; const existing = editId ? agendaState.items.find(item => item.id === editId) : null;
  const isEdit = !!existing;

  document.getElementById("agendaModal")?.remove();

  const title = isEdit ? "Edit agenda item" : "Add new agenda";

  const subtitle = isEdit ? "Update the title or details." : "Add a topic for a meeting.";

  document.body.insertAdjacentHTML(
    "beforeend",
    `
    <div class="program-modal" id="agendaModal">
      <div class="program-modal-card">
        <div class="program-modal-header">
          <div>
            <h3>${title}</h3>
            <p>${subtitle}</p>
          </div>
          <button class="program-close" type="button" onclick="document.getElementById('agendaModal').remove()" aria-label="Close">
            <i class="fa-solid fa-xmark"></i>
          </button>
        </div>

        <form class="program-report-form" onsubmit="saveAgenda(event, '${editId}')">

          <label>
            Title *
            <input name="title" required value="${escapeHTML(existing?.title || "")}" placeholder="e.g. Book release">
          </label>

          <label>
            Details
            <textarea name="description" placeholder="Optional details">${escapeHTML(existing?.description || "")}</textarea>
          </label>

          <label>
            Meeting date *
            <input name="meetingDate" type="date" required value="${escapeHTML(existing?.meetingDate || "")}">
          </label>

          <div class="program-form-actions">
            <button type="button" class="program-cancel" onclick="document.getElementById('agendaModal').remove()">Cancel</button>
            <button class="program-submit" type="submit">
              <i class="fa-solid fa-check"></i>
              ${isEdit ? "Save changes" : "Add agenda"}
            </button>
          </div>
        </form>
      </div>
    </div>
    `
  );
}

function editAgenda(id) {
  openAgendaForm(id);
}

function moveAgendaToDecision(id) {
  updateAgendaStage(id, "Under Action");
}

function moveAgendaBackToAgenda(id) {
  updateAgendaStage(id, "Upcoming");
}

async function saveAgenda(event, editId = "") {
  event.preventDefault(); if(!requireSupervisor())return;

  const values = Object.fromEntries(new FormData(event.target).entries());
  const oldItem = editId ? (agendaState.items.find(item => item.id === editId) || {}) : {};

  const payload = {
    title: String(values.title || oldItem.title || "").trim(),
    description: String(values.description || oldItem.description || "").trim(),
    meetingDate: values.meetingDate || oldItem.meetingDate || "",
    priority: values.priority || oldItem.priority || "Normal",
    status: oldItem.status === "Completed" ? "Completed" : (oldItem.status === "Decision Taken" || oldItem.status === "Under Action" ? oldItem.status : "Upcoming"),
    discussedDate: oldItem.discussedDate || "",
    implementedDate: oldItem.implementedDate || "",
    decision: String(oldItem.decision || "").trim(),
    decisionStatus: oldItem.decisionStatus || "Pending",
    responsible: String(values.responsible || oldItem.responsible || "").trim(),
    targetDate: values.targetDate || oldItem.targetDate || "",
    updatedAt: new Date().toISOString()
  };

  if (!payload.title || !payload.meetingDate) {
    alert("Title and meeting date are required.");
    return;
  }

  let savedId = editId;
  try {
    await window.firebaseReady;

    if (editId) {
      await window.firebaseDb.ref(`meetingAgendas/${editId}`).update({
        ...payload,
        createdAt: oldItem.createdAt || new Date().toISOString()
      });
    } else {
      payload.createdAt = new Date().toISOString();
      const savedRef = await window.firebaseDb.ref("meetingAgendas").push({
        ...payload,
        createdAt: payload.createdAt
      });
      savedId = savedRef.key;
    }

    const savedItem = { ...payload, id: savedId, createdAt: payload.createdAt || oldItem.createdAt || new Date().toISOString() };
    document.getElementById("agendaModal")?.remove();
    await openAgendaManagement();

  } catch (error) {
    console.error("Agenda save error:", error);
    alert("Agenda could not be saved. Check your connection and try again.");
  }
}

async function completeAgenda(id) {
  return updateAgendaStage(id, "Completed");
}

async function updateAgendaStage(id, status) {
  if (!requireSupervisor()) return;
  const item = agendaState.items.find(entry => entry.id === id);
  if (!item) return;
  const now = new Date().toISOString();
  const payload = { ...item, id, status, decisionStatus: status === "Completed" ? "Completed" : (item.decisionStatus || "Pending"), updatedAt: now };
  if (status === "Under Action") payload.discussedDate = now;
  if (status === "Upcoming") { payload.discussedDate = ""; payload.implementedDate = ""; payload.decisionStatus = "Pending"; }
  if (status === "Under Action" && item.status === "Completed") payload.implementedDate = "";
  if (status === "Completed") payload.implementedDate = now;
  try {
    await window.firebaseReady;
    await window.firebaseDb.ref(`meetingAgendas/${id}`).update(payload);
    await openAgendaManagement();
  } catch (error) { console.error("Agenda stage update error:", error); alert("Agenda update failed. Check your connection and try again."); }
}

async function deleteAgenda(id) { if(!requireSupervisor())return; const item = agendaState.items.find(entry => entry.id === id);
  if (!item) return;
  if (!confirm(`Delete "${item.title}"? This cannot be undone.`)) return;
  try {
    await window.firebaseReady;
    await window.firebaseDb.ref(`meetingAgendas/${id}`).remove();
    await openAgendaManagement();
  } catch (error) { console.error("Agenda delete error:", error); alert("Agenda could not be deleted. Check your connection and try again."); }
}
