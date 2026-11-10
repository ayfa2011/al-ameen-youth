// Paste this into the browser console on the Collections page (official/supervisor signed in).
// It adds all 31 "Egu mane collection" entries to the existing project.
(async () => {
  const entries = [
    { name: "RASHEED MAMBLI", amount: 10000, status: "pledged" },
    { name: "MIRAZ MAMBLI", amount: 5000, status: "pledged" },
    { name: "MHMD MAMBLI", amount: 3000, status: "pledged" },
    { name: "SHAREEF MAMBLI", amount: 5000, status: "pledged" },
    { name: "HANEEF DK", amount: 5000, status: "pledged" },
    { name: "KALANDAR ARAMBOOR", amount: 2000, status: "pledged" },
    { name: "RAUF MAMBLI", amount: 3000, status: "pledged" },
    { name: "ABOOBAKKAR MA", amount: 5000, status: "pledged" },
    { name: "KAREEM STAR", amount: 2000, status: "pledged" },
    { name: "SIRAJ MAMBLI", amount: 2000, status: "pledged" },
    { name: "KABEER PANNE", amount: 5000, status: "pledged" },
    { name: "NADEEM SHEIKH", amount: 1000, status: "paid" },
    { name: "NASIR PALADKA", amount: 1000, status: "paid" },
    { name: "AZAR MAMBLI", amount: 2000, status: "pledged" },
    { name: "NO NAME UT", amount: 1000, status: "pledged" },
    { name: "KASIM PALADKA", amount: 1000, status: "paid" },
    { name: "MOIDEEN PALADKA", amount: 3000, status: "paid" },
    { name: "ASHIK ARANTHOD", amount: 10000, status: "pledged" },
    { name: "SHAMSU MAMBLI", amount: 3000, status: "pledged" },
    { name: "MAPPU JATTIPALLA", amount: 500, status: "pledged" },
    { name: "SABIR MAMBLI", amount: 1000, status: "pledged" },
    { name: "NIYAZ MAMBLI", amount: 2000, status: "pledged" },
    { name: "SIDDIK AJJAPPA", amount: 5000, status: "pledged" },
    { name: "ANSHIF MAMBLI", amount: 5000, status: "pledged" },
    { name: "AJMAL PANNE", amount: 2000, status: "pledged" },
    { name: "ASRU ACCHU", amount: 1000, status: "pledged" },
    { name: "BADRU", amount: 2000, status: "pledged" },
    { name: "Kamaal Mambli", amount: 3000, status: "pledged" },
    { name: "Basha saheb", amount: 1000, status: "paid" },
    { name: "Farook mambli", amount: 500, status: "pledged" },
    { name: "NO NAME M", amount: 10000, status: "paid" },
  ];

  try {
    await HouseFundRepository.ready();
    const snapshot = await HouseFundRepository.readProjects();
    const projects = HouseFundService.list(snapshot.val());
    const project = projects.find(p => p.projectName === "Egu ಮನೆ ನಿರ್ಮಾಣ ಸಹಾಯಧನ ಸಂಗ್ರಹ");
    if (!project) {
      console.error("Project not found: Egu ಮನೆ ನಿರ್ಮಾಣ ಸಹಾಯಧನ ಸಂಗ್ರಹ");
      return;
    }
    console.log("Project:", project.projectName, "(id:", project.id, ")");

    const existing = await HouseFundRepository.readContributions(project.id);
    const current = HouseFundService.list(existing.val());
    const existingNames = new Set(current.map(c => String(c.name || "").trim().toLowerCase()));

    let added = 0, skipped = 0, failed = 0;
    for (const entry of entries) {
      const key = entry.name.trim().toLowerCase();
      if (existingNames.has(key)) {
        console.log(`⏭ skipped (exists): ${entry.name}`);
        skipped++;
        continue;
      }
      try {
        const contribution = HouseFundService.createContribution({
          name: entry.name,
          place: "",
          amount: entry.amount,
          contributorType: "supporter",
          status: entry.status,
        });
        await HouseFundRepository.createContribution(project.id, contribution, {
          action: "houseFund.contribution.create",
          path: `houseConstructionFundContributions/${project.id}`,
        });
        console.log(`✅ ${entry.name} — ₹${entry.amount} — ${entry.status === "paid" ? "Paid ✅" : "Promise"}`);
        added++;
      } catch (e) {
        console.error(`❌ ${entry.name}:`, e.message);
        failed++;
      }
    }
    console.log(`\nDone — added: ${added}, skipped: ${skipped}, failed: ${failed}.`);
  } catch (err) {
    console.error("Setup failed:", err.message);
  }
})();
