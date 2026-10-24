// Official-only Firebase record browser and Excel export.
// This project uses Firebase Realtime Database; paths below map its data groups.
(() => {
  const paths = {
    members: "members",
    bloodDonations: "bloodDonations",
    bloodDonationWorkbook: "bloodDonations",
    activityReports: "programReports",
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
  const agendaExportFields = [
    ["Date", item => item.date ?? item.agendaDate ?? item.meetingDate],
    ["Title", item => item.title ?? item.agendaTitle],
    ["Description", item => item.description ?? item.details],
    ["Responsible", item => item.responsible ?? item.assignee ?? item.member],
    ["Status", item => item.status ?? item.completionStatus]
  ];
  const bloodGroupOf = record => record?.bloodGroup ?? record?.bloodGroupOverride ?? record?.["Blood Group"] ?? record?.BloodGroup ?? "";
  async function exportFinanceWorkbook() {
    const snapshot = await firebaseRead("financeReports");
    const reportsByYear = snapshot.val() || {};
    const years = Object.keys(reportsByYear).filter(year => /^\d{4}$/.test(year)).sort((a, b) => Number(b) - Number(a));
    if (!years.length) throw new Error("No year-wise financial reports were found.");

    const workbook = XLSX.utils.book_new();
    years.forEach(year => {
      const sourceRows = Array.isArray(reportsByYear[year]) ? reportsByYear[year] : Object.values(reportsByYear[year] || {});
      const result = FinanceService.calculate(sourceRows);
      const aoa = [
        ["ಒಟ್ಟು ಆದಾಯ (Total Income)", result.totalAvailable ?? ""],
        ["ಒಟ್ಟು ವೆಚ್ಚ (Total Expenses)", result.totalExpenses ?? ""],
        ["ಉಳಿಕೆ (Balance / Savings)", result.closingBalance ?? ""],
        [],
        ["ಆದಾಯದ ವಿವರ (Income)"],
        ["ವಿವರ (Particulars)", "ಮೊತ್ತ (₹)"],
        ...result.income.map(row => [row.label, row.amount ?? ""]),
        [],
        ["ವೆಚ್ಚಗಳ ವಿವರ (Expenses)"],
        ["ವಿವರ (Particulars)", "ಮೊತ್ತ (₹)"],
        ...result.expense.map(row => [row.label, row.amount ?? ""])
      ];
      const worksheet = XLSX.utils.aoa_to_sheet(aoa);
      worksheet["!cols"] = [{ wch: 42 }, { wch: 20 }];
      XLSX.utils.book_append_sheet(workbook, worksheet, year);
    });
    XLSX.writeFile(workbook, filenames.financeReports);
    status(`Downloaded financial workbook with ${years.length} year sheets.`);
  }
  async function exportAttendanceWorkbook() {
    const [programsSnapshot, attendanceSnapshot, membersSnapshot] = await Promise.all([
      firebaseRead("programs"),
      firebaseRead("attendance"),
      firebaseRead("members")
    ]);
    const programs = programsSnapshot.val() || {};
    const attendance = attendanceSnapshot.val() || {};
    const members = new Map(toRows(membersSnapshot.val()).map(member => [String(member.id), member]));
    const rows = Object.entries(programs)
      .filter(([, program]) => program && program.deleted !== true)
      .map(([programId, program]) => {
        const seen = new Set();
        const names = Object.entries(attendance[programId] || {}).flatMap(([memberId, record]) => {
          if (record?.status !== "Present") return [];
          const uniqueId = String(record.memberId || memberId);
          if (seen.has(uniqueId)) return [];
          seen.add(uniqueId);
          const name = record.memberName || members.get(uniqueId)?.name || members.get(uniqueId)?.Name || "";
          return name ? [name] : [];
        });
        return { date: String(program.date || ""), title: String(program.programName || program.title || ""), names };
      })
      .sort((a, b) => a.date.localeCompare(b.date))
      .map((program, index) => ({
        "Sl No": index + 1,
        Karyakrama: program.title,
        "Participated Members": program.names.join(", ")
      }));
    if (!rows.length) throw new Error("No attendance programs were found.");
    const worksheet = XLSX.utils.json_to_sheet(rows, { header: ["Sl No", "Karyakrama", "Participated Members"] });
    worksheet["!cols"] = [{ wch: 10 }, { wch: 32 }, { wch: 72 }];
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Attendance");
    XLSX.writeFile(workbook, filenames.attendance);
    status(`Downloaded attendance report with ${rows.length} programs.`);
  }
  async function exportRentalWorkbook(reportType) {
    const category = reportType === "chairTableReport" ? "chairTable" : "speaker";
    const [rentalsSnapshot, historicalSnapshot] = await Promise.all([
      firebaseRead("rentals"),
      firebaseRead("historicalRentals")
    ]);
    const byYear = new Map();
    const addRow = (year, row) => {
      if (!year) return;
      if (!byYear.has(year)) byYear.set(year, []);
      byYear.get(year).push(row);
    };
    const startRows = toRows(rentalsSnapshot.val()).filter(row => row.category === category && row.deleted !== true);
    const currentYears = new Set();
    startRows.forEach(rental => {
      const match = String(rental.startDate || "").match(/^(\d{4})-(\d{2})-\d{2}$/);
      if (!match) return;
      const year = String(Number(match[1]) + (Number(match[2]) >= 4 ? 1 : 0));
      currentYears.add(year);
      const total = rental.totalAmount ?? "";
      const paid = rental.paidAmount ?? "";
      const due = rental.balance ?? (total !== "" && paid !== "" ? Number(total) - Number(paid) : "");
      const state = rental.status || (Number(due) <= 0 ? "PAID" : Number(paid) > 0 ? "PARTIAL" : "PENDING");
      addRow(year, {
        "customer Name": rental.customerName ?? "",
        mobile: rental.mobile ?? "",
        item: rental.item ?? "",
        totalAmount: total,
        paidAmount: paid,
        "Due Amount": due,
        status: state
      });
    });

    const historicalByYear = historicalSnapshot.val() || {};
    Object.entries(historicalByYear).forEach(([year, reports]) => {
      if (currentYears.has(year)) return;
      const report = reports?.[category];
      (Array.isArray(report?.details) ? report.details : []).forEach(detail => {
        const total = detail.amount ?? "";
        const paid = detail.paidAmount ?? (detail.status === "Received" ? total : detail.status ? 0 : "");
        const due = detail.dueAmount ?? (detail.status === "Pending" ? total : total !== "" && paid !== "" ? Number(total) - Number(paid) : "");
        addRow(year, {
          "customer Name": detail.customerName ?? detail.name ?? "",
          mobile: detail.mobile ?? "",
          item: detail.item ?? "",
          totalAmount: total,
          paidAmount: paid,
          "Due Amount": due,
          status: detail.status ?? ""
        });
      });
    });

    const years = [...byYear.keys()].sort((a, b) => Number(b) - Number(a));
    if (!years.length) throw new Error("No rental records were found for this report.");
    const headers = ["Sl No", "customer Name", "mobile", "item", "totalAmount", "paidAmount", "Due Amount", "status"];
    const workbook = XLSX.utils.book_new();
    years.forEach(year => {
      const rows = byYear.get(year).map((record, index) => ({ "Sl No": index + 1, ...record }));
      const worksheet = XLSX.utils.json_to_sheet(rows, { header: headers });
      worksheet["!cols"] = [8, 26, 16, 20, 15, 15, 15, 14].map(wch => ({ wch }));
      XLSX.utils.book_append_sheet(workbook, worksheet, year);
    });
    const filename = reportType === "chairTableReport" ? "Chair_Table_Report.xlsx" : "Speaker_Report.xlsx";
    XLSX.writeFile(workbook, filename);
    status(`Downloaded ${filename} with ${years.length} year sheets.`);
  }
  async function exportExcel() {
    const collection = document.getElementById("firebaseExportCollection")?.value || "members";
    try {
      if (typeof isSupervisorLoggedIn !== "function" || !isSupervisorLoggedIn()) throw new Error("Sign in as an official to export Firebase records.");
      if (!window.XLSX) throw new Error("Excel export library could not be loaded. Check your connection and try again.");
      status("Preparing Excel file…");
      await window.firebaseReady;
      if (collection === "financeReports") {
        await exportFinanceWorkbook();
        return;
      }
      if (collection === "attendance") {
        await exportAttendanceWorkbook();
        return;
      }
      if (collection === "chairTableReport" || collection === "speakerReport") {
        await exportRentalWorkbook(collection);
        return;
      }
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
          "Blood Group": bloodGroupOf(member) || groupByName.get(String(member.name ?? member.Name ?? "").replace(/\([^)]*\)/g, "").toLowerCase().replace(/[^a-z0-9]/g, "")) || ""
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
              "Blood Group": bloodGroupOf(item) || bloodGroupOf(member) || groupByName.get(String(member.name ?? member.Name ?? "").replace(/\([^)]*\)/g, "").toLowerCase().replace(/[^a-z0-9]/g, "")) || "",
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
      if (collection === "meetingAgendas") rows = rows.filter(row => row.deleted !== true);
      if (!rows.length) throw new Error("There are no records to export.");
      if (collection === "members") {
        rows = rows.map(row => Object.fromEntries(memberExportFields.map(([header, getValue]) => [header, getValue(row) ?? ""])));
      } else if (collection === "activityReports") {
        rows = rows.map(item => Object.fromEntries(activityExportFields.map(([header, getValue]) => [header, getValue(item) ?? ""])));
      } else if (collection === "meetingAgendas") {
        rows = rows.map(item => Object.fromEntries(agendaExportFields.map(([header, getValue]) => {
          const value = getValue(item);
          return [header, value && typeof value === "object" ? JSON.stringify(value) : value ?? ""];
        })));
      }
      if (collection !== "members" && collection !== "activityReports" && collection !== "meetingAgendas") rows = flattenForSheet(rows);
      const selectedHeaders = collection === "members"
        ? memberExportFields.map(([header]) => header)
        : collection === "activityReports" ? activityExportFields.map(([header]) => header)
          : collection === "meetingAgendas" ? agendaExportFields.map(([header]) => header) : undefined;
      const worksheet = XLSX.utils.json_to_sheet(rows, selectedHeaders ? { header: selectedHeaders } : undefined);
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, collection === "activityReports" ? "Activity Reports" : collection === "meetingAgendas" ? "Agenda" : collection.slice(0, 31));
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

  window.openCollectionsPage = function () {
    if (history.state?.appView !== "collections") history.pushState({ appView: "collections" }, "", location.pathname + location.search + "#collections");
    if (typeof hideAllViews === "function") hideAllViews();
    document.getElementById("appContainer")?.setAttribute("data-active-view", "collections");
    document.getElementById("dashboardHomeActions")?.classList.add("hidden");
    document.getElementById("collectionsView")?.classList.remove("hidden");
    if (typeof updateAppTopBar === "function") updateAppTopBar("collections");
    if (typeof renderCollectionsPage === "function") void renderCollectionsPage();
    window.scrollTo({ top: 0, behavior: "smooth" });
  };
  window.openExcelExportPage = function () {
    if (history.state?.appView !== "excelExport") history.pushState({ appView: "excelExport" }, "", location.pathname + location.search + "#excelExport");
    if (typeof hideAllViews === "function") hideAllViews();
    document.getElementById("appContainer")?.setAttribute("data-active-view", "excelExport");
    document.getElementById("dashboardHomeActions")?.classList.add("hidden");
    document.getElementById("excelExportView")?.classList.remove("hidden");
    if (typeof updateAppTopBar === "function") updateAppTopBar("excelExport");
    status("");
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

})();
