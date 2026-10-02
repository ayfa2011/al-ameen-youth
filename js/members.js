// ============================================================
// MEMBERS - FIREBASE CONNECTION
// ============================================================

let fullMembersList = [];
window.fullMembersList = fullMembersList;

function bloodMemberKey(value) {
  return String(value ?? "").replace(/\([^)]*\)/g, "").toLowerCase().replace(/[^a-z0-9]/g, "");
}

function memberDisplayId(member) {
  const index = fullMembersList.findIndex(item => String(item.id) === String(member?.id));
  return `AYF${String(index >= 0 ? index + 1 : 0).padStart(2, "0")}`;
}

const VERIFIED_MEMBER_BLOOD_GROUPS = new Map([
  ["Safwan Mambli", ""], ["Rasheed Mambli", ""], ["Abdulla Kunji", "O+"],
  ["Anshif Mambli", "A-"], ["Sharafuddeen Shaik", ""], ["Anas Mambli", ""],
  ["Rafeeq Mambli", "O+"], ["Faris Mambli", "O+"], ["Hashir PR", ""],
  ["Basith mambli", ""], ["Azaruddin Mambli", ""], ["Miraz Mambli", ""],
  ["Niyaz Mambli", ""], ["Naushad Egu", ""], ["Shareef Mambli", "O+"],
  ["Kabeer Panne", "AB+"], ["Kareem Star", ""], ["Kalandar Aramboor", ""],
  ["Sabith Mambli", "B+"], ["Fazan mambli", ""], ["Raashid Paladka", "O+"],
  ["Razik PG Aramboor", "O+"], ["Mukthar Mambli", ""], ["Shareef A. S", ""],
  ["Ashiq Aramboor", "AB+"], ["Yaser Shaik", ""], ["Shafeeq Shaik", ""],
  ["Thwaha Shaik", ""], ["Khaleed Kocchi", "O+"], ["Rishaad Paladka", "B+"],
  ["Sabir Mambli", "B+"], ["Khasim Paladka", "B+"], ["Javed Shaik", ""],
  ["Sadiq Mambli", ""], ["Muhsin Panne", "O+"], ["Kabeer Limra", "B+"],
  ["Niyaz JR", ""], ["Nizar Shine", ""], ["Badruddeen Mambli", "A-"],
  ["Samshuddin Mambli", "B+"], ["Nadeem Shaik", ""], ["Asif Panne", "O+"],
  ["Shaheer Star", ""], ["Thajuddeen Paladka", "AB+"], ["Rauf Mambli", "O+"],
  ["Sinan Panne", ""], ["Ashfaq PR", "O+"], ["Shamal Mambli", ""],
  ["Rameez Shine", ""], ["Mujthaba Mambli", "AB+"], ["Nizam Mambli", "O+"],
  ["Fayiz Mambli", ""], ["Mohammed Adnan", ""], ["Ehan Basheer", "A+"],
  ["Hafeez PR", "O+"], ["Nasir Mambli", "B+"], ["Javad Mambli", "A+"],
  ["Nasir Paladka", "B+"], ["Mohammad Mambli", "O+"], ["Muneer Shine", ""]
].map(([name, group]) => [bloodMemberKey(name), group]));
VERIFIED_MEMBER_BLOOD_GROUPS.set(bloodMemberKey("Ashphak PR"), "O+");
VERIFIED_MEMBER_BLOOD_GROUPS.set(bloodMemberKey("Ashphak P.R."), "O+");

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
    bloodGroup: VERIFIED_MEMBER_BLOOD_GROUPS.get(bloodMemberKey(row.name ?? row["Name"] ?? "")) ?? "",
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
    await waitForFirebase();
    const donationSnapshot = await window.firebaseDb.ref("bloodDonations").once("value");
    const donationData = donationSnapshot.val() || {};
    members.forEach(member => {
      const records = Object.values(donationData[String(member.id)] || {});
      member.bloodDonationCount = records.length;
    });
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
    const displayGroup = m.bloodGroup || "";
    const donationCount = Number(m.bloodDonationCount ?? m.bloodCount ?? 0);
    const displayedCount = String(donationCount).padStart(2, "0");
    const phone = String(m.mobile || "").trim().replace(/[^0-9+]/g, "");
    const whatsapp = normalizePhoneForLinks(m.mobile);

    return `
      <article class="blood-donor-card ${phone || whatsapp ? "has-contact-actions" : "no-contact-actions"}" data-search="${escapeHTML(`${m.name} ${displayGroup} ${m.id} ${memberDisplayId(m)}`.toLowerCase())}">
        <div class="blood-member-avatar" aria-hidden="true"><i class="fa-solid fa-user"></i></div>
        <div class="blood-donor-info">
          <h3>${escapeHTML(m.name)}</h3>
          <div class="blood-donor-meta"><span class="blood-donor-id">ID : ${escapeHTML(memberDisplayId(m))}</span><span class="blood-donor-separator">|</span><span class="blood-donor-count">${displayedCount} ${donationCount === 1 ? "Time" : "Times"} Donated</span></div>
        </div>
        <div class="blood-group-badge ${m.bloodGroup ? "has-group" : "missing-group"}" aria-label="Blood group ${escapeHTML(displayGroup || "not provided")}">
          ${displayGroup ? `<i class="fa-solid fa-droplet"></i><span>${escapeHTML(displayGroup)}</span>` : ""}
        </div>
        <div class="blood-donor-actions">
          ${phone ? `<a class="btn-call" href="tel:${escapeHTML(phone)}" aria-label="Call ${escapeHTML(m.name)}" title="Call"><i class="fa-solid fa-phone"></i></a>` : ""}
          ${whatsapp ? `<a class="btn-wa" href="https://wa.me/${escapeHTML(whatsapp)}" target="_blank" rel="noopener" aria-label="WhatsApp ${escapeHTML(m.name)}" title="WhatsApp"><i class="fa-brands fa-whatsapp"></i></a>` : ""}
        </div>
        <span class="blood-row-divider" aria-hidden="true"></span>
        <button type="button" class="blood-history-open" onclick="openBloodDonationHistory('${escapeHTML(m.id)}')" aria-label="Open ${escapeHTML(m.name)} donation history"><i class="fa-solid fa-chevron-right"></i></button>
      </article>`;
  }).join("");
}

function getMemberById(memberId) {
  return fullMembersList.find(member => String(member.id) === String(memberId));
}

async function openBloodDonationHistory(memberId) {
  const member = getMemberById(memberId);
  if (!member) return;
  const modal = document.getElementById("bloodDonationModal");
  if (!modal) return;
  modal.dataset.memberId = String(member.id);
  document.getElementById("bloodDonationMemberName").textContent = member.name;
  document.getElementById("bloodDonationMemberId").textContent = memberDisplayId(member);
  document.getElementById("bloodDonationTitle").textContent = `${member.name} · Donation History`;
  document.getElementById("bloodDonationHistory").innerHTML = `<p class="loading-message">Loading donation history...</p>`;
  modal.classList.remove("hidden");
  try {
    await waitForFirebase();
    const snapshot = await window.firebaseDb.ref(`bloodDonations/${member.id}`).once("value");
    const records = Object.entries(snapshot.val() || {}).map(([id, record]) => ({ id, ...record }))
      .sort((a, b) => String(b.donationDate || b.createdAt || "").localeCompare(String(a.donationDate || a.createdAt || "")));
    const units = records.reduce((total, record) => total + (Number(record.units) || 1), 0);
    member.bloodDonationCount = records.length;
    document.getElementById("bloodDonationMemberCount").textContent = `${records.length} ${records.length === 1 ? "donation" : "donations"} · ${units} ${units === 1 ? "unit" : "units"} total`;
    document.getElementById("bloodDonationHistory").innerHTML = records.length ? records.map(record => `
      <article class="donation-history-row">
        <div><strong>${escapeHTML(record.patientName || "Patient not recorded")}</strong><small>${escapeHTML(record.donationDate || "Date not recorded")} · ${escapeHTML(record.units || 1)} unit(s)</small></div>
        <p>${escapeHTML([record.place, record.hospital].filter(Boolean).join(" · "))}</p>
        ${record.remarks ? `<p>${escapeHTML(record.remarks)}</p>` : ""}
        <button type="button" class="donation-delete" onclick="deleteBloodDonation('${escapeHTML(member.id)}','${escapeHTML(record.id)}')" aria-label="Delete donation record"><i class="fa-solid fa-trash"></i></button>
      </article>`).join("") : `<p class="empty-message">No donation records yet.</p>`;
  } catch (error) {
    console.error("Blood donation history error:", error);
    document.getElementById("bloodDonationHistory").innerHTML = `<p class="error-message">Could not load donation history. Please try again.</p>`;
  }
}

function closeBloodDonationModal() {
  document.getElementById("bloodDonationModal")?.classList.add("hidden");
}

async function openAnnualBloodDonationHistory() {
  const modal = document.getElementById("annualDonationModal");
  const content = document.getElementById("annualDonationContent");
  if (!modal || !content) return;
  modal.classList.remove("hidden");
  content.innerHTML = `<p class="loading-message">Loading donation records...</p>`;
  try {
    await fetchMembersFromFirebase();
    await waitForFirebase();
    const snapshot = await window.firebaseDb.ref("bloodDonations").once("value");
    const data = snapshot.val() || {};
    const memberById = new Map(fullMembersList.map(member => [String(member.id), member]));
    const byYear = {};
    Object.entries(data).forEach(([memberId, records]) => {
      Object.entries(records || {}).forEach(([recordId, record]) => {
        const date = String(record?.donationDate || "");
        const year = /^\d{4}-\d{2}-\d{2}$/.test(date) ? date.slice(0, 4) : "Date not recorded";
        const member = memberById.get(String(memberId));
        (byYear[year] ||= []).push({
          ...record, recordId, memberId,
          memberName: member?.name || record?.memberName || "Unknown member",
          bloodGroup: member?.bloodGroup || ""
        });
      });
    });
    const years = Object.keys(byYear).sort((a, b) => b.localeCompare(a));
    if (!years.length) {
      content.innerHTML = `<p class="empty-message">No blood donation records yet.</p>`;
      return;
    }
    content.innerHTML = years.map(year => {
      const records = byYear[year].sort((a, b) => String(b.donationDate || "").localeCompare(String(a.donationDate || "")) || a.memberName.localeCompare(b.memberName));
      const members = new Set(records.map(record => String(record.memberId))).size;
      const units = records.reduce((sum, record) => sum + (Number(record.units) || 1), 0);
      return `<section class="annual-donation-year">
        <header><h3>${escapeHTML(year)}</h3><span>${members} ${members === 1 ? "member" : "members"} · ${records.length} ${records.length === 1 ? "donation" : "donations"} · ${units} ${units === 1 ? "unit" : "units"}</span></header>
        <div class="annual-donation-list">${records.map(record => `<article class="annual-donation-row">
          <div class="annual-donation-member"><strong>${escapeHTML(record.memberName)}</strong>${record.bloodGroup ? `<span>${escapeHTML(record.bloodGroup)}</span>` : ""}</div>
          <time>${escapeHTML(record.donationDate || "Date not recorded")}</time>
          <p><b>Patient:</b> ${escapeHTML(record.patientName || "—")}</p>
          <p><b>Place:</b> ${escapeHTML(record.place || "—")}</p>
          <p><b>Hospital:</b> ${escapeHTML(record.hospital || "—")} · <b>Units:</b> ${escapeHTML(record.units || 1)}</p>
        </article>`).join("")}</div>
      </section>`;
    }).join("");
  } catch (error) {
    console.error("Annual blood donation history error:", error);
    content.innerHTML = `<p class="error-message">Could not load donation history. Please try again.</p>`;
  }
}

function closeAnnualBloodDonationHistory() {
  document.getElementById("annualDonationModal")?.classList.add("hidden");
}

function openBloodDonationForm() {
  const memberId = document.getElementById("bloodDonationModal")?.dataset.memberId;
  const member = getMemberById(memberId);
  if (!member) return;
  const form = document.getElementById("bloodDonationForm");
  form.reset();
  form.elements.donationDate.value = new Date().toISOString().slice(0, 10);
  document.getElementById("bloodDonationMemberNameInput").value = member.name;
  document.getElementById("bloodDonationMemberIdInput").value = memberDisplayId(member);
  document.getElementById("bloodDonationFormError").textContent = "";
  document.getElementById("bloodDonationFormView").classList.remove("hidden");
}

function closeBloodDonationForm() {
  document.getElementById("bloodDonationFormView")?.classList.add("hidden");
}

async function saveBloodDonation(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const memberId = document.getElementById("bloodDonationModal")?.dataset.memberId;
  const member = getMemberById(memberId);
  if (!member) return;
  const values = Object.fromEntries(new FormData(form).entries());
  const record = {
    memberId: String(member.id), memberName: member.name,
    patientName: String(values.patientName || "").trim(),
    place: String(values.place || "").trim(), hospital: String(values.hospital || "").trim(),
    donationDate: String(values.donationDate || ""), units: Number(values.units),
    remarks: String(values.remarks || "").trim(), createdAt: new Date().toISOString()
  };
  const error = document.getElementById("bloodDonationFormError");
  error.textContent = "";
  try {
    await waitForFirebase();
    await window.firebaseDb.ref(`bloodDonations/${member.id}`).push(record);
    closeBloodDonationForm();
    await openBloodDonationHistory(member.id);
    renderBloodDonorCards(fullMembersList);
  } catch (saveError) {
    console.error("Blood donation save error:", saveError);
    error.textContent = "Could not save this record. Check your connection and try again.";
  }
}

async function deleteBloodDonation(memberId, recordId) {
  if (!confirm("Delete this blood donation record?")) return;
  try {
    await waitForFirebase();
    await window.firebaseDb.ref(`bloodDonations/${memberId}/${recordId}`).remove();
    await openBloodDonationHistory(memberId);
    renderBloodDonorCards(fullMembersList);
  } catch (error) {
    console.error("Blood donation delete error:", error);
    alert("Could not delete this record. Please try again.");
  }
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
