// ============================================================
// ATTENDANCE - PROGRAMS + ATTENDANCE SHEETS
// ============================================================

async function apiGet(action) {
  if (!hasApiUrl()) throw new Error("SCRIPT_URL is not configured.");
  const response = await fetch(`${SCRIPT_URL}?action=${encodeURIComponent(action)}`, { cache: "no-store" });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const data = await response.json();
  if (data.error) throw new Error(data.error);
  return data;
}

async function loadAttendanceSheet() {
  const container = document.getElementById("attendanceList");
  if (!container) return;

  container.innerHTML = `<p class="loading-message">Loading Members List...</p>`;

  try {
    await fetchMembersFromSheet();
    if (!fullMembersList.length) throw new Error("No members");

    container.innerHTML = fullMembersList.map(m => `
      <label class="attendance-item">
        <input type="checkbox" value="${escapeHTML(m.name)}" class="att-checkbox">
        <span><strong>${escapeHTML(m.id)}.</strong> ${escapeHTML(m.name)}</span>
      </label>
    `).join("");
  } catch (error) {
    console.error(error);
    container.innerHTML = `<p class="error-message">ಸದಸ್ಯರ ಪಟ್ಟಿ ಸಿಗಲಿಲ್ಲ. Google Sheet connection ಪರಿಶೀಲಿಸಿ.</p>`;
  }
}

async function loadAttendanceReports() {
  const tbody = document.getElementById("reportsTableBody");
  if (!tbody) return;

  tbody.innerHTML = `<tr><td colspan="3" class="empty-cell">Loading Reports...</td></tr>`;

  try {
    const reports = await apiGet("getReports");
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

  const selectedMembers = [...document.querySelectorAll(".att-checkbox:checked")].map(cb => cb.value);
  if (!selectedMembers.length) {
    alert("ದಯವಿಟ್ಟು ಕನಿಷ್ಠ ಒಬ್ಬ ಸದಸ್ಯರನ್ನು ಆಯ್ಕೆ ಮಾಡಿ!");
    return;
  }

  if (!hasApiUrl()) {
    alert("ಮೊದಲು js/script.js ನಲ್ಲಿ Google Apps Script URL ಹಾಕಿ.");
    return;
  }

  try {
    const response = await fetch(SCRIPT_URL, {
      method: "POST",
      body: JSON.stringify({
        action: "saveAttendance",
        programName: progName,
        date: progDate,
        members: selectedMembers
      })
    });

    const result = await response.json();
    if (result.error) throw new Error(result.error);

    alert("Attendance ಯಶಸ್ವಿಯಾಗಿ Save ಆಗಿದೆ!");
    progNameEl.value = "";
    document.querySelectorAll(".att-checkbox").forEach(cb => cb.checked = false);
  } catch (error) {
    console.error(error);
    alert("Attendance save ಮಾಡಲು ಸಾಧ್ಯವಾಗಲಿಲ್ಲ. Google Apps Script ಪರಿಶೀಲಿಸಿ.");
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
