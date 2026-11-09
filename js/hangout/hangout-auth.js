// HANGOUT — Google account sign-in ONLY (name, photo, identity).
// No database reads/writes here. Uses the separate "hangout" Firebase app.
window.HangoutAuth = (() => {
  let started = false, resolved = false;
  const listeners = new Set();

  function toProfile(user) {
    if (!user) return null;
    const email = user.email || "";
    return {
      uid: user.uid,
      name: user.displayName || email.split("@")[0] || "Member",
      photo: user.photoURL || "",
      email
    };
  }

  function start() {
    if (started) return;
    const auth = HangoutFirebase.auth();
    if (!auth) return;
    started = true;
    auth.setPersistence(firebase.auth.Auth.Persistence.LOCAL).catch(() => {});
    auth.getRedirectResult().catch(error => console.warn("Hangout redirect sign-in:", error));
    auth.onAuthStateChanged(user => { resolved = true; const profile = toProfile(user); listeners.forEach(fn => fn(profile)); });
  }

  function errorMessage(error) {
    const code = String(error?.code || "");
    if (code.includes("popup-closed") || code.includes("cancelled-popup")) return "";
    if (code.includes("unauthorized-domain")) return "This website address is not allowed for Google sign-in yet. Ask the admin to add it in Firebase → Authentication → Settings → Authorized domains.";
    if (code.includes("operation-not-allowed")) return "Google sign-in is not turned on in Firebase yet.";
    if (code.includes("network-request-failed")) return "Connection failed. Check your internet and try again.";
    return error?.message || "Google sign-in failed. Please try again.";
  }

  return Object.freeze({
    isAvailable: () => HangoutFirebase.isAvailable(),
    current: () => toProfile(HangoutFirebase.auth()?.currentUser),
    // Tells the caller about every sign-in/out. Waits for Firebase to restore a
    // saved session first, so a signed-in user never sees a login flash.
    onChange(fn) { start(); listeners.add(fn); if (resolved) fn(this.current()); return () => listeners.delete(fn); },
    errorMessage,
    async signIn() {
      start();
      const auth = HangoutFirebase.auth();
      if (!auth) throw new Error(HangoutFirebase.unavailableMessage());
      const provider = new firebase.auth.GoogleAuthProvider();
      provider.setCustomParameters({ prompt: "select_account" });
      try { return await auth.signInWithPopup(provider); }
      catch (error) {
        const code = String(error?.code || "");
        if (code.includes("popup-blocked") || code.includes("operation-not-supported")) { await auth.signInWithRedirect(provider); return null; }
        throw error;
      }
    },
    signOut() { return HangoutFirebase.auth()?.signOut() || Promise.resolve(); }
  });
})();
