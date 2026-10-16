// ============================================================
// AYFA FIREBASE CONFIG
// Fast data source for Members / Blood Donors / Attendance
// ============================================================

const PRODUCTION_FIREBASE_CONFIG = {
  apiKey: "AIzaSyAdOIktZ41SKFIef68uFl6PbbsrwADnEqI",
  authDomain: "al-ameen-website-e24d0.firebaseapp.com",
  databaseURL: "https://al-ameen-website-e24d0-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "al-ameen-website-e24d0",
  storageBucket: "al-ameen-website-e24d0.firebasestorage.app",
  messagingSenderId: "457022225177",
  appId: "1:457022225177:web:8d37682c14fe254aa76388",
  measurementId: "G-F68JPE5G0V"
};

const IS_LOCAL_DEV_HOST = ["localhost", "127.0.0.1", "::1"].includes(location.hostname);
const LOCAL_FIREBASE_CONFIG = IS_LOCAL_DEV_HOST ? window.AYFA_FIREBASE_CONFIG : null;
const LOCAL_APPS_SCRIPT_URL = IS_LOCAL_DEV_HOST ? String(window.AYFA_SCRIPT_URL || "") : "";
const firebaseConfig = IS_LOCAL_DEV_HOST ? LOCAL_FIREBASE_CONFIG : PRODUCTION_FIREBASE_CONFIG;

// Fail closed during local development. Without a separate staging Firebase
// project and matching Apps Script token issuer, never connect local code to
// the production database by accident.
if (IS_LOCAL_DEV_HOST && (!firebaseConfig?.projectId || firebaseConfig.projectId === PRODUCTION_FIREBASE_CONFIG.projectId || !LOCAL_APPS_SCRIPT_URL)) {
  const message = "Local website testing is disabled until a separate staging Firebase project and matching Apps Script URL are configured in js/firebase-config.local.js.";
  console.error(message);
  window.firebaseApp = null;
  window.firebaseDb = null;
  window.firebaseAuth = null;
  window.firebaseReady = Promise.resolve(false);
  window.firebaseConfigError = message;
} else {
  firebase.initializeApp(firebaseConfig);

  window.firebaseApp = firebase.app();
  window.firebaseDb = firebase.database();
  window.firebaseAuth = firebase.auth();

// Persistent email/password authentication is required before the app can
// read protected data. Role grants are stored in protected Realtime Database
// rules and cannot be changed by website users.
  window.firebaseReady = window.firebaseAuth.setPersistence(firebase.auth.Auth.Persistence.LOCAL)
    .then(() => true)
    .catch((error) => {
      console.error("Firebase authentication setup failed:", error);
      throw error;
    });

  window.firebaseAuth.onAuthStateChanged(user => {
    if (!user) return;
    window.firebaseReady.then(async () => {
      try { await loadVerifiedBloodGroups(); } catch (error) { console.warn(error); }
    });
  });
}
