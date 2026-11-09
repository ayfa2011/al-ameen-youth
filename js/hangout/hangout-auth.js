// HANGOUT — reuse the website's Google member session when one is active.
// The separate Hangout app remains available for users without that session.
window.HangoutAuth = (() => {
  let started = false, resolved = false;
  let mainSessionResolved = false, hangoutSessionResolved = false;
  let mainProfile = null, hangoutProfile = null;
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

  function notify() {
    if (!resolved) return;
    const profile = mainProfile || hangoutProfile;
    listeners.forEach(fn => fn(profile));
  }

  function start() {
    if (started) return;
    started = true;
    const mainAuth = HangoutFirebase.mainAuth();
    const hangoutAuth = HangoutFirebase.auth();
    if (!mainAuth || !hangoutAuth) {
      resolved = true;
      notify();
      return;
    }

    mainAuth.onAuthStateChanged(async user => {
      mainProfile = null;
      if (user) {
        try {
          const token = await user.getIdTokenResult();
          if (token.claims?.role === "member" && token.claims?.googleAuth === true) {
            mainProfile = toProfile(user);
            if (hangoutAuth.currentUser) {
              await hangoutAuth.signOut().catch(error => console.error("Old Hangout session cleanup failed:", error));
            }
          }
        } catch (error) {
          console.error("Main website sign-in could not be checked for Hangout:", error);
        }
      }
      mainSessionResolved = true;
      resolved = mainSessionResolved && hangoutSessionResolved;
      notify();
    });

    hangoutAuth.setPersistence(firebase.auth.Auth.Persistence.LOCAL)
      .then(() => hangoutAuth.getRedirectResult())
      .catch(error => console.error("Hangout session could not be restored:", error))
      .finally(() => {
        hangoutAuth.onAuthStateChanged(user => {
          hangoutProfile = toProfile(user);
          hangoutSessionResolved = true;
          resolved = mainSessionResolved && hangoutSessionResolved;
          notify();
        });
      });
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
    current: () => mainProfile || hangoutProfile,
    isUsingMainSession: () => Boolean(mainProfile),
    // Tells the caller about every sign-in/out. Waits for Firebase to restore a
    // saved session first, so a signed-in user never sees a login flash.
    onChange(fn) { start(); listeners.add(fn); if (resolved) fn(this.current()); return () => listeners.delete(fn); },
    errorMessage,
    async signIn() {
      start();
      if (mainProfile) return null;
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
    signOut() {
      const auth = mainProfile ? HangoutFirebase.mainAuth() : HangoutFirebase.auth();
      return auth?.signOut() || Promise.resolve();
    }
  });
})();
