// ============================================================
// AYFA RENTAL & PAYMENT MANAGEMENT
// Data is stored in Firebase Realtime Database at /rentals.
// ============================================================

const RENTAL_PIN_HASHES = {
  chairTable: "f78082c7fc3a14cca835505cc9a80ff9cff9ae65817a45bf1387460b64be4286",
  speaker: "9cb23b66e9110e1af3339dc289a8fe0215a2712eb09226e85c1fca8eaf16e8cf"
};

const rentalState = {
  rentals: [],
  role: "viewer",
  filter: "all",
  search: ""
};

const RENTAL_CATEGORY = {
  chairTable: { label: "Chair & Table", icon: "fa-chair" },
  speaker: { label: "Speaker", icon: "fa-volume-high" }
};

function rentalCurrency(value) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency", currency: "INR", maximumFractionDigits: 0
  }).format(Number(value) || 0);
}

function rentalDate(value) {
  if (!value) return "—";
  const date = new Date(`${value}T00:00:00`);
  return Number.isNaN(date.getTime()) ? "—" : new Intl.DateTimeFormat("en-IN", { day: "2-digit", month: "short", year: "numeric" }).format(date);
}

function rentalStatus(rental) {
  const total = Number(rental.totalAmount) || 0;
  const paid = Number(rental.paidAmount) || 0;
  if (paid >= total && total > 0) return "paid";
  if (paid > 0) return "partial";
  return "pending";
}

function rentalStatusLabel(status) {
  return { paid: "PAID", partial: "PARTIAL", pending: "PENDING" }[status] || "PENDING";
}

function rentalCanManage(category) {
  return rentalState.role === "admin" || rentalState.role === category;
}

async function waitForRentalFirebase() {
  if (!window.firebaseReady || !window.firebaseDb) throw new Error("Firebase is not ready.");
  await window.firebaseReady;
}

async function loadRentals() {
  await waitForRentalFirebase();
  const snapshot = await window.firebaseDb.ref("rentals").once("value");
  const data = snapshot.val() || {};
  rentalState.rentals = Object.entries(data)
    .map(([id, value]) => ({ id, ...value }))
    .filter(rental => rental && rental.customerName)
    .sort((a, b) => String(b.createdAt || b.startDate || "").localeCompare(String(a.createdAt || a.startDate || "")));
}

function rentalTotals(rentals) {
  return rentals.reduce((totals, rental) => {
    totals.total += Number(rental.totalAmount) || 0;
    totals.paid += Number(rental.paidAmount) || 0;
    totals.balance += Math.max(0, Number(rental.balance ?? ((Number(rental.totalAmount) || 0) - (Number(rental.paidAmount) || 0))));
    return totals;
  }, { total: 0, paid: 0, balance: 0 });
}

function rentalReportYearOptions() {
  const years = new Set([String(new Date().getFullYear())]);
  rentalState.rentals.forEach(rental => {
    if (/^\d{4}/.test(String(rental.startDate || ""))) years.add(String(rental.startDate).slice(0, 4));
  });
  return Array.from(years).sort((a, b) => b.localeCompare(a)).map(year => `<option value="${year}">${year}</option>`).join("");
}

function openRentalManagement() {
  hideAllViews();
  const view = document.getElementById("rentalView");
  if (view) view.classList.remove("hidden");
  window.scrollTo({ top: 0, behavior: "smooth" });
  renderRentalLoading();
  loadRentals().then(renderRentalDashboard).catch(error => {
    console.error(error);
    const target = document.getElementById("rentalContent");
    if (target) target.innerHTML = '<div class="rental-empty">Rental data load ಆಗಲಿಲ್ಲ. Firebase connection ಪರಿಶೀಲಿಸಿ.</div>';
  });
}

function renderRentalLoading() {
  const target = document.getElementById("rentalContent");
  if (target) target.innerHTML = '<div class="rental-empty"><i class="fa-solid fa-spinner fa-spin"></i> Rental records loading...</div>';
}

function updateRentalLoginButton() {
  const button = document.getElementById("rentalLoginButton");
  if (!button) return;
  const isSupervisor = rentalState.role !== "viewer";
  button.classList.toggle("is-active", isSupervisor);
  button.innerHTML = isSupervisor
    ? '<i class="fa-solid fa-unlock"></i> ' + (RENTAL_CATEGORY[rentalState.role]?.label || "Supervisor")
    : '<i class="fa-solid fa-lock"></i> Supervisor Login';
}

function renderRentalDashboard() {
  updateRentalLoginButton();
  const target = document.getElementById("rentalContent");
  if (!target) return;
  const totals = rentalTotals(rentalState.rentals);
  const chairRentals = rentalState.rentals.filter(rental => rental.category === "chairTable");
  const speakerRentals = rentalState.rentals.filter(rental => rental.category === "speaker");
  const chairTotals = rentalTotals(chairRentals);
  const speakerTotals = rentalTotals(speakerRentals);
  target.innerHTML = `
    <div class="rental-summary-grid">
      <div class="rental-stat-card"><span>Total rental amount</span><strong>${rentalCurrency(totals.total)}</strong></div>
      <div class="rental-stat-card"><span>Collected</span><strong>${rentalCurrency(totals.paid)}</strong></div>
      <div class="rental-stat-card pending"><span>Pending payment</span><strong>${rentalCurrency(totals.balance)}</strong></div>
    </div>
    <div class="rental-category-grid">
      <button type="button" class="rental-category-card" onclick="setRentalFilter('chairTable')">
        <i class="fa-solid fa-chair"></i><h3>Chair &amp; Table</h3><p>${chairRentals.length} rentals · ${rentalCurrency(chairTotals.total)}</p>
      </button>
      <button type="button" class="rental-category-card speaker" onclick="setRentalFilter('speaker')">
        <i class="fa-solid fa-volume-high"></i><h3>Speaker</h3><p>${speakerRentals.length} rentals · ${rentalCurrency(speakerTotals.total)}</p>
      </button>
    </div>
    <section class="rental-panel">
      <div class="rental-toolbar" style="padding:14px 14px 0;">
        <h3>Recent rentals</h3>
        <select id="rentalReportYear" class="rental-secondary-button" aria-label="Report year">${rentalReportYearOptions()}</select>
        <button class="rental-secondary-button" type="button" onclick="downloadRentalReport('chairTable', document.getElementById('rentalReportYear').value)"><i class="fa-solid fa-file-excel"></i> Chair/Table report</button>
        <button class="rental-secondary-button" type="button" onclick="downloadRentalReport('speaker', document.getElementById('rentalReportYear').value)"><i class="fa-solid fa-file-excel"></i> Speaker report</button>
        ${rentalState.role !== "viewer" ? '<button class="rental-primary-button" type="button" onclick="openRentalEntry()"><i class="fa-solid fa-plus"></i> New rental</button>' : ""}
      </div>
      <div style="padding:14px;">${rentalFiltersHTML()}${rentalTableHTML()}</div>
    </section>`;
}

function rentalFiltersHTML() {
  const filters = [["all", "All"], ["chairTable", "Chair & Table"], ["speaker", "Speaker"], ["paid", "Paid"], ["partial", "Partial"], ["pending", "Pending"]];
  return `<div class="rental-toolbar"><div class="rental-filters">${filters.map(([value, label]) => `<button type="button" class="rental-filter-button ${rentalState.filter === value ? "active" : ""}" onclick="setRentalFilter('${value}')">${label}</button>`).join("")}</div><input class="rental-search" type="search" value="${escapeHTML(rentalState.search)}" oninput="setRentalSearch(this.value)" placeholder="Search customer, mobile or place"></div>`;
}

function filteredRentals() {
  const term = rentalState.search.trim().toLowerCase();
  return rentalState.rentals.filter(rental => {
    const matchesFilter = rentalState.filter === "all" || rental.category === rentalState.filter || rentalStatus(rental) === rentalState.filter;
    const haystack = `${rental.customerName} ${rental.mobile} ${rental.place} ${rental.item}`.toLowerCase();
    return matchesFilter && (!term || haystack.includes(term));
  });
}

function rentalTableHTML() {
  const rentals = filteredRentals();
  if (!rentals.length) return '<div class="rental-empty">ಈ filterಗೆ rental record ಇಲ್ಲ.</div>';
  return `<div class="rental-table-wrap"><table class="rental-table"><thead><tr><th>Customer</th><th>Item</th><th>Dates</th><th>Amount</th><th>Balance</th><th>Status</th><th></th></tr></thead><tbody>${rentals.map(rental => {
    const status = rentalStatus(rental);
    const canManage = rentalCanManage(rental.category);
    return `<tr><td><strong>${escapeHTML(rental.customerName)}</strong><br><small>${escapeHTML(rental.place || "—")}</small></td><td>${escapeHTML(rental.item || RENTAL_CATEGORY[rental.category]?.label || "—")}<br><small>${escapeHTML(rental.quantity || "—")}</small></td><td>${rentalDate(rental.startDate)}<br><small>Return: ${rentalDate(rental.returnDate)}</small></td><td class="amount">${rentalCurrency(rental.totalAmount)}<br><small>Paid ${rentalCurrency(rental.paidAmount)}</small></td><td class="amount">${rentalCurrency(rental.balance)}</td><td><span class="rental-status ${status}">${rentalStatusLabel(status)}</span></td><td>${canManage ? `<button class="rental-secondary-button" type="button" onclick="openRentalEntry('${rental.id}')">Edit</button> <button class="rental-secondary-button" type="button" onclick="openPaymentModal('${rental.id}')">Payment</button>` : ""}</td></tr>`;
  }).join("")}</tbody></table></div>`;
}

function setRentalFilter(filter) { rentalState.filter = filter; renderRentalDashboard(); }
function setRentalSearch(search) { rentalState.search = search; renderRentalDashboard(); }

function rentalModal(content) {
  document.body.insertAdjacentHTML("beforeend", `<div class="rental-modal" id="rentalModal" role="dialog" aria-modal="true">${content}</div>`);
}
function closeRentalModal() { document.getElementById("rentalModal")?.remove(); }

function openRentalLogin() {
  if (rentalState.role !== "viewer") { rentalState.role = "viewer"; renderRentalDashboard(); return; }
  rentalModal(`<div class="rental-modal-card"><div class="rental-modal-head"><div><h3><i class="fa-solid fa-lock"></i> Supervisor Login</h3><p>Select the section you manage.</p></div><button class="rental-icon-button" onclick="closeRentalModal()"><i class="fa-solid fa-xmark"></i></button></div><form class="rental-form" onsubmit="submitRentalLogin(event)"><div class="rental-login-options"><label class="rental-login-option"><input type="radio" name="rentalRole" value="chairTable" checked> <strong>Chair &amp; Table</strong> supervisor</label><label class="rental-login-option"><input type="radio" name="rentalRole" value="speaker"> <strong>Speaker</strong> supervisor</label></div><div class="rental-field"><label>Supervisor PIN</label><input id="rentalPin" type="password" required autocomplete="current-password"></div><p id="rentalLoginError" class="pin-error"></p><div class="rental-form-actions"><button class="rental-secondary-button" type="button" onclick="closeRentalModal()">Cancel</button><button class="rental-primary-button" type="submit">Login</button></div></form><p class="rental-notice">PIN unlock is only a screen-level control. Configure Firebase user roles before using this module for live payment data.</p></div>`);
}

async function hashRentalPin(value) {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest)).map(byte => byte.toString(16).padStart(2, "0")).join("");
}

async function submitRentalLogin(event) {
  event.preventDefault();
  const role = new FormData(event.target).get("rentalRole");
  const pin = document.getElementById("rentalPin").value;
  const error = document.getElementById("rentalLoginError");
  if (await hashRentalPin(pin) !== RENTAL_PIN_HASHES[role]) { error.textContent = "PIN ಸರಿಯಿಲ್ಲ. ಮತ್ತೆ ಪ್ರಯತ್ನಿಸಿ."; return; }
  rentalState.role = role;
  closeRentalModal();
  renderRentalDashboard();
}

function openRentalEntry(id = "") {
  const existing = id ? rentalState.rentals.find(rental => rental.id === id) : null;
  const category = existing?.category || rentalState.role;
  if (!rentalCanManage(category)) return;
  const itemOptions = category === "speaker" ? '<option value="Speaker">Speaker</option>' : '<option value="Chair">Chair</option><option value="Table">Table</option><option value="Chair & Table">Chair &amp; Table</option>';
  const value = (name, fallback = "") => escapeHTML(String(existing?.[name] ?? fallback));
  rentalModal(`<div class="rental-modal-card"><div class="rental-modal-head"><div><h3>${existing ? "Edit" : "New"} ${RENTAL_CATEGORY[category].label} rental</h3><p>Payment totals update automatically.</p></div><button class="rental-icon-button" onclick="closeRentalModal()"><i class="fa-solid fa-xmark"></i></button></div><form class="rental-form" onsubmit="saveRentalEntry(event, '${id}')"><input type="hidden" name="category" value="${category}"><div class="rental-form-grid"><div class="rental-field"><label>Customer name *</label><input name="customerName" value="${value("customerName")}" required></div><div class="rental-field"><label>Mobile</label><input name="mobile" value="${value("mobile")}" inputmode="tel"></div><div class="rental-field"><label>Place</label><input name="place" value="${value("place")}"></div><div class="rental-field"><label>Rental item *</label><select name="item">${itemOptions.replace(`value="${existing?.item}"`, `value="${existing?.item}" selected`)}</select></div><div class="rental-field"><label>Quantity *</label><input name="quantity" value="${value("quantity")}" placeholder="Example: 50 chairs" required></div><div class="rental-field"><label>Rent start date *</label><input name="startDate" value="${value("startDate")}" type="date" required></div><div class="rental-field"><label>Number of days *</label><input name="days" type="number" min="1" value="${value("days", "1")}" required></div><div class="rental-field"><label>Return date *</label><input name="returnDate" value="${value("returnDate")}" type="date" required></div><div class="rental-field"><label>Rent amount *</label><input name="totalAmount" type="number" min="0" step="1" value="${value("totalAmount")}" required></div><div class="rental-field"><label>Amount paid</label><input name="paidAmount" type="number" min="0" step="1" value="${value("paidAmount", "0")}"></div><div class="rental-field"><label>Payment date</label><input name="paymentDate" value="${value("paymentDate")}" type="date"></div><div class="rental-field"><label>Collected by</label><input name="collectedBy" value="${value("collectedBy", `${RENTAL_CATEGORY[category].label} Supervisor`)}"></div><div class="rental-field"><label>Maintenance / repair cost</label><input name="maintenanceCost" type="number" min="0" step="1" value="${value("maintenanceCost", "0")}"></div><div class="rental-field full"><label>Note</label><textarea name="note" placeholder="Example: Wedding program">${value("note")}</textarea></div></div><div class="rental-form-actions"><button class="rental-secondary-button" type="button" onclick="closeRentalModal()">Cancel</button><button class="rental-primary-button" type="submit">${existing ? "Update" : "Save"} rental</button></div></form></div>`);
  const entryForm = document.querySelector("#rentalModal form.rental-form");
  if (entryForm) {
    ["mobile", "paymentDate", "collectedBy", "maintenanceCost"].forEach(name => {
      entryForm.querySelector(`[name='${name}']`)?.closest(".rental-field")?.remove();
    });

    const startDate = entryForm.querySelector("[name='startDate']");
    const returnDate = entryForm.querySelector("[name='returnDate']");
    const days = entryForm.querySelector("[name='days']");
    const updateDays = () => {
      if (!startDate?.value || !returnDate?.value || !days) return;
      const difference = Math.round((new Date(`${returnDate.value}T00:00:00`) - new Date(`${startDate.value}T00:00:00`)) / 86400000);
      days.value = Math.max(0, difference);
    };
    if (days) {
      days.readOnly = true;
      days.setAttribute("aria-label", "Number of days, calculated from dates");
    }
    startDate?.addEventListener("change", updateDays);
    returnDate?.addEventListener("change", updateDays);
    updateDays();
  }
  if (existing) {
    const paidInput = document.querySelector("#rentalModal [name='paidAmount']");
    if (paidInput) paidInput.readOnly = true;
  }
}

async function saveRentalEntry(event, id = "") {
  event.preventDefault();
  const values = Object.fromEntries(new FormData(event.target).entries());
  const total = Number(values.totalAmount) || 0;
  const paid = Math.min(total, Math.max(0, Number(values.paidAmount) || 0));
  const existing = id ? rentalState.rentals.find(rental => rental.id === id) : null;
  values.mobile = existing?.mobile || "";
  values.paymentDate = existing?.paymentDate || values.startDate;
  values.collectedBy = existing?.collectedBy || `${RENTAL_CATEGORY[values.category].label} Supervisor`;
  values.maintenanceCost = existing?.maintenanceCost || 0;
  const record = { ...values, totalAmount: total, paidAmount: paid, balance: total - paid, maintenanceCost: Number(values.maintenanceCost) || 0, status: paid >= total && total ? "paid" : paid ? "partial" : "pending", createdAt: existing?.createdAt || new Date().toISOString(), createdBy: existing?.createdBy || rentalState.role, payments: existing?.payments || (paid ? { initial: { amount: paid, date: values.paymentDate || values.startDate, collectedBy: values.collectedBy, createdAt: new Date().toISOString() } } : {}) };
  try { if (id) await window.firebaseDb.ref(`rentals/${id}`).set(record); else await window.firebaseDb.ref("rentals").push(record); closeRentalModal(); await loadRentals(); renderRentalDashboard(); }
  catch (error) { console.error(error); alert("Rental save ಆಗಲಿಲ್ಲ. Firebase permission ಪರಿಶೀಲಿಸಿ."); }
}

function openPaymentModal(id) {
  const rental = rentalState.rentals.find(item => item.id === id);
  if (!rental || !rentalCanManage(rental.category)) return;
  const payments = Object.values(rental.payments || {}).sort((a, b) => String(a.date || "").localeCompare(String(b.date || "")));
  rentalModal(`<div class="rental-modal-card"><div class="rental-modal-head"><div><h3>Payment update</h3><p>${escapeHTML(rental.customerName)} · Balance ${rentalCurrency(rental.balance)}</p></div><button class="rental-icon-button" onclick="closeRentalModal()"><i class="fa-solid fa-xmark"></i></button></div><div class="rental-form"><div class="rental-panel" style="padding:12px; margin-bottom:16px;"><strong>Payment history</strong>${payments.length ? `<div class="rental-table-wrap"><table class="rental-table"><tbody>${payments.map(payment => `<tr><td>${rentalDate(payment.date)}</td><td class="amount">${rentalCurrency(payment.amount)}</td><td>${escapeHTML(payment.collectedBy || "—")}</td></tr>`).join("")}</tbody></table></div>` : '<p style="font-size:12px;color:#6b7c73;">No payment recorded yet.</p>'}</div><form onsubmit="saveRentalPayment(event, '${id}')"><div class="rental-form-grid"><div class="rental-field"><label>Payment amount *</label><input name="amount" type="number" min="1" max="${Math.max(0, Number(rental.balance) || 0)}" required></div><div class="rental-field"><label>Payment date *</label><input name="date" type="date" value="${new Date().toISOString().slice(0, 10)}" required></div><div class="rental-field full"><label>Collected by</label><input name="collectedBy" value="${RENTAL_CATEGORY[rental.category].label} Supervisor"></div></div><div class="rental-form-actions"><button class="rental-secondary-button" type="button" onclick="closeRentalModal()">Cancel</button><button class="rental-primary-button" type="submit">Add payment</button></div></form></div></div>`);
}

async function saveRentalPayment(event, id) {
  event.preventDefault();
  const rental = rentalState.rentals.find(item => item.id === id);
  if (!rental) return;
  const values = Object.fromEntries(new FormData(event.target).entries());
  const amount = Number(values.amount) || 0;
  const total = Number(rental.totalAmount) || 0;
  const paid = Math.min(total, (Number(rental.paidAmount) || 0) + amount);
  const balance = Math.max(0, total - paid);
  const status = paid >= total && total ? "paid" : paid ? "partial" : "pending";
  try { const ref = window.firebaseDb.ref(`rentals/${id}`); await ref.update({ paidAmount: paid, balance, status }); await ref.child("payments").push({ amount, date: values.date, collectedBy: values.collectedBy, createdAt: new Date().toISOString() }); closeRentalModal(); await loadRentals(); renderRentalDashboard(); }
  catch (error) { console.error(error); alert("Payment update ಆಗಲಿಲ್ಲ. Firebase permission ಪರಿಶೀಲಿಸಿ."); }
}

function downloadRentalReport(category, selectedYear) {
  if (typeof XLSX === "undefined") { alert("Excel report library load ಆಗಿಲ್ಲ. Internet connection ಪರಿಶೀಲಿಸಿ."); return; }
  const year = selectedYear || String(new Date().getFullYear());
  const rentals = rentalState.rentals.filter(rental => rental.category === category && String(rental.startDate || "").startsWith(String(year)));
  const totals = rentalTotals(rentals);
  const maintenance = rentals.reduce((sum, rental) => sum + (Number(rental.maintenanceCost) || 0), 0);
  const title = category === "chairTable" ? "Chair & Table Rental Report" : "Speaker Rental Report";
  const summary = [[title], ["Year", year], ["Report generated", new Date().toLocaleString("en-IN")], [], ["Financial summary", "Amount (INR)"], ["Total rentals", rentals.length], ["Total rental amount", totals.total], ["Total revenue collected", totals.paid], ["Maintenance / repair cost", maintenance], ["Net revenue", totals.paid - maintenance], ["Pending dues", totals.balance], [], ["Pending payment details"], ["Customer", "Place", "Item", "Balance"]];
  rentals.filter(rental => (Number(rental.balance) || 0) > 0).forEach(rental => summary.push([rental.customerName, rental.place || "", rental.item || "", Number(rental.balance) || 0]));
  const today = new Date().toISOString().slice(0, 10);
  const activeRentals = rentalState.rentals.filter(rental => rental.category === category && String(rental.startDate || "") <= today && String(rental.returnDate || "") >= today);
  const activeQuantity = label => activeRentals.filter(rental => String(rental.item || "").includes(label)).reduce((sum, rental) => sum + (Number(String(rental.quantity || "").match(/\d+/)?.[0]) || 0), 0);
  if (category === "chairTable") {
    const chairsRented = activeQuantity("Chair");
    const tablesRented = activeQuantity("Table");
    summary.push([], ["Inventory status", "Quantity"], ["Chairs total", 120], ["Chairs currently rented", chairsRented], ["Chairs available", Math.max(0, 120 - chairsRented)], ["Damaged chairs", "Not recorded"], ["Tables total", 20], ["Tables currently rented", tablesRented], ["Tables available", Math.max(0, 20 - tablesRented)], ["Damaged tables", "Not recorded"]);
  } else {
    summary.push([], ["Equipment status", "Quantity"], ["Main speaker", "Available"], ["Wireless mic", "Available"], ["Cables / charger", "Available"]);
  }
  const details = [["Customer", "Mobile", "Place", "Item", "Quantity", "Start date", "Days", "Return date", "Rent amount", "Paid amount", "Balance", "Status", "Maintenance cost", "Collected by", "Note"]];
  rentals.forEach(rental => details.push([rental.customerName, rental.mobile || "", rental.place || "", rental.item || "", rental.quantity || "", rental.startDate || "", Number(rental.days) || 0, rental.returnDate || "", Number(rental.totalAmount) || 0, Number(rental.paidAmount) || 0, Number(rental.balance) || 0, rentalStatusLabel(rentalStatus(rental)), Number(rental.maintenanceCost) || 0, rental.collectedBy || "", rental.note || ""]));
  const workbook = XLSX.utils.book_new();
  const summarySheet = XLSX.utils.aoa_to_sheet(summary);
  const detailSheet = XLSX.utils.aoa_to_sheet(details);
  summarySheet["!cols"] = [{ wch: 28 }, { wch: 18 }, { wch: 22 }, { wch: 18 }];
  detailSheet["!cols"] = [20, 16, 18, 18, 15, 13, 8, 13, 15, 15, 15, 12, 18, 22, 32].map(wch => ({ wch }));
  XLSX.utils.book_append_sheet(workbook, summarySheet, "Financial Report");
  XLSX.utils.book_append_sheet(workbook, detailSheet, "Rental Details");
  XLSX.writeFile(workbook, `AYFA_${category === "chairTable" ? "Chair_Table" : "Speaker"}_Report_${year}.xlsx`);
}
