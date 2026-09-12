// ============================================================
// ATTENDANCE - FIREBASE CONNECTION
// ============================================================

async function apiGet(action) {
  if (action === "getReports") return getFirebaseAttendanceReports();
  throw new Error(`Unsupported Firebase action: ${action}`);
}

async function getFirebasePrograms() {
  await waitForFirebase();
  const snapshot = await window.firebaseDb.ref("programs").once("value");
  return snapshot.val() || {};
}

async function getFirebaseAttendanceReports() {
  await waitForFirebase();
  const [programSnap, attendanceSnap] = await Promise.all([
    window.firebaseDb.ref("programs").once("value"),
    window.firebaseDb.ref("attendance").once("value")
  ]);

  const programs = programSnap.val() || {};
  const attendance = attendanceSnap.val() || {};

  return Object.entries(programs)
    .map(([programId, program]) => {
      const records = Object.values(attendance[programId] || {});
      const present = records.filter(r => String(r?.status || "").toLowerCase() === "present");
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

    container.innerHTML = fullMembersList.map(m => `
      <label class="attendance-item">
        <input type="checkbox" value="${escapeHTML(m.name)}" data-member-id="${escapeHTML(m.id)}" class="att-checkbox">
        <span><strong>${escapeHTML(m.id)}.</strong> ${escapeHTML(m.name)}</span>
      </label>
    `).join("");
  } catch (error) {
    console.error(error);
    container.innerHTML = `<p class="error-message">ಸದಸ್ಯರ ಪಟ್ಟಿ ಸಿಗಲಿಲ್ಲ. Firebase connection ಪರಿಶೀಲಿಸಿ.</p>`;
  }
}

async function loadAttendanceReports() {
  const tbody = document.getElementById("reportsTableBody");
  if (!tbody) return;

  tbody.innerHTML = `<tr><td colspan="3" class="empty-cell">Loading Reports...</td></tr>`;

  try {
    const reports = await getFirebaseAttendanceReports();
    tbody.innerHTML = reports.length
      ? reports.map((r, i) => `
        <tr>
          <td>${escapeHTML(r.slNo ?? i + 1)}</td>
          <td><strong>${escapeHTML(r.programName)}</strong><br><small>${escapeHTML(r.date)}</small></td>
          <td><strong>Total: ${escapeHTML(r.presentCount)} Members</strong><br>${escapeHTML(r.membersList)}</td>
        </tr>`).join("")
      : `<tr><td colspan="3" class="empty-cell">ಯಾವ ವರದಿಯೂ ಸಿಗಲಿಲ್ಲ.</td></tr>`;
  } catch (error) {
    console.error(error);
    tbody.innerHTML = `<tr><td colspan="3" class="error-cell">ವರದಿ ಲೋಡ್ ಮಾಡಲು ಸಾಧ್ಯವಾಗಲಿಲ್ಲ.</td></tr>`;
  }
}

async function submitAttendance() {
  const progNameEl = document.getElementById("progName");
  const progDateEl = document.getElementById("progDate");
  const progName = progNameEl?.value.trim();
  const progDate = progDateEl?.value;

  if (!progName || !progDate) {
    alert("ದಯವಿಟ್ಟು ಕಾರ್ಯಕ್ರಮದ ಹೆಸರು ಮತ್ತು ದಿನಾಂಕ ನಮೂದಿಸಿ!");
    return;
  }

  const selected = [...document.querySelectorAll(".att-checkbox:checked")];
  if (!selected.length) {
    alert("ದಯವಿಟ್ಟು ಕನಿಷ್ಠ ಒಬ್ಬ ಸದಸ್ಯರನ್ನು ಆಯ್ಕೆ ಮಾಡಿ!");
    return;
  }

  try {
    await waitForFirebase();

    const programRef = window.firebaseDb.ref("programs").push();
    const programId = programRef.key;
    const programData = {
      id: programId,
      programName: progName,
      date: progDate,
      createdAt: firebase.database.ServerValue.TIMESTAMP
    };

    const updates = {};
    updates[`programs/${programId}`] = programData;

    // Store a record for every member so Present/Absent history is complete.
    const selectedIds = new Set(selected.map(cb => String(cb.dataset.memberId || "")));
    fullMembersList.forEach(member => {
      const memberId = String(member.id);
      updates[`attendance/${programId}/${memberId}`] = {
        memberId,
        memberName: member.name,
        status: selectedIds.has(memberId) ? "Present" : "Absent"
      };
    });

    await window.firebaseDb.ref().update(updates);

    alert("Attendance ಯಶಸ್ವಿಯಾಗಿ Firebaseನಲ್ಲಿ Save ಆಗಿದೆ!");
    progNameEl.value = "";
    document.querySelectorAll(".att-checkbox").forEach(cb => cb.checked = false);
  } catch (error) {
    console.error(error);
    alert("Attendance save ಮಾಡಲು ಸಾಧ್ಯವಾಗಲಿಲ್ಲ. Firebase connection ಪರಿಶೀಲಿಸಿ.");
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
