// ============================================================
// AL-AMEEN GOOGLE APPS SCRIPT BACKEND
// Firebase is the live website database; Sheets are backup/export sources.
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
// 3) Sheet edits do not sync to Firebase automatically. Import deliberately.
// ============================================================

const FIREBASE_DATABASE_URL =
  "https://al-ameen-website-e24d0-default-rtdb.asia-southeast1.firebasedatabase.app";

const FIREBASE_WEB_API_KEY = "AIzaSyAdOIktZ41SKFIef68uFl6PbbsrwADnEqI";
function authorizeWebUser_(idToken, allowedRoles) {
  if (!idToken) throw new Error("Sign-in is required.");
  const tokenParts = String(idToken).split(".");
  if (tokenParts.length !== 3) throw new Error("Invalid sign-in token.");
  let claims;
  try {
    let payload = tokenParts[1];
    while (payload.length % 4) payload += "=";
    claims = JSON.parse(Utilities.newBlob(Utilities.base64DecodeWebSafe(payload)).getDataAsString());
  } catch (_) { throw new Error("Invalid sign-in token."); }
  if (!claims.sub) throw new Error("Invalid sign-in token.");

  const verifyResponse = UrlFetchApp.fetch(
    "https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=" + encodeURIComponent(FIREBASE_WEB_API_KEY),
    { method: "post", contentType: "application/json", payload: JSON.stringify({ idToken: idToken }), muteHttpExceptions: true }
  );
  if (verifyResponse.getResponseCode() !== 200) throw new Error("Sign-in token is invalid or expired.");
  const account = (JSON.parse(verifyResponse.getContentText()).users || [])[0];
  if (!account || account.localId !== claims.sub) throw new Error("Sign-in token could not be verified.");

  const role = String(claims.role || "").toLowerCase();
  if (!allowedRoles.includes(role)) throw new Error("This account is not allowed to perform this action.");
  return { uid: account.localId, role: role };
}

function issueRoleCustomToken_(role, password) {
  if (role !== "member" && role !== "official") throw new Error("Choose a valid login type.");
  const properties = PropertiesService.getScriptProperties();
  const expectedPassword = properties.getProperty(role === "member" ? "MEMBER_LOGIN_PASSWORD" : "OFFICIAL_LOGIN_PASSWORD");
  if (!expectedPassword) throw new Error("Login passwords have not been configured in Apps Script.");
  if (String(password || "") !== expectedPassword) throw new Error("Incorrect password. Please try again.");

  const email = properties.getProperty("SERVICE_ACCOUNT_EMAIL");
  const privateKey = properties.getProperty("SERVICE_ACCOUNT_PRIVATE_KEY");
  if (!email || !privateKey) throw new Error("Firebase service-account credentials are missing in Apps Script.");
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: "RS256", typ: "JWT" };
  const claims = {
    iss: email,
    sub: email,
    aud: "https://identitytoolkit.googleapis.com/google.identity.identitytoolkit.v1.IdentityToolkit",
    iat: now,
    exp: now + 3600,
    uid: "ayfa-shared-" + role,
    claims: { role: role }
  };
  const unsignedJwt = base64UrlEncode_(JSON.stringify(header)) + "." + base64UrlEncode_(JSON.stringify(claims));
  const signature = Utilities.computeRsaSha256Signature(unsignedJwt, privateKey.replace(/\\n/g, "\n"));
  return unsignedJwt + "." + base64UrlEncodeBytes_(signature);
}

function doGet(e) {
  try {
    const action = (e && e.parameter && e.parameter.action) || "getMembers";
    authorizeWebUser_(e && e.parameter && e.parameter.authToken, ["member", "official"]);

    switch (action) {
      case "getMembers":
        return jsonOutput(getMembers());
      default:
        return jsonOutput({ error: "Unknown action: " + action });
    }
  } catch (error) {
    return jsonOutput({ success: false, error: error.message, errorType: error.name || "Error" });
  }
}

function doPost(e) {
  try {
    const body = JSON.parse(e.postData.contents || "{}");

    if (body.action === "createRoleToken") {
      return jsonOutput({ success: true, customToken: issueRoleCustomToken_(String(body.role || ""), String(body.password || "")) });
    }

    if (body.action === "listDrivePhotoFolders") {
      authorizeWebUser_(body.authToken, ["member", "official"]);
      return jsonOutput(listDrivePhotoFolders_());
    }

    if (body.action === "uploadDrivePhoto") {
      authorizeWebUser_(body.authToken, ["member", "official"]);
    }

    if (body.action === "uploadDrivePhoto") {
      return jsonOutput(uploadDrivePhoto(body));
    }


    return jsonOutput({ error: "Unknown POST action" });
  } catch (error) {
    return jsonOutput({ success: false, error: error.message, errorType: error.name || "Error" });
  }
}

// Run this once from the Apps Script editor as the deployment owner after
// adding Drive scopes. It triggers the Drive authorization prompt before the
// web app handles photo uploads through DriveApp.
function authorizeDriveAccess_() {
  DriveApp.getRootFolder().getId();
  UrlFetchApp.fetch("https://www.googleapis.com/", { muteHttpExceptions: true });
}

function uploadDrivePhoto(data) {
  try {
    if (!data || !data.base64 || !data.fileName || !data.uploadId) {
      throw new Error("Photo data is required.");
    }

    const rootName = "AYFA Activity Photos";
    const rootFolders = DriveApp.getFoldersByName(rootName);
    const root = rootFolders.hasNext() ? rootFolders.next() : DriveApp.createFolder(rootName);
    const safeFolderName = String(data.folderName || "Activity Report").trim().slice(0, 120);
    const folders = root.getFoldersByName(safeFolderName);
    const folder = folders.hasNext() ? folders.next() : root.createFolder(safeFolderName);
    folder.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
    const uploadMarker = "AYFA_UPLOAD_ID:" + String(data.uploadId).slice(0, 128);
    const lock = LockService.getScriptLock();
    if (!lock.tryLock(30000)) throw new Error("Another photo upload is in progress. Retry this photo shortly.");
    try {
      const existingFiles = folder.getFilesByName(String(data.fileName).slice(0, 180));
      while (existingFiles.hasNext()) {
        const existing = existingFiles.next();
        if (existing.getDescription() === uploadMarker) {
          return drivePhotoResult_(existing, folder, true);
        }
      }

      const bytes = Utilities.base64Decode(data.base64);
      const blob = Utilities.newBlob(bytes, data.mimeType || "image/jpeg", data.fileName);
      const file = folder.createFile(blob);
      file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
      file.setDescription(uploadMarker);
      return drivePhotoResult_(file, folder, false);
    } finally {
      lock.releaseLock();
    }
  } catch (error) {
    return {
      success: false,
      error: error.message || String(error),
      errorType: error.name || "Error"
    };
  }
}

function drivePhotoResult_(file, folder, reused) {
  return {
    success: true,
    fileId: file.getId(),
    fileName: file.getName(),
    folderId: folder.getId(),
    folderUrl: folder.getUrl(),
    imageUrl: "https://drive.google.com/uc?export=view&id=" + file.getId(),
    thumbnailUrl: "https://drive.google.com/thumbnail?id=" + file.getId() + "&sz=w1200",
    webViewLink: file.getUrl(),
    reused: Boolean(reused)
  };
}

function listDrivePhotoFolders_() {
  const rootName = "AYFA Activity Photos";
  const roots = DriveApp.getFoldersByName(rootName);
  if (!roots.hasNext()) return { success: true, folders: [] };
  const root = roots.next();
  const folders = [];
  const iterator = root.getFolders();
  while (iterator.hasNext()) {
    const folder = iterator.next();
    try { folder.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW); } catch (sharingError) { console.warn("Folder sharing could not be updated: " + sharingError); }
    const photoIterator = folder.getFiles();
    const photos = [];
    while (photoIterator.hasNext()) {
      const file = photoIterator.next();
      if (!String(file.getMimeType() || "").startsWith("image/")) continue;
      try { file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW); } catch (sharingError) { console.warn("Photo sharing could not be updated: " + sharingError); }
      photos.push({
        fileId: file.getId(),
        fileName: file.getName(),
        imageUrl: "https://drive.google.com/uc?export=view&id=" + file.getId(),
        thumbnailUrl: "https://drive.google.com/thumbnail?id=" + file.getId() + "&sz=w1200",
        webViewLink: file.getUrl()
      });
    }
    folders.push({ id: folder.getId(), name: folder.getName(), folderUrl: folder.getUrl(), photos: photos });
  }
  return { success: true, folders: folders };
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

function syncAllToFirebase() {
  throw new Error("Sheet-to-Firebase imports are disabled to protect live website data. Review and migrate records with a staged, ID-only process.");
}

// Create a read-only full Realtime Database snapshot in Google Drive.
function backupFirebaseDatabaseToDrive() {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(30000)) throw new Error("A Firebase backup is already running.");
  try {
    const token = getFirebaseAccessToken_();
    const url = FIREBASE_DATABASE_URL.replace(/\/$/, "") + "/.json?access_token=" + encodeURIComponent(token);
    const response = UrlFetchApp.fetch(url, { method: "get", muteHttpExceptions: true });
    const code = response.getResponseCode();
    if (code < 200 || code >= 300) throw new Error("Firebase backup read failed (" + code + "): " + response.getContentText().slice(0, 500));

    const databaseJson = response.getContentText();
    if (!databaseJson || databaseJson === "null") throw new Error("Firebase returned an empty database; backup was not created.");
    JSON.parse(databaseJson);

    const date = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "yyyy-MM-dd_HH-mm-ss");
    const fileName = "al-ameen-firebase-backup-" + date + ".json";
    const folderId = PropertiesService.getScriptProperties().getProperty("FIREBASE_BACKUP_FOLDER_ID");
    const file = folderId
      ? DriveApp.getFolderById(folderId).createFile(fileName, databaseJson, MimeType.JSON)
      : DriveApp.createFile(fileName, databaseJson, MimeType.JSON);
    console.log("Firebase backup created: " + file.getName() + " (" + file.getId() + ", " + databaseJson.length + " characters)");
    return file.getId();
  } finally {
    lock.releaseLock();
  }
}

function setupNightlyFirebaseBackupTrigger() {
  // Install the replacement first so a creation/authorization error cannot
  // accidentally leave the project without its existing nightly backup.
  const replacement = ScriptApp.newTrigger("backupFirebaseDatabaseToDrive")
    .timeBased()
    .everyDays(1)
    .atHour(2)
    .create();
  const replacementId = replacement.getUniqueId();
  ScriptApp.getProjectTriggers().forEach(trigger => {
    if (trigger.getHandlerFunction() === "backupFirebaseDatabaseToDrive" && trigger.getUniqueId() !== replacementId) {
      ScriptApp.deleteTrigger(trigger);
    }
  });
  return "Nightly Firebase Drive backup scheduled for 2:00 AM in the Apps Script project timezone.";
}

// ============================================================
// SHEET EDIT NOTICE TRIGGER (no Firebase writes)
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
    if (["Members", "Programs", "Attendance"].includes(sheetName)) {
      console.log("Sheet backup changed in " + sheetName + ". Review and explicitly import to Firebase if appropriate.");
    }
  } catch (error) {
    console.error("Firebase sync error: " + error.message);
  }
}

function setupFirebaseSyncTrigger() {
  // Install the real handler once. It only logs backup changes; Firebase
  // remains the website master and cannot be overwritten by stale sheet rows.
  ScriptApp.getProjectTriggers().forEach(trigger => {
    if (trigger.getHandlerFunction() === "onSheetEditInstalled_" || trigger.getHandlerFunction() === "onSheetEditFirebase") {
      ScriptApp.deleteTrigger(trigger);
    }
  });
  ScriptApp.newTrigger("onSheetEditFirebase")
    .forSpreadsheet(SpreadsheetApp.getActive())
    .onEdit()
    .create();

  return "Sheet-change notice trigger installed. Firebase writes remain explicit imports.";
}
