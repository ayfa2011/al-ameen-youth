// ============================================================
// AYFA RENTAL & PAYMENT MANAGEMENT
// Data is stored in Firebase Realtime Database at /rentals.
// ============================================================

const RENTAL_CURRENT_FINANCIAL_YEAR = String(new Date().getFullYear() + (new Date().getMonth() >= 3 ? 1 : 0));

const rentalState = {
  rentals: [],
  deletedRentals: [],
  category: "",
  filter: "all",
  search: "",
  reportYear: RENTAL_CURRENT_FINANCIAL_YEAR
};

const RENTAL_CATEGORY = {
  chairTable: { label: "Chair & Table", icon: "fa-chair" },
  speaker: { label: "Speaker", icon: "fa-volume-high" }
};

function importedRentalReport(category, year) {
  const reports = referenceDataState.historicalRentals?.[year] || {};
  return reports[category] || null;
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

// Rental report years are financial years named by their ending year:
// 2027 means 1 Apr 2026 through 31 Mar 2027.
function rentalFinancialYearEndYear(dateValue) {
  const match = String(dateValue || "").match(/^(\d{4})-(\d{2})-\d{2}$/);
  if (!match) return "";
  const year = Number(match[1]);
  const month = Number(match[2]);
  if (month < 1 || month > 12) return "";
  return String(year + (month >= 4 ? 1 : 0));
}

function rentalBelongsToFinancialYear(rental, year) {
  return rentalFinancialYearEndYear(rental.startDate) === String(year);
}

function rentalStatus(rental) {
  return RentalsService.status(rental.totalAmount, rental.paidAmount);
}

function rentalStatusLabel(status) {
  return { paid: "PAID", partial: "PARTIAL", pending: "PENDING" }[status] || "PENDING";
}

function rentalCanManage(category) {
  // The configured Firebase rules grant rental writes to official accounts only.
  return isSupervisorLoggedIn();
}

function syncRentalRole() {
  if (document.getElementById("rentalView") && !document.getElementById("rentalView").classList.contains("hidden")) renderRentalDashboard();
}

async function waitForRentalFirebase() {
  await RentalsRepository.ready();
}

async function loadRentals() {
  await waitForRentalFirebase();
  try { await loadReferenceData("historicalRentals", "historicalRentals"); } catch (error) { console.warn("Historical rental summaries unavailable:", error); }
  const snapshot = await RentalsRepository.read("rentals");
  const data = snapshot.val() || {};
  const records = Object.entries(data)
    .map(([id, value]) => ({ id, ...value }))
    .filter(rental => rental && rental.customerName)
    .sort((a, b) => String(b.createdAt || b.startDate || "").localeCompare(String(a.createdAt || a.startDate || "")));
  rentalState.deletedRentals = records.filter(rental => rental.deleted === true);
  rentalState.rentals = records.filter(rental => rental.deleted !== true);
}

function rentalTotals(rentals) {
  return RentalsService.totals(rentals);
}

function rentalReportYearOptions() {
  const years = new Set([RENTAL_CURRENT_FINANCIAL_YEAR]);
  years.add("2026");
  rentalState.rentals.forEach(rental => {
    const financialYear = rentalFinancialYearEndYear(rental.startDate);
    if (financialYear) years.add(financialYear);
  });
  return Array.from(years).sort((a, b) => b.localeCompare(a)).map(year => `<option value="${year}" ${year === rentalState.reportYear ? "selected" : ""}>${year}</option>`).join("");
}

function openRentalManagement() {
  if (typeof navigateAppView === "function" && history.state?.appView !== "rentals") history.pushState({ appView: "rentals" }, "", location.pathname + location.search + "#rentals");
  updateAppTopBar("rentals");
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
  const isSupervisor = isSupervisorLoggedIn();
  button.classList.toggle("is-active", isSupervisor);
  button.innerHTML = isSupervisor
    ? '<i class="fa-solid fa-unlock"></i> Supervisor'
    : '<i class="fa-solid fa-lock"></i> Supervisor Login';
}

function renderRentalDashboard() {
  updateRentalLoginButton();
  const target = document.getElementById("rentalContent");
  if (!target) return;
  if (!rentalState.category) {
    target.innerHTML = `<div class="rental-category-grid rental-department-grid">
      <button type="button" class="rental-category-card" onclick="setRentalCategory('chairTable')"><i class="fa-solid fa-chair"></i><h3>Chair &amp; Table</h3></button>
      <button type="button" class="rental-category-card speaker" onclick="setRentalCategory('speaker')"><i class="fa-solid fa-volume-high"></i><h3>Speaker</h3></button>
    </div>`;
    return;
  }

  const category = rentalState.category;
  const rentals = rentalState.rentals.filter(rental => rental.category === category);
  const selectedYear = rentalState.reportYear || RENTAL_CURRENT_FINANCIAL_YEAR;
  const historicalReport = importedRentalReport(category, selectedYear);
  const yearRentals = historicalReport
    ? []
    : rentals.filter(rental => rentalBelongsToFinancialYear(rental, selectedYear));
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
        : `<p>${escapeHTML(rental.item || categoryLabel)} · ${escapeHTML(rental.quantity || "—")}<small>${rentalDate(rental.startDate)}${rental.returnDate ? ` – ${rentalDate(rental.returnDate)}` : ""}</small></p>${rental.mobile ? `<a class="rental-phone-link" href="tel:${escapeHTML(String(rental.mobile).replace(/[^+\d]/g, ""))}"><i class="fa-solid fa-phone"></i> ${escapeHTML(rental.mobile)}</a>` : ""}${rental.equipmentProvided?.length ? `<small class="rental-equipment-summary">Equipment: ${rental.equipmentProvided.map(escapeHTML).join(", ")}</small>` : ""}`;
      const amount = rental.importedHistoric
        ? `<div class="rental-order-value"><span>Amount</span><strong>${rental.totalAmount == null ? "—" : rentalCurrency(rental.totalAmount)}</strong></div>`
        : `<div class="rental-order-value"><strong>Total ${rentalCurrency(rental.totalAmount)}</strong><span>Advance ${rentalCurrency(rental.advanceAmount ?? rental.initialAdvance ?? rental.paidAmount)}</span><span class="${Number(rental.balance) > 0 ? "rental-due" : ""}">Due ${rentalCurrency(rental.balance)}</span></div>`;
      const actions = canManage && !rental.importedHistoric
        ? rental.trashRecord
          ? `<div class="rental-order-actions"><button class="rental-secondary-button" type="button" onclick="restoreRental('${rental.id}')"><i class="fa-solid fa-rotate-left"></i> Restore</button></div>`
          : `<div class="rental-order-actions"><button class="rental-secondary-button" type="button" onclick="openRentalEntry('${rental.id}')"><i class="fa-solid fa-pen"></i> Edit</button><button class="rental-secondary-button" type="button" onclick="openPaymentModal('${rental.id}')"><i class="fa-solid fa-money-bill-wave"></i> Payment</button><button class="rental-delete-button" type="button" onclick="deleteRental('${rental.id}')"><i class="fa-solid fa-trash"></i> Delete</button></div>`
        : "";
      const statusBadge = statusText ? `<span class="rental-status ${status}">${escapeHTML(statusText)}</span>` : "";
      return `<article class="rental-order-card"><div class="rental-order-person"><div class="rental-order-heading"><strong>${escapeHTML(rental.customerName)}</strong>${statusBadge}</div>${details}</div>${amount}${actions}</article>`;
    }).join("")}</div>`
    : `<div class="rental-empty">${empty}</div>`;

  const displayedTotals = historicalReport
    ? { count: historicalReport.rentalCount, revenue: historicalReport.revenue, collected: historicalReport.collected, pending: historicalReport.pendingDues }
    : { count: yearRentals.length, revenue: totals.total, collected: totals.paid, pending: totals.balance };

  const useCompactSpeaker = category === "speaker";
  target.innerHTML = `<div class="rental-department-toolbar"><button class="rental-secondary-button" type="button" onclick="setRentalCategory('')"><i class="fa-solid fa-arrow-left"></i> Categories</button><h3><i class="fa-solid ${RENTAL_CATEGORY[category].icon}"></i> ${categoryLabel} Rental Dashboard</h3>${isSupervisorLoggedIn() ? '<span class="rental-role-indicator">Officials access</span>' : ''}</div>
    <div class="rental-year-filter"><label for="rentalReportYear">Year</label><select id="rentalReportYear" aria-label="Select year" onchange="setRentalReportYear(this.value)">${rentalReportYearOptions()}</select></div>
    <div class="rental-summary-grid rental-simple-summary ${useCompactSpeaker ? "speaker-summary" : ""}"><div class="rental-stat-card"><span>Total Rentals</span><strong>${displayedTotals.count}</strong></div><div class="rental-stat-card collected"><span>Total Collected</span><strong>${rentalCurrencyOrDash(displayedTotals.collected)}</strong></div><div class="rental-stat-card pending"><span>Pending Dues</span><strong>${rentalCurrencyOrDash(displayedTotals.pending)}</strong></div></div>
    ${canManage ? `<button class="rental-primary-button rental-new-booking" type="button" onclick="openRentalEntry()"><i class="fa-solid fa-plus"></i> Add Rental</button>` : ""}
    ${useCompactSpeaker ? `<div class="rental-tabs" role="tablist" aria-label="Rental records"><button type="button" role="tab" aria-selected="true" class="active" onclick="setRentalTab('upcoming', this)">Upcoming <span>${upcoming.length}</span></button><button type="button" role="tab" aria-selected="false" onclick="setRentalTab('history', this)">History <span>${history.length}</span></button></div><section class="rental-panel rental-order-section speaker-tab-panel" data-rental-tab-panel="upcoming">${bookingList(upcoming,"No upcoming rentals.")}</section><section class="rental-panel rental-order-section speaker-tab-panel hidden" data-rental-tab-panel="history">${bookingList(history,"No past rentals.")}</section>` : `<section class="rental-panel rental-order-section"><h3><i class="fa-regular fa-calendar-check"></i> Upcoming <span>${upcoming.length}</span></h3>${bookingList(upcoming,"No upcoming rentals.")}</section><section class="rental-panel rental-order-section"><h3><i class="fa-solid fa-clock-rotate-left"></i> Rental History <span>${history.length}</span></h3>${bookingList(history,"No past rentals.")}</section>`}
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

function setRentalTab(tab, button) {
  const target = document.getElementById("rentalContent");
  if (!target) return;
  target.querySelectorAll(".rental-tabs [role='tab']").forEach(item => {
    const active = item === button;
    item.classList.toggle("active", active);
    item.setAttribute("aria-selected", String(active));
  });
  target.querySelectorAll("[data-rental-tab-panel]").forEach(panel => panel.classList.toggle("hidden", panel.dataset.rentalTabPanel !== tab));
}

function rentalModal(content) {
  document.body.insertAdjacentHTML("beforeend", `<div class="rental-modal" id="rentalModal" role="dialog" aria-modal="true">${content}</div>`);
}
function closeRentalModal() { document.getElementById("rentalModal")?.remove(); }

function openRentalLogin(category = rentalState.category) {
  if (isSupervisorLoggedIn()) return;
  showAuthScreen("official");
}

async function submitRentalLogin(event) {
  event?.preventDefault();
  showAuthScreen("official");
}

function openRentalEntry(id = "") {
  if (!requireSupervisor()) return;
  const existing = id ? rentalState.rentals.find(rental => rental.id === id) : null;
  const category = existing?.category || (RENTAL_CATEGORY[rentalState.category] ? rentalState.category : "chairTable");
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
      if (balancePreview) balancePreview.value = rentalCurrency(RentalsService.balance(total, paid));
      if (statusPreview) statusPreview.value = rentalStatusLabel(RentalsService.status(total, paid));
    };
    totalInput?.addEventListener("input", updatePaymentPreview);
    advanceInput?.addEventListener("input", updatePaymentPreview);
    updatePaymentPreview();
  }
}

async function saveRentalEntry(event, id = "") {
  event.preventDefault();
  if (!requireSupervisor()) return;
  const values = Object.fromEntries(new FormData(event.target).entries());
  const existing = id ? rentalState.rentals.find(rental => rental.id === id) : null;
  const amounts = RentalsService.prepareEntry(values.totalAmount, values.advanceAmount, existing ? existing.paidAmount : null);
  const { total, requestedAdvance, paid } = amounts;
  if (amounts.advanceExceedsTotal) { alert("Advance amount cannot be greater than the total rental amount."); return; }
  if (amounts.paidExceedsTotal) { alert("Total amount cannot be less than the payments already received."); return; }
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
    paidAmount: paid, balance: amounts.balance, status: amounts.status,
    equipmentProvided: equipmentProvided.length ? equipmentProvided : (Array.isArray(existing?.equipmentProvided) ? existing.equipmentProvided : []), paymentDate, collectedBy, maintenanceCost: Number(existing?.maintenanceCost) || 0,
    createdAt: existing?.createdAt || new Date().toISOString(), createdBy: existing?.createdBy || "AYFA Supervisor", updatedAt: new Date().toISOString(), payments
  };
  try {
    if (id) {
      const expectedUpdatedAt = existing?.updatedAt;
      const updatedAt = record.updatedAt;
      const result = await RentalsRepository.transaction(`rentals/${id}`, current => {
        if (!current || current.deleted === true || current.updatedAt !== expectedUpdatedAt) return;
        return { ...current, ...record, updatedAt };
      });
      if (!result.committed) throw new Error("Rental changed while this form was open. Reload it and apply your edits again.");
      await RentalsRepository.audit({ action: "rental.update", path: "rentals", recordId: id, beforeUpdatedAt: expectedUpdatedAt, afterUpdatedAt: updatedAt });
    } else {
      const rentalId = RentalsRepository.key("rentals");
      await RentalsRepository.create({ [`rentals/${rentalId}`]: record }, { action: "rental.create", path: "rentals", recordId: rentalId, afterUpdatedAt: record.updatedAt });
    }
    closeRentalModal(); await loadRentals(); renderRentalDashboard();
  }
  catch (error) { console.error(error); alert(error.message?.includes("changed while") ? "Another official changed this rental. Refresh and reapply your changes." : "Rental could not be saved. Check your connection and permissions."); }
}

async function deleteRental(id) {
  if (!requireSupervisor()) return;
  const rental = rentalState.rentals.find(item => item.id === id);
  if (!rental || !rentalCanManage(rental.category)) return;
  if (!confirm(`Hide the rental record for "${rental.customerName}"? It can be restored later.`)) return;
  try {
    const updatedAt = new Date().toISOString();
    const result = await RentalsRepository.transaction(`rentals/${id}`, current => current && current.deleted !== true ? { ...current, deleted: true, deletedAt: updatedAt, updatedAt } : undefined);
    if (!result.committed) throw new Error("Rental changed before it could be hidden.");
    await RentalsRepository.audit({ action: "rental.hide", path: "rentals", recordId: id, afterUpdatedAt: updatedAt });
    await loadRentals();
    renderRentalDashboard();
  } catch (error) {
    console.error(error);
    alert("Rental record could not be deleted. Please try again.");
  }
}

async function restoreRental(id) {
  if (!requireSupervisor()) return;
  const rental = rentalState.deletedRentals.find(item => item.id === id);
  if (!rental || !rentalCanManage(rental.category)) return;
  try {
    const result = await RentalsRepository.transaction(`rentals/${id}`, current => current?.deleted === true ? { ...current, deleted: false, restoredAt: new Date().toISOString(), updatedAt: new Date().toISOString() } : undefined);
    if (!result.committed) throw new Error("The rental is no longer in the trash. Refresh and try again.");
    await RentalsRepository.audit({ action: "rental.restore", path: "rentals", recordId: id });
    await loadRentals();
    renderRentalDashboard();
  } catch (error) {
    console.error("Rental restore error:", error);
    alert("Rental could not be restored. Refresh and try again.");
  }
}

function openPaymentModal(id) {
  if (!requireSupervisor()) return;
  const rental = rentalState.rentals.find(item => item.id === id);
  if (!rental || !rentalCanManage(rental.category)) return;
  const payments = Object.values(rental.payments || {}).sort((a, b) => String(a.date || "").localeCompare(String(b.date || "")));
  rentalModal(`<div class="rental-modal-card"><div class="rental-modal-head"><div><h3>Add Payment</h3><p>${escapeHTML(rental.customerName)} · Balance ${rentalCurrency(rental.balance)}</p></div><button class="rental-icon-button" onclick="closeRentalModal()"><i class="fa-solid fa-xmark"></i></button></div><div class="rental-form"><div class="rental-panel" style="padding:12px; margin-bottom:16px;"><strong>Payment history</strong>${payments.length ? `<div class="rental-table-wrap"><table class="rental-table"><tbody>${payments.map(payment => `<tr><td>${rentalDate(payment.date)}</td><td class="amount">${rentalCurrency(payment.amount)}</td><td>${escapeHTML(payment.collectedBy || "—")}</td></tr>`).join("")}</tbody></table></div>` : '<p style="font-size:12px;color:#6b7c73;">No payment recorded yet.</p>'}</div><form onsubmit="saveRentalPayment(event, '${id}')"><div class="rental-form-grid"><div class="rental-field"><label>Payment amount *</label><input name="amount" type="number" min="1" max="${Math.max(0, Number(rental.balance) || 0)}" required></div><div class="rental-field"><label>Payment date *</label><input name="date" type="date" value="${new Date().toISOString().slice(0, 10)}" required></div><div class="rental-field full"><label>Collected by</label><input name="collectedBy" value="${RENTAL_CATEGORY[rental.category].label} Supervisor"></div></div><div class="rental-form-actions"><button class="rental-secondary-button" type="button" onclick="closeRentalModal()">Cancel</button><button class="rental-primary-button" type="submit">Add payment</button></div></form></div></div>`);
}

async function saveRentalPayment(event, id) {
  event.preventDefault();
  if (!requireSupervisor()) return;
  const rental = rentalState.rentals.find(item => item.id === id);
  if (!rental) return;
  const values = Object.fromEntries(new FormData(event.target).entries());
  const amount = Number(values.amount) || 0;
  try {
    const paymentId = RentalsRepository.key(`rentals/${id}/payments`);
    const payment = { amount, date: values.date, collectedBy: String(values.collectedBy || "").trim(), createdAt: new Date().toISOString() };
    const result = await RentalsRepository.transaction(`rentals/${id}`, current => {
      if (!current || current.deleted === true || current.updatedAt !== rental.updatedAt) return;
      const currentPaid = RentalsService.number(current.paidAmount);
      if (!RentalsService.canApplyPayment(current.totalAmount, currentPaid, amount)) return;
      const next = RentalsService.paymentResult(current.totalAmount, currentPaid, amount);
      return { ...current, paidAmount: next.paid, balance: next.balance, status: next.status, payments: { ...(current.payments || {}), [paymentId]: payment }, updatedAt: new Date().toISOString() };
    });
    if (!result.committed) throw new Error("Another official changed this rental, or the amount exceeds its current balance. Refresh and try again.");
    await RentalsRepository.audit({ action: "rental.payment", path: "rentals", recordId: id, beforeUpdatedAt: rental.updatedAt });
    closeRentalModal(); await loadRentals(); renderRentalDashboard();
  }
  catch (error) { console.error(error); alert(error.message?.includes("Another official changed") ? error.message : "Payment could not be updated. Check your connection and permissions."); }
}

function downloadRentalReport(category, selectedYear) {
  if (typeof XLSX === "undefined") { alert("Excel report library load ಆಗಿಲ್ಲ. Internet connection ಪರಿಶೀಲಿಸಿ."); return; }
  const year = selectedYear || String(new Date().getFullYear());
  const historicalReport = importedRentalReport(category, String(year));
  const rentals = historicalReport ? [] : rentalState.rentals.filter(rental => rental.category === category && rentalBelongsToFinancialYear(rental, year));
  const totals = rentalTotals(rentals);
  const maintenance = RentalsService.maintenanceTotal(rentals);
  const title = category === "chairTable" ? "Chair & Table Rental Report" : "Speaker Rental Report";
  const summary = [[title], ["Year", year], ["Report generated", new Date().toLocaleDateString("en-IN")], [], ["Financial summary", "Amount (INR)"], ["Total rentals", historicalReport?.rentalCount ?? rentals.length], [historicalReport ? "Total revenue" : "Total rental amount", historicalReport?.revenue ?? totals.total]];
  if (historicalReport) {
    if (historicalReport.collected != null) summary.push(["Total collected", historicalReport.collected]);
    if (category === "speaker" && historicalReport) summary.push(["Maintenance / repair cost", historicalReport.maintenance], ["Net revenue", historicalReport.netRevenue]);
    if (historicalReport.pendingDues != null) summary.push(["Pending dues", historicalReport.pendingDues]);
    summary.push([], ["Rental details"], historicalReport.details.some(detail => detail.status) ? ["Name", "Amount (INR)", "Status"] : ["Name", "Amount (INR)"]);
    historicalReport.details.forEach(detail => summary.push(historicalReport.details.some(item => item.status) ? [detail.customerName, detail.amount ?? "", detail.status] : [detail.customerName, detail.amount ?? ""]));
  } else {
    summary.push(["Total collected", totals.paid], ["Advance collected", totals.advance], ["Maintenance / repair cost", maintenance], ["Net revenue", RentalsService.netRevenue(totals.paid, maintenance)], ["Pending dues", totals.balance], [], ["Pending payment details"], ["Customer", "Place", "Item", "Balance"]);
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
    ? [["Total rentals", String(historicalReport.rentalCount)], ["Total revenue", rentalCurrencyOrDash(historicalReport.revenue)], ...(historicalReport.collected != null ? [["Total collected", rentalCurrency(historicalReport.collected)]] : []), ...(category === "speaker" ? [["Maintenance / repair cost", rentalCurrency(historicalReport.maintenance)], ["Net revenue", rentalCurrency(historicalReport.netRevenue)]] : []), ...(historicalReport.pendingDues != null ? [["Pending dues", rentalCurrency(historicalReport.pendingDues)]] : [])]
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
