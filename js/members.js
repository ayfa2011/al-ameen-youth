// ============================================================
// MEMBERS - GOOGLE SHEETS CONNECTION
// ============================================================

let fullMembersList = [];
window.fullMembersList = fullMembersList;

function normalizeBloodGroup(value) {
  const v = String(value ?? "").trim().toUpperCase();
  return v === "0+" ? "O+" : v === "0-" ? "O-" : v;
}

function normalizeMember(row) {
  return {
    id: row["Member ID"] ?? row.id ?? "",
    name: row["Name"] ?? row.name ?? "",
    designation: row["Designation"] ?? row.designation ?? "Member",
    education: row["Education"] ?? row.education ?? "",
    fatherName: row["FatherName"] ?? row.fatherName ?? "",
    mobile: row["Mobile"] ?? row.mobile ?? "",
    contribution: row["Monthy Contribution Amount"] ?? row["Monthly Contribution Amount"] ?? row.contribution ?? "",
    location: row["Location"] ?? row.location ?? "",
    bloodGroup: normalizeBloodGroup(row["Blood Group"] ?? row.bloodGroup ?? ""),
    bloodCount: row["How Many Times Blood Donated :"] ?? row["How Many Times Blood Donated"] ?? row.bloodCount ?? 0
  };
}

async function fetchMembersFromSheet(force = false) {
  if (!force && fullMembersList.length) return fullMembersList;

  if (typeof hasApiUrl === "function" && !hasApiUrl()) {
    console.warn("SCRIPT_URL is not configured.");
    fullMembersList = [];
    window.fullMembersList = fullMembersList;
    return fullMembersList;
  }

  const response = await fetch(`${SCRIPT_URL}?action=getMembers`, { cache: "no-store" });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);

  const data = await response.json();
  if (!Array.isArray(data)) throw new Error(data.error || "Invalid Members response");

  fullMembersList = data.map(normalizeMember);
  window.fullMembersList = fullMembersList;
  return fullMembersList;
}

function memberCardHTML(m) {
  const phone = String(m.mobile || "").replace(/[^0-9+]/g, "");
  const whatsapp = normalizePhoneForLinks(m.mobile);
  const attendanceCount = Number(m.attendanceCount || 0);

  return `
    <div class="member-card">
      <div class="member-info">
        <h3>${escapeHTML(m.name)}</h3>

        <div class="member-info-details">
          <p><strong>ID:</strong> ${escapeHTML(m.id || "-")}</p>
          <p><strong>Designation:</strong> ${escapeHTML(m.designation || "Member")}</p>
          ${m.education ? `<p><strong>Education:</strong> ${escapeHTML(m.education)}</p>` : ""}
          ${m.fatherName ? `<p><strong>Father:</strong> ${escapeHTML(m.fatherName)}</p>` : ""}
          ${m.location ? `<p><strong>Location:</strong> ${escapeHTML(m.location)}</p>` : ""}
          ${m.bloodGroup ? `<p><strong>Blood:</strong> <span class="badge blood-badge">${escapeHTML(m.bloodGroup)}</span></p>` : ""}
          ${m.contribution !== "" ? `<p><strong>Contribution:</strong> ₹${escapeHTML(m.contribution)}</p>` : ""}
          <p class="member-attendance"><strong>Attendance:</strong> ${attendanceCount} ${attendanceCount === 1 ? "Program" : "Programs"}</p>
        </div>
      </div>

      <div class="card-actions">
        ${phone ? `<a class="btn-call" href="tel:${escapeHTML(phone)}" aria-label="Call ${escapeHTML(m.name)}" title="Call"></a>` : ""}
        ${whatsapp ? `<a class="btn-wa" href="https://wa.me/${escapeHTML(whatsapp)}" target="_blank" rel="noopener" aria-label="WhatsApp ${escapeHTML(m.name)}" title="WhatsApp"></a>` : ""}
      </div>
    </div>`;
}

let attendanceCountsByName = {};

function normalizeMemberNameForAttendance(value) {
  return String(value ?? "")
    .trim()
    .replace(/\s+/g, " ")
    .toLowerCase();
}

async function loadMemberAttendanceCounts() {
  attendanceCountsByName = {};

  if (typeof hasApiUrl === "function" && !hasApiUrl()) {
    return;
  }

  try {
    const response = await fetch(`${SCRIPT_URL}?action=getReports`, { cache: "no-store" });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);

    const reports = await response.json();
    if (!Array.isArray(reports)) return;

    reports.forEach(report => {
      const rawMembers = String(report.membersList ?? "").trim();
      if (!rawMembers) return;

      /*
        Attendance reports store the selected member names in membersList.
        The normal format is comma separated; newline/semicolon are also
        accepted so older sheets continue to work.
      */
      const names = rawMembers
        .split(/[,;\n|]+/)
        .map(name => name.trim())
        .filter(Boolean);

      names.forEach(name => {
        const key = normalizeMemberNameForAttendance(name);
        if (!key) return;
        attendanceCountsByName[key] =
          (attendanceCountsByName[key] || 0) + 1;
      });
    });
  } catch (error) {
    console.warn("Attendance counts could not be loaded:", error);
  }
}

async function renderMemberCards() {
  const container = document.getElementById("membersContainer");
  if (!container) return;

  container.innerHTML = `<p class="loading-message">Members loading...</p>`;

  try {
    await fetchMembersFromSheet();
    await loadMemberAttendanceCounts();

    fullMembersList.forEach(member => {
      const key = normalizeMemberNameForAttendance(member.name);
      member.attendanceCount = attendanceCountsByName[key] || 0;
    });

    container.innerHTML = fullMembersList.length
      ? fullMembersList.map(memberCardHTML).join("")
      : `<p class="empty-message">Members data ಸಿಗಲಿಲ್ಲ.</p>`;
  } catch (error) {
    console.error(error);
    container.innerHTML = `<p class="error-message">Members data load ಆಗಲಿಲ್ಲ. Google Apps Script URL ಪರಿಶೀಲಿಸಿ.</p>`;
  }
}

async function renderBloodDonors() {
  const container = document.getElementById("bloodDonorsContainer");
  const countEl = document.getElementById("bloodDonorCount");
  if (!container) return;

  container.innerHTML = `<p class="loading-message">Blood Donors loading...</p>`;

  try {
    await fetchMembersFromSheet();

    // Show every member who has a name. Blood Group / donation count can be
    // updated later directly in the Members sheet.
    const members = fullMembersList.filter(m => String(m.name || "").trim());
    if (countEl) countEl.textContent = members.length;

    renderBloodDonorCards(members);
  } catch (error) {
    console.error(error);
    if (countEl) countEl.textContent = "0";
    container.innerHTML = `<p class="error-message">Blood Donors data load ಆಗಲಿಲ್ಲ. Google Apps Script URL ಪರಿಶೀಲಿಸಿ.</p>`;
  }
}

function normalizePhoneForLinks(value) {
  let phone = String(value ?? "").trim().replace(/[^0-9+]/g, "");
  if (!phone) return "";

  // Excel may contain Indian 10-digit mobile numbers. Add India country code
  // for WhatsApp; UAE/international numbers already carrying + are preserved.
  if (/^\d{10}$/.test(phone)) phone = "91" + phone;
  else if (/^0\d{9,}$/.test(phone)) phone = "91" + phone.slice(1);
  else if (phone.startsWith("+")) phone = phone.slice(1);

  return phone;
}

function renderBloodDonorCards(members) {
  const container = document.getElementById("bloodDonorsContainer");
  if (!container) return;

  if (!members.length) {
    container.innerHTML = `<p class="empty-message">Members data ಸಿಗಲಿಲ್ಲ.</p>`;
    return;
  }

  container.innerHTML = members.map(m => {
    const displayGroup = m.bloodGroup || "Not Updated";
    const donated = String(m.bloodCount ?? "").trim() || "0";
    const phone = String(m.mobile || "").trim().replace(/[^0-9+]/g, "");
    const whatsapp = normalizePhoneForLinks(m.mobile);

    return `
      <div class="blood-donor-card" data-search="${escapeHTML(`${m.name} ${displayGroup} ${m.id}`.toLowerCase())}">
        <div class="blood-group-badge ${m.bloodGroup ? "has-group" : "missing-group"}">
          <i class="fa-solid fa-droplet"></i>
          <span>${escapeHTML(displayGroup)}</span>
        </div>

        <div class="blood-donor-info">
          <h3>${escapeHTML(m.name)}</h3>
          <p><span>Member ID</span> <strong>${escapeHTML(m.id || "-")}</strong></p>
          <p><span>Blood Group</span> <strong>${escapeHTML(displayGroup)}</strong></p>
          <p><span>Blood Donated</span> <strong>${escapeHTML(donated)} ${donated === "1" ? "time" : "times"}</strong></p>
        </div>

        <div class="blood-donor-actions">
          ${phone ? `<a class="btn-call" href="tel:${escapeHTML(phone)}" aria-label="Call ${escapeHTML(m.name)}"><i class="fa-solid fa-phone"></i><span>Call</span></a>` : `<span class="btn-disabled">No Phone</span>`}
          ${whatsapp ? `<a class="btn-wa" href="https://wa.me/${escapeHTML(whatsapp)}" target="_blank" rel="noopener" aria-label="WhatsApp ${escapeHTML(m.name)}"><i class="fa-brands fa-whatsapp"></i><span>WhatsApp</span></a>` : ""}
        </div>
      </div>`;
  }).join("");
}

document.addEventListener("DOMContentLoaded", () => {
  const input = document.getElementById("memberSearchInput");
  if (input) {
    input.addEventListener("input", () => {
      const q = input.value.trim().toLowerCase();
      document.querySelectorAll("#membersContainer .member-card").forEach(card => {
        card.style.display = card.textContent.toLowerCase().includes(q) ? "flex" : "none";
      });
    });
  }

  const bloodSearch = document.getElementById("bloodDonorSearch");
  if (bloodSearch) {
    bloodSearch.addEventListener("input", () => {
      const q = bloodSearch.value.trim().toLowerCase();
      document.querySelectorAll("#bloodDonorsContainer .blood-donor-card").forEach(card => {
        card.style.display = String(card.dataset.search || "").includes(q) ? "grid" : "none";
      });
    });
  }
});
