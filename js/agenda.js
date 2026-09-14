const agendaState = { items: [] };

async function openAgendaManagement() {
  hideAllViews();
  document.getElementById("agendaView")?.classList.remove("hidden");
  window.scrollTo({ top: 0, behavior: "smooth" });
  try {
    await window.firebaseReady;
    const data = (await window.firebaseDb.ref("meetingAgendas").once("value")).val() || {};
    agendaState.items = Object.entries(data).map(([id, value]) => ({ id, ...value })).sort((a,b) => String(b.meetingDate).localeCompare(String(a.meetingDate)));
    renderAgendas();
  } catch (error) { console.error(error); }
}

function agendaStatus(item) { return item.status || "Upcoming"; }
function agendaItemHTML(item) { return `<div class="agenda-item"><strong>${escapeHTML(item.title)}</strong><p>${escapeHTML(item.description || "")}</p><small><i class="fa-regular fa-calendar"></i> ${escapeHTML(item.meetingDate || "—")} · <b>${escapeHTML(agendaStatus(item))}</b></small>${item.decision ? `<div class="agenda-decision"><b>Decision:</b> ${escapeHTML(item.decision)}<br><b>Responsible:</b> ${escapeHTML(item.responsible || "—")}</div>` : ""}</div>`; }
function renderAgendas() {
  const allAgendas = agendaState.items.filter(item => agendaStatus(item) !== "Decision Taken");
  const decisions = agendaState.items.filter(item => agendaStatus(item) === "Decision Taken");
  const put = (id, data, empty) => { const el = document.getElementById(id); if (el) el.innerHTML = data.length ? data.map(agendaItemHTML).join("") : `<p class="agenda-empty">${empty}</p>`; };
  put("allAgendaList", allAgendas, "ಇನ್ನೂ ಅಜೆಂಡಾ ಸೇರಿಸಿಲ್ಲ.");
  put("decisionAgendaList", decisions, "ಇನ್ನೂ ನಿರ್ಣಯಗಳು ದಾಖಲಾಗಿಲ್ಲ.");
}
function openAgendaForm() {
  document.body.insertAdjacentHTML("beforeend", `<div class="program-modal" id="agendaModal"><div class="program-modal-card"><div class="program-modal-header"><div><h3>ಹೊಸ ಅಜೆಂಡಾ</h3><p>ಸಭೆಯಲ್ಲಿ ಚರ್ಚಿಸಬೇಕಾದ ವಿಷಯ ಸೇರಿಸಿ.</p></div><button class="program-close" onclick="document.getElementById('agendaModal').remove()"><i class="fa-solid fa-xmark"></i></button></div><form class="program-report-form" onsubmit="saveAgenda(event)"><label>Agenda title *<input name="title" required></label><label>Description<textarea name="description"></textarea></label><label>Meeting date *<input name="meetingDate" type="date" required></label><label>Priority<select name="priority"><option>Normal</option><option>Important</option><option>Urgent</option></select></label><label>Status<select name="status"><option>Upcoming</option><option>Under Discussion</option><option>Decision Taken</option><option>Postponed</option><option>Cancelled</option></select></label><label>Decision<textarea name="decision" placeholder="Decision taken after the meeting"></textarea></label><label>Responsible<input name="responsible" placeholder="Person responsible"></label><label>Target date<input name="targetDate" type="date"></label><div class="program-form-actions"><button type="button" class="program-cancel" onclick="document.getElementById('agendaModal').remove()">Cancel</button><button class="program-submit">Save agenda</button></div></form></div></div>`);
}
async function saveAgenda(event) { event.preventDefault(); const values = Object.fromEntries(new FormData(event.target).entries()); await window.firebaseDb.ref("meetingAgendas").push({ ...values, createdAt: new Date().toISOString() }); document.getElementById("agendaModal")?.remove(); await openAgendaManagement(); }
