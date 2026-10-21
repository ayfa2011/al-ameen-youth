// Reference data access and normalization for the asset inventory view.
const AssetInventoryService = {
  async load() {
    const assets = await loadReferenceData("assets", "assets");
    const categories = Array.isArray(assets)
      ? assets
      : (Array.isArray(assets?.categories) ? assets.categories : Object.values(assets || {}).filter(value => value && typeof value === "object" && value.name));
    const highlights = Array.isArray(assets?.highlights) ? assets.highlights : [];
    return { categories, highlights };
  }
};
