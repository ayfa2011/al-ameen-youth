const agendaState = { items: [] };
function agendaApiUrl() { return typeof SCRIPT_URL === "string" ? SCRIPT_URL : ""; }
async function agendaSheetRequest(payload) {
  const url = agendaApiUrl();
  if (!url) throw new Error("Spreadsheet connection is not configured.");
  const response = await fetch(url, { method: "POST", mode: "cors", headers: { "Content-Type": "text/plain;charset=utf-8" }, body: JSON.stringify(payload) });
  const result = await response.json();
  if (!response.ok || result.success === false || result.error) throw new Error(result.error || "Spreadsheet save failed.");
  return result;
}

async function openAgendaManagement() {
  hideAllViews();
  document.getElementById("agendaView")?.classList.remove("hidden");
  window.scrollTo({ top: 0, behavior: "smooth" });
  try {
    await window.firebaseReady;
    let data = {};
    try { data = (await window.firebaseDb.ref("meetingAgendas").once("value")).val() || {}; } catch (error) { console.warn("Agenda Firebase read unavailable:", error); }
    agendaState.items = Object.entries(data).map(([id, value]) => ({ id, ...value }));
    if (isSupervisorLoggedIn() && agendaState.items.length) {
      try { await agendaSheetRequest({ action: "syncAgendas", agendas: agendaState.items }); }
      catch (error) { console.warn("Existing agenda migration to spreadsheet failed:", error); }
    }
    const response = await fetch(`${agendaApiUrl()}?action=getAgendas`);
    const sheetItems = await response.json();
    if (!Array.isArray(sheetItems)) throw new Error(sheetItems.error || "Agenda sheet returned an invalid response.");
    const byId = new Map(agendaState.items.map(item => [item.id, item]));
    sheetItems.forEach(item => { if (item.id) byId.set(String(item.id), { ...byId.get(String(item.id)), ...item, id: String(item.id) }); });
    agendaState.items = [...byId.values()];
    agendaState.items.sort((a,b) => String(b.createdAt || b.meetingDate || "").localeCompare(String(a.createdAt || a.meetingDate || "")));
    renderAgendas();
  } catch (error) {
    console.error("Agenda load error:", error);
    const el = document.getElementById("agendaError");
    if (el) el.textContent = "Agenda could not be loaded. Please check the connection.";
  }
}

function agendaStatus(item) {
  return item.status || "Upcoming";
}

function agendaInjectStyles() {
  if (document.getElementById("agendaEnhancedStyles")) return;

  document.head.insertAdjacentHTML("beforeend", `
    <style id="agendaEnhancedStyles">
      .agenda-item { margin:0;border:0;border-bottom:1px solid #e8eee9;background:#fff; }
      .agenda-item summary { list-style:none; }
      .agenda-item summary::-webkit-details-marker { display:none; }
      .agenda-item-summary { display:grid;grid-template-columns:minmax(0,1fr) auto 18px;align-items:center;gap:8px;padding:6px 2px;cursor:pointer; }
      .agenda-item-title { min-width:0;color:#173f6f;font-size:13px;font-weight:700;line-height:1.25; }
      .agenda-item-summary small,.agenda-item-details small { color:#7b887f;font-size:10px;white-space:nowrap; }
      .agenda-chevron { color:#829087;font-size:11px;transition:transform .18s ease; }
      .agenda-item[open] .agenda-chevron { transform:rotate(180deg); }
      .agenda-item-details { padding:0 2px 12px;color:#4b5563;font-size:13px;line-height:1.5; }
      .agenda-item-details p { margin:4px 0 8px;white-space:pre-wrap; }
      .agenda-no-description { color:#89958d;font-style:italic; }

      .agenda-item-actions {
        display:flex;
        gap:7px;
        flex-wrap:wrap;
        justify-content:flex-start;
        margin-top:8px;
      }
      .agenda-item-actions button {
        border:0;
        border-radius:10px;
        padding:6px 9px;
        cursor:pointer;
        font-weight:700;
        font-size:11px;
        display:inline-flex;
        align-items:center;
        gap:6px;
      }
      .agenda-edit-btn { background:#edf4ff; color:#175ea8; }
      .agenda-delete-btn { background:#fff0f0; color:#b42318; }
      .agenda-discussed-btn { background:#e8f2ff; color:#165a9e; }
      .agenda-back-btn { background:#f1f3f5;color:#46544b; }
      .agenda-complete-btn { background:#e6f7ed; color:#177245; }
      .agenda-completed { display:inline-flex;align-items:center;margin-left:5px;padding:3px 6px;border-radius:999px;background:#e6f7ed;color:#177245;font-size:9px;font-weight:800;vertical-align:middle; }

      @media (max-width: 640px) { .agenda-item-summary { grid-template-columns:minmax(0,1fr) auto 16px;gap:5px;padding:5px 1px; }.agenda-item-title { font-size:12px; }.agenda-item-summary small { font-size:9px; }.agenda-item-actions button { min-height:28px; } }
    </style>
  `);
}

function agendaItemHTML(item) {
  const status = agendaStatus(item);
  const isDecision = ["Decision Taken", "Under Action", "Completed"].includes(status);
  const isCompleted = status === "Completed" || item.decisionStatus === "Completed";
  const dateLabel = isCompleted ? "Completed" : isDecision ? "Discussed" : "Added";
  const summaryTitle = `${escapeHTML(item.title || "—")}${isCompleted ? ` <span class="agenda-completed">Completed</span>` : ""}`;
  const actions = `
    ${isSupervisorLoggedIn() ? `<button type="button" class="agenda-edit-btn" onclick="event.stopPropagation();editAgenda('${item.id}')"><i class="fa-solid fa-pen"></i><span>Edit</span></button>` : ""}
    ${isSupervisorLoggedIn() && !isDecision && status !== "Cancelled" ? `<button type="button" class="agenda-discussed-btn" onclick="event.stopPropagation();moveAgendaToDecision('${item.id}')">Discussed</button>` : ""}
    ${isSupervisorLoggedIn() && isDecision && !isCompleted ? `<button type="button" class="agenda-complete-btn" onclick="event.stopPropagation();completeAgenda('${item.id}')">Implemented</button>` : ""}
    ${isSupervisorLoggedIn() && isCompleted ? `<button type="button" class="agenda-discussed-btn" onclick="event.stopPropagation();moveAgendaToDecision('${item.id}')">Move back to Topics Discussed</button>` : ""}
    ${isSupervisorLoggedIn() && isDecision ? `<button type="button" class="agenda-back-btn" onclick="event.stopPropagation();moveAgendaBackToAgenda('${item.id}')">Move back to Meeting Agenda</button>` : ""}
    ${isSupervisorLoggedIn() ? `<button type="button" class="agenda-delete-btn" onclick="event.stopPropagation();deleteAgenda('${item.id}')"><i class="fa-solid fa-trash"></i> Delete</button>` : ""}
  `;
  return `
    <details class="agenda-item">
      <summary class="agenda-item-summary"><span class="agenda-item-title">${summaryTitle}</span><small>${dateLabel}: ${escapeHTML(agendaStageDate(item, isCompleted))}</small><i class="fa-solid fa-chevron-down agenda-chevron"></i></summary>
      <div class="agenda-item-details">
        ${item.description ? `<p>${escapeHTML(item.description)}</p>` : `<p class="agenda-no-description">No additional details.</p>`}
        ${isDecision && item.decision ? `<p><b>Decision:</b> ${escapeHTML(item.decision)}</p>` : ""}
        ${isDecision ? `<small>Added: ${escapeHTML(item.createdAt?.slice(0, 10) || item.meetingDate || "—")}</small>` : ""}
        ${isCompleted ? `<small> · Implemented: ${escapeHTML(item.implementedDate || agendaStageDate(item, true))}</small>` : ""}
        <div class="agenda-item-actions">${actions}</div>
      </div>
    </details>
  `;
}

function agendaStageDate(item, completed = false) {
  if (completed) return item.implementedDate || item.updatedAt?.slice(0, 10) || item.meetingDate || "—";
  if (["Decision Taken", "Under Action"].includes(agendaStatus(item))) return item.discussedDate || item.updatedAt?.slice(0, 10) || item.meetingDate || "—";
  return item.createdAt?.slice(0, 10) || item.meetingDate || "—";
}

function renderAgendas() { agendaInjectStyles(); const b=document.querySelector("#agendaView .agenda-add-button"); if(b)b.style.display=isSupervisorLoggedIn()?"inline-flex":"none";

  const allAgendas = agendaState.items.filter(item => !["Decision Taken", "Under Action", "Completed"].includes(agendaStatus(item)));
  const underAction = agendaState.items.filter(item => ["Decision Taken", "Under Action"].includes(agendaStatus(item)) && item.decisionStatus !== "Completed");
  const completed = agendaState.items.filter(item => agendaStatus(item) === "Completed" || item.decisionStatus === "Completed");

  const put = (id, data, empty) => {
    const el = document.getElementById(id);
    if (el) {
      el.innerHTML = data.length
        ? data.map(agendaItemHTML).join("")
        : `<p class="agenda-empty">${empty}</p>`;
    }
  };

  put("allAgendaList", allAgendas, "No agenda items yet.");
  put("actionAgendaList", underAction, "No topics discussed yet.");
  put("completedAgendaList", completed, "No decisions taken yet.");
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
    try { await agendaSheetRequest({ action: "saveAgenda", agenda: savedItem }); }
    catch (error) { await window.firebaseDb.ref(`meetingAgendas/${savedId}`).update({ sheetSyncPending: true }); throw error; }

    document.getElementById("agendaModal")?.remove();
    await openAgendaManagement();

  } catch (error) {
    console.error("Agenda save error:", error);
    alert("Agenda could not be saved. Please check the connection.");
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
    await agendaSheetRequest({ action: "saveAgenda", agenda: payload });
    await openAgendaManagement();
  } catch (error) { console.error("Agenda stage update error:", error); alert("Update failed. Please check the connection."); }
}

async function deleteAgenda(id) { if(!requireSupervisor())return; const item = agendaState.items.find(entry => entry.id === id);
  if (!item) return;
  if (!confirm(`Delete "${item.title}"? This cannot be undone.`)) return;
  try {
    await window.firebaseReady;
    await window.firebaseDb.ref(`meetingAgendas/${id}`).remove();
    await agendaSheetRequest({ action: "deleteAgenda", id });
    await openAgendaManagement();
  } catch (error) { console.error("Agenda delete error:", error); alert("Agenda could not be deleted. Please check the connection."); }
}
