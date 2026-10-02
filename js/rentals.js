// ============================================================
// AYFA RENTAL & PAYMENT MANAGEMENT
// Data is stored in Firebase Realtime Database at /rentals.
// ============================================================

const RENTAL_PIN_HASHES = {
  chairTable: "7b66a6e307824a78144b1e7afea4675a919e513ac331fdd48cdf553b9eaa2519",
  speaker: "7b66a6e307824a78144b1e7afea4675a919e513ac331fdd48cdf553b9eaa2519"
};

const RENTAL_CURRENT_FINANCIAL_YEAR = "2027";

const rentalState = {
  rentals: [],
  role: "viewer",
  category: "",
  filter: "all",
  search: "",
  reportYear: RENTAL_CURRENT_FINANCIAL_YEAR
};

const RENTAL_CATEGORY = {
  chairTable: { label: "Chair & Table", icon: "fa-chair" },
  speaker: { label: "Speaker", icon: "fa-volume-high" }
};

// Closed-year Speaker report supplied for FY 2025-2026. Keep it in the
// existing report/export flow; source entries do not include booking dates.
const SPEAKER_REPORT_2026 = {
  rentalCount: 19,
  revenue: 15100,
  collected: 15100,
  maintenance: 0,
  netRevenue: 15100,
  pendingDues: 0,
  details: [
    { customerName: "Mambli pullo", amount: 2000, status: "Received" },
    { customerName: "Nasir mambli", amount: 1000, status: "Received" },
    { customerName: "Fayaz mambli", amount: 1000, status: "Received" },
    { customerName: "Aranthod", amount: 600, status: "Received" },
    { customerName: "Aranthod (2nd time)", amount: 600, status: "Received" },
    { customerName: "Abdulla", amount: 1600, status: "Received" },
    { customerName: "Nasir ground", amount: 600, status: "Received" },
    { customerName: "Siddik ambulance", amount: 1200, status: "Received" },
    { customerName: "Nizam", amount: 600, status: "Received" },
    { customerName: "Hasianar ajjavara", amount: 500, status: "Received" },
    { customerName: "Hafeez", amount: 600, status: "Received" },
    { customerName: "Khalid", amount: 600, status: "Received" },
    { customerName: "Rishad", amount: 600, status: "Received" },
    { customerName: "Hafeez (2nd time)", amount: 600, status: "Received" },
    { customerName: "PR gate (2 programs)", amount: 1200, status: "Received" },
    { customerName: "Abbas fish", amount: 600, status: "Received" },
    { customerName: "PR gate", amount: 600, status: "Received" },
    { customerName: "Kabeer mambli", amount: 600, status: "Received" },
    { customerName: "F3 shoe", amount: null, status: "Pending" }
  ]
};

const CHAIR_TABLE_REPORT_2026 = {
  rentalCount: 21,
  revenue: 15887,
  collected: 15887,
  maintenance: null,
  netRevenue: null,
  pendingDues: 0,
  details: [
    { customerName: "Miraz", amount: 100 },
    { customerName: "Biliyar", amount: 1500 },
    { customerName: "Sullia", amount: 100 },
    { customerName: "S.A.S.", amount: 1500 },
    { customerName: "No Name", amount: 420 },
    { customerName: "Akka", amount: 75 },
    { customerName: "Arambooor", amount: 165 },
    { customerName: "Sullia", amount: 902 },
    { customerName: "Sullia", amount: 125 },
    { customerName: "Gafoor", amount: 740 },
    { customerName: "T.U.A.", amount: 210 },
    { customerName: "Gafoor", amount: 150 },
    { customerName: "Sullia", amount: 330 },
    { customerName: "Aramboor", amount: 1180 },
    { customerName: "Sullia", amount: 1720 },
    { customerName: "Aramboor", amount: 125 },
    { customerName: "Aramboor", amount: 550 },
    { customerName: "Aramboor", amount: 1195 },
    { customerName: "A.S.", amount: 900 },
    { customerName: "Safwan mambli", amount: 900 },
    { customerName: "Abdulla", amount: 3000 }
  ]
};

function importedRentalReport(category, year) {
  if (year !== "2026") return null;
  if (category === "speaker") return SPEAKER_REPORT_2026;
  if (category === "chairTable") return CHAIR_TABLE_REPORT_2026;
  return null;
}

function rentalCurrency(value) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency", currency: "INR", maximumFractionDigits: 0
  }).format(Number(value) || 0);
}

function rentalCurrencyOrDash(value) {
  return value == null ? "—" : rentalCurrency(value);
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
    totals.advance += Number(rental.advanceAmount ?? rental.initialAdvance ?? rental.paidAmount) || 0;
    totals.balance += Math.max(0, Number(rental.balance ?? ((Number(rental.totalAmount) || 0) - (Number(rental.paidAmount) || 0))));
    return totals;
  }, { total: 0, paid: 0, advance: 0, balance: 0 });
}

function rentalReportYearOptions() {
  const years = new Set([RENTAL_CURRENT_FINANCIAL_YEAR]);
  years.add("2026");
  rentalState.rentals.forEach(rental => {
    if (/^\d{4}/.test(String(rental.startDate || ""))) years.add(String(rental.startDate).slice(0, 4));
  });
  return Array.from(years).sort((a, b) => b.localeCompare(a)).map(year => `<option value="${year}" ${year === rentalState.reportYear ? "selected" : ""}>${year}</option>`).join("");
}

function openRentalManagement() {
  rentalState.category = "";
  rentalState.search = "";
  hideAllViews();
  document.getElementById("appContainer")?.setAttribute("data-active-view", "rental");
  const view = document.getElementById("rentalView");
  if (view) view.classList.remove("hidden");
  window.scrollTo({ top: 0, behavior: "smooth" });
  renderRentalLoading();
  loadRentals().then(renderRentalDashboard).catch(error => {
    console.error(error);
    const target = document.getElementById("rentalContent");
    if (target) target.innerHTML = '<div class="rental-empty">Rental data could not be loaded. Check your connection and try again.</div>';
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
  if (!rentalState.category) {
    target.innerHTML = `<div class="rental-simple-intro"><h3>Select Rental Type</h3><p>Choose the equipment category to view bookings and payments.</p></div><div class="rental-category-grid rental-department-grid">
      <button type="button" class="rental-category-card" onclick="setRentalCategory('chairTable')"><i class="fa-solid fa-chair"></i><h3>Chair &amp; Table</h3><p>Bookings and payments</p></button>
      <button type="button" class="rental-category-card speaker" onclick="setRentalCategory('speaker')"><i class="fa-solid fa-volume-high"></i><h3>Speaker</h3><p>Bookings and payments</p></button>
    </div>`;
    return;
  }

  const category = rentalState.category;
  const rentals = rentalState.rentals.filter(rental => rental.category === category);
  const selectedYear = rentalState.reportYear || RENTAL_CURRENT_FINANCIAL_YEAR;
  const historicalReport = importedRentalReport(category, selectedYear);
  const yearRentals = historicalReport
    ? []
    : rentals.filter(rental => String(rental.startDate || "").startsWith(selectedYear));
  const totals = rentalTotals(yearRentals);
  const today = new Date().toISOString().slice(0, 10);
  const upcoming = yearRentals
    .filter(rental => String(rental.returnDate || rental.startDate || "") >= today)
    .sort((a, b) => String(a.startDate).localeCompare(String(b.startDate)));
  const history = historicalReport
    ? historicalReport.details.map((detail, index) => ({
      id: `speaker-report-2026-${index}`,
      customerName: detail.customerName,
      item: "Speaker",
      totalAmount: detail.amount,
      paidAmount: detail.status === "Received" ? detail.amount : 0,
      balance: detail.status === "Pending" ? null : 0,
      importedHistoric: true,
      reportPaymentStatus: detail.status || ""
    }))
    : yearRentals.filter(rental => !upcoming.includes(rental));
  const categoryLabel = RENTAL_CATEGORY[category].label;
  const canManage = rentalCanManage(category);

  const bookingList = (items, empty) => items.length
    ? `<div class="rental-order-list">${items.map(rental => {
      const status = rental.importedHistoric
        ? (rental.reportPaymentStatus === "Received" ? "paid" : rental.reportPaymentStatus === "Pending" ? "pending" : "")
        : rentalStatus(rental);
      const statusText = rental.importedHistoric ? rental.reportPaymentStatus : rentalStatusLabel(status);
      const details = rental.importedHistoric
        ? `<p>${escapeHTML(rental.item)}</p>`
        : `<p>${escapeHTML(rental.item || categoryLabel)} · ${escapeHTML(rental.quantity || "—")}<small>${rentalDate(rental.startDate)}${rental.returnDate ? ` – ${rentalDate(rental.returnDate)}` : ""}</small></p>${rental.equipmentProvided?.length ? `<small class="rental-equipment-summary">Equipment: ${rental.equipmentProvided.map(escapeHTML).join(", ")}</small>` : ""}`;
      const amount = rental.importedHistoric
        ? `<div class="rental-order-value"><span>Amount</span><strong>${rental.totalAmount == null ? "—" : rentalCurrency(rental.totalAmount)}</strong></div>`
        : `<div class="rental-order-value"><strong>Total ${rentalCurrency(rental.totalAmount)}</strong><span>Paid ${rentalCurrency(rental.paidAmount)} · Due ${rentalCurrency(rental.balance)}</span></div>`;
      const actions = canManage && !rental.importedHistoric
        ? `<div class="rental-order-actions"><button class="rental-secondary-button" type="button" onclick="openRentalEntry('${rental.id}')"><i class="fa-solid fa-pen"></i> Edit</button><button class="rental-secondary-button" type="button" onclick="openPaymentModal('${rental.id}')"><i class="fa-solid fa-money-bill-wave"></i> Payment</button><button class="rental-delete-button" type="button" onclick="deleteRental('${rental.id}')"><i class="fa-solid fa-trash"></i> Delete</button></div>`
        : "";
      const statusBadge = statusText ? `<span class="rental-status ${status}">${escapeHTML(statusText)}</span>` : "";
      return `<article class="rental-order-card"><div class="rental-order-person"><div class="rental-order-heading"><strong>${escapeHTML(rental.customerName)}</strong>${statusBadge}</div>${details}</div>${amount}${actions}</article>`;
    }).join("")}</div>`
    : `<div class="rental-empty">${empty}</div>`;

  const displayedTotals = historicalReport
    ? { count: historicalReport.rentalCount, revenue: historicalReport.revenue, collected: historicalReport.collected, pending: historicalReport.pendingDues }
    : { count: yearRentals.length, revenue: totals.total, collected: totals.paid, pending: totals.balance };

  target.innerHTML = `<div class="rental-department-toolbar"><button class="rental-secondary-button" type="button" onclick="setRentalCategory('')"><i class="fa-solid fa-arrow-left"></i> Categories</button><h3><i class="fa-solid ${RENTAL_CATEGORY[category].icon}"></i> ${categoryLabel}</h3>${rentalState.role === category ? `<button class="rental-secondary-button" type="button" onclick="openRentalLogin()">Log out</button>` : `<button class="rental-secondary-button" type="button" onclick="openRentalLogin('${category}')"><i class="fa-solid fa-lock"></i> Supervisor Login</button>`}</div>
    <div class="rental-year-filter"><label for="rentalReportYear">Year</label><select id="rentalReportYear" aria-label="Select year" onchange="setRentalReportYear(this.value)">${rentalReportYearOptions()}</select></div>
    <div class="rental-summary-grid rental-simple-summary"><div class="rental-stat-card"><span>Total Rentals</span><strong>${displayedTotals.count}</strong></div><div class="rental-stat-card"><span>Total Revenue</span><strong>${rentalCurrencyOrDash(displayedTotals.revenue)}</strong></div><div class="rental-stat-card"><span>Total Collected</span><strong>${rentalCurrencyOrDash(displayedTotals.collected)}</strong></div><div class="rental-stat-card pending"><span>Pending Dues</span><strong>${rentalCurrencyOrDash(displayedTotals.pending)}</strong></div></div>
    ${canManage ? `<button class="rental-primary-button rental-new-booking" type="button" onclick="openRentalEntry()"><i class="fa-solid fa-plus"></i> Add Rental</button>` : ""}
    <section class="rental-panel rental-order-section"><h3><i class="fa-regular fa-calendar-check"></i> Upcoming <span>${upcoming.length}</span></h3>${bookingList(upcoming,"No upcoming rentals.")}</section>
    <section class="rental-panel rental-order-section"><h3><i class="fa-solid fa-clock-rotate-left"></i> Rental History <span>${history.length}</span></h3>${bookingList(history,"No past rentals.")}</section>
    <div class="rental-report-action"><button class="rental-secondary-button" type="button" onclick="downloadRentalPDFReport('${category}', document.getElementById('rentalReportYear').value)"><i class="fa-solid fa-file-pdf"></i> Export PDF</button><button class="rental-secondary-button" type="button" onclick="downloadRentalReport('${category}', document.getElementById('rentalReportYear').value)"><i class="fa-solid fa-file-excel"></i> Excel</button></div>`;

}

function setRentalCategory(category) {
  rentalState.category = category;
  rentalState.filter = category || "all";
  rentalState.search = "";
  renderRentalDashboard();
}

function setRentalReportYear(year) {
  rentalState.reportYear = String(year || RENTAL_CURRENT_FINANCIAL_YEAR);
  renderRentalDashboard();
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

function openRentalLogin(category = rentalState.category) {
  if (!category || !RENTAL_CATEGORY[category]) return;
  if (rentalState.role === category) { rentalState.role = "viewer"; renderRentalDashboard(); return; }
  if (rentalState.role !== "viewer") rentalState.role = "viewer";
  rentalModal(`<div class="rental-modal-card"><div class="rental-modal-head"><div><h3><i class="fa-solid fa-lock"></i> ${RENTAL_CATEGORY[category].label} Supervisor</h3><p>Enter the supervisor PIN for this category.</p></div><button class="rental-icon-button" onclick="closeRentalModal()" aria-label="Close"><i class="fa-solid fa-xmark"></i></button></div><form class="rental-form" onsubmit="submitRentalLogin(event)"><input type="hidden" name="rentalRole" value="${category}"><div class="rental-field"><label for="rentalPin">Supervisor PIN</label><input id="rentalPin" type="password" required autocomplete="current-password" inputmode="numeric"></div><p id="rentalLoginError" class="pin-error"></p><div class="rental-form-actions"><button class="rental-secondary-button" type="button" onclick="closeRentalModal()">Cancel</button><button class="rental-primary-button" type="submit">Login</button></div></form></div>`);
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
  if (await hashRentalPin(pin) !== RENTAL_PIN_HASHES[role]) { error.textContent = "Incorrect PIN. Please try again."; return; }
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
  const advance = existing ? Number(existing.advanceAmount ?? existing.initialAdvance ?? existing.paidAmount ?? 0) : 0;
  rentalModal(`<div class="rental-modal-card"><div class="rental-modal-head"><div><h3>${existing ? "Edit Rental" : "Add New Rental"}</h3><p>${RENTAL_CATEGORY[category].label}</p></div><button class="rental-icon-button" onclick="closeRentalModal()" aria-label="Close"><i class="fa-solid fa-xmark"></i></button></div><form class="rental-form" onsubmit="saveRentalEntry(event, '${id}')"><input type="hidden" name="category" value="${category}"><div class="rental-form-grid">
    <div class="rental-field"><label>Customer / Event Name *</label><input name="customerName" value="${value("customerName")}" required></div>
    <div class="rental-field"><label>Contact Number</label><input name="mobile" value="${value("mobile")}" inputmode="tel"></div>
    <div class="rental-field"><label>Place</label><input name="place" value="${value("place")}"></div>
    <div class="rental-field"><label>Equipment *</label><select name="item">${itemOptions.replace(`value="${existing?.item}"`, `value="${existing?.item}" selected`)}</select></div>
    <div class="rental-field"><label>Quantity *</label><input name="quantity" value="${value("quantity")}" placeholder="e.g. 50 chairs" required></div>
    <div class="rental-field"><label>Rental Date *</label><input name="startDate" value="${value("startDate", new Date().toISOString().slice(0,10))}" type="date" required></div>
    <div class="rental-field"><label>Return Date *</label><input name="returnDate" value="${value("returnDate")}" type="date" required></div>
    <div class="rental-field"><label>Total Rental Amount (₹) *</label><input name="totalAmount" type="number" min="0" step="1" value="${value("totalAmount")}" required></div>
    <div class="rental-field"><label>Advance Amount (₹)</label><input name="advanceAmount" type="number" min="0" step="1" value="${advance}" ${existing ? "readonly" : ""}></div>
    <div class="rental-field"><label>Balance Due (₹)</label><input id="rentalBalancePreview" type="text" readonly value="${rentalCurrency(existing?.balance ?? ((Number(existing?.totalAmount) || 0) - advance))}"></div>
    <div class="rental-field"><label>Payment Status</label><input id="rentalStatusPreview" type="text" readonly value="${rentalStatusLabel(existing ? rentalStatus(existing) : "pending")}"></div>
    <fieldset class="rental-equipment-field"><legend>Equipment Provided</legend><label><input type="checkbox" name="equipmentProvided" value="Main Speaker" ${String(existing?.equipmentProvided || "").includes("Main Speaker") ? "checked" : ""}> Main Speaker</label><label><input type="checkbox" name="equipmentProvided" value="Wireless Mic" ${String(existing?.equipmentProvided || "").includes("Wireless Mic") ? "checked" : ""}> Wireless Mic</label><label><input type="checkbox" name="equipmentProvided" value="Cables / Charger" ${String(existing?.equipmentProvided || "").includes("Cables / Charger") ? "checked" : ""}> Cables / Charger</label></fieldset>
    <div class="rental-field"><label>Managed By / Entry By</label><input name="collectedBy" value="${value("collectedBy", `${RENTAL_CATEGORY[category].label} Supervisor`)}"></div>
    <div class="rental-field full"><label>Remarks</label><textarea name="note" placeholder="Optional notes">${value("note")}</textarea></div></div><div class="rental-form-actions"><button class="rental-secondary-button" type="button" onclick="closeRentalModal()">Cancel</button><button class="rental-primary-button" type="submit">${existing ? "Save Changes" : "Save Rental"}</button></div></form></div>`);
  const entryForm = document.querySelector("#rentalModal form.rental-form");
  if (entryForm) {
    ["maintenanceCost"].forEach(name => {
      entryForm.querySelector(`[name='${name}']`)?.closest(".rental-field")?.remove();
    });

    const startDate = entryForm.querySelector("[name='startDate']");
    const returnDate = entryForm.querySelector("[name='returnDate']");
    const totalInput = entryForm.querySelector("[name='totalAmount']");
    const advanceInput = entryForm.querySelector("[name='advanceAmount']");
    const balancePreview = document.getElementById("rentalBalancePreview");
    const statusPreview = document.getElementById("rentalStatusPreview");
    const updatePaymentPreview = () => {
      const total = Number(totalInput?.value) || 0;
      const advance = Math.min(total, Number(advanceInput?.value) || 0);
      const paid = existing ? Number(existing.paidAmount) || 0 : advance;
      if (balancePreview) balancePreview.value = rentalCurrency(Math.max(0, total - paid));
      if (statusPreview) statusPreview.value = rentalStatusLabel(paid >= total && total ? "paid" : paid ? "partial" : "pending");
    };
    totalInput?.addEventListener("input", updatePaymentPreview);
    advanceInput?.addEventListener("input", updatePaymentPreview);
    updatePaymentPreview();
  }
}

async function saveRentalEntry(event, id = "") {
  event.preventDefault();
  const values = Object.fromEntries(new FormData(event.target).entries());
  const total = Number(values.totalAmount) || 0;
  const requestedAdvance = Math.max(0, Number(values.advanceAmount) || 0);
  if (requestedAdvance > total) { alert("Advance amount cannot be greater than the total rental amount."); return; }
  const existing = id ? rentalState.rentals.find(rental => rental.id === id) : null;
  const paid = existing ? (Number(existing.paidAmount) || 0) : requestedAdvance;
  if (paid > total) { alert("Total amount cannot be less than the payments already received."); return; }
  const start = new Date(`${values.startDate}T00:00:00`);
  const end = new Date(`${values.returnDate}T00:00:00`);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end < start) { alert("Return date must be on or after the rental date."); return; }
  const days = Math.max(0, Math.round((end - start) / 86400000));
  const equipmentProvided = Array.from(event.currentTarget.querySelectorAll("[name='equipmentProvided']:checked"), input => input.value);
  const paymentDate = values.startDate;
  const collectedBy = String(values.collectedBy || "").trim();
  let payments = existing?.payments || {};
  if (!existing && paid > 0) payments = { initial: { amount: paid, date: paymentDate, collectedBy, createdAt: new Date().toISOString() } };
  const record = {
    ...existing, ...values, days, mobile: String(values.mobile || "").trim(), totalAmount: total,
    advanceAmount: existing ? Number(existing.advanceAmount ?? existing.initialAdvance ?? existing.paidAmount ?? paid) : requestedAdvance,
    initialAdvance: existing ? Number(existing.initialAdvance ?? existing.advanceAmount ?? paid) : requestedAdvance,
    paidAmount: paid, balance: total - paid, status: paid >= total && total ? "paid" : paid ? "partial" : "pending",
    equipmentProvided: equipmentProvided.length ? equipmentProvided : (Array.isArray(existing?.equipmentProvided) ? existing.equipmentProvided : []), paymentDate, collectedBy, maintenanceCost: Number(existing?.maintenanceCost) || 0,
    createdAt: existing?.createdAt || new Date().toISOString(), createdBy: existing?.createdBy || rentalState.role, payments
  };
  try { if (id) await window.firebaseDb.ref(`rentals/${id}`).set(record); else await window.firebaseDb.ref("rentals").push(record); closeRentalModal(); await loadRentals(); renderRentalDashboard(); }
  catch (error) { console.error(error); alert("Rental could not be saved. Check your connection and permissions."); }
}

async function deleteRental(id) {
  const rental = rentalState.rentals.find(item => item.id === id);
  if (!rental || !rentalCanManage(rental.category)) return;
  if (!confirm(`Delete the rental record for "${rental.customerName}"? This cannot be undone.`)) return;
  try {
    await window.firebaseDb.ref(`rentals/${id}`).remove();
    await loadRentals();
    renderRentalDashboard();
  } catch (error) {
    console.error(error);
    alert("Rental record could not be deleted. Please try again.");
  }
}

function openPaymentModal(id) {
  const rental = rentalState.rentals.find(item => item.id === id);
  if (!rental || !rentalCanManage(rental.category)) return;
  const payments = Object.values(rental.payments || {}).sort((a, b) => String(a.date || "").localeCompare(String(b.date || "")));
  rentalModal(`<div class="rental-modal-card"><div class="rental-modal-head"><div><h3>Add Payment</h3><p>${escapeHTML(rental.customerName)} · Balance ${rentalCurrency(rental.balance)}</p></div><button class="rental-icon-button" onclick="closeRentalModal()"><i class="fa-solid fa-xmark"></i></button></div><div class="rental-form"><div class="rental-panel" style="padding:12px; margin-bottom:16px;"><strong>Payment history</strong>${payments.length ? `<div class="rental-table-wrap"><table class="rental-table"><tbody>${payments.map(payment => `<tr><td>${rentalDate(payment.date)}</td><td class="amount">${rentalCurrency(payment.amount)}</td><td>${escapeHTML(payment.collectedBy || "—")}</td></tr>`).join("")}</tbody></table></div>` : '<p style="font-size:12px;color:#6b7c73;">No payment recorded yet.</p>'}</div><form onsubmit="saveRentalPayment(event, '${id}')"><div class="rental-form-grid"><div class="rental-field"><label>Payment amount *</label><input name="amount" type="number" min="1" max="${Math.max(0, Number(rental.balance) || 0)}" required></div><div class="rental-field"><label>Payment date *</label><input name="date" type="date" value="${new Date().toISOString().slice(0, 10)}" required></div><div class="rental-field full"><label>Collected by</label><input name="collectedBy" value="${RENTAL_CATEGORY[rental.category].label} Supervisor"></div></div><div class="rental-form-actions"><button class="rental-secondary-button" type="button" onclick="closeRentalModal()">Cancel</button><button class="rental-primary-button" type="submit">Add payment</button></div></form></div></div>`);
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
  catch (error) { console.error(error); alert("Payment could not be updated. Check your connection and permissions."); }
}

function downloadRentalReport(category, selectedYear) {
  if (typeof XLSX === "undefined") { alert("Excel report library load ಆಗಿಲ್ಲ. Internet connection ಪರಿಶೀಲಿಸಿ."); return; }
  const year = selectedYear || String(new Date().getFullYear());
  const historicalReport = importedRentalReport(category, String(year));
  const rentals = historicalReport ? [] : rentalState.rentals.filter(rental => rental.category === category && String(rental.startDate || "").startsWith(String(year)));
  const totals = rentalTotals(rentals);
  const maintenance = rentals.reduce((sum, rental) => sum + (Number(rental.maintenanceCost) || 0), 0);
  const title = category === "chairTable" ? "Chair & Table Rental Report" : "Speaker Rental Report";
  const summary = [[title], ["Year", year], ["Report generated", new Date().toLocaleDateString("en-IN")], [], ["Financial summary", "Amount (INR)"], ["Total rentals", historicalReport?.rentalCount ?? rentals.length], [historicalReport ? "Total revenue" : "Total rental amount", historicalReport?.revenue ?? totals.total]];
  if (historicalReport) {
    if (historicalReport.collected != null) summary.push(["Total collected", historicalReport.collected]);
    if (historicalReport === SPEAKER_REPORT_2026) summary.push(["Maintenance / repair cost", historicalReport.maintenance], ["Net revenue", historicalReport.netRevenue]);
    if (historicalReport.pendingDues != null) summary.push(["Pending dues", historicalReport.pendingDues]);
    summary.push([], ["Rental details"], historicalReport.details.some(detail => detail.status) ? ["Name", "Amount (INR)", "Status"] : ["Name", "Amount (INR)"]);
    historicalReport.details.forEach(detail => summary.push(historicalReport.details.some(item => item.status) ? [detail.customerName, detail.amount ?? "", detail.status] : [detail.customerName, detail.amount ?? ""]));
  } else {
    summary.push(["Total collected", totals.paid], ["Advance collected", totals.advance], ["Maintenance / repair cost", maintenance], ["Net revenue", totals.paid - maintenance], ["Pending dues", totals.balance], [], ["Pending payment details"], ["Customer", "Place", "Item", "Balance"]);
    rentals.filter(rental => (Number(rental.balance) || 0) > 0).forEach(rental => summary.push([rental.customerName, rental.place || "", rental.item || "", Number(rental.balance) || 0]));
  }
  const hasPaymentStatuses = historicalReport?.details.some(detail => detail.status);
  const details = [historicalReport ? (hasPaymentStatuses ? ["Name", "Amount (INR)", "Status"] : ["Name", "Amount (INR)"]) : ["Customer", "Mobile", "Place", "Item", "Quantity", "Start date", "Return date", "Rent amount", "Advance", "Paid", "Balance", "Status", "Note"]];
  if (historicalReport) historicalReport.details.forEach(detail => details.push(hasPaymentStatuses ? [detail.customerName, detail.amount ?? "", detail.status] : [detail.customerName, detail.amount ?? ""]));
  else rentals.forEach(rental => details.push([rental.customerName, rental.mobile || "", rental.place || "", rental.item || "", rental.quantity || "", rental.startDate || "", rental.returnDate || "", Number(rental.totalAmount) || 0, Number(rental.advanceAmount ?? rental.paidAmount) || 0, Number(rental.paidAmount) || 0, Number(rental.balance) || 0, rentalStatusLabel(rentalStatus(rental)), rental.note || ""]));
  const workbook = XLSX.utils.book_new();
  const summarySheet = XLSX.utils.aoa_to_sheet(summary);
  const detailSheet = XLSX.utils.aoa_to_sheet(details);
  summarySheet["!cols"] = [{ wch: 28 }, { wch: 18 }, { wch: 22 }, { wch: 18 }];
  detailSheet["!cols"] = [20, 16, 18, 18, 15, 13, 13, 15, 15, 15, 15, 12, 32].map(wch => ({ wch }));
  XLSX.utils.book_append_sheet(workbook, summarySheet, "Financial Report");
  XLSX.utils.book_append_sheet(workbook, detailSheet, "Rental Details");
  XLSX.writeFile(workbook, `AYFA_${category === "chairTable" ? "Chair_Table" : "Speaker"}_Report_${year}.xlsx`);
}

function downloadRentalPDFReport(category, selectedYear) {
  const PDF = window.jspdf?.jsPDF;
  if (!PDF) { alert("PDF report library is unavailable. Please try again."); return; }
  const year = String(selectedYear || new Date().getFullYear());
  const historicalReport = importedRentalReport(category, year);
  const rentals = historicalReport ? [] : rentalState.rentals.filter(rental => rental.category === category && String(rental.startDate || "").startsWith(year));
  const totals = rentalTotals(rentals);
  const pdf = new PDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const pageWidth = pdf.internal.pageSize.getWidth();
  const margin = 12;
  const width = pageWidth - margin * 2;
  let y = 15;
  pdf.setFontSize(16); pdf.setTextColor(23, 76, 55);
  pdf.text(`${RENTAL_CATEGORY[category]?.label || "Rental"} Report`, margin, y); y += 7;
  pdf.setFontSize(10); pdf.setTextColor(90, 105, 96);
  pdf.text(`Year ${year} · Generated ${new Date().toLocaleDateString("en-IN")}`, margin, y); y += 9;
  const metrics = historicalReport
    ? [["Total rentals", String(historicalReport.rentalCount)], ["Total revenue", rentalCurrencyOrDash(historicalReport.revenue)], ...(historicalReport.collected != null ? [["Total collected", rentalCurrency(historicalReport.collected)]] : []), ...(historicalReport === SPEAKER_REPORT_2026 ? [["Maintenance / repair cost", rentalCurrency(historicalReport.maintenance)], ["Net revenue", rentalCurrency(historicalReport.netRevenue)]] : []), ...(historicalReport.pendingDues != null ? [["Pending dues", rentalCurrency(historicalReport.pendingDues)]] : [])]
    : [["Total rentals", String(rentals.length)], ["Total collected", rentalCurrency(totals.paid)], ["Advance collected", rentalCurrency(totals.advance)], ["Pending dues", rentalCurrency(totals.balance)]];
  metrics.forEach(([label, value]) => { pdf.setFontSize(9); pdf.setTextColor(90, 105, 96); pdf.text(label, margin, y); pdf.setFontSize(11); pdf.setTextColor(23, 62, 45); pdf.text(value, margin + width, y, { align: "right" }); y += 6; });
  y += 3;
  const reportDetails = historicalReport ? historicalReport.details : rentals;
  reportDetails.forEach((rental, index) => {
    if (historicalReport) {
      const status = rental.status ? ` · ${rental.status}` : "";
      const lines = [`${index + 1}. ${rental.customerName}${status}`, `Amount ${rental.amount == null ? "—" : rentalCurrency(rental.amount)}`];
      const blockHeight = lines.length * 4.5 + 5;
      if (y + blockHeight > 282) { pdf.addPage(); y = 15; }
      pdf.setDrawColor(220, 232, 224); pdf.line(margin, y, pageWidth - margin, y); y += 4;
      lines.forEach((line, lineIndex) => { pdf.setFontSize(lineIndex === 0 ? 10 : 8.5); pdf.setTextColor(lineIndex === 0 ? 23 : 70, lineIndex === 0 ? 62 : 88, lineIndex === 0 ? 45 : 77); pdf.text(line, margin, y); y += 4.5; });
      y += 2;
      return;
    }
    const lines = [
      `${index + 1}. ${rental.customerName || "Customer"} · ${rentalStatusLabel(rentalStatus(rental))}`,
      `${rental.item || RENTAL_CATEGORY[category]?.label} · ${rental.quantity || "—"}`,
      `${rental.startDate || "—"} to ${rental.returnDate || "—"}`,
      `Total ${rentalCurrency(rental.totalAmount)} · Advance ${rentalCurrency(rental.advanceAmount ?? rental.paidAmount)} · Paid ${rentalCurrency(rental.paidAmount)} · Due ${rentalCurrency(rental.balance)}`,
      `Place: ${rental.place || "—"}${rental.note ? ` · ${rental.note}` : ""}`
    ];
    const blockHeight = lines.reduce((sum, line) => sum + pdf.splitTextToSize(line, width).length * 4.5, 0) + 5;
    if (y + blockHeight > 282) { pdf.addPage(); y = 15; }
    pdf.setDrawColor(220, 232, 224); pdf.line(margin, y, pageWidth - margin, y); y += 4;
    lines.forEach((line, lineIndex) => {
      pdf.setFontSize(lineIndex === 0 ? 10 : 8.5);
      pdf.setTextColor(lineIndex === 0 ? 23 : 70, lineIndex === 0 ? 62 : 88, lineIndex === 0 ? 45 : 77);
      const wrapped = pdf.splitTextToSize(line, width);
      pdf.text(wrapped, margin, y); y += wrapped.length * 4.5;
    });
    y += 2;
  });
  if (!reportDetails.length) { pdf.setFontSize(10); pdf.text("No rental records for this year.", margin, y); }
  pdf.save(`AYFA_${category === "chairTable" ? "Chair_Table" : "Speaker"}_Report_${year}.pdf`);
}
