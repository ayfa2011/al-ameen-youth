// Firebase LOCAL persistence keeps the role session on this device until the
// user logs out or the Firebase refresh token is revoked.
let ayfaAuthContext = { user: null, role: null, expiresAt: 0, ready: false };
let authExpiryTimer = 0;
let authWarningTimer = 0;
let sessionDraftSaveTimer = 0;
let pendingSessionDraft = null;
let authLoginInProgress = false;
let selectedLoginRole = "";
let authScreenNotice = "";
const GOOGLE_ROLE_PENDING_KEY = "ayfaPendingGoogleLoginRole";
const GOOGLE_ONE_TAP_ATTEMPT_KEY = "ayfaGoogleOneTapAttempted";
const MAX_PROFILE_PHOTO_BYTES = 512 * 1024;
const MAX_PROFILE_PHOTO_SOURCE_BYTES = 15 * 1024 * 1024;
let googleIdentityScriptPromise = null;
let googleOneTapInitialized = false;

function currentUserRole() {
  return isRoleAuthenticated() ? ayfaAuthContext.role : "";
}

function saveSessionDraft() {
  const controls = [...document.querySelectorAll("#appContainer input, #appContainer textarea, #appContainer select, .program-modal input, .program-modal textarea, .program-modal select, .rental-modal input, .rental-modal textarea, .rental-modal select")]
    .filter(control => !["password", "file", "search", "button", "submit", "reset"].includes(String(control.type || "").toLowerCase()) && (control.id || control.name));
  const fields = controls.map(control => ({ id: control.id || "", name: control.name || "", formClass: control.form?.className || "", type: control.type || "", value: control.type === "checkbox" || control.type === "radio" ? control.checked : control.value }));
  pendingSessionDraft = { fields, savedAt: Date.now() };
  return fields.length > 0;
}

function restoreSessionDraft() {
  const draft = pendingSessionDraft;
  pendingSessionDraft = null;
  if (!draft || Date.now() - Number(draft.savedAt || 0) > 60 * 60 * 1000) return;
  draft.fields.forEach(field => {
    const scope = field.formClass ? [...document.querySelectorAll("form")].find(form => form.className === field.formClass) : null;
    const control = field.id ? document.getElementById(field.id) : scope?.elements.namedItem(field.name) || [...document.getElementsByName(field.name)].find(Boolean);
    if (!control) return;
    if (field.type === "checkbox" || field.type === "radio") control.checked = Boolean(field.value);
    else control.value = field.value;
  });
  if (draft.fields.length) showToast("Your saved draft is ready to continue.", "success");
}

document.addEventListener("input", event => {
  const target = event.target;
  if (!(target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement)) return;
  if (["password", "file", "search"].includes(String(target.type || "").toLowerCase())) return;
  clearTimeout(sessionDraftSaveTimer);
  sessionDraftSaveTimer = window.setTimeout(() => { if (isRoleAuthenticated()) saveSessionDraft(); }, 350);
});
document.addEventListener("change", event => {
  const target = event.target;
  if (!(target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement)) return;
  if (["password", "file", "search"].includes(String(target.type || "").toLowerCase())) return;
  if (isRoleAuthenticated()) saveSessionDraft();
});

function isRoleAuthenticated() {
  if (!ayfaAuthContext.user || !ayfaAuthContext.role) return false;
  if (Number.isFinite(ayfaAuthContext.expiresAt) && Date.now() >= ayfaAuthContext.expiresAt) {
    void expireRoleSession();
    return false;
  }
  return true;
}

function isSupervisorLoggedIn() {
  return isRoleAuthenticated() && ayfaAuthContext.role === "official";
}

function authErrorMessage(error) {
  const code = String(error?.code || "");
  if (code.includes("wrong-password") || code.includes("invalid-credential") || code === "role-login-rejected") return error.message || "Password is incorrect. Please try again.";
  if (code.includes("popup-closed") || code.includes("cancelled-popup")) return "Google sign-in was cancelled. Please try again.";
  if (code.includes("unauthorized-domain")) return "This website address is not enabled for Google sign-in. Add it under Firebase Authentication → Settings → Authorized domains.";
  if (code.includes("operation-not-allowed")) return "Google sign-in is not enabled in Firebase Authentication.";
  if (code.includes("network-request-failed") || code.includes("network_error")) return "Connection failed. Check your internet and try again.";
  if (code.includes("permission-denied")) return "This sign-in could not be assigned a website role. Please try again.";
  if (code === "role-login-rejected") return error.message;
  return error?.message || "Google sign-in could not be completed. Please try again.";
}

function showAuthScreen(role = "", message = "") {
  clearTimeout(authExpiryTimer);
  clearTimeout(authWarningTimer);
  const app = document.getElementById("appContainer");
  const screen = document.getElementById("pinScreen");
  app?.classList.add("hidden");
  screen?.classList.remove("hidden");
  const choices = document.getElementById("authRoleChoices");
  const form = document.getElementById("roleLoginForm");
  const hint = document.getElementById("authRoleHint");
  const error = document.getElementById("pinError");
  const passwordField = document.getElementById("officialPasswordField");
  const passwordInput = document.getElementById("authPassword");
  const loginButton = document.getElementById("loginBtn");
  selectedLoginRole = role === "member" || role === "official" ? role : "";
  if (selectedLoginRole) cancelGoogleOneTap();
  if (error) error.textContent = selectedLoginRole ? message : "";
  const screenMessage = document.getElementById("authScreenMessage");
  if (screenMessage) screenMessage.textContent = message || (selectedLoginRole === "official" ? "Enter the Admin & Incharges password." : selectedLoginRole === "member" ? "Choose a Google account to continue." : "");
  choices?.classList.toggle("hidden", Boolean(selectedLoginRole));
  form?.classList.toggle("hidden", !selectedLoginRole);
  hint?.classList.toggle("hidden", !selectedLoginRole);
  passwordField?.classList.toggle("hidden", selectedLoginRole !== "official");
  if (passwordInput) {
    passwordInput.required = selectedLoginRole === "official";
    if (!selectedLoginRole) passwordInput.value = "";
  }
  if (loginButton) {
    loginButton.innerHTML = selectedLoginRole === "official"
      ? '<i class="fa-solid fa-lock"></i><span>Login</span>'
      : '<i class="fa-brands fa-google"></i><span>Continue with Google</span>';
  }
  if (hint) hint.textContent = selectedLoginRole === "official" ? "" : selectedLoginRole === "member" ? "Sign in with any Google account for read-only access." : "";
  const title = document.querySelector("#pinScreen .pin-box h2");
  if (title) title.textContent = selectedLoginRole === "official" ? "Admin & Incharges Login" : selectedLoginRole === "member" ? "Member Login" : "ಅಲ್‌ ಅಮೀನ್ ಯೂತ್ ಫೆಡರೇಶನ್";
  const button = document.getElementById("loginBtn");
  if (button) button.disabled = false;
}

function selectLoginRole(role) {
  if (role === "member" || role === "official") {
    authScreenNotice = "";
    showAuthScreen(role);
  }
}

function loadGoogleIdentityServices() {
  if (window.google?.accounts?.id) return Promise.resolve();
  if (googleIdentityScriptPromise) return googleIdentityScriptPromise;
  googleIdentityScriptPromise = new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = "https://accounts.google.com/gsi/client";
    script.async = true;
    script.defer = true;
    script.onload = () => window.google?.accounts?.id
      ? resolve()
      : reject(new Error("Google Identity Services did not initialize."));
    script.onerror = () => reject(new Error("Google Identity Services could not be loaded."));
    document.head.appendChild(script);
  });
  return googleIdentityScriptPromise;
}

function cancelGoogleOneTap() {
  if (googleOneTapInitialized) window.google?.accounts?.id?.cancel();
}

function startGoogleOneTap() {
  const isAllowedIdentityOrigin = location.protocol === "https:"
    || (location.protocol === "http:" && ["localhost", "127.0.0.1", "::1"].includes(location.hostname));
  if (!isAllowedIdentityOrigin || !window.firebaseAuth || !SCRIPT_URL || !window.googleIdentityClientId
    || window.firebaseAuth.currentUser || authLoginInProgress
    || selectedLoginRole === "official"
    || sessionStorage.getItem(GOOGLE_ONE_TAP_ATTEMPT_KEY)) return;

  sessionStorage.setItem(GOOGLE_ONE_TAP_ATTEMPT_KEY, "1");
  void loadGoogleIdentityServices().then(() => {
    if (window.firebaseAuth.currentUser || authLoginInProgress || selectedLoginRole === "official") return;
    window.google.accounts.id.initialize({
      client_id: window.googleIdentityClientId,
      callback: handleGoogleOneTapCredential,
      auto_select: false,
      cancel_on_tap_outside: true,
      use_fedcm_for_prompt: true
    });
    googleOneTapInitialized = true;
    window.google.accounts.id.prompt();
  }).catch(error => {
    console.warn("Google One Tap could not be started; the sign-in button remains available:", error);
  });
}

async function handleGoogleOneTapCredential(response) {
  if (!response?.credential || authLoginInProgress || window.firebaseAuth?.currentUser) return;
  authLoginInProgress = true;
  showAuthScreen("member");
  const button = document.getElementById("loginBtn");
  const backButton = document.querySelector("#roleLoginForm .auth-back-button");
  if (button) {
    button.disabled = true;
    button.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i><span>Signing in…</span>';
  }
  if (backButton) backButton.disabled = true;
  try {
    await window.firebaseReady;
    if (selectedLoginRole !== "member" || window.firebaseAuth?.currentUser) return;
    const googleCredential = firebase.auth.GoogleAuthProvider.credential(response.credential);
    const result = await window.firebaseAuth.signInWithCredential(googleCredential);
    sessionStorage.setItem(GOOGLE_ROLE_PENDING_KEY, "member");
    await completeGoogleRoleLogin("member", result.user);
  } catch (loginError) {
    console.error("Google One Tap sign-in failed:", loginError);
    await window.firebaseAuth?.signOut().catch(signOutError => console.error("Temporary Google session cleanup failed:", signOutError));
    sessionStorage.removeItem(GOOGLE_ROLE_PENDING_KEY);
    authScreenNotice = authErrorMessage(loginError);
    showAuthScreen("member", authScreenNotice);
    document.getElementById("authRoleHint")?.classList.remove("hidden");
  } finally {
    authLoginInProgress = false;
    if (backButton) backButton.disabled = false;
    if (button && !isRoleAuthenticated()) {
      button.disabled = false;
      button.innerHTML = selectedLoginRole === "official"
        ? '<i class="fa-solid fa-lock"></i><span>Login</span>'
        : '<i class="fa-brands fa-google"></i><span>Continue with Google</span>';
    }
  }
}

async function resolveFirebaseRole(user) {
  await window.firebaseReady;
  const token = await user.getIdTokenResult();
  const role = String(token.claims?.role || "").trim().toLowerCase();
  const validLogin = role === "member"
    ? token.claims?.googleAuth === true
    : role === "official" && token.claims?.passwordAuth === true;
  if (!validLogin) {
    const error = new Error("Please sign in using the correct method for your account.");
    error.code = "permission-denied";
    throw error;
  }
  return { role, expiresAt: null };
}

async function activateRoleSession(user, resolved) {
  ayfaAuthContext = { user, role: resolved.role, expiresAt: resolved.expiresAt, ready: true };
  authScreenNotice = "";
  clearTimeout(authExpiryTimer);
  clearTimeout(authWarningTimer);
  if (Number.isFinite(resolved.expiresAt)) {
    authExpiryTimer = window.setTimeout(() => { void expireRoleSession(); }, Math.max(0, resolved.expiresAt - Date.now()));
    authWarningTimer = window.setTimeout(() => {
      if (!ayfaAuthContext.user || Date.now() >= ayfaAuthContext.expiresAt) return;
      const activeView = document.getElementById("appContainer")?.dataset.activeView || "";
      if (activeView === "attendance" && typeof saveAttendanceDraft === "function") saveAttendanceDraft();
      document.dispatchEvent(new CustomEvent("ayfa:session-ending", { detail: { expiresAt: ayfaAuthContext.expiresAt } }));
      const draftSaved = saveSessionDraft();
      showToast(draftSaved ? "Session ending in 5 minutes. Your draft has been saved." : "Session ending in 5 minutes. Save any unfinished changes now.", "warning");
    }, Math.max(0, resolved.expiresAt - Date.now() - 5 * 60 * 1000));
  }
  document.getElementById("pinScreen")?.classList.add("hidden");
  document.getElementById("appContainer")?.classList.remove("hidden");
  refreshSupervisorUI();
  if (typeof showDashboard === "function") showDashboard();
  restoreSessionDraft();
  updateAuthSessionTimer();
}

async function completeGoogleRoleLogin(role, googleUser) {
  if (role !== "member") throw new Error("Admin & Incharges sign in with a password.");
  if (!window.firebaseDb || !window.firebaseAuth || !SCRIPT_URL) throw new Error(window.firebaseConfigError || "Google login is not configured for this environment.");
  await window.firebaseReady;
  const idToken = await googleUser.getIdToken(true);
  const response = await fetch(SCRIPT_URL, {
    method: "POST",
    mode: "cors",
    headers: { "Content-Type": "text/plain;charset=utf-8" },
    body: JSON.stringify({ action: "createGoogleRoleToken", role, idToken })
  });
  let tokenResult;
  try {
    tokenResult = await response.json();
  } catch (error) {
    console.error("Google role-token response could not be read:", error);
    throw new Error("The login service returned an unreadable response. Please try again.");
  }
  if (!response.ok || tokenResult.success === false || tokenResult.error || !tokenResult.customToken) {
    const error = new Error(tokenResult.error || "The selected login type could not be verified.");
    error.code = "role-login-rejected";
    throw error;
  }
  const credential = await window.firebaseAuth.signInWithCustomToken(tokenResult.customToken);
  const resolved = await resolveFirebaseRole(credential.user);
  if (resolved.role !== role) {
    const mismatch = new Error("Choose the login type assigned to this account.");
    mismatch.code = "role-mismatch";
    throw mismatch;
  }
  await credential.user.updateProfile({
    displayName: credential.user.displayName || googleUser.displayName || googleUser.email || "",
    photoURL: credential.user.photoURL || googleUser.photoURL || null
  });
  sessionStorage.removeItem(GOOGLE_ROLE_PENDING_KEY);
  await activateRoleSession(credential.user, resolved);
}

async function completeOfficialPasswordLogin(password) {
  if (!window.firebaseDb || !window.firebaseAuth || !SCRIPT_URL) throw new Error(window.firebaseConfigError || "Admin & Incharges login is not configured for this environment.");
  await window.firebaseReady;
  const response = await fetch(SCRIPT_URL, {
    method: "POST",
    mode: "cors",
    headers: { "Content-Type": "text/plain;charset=utf-8" },
    body: JSON.stringify({ action: "createOfficialPasswordToken", password })
  });
  let tokenResult;
  try {
    tokenResult = await response.json();
  } catch (error) {
    console.error("Password role-token response could not be read:", error);
    throw new Error("The login service returned an unreadable response. Please try again.");
  }
  if (!response.ok || tokenResult.success === false || tokenResult.error || !tokenResult.customToken) {
    const error = new Error(tokenResult.error || "Password is incorrect. Please try again.");
    error.code = "role-login-rejected";
    throw error;
  }
  const credential = await window.firebaseAuth.signInWithCustomToken(tokenResult.customToken);
  const resolved = await resolveFirebaseRole(credential.user);
  if (resolved.role !== "official") {
    const mismatch = new Error("This sign-in is not an Admin & Incharges account.");
    mismatch.code = "role-mismatch";
    throw mismatch;
  }
  await activateRoleSession(credential.user, resolved);
}

async function submitRoleLogin(event) {
  event.preventDefault();
  if (!selectedLoginRole || authLoginInProgress) return;
  const button = document.getElementById("loginBtn");
  const error = document.getElementById("pinError");
  if (error) error.textContent = "";
  if (button) {
    button.disabled = true;
    button.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i><span>Signing in…</span>';
  }
  const roleHint = document.getElementById("authRoleHint");
  roleHint?.classList.add("hidden");
  authLoginInProgress = true;
  let redirectStarted = false;
  try {
    if (selectedLoginRole === "official") {
      const password = String(document.getElementById("authPassword")?.value || "");
      await completeOfficialPasswordLogin(password);
    } else {
      if (!window.firebaseAuth || !SCRIPT_URL) throw new Error(window.firebaseConfigError || "Google login is not configured for this environment.");
      await window.firebaseReady;
      sessionStorage.setItem(GOOGLE_ROLE_PENDING_KEY, selectedLoginRole);
      const provider = new firebase.auth.GoogleAuthProvider();
      provider.setCustomParameters({ prompt: "select_account" });
      const result = await window.firebaseAuth.signInWithPopup(provider);
      await completeGoogleRoleLogin(selectedLoginRole, result.user);
    }
  } catch (loginError) {
    const code = String(loginError?.code || "");
    if (code.includes("popup-blocked") || code.includes("operation-not-supported")) {
      try {
        const provider = new firebase.auth.GoogleAuthProvider();
        provider.setCustomParameters({ prompt: "select_account" });
        sessionStorage.setItem(GOOGLE_ROLE_PENDING_KEY, selectedLoginRole);
        await window.firebaseAuth.signInWithRedirect(provider);
        redirectStarted = true;
        return;
      } catch (redirectError) {
        console.error("Google redirect sign-in failed:", redirectError);
        loginError = redirectError;
      }
    }
    console.error("Role login failed:", loginError);
    authScreenNotice = authErrorMessage(loginError);
    await window.firebaseAuth?.signOut().catch(signOutError => console.error("Temporary Google session cleanup failed:", signOutError));
    sessionStorage.removeItem(GOOGLE_ROLE_PENDING_KEY);
    if (error) error.textContent = authScreenNotice;
    if (selectedLoginRole === "member") roleHint?.classList.remove("hidden");
  } finally {
    if (!redirectStarted) {
      authLoginInProgress = false;
      if (button) {
        button.disabled = false;
        button.innerHTML = selectedLoginRole === "official"
          ? '<i class="fa-solid fa-lock"></i><span>Login</span>'
          : '<i class="fa-brands fa-google"></i><span>Continue with Google</span>';
      }
    }
  }
}

function updateProfilePhotoPreview(value) {
  const image = document.getElementById("profilePhotoPreview");
  const fallback = document.getElementById("profilePhotoFallback");
  if (!image || !fallback) return;
  const photoUrl = String(value || "").trim();
  if (!photoUrl) {
    image.removeAttribute("src");
    image.classList.add("hidden");
    fallback.classList.remove("hidden");
    return;
  }
  image.onerror = () => {
    image.classList.add("hidden");
    fallback.classList.remove("hidden");
  };
  image.onload = () => {
    image.classList.remove("hidden");
    fallback.classList.add("hidden");
  };
  image.src = photoUrl;
}

function openProfilePhotoPicker() {
  if (!isRoleAuthenticated()) {
    showAuthScreen("", "Please sign in again to update your profile.");
    return;
  }
  document.getElementById("profilePhotoFile")?.click();
}

function compressProfilePhoto(file) {
  return new Promise((resolve, reject) => {
    const objectUrl = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      URL.revokeObjectURL(objectUrl);
      const maxSide = 640;
      const scale = Math.min(1, maxSide / Math.max(image.naturalWidth, image.naturalHeight));
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
      canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
      const context = canvas.getContext("2d");
      if (!context) {
        reject(new Error("Photo compression is not available in this browser."));
        return;
      }
      context.drawImage(image, 0, 0, canvas.width, canvas.height);
      const qualities = [0.82, 0.68, 0.54, 0.4];
      const encode = index => {
        if (index >= qualities.length) {
          if (canvas.width <= 320 || canvas.height <= 320) {
            reject(new Error("This photo could not be compressed enough. Choose a smaller picture."));
            return;
          }
          canvas.width = Math.max(1, Math.round(canvas.width * 0.75));
          canvas.height = Math.max(1, Math.round(canvas.height * 0.75));
          const resizedContext = canvas.getContext("2d");
          if (!resizedContext) {
            reject(new Error("Photo compression is not available in this browser."));
            return;
          }
          resizedContext.drawImage(image, 0, 0, canvas.width, canvas.height);
          encode(0);
          return;
        }
        canvas.toBlob(blob => {
          if (!blob) {
            reject(new Error("Photo compression failed. Please choose another picture."));
            return;
          }
          if (blob.size <= MAX_PROFILE_PHOTO_BYTES) resolve(blob);
          else encode(index + 1);
        }, "image/jpeg", qualities[index]);
      };
      encode(0);
    };
    image.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error("This picture could not be opened. Choose a JPEG, PNG or WebP image."));
    };
    image.src = objectUrl;
  });
}

async function handleProfilePhotoSelection(event) {
  const file = event.target.files?.[0];
  if (!file) return;
  const status = document.getElementById("profileSaveStatus");
  const picker = document.getElementById("profilePhotoPicker");
  if (!isRoleAuthenticated()) {
    showAuthScreen("", "Please sign in again to update your profile.");
    return;
  }
  if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
    if (status) status.textContent = "Choose a JPEG, PNG or WebP photo.";
    event.target.value = "";
    return;
  }
  if (file.size > MAX_PROFILE_PHOTO_SOURCE_BYTES) {
    if (status) status.textContent = "Choose a photo smaller than 15 MB.";
    event.target.value = "";
    return;
  }
  if (picker) picker.disabled = true;
  if (status) status.textContent = "Compressing photo…";
  try {
    await window.firebaseReady;
    if (typeof firebase.storage !== "function") throw new Error("Firebase Storage is unavailable. Enable Firebase Storage for this project.");
    const blob = await compressProfilePhoto(file);
    if (status) status.textContent = "Uploading photo…";
    const storageRef = firebase.storage().ref(`profile-photos/${ayfaAuthContext.user.uid}/avatar.jpg`);
    await storageRef.put(blob, { contentType: "image/jpeg", cacheControl: "public,max-age=3600" });
    const photoURL = await storageRef.getDownloadURL();
    await ayfaAuthContext.user.updateProfile({ photoURL });
    renderProfilePage();
    if (status) status.textContent = "Profile photo saved.";
  } catch (error) {
    console.error("Profile photo upload failed:", error);
    if (status) status.textContent = error?.code === "storage/unauthorized"
      ? "Firebase Storage rules do not allow this upload. Publish the profile photo rules."
      : error?.code === "storage/bucket-not-found"
        ? "Firebase Storage is not set up for this project yet."
        : error?.message || "Photo upload failed. Check your connection and try again.";
  } finally {
    if (picker) picker.disabled = false;
    event.target.value = "";
  }
}

function renderProfilePage() {
  if (!isRoleAuthenticated()) return;
  const user = ayfaAuthContext.user;
  const nameInput = document.getElementById("profileDisplayName");
  const email = document.getElementById("profileEmail");
  const role = document.getElementById("profileRole");
  const status = document.getElementById("profileSaveStatus");
  if (nameInput) nameInput.value = user.displayName || user.email?.split("@")[0] || "";
  if (email) email.textContent = user.email || "";
  if (role) role.textContent = ayfaAuthContext.role === "official" ? "Admin & Incharges" : "Member";
  if (status) status.textContent = "";
  updateProfilePhotoPreview(user.photoURL || "");
}

async function saveProfileChanges(event) {
  event.preventDefault();
  if (!isRoleAuthenticated()) {
    showAuthScreen("", "Please sign in again to update your profile.");
    return;
  }
  const nameInput = document.getElementById("profileDisplayName");
  const status = document.getElementById("profileSaveStatus");
  const button = document.getElementById("saveProfileButton");
  const displayName = String(nameInput?.value || "").trim();
  if (!displayName || displayName.length > 80) {
    if (status) status.textContent = "Enter a name between 1 and 80 characters.";
    nameInput?.focus();
    return;
  }
  if (button) button.disabled = true;
  if (status) status.textContent = "Saving…";
  try {
    await ayfaAuthContext.user.updateProfile({ displayName });
    renderProfilePage();
    if (status) status.textContent = "Profile updated.";
  } catch (error) {
    console.error("Profile update failed:", error);
    if (status) status.textContent = authErrorMessage(error);
  } finally {
    if (button) button.disabled = false;
  }
}

async function restoreRoleSession(user) {
  if (!user) {
    ayfaAuthContext = { user: null, role: null, expiresAt: 0, ready: true };
    refreshSupervisorUI();
    showAuthScreen("", authScreenNotice);
    authScreenNotice = "";
    startGoogleOneTap();
    return;
  }
  try {
    const resolved = await resolveFirebaseRole(user);
    await activateRoleSession(user, resolved);
  } catch (error) {
    const expired = error?.code === "session-expired";
    const notice = expired ? "Your session expired. Please sign in again." : "Please sign in with Google to continue.";
    ayfaAuthContext = { user: null, role: null, expiresAt: 0, ready: true };
    authScreenNotice = notice;
    await window.firebaseAuth.signOut().catch(() => {});
    showAuthScreen("", notice);
    authScreenNotice = "";
  }
}

async function expireRoleSession() {
  clearTimeout(authExpiryTimer);
  clearTimeout(authWarningTimer);
  const notice = "Your session expired. Please sign in again.";
  ayfaAuthContext = { user: null, role: null, expiresAt: 0, ready: true };
  authScreenNotice = notice;
  await window.firebaseAuth?.signOut().catch(() => {});
  refreshSupervisorUI();
  showAuthScreen("", notice);
  authScreenNotice = "";
}

async function manualRoleLogout() {
  if (!await showConfirmSheet({ title: "Log out?", message: "You will need to sign in again to continue.", confirmLabel: "Log out", danger: true })) return;
  pendingSessionDraft = null;
  clearTimeout(authExpiryTimer);
  clearTimeout(authWarningTimer);
  ayfaAuthContext = { user: null, role: null, expiresAt: 0, ready: true };
  authScreenNotice = "";
  await window.firebaseAuth.signOut().catch(error => console.error("Logout error:", error));
  refreshSupervisorUI();
  showAuthScreen();
}

function updateAuthSessionTimer() {
  const active = isRoleAuthenticated();
  if (active && Number.isFinite(ayfaAuthContext.expiresAt)) window.setTimeout(updateAuthSessionTimer, Math.max(0, ayfaAuthContext.expiresAt - Date.now()));
}

function openSupervisorLogin() {
  if (isRoleAuthenticated()) { void manualRoleLogout(); return; }
  showAuthScreen("official");
}

function requireSupervisor() {
  if (isSupervisorLoggedIn()) return true;
  showToast("Admin & Incharges access is required for this action.");
  return false;
}

function supervisorButtonHTML() {
  if (isRoleAuthenticated()) {
    return "";
  }
  return `<button type="button" class="ayfa-supervisor-btn" onclick="openSupervisorLogin()"><i class="fa-solid fa-lock"></i> Admin &amp; Incharges Login</button>`;
}

function applyRolePermissions() {
  const role = currentUserRole();
  document.documentElement.dataset.authRole = role || "signed-out";
  if (role === "member") {
    document.getElementById("tabMarkBtn")?.classList.add("hidden");
    const attendanceView = document.getElementById("attendanceView");
    if (attendanceView && !attendanceView.classList.contains("hidden") && typeof switchAttTab === "function") switchAttTab("report");
  } else {
    document.getElementById("tabMarkBtn")?.classList.remove("hidden");
  }
}

function refreshSupervisorUI() {
  document.querySelectorAll("[data-supervisor-login]").forEach(element => { element.innerHTML = supervisorButtonHTML(); });
  applyRolePermissions();
  if (typeof renderAgendas === "function") try { renderAgendas(); } catch (_) {}
  if (typeof renderProgramReports === "function") try { renderProgramReports(); } catch (_) {}
  if (typeof renderMemberCards === "function" && !document.getElementById("membersView")?.classList.contains("hidden")) try { renderMemberCards(); } catch (_) {}
  if (typeof syncRentalRole === "function") try { syncRentalRole(); } catch (_) {}
}

function supervisorInjectStyles() {
  if (document.getElementById("ayfaSupervisorStyles")) return;
  document.head.insertAdjacentHTML("beforeend", `<style id="ayfaSupervisorStyles">.ayfa-supervisor-bar{display:flex;align-items:center;justify-content:flex-end;gap:10px;margin:0 0 14px;flex-wrap:wrap}.ayfa-supervisor-btn{border:1px solid #d7e2ee;background:#f7fbff;color:#174f91;border-radius:10px;padding:9px 12px;min-height:40px;font-size:12px;font-weight:700;cursor:pointer;display:inline-flex;align-items:center;gap:7px}.auth-session-bar{display:flex;align-items:center;gap:9px;padding:8px 15px;background:#eef6f1;border-bottom:1px solid #e2ebe5;color:#185b3c;font-size:12px}.auth-session-bar span:first-child{font-weight:700}.auth-session-bar span:nth-child(2){margin-left:auto;color:#65786b;font-size:11px}.auth-session-bar button{min-height:30px;padding:4px 9px;border:1px solid #d7e5dc;border-radius:8px;background:#fff;color:#315b43;font-size:11px}</style>`);
}

supervisorInjectStyles();
document.addEventListener("DOMContentLoaded", () => {
  document.getElementById("pinScreen")?.classList.remove("hidden");
  document.getElementById("appContainer")?.classList.add("hidden");
  const screenMessage = document.getElementById("authScreenMessage");
  const choices = document.getElementById("authRoleChoices");
  if (screenMessage) screenMessage.textContent = "Checking your sign-in…";
  choices?.classList.add("hidden");
  ayfaAuthContext.ready = true;
  void initializeRoleAuthentication();
});

async function initializeRoleAuthentication() {
  if (!window.firebaseAuth) {
    showAuthScreen("", window.firebaseConfigError || "Firebase Authentication is unavailable.");
    return;
  }
  const pendingRole = sessionStorage.getItem(GOOGLE_ROLE_PENDING_KEY);
  authLoginInProgress = Boolean(pendingRole);
  try {
    await window.firebaseReady;
    const result = await window.firebaseAuth.getRedirectResult();
    if (pendingRole && result.user) {
      await completeGoogleRoleLogin(pendingRole, result.user);
    } else if (pendingRole) {
      authScreenNotice = "Google sign-in was not completed. Please try again.";
      showAuthScreen("", authScreenNotice);
    }
  } catch (error) {
    console.error("Google redirect login could not be completed:", error);
    await window.firebaseAuth.signOut().catch(signOutError => console.error("Temporary Google session cleanup failed:", signOutError));
    authScreenNotice = authErrorMessage(error);
    showAuthScreen(pendingRole || "", authScreenNotice);
  } finally {
    sessionStorage.removeItem(GOOGLE_ROLE_PENDING_KEY);
    authLoginInProgress = false;
  }
  window.firebaseAuth.onAuthStateChanged(user => {
    if (authLoginInProgress) return;
    void restoreRoleSession(user);
  });
}
function checkRoleExpiryOnResume() {
  if (ayfaAuthContext.user && Number.isFinite(ayfaAuthContext.expiresAt) && Date.now() >= ayfaAuthContext.expiresAt) void expireRoleSession();
  else updateAuthSessionTimer();
}
document.addEventListener("visibilitychange", () => { if (!document.hidden) checkRoleExpiryOnResume(); });
window.addEventListener("pageshow", checkRoleExpiryOnResume);
