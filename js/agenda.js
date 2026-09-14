const agendaState = { items: [] };

async function openAgendaManagement() {
  hideAllViews();
  document.getElementById("agendaView")?.classList.remove("hidden");
  window.scrollTo({ top: 0, behavior: "smooth" });
  try {
    await window.firebaseReady;
    const data = (await window.firebaseDb.ref("meetingAgendas").once("value")).val() || {};
    agendaState.items = Object.entries(data).map(([id, value]) => ({ id, ...value })).sort((a,b) => String(b.meetingDate || "").localeCompare(String(a.meetingDate || "")));
    renderAgendas();
  } catch (error) {
    console.error("Agenda load error:", error);
    const el = document.getElementById("agendaError");
    if (el) el.textContent = "ಅಜೆಂಡಾ data load ಆಗಲಿಲ್ಲ. Firebase connection ಪರಿಶೀಲಿಸಿ.";
  }
}

function agendaStatus(item) {
  return item.status || "Upcoming";
}

function agendaStatusClass(status) {
  const map = {
    "Upcoming": "agenda-status-upcoming",
    "Under Discussion": "agenda-status-discussion",
    "Decision Taken": "agenda-status-decision",
    "Postponed": "agenda-status-postponed",
    "Cancelled": "agenda-status-cancelled"
  };
  return map[status] || "agenda-status-upcoming";
}

function agendaStatusLabel(status) {
  const map = {
    "Upcoming": "ಮುಂದಿನ ಅಜೆಂಡಾ",
    "Under Discussion": "ಚರ್ಚೆಯಲ್ಲಿದೆ",
    "Decision Taken": "ನಿರ್ಣಯ ದಾಖಲಾಗಿದೆ",
    "Postponed": "ಮುಂದೂಡಲಾಗಿದೆ",
    "Cancelled": "ರದ್ದುಪಡಿಸಲಾಗಿದೆ"
  };
  return map[status] || status;
}

function decisionStatusLabel(status) {
  const map = {
    "Pending": "ಕಾರ್ಯಗತಗೊಳಿಸಬೇಕಾಗಿದೆ",
    "In Progress": "ಕಾರ್ಯ ಪ್ರಗತಿಯಲ್ಲಿದೆ",
    "Completed": "ಪೂರ್ಣಗೊಂಡಿದೆ",
    "Not Started": "ಇನ್ನೂ ಆರಂಭವಾಗಿಲ್ಲ"
  };
  return map[status] || status || "ಕಾರ್ಯಗತಗೊಳಿಸಬೇಕಾಗಿದೆ";
}

function decisionStatusClass(status) {
  const map = {
    "Pending": "agenda-decision-status-pending",
    "In Progress": "agenda-decision-status-progress",
    "Completed": "agenda-decision-status-completed",
    "Not Started": "agenda-decision-status-not-started"
  };
  return map[status] || "agenda-decision-status-pending";
}

function agendaInjectStyles() {
  if (document.getElementById("agendaEnhancedStyles")) return;

  document.head.insertAdjacentHTML("beforeend", `
    <style id="agendaEnhancedStyles">
      .agenda-item {
        position: relative;
        display: flex;
        gap: 14px;
        align-items: flex-start;
        justify-content: space-between;
        padding: 16px;
        margin-bottom: 12px;
        border: 1px solid #e5e7eb;
        border-radius: 16px;
        background: #fff;
        box-shadow: 0 3px 12px rgba(15, 23, 42, .05);
      }
      .agenda-item-main { flex: 1; min-width: 0; }
      .agenda-item-title-row {
        display: flex;
        gap: 10px;
        align-items: flex-start;
        justify-content: space-between;
        margin-bottom: 7px;
      }
      .agenda-item-title-row strong {
        font-size: 17px;
        line-height: 1.4;
        color: #173f6f;
      }
      .agenda-status, .agenda-decision-status {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        padding: 5px 9px;
        border-radius: 999px;
        font-size: 11px;
        font-weight: 700;
        white-space: nowrap;
      }
      .agenda-status-upcoming { background:#e8f2ff; color:#165a9e; }
      .agenda-status-discussion { background:#fff4d8; color:#996600; }
      .agenda-status-decision { background:#e6f7ed; color:#177245; }
      .agenda-status-postponed { background:#f1f3f5; color:#5f6368; }
      .agenda-status-cancelled { background:#fdebec; color:#b42318; }

      .agenda-item p {
        margin: 6px 0 9px;
        color: #4b5563;
        line-height: 1.6;
        white-space: pre-wrap;
      }
      .agenda-item small { color:#6b7280; }
      .agenda-decision {
        margin-top: 12px;
        padding: 11px 13px;
        border-left: 4px solid #2e8b57;
        background: #f4fbf6;
        border-radius: 9px;
        color: #334155;
        line-height: 1.6;
      }
      .agenda-decision-actions {
        display:flex;
        align-items:center;
        justify-content:space-between;
        gap:10px;
        margin-top:12px;
        flex-wrap:wrap;
      }
      .agenda-item-actions {
        display:flex;
        gap:7px;
        flex-wrap:wrap;
        justify-content:flex-end;
        flex-shrink:0;
      }
      .agenda-item-actions button,
      .agenda-decision-add-btn {
        border:0;
        border-radius:10px;
        padding:9px 11px;
        cursor:pointer;
        font-weight:700;
        font-size:12px;
        display:inline-flex;
        align-items:center;
        gap:6px;
      }
      .agenda-edit-btn { background:#edf4ff; color:#175ea8; }
      .agenda-delete-btn { background:#fff0f0; color:#b42318; }
      .agenda-decision-add-btn { background:#e8f7ef; color:#177245; }
      .agenda-decision-status-pending { background:#fff4d8; color:#996600; }
      .agenda-decision-status-progress { background:#e8f2ff; color:#165a9e; }
      .agenda-decision-status-completed { background:#e6f7ed; color:#177245; }
      .agenda-decision-status-not-started { background:#f1f3f5; color:#5f6368; }

      @media (max-width: 640px) {
        .agenda-item { padding:13px; gap:9px; flex-direction:column; }
        .agenda-item-title-row { flex-direction:column; gap:7px; }
        .agenda-item-title-row strong { font-size:16px; }
        .agenda-item-actions { width:100%; justify-content:flex-start; }
        .agenda-item-actions button,
        .agenda-decision-add-btn { min-height:40px; }
        .agenda-decision-actions { align-items:flex-start; }
      }
    </style>
  `);
}

function agendaItemHTML(item) {
  const status = agendaStatus(item);
  const isDecision = status === "Decision Taken";

  const decisionBlock = isDecision ? `
    <div class="agenda-decision">
      <b>ನಿರ್ಣಯ:</b> ${escapeHTML(item.decision || "ನಿರ್ಣಯದ ವಿವರ ಸೇರಿಸಿಲ್ಲ.")}
      ${item.responsible ? `<br><b>ಜವಾಬ್ದಾರಿ:</b> ${escapeHTML(item.responsible)}` : ""}
      ${item.targetDate ? `<br><b>ಗುರಿ ದಿನಾಂಕ:</b> ${escapeHTML(item.targetDate)}` : ""}
      <div class="agenda-decision-actions">
        <span class="agenda-decision-status ${decisionStatusClass(item.decisionStatus)}">
          ${escapeHTML(decisionStatusLabel(item.decisionStatus))}
        </span>
        ${isSupervisorLoggedIn() ? `<button type="button" class="agenda-edit-btn" onclick="editDecision('${item.id}')"><i class="fa-solid fa-pen"></i><span>ನಿರ್ಣಯ ತಿದ್ದು</span></button>` : ""}
      </div>
    </div>
  ` : "";

  const moveButton = isSupervisorLoggedIn() && !isDecision && status !== "Cancelled" ? `
    <button type="button" class="agenda-decision-add-btn" onclick="moveAgendaToDecision('${item.id}')">
      <i class="fa-solid fa-check"></i><span>ನಿರ್ಣಯಕ್ಕೆ ಸೇರಿಸಿ</span>
    </button>
  ` : "";

  return `
    <div class="agenda-item">
      <div class="agenda-item-main">
        <div class="agenda-item-title-row">
          <strong>${escapeHTML(item.title || "—")}</strong>
          <span class="agenda-status ${agendaStatusClass(status)}">${escapeHTML(agendaStatusLabel(status))}</span>
        </div>
        ${item.description ? `<p>${escapeHTML(item.description)}</p>` : ""}
        <small>
          <i class="fa-regular fa-calendar"></i>
          ${escapeHTML(item.meetingDate || "—")}
          ${item.priority ? ` · ${escapeHTML(item.priority)}` : ""}
        </small>
        ${decisionBlock}
      </div>

      <div class="agenda-item-actions">${moveButton}${isSupervisorLoggedIn() ? `<button type="button" class="agenda-edit-btn" onclick="editAgenda('${item.id}')" title="Edit"><i class="fa-solid fa-pen"></i><span>ತಿದ್ದು</span></button><button type="button" class="agenda-delete-btn" onclick="deleteAgenda('${item.id}')" title="Delete"><i class="fa-solid fa-trash"></i><span>ಅಳಿಸಿ</span></button>` : ""}</div>
    </div>
  `;
}

function renderAgendas() { agendaInjectStyles(); const b=document.querySelector("#agendaView .agenda-add-button"); if(b)b.style.display=isSupervisorLoggedIn()?"inline-flex":"none";

  const allAgendas = agendaState.items.filter(item => agendaStatus(item) !== "Decision Taken");
  const decisions = agendaState.items.filter(item => agendaStatus(item) === "Decision Taken");

  const put = (id, data, empty) => {
    const el = document.getElementById(id);
    if (el) {
      el.innerHTML = data.length
        ? data.map(agendaItemHTML).join("")
        : `<p class="agenda-empty">${empty}</p>`;
    }
  };

  put("allAgendaList", allAgendas, "ಇನ್ನೂ ಅಜೆಂಡಾ ಸೇರಿಸಿಲ್ಲ.");
  put("decisionAgendaList", decisions, "ಇನ್ನೂ ನಿರ್ಣಯಗಳು ದಾಖಲಾಗಿಲ್ಲ.");
}

function openAgendaForm(editId = "", decisionMode = false) { if(!requireSupervisor())return; const existing = editId ? agendaState.items.find(item => item.id === editId) : null;
  const isEdit = !!existing;

  document.getElementById("agendaModal")?.remove();

  const title = decisionMode
    ? "ಅಜೆಂಡಾವನ್ನು ನಿರ್ಣಯಕ್ಕೆ ಸೇರಿಸಿ"
    : (isEdit ? "ಅಜೆಂಡಾ ತಿದ್ದುಪಡಿ" : "ಹೊಸ ಅಜೆಂಡಾ");

  const subtitle = decisionMode
    ? "ಸಭೆಯಲ್ಲಿ ಚರ್ಚಿಸಿದ ನಂತರದ ನಿರ್ಣಯ ಮತ್ತು ಅದರ ಕಾರ್ಯಸ್ಥಿತಿಯನ್ನು ದಾಖಲಿಸಿ."
    : (isEdit ? "ಅಗತ್ಯವಿರುವ ವಿವರಗಳನ್ನು ಬದಲಾಯಿಸಿ." : "ಮುಂದಿನ ಸಭೆಯಲ್ಲಿ ಚರ್ಚಿಸಬೇಕಾದ ವಿಷಯ ಸೇರಿಸಿ.");

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

        <form class="program-report-form" onsubmit="saveAgenda(event, '${editId}', ${decisionMode})">

          ${decisionMode ? `
            <div style="padding:12px 14px;border-radius:12px;background:#f3f8ff;color:#234d7d;margin-bottom:4px;">
              <div style="font-size:11px;font-weight:700;color:#6b7280;">ಅಜೆಂಡಾ</div>
              <div style="font-size:17px;font-weight:800;margin-top:3px;">${escapeHTML(existing?.title || "—")}</div>
            </div>
          ` : `
            <label>
              Agenda / ವಿಷಯ *
              <input name="title" required value="${escapeHTML(existing?.title || "")}" placeholder="ಉದಾ: ರಕ್ತದಾನ ಕಾರ್ಯಕ್ರಮ">
            </label>

            <label>
              ವಿವರ / Description
              <textarea name="description" placeholder="ಮುಂದಿನ ಸಭೆಯಲ್ಲಿ ಚರ್ಚಿಸಬೇಕಾದ ವಿಷಯ">${escapeHTML(existing?.description || "")}</textarea>
            </label>

            <label>
              ಸಭೆಯ ದಿನಾಂಕ *
              <input name="meetingDate" type="date" required value="${escapeHTML(existing?.meetingDate || "")}">
            </label>

            <label>
              Priority
              <select name="priority">
                <option value="Normal" ${existing?.priority === "Normal" || !existing?.priority ? "selected" : ""}>Normal</option>
                <option value="Important" ${existing?.priority === "Important" ? "selected" : ""}>Important</option>
                <option value="Urgent" ${existing?.priority === "Urgent" ? "selected" : ""}>Urgent</option>
              </select>
            </label>

            <label>
              Status
              <select name="status">
                <option value="Upcoming" ${existing?.status === "Upcoming" || !existing?.status ? "selected" : ""}>ಮುಂದಿನ ಅಜೆಂಡಾ</option>
                <option value="Under Discussion" ${existing?.status === "Under Discussion" ? "selected" : ""}>ಚರ್ಚೆಯಲ್ಲಿದೆ</option>
                <option value="Postponed" ${existing?.status === "Postponed" ? "selected" : ""}>ಮುಂದೂಡಲಾಗಿದೆ</option>
                <option value="Cancelled" ${existing?.status === "Cancelled" ? "selected" : ""}>ರದ್ದುಪಡಿಸಲಾಗಿದೆ</option>
              </select>
            </label>
          `}

          ${decisionMode || isEdit ? `
            <label>
              ನಿರ್ಣಯ / Decision ${decisionMode ? "*" : ""}
              <textarea name="decision" ${decisionMode ? "required" : ""} placeholder="ಸಭೆಯಲ್ಲಿ ತೆಗೆದುಕೊಂಡ ನಿರ್ಣಯವನ್ನು ಇಲ್ಲಿ ಬರೆಯಿರಿ">${escapeHTML(existing?.decision || "")}</textarea>
            </label>

            <label>
              ನಿರ್ಣಯದ ಸ್ಥಿತಿ / Decision Status
              <select name="decisionStatus">
                <option value="Pending" ${existing?.decisionStatus === "Pending" || !existing?.decisionStatus ? "selected" : ""}>ಕಾರ್ಯಗತಗೊಳಿಸಬೇಕಾಗಿದೆ</option>
                <option value="In Progress" ${existing?.decisionStatus === "In Progress" ? "selected" : ""}>ಕಾರ್ಯ ಪ್ರಗತಿಯಲ್ಲಿದೆ</option>
                <option value="Completed" ${existing?.decisionStatus === "Completed" ? "selected" : ""}>ಪೂರ್ಣಗೊಂಡಿದೆ</option>
                <option value="Not Started" ${existing?.decisionStatus === "Not Started" ? "selected" : ""}>ಇನ್ನೂ ಆರಂಭವಾಗಿಲ್ಲ</option>
              </select>
            </label>

            <label>
              ಜವಾಬ್ದಾರಿ / Responsible
              <input name="responsible" value="${escapeHTML(existing?.responsible || "")}" placeholder="ಯಾರಿಗೆ ಜವಾಬ್ದಾರಿ ನೀಡಲಾಗಿದೆ?">
            </label>

            <label>
              ಗುರಿ ದಿನಾಂಕ / Target date
              <input name="targetDate" type="date" value="${escapeHTML(existing?.targetDate || "")}">
            </label>
          ` : ""}

          <div class="program-form-actions">
            <button type="button" class="program-cancel" onclick="document.getElementById('agendaModal').remove()">ರದ್ದು</button>
            <button class="program-submit" type="submit">
              <i class="fa-solid fa-check"></i>
              ${decisionMode ? "ನಿರ್ಣಯ ಉಳಿಸಿ" : (isEdit ? "ಬದಲಾವಣೆ ಉಳಿಸಿ" : "ಅಜೆಂಡಾ ಉಳಿಸಿ")}
            </button>
          </div>
        </form>
      </div>
    </div>
    `
  );
}

function editAgenda(id) {
  openAgendaForm(id, false);
}

function moveAgendaToDecision(id) {
  openAgendaForm(id, true);
}

function editDecision(id) {
  openAgendaForm(id, true);
}

async function saveAgenda(event, editId = "", decisionMode = false) {
  event.preventDefault(); if(!requireSupervisor())return;

  const values = Object.fromEntries(new FormData(event.target).entries());
  const oldItem = editId ? (agendaState.items.find(item => item.id === editId) || {}) : {};

  const payload = {
    title: String(values.title || oldItem.title || "").trim(),
    description: String(values.description || oldItem.description || "").trim(),
    meetingDate: values.meetingDate || oldItem.meetingDate || "",
    priority: values.priority || oldItem.priority || "Normal",
    status: decisionMode ? "Decision Taken" : (values.status || "Upcoming"),
    decision: String(values.decision || oldItem.decision || "").trim(),
    decisionStatus: values.decisionStatus || oldItem.decisionStatus || "Pending",
    responsible: String(values.responsible || oldItem.responsible || "").trim(),
    targetDate: values.targetDate || oldItem.targetDate || "",
    updatedAt: new Date().toISOString()
  };

  if (!payload.title || !payload.meetingDate) {
    alert("Agenda title ಮತ್ತು meeting date ಕಡ್ಡಾಯ.");
    return;
  }

  if (decisionMode && !payload.decision) {
    alert("ಸಭೆಯಲ್ಲಿ ತೆಗೆದುಕೊಂಡ ನಿರ್ಣಯವನ್ನು ಬರೆಯಿರಿ.");
    return;
  }

  try {
    await window.firebaseReady;

    if (editId) {
      await window.firebaseDb.ref(`meetingAgendas/${editId}`).update({
        ...payload,
        createdAt: oldItem.createdAt || new Date().toISOString()
      });
    } else {
      await window.firebaseDb.ref("meetingAgendas").push({
        ...payload,
        createdAt: new Date().toISOString()
      });
    }

    document.getElementById("agendaModal")?.remove();
    await openAgendaManagement();

  } catch (error) {
    console.error("Agenda save error:", error);
    alert("ಅಜೆಂಡಾ / ನಿರ್ಣಯ save ಆಗಲಿಲ್ಲ. Firebase connection ಪರಿಶೀಲಿಸಿ.");
  }
}

async function deleteAgenda(id) { if(!requireSupervisor())return; const item = agendaState.items.find(entry => entry.id === id);
  if (!item) return;
  if (!confirm(`"${item.title}" ಅನ್ನು ಅಳಿಸಲು ಖಚಿತವೇ?\n\nಅಳಿಸಿದ ನಂತರ ಈ record ಅನ್ನು ಮರಳಿ ಪಡೆಯಲು ಸಾಧ್ಯವಾಗುವುದಿಲ್ಲ.`)) return;
  try {
    await window.firebaseReady;
    await window.firebaseDb.ref(`meetingAgendas/${id}`).remove();
    await openAgendaManagement();
  } catch (error) { console.error("Agenda delete error:", error); alert("ಅಜೆಂಡಾ delete ಆಗಲಿಲ್ಲ. Firebase connection ಪರಿಶೀಲಿಸಿ."); }
}
