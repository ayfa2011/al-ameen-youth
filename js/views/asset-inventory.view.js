// Asset inventory navigation, rendering and official edit modal.
let assetInventoryRaw = null;
let assetInventoryCategories = [];
let assetInventoryHighlights = [];

function openAssetInventory() {
  if (history.state?.appView !== "assets") history.pushState({ appView: "assets" }, "", location.pathname + location.search + "#assets");
  updateAppTopBar("assets");
  hideAllViews();
  document.getElementById("assetInventoryView")?.classList.remove("hidden");
  window.scrollTo({ top: 0, behavior: "smooth" });
  void renderAssetInventory();
}

function assetCanEdit() { return typeof isSupervisorLoggedIn === "function" && isSupervisorLoggedIn(); }
function assetList(value) { return Array.isArray(value) ? value : Object.values(value || {}); }

async function renderAssetInventory() {
  const target = document.getElementById("assetDataContent");
  if (!target) return;
  target.textContent = "ಲೋಡ್ ಆಗುತ್ತಿದೆ…";
  try {
    const loaded = await AssetInventoryService.load();
    assetInventoryRaw = Array.isArray(loaded.raw) ? { categories: loaded.raw, highlights: [] } : { ...(loaded.raw || {}) };
    assetInventoryCategories = loaded.categories || [];
    assetInventoryHighlights = loaded.highlights || [];
    const canEdit = assetCanEdit();
    const highlightHTML = assetInventoryHighlights.length
      ? `<div class="asset-highlight-grid">${assetInventoryHighlights.map((item, index) => `<article class="asset-highlight-card"><div class="asset-highlight-icon"><i class="fa-solid ${escapeHTML(item.icon || "fa-box")}"></i></div>${canEdit ? `<button type="button" class="asset-inline-action asset-highlight-name" data-asset-type="highlight" data-asset-index="${index}">${escapeHTML(item.name || "Asset")}</button>` : `<div class="asset-highlight-name">${escapeHTML(item.name || "Asset")}</div>`}${item.quantity != null ? `${canEdit ? `<button type="button" class="asset-inline-action asset-quantity" data-asset-type="highlight" data-asset-index="${index}">${escapeHTML(item.quantity)}${item.unit ? ` <small>${escapeHTML(item.unit)}</small>` : ""}</button>` : `<div class="asset-quantity">${escapeHTML(item.quantity)}${item.unit ? ` <small>${escapeHTML(item.unit)}</small>` : ""}</div>`}` : ""}${item.available ? `<div class="asset-available">${escapeHTML(item.available)}</div>` : ""}</article>`).join("")}</div>` : "";
    const categoriesHTML = assetInventoryCategories.map((category, categoryIndex) => `<section class="asset-category"><h3>${escapeHTML(category.name || "Assets")}</h3><ul class="asset-list">${assetList(category.items).map((item, itemIndex) => `<li><i class="fa-solid ${escapeHTML(item.icon || "fa-box")}"></i>${canEdit ? `<button type="button" class="asset-inline-action" data-asset-type="category" data-category-index="${categoryIndex}" data-asset-index="${itemIndex}">${escapeHTML(item.name || "")}${item.quantity != null ? ` — ${escapeHTML(item.quantity)} ${escapeHTML(item.unit || "")}` : ""}</button>` : `<span>${escapeHTML(item.name || "")}${item.quantity != null ? ` — ${escapeHTML(item.quantity)} ${escapeHTML(item.unit || "")}` : ""}</span>`}</li>`).join("")}</ul></section>`).join("");
    const addButton = canEdit ? '<button type="button" class="asset-add-button" onclick="openAssetEditor()"><i class="fa-solid fa-plus"></i> Add Asset</button>' : "";
    target.innerHTML = `<div class="asset-toolbar"><label class="page-search"><i class="fa-solid fa-magnifying-glass" aria-hidden="true"></i><input id="assetInventorySearch" type="search" placeholder="Search assets" aria-label="Search assets" oninput="filterAssetInventory(this.value)"></label>${addButton}</div><div class="asset-inventory-content">${highlightHTML}${categoriesHTML}</div>`;
    target.querySelectorAll("[data-asset-type]").forEach(button => button.addEventListener("click", () => openAssetEditor(button.dataset.assetType, Number(button.dataset.assetIndex), Number(button.dataset.categoryIndex))));
  } catch (error) { console.error("Asset inventory load failed:", error); target.textContent = "ಸಂಪತ್ತಿನ ವಿವರಗಳನ್ನು ಲೋಡ್ ಮಾಡಲು ಸಾಧ್ಯವಾಗಲಿಲ್ಲ."; }
}

function filterAssetInventory(query) {
  const term = String(query || "").trim().toLowerCase();
  document.querySelectorAll("#assetDataContent .asset-highlight-card, #assetDataContent .asset-category").forEach(item => { item.hidden = Boolean(term) && !item.textContent.toLowerCase().includes(term); });
}

function openAssetEditor(type = "highlight", index = -1, categoryIndex = -1) {
  if (!assetCanEdit()) { showToast("Officials access is required to edit assets."); return; }
  const editing = index >= 0;
  const item = editing ? (type === "highlight" ? assetInventoryHighlights[index] : assetList(assetInventoryCategories[categoryIndex]?.items)[index]) : {};
  if (editing && !item) return;
  document.getElementById("assetEditorModal")?.remove();
  const modal = document.createElement("div");
  modal.id = "assetEditorModal";
  modal.className = "asset-editor-modal";
  modal.innerHTML = `<section class="asset-editor-dialog" role="dialog" aria-modal="true" aria-labelledby="assetEditorTitle"><h3 id="assetEditorTitle">${editing ? "Edit asset" : "Add asset"}</h3><form id="assetEditorForm"><label>Asset name<input name="name" maxlength="150" value="${escapeHTML(item?.name || "")}" required></label><label>Quantity<input name="quantity" type="text" maxlength="40" value="${escapeHTML(item?.quantity ?? "")}" placeholder="e.g. 20"></label><label>Unit<input name="unit" maxlength="40" value="${escapeHTML(item?.unit || "")}" placeholder="e.g. Nos"></label>${type === "highlight" ? `<label>Availability<input name="available" maxlength="80" value="${escapeHTML(item?.available || "")}" placeholder="Optional"></label>` : ""}<div class="asset-editor-actions">${editing ? '<button type="button" class="asset-editor-delete">Delete</button>' : ""}<button type="button" class="asset-editor-cancel">Cancel</button><button type="submit" class="asset-editor-save">Save</button></div></form></section>`;
  document.body.append(modal);
  modal.querySelector(".asset-editor-cancel").addEventListener("click", () => modal.remove());
  modal.addEventListener("click", event => { if (event.target === modal) modal.remove(); });
  modal.querySelector(".asset-editor-delete")?.addEventListener("click", () => { void deleteAssetItem(type, index, categoryIndex, item); });
  modal.querySelector("form").addEventListener("submit", event => { event.preventDefault(); void saveAssetEditor(type, index, categoryIndex, Object.fromEntries(new FormData(event.currentTarget))); });
}

async function deleteAssetItem(type, index, categoryIndex, item) {
  if (!assetCanEdit()) return;
  const name = String(item?.name || "this asset");
  if (!await showDeleteConfirmSheet({ title: "Delete asset?", message: `${name} will be removed from the asset list.`, confirmLabel: "Delete" })) return;
  await saveAssetEditor(type, index, categoryIndex, null, true);
}

async function saveAssetEditor(type, index, categoryIndex, values, confirmed = false) {
  if (!assetCanEdit()) return;
  if (values === null && !confirmed) {
    const existing = type === "highlight" ? assetInventoryHighlights[index] : assetList(assetInventoryCategories[categoryIndex]?.items)[index];
    await deleteAssetItem(type, index, categoryIndex, existing);
    return;
  }
  const modal = document.getElementById("assetEditorModal");
  const editing = index >= 0;
  const data = JSON.parse(JSON.stringify(assetInventoryRaw || {}));
  data.categories = assetInventoryCategories.map(category => ({ ...category, items: assetList(category.items).map(item => ({ ...item })) }));
  data.highlights = assetInventoryHighlights.map(item => ({ ...item }));
  const now = new Date().toISOString();
  let action;
  if (type === "highlight") {
    if (values === null) data.highlights.splice(index, 1);
    else {
      const quantity = String(values.quantity || "").trim();
      const item = { ...(editing ? data.highlights[index] : { icon: "fa-box" }), name: String(values.name || "").trim(), quantity: quantity || null, unit: String(values.unit || "").trim(), available: String(values.available || "").trim(), updatedAt: now };
      if (!item.name) return;
      if (editing) data.highlights[index] = item; else data.highlights.push(item);
    }
    action = values === null ? "asset.highlight.delete" : editing ? "asset.highlight.update" : "asset.highlight.create";
  } else {
    const items = data.categories[categoryIndex]?.items;
    if (!items) return;
    if (values === null) items.splice(index, 1);
    else {
      const quantity = String(values.quantity || "").trim();
      const item = { ...(editing ? items[index] : { icon: "fa-box" }), name: String(values.name || "").trim(), quantity: quantity || null, unit: String(values.unit || "").trim(), updatedAt: now };
      if (!item.name) return;
      if (editing) items[index] = item; else items.push(item);
    }
    action = values === null ? "asset.item.delete" : "asset.item.update";
  }
  const button = modal?.querySelector('[type="submit"]');
  try {
    if (button) button.disabled = true;
    await AssetInventoryService.save(data, { action, path: "assets", recordId: `${type}:${categoryIndex}:${index}`, afterUpdatedAt: now });
    modal?.remove();
    await renderAssetInventory();
    showToast(values === null ? "Asset deleted." : "Asset saved.", "success");
  } catch (error) {
    console.error("Asset save failed:", error);
    showToast(String(error?.code || error?.message || "").toLowerCase().includes("permission") ? "Firebase denied this change. Sign in as an official and check the deployed database rules." : "Asset could not be saved. Check the connection and try again.");
    if (button) button.disabled = false;
  }
}
