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
    if (list) list.innerHTML = '<div class="program-reports-empty">Activity reports load ಆಗಲಿಲ್ಲ. Firebase connection ಪರಿಶೀಲಿಸಿ.</div>';
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
  const value = String(url || "").trim();
  const driveId = value.match(/drive\.google\.com\/file\/d\/([^/]+)/)?.[1] || value.match(/[?&]id=([^&]+)/)?.[1];
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
    return `<article class="program-report-card"><div class="program-report-cover">${cover ? `<img src="${escapeHTML(cover)}" alt="${escapeHTML(report.title)}">` : '<div class="program-report-placeholder"><i class="fa-solid fa-calendar-check"></i><span>AYFA Activity</span></div>'}</div><div class="program-report-copy"><h3>${escapeHTML(report.title || "Untitled program")}</h3><p>${escapeHTML(reportPreview(report.description))}</p><div class="program-report-meta"><span><i class="fa-regular fa-calendar"></i> ${programDate(report.date)}</span>${photos.length > 1 ? `<span><i class="fa-solid fa-images"></i> ${photos.length} photos</span>` : ""}</div><button type="button" class="program-report-read" onclick="openProgramReportDetail('${report.id}')">Read more <i class="fa-solid fa-arrow-right"></i></button></div></article>`;
  }).join("") : `<div class="program-reports-empty"><i class="fa-regular fa-folder-open"></i><strong>No activities for ${year}</strong><span>Submit the first program report for this year.</span></div>`;
}

function programModal(content) { document.body.insertAdjacentHTML("beforeend", `<div class="program-modal" id="programModal" role="dialog" aria-modal="true">${content}</div>`); }
function closeProgramModal() { document.getElementById("programModal")?.remove(); }

function openProgramReportForm() {
  const today = new Date().toISOString().slice(0, 10);
  programModal(`<div class="program-modal-card"><div class="program-modal-header"><div><h3>Submit Activity Report</h3><p>Add program details and Google Drive photo links.</p></div><button type="button" class="program-close" onclick="closeProgramModal()"><i class="fa-solid fa-xmark"></i></button></div><form id="programReportForm" class="program-report-form" onsubmit="submitProgramReport(event)"><label>Program title *<input name="title" required></label><label>Description *<textarea name="description" required></textarea></label><label>Date *<input name="date" type="date" value="${today}" required></label><label class="program-photo-field">Google Drive photo links <span>One link per line. First link is the cover photo.</span><textarea name="photoLinks" placeholder="https://drive.google.com/file/d/.../view&#10;https://drive.google.com/file/d/.../view"></textarea></label><p id="programFormMessage" class="program-form-message"></p><div class="program-form-actions"><button type="button" class="program-cancel" onclick="closeProgramModal()">Cancel</button><button type="submit" class="program-submit">Submit report</button></div></form></div>`);
}

async function submitProgramReport(event) {
  event.preventDefault();
  const form = event.target;
  const message = document.getElementById("programFormMessage");
  const submit = form.querySelector("button[type='submit']");
  const values = Object.fromEntries(new FormData(form).entries());
  const photoLinks = String(values.photoLinks || "").split(/\n|,/).map(link => link.trim()).filter(Boolean);
  try {
    submit.disabled = true;
    submit.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Saving...';
    message.textContent = "Report saving...";
    await window.firebaseReady;
    const reportRef = window.firebaseDb.ref("programReports").push();
    await reportRef.set({ title: values.title.trim(), description: values.description.trim(), date: values.date, photos: photoLinks, createdAt: new Date().toISOString(), submittedBy: "AYFA member" });
    closeProgramModal();
    await loadProgramReports();
  } catch (error) {
    console.error(error);
    const code = String(error?.code || "");
    const detail = String(error?.message || "");
    message.textContent = `Report save ಆಗಲಿಲ್ಲ: ${detail || code || "Firebase Database connection ಪರಿಶೀಲಿಸಿ."}`;
    submit.disabled = false;
    submit.textContent = "Submit report";
  }
}

function openProgramReportDetail(id) {
  const report = programReportState.reports.find(item => item.id === id);
  if (!report) return;
  const photos = (Array.isArray(report.photos) ? report.photos : Object.values(report.photos || {})).map(displayPhotoUrl);
  programModal(`<div class="program-modal-card program-detail"><div class="program-modal-header"><div><h3>${escapeHTML(report.title)}</h3><p><i class="fa-regular fa-calendar"></i> ${programDate(report.date)}</p></div><button type="button" class="program-close" onclick="closeProgramModal()"><i class="fa-solid fa-xmark"></i></button></div><div class="program-detail-content"><p>${escapeHTML(report.description).replace(/\n/g, "<br>")}</p>${photos.length ? `<div class="program-photo-gallery">${photos.map((url, index) => `<img src="${escapeHTML(url)}" alt="${escapeHTML(report.title)} photo ${index + 1}">`).join("")}</div>` : '<div class="program-no-photo">No photos were uploaded for this activity.</div>'}</div></div>`);
}
