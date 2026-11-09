// HANGOUT — Firebase connections.
// Reuse the main Firebase database for an already signed-in Google member;
// keep the named app for standalone Hangout sign-in sessions.
// No Google-login code (hangout-auth.js) and no database paths
// (hangout.repository.js) belong in this file.
window.HangoutFirebase = (() => {
  const APP_NAME = "hangout";
  let app = null;
  let timeOffset = 0;

  function get() {
    if (app) return app;
    const options = window.firebaseApp?.options;
    if (!options) return null; // e.g. localhost without staging config
    try { app = firebase.app(APP_NAME); }
    catch (error) { app = firebase.initializeApp(options, APP_NAME); }
    return app;
  }

  return Object.freeze({
    app: get,
    isAvailable: () => Boolean(get()),
    unavailableMessage: () => window.firebaseConfigError || "Hangout is not available in this environment.",
    mainAuth: () => window.firebaseAuth || null,
    mainDb: () => window.firebaseDb || null,
    auth: () => { const a = get(); return a ? firebase.auth(a) : null; },
    db: () => {
      if (window.HangoutAuth?.isUsingMainSession()) return window.firebaseDb || null;
      const a = get();
      return a ? firebase.database(a) : null;
    },
    serverTimestamp: () => firebase.database.ServerValue.TIMESTAMP,
    serverNow: async () => {
      const database = window.HangoutFirebase.db();
      if (!database) throw new Error("Firebase is unavailable.");
      const snapshot = await database.ref(".info/serverTimeOffset").once("value");
      return Date.now() + (Number(snapshot.val()) || 0);
    },
    watchServerTime(onChange) {
      const database = window.HangoutFirebase.db();
      if (!database) throw new Error("Firebase is unavailable.");
      const ref = database.ref(".info/serverTimeOffset");
      const listener = snapshot => {
        timeOffset = Number(snapshot.val()) || 0;
        onChange?.(timeOffset);
      };
      ref.on("value", listener, error => console.error("Firebase server time offset listener failed:", error));
      return () => ref.off("value", listener);
    },
    now: () => Date.now() + timeOffset
  });
})();
