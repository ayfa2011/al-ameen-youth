// ============================================================
// AYFA FIREBASE CONFIG
// Fast data source for Members / Blood Donors / Attendance
// ============================================================

const firebaseConfig = {
  apiKey: "AIzaSyAdOIktZ41SKFIef68uFl6PbbsrwADnEqI",
  authDomain: "al-ameen-website-e24d0.firebaseapp.com",
  databaseURL: "https://al-ameen-website-e24d0-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "al-ameen-website-e24d0",
  storageBucket: "al-ameen-website-e24d0.firebasestorage.app",
  messagingSenderId: "457022225177",
  appId: "1:457022225177:web:8d37682c14fe254aa76388",
  measurementId: "G-F68JPE5G0V"
};

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
