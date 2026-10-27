// ============================================================
// ATTENDANCE - FIREBASE CONNECTION
// ============================================================

const attendanceSelectedMemberIds = new Set();
function attendanceInlineArg(value) { return JSON.stringify(String(value ?? "")).replace(/"/g, "&quot;"); }
let attendanceSubmitting = false;
const ATTENDANCE_DRAFT_KEY = "alameen.attendanceDraft.v1";

function saveAttendanceDraft() {
  const draft = { programName: document.getElementById("progName")?.value || "", date: document.getElementById("progDate")?.value || "", selectedIds: [...attendanceSelectedMemberIds], updatedAt: Date.now() };
  try { localStorage.setItem(ATTENDANCE_DRAFT_KEY, JSON.stringify(draft)); } catch (error) { console.warn("Attendance draft could not be saved:", error); }
}

function restoreAttendanceDraft() {
  try {
    const draft = JSON.parse(localStorage.getItem(ATTENDANCE_DRAFT_KEY) || "null");
    if (!draft || Date.now() - Number(draft.updatedAt || 0) > 30 * 86400000) return;
    const name = document.getElementById("progName");
    const date = document.getElementById("progDate");
    if (name && !name.value) name.value = draft.programName || "";
    if (date && !date.value) date.value = draft.date || "";
    const knownIds = new Set(fullMembersList.map(member => String(member.id)));
    attendanceSelectedMemberIds.clear();
    (draft.selectedIds || []).filter(id => knownIds.has(String(id))).forEach(id => attendanceSelectedMemberIds.add(String(id)));
    renderAttendanceSelected();
  } catch (error) { console.warn("Attendance draft could not be restored:", error); }
}

async function getFirebaseAttendanceReports() {
  await waitForFirebase();
  const [programSnap, attendanceSnap] = await Promise.all([
    AttendanceRepository.read("programs"),
    AttendanceRepository.read("attendance")
  ]);

  const programs = programSnap.val() || {};
  const attendance = attendanceSnap.val() || {};
  const editingId = document.getElementById("attendanceList")?.dataset.editingProgramId || "";

  return Object.entries(programs)
    .filter(([programId, program]) => program?.deleted !== true && (!editingId || programId !== editingId))
    .map(([programId, program]) => {
      const records = Object.entries(attendance[programId] || {});
      const presentIds = new Set();
      const present = records.filter(([memberId, r]) => {
        const id = String(r?.memberId || memberId);
        if (String(r?.status || "").toLowerCase() !== "present" || presentIds.has(id)) return false;
        presentIds.add(id);
        return true;
      }).map(([, record]) => record);
      return {
        slNo: program.slNo ?? "",
        programId,
        programName: program.programName || "",
        date: program.date || "",
        presentCount: present.length,
        membersList: present.map(r => r.memberName).filter(Boolean).join(", ")
      };
    })
    .sort((a, b) => String(a.date).localeCompare(String(b.date)))
    .map((r, i) => ({ ...r, slNo: r.slNo || i + 1 }));
}

async function loadAttendanceSheet() {
  const container = document.getElementById("attendanceList");
  if (!container) return;

  container.innerHTML = `<p class="loading-message">Loading Members List...</p>`;

  try {
    await fetchMembersFromFirebase();
    if (!fullMembersList.length) throw new Error("No members");

    container.innerHTML = `<input id="attendanceMemberSearch" class="attendance-member-search" type="search" placeholder="Search member name or ID" aria-label="Search member name or ID" oninput="filterAttendanceMembers(this.value)"><div id="attendanceMemberResults" class="attendance-member-results"></div><div id="attendanceSelectedMembers" class="attendance-selected-members"><span class="attendance-selection-hint">Search and select members marked Present.</span></div>`;
    filterAttendanceMembers("");
    restoreAttendanceDraft();
  } catch (error) {
    console.error(error);
    container.innerHTML = `<p class="error-message">ಸದಸ್ಯರ ಪಟ್ಟಿ ಸಿಗಲಿಲ್ಲ. Firebase connection ಪರಿಶೀಲಿಸಿ.</p>`;
  }
}

function filterAttendanceMembers(query = "") {
  const target = document.getElementById("attendanceMemberResults");
  if (!target) return;
  const term = String(query).trim().toLowerCase();
  const selectedIds = attendanceSelectedMemberIds;
  const matches = term ? fullMembersList.filter(member => !selectedIds.has(String(member.id)) && `${member.name} ${memberDisplayId(member)} ${member.id}`.toLowerCase().includes(term)).slice(0, 10) : [];
  target.innerHTML = matches.length
    ? matches.map(member => `<button type="button" class="attendance-result" onclick="selectAttendanceMember('${escapeHTML(member.id)}')"><span>${escapeHTML(member.name)}</span><small>${escapeHTML(memberDisplayId(member))}</small></button>`).join("")
    : `<div class="attendance-search-empty">${term ? "No members found." : "Type a name or member ID to search."}</div>`;
  renderAttendanceSelected();
}

function selectAttendanceMember(id) {
  const member = fullMembersList.find(item => String(item.id) === String(id));
  const results = document.getElementById("attendanceMemberResults");
  if (!member || !results) return;
  attendanceSelectedMemberIds.add(String(member.id));
  saveAttendanceDraft();
  const input = document.getElementById("attendanceMemberSearch");
  if (input) input.value = "";
  filterAttendanceMembers("");
}

function removeAttendanceMember(id) {
  attendanceSelectedMemberIds.delete(String(id));
  saveAttendanceDraft();
  filterAttendanceMembers(document.getElementById("attendanceMemberSearch")?.value || "");
}

function renderAttendanceSelected() {
  const target = document.getElementById("attendanceSelectedMembers");
  if (!target) return;
  const selected = fullMembersList.filter(member => attendanceSelectedMemberIds.has(String(member.id)));
  target.innerHTML = selected.length ? selected.map(member => `<span class="attendance-selected-chip">${escapeHTML(member.name)}<button type="button" onclick="removeAttendanceMember('${escapeHTML(member.id)}')" aria-label="Remove ${escapeHTML(member.name)}">×</button></span>`).join("") : '<span class="attendance-selection-hint">Search and select members marked Present.</span>';
}

function resetAttendanceForm() {
  const name = document.getElementById("progName");
  const date = document.getElementById("progDate");
  if (name) name.value = "";
  if (date) date.value = "";
  attendanceSelectedMemberIds.clear();
  try { localStorage.removeItem(ATTENDANCE_DRAFT_KEY); } catch (_) {}
  renderAttendanceSelected();
}

async function loadAttendanceReports() {
  const tbody = document.getElementById("reportsTableBody");
  if (!tbody) return;

  tbody.innerHTML = `<tr><td colspan="3" class="empty-cell">Loading Reports...</td></tr>`;

  try {
    const reports = await getFirebaseAttendanceReports();
    const [programSnapshot, attendanceSnapshot] = await Promise.all([AttendanceRepository.read("programs"), AttendanceRepository.read("attendance")]);
    const programs = programSnapshot.val() || {};
    const attendance = attendanceSnapshot.val() || {};
    const deletedPrograms = Object.entries(programs).filter(([, program]) => program?.deleted === true);
    tbody.innerHTML = reports.length
      ? reports.map((r, i) => `
        <tr>
          <td>${escapeHTML(r.slNo ?? i + 1)}</td>
          <td><strong>${escapeHTML(r.programName)}</strong><br><small>${escapeHTML(r.date)}</small></td>
          <td><strong>Total: ${escapeHTML(r.presentCount)} Members</strong><br>${escapeHTML(r.membersList)}${isSupervisorLoggedIn() ? `<div><button type="button" onclick="editAttendanceProgram(${attendanceInlineArg(r.programId)})">Edit</button> <button type="button" onclick="deleteAttendanceProgram(${attendanceInlineArg(r.programId)})">Delete</button></div>` : ""}</td>
        </tr>`).join("")
      : `<tr><td colspan="3" class="empty-cell">ಯಾವ ವರದಿಯೂ ಸಿಗಲಿಲ್ಲ.</td></tr>`;
    if (isSupervisorLoggedIn() && deletedPrograms.length) tbody.insertAdjacentHTML("beforeend", `<tr><td colspan="3"><section class="attendance-trash"><strong>Trash</strong>${deletedPrograms.map(([id, program]) => `<div class="attendance-trash-row"><span>${escapeHTML(program.programName || "Untitled program")} · ${escapeHTML(program.date || "")}</span><button type="button" onclick="restoreAttendanceProgram(${attendanceInlineArg(id)})">Restore</button></div>`).join("")}</section></td></tr>`);
    filterAttendanceReports(document.getElementById("attendanceReportSearch")?.value || "");
  } catch (error) {
    console.error(error);
    tbody.innerHTML = `<tr><td colspan="3" class="error-cell">ವರದಿ ಲೋಡ್ ಮಾಡಲು ಸಾಧ್ಯವಾಗಲಿಲ್ಲ.</td></tr>`;
  }
}

function filterAttendanceReports(query) {
  const term = String(query || "").trim().toLowerCase();
  document.querySelectorAll("#reportsTableBody tr").forEach(row => {
    row.hidden = Boolean(term) && !row.textContent.toLowerCase().includes(term);
  });
}

async function editAttendanceProgram(programId) {
  if (!requireSupervisor()) return;
  const program = (await AttendanceRepository.read(`programs/${programId}`)).val();
  if (!program || program.deleted) return;
  const records = (await AttendanceRepository.read(`attendance/${programId}`)).val() || {};
  attendanceSelectedMemberIds.clear();
  Object.entries(records).forEach(([memberId, record]) => { if (record?.status === "Present") attendanceSelectedMemberIds.add(String(record.memberId || memberId)); });
  const name = document.getElementById("progName");
  const date = document.getElementById("progDate");
  const container = document.getElementById("attendanceList");
  if (name) name.value = program.programName || "";
  if (date) date.value = program.date || "";
  if (container) container.dataset.editingProgramId = programId;
  renderAttendanceSelected();
  saveAttendanceDraft();
  switchAttTab("mark");
}

async function deleteAttendanceProgram(programId) {
  if (!requireSupervisor() || !await showConfirmSheet({ title: "Hide attendance record?", message: "It will remain in Firebase and can be restored later.", confirmLabel: "Hide record", danger: true })) return;
  try {
    const updatedAt = new Date().toISOString();
    await AttendanceRepository.update({ [`programs/${programId}/deleted`]: true, [`programs/${programId}/deletedAt`]: updatedAt, [`programs/${programId}/updatedAt`]: updatedAt }, { action: "attendance.hide", path: "programs", recordId: programId, afterUpdatedAt: updatedAt });
    await loadAttendanceReports();
  } catch (error) {
    console.error("Attendance hide error:", error);
    showToast("Attendance record could not be hidden. Check the connection and try again.");
  }
}

async function restoreAttendanceProgram(programId) {
  if (!requireSupervisor()) return;
  if (!await showConfirmSheet({ title: "Restore attendance record?", message: "This record will be moved back to the attendance report list.", confirmLabel: "Restore" })) return;
  try {
    const restoredAt = new Date().toISOString();
    const result = await AttendanceRepository.transaction(`programs/${programId}`, current => current?.deleted === true ? { ...current, deleted: false, restoredAt, updatedAt: restoredAt } : undefined);
    if (!result.committed) throw new Error("Attendance record is no longer in Trash.");
    await AttendanceRepository.audit({ action: "attendance.restore", path: "programs", recordId: programId, afterUpdatedAt: restoredAt });
    await loadAttendanceReports();
  } catch (error) {
    console.error("Attendance restore error:", error);
    showToast("Attendance record could not be restored. Refresh and try again.");
  }
}

async function submitAttendance() {
  if (!requireSupervisor()) return;
  const progNameEl = document.getElementById("progName");
  const progDateEl = document.getElementById("progDate");
  const progName = progNameEl?.value.trim();
  const progDate = progDateEl?.value;
  saveAttendanceDraft();

  if (!progName || !progDate) {
    showToast("ದಯವಿಟ್ಟು ಕಾರ್ಯಕ್ರಮದ ಹೆಸರು ಮತ್ತು ದಿನಾಂಕ ನಮೂದಿಸಿ!");
    return;
  }
  if (Number.isNaN(new Date(`${progDate}T00:00:00`).getTime())) {
    showToast("Please enter a valid program date.");
    return;
  }

  const selected = fullMembersList.filter(member => attendanceSelectedMemberIds.has(String(member.id)));
  if (!selected.length) {
    showToast("ದಯವಿಟ್ಟು ಕನಿಷ್ಠ ಒಬ್ಬ ಸದಸ್ಯರನ್ನು ಆಯ್ಕೆ ಮಾಡಿ!");
    return;
  }

  if (attendanceSubmitting) return;
  const button = document.querySelector(".save-attendance-btn");
  const originalLabel = button?.innerHTML;
  attendanceSubmitting = true;
  if (button) { button.disabled = true; button.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Saving…'; }
  try {
    await waitForFirebase();

    const container = document.getElementById("attendanceList");
    const editingId = container?.dataset.editingProgramId || "";
    const programId = editingId || AttendanceRepository.key("programs");
    const existingProgram = editingId ? ((await AttendanceRepository.read(`programs/${editingId}`)).val() || {}) : {};
    if (!editingId) {
      const allPrograms = (await AttendanceRepository.read("programs")).val() || {};
      const duplicate = Object.entries(allPrograms).some(([id, record]) => id !== programId && record?.deleted !== true && String(record?.programName || "").trim().toLowerCase() === progName.toLowerCase() && record?.date === progDate);
      if (duplicate) throw new Error("An attendance entry with this program name and date already exists.");
    }
    const programData = {
      id: programId,
      programName: progName,
      date: progDate,
      createdAt: editingId ? (existingProgram.createdAt || firebase.database.ServerValue.TIMESTAMP) : firebase.database.ServerValue.TIMESTAMP
    };

    const updates = {};
    updates[`programs/${programId}`] = { ...existingProgram, ...programData, updatedAt: firebase.database.ServerValue.TIMESTAMP };

    // Store a record for every member so Present/Absent history is complete.
    const selectedIds = new Set(selected.map(member => String(member.id)));
    fullMembersList.forEach(member => {
      const memberId = String(member.id);
      updates[`attendance/${programId}/${memberId}`] = {
        memberId,
        memberName: member.name,
        status: selectedIds.has(memberId) ? "Present" : "Absent"
      };
    });

    const previousUpdatedAt = editingId ? String(existingProgram.updatedAt || "") : "";
    await AttendanceRepository.update(updates, { action: editingId ? "attendance.update" : "attendance.create", path: "programs", recordId: programId, beforeUpdatedAt: previousUpdatedAt, afterUpdatedAt: new Date().toISOString() });
    if (editingId) delete container.dataset.editingProgramId;
    await loadAttendanceReports();

    if (typeof showToast === "function") showToast("Attendance saved successfully.", "success");
    else showToast("Attendance ಯಶಸ್ವಿಯಾಗಿ Firebaseನಲ್ಲಿ Save ಆಗಿದೆ!");
    resetAttendanceForm();
  } catch (error) {
    console.error(error);
    if (typeof showToast === "function") showToast("Attendance save failed. Check the Firebase connection.", "error");
    else showToast("Attendance save ಮಾಡಲು ಸಾಧ್ಯವಾಗಲಿಲ್ಲ. Firebase connection ಪರಿಶೀಲಿಸಿ.");
  } finally {
    attendanceSubmitting = false;
    if (button) { button.disabled = false; button.innerHTML = originalLabel || "Save Attendance"; }
  }
}

function switchAttTab(tab) {
  const mark = document.getElementById("tabMarkContent");
  const report = document.getElementById("tabReportContent");
  const markBtn = document.getElementById("tabMarkBtn");
  const reportBtn = document.getElementById("tabReportBtn");
  if (!mark || !report || !markBtn || !reportBtn) return;

  const active = { background: "#1b4332", color: "white" };
  const inactive = { background: "#e0e0e0", color: "#333" };

  if (tab === "mark") {
    mark.classList.remove("hidden");
    report.classList.add("hidden");
    Object.assign(markBtn.style, active);
    Object.assign(reportBtn.style, inactive);
  } else {
    mark.classList.add("hidden");
    report.classList.remove("hidden");
    Object.assign(reportBtn.style, active);
    Object.assign(markBtn.style, inactive);
    loadAttendanceReports();
  }
}

document.addEventListener("DOMContentLoaded", () => {
  const name = document.getElementById("progName");
  const date = document.getElementById("progDate");
  restoreAttendanceDraft();
  name?.addEventListener("input", saveAttendanceDraft);
  date?.addEventListener("change", saveAttendanceDraft);
});
