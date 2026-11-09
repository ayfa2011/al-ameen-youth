// HANGOUT — Firebase connection ONLY.
// Hangout users sign in with Google. The website's existing official/member
// session uses the default Firebase app, so Hangout gets its own named app
// ("hangout") on the SAME project. Two separate sign-in states: logging into
// Hangout never logs out an official, and vice versa.
// No Google-login code (hangout-auth.js) and no database paths
// (hangout.repository.js) belong in this file.
window.HangoutFirebase = (() => {
  const APP_NAME = "hangout";
  let app = null;

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
    auth: () => { const a = get(); return a ? firebase.auth(a) : null; },
    db: () => { const a = get(); return a ? firebase.database(a) : null; },
    serverTimestamp: () => firebase.database.ServerValue.TIMESTAMP
  });
})();
