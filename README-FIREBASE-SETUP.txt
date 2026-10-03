AYFA FIREBASE AND ROLE LOGIN SETUP
==================================

This update moves Members, Blood Donors and Attendance reads/writes from Google Apps Script/Google Sheets to Firebase Realtime Database for faster website loading.

1) Apps Script login setup
--------------------------
The website offers two shared-password sign-ins. The passwords are checked in
Google Apps Script and are not included in the website JavaScript:

  MEMBER_LOGIN_PASSWORD = [set the agreed member password]
  OFFICIAL_LOGIN_PASSWORD = [set the agreed officials password]

In the Apps Script project used by this website, open Project Settings ->
Script Properties and add those two properties. Keep the existing
SERVICE_ACCOUNT_EMAIL and SERVICE_ACCOUNT_PRIVATE_KEY properties in place.
Do not paste service-account private keys or the shared passwords into the
website source or a public repository.

Deploy the updated Apps Script as a web app, executing as the owner and
available to anyone so the login screen can request a role token. The script
checks the selected password server-side, then signs a short-lived Firebase
custom token. Keep the existing web app URL if possible; otherwise update
SCRIPT_URL in js/script.js to the new /exec URL. Deploy this backend before
publishing the website changes.

2) Firebase Authentication
--------------------------
The site signs in with Firebase custom tokens. Anonymous sign-in is no longer
used by the website. You do not need to create separate email/password
accounts. The Firebase project must remain the same project as the configured
service account and web app.

3) Database Rules
-----------------
The supplied rules file is:
    firebase/firebase-database.rules.json

Publish these rules in Firebase Console -> Realtime Database -> Rules when you
publish the website. Members can read approved website data but cannot write.
Officials can read and write. Rules also reject requests more than one hour
after Firebase sign-in, even if a browser keeps an old page open. Do not restore
a root-level auth-only read/write rule, because that would override these role
restrictions.

4) Google Apps Script deployment
---------------------------------
The Apps Script now checks Firebase ID tokens and role claims for the website's
protected read/write endpoints, including Agenda sync and activity-photo
uploads. Deploy the updated script version before publishing the new website.
When ready to switch over, publish the website and these Realtime Database
rules together so the existing open rules do not remain active. The existing
service-account properties are used to sign login tokens and continue the
spreadsheet sync.

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
browse existing folders and officials can cache legacy folder metadata.

Meeting Agenda reads and writes now use /meetingAgendas in Firebase. To bring
over legacy Sheet-only agenda rows, sign in as an official and use the
"Import legacy records" action on the Agenda page. It saves the current
Firebase agenda data under /meetingAgendasMigrationBackups before importing;
existing Firebase IDs are kept and not overwritten. Leave the original Sheet
untouched until the imported records are checked in both roles.

IMPORTANT
---------
- Do NOT share Firebase Service Account JSON/private keys.
- The Web App config used here is the browser config.
- Google Sheet can remain as your master/back-up source. This update does not automatically sync future Sheet edits to Firebase.
- If you edit Member details in Google Sheet later, Firebase will need a sync process or a manual import/update.
- The first Firebase migration is intentionally separated from the Google Sheet so website reads are fast.
