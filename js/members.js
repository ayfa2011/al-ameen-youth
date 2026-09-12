// ============================================================
// MEMBERS - FIREBASE CONNECTION
// ============================================================

let fullMembersList = [];
window.fullMembersList = fullMembersList;

function normalizeBloodGroup(value) {
  const v = String(value ?? "").trim().toUpperCase();
  return v === "0+" ? "O+" : v === "0-" ? "O-" : v;
}

function normalizeMember(row) {
  return {
    id: row.id ?? row["Member ID"] ?? "",
    name: row.name ?? row["Name"] ?? "",
    designation: row.designation ?? row["Designation"] ?? "Member",
    education: row.education ?? row["Education"] ?? "",
    fatherName: row.fatherName ?? row["FatherName"] ?? "",
    mobile: row.mobile ?? row["Mobile"] ?? "",
    contribution: row.contribution ?? row["Monthy Contribution Amount"] ?? row["Monthly Contribution Amount"] ?? "",
    location: row.location ?? row["Location"] ?? "",
    bloodGroup: normalizeBloodGroup(row.bloodGroup ?? row["Blood Group"] ?? ""),
    bloodCount: row.bloodCount ?? row["How Many Times Blood Donated :"] ?? row["How Many Times Blood Donated"] ?? 0
  };
}

async function waitForFirebase() {
  if (!window.firebaseReady) throw new Error("Firebase is not initialized.");
  await window.firebaseReady;
  if (!window.firebaseDb) throw new Error("Firebase Database is unavailable.");
}

async function fetchMembersFromFirebase(force = false) {
  if (!force && fullMembersList.length) return fullMembersList;

  await waitForFirebase();
  const snapshot = await window.firebaseDb.ref("members").once("value");
  const data = snapshot.val() || {};

  fullMembersList = Object.values(data)
    .map(normalizeMember)
    .filter(m => String(m.name || "").trim());

  fullMembersList.sort((a, b) => Number(a.id) - Number(b.id));
  window.fullMembersList = fullMembersList;
  return fullMembersList;
}

// Backward-compatible function name used by the existing website.
async function fetchMembersFromSheet(force = false) {
  return fetchMembersFromFirebase(force);
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

let attendanceCountsByMemberId = {};

async function loadMemberAttendanceCounts() {
  attendanceCountsByMemberId = {};
  await waitForFirebase();

  const snapshot = await window.firebaseDb.ref("attendance").once("value");
  const allAttendance = snapshot.val() || {};

  Object.values(allAttendance).forEach(programAttendance => {
    Object.entries(programAttendance || {}).forEach(([memberId, record]) => {
      if (String(record?.status || "").toLowerCase() !== "present") return;
      attendanceCountsByMemberId[memberId] =
        (attendanceCountsByMemberId[memberId] || 0) + 1;
    });
  });
}

async function renderMemberCards() {
  const container = document.getElementById("membersContainer");
  if (!container) return;

  container.innerHTML = `<p class="loading-message">Members loading...</p>`;

  try {
    await fetchMembersFromFirebase();
    await loadMemberAttendanceCounts();

    fullMembersList.forEach(member => {
      member.attendanceCount = attendanceCountsByMemberId[String(member.id)] || 0;
    });

    container.innerHTML = fullMembersList.length
      ? fullMembersList.map(memberCardHTML).join("")
      : `<p class="empty-message">Members data ಸಿಗಲಿಲ್ಲ.</p>`;
  } catch (error) {
    console.error(error);
    container.innerHTML = `<p class="error-message">Members data load ಆಗಲಿಲ್ಲ. Firebase connection ಪರಿಶೀಲಿಸಿ.</p>`;
  }
}

async function renderBloodDonors() {
  const container = document.getElementById("bloodDonorsContainer");
  const countEl = document.getElementById("bloodDonorCount");
  if (!container) return;

  container.innerHTML = `<p class="loading-message">Blood Donors loading...</p>`;

  try {
    await fetchMembersFromFirebase();

    const members = fullMembersList.filter(m => String(m.name || "").trim());
    if (countEl) countEl.textContent = members.length;
    renderBloodDonorCards(members);
  } catch (error) {
    console.error(error);
    if (countEl) countEl.textContent = "0";
    container.innerHTML = `<p class="error-message">Blood Donors data load ಆಗಲಿಲ್ಲ. Firebase connection ಪರಿಶೀಲಿಸಿ.</p>`;
  }
}

function normalizePhoneForLinks(value) {
  let phone = String(value ?? "").trim().replace(/[^0-9+]/g, "");
  if (!phone) return "";
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
          ${whatsapp ? `<a class="btn-wa" href="https://wa.me/${escapeHTML(whatsapp)}" target="_blank" rel="noopener"><i class="fa-brands fa-whatsapp"></i><span>WhatsApp</span></a>` : ""}
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
