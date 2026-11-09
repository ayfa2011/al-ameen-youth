AYFA FIREBASE AND ROLE LOGIN SETUP
==================================

This update moves Members, Blood Donors and Attendance reads/writes from Google Apps Script/Google Sheets to Firebase Realtime Database for faster website loading.

1) Google sign-in setup
--------------------------
Enable Google as a sign-in provider in Firebase Console -> Authentication ->
Sign-in method for Member login. Add each production and local/staging website
host under Authentication -> Settings -> Authorized domains.

Members sign in with any Google account and have read-only access. Admin &
Incharges continue to sign in using the shared password stored in the Apps
Script property OFFICIAL_LOGIN_PASSWORD; anyone with this password can edit
website records.

Deploy the updated Apps Script as a web app, executing as the owner and
available to anyone so the login screen can exchange a verified Google
Firebase ID token for a Member role token and check the Admin & Incharges
password server-side. Keep the existing web app URL if possible; otherwise
update SCRIPT_URL in js/script.js to the new /exec URL. Preserve
OFFICIAL_LOGIN_PASSWORD, SERVICE_ACCOUNT_EMAIL and
SERVICE_ACCOUNT_PRIVATE_KEY in Apps Script Script Properties; never add the
password or private key to the website source or repository. Deploy Apps
Script before publishing the website.

2) Firebase Authentication
--------------------------
Members first sign in with Google, then Apps Script verifies the Firebase ID
token and issues a Member role token. Admin & Incharges use the configured
shared password to receive an Admin role token. The Google account's name and
photo are shown in More -> Profile for Member sessions. The Firebase project
must remain the same project as the configured service account and web app.

3) Database Rules
-----------------
The supplied rules file is:
    firebase/firebase-database.rules.json

Publish these rules in Firebase Console -> Realtime Database -> Rules when you
publish the website. Members can read approved website data but cannot write.
Admin & Incharges can read and write. Authenticated sessions stay active on the same
device until the user logs out or the Firebase refresh token is revoked. Do not
restore a root-level auth-only read/write rule, because that would override
these role restrictions.

4) Google Apps Script deployment
---------------------------------
The Apps Script checks Firebase ID tokens and role claims for protected
endpoints, including Google role-token issuance, Agenda compatibility and
activity-photo uploads. Deploy the updated script version before publishing
the website. When ready to switch over, publish the website and these
Realtime Database rules together so the existing open rules do not remain
active. The existing service-account properties sign role tokens and continue
the spreadsheet sync.

5) Website files
----------------
Replace the following in your GitHub website project:
    index.html
    js/supervisor.js
    js/script.js
    js/rentals.js
    js/activity-reports.js
    js/agenda.js
    js/attendance.js
    js/members.js
    js/firebase-config.js
    firebase/firebase-database.rules.json
    google-apps-script.gs

The current website also stores Drive photo gallery metadata at
Realtime Database path /drivePhotoFolders. Publish the supplied rules before
using the gallery. The Apps Script now exposes an authenticated
listDrivePhotoFolders action; redeploy it as a new version so members can
browse existing folders and Admin & Incharges can cache legacy folder metadata.

Meeting Agenda reads and writes now use /meetingAgendas in Firebase. To bring
over legacy Sheet-only agenda rows, sign in as Admin & Incharges and use the
"Import legacy records" action on the Agenda page. It saves the current
Firebase agenda data under /meetingAgendasMigrationBackups before importing;
existing Firebase IDs are kept and not overwritten. Leave the original Sheet
untouched until the imported records are checked in both roles.

IMPORTANT
---------
- Do NOT share Firebase Service Account JSON/private keys.
- The Web App config used here is the browser config.
- Firebase is the live website master database. Google Sheets are not a live backup: this site does not write changes back to Sheets, and edits to Sheets do not update Firebase automatically. Export Firebase data regularly and verify the export before treating Sheets as a backup.
- `setupFirebaseSyncTrigger()` installs a sheet-change notice trigger only. It never overwrites Firebase.
- Sheet-to-Firebase imports are disabled; `syncAllToFirebase()` and its helper functions now throw to protect the live database.
- Attendance records use the website's canonical `/attendance/{programId}/{memberId}` path.
- The old row-position member IDs cannot be safely mapped to permanent IDs from code alone. Assign permanent IDs and reconcile existing references before importing or migrating legacy records.

Reference data migration
------------------------
The website now reads its read-only reference data from Firebase paths
`/officeBearers/{year}`, `/financeReports/{year}`, `/assets`,
`/historicalRentals/{year}`, and `/bloodGroups/{memberName}` after sign-in.
The former checked-in reference values were restored to these Firebase paths
using scoped Console imports on 2026-10-16. The import only targeted reference
paths confirmed empty beforehand; member, attendance, donation, agenda, and
activity-report collections were left untouched. Publish the supplied rules
with the site. These paths grant authenticated member/Admin & Incharges reads and deny
client writes. The unused `components/` HTML fragments are not loaded by the site.

Data protection workflow
------------------------
- Create a separate Firebase project for staging. Configure staging website and
  Apps Script copies to point only at that project; deploy staging-only rules
  and synthetic test records. Never test destructive actions against production.
- `backupFirebaseDatabaseToDrive()` reads the full Realtime Database and saves
  a dated JSON file in Drive. Optionally set the `FIREBASE_BACKUP_FOLDER_ID`
  Apps Script property. Review the Apps Script project timezone, run the backup
  function manually once, and verify the Drive file before running
  `setupNightlyFirebaseBackupTrigger()` once. It schedules a daily run around
  2:00 AM in that timezone. The code does not restore data automatically.
- `syncAllToFirebase()` and the underlying sheet import helpers now throw and
  cannot write stale Sheet rows into Firebase.
- Deletions remain soft (`deleted: true`). Rental edits and payments use
  transactions and reject a stale `updatedAt` version.
- Keep each future change on a descriptive `codex/` branch and review it in
  staging before merging.
