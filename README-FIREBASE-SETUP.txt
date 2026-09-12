AYFA FIREBASE UPDATE
====================

This update moves Members, Blood Donors and Attendance reads/writes from Google Apps Script/Google Sheets to Firebase Realtime Database for faster website loading.

1) Firebase Authentication
--------------------------
Firebase Console -> Build -> Authentication -> Sign-in method -> Anonymous -> Enable.

2) Import the Excel data
------------------------
Firebase Console -> Realtime Database -> Data -> three-dot menu -> Import JSON.
Select:
    firebase/ayfa-data.json

This JSON contains the 60 Members, 4 Programs and 240 Attendance records from the supplied Excel file.

3) Database Rules
-----------------
The supplied rules file is:
    firebase/firebase-database.rules.json

Use these rules after Anonymous Authentication is enabled. They allow authenticated website users to read/write the database.

4) Website files
----------------
Replace the following in your GitHub website project:
    index.html
    js/members.js
    js/attendance.js
    js/firebase-config.js
    js/finance.js

Keep your existing:
    js/script.js
    css/style.css
    assets/
    components/

The index.html included in this package also contains the current Asset & Inventory and Finance integration from the supplied website version.

IMPORTANT
---------
- Do NOT share Firebase Service Account JSON/private keys.
- The Web App config used here is the browser config.
- Google Sheet can remain as your master/back-up source. This update does not automatically sync future Sheet edits to Firebase.
- If you edit Member details in Google Sheet later, Firebase will need a sync process or a manual import/update.
- The first Firebase migration is intentionally separated from the Google Sheet so website reads are fast.
