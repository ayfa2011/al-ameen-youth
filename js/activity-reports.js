// ============================================================
// AYFA PROGRAM REPORTS — Realtime Database + Firebase Storage
// ============================================================

const programReportState = { reports: [], deletedReports: [] };
const driveGalleryState = { folders: [], activeFolder: null, activeIndex: 0 };
let selectedProgramPreviewUrls = [];

function programDate(value) {
  if (!value) return "—";
  const date = new Date(`${value}T00:00:00`);
  return Number.isNaN(date.getTime()) ? "—" : new Intl.DateTimeFormat("en-IN", { day: "2-digit", month: "short", year: "numeric" }).format(date);
}

async function loadProgramReports() {
  const list = document.getElementById("programReportsList");
  if (list) list.innerHTML = '<div class="program-reports-empty"><i class="fa-solid fa-spinner fa-spin"></i> Activities loading...</div>';
  try {
    await ActivityReportsRepository.ready();
    const snapshot = await ActivityReportsRepository.read("programReports");
    // Firebase's child key is the canonical identifier used by every write.
    // Some older records contain their own `id` field; keep that data from
    // shadowing the actual Realtime Database key.
    const records = Object.entries(snapshot.val() || {}).map(([id, report]) => ({ ...(report || {}), id: String(id) }));
    programReportState.deletedReports = records.filter(report => report.deleted === true);
    programReportState.reports = records.filter(report => report.deleted !== true).sort((a, b) => String(b.date || b.createdAt || "").localeCompare(String(a.date || a.createdAt || "")));
    populateProgramReportYears();
    renderProgramReports();
  } catch (error) {
    console.error(error);
    if (list) list.innerHTML = '<div class="program-reports-empty">Activity reports could not be loaded. Check the connection.</div>';
  }
}

function populateProgramReportYears() {
  const select = document.getElementById("programReportYear");
  if (!select) return;
  const current = String(new Date().getFullYear());
  const selected = select.value || current;
  const years = new Set([current]);
  programReportState.reports.forEach(report => { if (/^\d{4}/.test(String(report.date || ""))) years.add(String(report.date).slice(0, 4)); });
  select.innerHTML = Array.from(years).sort((a, b) => b.localeCompare(a)).map(year => `<option value="${year}" ${year === selected ? "selected" : ""}>${year}</option>`).join("");
}

function reportPreview(text) {
  const words = String(text || "").trim().split(/\s+/);
  return words.length > 35 ? `${words.slice(0, 35).join(" ")}…` : words.join(" ");
}

function normalizeReportPhotos(report) {
  const raw = report?.photos;
  if (!raw) return [];
  if (Array.isArray(raw)) return raw.filter(Boolean);
  if (typeof raw === "object") return Object.values(raw).filter(Boolean);
  if (typeof raw === "string" && raw.trim()) return [raw.trim()];
  return [];
}

function displayPhotoUrl(url) {
  if (!url) return "";
  let value = "";
  let fileId = "";
  if (typeof url === "object") {
    value = String(url.thumbnailUrl || url.imageUrl || url.downloadUrl || url.directLink || url.url || url.webViewLink || url.src || "").trim();
    fileId = String(url.fileId || url.driveFileId || url.driveId || "").trim();
  } else {
    value = String(url || "").trim();
  }
  if (!value && fileId) return `https://drive.google.com/thumbnail?id=${encodeURIComponent(fileId)}&sz=w1000`;
  if (!value) return "";
  const driveId = fileId
    || value.match(/drive\.google\.com\/file\/d\/([^/ ?#]+)/)?.[1]
    || value.match(/[?&]id=([^&#]+)/)?.[1]
    || value.match(/drive\.google\.com\/thumbnail\?id=([^&#]+)/)?.[1]
    || "";
  if (driveId) return `https://drive.google.com/thumbnail?id=${encodeURIComponent(driveId)}&sz=w1000`;
  return value;
}

function programCoverFallback(img) {
  const wrap = img ? img.closest(".program-report-cover") : null;
  if (!wrap || wrap.dataset.fallback === "1") return;
  wrap.dataset.fallback = "1";
  wrap.classList.add("is-empty");
  wrap.innerHTML = '<img class="program-report-default" src="assets/images/group-photo.png" alt="AYFA activity" loading="lazy" onerror="this.remove()"><div class="program-report-placeholder"><i class="fa-solid fa-calendar-check"></i><span>AYFA Activity</span></div>';
}

function renderProgramReports() {
  const list = document.getElementById("programReportsList");
  const title = document.getElementById("programReportsTitle");
  const year = document.getElementById("programReportYear")?.value || String(new Date().getFullYear());
  if (!list) return;
  if (title) title.textContent = `${year} AYFA Activities & Programs`;
  const query = String(document.getElementById("programReportSearch")?.value || "").trim().toLowerCase();
  const reports = programReportState.reports.filter(report => String(report.date || "").startsWith(year) && (!query || `${report.title || ""} ${report.description || ""}`.toLowerCase().includes(query)));
  const supervisor = typeof isSupervisorLoggedIn === "function" ? isSupervisorLoggedIn() : false;
  list.innerHTML = reports.length ? reports.map(report => {
    const photos = normalizeReportPhotos(report);
    const cover = photos[0] ? displayPhotoUrl(photos[0]) : "";
    const safeId = escapeHTML(String(report.id ?? ""));
    return `<article class="program-report-card">${supervisor ? `<div class="program-report-admin-icons"><button type="button" data-action="edit" data-id="${safeId}" aria-label="Edit" title="Edit"><i class="fa-solid fa-pen"></i></button><button type="button" class="program-report-delete" data-action="delete" data-id="${safeId}" aria-label="Delete" title="Delete"><i class="fa-solid fa-trash"></i></button></div>` : ""}<div class="program-report-cover">${cover ? `<img src="${escapeHTML(cover)}" alt="${escapeHTML(report.title || "AYFA activity photo")}" loading="lazy" referrerpolicy="no-referrer" onerror="programCoverFallback(this)">` : `<img class="program-report-default" src="assets/images/group-photo.png" alt="AYFA activity" loading="lazy" onerror="this.remove()"><div class="program-report-placeholder"><i class="fa-solid fa-calendar-check"></i><span>AYFA Activity</span></div>`}</div><div class="program-report-copy"><h3><button type="button" class="program-report-title-link" data-action="view" data-id="${safeId}">${escapeHTML(report.title || "Untitled program")}</button></h3><div class="program-report-meta"><span><i class="fa-regular fa-calendar"></i> ${programDate(report.date)}</span>${photos.length > 1 ? `<span><i class="fa-solid fa-images"></i> ${photos.length} photos</span>` : ""}</div><p>${escapeHTML(reportPreview(report.description))}</p>${supervisor ? "" : `<button type="button" class="program-report-read" data-action="view" data-id="${safeId}">Read more <i class="fa-solid fa-arrow-right"></i></button>`}</div></article>`;
  }).join("") : `<div class="program-reports-empty"><i class="fa-regular fa-folder-open"></i><strong>No activities for ${escapeHTML(year)}</strong> <span>Submit the first program report for this year.</span></div>`;
  // Delegated buttons — no inline quoting bugs, works with any Firebase push-id.
  list.querySelectorAll("[data-action][data-id]").forEach(btn => {
    btn.addEventListener("click", () => {
      const id = btn.getAttribute("data-id") || "";
      const action = btn.getAttribute("data-action") || "";
      if (action === "view") openProgramReportDetail(id);
      else if (action === "edit") openProgramReportForm(id);
      else if (action === "delete") deleteProgramReport(id);
      else if (action === "restore") restoreProgramReport(id);
    });
  });
  if (supervisor && programReportState.deletedReports.length) {
    list.insertAdjacentHTML("beforeend", `<section class="program-trash"><h3><i class="fa-solid fa-trash-can"></i> Previously hidden reports</h3>${programReportState.deletedReports.map(report => `<div class="program-trash-row"><span>${escapeHTML(report.title || "Untitled report")}</span><div><button type="button" data-action="edit" data-id="${escapeHTML(String(report.id ?? ""))}">Edit</button><button type="button" data-action="restore" data-id="${escapeHTML(String(report.id ?? ""))}">Restore</button><button type="button" data-action="delete" data-id="${escapeHTML(String(report.id ?? ""))}">Delete permanently</button></div></div>`).join("")}</section>`);
    list.querySelectorAll(".program-trash [data-action]").forEach(btn => {
      btn.addEventListener("click", () => {
        const id = btn.getAttribute("data-id") || "";
        if (btn.getAttribute("data-action") === "edit") openProgramReportForm(id);
        else if (btn.getAttribute("data-action") === "restore") restoreProgramReport(id);
        else if (btn.getAttribute("data-action") === "delete") deleteProgramReport(id);
      });
    });
  }
}

function programModal(content) { document.body.insertAdjacentHTML("beforeend", `<div class="program-modal" id="programModal" role="dialog" aria-modal="true">${content}</div>`); }
function closeProgramModal() { document.getElementById("programModal")?.remove(); }

function openProgramReportForm(editId = "") {
  if (!requireSupervisor()) return;
  const existing = editId ? programReportState.reports.concat(programReportState.deletedReports).find(item => item.id === editId) : null;
  if (editId && !existing) {
    showToast("This report is no longer active. The report list has been refreshed.");
    void loadProgramReports();
    return;
  }
  const today = new Date().toISOString().slice(0, 10);
  const safeEditId = escapeHTML(String(editId || ""));
  const existingPhotos = existing ? normalizeReportPhotos(existing) : [];
  programModal(`<div class="program-modal-card"><div class="program-modal-header"><div><h3>${existing ? "Edit Activity Report" : "Submit Activity Report"}</h3></div><button type="button" class="program-close" onclick="closeProgramModal()"><i class="fa-solid fa-xmark"></i></button></div><form id="programReportForm" class="program-report-form" data-edit-id="${safeEditId}"><label>Program title *<input name="title" maxlength="200" value="${escapeHTML(existing?.title || "")}" required></label><label>Description *<textarea name="description" maxlength="20000" required>${escapeHTML(existing?.description || "")}</textarea></label><label>Date *<input name="date" type="date" value="${escapeHTML(existing?.date || today)}" required></label><label class="program-photo-field">Upload photos <span>Multiple photos allowed. Newly uploaded photos are added to this report.</span><input name="photos" type="file" accept="image/*" multiple onchange="previewSelectedProgramPhotos(this.files)"></label><div id="programPhotoPreview" class="program-photo-preview"></div>${existingPhotos.length ? `<div class="program-photo-gallery">${existingPhotos.map(url => `<img src="${escapeHTML(displayPhotoUrl(url))}" alt="Existing activity photo" loading="lazy" referrerpolicy="no-referrer" onerror="this.style.display='none'">`).join("")}</div>` : ""}<p id="programFormMessage" class="program-form-message"></p><div class="program-form-actions"><button type="button" class="program-cancel" onclick="closeProgramModal()">Cancel</button><button type="submit" class="program-submit">${existing ? "Save changes" : "Submit report"}</button></div></form></div>`);
  document.getElementById("programReportForm")?.addEventListener("submit", (e) => {
    submitProgramReport(e, e.target?.getAttribute("data-edit-id") || "");
  });
}

function previewSelectedProgramPhotos(files) {
  const preview = document.getElementById("programPhotoPreview");
  selectedProgramPreviewUrls.forEach(url => URL.revokeObjectURL(url));
  selectedProgramPreviewUrls = [];
  if (!preview) return;
  preview.innerHTML = Array.from(files || []).map(file => {
    const url = URL.createObjectURL(file);
    selectedProgramPreviewUrls.push(url);
    return `<div class="program-selected-photo"><img src="${escapeHTML(url)}" alt=""><span>${escapeHTML(file.name)}</span></div>`;
  }).join("");
}

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(",")[1]);
    reader.onerror = () => reject(new Error("Photo read ಆಗಲಿಲ್ಲ."));
    reader.readAsDataURL(file);
  });
}

async function compressProgramPhoto(file) {
  const maxBytes = 1024 * 1024;
  if (file.size < maxBytes && file.type === "image/jpeg") return file;
  const bitmap = await createImageBitmap(file);
  try {
    const canvas = document.createElement("canvas");
    const context = canvas.getContext("2d");
    let blob = null;
    for (const maxDimension of [2400, 2000, 1600, 1200, 900]) {
      const scale = Math.min(1, maxDimension / Math.max(bitmap.width, bitmap.height));
      canvas.width = Math.max(1, Math.round(bitmap.width * scale));
      canvas.height = Math.max(1, Math.round(bitmap.height * scale));
      context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
      for (let quality = 0.86; quality >= 0.36; quality -= 0.1) {
        blob = await new Promise(resolve => canvas.toBlob(resolve, "image/jpeg", quality));
        if (blob && blob.size < maxBytes) break;
      }
      if (blob && blob.size < maxBytes) break;
    }
    if (!blob || blob.size >= maxBytes) throw new Error(`Could not compress ${file.name} below 1 MB.`);
    return new File([blob], file.name.replace(/\.[^.]+$/, ".jpg"), { type: "image/jpeg", lastModified: Date.now() });
  } finally { bitmap.close(); }
}

async function stablePhotoUploadId(file, folderName) {
  if (!window.crypto?.subtle) throw new Error("Secure photo retry protection is unavailable in this browser. Open the site over HTTPS and try again.");
  const source = await file.arrayBuffer();
  const folderBytes = new TextEncoder().encode(`${folderName}\n${file.name}\n${file.size}\n`);
  const combined = new Uint8Array(folderBytes.length + source.byteLength);
  combined.set(folderBytes);
  combined.set(new Uint8Array(source), folderBytes.length);
  const digest = await window.crypto.subtle.digest("SHA-256", combined);
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, "0")).join("");
}

async function uploadPhotosToDrive(files, folderName) {
  const results = [];
  const message = document.getElementById("programFormMessage");
  await ActivityReportsRepository.ready();
  folderName = String(folderName || "Activity Report").trim().slice(0, 200) || "Activity Report";
  const authToken = await window.firebaseAuth.currentUser.getIdToken();
  for (const [index, file] of files.entries()) {
    if (message) message.textContent = `Uploading photo ${index + 1} of ${files.length}: ${file.name}`;
    const compressed = await compressProgramPhoto(file);
    const uploadId = await stablePhotoUploadId(file, folderName);
    const payload = { action: "uploadDrivePhoto", authToken, folderName, fileName: compressed.name, mimeType: compressed.type, uploadId, base64: await fileToBase64(compressed) };
    try {
      const response = await fetch(SCRIPT_URL, {
        method: "POST",
        mode: "cors",
        headers: { "Content-Type": "text/plain;charset=utf-8" },
        body: JSON.stringify(payload)
      });
      const text = await response.text();
      let data;
      try { data = JSON.parse(text); } catch (_) { data = null; }
      if (!response.ok) throw new Error(`HTTP ${response.status}: ${text.slice(0, 300)}`);
      if (!data) throw new Error(`Apps Script returned a non-JSON response: ${text.slice(0, 300)}`);
      if (data.success === false || data.error) throw new Error(`${data.errorType || "Apps Script Error"}: ${data.error || "Unknown error"}`);
      results.push(data);
    } catch (error) {
      throw new Error(`Photo "${file.name}" upload failed — ${error.message || error}`);
    }
  }
  if (results.length) {
    const folderId = String(results[0].folderId || "");
    const folderKey = folderId || String(folderName || "Activity Report").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
    const photos = results.map(item => ({ fileId:item.fileId || "", fileName:item.fileName || "", imageUrl:item.imageUrl || "", thumbnailUrl:item.thumbnailUrl || "", webViewLink:item.webViewLink || "", folderUrl:item.folderUrl || "", uploadedAt:new Date().toISOString() }));
    try {
      const result = await ActivityReportsRepository.transaction(`drivePhotoFolders/${folderKey}`, current => {
        const previous = current || {};
        const oldPhotos = Array.isArray(previous.photos) ? previous.photos : Object.values(previous.photos || {});
        const byId = new Map(oldPhotos.map(photo => [String(photo.fileId || photo.imageUrl || photo.webViewLink || ""), photo]));
        photos.forEach(photo => {
          const photoKey = String(photo.fileId || photo.imageUrl || photo.webViewLink || "");
          if (photoKey) byId.set(photoKey, photo);
        });
        return { ...previous, driveFolderId:folderId || previous.driveFolderId || "", name:String(folderName || previous.name || "Activity Report"), folderUrl:results.find(item => item.folderUrl)?.folderUrl || previous.folderUrl || "", photos:[...byId.values()], updatedAt:new Date().toISOString() };
      });
      if (!result.committed) throw new Error("Photo metadata transaction did not commit.");
      await ActivityReportsRepository.audit({ action: "drivePhotoFolder.update", path: "drivePhotoFolders", recordId: folderKey, afterUpdatedAt: result.snapshot.val()?.updatedAt });
    }
    catch(error) { throw new Error(`Photos uploaded to Google Drive, but Firebase photo metadata could not be saved: ${error.message || error}`); }
  }
  return results;
}

function openDrivePhotoUpload() {
  if (!isRoleAuthenticated()) { showAuthScreen(); return; }
  const uploadForm = isSupervisorLoggedIn() ? `<form class="program-report-form" onsubmit="submitDrivePhotoUpload(event)"><label>Folder name *<input name="folderName" list="driveFolderNames" placeholder="Create or select a folder" required></label><datalist id="driveFolderNames"></datalist><label class="program-photo-field">Select photos *<input name="photos" type="file" accept="image/*" multiple required onchange="previewSelectedProgramPhotos(this.files)"></label><div id="programPhotoPreview" class="program-photo-preview"></div><p id="programFormMessage" class="program-form-message"></p><div class="program-form-actions"><button type="submit" class="program-submit">Upload to Drive</button></div></form>` : "";
  programModal(`<div class="program-modal-card drive-library-modal"><div class="program-modal-header"><div><h3>Photo Gallery</h3><p>${isSupervisorLoggedIn() ? "Upload photos or browse existing folders." : "Browse existing Google Drive photo folders."}</p></div><button type="button" class="program-close" onclick="closeProgramModal()" aria-label="Close"><i class="fa-solid fa-xmark"></i></button></div>${uploadForm}<section class="drive-folders-section"><h4>Uploaded folders</h4><div id="driveFolderList" class="drive-folder-list"><p class="program-reports-empty">Loading folders…</p></div></section></div>`);
  void loadDriveFolders();
}

async function loadDriveFolders() {
  const list = document.getElementById("driveFolderList");
  if (!list) return;
  try {
    await ActivityReportsRepository.ready();
    let cached = [];
    try {
      const snapshot = await ActivityReportsRepository.read("drivePhotoFolders");
      cached = Object.entries(snapshot.val() || {}).map(([id, folder]) => ({ id, ...folder }));
    } catch(error) { console.warn("Firebase photo metadata read unavailable; reading Drive folder list:",error); }
    const token = await window.firebaseAuth.currentUser.getIdToken();
    const response = await fetch(SCRIPT_URL, { method:"POST", mode:"cors", headers:{"Content-Type":"text/plain;charset=utf-8"}, body:JSON.stringify({action:"listDrivePhotoFolders",authToken:token}) });
    const driveData = await response.json();
    if (!response.ok || driveData.success === false || driveData.error) throw new Error(driveData.error || "Google Drive folder list could not be loaded.");
    const byFolder = new Map(cached.map(folder => [String(folder.driveFolderId || folder.id), folder]));
    (driveData.folders || []).forEach(folder => {
      const old = byFolder.get(String(folder.id)) || {};
      const oldPhotos = Array.isArray(old.photos) ? old.photos : Object.values(old.photos || {});
      const photoById = new Map(oldPhotos.map(photo => [String(photo.fileId || photo.imageUrl || photo.webViewLink || ""), photo]));
      (folder.photos || []).forEach(photo => {
        const key = String(photo.fileId || photo.imageUrl || photo.webViewLink || "");
        photoById.set(key, { ...(photoById.get(key) || {}), ...photo });
      });
      byFolder.set(String(folder.id), {...old,...folder,id:old.id || folder.id,driveFolderId:folder.id,photos:[...photoById.values()]});
    });
    driveGalleryState.folders = [...byFolder.values()].sort((a,b) => String(b.updatedAt || "").localeCompare(String(a.updatedAt || "")));
    const datalist = document.getElementById("driveFolderNames");
    if (datalist) datalist.innerHTML = driveGalleryState.folders.map(folder => `<option value="${escapeHTML(folder.name)}"></option>`).join("");
    list.innerHTML = driveGalleryState.folders.length ? driveGalleryState.folders.map(folder => {
      const photos = Array.isArray(folder.photos) ? folder.photos : Object.values(folder.photos || {});
      const cover = photos[0]?.thumbnailUrl || photos[0]?.imageUrl || "";
      return `<button type="button" class="drive-folder-card" onclick="openDriveGallery('${escapeHTML(folder.id)}')">${cover ? `<img src="${escapeHTML(cover)}" loading="lazy" alt="">` : '<span class="drive-folder-icon"><i class="fa-regular fa-images"></i></span>'}<span><strong>${escapeHTML(folder.name || "Untitled folder")}</strong><small>${photos.length} photos</small></span><i class="fa-solid fa-chevron-right"></i></button>`;
    }).join("") : '<p class="program-reports-empty">No uploaded folder metadata found yet.</p>';
  } catch (error) {
    console.error("Drive folders load error:", error);
    list.innerHTML = '<p class="program-reports-empty">Folders could not be loaded. Check Firebase access.</p>';
  }
}

function openDriveGallery(folderId) {
  const folder = driveGalleryState.folders.find(item => item.id === folderId);
  if (!folder) return;
  const photos = Array.isArray(folder.photos) ? folder.photos : Object.values(folder.photos || {});
  const list = document.getElementById("driveFolderList");
  if (!list) return;
  driveGalleryState.activeFolder = {...folder,photos};
  list.innerHTML = `<div class="drive-gallery-heading"><button type="button" class="program-cancel" onclick="loadDriveFolders()"><i class="fa-solid fa-arrow-left"></i> Back to folders</button><strong>${escapeHTML(folder.name)}</strong></div><div class="drive-gallery-grid">${photos.map((photo,index) => `<button type="button" onclick="openDrivePhotoPreview(${index})"><img loading="lazy" src="${escapeHTML(photo.thumbnailUrl || photo.imageUrl || photo.webViewLink || "")}" alt="${escapeHTML(photo.fileName || `Photo ${index + 1}`)}"></button>`).join("")}</div>`;
}

function openDrivePhotoPreview(index) {
  const photos = driveGalleryState.activeFolder?.photos || [];
  const photo = photos[index];
  if (!photo) return;
  driveGalleryState.activeIndex = index;
  const overlay = document.createElement("div");
  overlay.className = "drive-photo-preview-overlay";
  overlay.innerHTML = `<button type="button" class="drive-preview-close" aria-label="Close" onclick="this.parentElement.remove()">×</button><button type="button" aria-label="Previous" onclick="stepDrivePhoto(-1)">‹</button><img src="${escapeHTML(photo.imageUrl || photo.webViewLink || photo.thumbnailUrl || "")}" alt="${escapeHTML(photo.fileName || "Photo")}"><button type="button" aria-label="Next" onclick="stepDrivePhoto(1)">›</button>`;
  document.body.appendChild(overlay);
}

function stepDrivePhoto(delta) {
  const photos = driveGalleryState.activeFolder?.photos || [];
  if (!photos.length) return;
  driveGalleryState.activeIndex = (driveGalleryState.activeIndex + delta + photos.length) % photos.length;
  document.querySelector(".drive-photo-preview-overlay")?.remove();
  openDrivePhotoPreview(driveGalleryState.activeIndex);
}

async function submitDrivePhotoUpload(event) {
  event.preventDefault();
  if (!requireSupervisor()) return;
  const form = event.target;
  const files = Array.from(form.querySelector("[name='photos']").files || []);
  const message = document.getElementById("programFormMessage");
  const button = form.querySelector("button[type='submit']") || form.querySelector(".program-submit");
  if (form.dataset.submitting === "true") return;
  try {
    if (!button) throw new Error("Upload button not found.");
    if (!message) throw new Error("Upload status area not found.");
    form.dataset.submitting = "true";
    button.disabled = true;
    message.textContent = "Photos uploading to Google Drive...";
    const results = await uploadPhotosToDrive(files, new FormData(form).get("folderName"));
    await loadDriveFolders();
    const folderUrl = results.find(item => item && item.folderUrl)?.folderUrl;
    message.innerHTML = `✅ ${results.length} photo(s) uploaded successfully.${folderUrl ? ` <a href="${escapeHTML(folderUrl)}" target="_blank" rel="noopener">Open Drive folder</a>` : ""}`;
    button.textContent = "Uploaded";
  } catch (error) {
    console.error(error);
    if (message) message.textContent = `❌ Upload failed: ${error?.message || error}`;
    if (button) button.disabled = false;
    delete form.dataset.submitting;
  }
}

async function submitProgramReport(event, editId = "") {
  event.preventDefault();
  if (!requireSupervisor()) return;
  const form = event.target;
  const message = document.getElementById("programFormMessage");
  const submit = form.querySelector("button[type='submit']");
  const values = Object.fromEntries(new FormData(form).entries());
  const photos = Array.from(form.querySelector("[name='photos']").files || []);
  let existing = editId ? programReportState.reports.concat(programReportState.deletedReports).find(item => item.id === editId) : null;
  if (form.dataset.submitting === "true") return;
  try {
    if (!submit || !message) throw new Error("Form status area is unavailable. Please reopen the form and try again.");
    await ActivityReportsRepository.ready();
    form.dataset.submitting = "true";
    submit.disabled = true;
    submit.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Saving...';
    message.textContent = photos.length ? "Photos uploading to Google Drive..." : "Report saving...";
    await ActivityReportsRepository.ready();
    if (editId) {
      const latestSnapshot = await ActivityReportsRepository.read(`programReports/${editId}`);
      existing = latestSnapshot.val();
      if (!existing) {
        await loadProgramReports();
        throw new Error("This activity report no longer exists. The report list has been refreshed.");
      }
    }
    const reportId = editId || ActivityReportsRepository.key("programReports");
    const folderName = `${values.date} - ${values.title.trim()}`.slice(0, 200);
    const uploaded = photos.length ? await uploadPhotosToDrive(photos, folderName) : [];
    const photoUrls = uploaded.map(item => item.imageUrl || item.thumbnailUrl || item.webViewLink || item.url).filter(Boolean);
    const driveFolderUrl = uploaded.find(item => item && item.folderUrl)?.folderUrl || existing?.driveFolderUrl || "";
    if (photos.length && photoUrls.length !== uploaded.length) throw new Error("One or more Drive uploads returned no photo URL. The report was not published.");
    const updatedAt = new Date().toISOString();
    const nextFields = { title: values.title.trim(), description: values.description.trim(), date: values.date, driveFolderName: folderName, driveFolderUrl, updatedAt };
    if (editId) {
      const result = await ActivityReportsRepository.transaction(`programReports/${reportId}`, current => {
        if (!current) return;
        const currentPhotos = Array.isArray(current.photos) ? current.photos : Object.values(current.photos || {});
        const mergedPhotos = [...currentPhotos];
        const knownPhotos = new Set(currentPhotos.flatMap(photo => typeof photo === "object"
          ? [photo.fileId, photo.imageUrl, photo.thumbnailUrl, photo.webViewLink, photo.url].filter(Boolean).map(String)
          : [String(photo || "")]));
        uploaded.forEach(item => {
          const aliases = [item.fileId, item.imageUrl, item.thumbnailUrl, item.webViewLink, item.url].filter(Boolean).map(String);
          if (aliases.some(key => knownPhotos.has(key))) return;
          aliases.forEach(key => knownPhotos.add(key));
          mergedPhotos.push(item.imageUrl || item.thumbnailUrl || item.webViewLink || item.url || "");
        });
        const newlyAttached = Math.max(0, mergedPhotos.length - currentPhotos.length);
        return { ...current, ...nextFields, deleted:false, deletedAt:null, photos:mergedPhotos, photosUploaded:(Number(current.photosUploaded) || currentPhotos.length) + newlyAttached, createdAt:current.createdAt || new Date().toISOString(), submittedBy:current.submittedBy || "AYFA supervisor" };
      });
      if (!result.committed) {
        const latest = result.snapshot?.val();
        await loadProgramReports();
        throw new Error(!latest || latest.deleted === true
          ? "This activity report no longer exists. The report list has been refreshed."
          : "The report update was not committed. Check the Firebase connection and rules, then retry. Any uploaded photos remain in Google Drive.");
      }
      await ActivityReportsRepository.audit({ action: "programReport.update", path: "programReports", recordId: editId, beforeUpdatedAt: String(existing?.updatedAt || ""), afterUpdatedAt: updatedAt });
    } else {
      const newReport = { ...nextFields, photos:photoUrls, photosUploaded:photoUrls.length, createdAt:updatedAt, submittedBy:"AYFA supervisor", deleted:false };
      await ActivityReportsRepository.create({ [`programReports/${reportId}`]: newReport }, { action: "programReport.create", path: "programReports", recordId: reportId, afterUpdatedAt: updatedAt });
    }
    closeProgramModal();
    await loadProgramReports();
  } catch (error) {
    console.error(error);
    const code = String(error?.code || "");
    const detail = String(error?.message || "");
    message.textContent = `Report could not be saved: ${detail || code || "Check the Firebase connection."}`;
    submit.disabled = false;
    submit.textContent = editId ? "Save changes" : "Submit report";
    delete form.dataset.submitting;
  }
}

function openProgramReportDetail(id) {
  const report = programReportState.reports.find(item => String(item.id) === String(id));
  if (!report) return;
  const storedPhotos = normalizeReportPhotos(report);
  const photos = storedPhotos.map(displayPhotoUrl).filter(Boolean);
  const legacyPhotoCount = Math.max(0, Number(report.photosUploaded || 0) - photos.length);
  programModal(`<div class="program-modal-card program-detail"><div class="program-modal-header"><div><button type="button" class="program-cancel detail-back" onclick="closeProgramModal()"><i class="fa-solid fa-arrow-left"></i> Back</button><h3>${escapeHTML(report.title)}</h3><p><i class="fa-regular fa-calendar"></i> ${programDate(report.date)}</p></div><button type="button" class="program-close" onclick="closeProgramModal()" aria-label="Close"><i class="fa-solid fa-xmark"></i></button></div><div class="program-detail-content"><p>${escapeHTML(report.description).replace(/\n/g, "<br>")}</p>${photos.length ? `<div class="program-photo-gallery">${photos.map((url, index) => `<button type="button" class="program-photo-open" data-photo-index="${index}"><img src="${escapeHTML(url)}" loading="lazy" referrerpolicy="no-referrer" alt="${escapeHTML(report.title)} photo ${index + 1}" onerror="this.closest('.program-photo-open').innerHTML='<span class=&quot;program-no-photo&quot;>Photo unavailable</span>'"></button>`).join("")}</div>` : (legacyPhotoCount ? `<div class="program-no-photo">${legacyPhotoCount} photo(s) are in the Drive folder for this report. Open the folder to view them.</div>` : '<div class="program-no-photo">No photos were uploaded for this activity.</div>')}${report.driveFolderUrl ? `<p><a href="${escapeHTML(report.driveFolderUrl)}" target="_blank" rel="noopener">Open Google Drive folder</a></p>` : ""}</div></div>`);
  document.querySelectorAll(".program-photo-open[data-photo-index]").forEach(button => button.addEventListener("click", () => {
    const photo = photos[Number(button.dataset.photoIndex)];
    if (photo) openProgramPhotoPreview(photo, `${report.title} photo ${Number(button.dataset.photoIndex) + 1}`);
  }));
}

function openProgramPhotoPreview(url, label) {
  const overlay = document.createElement("div");
  overlay.className = "drive-photo-preview-overlay";
  overlay.innerHTML = `<button type="button" class="drive-preview-close" aria-label="Close" onclick="this.parentElement.remove()">×</button><img src="${escapeHTML(url)}" alt="${escapeHTML(label)}">`;
  document.body.appendChild(overlay);
}

async function deleteProgramReport(id) {
  if (!requireSupervisor()) return;
  const reportId = String(id || "");
  const report = programReportState.reports.concat(programReportState.deletedReports).find(item => String(item.id) === reportId);
  if (!report || !await showConfirmSheet({ title: "Delete report permanently?", message: `“${report.title}” will be removed from the activity list. Uploaded Google Drive files will remain in Drive.`, confirmLabel: "Delete", danger: true })) return;
  try {
    await ActivityReportsRepository.ready();
    const updatedAt = new Date().toISOString();
    await ActivityReportsRepository.remove(`programReports/${reportId}`,
      { action: "programReport.delete", path: "programReports", recordId: reportId, beforeUpdatedAt: String(report.updatedAt || ""), afterUpdatedAt: updatedAt });
    closeProgramModal();
    await loadProgramReports();
  } catch (error) {
    console.error("Activity report delete error:", error);
    showToast(error?.code === "PERMISSION_DENIED" || String(error?.message || "").includes("PERMISSION_DENIED")
      ? "Firebase denied deletion. Sign in again with an active official account and confirm the deployed database rules."
      : error?.message || "Report could not be deleted. Please check the connection.");
  }
}

async function restoreProgramReport(id) {
  if (!requireSupervisor()) return;
  try {
    const reportId = String(id || "");
    await ActivityReportsRepository.ready();
    const restoredAt = new Date().toISOString();
    const result = await ActivityReportsRepository.transaction(`programReports/${reportId}`, current => current?.deleted === true ? { ...current, deleted: false, restoredAt, updatedAt: restoredAt } : undefined);
    if (!result.committed) throw new Error("Report is no longer in Trash.");
    await ActivityReportsRepository.audit({ action: "programReport.restore", path: "programReports", recordId: reportId, afterUpdatedAt: restoredAt });
    await loadProgramReports();
  } catch (error) { console.error("Activity restore error:", error); showToast("Report could not be restored. Refresh and try again."); }
}
