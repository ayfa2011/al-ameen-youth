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
window.firebaseStorage = firebase.storage();
window.firebaseAuth = firebase.auth();

// Anonymous sign-in keeps the database from being completely public.
// Enable Authentication > Sign-in method > Anonymous in Firebase Console.
window.firebaseReady = window.firebaseAuth.signInAnonymously()
  .then(() => {
    console.log("Firebase connected successfully.");
    return true;
  })
  .catch((error) => {
    console.error("Firebase authentication failed:", error);
    throw error;
  });
