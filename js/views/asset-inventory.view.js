// Asset inventory navigation and rendering.
// ASSET & INVENTORY NAVIGATION
    // ========================================================
    function openAssetInventory() {
      if (history.state?.appView !== "assets") history.pushState({ appView: "assets" }, "", location.pathname + location.search + "#assets");
      updateAppTopBar("assets");
      hideAllViews();

      const view = document.getElementById("assetInventoryView");
      if (view) {
        view.classList.remove("hidden");
      }

      window.scrollTo({ top: 0, behavior: "smooth" });
      void renderAssetInventory();
    }

    async function renderAssetInventory() {
      const target = document.getElementById("assetDataContent");
      if (!target) return;
      target.textContent = "ಲೋಡ್ ಆಗುತ್ತಿದೆ…";
      try {
        const { categories, highlights } = await AssetInventoryService.load();
        const highlightHTML = highlights.length
          ? `<div class="asset-highlight-grid">${highlights.map(item => `<article class="asset-highlight-card"><div class="asset-highlight-icon"><i class="fa-solid ${escapeHTML(item.icon || "fa-box")}"></i></div><div class="asset-highlight-name">${escapeHTML(item.name || "Asset")}</div>${item.quantity != null ? `<div class="asset-quantity">${escapeHTML(item.quantity)}${item.unit ? ` <small>${escapeHTML(item.unit)}</small>` : ""}</div>` : ""}${item.available ? `<div class="asset-available">${escapeHTML(item.available)}</div>` : ""}</article>`).join("")}</div>`
          : "";
        const categoriesHTML = categories.map(category => `<section class="asset-category"><h3>${escapeHTML(category.name || "Assets")}</h3><ul class="asset-list">${(Array.isArray(category.items) ? category.items : Object.values(category.items || {})).map(item => `<li><i class="fa-solid ${escapeHTML(item.icon || "fa-box")}"></i><span>${escapeHTML(item.name || "")}${item.quantity != null ? ` — ${escapeHTML(item.quantity)} ${escapeHTML(item.unit || "")}` : ""}</span></li>`).join("")}</ul></section>`).join("");
        target.innerHTML = `${highlightHTML}${categoriesHTML}` || "ಯಾವುದೇ assets ದಾಖಲಾಗಿಲ್ಲ.";
      } catch (error) { target.textContent = "ಸಂಪತ್ತಿನ ವಿವರಗಳನ್ನು ಲೋಡ್ ಮಾಡಲು ಸಾಧ್ಯವಾಗಲಿಲ್ಲ."; }
    }

    // ========================================================
