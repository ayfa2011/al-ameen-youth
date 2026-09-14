// ============================================================
// AL-AMEEN GOOGLE APPS SCRIPT BACKEND
// ============================================================
// Google Sheet must contain these EXACT sheet names:
// 1. Members
// 2. Programs
// 3. Attendance
//
// Paste this complete code into Extensions > Apps Script.
// Then Deploy > New deployment > Web app.
// Execute as: Me
// Who has access: Anyone
// ============================================================

function doGet(e) {
  try {
    const action = (e && e.parameter && e.parameter.action) || "getMembers";

    switch (action) {
      case "getMembers":
        return jsonOutput(getMembers());
      case "getPrograms":
        return jsonOutput(getPrograms());
      case "getReports":
        return jsonOutput(getAttendanceReports());
      default:
        return jsonOutput({ error: "Unknown action: " + action });
    }
  } catch (error) {
    return jsonOutput({ error: error.message });
  }
}

function doPost(e) {
  try {
    const body = JSON.parse(e.postData.contents || "{}");

    if (body.action === "saveAttendance") {
      return jsonOutput(saveAttendance(body));
    }

    if (body.action === "uploadDrivePhoto") {
      return jsonOutput(uploadDrivePhoto(body));
    }

    return jsonOutput({ error: "Unknown POST action" });
  } catch (error) {
    return jsonOutput({ error: error.message });
  }
}

// Creates a central AYFA Activity Photos folder and one folder for each report.
// Files arrive from the website as base64 and are saved directly to Google Drive.
function uploadDrivePhoto(data) {
  if (!data.base64 || !data.fileName) throw new Error("Photo data is required.");

  const rootName = "AYFA Activity Photos";
  const rootFolders = DriveApp.getFoldersByName(rootName);
  const root = rootFolders.hasNext() ? rootFolders.next() : DriveApp.createFolder(rootName);
  const safeFolderName = String(data.folderName || "Activity Report").slice(0, 120);
  const folders = root.getFoldersByName(safeFolderName);
  const folder = folders.hasNext() ? folders.next() : root.createFolder(safeFolderName);
  const bytes = Utilities.base64Decode(data.base64);
  const blob = Utilities.newBlob(bytes, data.mimeType || "image/jpeg", data.fileName);
  const file = folder.createFile(blob);

  return { success: true, fileId: file.getId(), folderUrl: folder.getUrl() };
}

function jsonOutput(data) {
  return ContentService
    .createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}

function getSheet(name) {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(name);
  if (!sheet) throw new Error("Sheet not found: " + name);
  return sheet;
}

function rowsAsObjects(sheetName) {
  const sheet = getSheet(sheetName);
  const values = sheet.getDataRange().getDisplayValues();
  if (!values.length) return [];

  const headers = values[0].map(h => String(h).trim());
  return values.slice(1)
    .filter(row => row.some(cell => String(cell).trim() !== ""))
    .map(row => {
      const obj = {};
      headers.forEach((header, i) => {
        if (header) obj[header] = row[i] ?? "";
      });
      return obj;
    });
}

function getMembers() {
  return rowsAsObjects("Members");
}

function getPrograms() {
  return rowsAsObjects("Programs");
}

function saveAttendance(data) {
  if (!data.programName || !data.date) {
    throw new Error("Program name and date are required.");
  }

  if (!Array.isArray(data.members) || data.members.length === 0) {
    throw new Error("At least one member is required.");
  }

  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const programs = getSheet("Programs");
  const attendance = getSheet("Attendance");

  const programId = "P" + new Date().getTime();
  programs.appendRow([programId, data.programName, data.date]);

  const allMembers = getMembers();
  const selected = new Set(data.members.map(String));
  const rows = allMembers.map(member => [
    programId,
    member["Name"] || "",
    selected.has(String(member["Name"] || "")) ? "Present" : "Absent"
  ]);

  if (rows.length) {
    attendance.getRange(attendance.getLastRow() + 1, 1, rows.length, 3).setValues(rows);
  }

  return {
    success: true,
    programId: programId,
    presentCount: data.members.length
  };
}

function getAttendanceReports() {
  const programs = rowsAsObjects("Programs");
  const attendance = rowsAsObjects("Attendance");

  return programs.map((program, index) => {
    const id = String(program["ProgramID"] || "");
    const records = attendance.filter(row => String(row["ProgramID"] || "") === id);
    const present = records.filter(row => String(row["Status"] || "").toLowerCase() === "present");

    return {
      slNo: index + 1,
      programId: id,
      programName: program["ProgramName"] || "",
      date: program["Date"] || "",
      presentCount: present.length,
      membersList: present.map(row => row["MemberName"] || "").filter(Boolean).join(", ")
    };
  }).reverse();
}
