// Copy this file to firebase-config.local.js and fill it with STAGING values.
// firebase-config.local.js is ignored by Git and must never contain production
// credentials or passwords.
window.AYFA_FIREBASE_CONFIG = {
  apiKey: "STAGING_WEB_API_KEY",
  authDomain: "STAGING_PROJECT_ID.firebaseapp.com",
  databaseURL: "https://STAGING_DATABASE_URL",
  projectId: "STAGING_PROJECT_ID",
  storageBucket: "STAGING_PROJECT_ID.firebasestorage.app",
  messagingSenderId: "STAGING_SENDER_ID",
  appId: "STAGING_APP_ID"
};

// This must be a staging Apps Script deployment that issues custom tokens
// for the same staging Firebase project above.
window.AYFA_SCRIPT_URL = "STAGING_APPS_SCRIPT_EXEC_URL";
