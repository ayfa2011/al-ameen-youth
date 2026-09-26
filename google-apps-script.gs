// ============================================================
// AL-AMEEN GOOGLE APPS SCRIPT BACKEND
// Google Sheet -> Firebase near-real-time sync
// ============================================================
//
// SHEETS:
//   Members
//   Programs
//   Attendance
//
// WEBSITE:
//   Reads Members / Attendance from Firebase.
//
// IMPORTANT:
// 1) Do NOT put the Firebase service-account private key in the
//    website or GitHub.
// 2) Store SERVICE_ACCOUNT_PRIVATE_KEY and SERVICE_ACCOUNT_EMAIL
//    in Apps Script > Project Settings > Script properties.
// 3) Install the onEdit trigger once using setupFirebaseSyncTrigger().
// ============================================================

const FIREBASE_DATABASE_URL =
  "https://al-ameen-website-e24d0-default-rtdb.asia-southeast1.firebasedatabase.app";

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
      case "getAgendas":
        return jsonOutput(getAgendas_());
      default:
        return jsonOutput({ error: "Unknown action: " + action });
    }
  } catch (error) {
    return jsonOutput({ success: false, error: error.message, errorType: error.name || "Error", stack: error.stack || "" });
  }
}

function doPost(e) {
  try {
    const body = JSON.parse(e.postData.contents || "{}");

    if (body.action === "uploadDrivePhoto") {
      return jsonOutput(uploadDrivePhoto(body));
    }

    if (body.action === "saveAttendance") {
      const result = saveAttendance(body);
      // Keep Firebase in sync when attendance is added through the website.
      syncProgramsToFirebase_();
      syncAttendanceToFirebase_();
      return jsonOutput(result);
    }

    if (body.action === "saveAgenda") return jsonOutput(saveAgenda_(body.agenda || {}));
    if (body.action === "deleteAgenda") return jsonOutput(deleteAgenda_(body.id));
    if (body.action === "syncAgendas") return jsonOutput(syncExistingAgendasToSheet_(body.agendas || []));

    return jsonOutput({ error: "Unknown POST action" });
  } catch (error) {
    return jsonOutput({ success: false, error: error.message, errorType: error.name || "Error", stack: error.stack || "" });
  }
}

function getOrCreateAgendaSheet_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName("Agenda");
  if (!sheet) sheet = ss.insertSheet("Agenda");
  const headers = ["ID", "ಸಭೆಯ ದಿನಾಂಕ", "ಅಜೆಂಡಾ / ವಿಷಯ", "ವಿವರ", "ಸ್ಥಿತಿ", "ನಿರ್ಣಯ", "ಜಾರಿಯಾದ ದಿನಾಂಕ", "Priority", "ಜವಾಬ್ದಾರಿ", "ಗುರಿ ದಿನಾಂಕ", "Created At", "Updated At"];
  if (sheet.getLastRow() === 0) sheet.appendRow(headers);
  else if (String(sheet.getRange(1, 1).getValue()).trim() !== "ID") sheet.insertRowBefore(1), sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
  return sheet;
}

function syncExistingAgendasToSheet_(items) {
  const sheet = getOrCreateAgendaSheet_();
  const rows = sheet.getDataRange().getDisplayValues();
  const known = new Set(rows.slice(1).map(row => String(row[0])));
  (items || []).forEach(item => {
    if (!item || !item.id || known.has(String(item.id)) || !item.title || !item.meetingDate) return;
    sheet.appendRow([String(item.id), item.meetingDate || "", item.title || "", item.description || "", item.status || "Upcoming", item.decision || "", item.implementedDate || "", item.priority || "Normal", item.responsible || "", item.targetDate || "", item.createdAt || "", item.updatedAt || ""]);
    known.add(String(item.id));
  });
  return { success: true };
}

function getAgendas_() {
  const sheet = getOrCreateAgendaSheet_();
  const values = sheet.getDataRange().getDisplayValues();
  if (values.length < 2) return [];
  const headers = values[0].map(value => String(value).trim());
  return values.slice(1).filter(row => row[0]).map(row => {
    const item = {};
    headers.forEach((header, index) => { if (header) item[header] = row[index] || ""; });
    return { id: String(item.ID), meetingDate: item["ಸಭೆಯ ದಿನಾಂಕ"], title: item["ಅಜೆಂಡಾ / ವಿಷಯ"], description: item["ವಿವರ"], status: item["ಸ್ಥಿತಿ"], decision: item["ನಿರ್ಣಯ"], implementedDate: item["ಜಾರಿಯಾದ ದಿನಾಂಕ"], priority: item.Priority, responsible: item["ಜವಾಬ್ದಾರಿ"], targetDate: item["ಗುರಿ ದಿನಾಂಕ"], createdAt: item["Created At"], updatedAt: item["Updated At"], decisionStatus: item["ಸ್ಥಿತಿ"] === "Completed" ? "Completed" : "Pending" };
  });
}

function saveAgenda_(item) {
  if (!item.id || !item.title || !item.meetingDate) throw new Error("Agenda ID, title and meeting date are required.");
  const sheet = getOrCreateAgendaSheet_();
  const rows = sheet.getDataRange().getDisplayValues();
  const index = rows.findIndex((row, i) => i > 0 && String(row[0]) === String(item.id));
  const row = [String(item.id), item.meetingDate || "", item.title || "", item.description || "", item.status || "Upcoming", item.decision || "", item.implementedDate || "", item.priority || "Normal", item.responsible || "", item.targetDate || "", item.createdAt || "", item.updatedAt || new Date().toISOString()];
  if (index > 0) sheet.getRange(index + 1, 1, 1, row.length).setValues([row]); else sheet.appendRow(row);
  return { success: true, id: String(item.id) };
}

function deleteAgenda_(id) {
  if (!id) throw new Error("Agenda ID is required.");
  const sheet = getOrCreateAgendaSheet_();
  const rows = sheet.getDataRange().getDisplayValues();
  const index = rows.findIndex((row, i) => i > 0 && String(row[0]) === String(id));
  if (index > 0) sheet.deleteRow(index + 1);
  return { success: true, id: String(id) };
}


function uploadDrivePhoto(data) {
  try {
    if (!data || !data.base64 || !data.fileName) {
      throw new Error("Photo data is required.");
    }

    const rootName = "AYFA Activity Photos";
    const rootFolders = DriveApp.getFoldersByName(rootName);
    const root = rootFolders.hasNext() ? rootFolders.next() : DriveApp.createFolder(rootName);
    const safeFolderName = String(data.folderName || "Activity Report").trim().slice(0, 120);
    const folders = root.getFoldersByName(safeFolderName);
    const folder = folders.hasNext() ? folders.next() : root.createFolder(safeFolderName);

    const bytes = Utilities.base64Decode(data.base64);
    const blob = Utilities.newBlob(bytes, data.mimeType || "image/jpeg", data.fileName);
    const file = folder.createFile(blob);

    return {
      success: true,
      fileId: file.getId(),
      fileName: file.getName(),
      folderUrl: folder.getUrl()
    };
  } catch (error) {
    return {
      success: false,
      error: error.message || String(error),
      errorType: error.name || "Error",
      stack: error.stack || ""
    };
  }
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
    attendance
      .getRange(attendance.getLastRow() + 1, 1, rows.length, 3)
      .setValues(rows);
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
    const records = attendance.filter(
      row => String(row["ProgramID"] || "") === id
    );
    const present = records.filter(
      row => String(row["Status"] || "").toLowerCase() === "present"
    );

    return {
      slNo: index + 1,
      programId: id,
      programName: program["ProgramName"] || "",
      date: program["Date"] || "",
      presentCount: present.length,
      membersList: present
        .map(row => row["MemberName"] || "")
        .filter(Boolean)
        .join(", ")
    };
  }).reverse();
}

// ============================================================
// FIREBASE AUTHENTICATION
// Uses a Google service account + OAuth2 JWT.
// Private key stays inside Apps Script Script Properties.
// ============================================================

function getFirebaseAccessToken_() {
  const props = PropertiesService.getScriptProperties();
  const email = props.getProperty("SERVICE_ACCOUNT_EMAIL");
  const privateKey = props.getProperty("SERVICE_ACCOUNT_PRIVATE_KEY");

  if (!email || !privateKey) {
    throw new Error(
      "Firebase service-account credentials are missing. " +
      "Set SERVICE_ACCOUNT_EMAIL and SERVICE_ACCOUNT_PRIVATE_KEY " +
      "in Apps Script Script Properties."
    );
  }

  const now = Math.floor(Date.now() / 1000);

  const header = {
    alg: "RS256",
    typ: "JWT"
  };

  const claim = {
    iss: email,
    scope: "https://www.googleapis.com/auth/firebase.database https://www.googleapis.com/auth/userinfo.email",
    aud: "https://oauth2.googleapis.com/token",
    iat: now,
    exp: now + 3600
  };

  const encodedHeader = base64UrlEncode_(JSON.stringify(header));
  const encodedClaim = base64UrlEncode_(JSON.stringify(claim));
  const unsignedJwt = encodedHeader + "." + encodedClaim;

  const signatureBytes = Utilities.computeRsaSha256Signature(
    unsignedJwt,
    privateKey.replace(/\\n/g, "\n")
  );

  const jwt = unsignedJwt + "." + base64UrlEncodeBytes_(signatureBytes);

  const response = UrlFetchApp.fetch("https://oauth2.googleapis.com/token", {
    method: "post",
    contentType: "application/x-www-form-urlencoded",
    payload: {
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: jwt
    },
    muteHttpExceptions: true
  });

  const code = response.getResponseCode();
  const body = response.getContentText();

  if (code !== 200) {
    throw new Error("Google OAuth token error (" + code + "): " + body);
  }

  const tokenData = JSON.parse(body);
  if (!tokenData.access_token) {
    throw new Error("No Firebase access token returned.");
  }

  return tokenData.access_token;
}

function base64UrlEncode_(text) {
  return Utilities.base64EncodeWebSafe(
    Utilities.newBlob(text).getBytes()
  ).replace(/=+$/, "");
}

function base64UrlEncodeBytes_(bytes) {
  return Utilities.base64EncodeWebSafe(bytes).replace(/=+$/, "");
}

// ============================================================
// FIREBASE WRITE HELPERS
// ============================================================

function firebasePut_(path, data) {
  const token = getFirebaseAccessToken_();
  const url =
    FIREBASE_DATABASE_URL.replace(/\/$/, "") +
    "/" + path.replace(/^\/|\/$/g, "") +
    ".json?access_token=" +
    encodeURIComponent(token);

  const response = UrlFetchApp.fetch(url, {
    method: "put",
    contentType: "application/json",
    payload: JSON.stringify(data),
    muteHttpExceptions: true
  });

  const code = response.getResponseCode();
  const body = response.getContentText();

  if (code < 200 || code >= 300) {
    throw new Error(
      "Firebase write failed (" + code + ") at /" + path + ": " + body
    );
  }

  return body;
}

// ============================================================
// SHEET -> FIREBASE SYNC
// ============================================================

function syncMembersToFirebase_() {
  const members = rowsAsObjects("Members");

  // Use the same numeric row keys as the imported Firebase data:
  // members/1, members/2, members/3, ...
  const data = {};

  members.forEach((member, index) => {
    data[String(index + 1)] = member;
  });

  firebasePut_("members", data);
}

function syncProgramsToFirebase_() {
  const programs = rowsAsObjects("Programs");
  const data = {};

  programs.forEach((program, index) => {
    const id = String(
      program["ProgramID"] ||
      program["programId"] ||
      ("P" + (index + 1))
    ).trim();

    data[id] = program;
  });

  firebasePut_("programs", data);
}

function syncAttendanceToFirebase_() {
  const attendance = rowsAsObjects("Attendance");
  const data = {};

  // Keep each attendance record as a stable numeric key.
  attendance.forEach((row, index) => {
    data[String(index + 1)] = row;
  });

  firebasePut_("attendanceRecords", data);
}

// Full sync: run this once after credentials are configured.
function syncAllToFirebase() {
  syncMembersToFirebase_();
  syncProgramsToFirebase_();
  syncAttendanceToFirebase_();

  return "Firebase sync completed successfully.";
}

// ============================================================
// NEAR-REAL-TIME SHEET EDIT TRIGGER
// ============================================================
//
// IMPORTANT:
// A simple onEdit(e) trigger cannot reliably use services that
// require authorization. We therefore install an installable
// trigger from setupFirebaseSyncTrigger().
//
// Any edit in Members / Programs / Attendance triggers a sync.
// For a small internal database this is fast and reliable.
// ============================================================

function onSheetEditFirebase(e) {
  try {
    if (!e || !e.range) return;

    const sheetName = e.range.getSheet().getName();

    if (sheetName === "Members") {
      syncMembersToFirebase_();
    } else if (sheetName === "Programs") {
      syncProgramsToFirebase_();
    } else if (sheetName === "Attendance") {
      syncAttendanceToFirebase_();
    }
  } catch (error) {
    console.error("Firebase sync error: " + error.message);
  }
}

function setupFirebaseSyncTrigger() {
  // Remove duplicate triggers created by previous setup attempts.
  ScriptApp.getProjectTriggers().forEach(trigger => {
    if (trigger.getHandlerFunction() === "onSheetEditInstalled_") {
      ScriptApp.deleteTrigger(trigger);
    }
  });

  ScriptApp.newTrigger("onSheetEditInstalled_")
    .forSpreadsheet(SpreadsheetApp.getActive())
    .onEdit()
    .create();

  return "Firebase Sheet edit trigger installed.";
}
