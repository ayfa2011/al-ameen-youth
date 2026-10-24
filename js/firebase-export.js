// Official-only Firebase record browser and Excel export.
// This project uses Firebase Realtime Database; paths below map its data groups.
(() => {
  const paths = {
    members: "members",
    bloodDonations: "bloodDonations",
    bloodDonationWorkbook: "bloodDonations",
    activityReports: "programs",
    attendance: "attendance",
    meetingAgendas: "meetingAgendas",
    financeReports: "financeReports",
    chairTableReport: "rentals",
    speakerReport: "rentals"
  };
  const filenames = {
    members: "Members_Report.xlsx",
    bloodDonations: "Blood_Donations_Report.xlsx",
    bloodDonationWorkbook: "Blood_Group_and_Donation_History.xlsx",
    activityReports: "Activity_Reports.xlsx",
    attendance: "Attendance_Report.xlsx",
    meetingAgendas: "Agenda_Report.xlsx",
    financeReports: "Financial_Report.xlsx",
    chairTableReport: "Chair_Table_Report.xlsx",
    speakerReport: "Speaker_Report.xlsx"
  };
  const status = message => { const node = document.getElementById("firebaseExportStatus"); if (node) node.textContent = message; };
  const toRows = value => {
    if (value == null) return [];
    if (Array.isArray(value)) return value.map((record, index) => ({ id: String(index), ...(record && typeof record === "object" ? record : { value: record }) }));
    if (typeof value !== "object") return [{ value }];
    return Object.entries(value).map(([id, record]) => ({ id, ...(record && typeof record === "object" && !Array.isArray(record) ? record : { value: record }) }));
  };
  const flattenForSheet = rows => rows.map(row => Object.fromEntries(Object.entries(row).map(([key, value]) => [key, value && typeof value === "object" ? JSON.stringify(value) : value ?? ""])));
  const memberExportFields = [
    ["Member ID", row => row.memberCode ?? row.displayId ?? row.id ?? row.databaseKey],
    ["Name", row => row.name ?? row.Name],
    ["Designation", row => row.designation ?? row.Designation],
    ["Father Name", row => row.fatherName ?? row.FatherName ?? row["Father Name"]],
    ["Location", row => row.location ?? row.Location],
    ["Blood Group", row => row.bloodGroupOverride ?? row.bloodGroup ?? row["Blood Group"]],
    ["Mobile", row => row.mobile ?? row.Mobile],
    ["Monthly Contribution", row => row.contribution ?? row["Monthly Contribution Amount"] ?? row["Monthy Contribution Amount"]],
    ["education", row => row.education ?? row.Education]
  ];
  const activityExportFields = [
    ["Date", item => item.date ?? item.activityDate],
    ["Title", item => item.title ?? item.programName ?? item.activityName],
    ["Description", item => item.description ?? item.details],
    ["Google Drive Link", item => item.driveLink ?? item.googleDriveLink ?? item.photosLink]
  ];
  async function exportExcel() {
    const collection = document.getElementById("firebaseExportCollection")?.value || "members";
    try {
      if (typeof isSupervisorLoggedIn !== "function" || !isSupervisorLoggedIn()) throw new Error("Sign in as an official to export Firebase records.");
      if (!window.XLSX) throw new Error("Excel export library could not be loaded. Check your connection and try again.");
      status("Preparing Excel file…");
      await window.firebaseReady;
      if (collection === "bloodDonationWorkbook") {
        const [membersSnapshot, donationsSnapshot, groupsSnapshot] = await Promise.all([
          firebaseRead("members"),
          firebaseRead("bloodDonations"),
          firebaseRead("bloodGroups")
        ]);
        const members = toRows(membersSnapshot.val());
        const verifiedGroups = groupsSnapshot.val() || {};
        const groupByName = new Map(Object.entries(verifiedGroups).map(([name, group]) => [String(name).replace(/\([^)]*\)/g, "").toLowerCase().replace(/[^a-z0-9]/g, ""), String(group || "")]));
        const memberById = new Map(members.map(member => [String(member.id), member]));
        const bloodGroupRows = members.map(member => ({
          "Member ID": member.memberCode ?? member.displayId ?? member.id ?? "",
          "Member Name": member.name ?? member.Name ?? "",
          "Blood Group": member.bloodGroupOverride ?? member.bloodGroup ?? member["Blood Group"] ?? groupByName.get(String(member.name ?? member.Name ?? "").replace(/\([^)]*\)/g, "").toLowerCase().replace(/[^a-z0-9]/g, "")) ?? ""
        }));
        const donationRows = [];
        const nestedDonations = donationsSnapshot.val() || {};
        Object.entries(nestedDonations).forEach(([memberId, records]) => {
          if (!records || typeof records !== "object") return;
          const member = memberById.get(String(memberId)) || {};
          Object.values(records).forEach(item => {
            if (!item || typeof item !== "object" || item.deleted === true) return;
            donationRows.push({
              Date: item.donationDate ?? "",
              "Donor Name": item.memberName ?? member.name ?? member.Name ?? "",
              "Blood Group": item.bloodGroup ?? member.bloodGroupOverride ?? member.bloodGroup ?? groupByName.get(String(member.name ?? member.Name ?? "").replace(/\([^)]*\)/g, "").toLowerCase().replace(/[^a-z0-9]/g, "")) ?? "",
              "Patient Name": item.patientName ?? "",
              Place: item.place ?? "",
              Hospital: item.hospital ?? "",
              Units: item.units ?? ""
            });
          });
        });
        if (!bloodGroupRows.length && !donationRows.length) throw new Error("There are no member or donation records to export.");
        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(bloodGroupRows, { header: ["Member ID", "Member Name", "Blood Group"] }), "Blood Group");
        XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(donationRows, { header: ["Date", "Donor Name", "Blood Group", "Patient Name", "Place", "Hospital", "Units"] }), "Blood Donation History");
        XLSX.writeFile(workbook, filenames[collection]);
        status(`Downloaded workbook with ${bloodGroupRows.length} members and ${donationRows.length} donations.`);
        return;
      }
      const snapshot = await firebaseRead(paths[collection]);
      let rows = toRows(snapshot.val());
      if (collection === "financeReports") {
        rows = Object.entries(snapshot.val() || {}).flatMap(([year, entries]) =>
          (Array.isArray(entries) ? entries : Object.values(entries || {})).map(entry => ({ year, ...(entry && typeof entry === "object" ? entry : { amount: entry }) }))
        );
      }
      if (collection === "chairTableReport" || collection === "speakerReport") {
        const category = collection === "chairTableReport" ? "chairTable" : "speaker";
        rows = rows.filter(row => row.category === category && row.deleted !== true);
      }
      if (collection === "meetingAgendas") rows = rows.filter(row => row.deleted !== true);
      if (!rows.length) throw new Error("There are no records to export.");
      if (collection === "members") {
        rows = rows.map(row => Object.fromEntries(memberExportFields.map(([header, getValue]) => [header, getValue(row) ?? ""])));
      } else if (collection === "activityReports") {
        rows = rows.map(item => Object.fromEntries(activityExportFields.map(([header, getValue]) => [header, getValue(item) ?? ""])));
      }
      if (collection !== "members" && collection !== "activityReports") rows = flattenForSheet(rows);
      const selectedHeaders = collection === "members"
        ? memberExportFields.map(([header]) => header)
        : collection === "activityReports" ? activityExportFields.map(([header]) => header) : undefined;
      const worksheet = XLSX.utils.json_to_sheet(rows, selectedHeaders ? { header: selectedHeaders } : undefined);
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, collection === "activityReports" ? "Activity Reports" : collection.slice(0, 31));
      XLSX.writeFile(workbook, filenames[collection] || `${collection}_Report.xlsx`);
      status(`Downloaded ${rows.length} ${rows.length === 1 ? "record" : "records"}.`);
    } catch (error) {
      status(error?.message || "Could not export records.");
    }
  }
  window.exportSelectedFirebaseExcel = function () {
    if (typeof isSupervisorLoggedIn !== "function" || !isSupervisorLoggedIn()) {
      status("Sign in as an official to export Firebase records.");
      return;
    }
    exportExcel();
  };

  function updateVisibility() {
    const visible = typeof isSupervisorLoggedIn === "function" && isSupervisorLoggedIn();
    if (!visible) {
      const more = document.getElementById("moreDashboardPanel");
      if (more) { more.hidden = true; more.classList.add("hidden"); }
    }
  }
  window.toggleMoreDashboard = function () {
    const more = document.getElementById("moreDashboardPanel");
    if (!more) return;
    const opening = more.hidden || more.classList.contains("hidden");
    more.hidden = !opening;
    more.classList.toggle("hidden", !opening);
    const button = document.querySelector('[data-view-handler="toggleMoreDashboard"]');
    button?.setAttribute("aria-expanded", String(opening));
  };
  document.addEventListener("click", event => {
    const more = document.getElementById("moreDashboardPanel");
    const trigger = document.querySelector('[data-view-handler="toggleMoreDashboard"]');
    if (!more || more.hidden) return;
    if (more.contains(event.target) || trigger?.contains(event.target)) return;
    more.hidden = true;
    more.classList.add("hidden");
    trigger?.setAttribute("aria-expanded", "false");
  });
  document.addEventListener("DOMContentLoaded", () => {
    updateVisibility();
    setInterval(updateVisibility, 1500);
  });
})();
