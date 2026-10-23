// ============================================================
// MEMBERS - FIREBASE CONNECTION
// ============================================================

let fullMembersList = [];
let deactivatedMembersList = [];
window.fullMembersList = fullMembersList;

function bloodMemberKey(value) {
  return String(value ?? "").replace(/\([^)]*\)/g, "").toLowerCase().replace(/[^a-z0-9]/g, "");
}

function memberDisplayId(member) {
  const savedCode = String(member?.memberCode || member?.displayId || "").trim().toUpperCase();
  if (/^AYF\d+$/.test(savedCode)) return savedCode;
  const numericId = Number(member?.id);
  if (Number.isInteger(numericId) && numericId > 0) return `AYF${String(numericId).padStart(2, "0")}`;
  const index = fullMembersList.findIndex(item => String(item.id) === String(member?.id));
  return `AYF${String(index >= 0 ? index + 1 : 0).padStart(2, "0")}`;
}

let verifiedMemberBloodGroups = new Map();

async function loadVerifiedBloodGroups() {
  try {
    const stored = await loadReferenceData("bloodGroups", "bloodGroups");
    verifiedMemberBloodGroups = new Map(Object.entries(stored || {}).map(([name, group]) => [bloodMemberKey(name), String(group || "")]));
  } catch (error) { console.warn("Blood group reference data unavailable:", error); }
}

function normalizeMember(row) {
  const bloodGroupOverride = row.bloodGroupOverride;
  return {
    id: row.id ?? row["Member ID"] ?? "",
    name: row.name ?? row["Name"] ?? "",
    designation: row.designation ?? row["Designation"] ?? "Member",
    education: row.education ?? row["Education"] ?? "",
    fatherName: row.fatherName ?? row["FatherName"] ?? "",
    mobile: row.mobile ?? row["Mobile"] ?? "",
    contribution: row.contribution ?? row["Monthy Contribution Amount"] ?? row["Monthly Contribution Amount"] ?? "",
    location: row.location ?? row["Location"] ?? "",
    bloodGroup: bloodGroupOverride !== undefined ? String(bloodGroupOverride || "") : (verifiedMemberBloodGroups.get(bloodMemberKey(row.name ?? row["Name"] ?? "")) ?? ""),
    bloodCount: row.bloodCount ?? row["How Many Times Blood Donated :"] ?? row["How Many Times Blood Donated"] ?? 0,
    active: row.active !== false,
    updatedAt: row.updatedAt || "",
    deactivatedAt: row.deactivatedAt || ""
  };
}

async function waitForFirebase() {
  await MembersRepository.ready();
}

async function fetchMembersFromFirebase(force = false) {
  if (!force && fullMembersList.length) return fullMembersList;

  await waitForFirebase();
  if (!verifiedMemberBloodGroups.size) await loadVerifiedBloodGroups();
  const snapshot = await MembersRepository.read("members");
  const data = snapshot.val() || {};

  const allMembers = Object.entries(data)
    .map(([databaseKey, row]) => {
      const member = normalizeMember(row || {});
      member.id = String(member.id || databaseKey);
      return member;
    })
    .filter(m => String(m.name || "").trim());

  deactivatedMembersList = allMembers.filter(member => !member.active);
  fullMembersList = allMembers.filter(member => member.active);

  fullMembersList.sort((a, b) => Number(a.id) - Number(b.id));
  window.fullMembersList = fullMembersList;
  return fullMembersList;
}

// Backward-compatible function name removed — use fetchMembersFromFirebase directly.

function memberCardHTML(m) {
  const phone = String(m.mobile || "").replace(/[^0-9+]/g, "");
  const whatsapp = normalizePhoneForLinks(m.mobile);
  const attendanceCount = Number(m.attendanceCount || 0);
  const details = [
    ["Education", m.education, "fa-graduation-cap"],
    ["Father", m.fatherName, "fa-user"],
    ["Location", m.location, "fa-location-dot"],
    ["Blood", m.bloodGroup, "fa-droplet"],
    ["Contribution", m.contribution === "" ? "" : `₹${m.contribution}`, "fa-coins"],
    ["Attendance", `${attendanceCount} ${attendanceCount === 1 ? "Program" : "Programs"}`, "fa-people-group"]
  ].filter(([, value]) => value !== null && value !== undefined && String(value).trim() !== "");
  const supervisorActions = isSupervisorLoggedIn()
    ? `<div class="member-card-admin-actions"><button type="button" onclick="openMemberEdit('${escapeHTML(m.id)}')" aria-label="Edit ${escapeHTML(m.name)}"><i class="fa-solid fa-pen"></i> Edit</button><button type="button" class="member-card-delete" onclick="deleteMember('${escapeHTML(m.id)}')" aria-label="Delete ${escapeHTML(m.name)}"><i class="fa-solid fa-trash"></i> Delete</button></div>`
    : "";

  return `
    <article class="member-card">
      <header class="member-card-header">
        <div class="member-card-avatar" aria-hidden="true"><i class="fa-solid fa-user"></i></div>
        <div class="member-card-identity"><div class="member-name-row"><h3>${escapeHTML(m.name)}</h3><span class="member-id-badge">${escapeHTML(memberDisplayId(m))}</span></div><span class="member-role-badge"><i class="fa-regular fa-user"></i>${escapeHTML(m.designation || "Member")}</span></div>
      </header>
      <div class="member-card-divider"><span></span></div>
      <div class="member-info-details">
        ${details.map(([label, value, icon]) => `<div class="member-detail"><i class="fa-solid ${icon}" aria-hidden="true"></i><div><span>${label}</span><strong>${escapeHTML(value)}</strong></div></div>`).join("")}
      </div>
      ${phone || whatsapp ? `<div class="card-actions">
        ${phone ? `<a class="btn-call" href="tel:${escapeHTML(phone)}" aria-label="Call ${escapeHTML(m.name)}" title="Call"></a>` : ""}
        ${whatsapp ? `<a class="btn-wa" href="https://wa.me/${escapeHTML(whatsapp)}" target="_blank" rel="noopener" aria-label="WhatsApp ${escapeHTML(m.name)}" title="WhatsApp"></a>` : ""}
      </div>` : ""}
      ${supervisorActions}
    </article>`;
}

function filterMemberCards(query = "") {
  const term = String(query).trim().toLocaleLowerCase();
  const matches = fullMembersList.filter(member => !term || [member.name, memberDisplayId(member), member.id, member.designation, member.education, member.fatherName, member.location, member.mobile, member.bloodGroup, member.contribution, member.bloodCount].some(value => String(value ?? "").toLocaleLowerCase().includes(term)));
  const container = document.getElementById("membersContainer");
  if (!container) return;
  container.innerHTML = matches.length ? matches.map(memberCardHTML).join("") : '<p class="empty-message">No Members Found</p>';
}

let attendanceCountsByMemberId = {};

async function loadMemberAttendanceCounts() {
  attendanceCountsByMemberId = {};
  await waitForFirebase();

  const { attendance: attendanceSnapshot, programs: programSnapshot } = await AttendanceRepository.readMemberSummarySources();
  const allAttendance = attendanceSnapshot.val() || {};
  const programs = programSnapshot.val() || {};

  Object.entries(allAttendance).forEach(([programId, programAttendance]) => {
    if (programs[programId]?.deleted === true) return;
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
  const addButton = document.getElementById("memberAddButton");
  if (addButton) addButton.classList.toggle("hidden", !isSupervisorLoggedIn());

  try {
    await fetchMembersFromFirebase();
    await loadMemberAttendanceCounts();

    fullMembersList.forEach(member => {
      member.attendanceCount = attendanceCountsByMemberId[String(member.id)] || 0;
    });

    const search = document.getElementById("memberSearchInput")?.value || "";
    filterMemberCards(search);
  } catch (error) {
    console.error(error);
    container.innerHTML = `<p class="error-message">Members data load ಆಗಲಿಲ್ಲ. Firebase connection ಪರಿಶೀಲಿಸಿ.</p>`;
  }
}

function openMemberEdit(memberId) {
  if (!requireSupervisor()) return;
  const member = getMemberById(memberId);
  if (!member) return;
  openMemberForm(member, false);
}

function openMemberAdd() {
  if (!requireSupervisor()) return;
  const highestId = fullMembersList.concat(deactivatedMembersList)
    .map(member => Number(member.id)).filter(Number.isInteger).reduce((max, id) => Math.max(max, id), 0);
  openMemberForm({ id: String(highestId + 1), name: "", designation: "Member", fatherName: "", education: "", location: "", bloodGroup: "", mobile: "", contribution: "" }, true);
}

function openMemberForm(member, isNew) {
  const field = (name, label, value, type = "text") => `<label class="member-edit-field">${label}<input name="${name}" type="${type}" value="${escapeHTML(String(value ?? ""))}" ${name === "name" ? "required" : ""}></label>`;
  document.getElementById("memberEditModal")?.remove();
  document.body.insertAdjacentHTML("beforeend", `<div class="member-edit-overlay" id="memberEditModal" role="dialog" aria-modal="true" aria-labelledby="memberEditTitle">
    <section class="member-edit-card"><header><div><h3 id="memberEditTitle">${isNew ? "Add Member" : "Edit Member"}</h3><p>${escapeHTML(memberDisplayId(member))}</p></div><button type="button" onclick="closeMemberEdit()" aria-label="Close"><i class="fa-solid fa-xmark"></i></button></header>
      <form class="member-edit-form" onsubmit="saveMemberEdit(event, '${escapeHTML(member.id)}', ${isNew})">
        <div class="member-edit-grid">
          ${field("name", "Member Name", member.name)}
          ${field("designation", "Designation", member.designation)}
          ${field("fatherName", "Father Name", member.fatherName)}
          ${field("education", "Education", member.education)}
          ${field("location", "Location", member.location)}
          ${field("bloodGroup", "Blood Group", member.bloodGroup)}
          ${field("mobile", "Mobile Number", member.mobile, "tel")}
          ${field("contribution", "Contribution (₹)", member.contribution, "number")}
        </div>
        <footer><button type="button" class="member-edit-cancel" onclick="closeMemberEdit()">Cancel</button><button type="submit" class="member-edit-save">${isNew ? "Add Member" : "Save Changes"}</button></footer>
      </form>
    </section>
  </div>`);
}

function closeMemberEdit() { document.getElementById("memberEditModal")?.remove(); }

async function saveMemberEdit(event, memberId, isNew = false) {
  event.preventDefault();
  if (!requireSupervisor()) return;
  const member = isNew ? { id: String(memberId) } : getMemberById(memberId);
  if (!member) return;
  const values = Object.fromEntries(new FormData(event.currentTarget).entries());
  const update = {
    name: String(values.name || "").trim(),
    designation: String(values.designation || "").trim(),
    fatherName: String(values.fatherName || "").trim(),
    education: String(values.education || "").trim(),
    location: String(values.location || "").trim(),
    bloodGroupOverride: String(values.bloodGroup || "").trim().toUpperCase(),
    mobile: String(values.mobile || "").trim(),
    contribution: String(values.contribution || "").trim()
  };
  if (!update.name) { showToast("Member name is required."); return; }
  if (update.name.length > 150) { showToast("Member name must be 150 characters or fewer."); return; }
  try {
    await waitForFirebase();
    const updatedAt = new Date().toISOString();
    let databaseKey;
    if (isNew) {
      databaseKey = MembersRepository.key("members");
      const newMember = { ...update, id: String(memberId), active: true, createdAt: updatedAt, updatedAt };
      await MembersRepository.update({ [`members/${databaseKey}`]: newMember }, { action: "member.create", path: "members", recordId: databaseKey, afterUpdatedAt: updatedAt });
    } else {
      databaseKey = await MembersRepository.resolveMemberKey(memberId);
      const updates = Object.fromEntries(Object.entries({ ...update, updatedAt }).map(([field, value]) => [`members/${databaseKey}/${field}`, value]));
      await MembersRepository.update(updates, { action: "member.update", path: "members", recordId: databaseKey, beforeUpdatedAt: String(member.updatedAt || ""), afterUpdatedAt: updatedAt });
    }
    closeMemberEdit();
    await fetchMembersFromFirebase(true);
    await renderMemberCards();
  } catch (error) {
    console.error("Member update error:", error);
    showToast(error.code === "PERMISSION_DENIED" || error.message?.includes("PERMISSION_DENIED")
      ? "Firebase denied this change. Sign in again with an active official account and verify the deployed database rules."
      : isNew ? "Member could not be added. Check the connection and try again." : "Member details could not be updated. Check the connection and try again.");
  }
}

async function deleteMember(memberId) {
  if (!requireSupervisor()) return;
  const member = getMemberById(memberId);
  if (!member) return;
  if (!await showConfirmSheet({ title: "Deactivate member?", message: `${member.name} will be removed from the active member list. Historical attendance records will remain.`, confirmLabel: "Deactivate", danger: true })) return;
  try {
    await waitForFirebase();
    const databaseKey = await MembersRepository.resolveMemberKey(memberId);
    // Read the current server record for early validation and audit logging.
    // Update only the status fields. A transaction can abort on Firebase's
    // initial cached null for newly-created push-key records; leaf writes
    // avoid that race and preserve every other field on the live record.
    const currentRecord = (await MembersRepository.read(`members/${databaseKey}`)).val();
    if (!currentRecord) throw new Error("Member record is no longer in the database. Refresh and try again.");
    const beforeUpdatedAt = String(currentRecord.updatedAt || "");
    if (currentRecord.active === false) throw new Error("Member is already deactivated. Refresh and try again.");
    const deactivatedAt = new Date().toISOString();
    await MembersRepository.update({
      [`members/${databaseKey}/active`]: false,
      [`members/${databaseKey}/deactivatedAt`]: deactivatedAt,
      [`members/${databaseKey}/updatedAt`]: deactivatedAt
    });
    await MembersRepository.audit({ action: "member.deactivate", path: "members", recordId: databaseKey, beforeUpdatedAt, afterUpdatedAt: deactivatedAt });
    await fetchMembersFromFirebase(true);
    await renderMemberCards();
  } catch (error) {
    console.error("Member delete error:", error);
    showToast(error.message?.includes("changed before") ? "Another official changed this member. Refresh and try again." : (error.message?.includes("already deactivated") || error.message?.includes("no longer in the database") ? error.message : "Member could not be deactivated. Check the connection and try again."));
  }
}

async function restoreMember(memberId) {
  if (!requireSupervisor()) return;
  const member = deactivatedMembersList.find(item => String(item.id) === String(memberId));
  if (!member) return;
  try {
    const databaseKey = await MembersRepository.resolveMemberKey(memberId);
    // Read the current server record for early validation and audit logging.
    // Update only status fields to avoid a cached-null transaction abort and
    // preserve any current edits to the member's other fields.
    const currentRecord = (await MembersRepository.read(`members/${databaseKey}`)).val();
    if (!currentRecord) throw new Error("Member record is no longer in the database. Refresh and try again.");
    const beforeUpdatedAt = String(currentRecord.updatedAt || "");
    if (currentRecord.active !== false) throw new Error("Member is already active. Refresh and try again.");
    const restoredAt = new Date().toISOString();
    await MembersRepository.update({
      [`members/${databaseKey}/active`]: true,
      [`members/${databaseKey}/restoredAt`]: restoredAt,
      [`members/${databaseKey}/updatedAt`]: restoredAt
    });
    await MembersRepository.audit({ action: "member.restore", path: "members", recordId: databaseKey, beforeUpdatedAt, afterUpdatedAt: restoredAt });
    await fetchMembersFromFirebase(true);
    await renderMemberCards();
  } catch (error) {
    console.error("Member restore error:", error);
    showToast(error.message?.includes("changed before") ? "Another official changed this member. Refresh and try again." : (error.message?.includes("already active") || error.message?.includes("no longer in the database") ? error.message : "Member could not be restored. Check the connection and try again."));
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
    const donationSnapshot = await MembersRepository.read("bloodDonations");
    const donationData = donationSnapshot.val() || {};
    members.forEach(member => {
      const records = Object.values(donationData[String(member.id)] || {}).filter(record => record?.deleted !== true);
      member.bloodDonationCount = records.length;
    });
    if (countEl) countEl.textContent = members.length;
    renderBloodFilterPills(members);
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
    const badgeId = escapeHTML(String(m.id ?? ""));

    return `
      <article class="blood-donor-card ${phone || whatsapp ? "has-contact-actions" : "no-contact-actions"}" data-search="${escapeHTML(`${m.name} ${displayGroup} ${m.id} ${memberDisplayId(m)}`.toLowerCase())}" data-group="${escapeHTML(displayGroup.toUpperCase())}">
        <div class="blood-member-avatar" aria-hidden="true"><i class="fa-solid fa-user"></i></div>
        <div class="blood-donor-info">
          <h3>${escapeHTML(m.name)}</h3>
          <div class="blood-donor-meta"><span class="blood-donor-id">ID : ${escapeHTML(memberDisplayId(m))}</span><span class="blood-donor-separator">|</span><span class="blood-donor-count">${displayedCount} ${donationCount === 1 ? "Time" : "Times"} Donated</span></div>
        </div>
        <button type="button" class="blood-group-badge ${displayGroup ? "has-group" : "missing-group"}" onclick="openBloodGroupModal('${badgeId}')" title="${displayGroup ? "Change blood group" : "Add blood group"}" aria-label="Blood group ${escapeHTML(displayGroup || "not provided")} — click to update">
          ${displayGroup ? `<i class="fa-solid fa-droplet"></i><span>${escapeHTML(displayGroup)}</span><i class="fa-solid fa-pen blood-badge-edit-hint"></i>` : `<i class="fa-solid fa-plus"></i><span>Blood</span><i class="fa-solid fa-pen blood-badge-edit-hint"></i>`}
        </button>
        <div class="blood-donor-actions">
          ${phone ? `<a class="btn-call" href="tel:${escapeHTML(phone)}" aria-label="Call ${escapeHTML(m.name)}" title="Call"><i class="fa-solid fa-phone"></i></a>` : ""}
          ${whatsapp ? `<a class="btn-wa" href="https://wa.me/${escapeHTML(whatsapp)}" target="_blank" rel="noopener" aria-label="WhatsApp ${escapeHTML(m.name)}" title="WhatsApp"><i class="fa-brands fa-whatsapp"></i></a>` : ""}
        </div>
        <span class="blood-row-divider" aria-hidden="true"></span>
        <button type="button" class="blood-history-open" onclick="openBloodDonationHistory('${escapeHTML(m.id)}')" aria-label="Open ${escapeHTML(m.name)} donation history"><i class="fa-solid fa-chevron-right"></i></button>
      </article>`;
  }).join("");
}

const BLOOD_GROUP_OPTIONS = ["A+", "A-", "B+", "B-", "O+", "O-", "AB+", "AB-"];

function openBloodGroupModal(memberId) {
  const member = getMemberById(memberId);
  if (!member) return;
  const current = String(member.bloodGroup || "");
  const safeId = escapeHTML(String(member.id ?? ""));
  programModal(`<div class="program-modal-card blood-group-modal"><div class="program-modal-header"><div><h3>Blood Group</h3><p>${escapeHTML(member.name)} · ID ${escapeHTML(memberDisplayId(member))}</p></div><button type="button" class="program-close" onclick="closeProgramModal()" aria-label="Close"><i class="fa-solid fa-xmark"></i></button></div><div class="blood-group-grid" role="radiogroup" aria-label="Select blood group">${BLOOD_GROUP_OPTIONS.map(group => `<button type="button" class="blood-group-pill ${current === group ? "selected" : ""}" data-group="${group}"><i class="fa-solid fa-droplet"></i> ${group}</button>`).join("")}<button type="button" class="blood-group-pill blood-group-pill-none ${current ? "" : "selected"}" data-group=""><i class="fa-regular fa-circle-question"></i> Not Updated</button></div><p id="bloodGroupMessage" class="program-form-message"></p><div class="program-form-actions"><button type="button" class="program-cancel" onclick="closeProgramModal()">Cancel</button><button type="button" class="program-submit" id="bloodGroupSave">Save / Update</button></div></div>`);
  const modalCard = document.getElementById("programModal");
  modalCard?.querySelectorAll(".blood-group-pill").forEach(pill => {
    pill.addEventListener("click", () => {
      modalCard.querySelectorAll(".blood-group-pill").forEach(p => p.classList.remove("selected"));
      pill.classList.add("selected");
    });
  });
  document.getElementById("bloodGroupSave")?.addEventListener("click", () => saveBloodGroup(memberId, modalCard.querySelector(".blood-group-pill.selected")?.dataset.group ?? current));
}

async function saveBloodGroup(memberId, group) {
  const member = getMemberById(memberId);
  if (!member) return;
  const message = document.getElementById("bloodGroupMessage");
  const button = document.getElementById("bloodGroupSave");
  try {
    await MembersRepository.ready();
    if (button) { button.disabled = true; button.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Saving...'; }
    if (message) message.textContent = "Saving...";
    await waitForFirebase();
    const databaseKey = await MembersRepository.resolveMemberKey(memberId);
    const updatedAt = new Date().toISOString();
    const result = await MembersRepository.transaction(`members/${databaseKey}`, current => {
      if (!current) return;
      // Update only the blood-group fields on the latest database value. A
      // stale member updatedAt must not block this independent field edit.
      return { ...current, bloodGroupOverride: String(group || ""), updatedAt };
    });
    if (!result.committed) {
      const latest = result.snapshot?.val();
      if (!latest) throw new Error("Member record could not be found. Refresh the Members page and try again.");
      throw new Error("Blood group update did not commit. Refresh and try again.");
    }
    await MembersRepository.audit({ action: "member.bloodGroup.update", path: "members", recordId: databaseKey, afterUpdatedAt: updatedAt });
    member.bloodGroup = String(group || "");
    member.bloodGroupOverride = String(group || "");
    member.updatedAt = updatedAt;
    closeProgramModal();
    renderBloodDonorCards(fullMembersList.filter(m => String(m.name || "").trim()));
  } catch (error) {
    console.error("Blood group update error:", error);
    if (message) message.textContent = `Could not save: ${error?.message || error}`;
    if (button) { button.disabled = false; button.textContent = "Save / Update"; }
  }
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
    const snapshot = await MembersRepository.read(`bloodDonations/${member.id}`);
    const allRecords = Object.entries(snapshot.val() || {}).map(([id, record]) => ({ id, ...record }));
    const records = allRecords.filter(record => record.deleted !== true)
      .sort((a, b) => String(b.donationDate || b.createdAt || "").localeCompare(String(a.donationDate || a.createdAt || "")));
    const deletedRecords = allRecords.filter(record => record.deleted === true);
    const units = records.reduce((total, record) => total + (Number(record.units) || 1), 0);
    member.bloodDonationCount = records.length;
    document.getElementById("bloodDonationMemberCount").textContent = `${records.length} ${records.length === 1 ? "donation" : "donations"} · ${units} ${units === 1 ? "unit" : "units"} total`;
    document.getElementById("bloodDonationHistory").innerHTML = records.length ? records.map(record => `
      <article class="donation-history-row">
        <div><strong>${escapeHTML(record.patientName || "Patient not recorded")}</strong><small>${escapeHTML(record.donationDate || "Date not recorded")} · ${escapeHTML(record.units || 1)} unit(s)</small></div>
        <p>${escapeHTML([record.place, record.hospital].filter(Boolean).join(" · "))}</p>
        ${record.remarks ? `<p>${escapeHTML(record.remarks)}</p>` : ""}
        ${isSupervisorLoggedIn() ? `<button type="button" class="donation-delete" onclick="deleteBloodDonation('${escapeHTML(member.id)}','${escapeHTML(record.id)}')" aria-label="Delete donation record"><i class="fa-solid fa-trash"></i></button>` : ""}
      </article>`).join("") : `<p class="empty-message">No donation records yet.</p>`;
    if (isSupervisorLoggedIn() && deletedRecords.length) {
      document.getElementById("bloodDonationHistory").insertAdjacentHTML("beforeend", `<section class="donation-trash"><h3>Trash</h3>${deletedRecords.map(record => `<article class="donation-history-row"><div><strong>${escapeHTML(record.patientName || "Patient not recorded")}</strong><small>${escapeHTML(record.donationDate || "Date not recorded")} · Hidden</small></div><button type="button" onclick="restoreBloodDonation(${JSON.stringify(String(member.id))},${JSON.stringify(String(record.id))})">Restore</button></article>`).join("")}</section>`);
    }
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
    const snapshot = await MembersRepository.read("bloodDonations");
    const data = snapshot.val() || {};
    const memberById = new Map(fullMembersList.map(member => [String(member.id), member]));
    const byYear = {};
    Object.entries(data).forEach(([memberId, records]) => {
      Object.entries(records || {}).filter(([, record]) => record?.deleted !== true).forEach(([recordId, record]) => {
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
  if (!requireSupervisor()) return;
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
  if (!requireSupervisor()) return;
  // The delegated `submit` listener in js/views/app-events.view.js runs on
  // `document`, so `event.currentTarget` is the document and not the form.
  // Resolve the submitted form from the event target (the form itself) or
  // from the element the handler is bound to.
  const form =
    (event?.target instanceof HTMLFormElement && event.target) ||
    (this instanceof HTMLFormElement && this) ||
    document.getElementById("bloodDonationForm") ||
    null;
  const memberId = document.getElementById("bloodDonationModal")?.dataset.memberId;
  const member = getMemberById(memberId);
  if (!member) return;
  const error = document.getElementById("bloodDonationFormError");
  if (error) error.textContent = "";
  if (!form) {
    if (error) error.textContent = "The donation form could not be opened. Please close it and try again.";
    return;
  }
  try {
    const values = Object.fromEntries(new FormData(form).entries());
    const record = {
      memberId: String(member.id), memberName: member.name,
      patientName: String(values.patientName || "").trim(),
      place: String(values.place || "").trim(), hospital: String(values.hospital || "").trim(),
      donationDate: String(values.donationDate || ""), units: Number(values.units),
      remarks: String(values.remarks || "").trim(), createdAt: new Date().toISOString()
    };
    await waitForFirebase();
    const recordId = MembersRepository.key(`bloodDonations/${member.id}`);
    await MembersRepository.update({ [`bloodDonations/${member.id}/${recordId}`]: record }, { action: "bloodDonation.create", path: `bloodDonations/${member.id}`, recordId, afterUpdatedAt: record.createdAt });
    closeBloodDonationForm();
    await openBloodDonationHistory(member.id);
    renderBloodDonorCards(fullMembersList);
  } catch (saveError) {
    console.error("Blood donation save error:", saveError);
    if (error) error.textContent = "Could not save this record. Check your connection and try again.";
  }
}

async function deleteBloodDonation(memberId, recordId) {
  if (!requireSupervisor()) return;
  if (!await showConfirmSheet({ title: "Hide donation record?", message: "This record can be restored later.", confirmLabel: "Hide record", danger: true })) return;
  try {
    await waitForFirebase();
    const safeMemberId = String(memberId || "");
    const safeRecordId = String(recordId || "");
    const path = `bloodDonations/${safeMemberId}/${safeRecordId}`;
    const current = (await MembersRepository.read(path)).val();
    if (!current || current.deleted === true) {
      await openBloodDonationHistory(safeMemberId);
      return;
    }
    const updatedAt = new Date().toISOString();
    await MembersRepository.update({
      [`${path}/deleted`]: true,
      [`${path}/deletedAt`]: updatedAt,
      [`${path}/updatedAt`]: updatedAt
    });
    await MembersRepository.audit({ action: "bloodDonation.hide", path: `bloodDonations/${safeMemberId}`, recordId: safeRecordId, afterUpdatedAt: updatedAt });
    await openBloodDonationHistory(safeMemberId);
    renderBloodDonorCards(fullMembersList);
  } catch (error) {
    console.error("Blood donation delete error:", error);
    showToast("Could not delete this record. Please try again.");
  }
}

async function restoreBloodDonation(memberId, recordId) {
  if (!requireSupervisor()) return;
  try {
    await waitForFirebase();
    const safeMemberId = String(memberId || "");
    const safeRecordId = String(recordId || "");
    const path = `bloodDonations/${safeMemberId}/${safeRecordId}`;
    const current = (await MembersRepository.read(path)).val();
    if (!current || current.deleted !== true) throw new Error("Donation record is no longer in Trash.");
    const restoredAt = new Date().toISOString();
    await MembersRepository.update({
      [`${path}/deleted`]: false,
      [`${path}/restoredAt`]: restoredAt,
      [`${path}/updatedAt`]: restoredAt
    });
    await MembersRepository.audit({ action: "bloodDonation.restore", path: `bloodDonations/${safeMemberId}`, recordId: safeRecordId, afterUpdatedAt: restoredAt });
    await openBloodDonationHistory(safeMemberId);
    renderBloodDonorCards(fullMembersList);
  } catch (error) { console.error("Blood donation restore error:", error); showToast("Donation record could not be restored. Refresh and try again."); }
}

document.addEventListener("DOMContentLoaded", () => {
  const bloodGroupFilter = document.getElementById("bloodGroupFilter");
  if (bloodGroupFilter) {
    bloodGroupFilter.open = true;
    bloodGroupFilter.querySelector("summary")?.addEventListener("click", event => event.preventDefault());
  }
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

function applyBloodGroupFilter(group) {
  const query = document.getElementById("bloodDonorSearch");
  if (query) query.value = "";
  document.querySelectorAll("#bloodDonorsContainer .blood-donor-card").forEach(card => {
    const cardGroup = String(card.dataset.group || "").trim();
    card.style.display = group === "ALL" || cardGroup === group ? "grid" : "none";
  });
  document.querySelectorAll("#bloodFilterPills .blood-filter-pill").forEach(pill => {
    pill.classList.toggle("active", pill.dataset.filter === group);
  });
}

function renderBloodFilterPills(members) {
  const wrap = document.getElementById("bloodFilterPills");
  if (!wrap) return;
  const counts = {};
  let pending = 0;
  members.forEach(m => {
    const group = String(m.bloodGroup || "").trim().toUpperCase();
    if (group) counts[group] = (counts[group] || 0) + 1;
    else pending++;
  });
  const groups = BLOOD_GROUP_OPTIONS.filter(group => counts[group]);
  wrap.innerHTML = [`<button type="button" class="blood-filter-pill active" data-filter="ALL">All (${members.length})</button>`, ...groups.map(group => `<button type="button" class="blood-filter-pill" data-filter="${group}">${group} (${counts[group]})</button>`), pending ? `<button type="button" class="blood-filter-pill blood-filter-pending" data-filter="">Pending Blood Details (${pending})</button>` : ""].join("");
  wrap.querySelectorAll(".blood-filter-pill").forEach(pill => {
    pill.addEventListener("click", () => applyBloodGroupFilter(pill.dataset.filter));
  });
}
