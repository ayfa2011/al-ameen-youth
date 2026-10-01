// ============================================================
// AYFA PROGRAM REPORTS — Realtime Database + Firebase Storage
// ============================================================

const programReportState = { reports: [] };

function programDate(value) {
  if (!value) return "—";
  const date = new Date(`${value}T00:00:00`);
  return Number.isNaN(date.getTime()) ? "—" : new Intl.DateTimeFormat("en-IN", { day: "2-digit", month: "short", year: "numeric" }).format(date);
}

async function loadProgramReports() {
  const list = document.getElementById("programReportsList");
  if (list) list.innerHTML = '<div class="program-reports-empty"><i class="fa-solid fa-spinner fa-spin"></i> Activities loading...</div>';
  try {
    await window.firebaseReady;
    const snapshot = await window.firebaseDb.ref("programReports").once("value");
    programReportState.reports = Object.entries(snapshot.val() || {}).map(([id, report]) => ({ id, ...report })).sort((a, b) => String(b.date || b.createdAt || "").localeCompare(String(a.date || a.createdAt || "")));
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

function displayPhotoUrl(url) {
  const value = String(typeof url === "object" ? (url.thumbnailUrl || url.imageUrl || url.url || url.webViewLink || "") : url || "").trim();
  const driveId = value.match(/drive\.google\.com\/file\/d\/([^/]+)/)?.[1] || value.match(/[?&]id=([^&]+)/)?.[1] || value.match(/drive\.google\.com\/thumbnail\?id=([^&]+)/)?.[1];
  return driveId ? `https://drive.google.com/thumbnail?id=${encodeURIComponent(driveId)}&sz=w1200` : value;
}

function renderProgramReports() {
  const list = document.getElementById("programReportsList");
  const title = document.getElementById("programReportsTitle");
  const year = document.getElementById("programReportYear")?.value || String(new Date().getFullYear());
  if (!list) return;
  if (title) title.textContent = `${year} AYFA Activities & Programs`;
  const reports = programReportState.reports.filter(report => String(report.date || "").startsWith(year));
  list.innerHTML = reports.length ? reports.map(report => {
    const photos = Array.isArray(report.photos) ? report.photos : Object.values(report.photos || {});
    const cover = photos[0] ? displayPhotoUrl(photos[0]) : "";
    return `<article class="program-report-card"><div class="program-report-cover">${cover ? `<img src="${escapeHTML(cover)}" alt="${escapeHTML(report.title)}" loading="lazy" onerror="this.closest('.program-report-cover').innerHTML='<div class=&quot;program-report-placeholder&quot;>Photo unavailable</div>'">` : '<div class="program-report-placeholder"><i class="fa-solid fa-calendar-check"></i><span>AYFA Activity</span></div>'}</div><div class="program-report-copy"><h3>${escapeHTML(report.title || "Untitled program")}</h3><p>${escapeHTML(reportPreview(report.description))}</p><div class="program-report-meta"><span><i class="fa-regular fa-calendar"></i> ${programDate(report.date)}</span>${photos.length > 1 ? `<span><i class="fa-solid fa-images"></i> ${photos.length} photos</span>` : ""}</div><button type="button" class="program-report-read" onclick="openProgramReportDetail('${report.id}')">Read more <i class="fa-solid fa-arrow-right"></i></button>${isSupervisorLoggedIn() ? `<div class="program-report-admin"><button type="button" onclick="openProgramReportForm('${report.id}')">Edit</button><button type="button" class="program-report-delete" onclick="deleteProgramReport('${report.id}')">Delete</button></div>` : ""}</div></article>`;
  }).join("") : `<div class="program-reports-empty"><i class="fa-regular fa-folder-open"></i><strong>No activities for ${year}</strong><span>Submit the first program report for this year.</span></div>`;
}

function programModal(content) { document.body.insertAdjacentHTML("beforeend", `<div class="program-modal" id="programModal" role="dialog" aria-modal="true">${content}</div>`); }
function closeProgramModal() { document.getElementById("programModal")?.remove(); }

function openProgramReportForm(editId = "") {
  if (!requireSupervisor()) return;
  const existing = editId ? programReportState.reports.find(item => item.id === editId) : null;
  const today = new Date().toISOString().slice(0, 10);
  programModal(`<div class="program-modal-card"><div class="program-modal-header"><div><h3>${existing ? "Edit Activity Report" : "Submit Activity Report"}</h3><p>Photos upload automatically to Google Drive.</p></div><button type="button" class="program-close" onclick="closeProgramModal()"><i class="fa-solid fa-xmark"></i></button></div><form id="programReportForm" class="program-report-form" onsubmit="submitProgramReport(event,'${editId}')"><label>Program title *<input name="title" value="${escapeHTML(existing?.title || "")}" required></label><label>Description *<textarea name="description" required>${escapeHTML(existing?.description || "")}</textarea></label><label>Date *<input name="date" type="date" value="${escapeHTML(existing?.date || today)}" required></label><label class="program-photo-field">Upload photos <span>Multiple photos allowed. Newly uploaded photos are added to this report.</span><input name="photos" type="file" accept="image/*" multiple onchange="previewSelectedProgramPhotos(this.files)"></label><div id="programPhotoPreview" class="program-photo-preview"></div>${existing ? `<div class="program-photo-gallery">${(Array.isArray(existing.photos) ? existing.photos : Object.values(existing.photos || {})).map(url => `<img src="${escapeHTML(displayPhotoUrl(url))}" alt="Existing activity photo">`).join("")}</div>` : ""}<p id="programFormMessage" class="program-form-message"></p><div class="program-form-actions"><button type="button" class="program-cancel" onclick="closeProgramModal()">Cancel</button><button type="submit" class="program-submit">${existing ? "Save changes" : "Submit report"}</button></div></form></div>`);
}

function previewSelectedProgramPhotos(files) {
  const preview = document.getElementById("programPhotoPreview");
  if (preview) preview.innerHTML = Array.from(files || []).map(file => `<div><i class="fa-solid fa-image"></i> ${escapeHTML(file.name)}</div>`).join("");
}

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(",")[1]);
    reader.onerror = () => reject(new Error("Photo read ಆಗಲಿಲ್ಲ."));
    reader.readAsDataURL(file);
  });
}

async function uploadPhotosToDrive(files, folderName) {
  const results = [];
  for (const file of files) {
    const payload = { action: "uploadDrivePhoto", folderName, fileName: file.name, mimeType: file.type, base64: await fileToBase64(file) };
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
  return results;
}

function openDrivePhotoUpload() {
  programModal(`<div class="program-modal-card"><div class="program-modal-header"><div><h3>Upload Photos to Drive</h3><p>Selected photos are saved in a new Google Drive folder.</p></div><button type="button" class="program-close" onclick="closeProgramModal()"><i class="fa-solid fa-xmark"></i></button></div><form class="program-report-form" onsubmit="submitDrivePhotoUpload(event)"><label>Folder name *<input name="folderName" placeholder="Example: 2026 Blood Donation Program" required></label><label class="program-photo-field">Select photos *<input name="photos" type="file" accept="image/*" multiple required onchange="previewSelectedProgramPhotos(this.files)"></label><div id="programPhotoPreview" class="program-photo-preview"></div><p id="programFormMessage" class="program-form-message"></p><div class="program-form-actions"><button type="button" class="program-cancel" onclick="closeProgramModal()">Cancel</button><button type="submit" class="program-submit">Upload to Drive</button></div></form></div>`);
}

async function submitDrivePhotoUpload(event) {
  event.preventDefault();
  const form = event.target;
  const files = Array.from(form.querySelector("[name='photos']").files || []);
  const message = document.getElementById("programFormMessage");
  const button = form.querySelector("button[type='submit']") || form.querySelector(".program-submit");
  try {
    if (!button) throw new Error("Upload button not found.");
    if (!message) throw new Error("Upload status area not found.");
    button.disabled = true;
    message.textContent = "Photos uploading to Google Drive...";
    const results = await uploadPhotosToDrive(files, new FormData(form).get("folderName"));
    const folderUrl = results.find(item => item && item.folderUrl)?.folderUrl;
    message.innerHTML = `✅ ${results.length} photo(s) uploaded successfully.${folderUrl ? ` <a href="${escapeHTML(folderUrl)}" target="_blank" rel="noopener">Open Drive folder</a>` : ""}`;
    button.textContent = "Uploaded";
  } catch (error) {
    console.error(error);
    if (message) message.textContent = `❌ Upload failed: ${error?.message || error}`;
    if (button) button.disabled = false;
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
  const existing = editId ? programReportState.reports.find(item => item.id === editId) : null;
  try {
    submit.disabled = true;
    submit.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Saving...';
    message.textContent = photos.length ? "Photos uploading to Google Drive..." : "Report saving...";
    await window.firebaseReady;
    const reportRef = editId ? window.firebaseDb.ref(`programReports/${editId}`) : window.firebaseDb.ref("programReports").push();
    const folderName = `${values.date} - ${values.title.trim()}`;
    const uploaded = photos.length ? await uploadPhotosToDrive(photos, folderName) : [];
    const photoUrls = uploaded.map(item => item.imageUrl || item.thumbnailUrl || item.webViewLink || item.url).filter(Boolean);
    const previousPhotos = Array.isArray(existing?.photos) ? existing.photos : Object.values(existing?.photos || {});
    const driveFolderUrl = uploaded.find(item => item && item.folderUrl)?.folderUrl || existing?.driveFolderUrl || "";
    const previousUploaded = Number(existing?.photosUploaded || 0);
    await reportRef.set({ title: values.title.trim(), description: values.description.trim(), date: values.date, photos: [...previousPhotos, ...photoUrls], photosUploaded: existing ? previousUploaded + photos.length : photos.length, driveFolderName: folderName, driveFolderUrl, createdAt: existing?.createdAt || new Date().toISOString(), updatedAt: new Date().toISOString(), submittedBy: existing?.submittedBy || "AYFA supervisor" });
    closeProgramModal();
    await loadProgramReports();
  } catch (error) {
    console.error(error);
    const code = String(error?.code || "");
    const detail = String(error?.message || "");
    message.textContent = `Report could not be saved: ${detail || code || "Check the Firebase connection."}`;
    submit.disabled = false;
    submit.textContent = "Submit report";
  }
}

function openProgramReportDetail(id) {
  const report = programReportState.reports.find(item => item.id === id);
  if (!report) return;
  const storedPhotos = Array.isArray(report.photos) ? report.photos : Object.values(report.photos || {});
  const photos = storedPhotos.map(displayPhotoUrl);
  const legacyPhotoCount = Math.max(0, Number(report.photosUploaded || 0) - photos.length);
  programModal(`<div class="program-modal-card program-detail"><div class="program-modal-header"><div><h3>${escapeHTML(report.title)}</h3><p><i class="fa-regular fa-calendar"></i> ${programDate(report.date)}</p></div><button type="button" class="program-close" onclick="closeProgramModal()"><i class="fa-solid fa-xmark"></i></button></div><div class="program-detail-content"><p>${escapeHTML(report.description).replace(/\n/g, "<br>")}</p>${photos.length ? `<div class="program-photo-gallery">${photos.map((url, index) => `<img src="${escapeHTML(url)}" alt="${escapeHTML(report.title)} photo ${index + 1}" onerror="this.outerHTML='<div class=&quot;program-no-photo&quot;>Photo unavailable</div>'">`).join("")}</div>` : (legacyPhotoCount ? `<div class="program-no-photo">${legacyPhotoCount} photo(s) are in the Drive folder for this report. Open the folder to view them.</div>` : '<div class="program-no-photo">No photos were uploaded for this activity.</div>')}${report.driveFolderUrl ? `<p><a href="${escapeHTML(report.driveFolderUrl)}" target="_blank" rel="noopener">Open Google Drive folder</a></p>` : ""}</div></div>`);
}

async function deleteProgramReport(id) {
  if (!requireSupervisor()) return;
  const report = programReportState.reports.find(item => item.id === id);
  if (!report || !confirm(`Delete "${report.title}"? This cannot be undone.`)) return;
  try {
    await window.firebaseReady;
    await window.firebaseDb.ref(`programReports/${id}`).remove();
    closeProgramModal();
    await loadProgramReports();
  } catch (error) {
    console.error("Activity report delete error:", error);
    alert("Report could not be deleted. Please check the connection.");
  }
}
