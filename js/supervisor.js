// Role-based sign-in and one-hour session handling for the AYFA website.
const ROLE_SESSION_MS = 60 * 60 * 1000;
let ayfaAuthContext = { user: null, role: null, expiresAt: 0, ready: false };
let authExpiryTimer = 0;
let authWarningTimer = 0;
let sessionDraftSaveTimer = 0;
let pendingSessionDraft = null;
let authLoginInProgress = false;
let selectedLoginRole = "";
let authScreenNotice = "";

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
  if (Date.now() >= ayfaAuthContext.expiresAt) {
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
  if (code.includes("invalid-credential") || code.includes("user-not-found") || code.includes("wrong-password")) return "Login password is incorrect.";
  if (code.includes("too-many-requests")) return "Too many attempts. Please try again later.";
  if (code.includes("network-request-failed")) return "Connection failed. Check your internet and try again.";
  if (code.includes("permission-denied")) return "This account has no active website role. Contact an official.";
  return error?.message || "Login could not be completed. Please try again.";
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
  selectedLoginRole = role === "member" || role === "official" ? role : "";
  if (error) error.textContent = selectedLoginRole ? message : "";
  const screenMessage = document.getElementById("authScreenMessage");
  if (screenMessage) screenMessage.textContent = message || (selectedLoginRole ? "Sign in with your registered account." : "");
  choices?.classList.toggle("hidden", Boolean(selectedLoginRole));
  form?.classList.toggle("hidden", !selectedLoginRole);
  hint?.classList.toggle("hidden", !selectedLoginRole);
  if (hint) hint.textContent = "";
  const title = document.querySelector("#pinScreen .pin-box h2");
  if (title) title.textContent = selectedLoginRole === "official" ? "Officials Login" : selectedLoginRole === "member" ? "Member Login" : "ಅಲ್‌ ಅಮೀನ್ ಯೂತ್ ಫೆಡರೇಶನ್";
  const password = document.getElementById("authPassword");
  if (selectedLoginRole && password) password.value = "";
  if (selectedLoginRole && password) password.focus({ preventScroll: true });
}

function selectLoginRole(role) {
  if (role !== "member" && role !== "official") return;
  showAuthScreen(role);
}

function toggleAuthPassword() {
  const input = document.getElementById("authPassword");
  const button = document.querySelector(".auth-password-toggle");
  if (!input || !button) return;
  const show = input.type === "password";
  input.type = show ? "text" : "password";
  button.setAttribute("aria-label", show ? "Hide password" : "Show password");
  button.innerHTML = `<i class="fa-regular ${show ? "fa-eye-slash" : "fa-eye"}"></i>`;
}

async function resolveFirebaseRole(user) {
  await window.firebaseReady;
  const token = await user.getIdTokenResult();
  const authTime = Date.parse(token.authTime || "");
  if (!Number.isFinite(authTime) || Date.now() >= authTime + ROLE_SESSION_MS) {
    const error = new Error("Your session has expired. Please sign in again.");
    error.code = "session-expired";
    throw error;
  }
  const role = String(token.claims?.role || "").trim().toLowerCase();
  if (role !== "member" && role !== "official") {
    const error = new Error("This account has no active website role. Contact an official.");
    error.code = "permission-denied";
    throw error;
  }
  return { role, expiresAt: authTime + ROLE_SESSION_MS };
}

async function activateRoleSession(user, resolved) {
  ayfaAuthContext = { user, role: resolved.role, expiresAt: resolved.expiresAt, ready: true };
  authScreenNotice = "";
  clearTimeout(authExpiryTimer);
  clearTimeout(authWarningTimer);
  authExpiryTimer = window.setTimeout(() => { void expireRoleSession(); }, Math.max(0, resolved.expiresAt - Date.now()));
  authWarningTimer = window.setTimeout(() => {
    if (!ayfaAuthContext.user || Date.now() >= ayfaAuthContext.expiresAt) return;
    const activeView = document.getElementById("appContainer")?.dataset.activeView || "";
    if (activeView === "attendance" && typeof saveAttendanceDraft === "function") saveAttendanceDraft();
    document.dispatchEvent(new CustomEvent("ayfa:session-ending", { detail: { expiresAt: ayfaAuthContext.expiresAt } }));
    const draftSaved = saveSessionDraft();
    showToast(draftSaved ? "Session ending in 5 minutes. Your draft has been saved." : "Session ending in 5 minutes. Save any unfinished changes now.", "warning");
  }, Math.max(0, resolved.expiresAt - Date.now() - 5 * 60 * 1000));
  document.getElementById("pinScreen")?.classList.add("hidden");
  document.getElementById("appContainer")?.classList.remove("hidden");
  refreshSupervisorUI();
  if (typeof showDashboard === "function") showDashboard();
  restoreSessionDraft();
  updateAuthSessionTimer();
}

async function submitRoleLogin(event) {
  event.preventDefault();
  if (!selectedLoginRole) return;
  const password = String(document.getElementById("authPassword")?.value || "");
  const button = document.getElementById("loginBtn");
  const error = document.getElementById("pinError");
  if (error) error.textContent = "";
  if (button) { button.disabled = true; button.textContent = "Signing in…"; }
  const roleHint = document.getElementById("authRoleHint");
  roleHint?.classList.add("hidden");
  authLoginInProgress = true;
  try {
    if (!window.firebaseDb || !window.firebaseAuth || !SCRIPT_URL) throw new Error(window.firebaseConfigError || "Firebase login is not configured for this environment.");
    await window.firebaseReady;
    const response = await fetch(SCRIPT_URL, {
      method: "POST", mode: "cors", headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify({ action: "createRoleToken", role: selectedLoginRole, password })
    });
    const tokenResult = await response.json();
    if (!response.ok || tokenResult.success === false || tokenResult.error || !tokenResult.customToken) {
      const error = new Error(tokenResult.error || "Incorrect password. Please try again.");
      error.code = "role-login-rejected";
      throw error;
    }
    const credential = await window.firebaseAuth.signInWithCustomToken(tokenResult.customToken);
    const resolved = await resolveFirebaseRole(credential.user);
    if (resolved.role !== selectedLoginRole) {
      const mismatch = new Error("Choose the login type assigned to this account.");
      mismatch.code = "role-mismatch";
      throw mismatch;
    }
    await activateRoleSession(credential.user, resolved);
  } catch (loginError) {
    console.error("Role login failed:", loginError);
    if (loginError?.code === "role-mismatch" || loginError?.code === "permission-denied") {
      await window.firebaseAuth.signOut().catch(() => {});
    }
    if (error) error.textContent = loginError?.code === "role-login-rejected" ? loginError.message : authErrorMessage(loginError);
    roleHint?.classList.remove("hidden");
  } finally {
    authLoginInProgress = false;
    if (button) { button.disabled = false; button.textContent = "Login"; }
  }
}

async function restoreRoleSession(user) {
  if (!user) {
    ayfaAuthContext = { user: null, role: null, expiresAt: 0, ready: true };
    refreshSupervisorUI();
    showAuthScreen("", authScreenNotice);
    authScreenNotice = "";
    return;
  }
  try {
    const resolved = await resolveFirebaseRole(user);
    await activateRoleSession(user, resolved);
  } catch (error) {
    const expired = error?.code === "session-expired";
    const notice = expired ? "Your session expired. Please sign in again." : "No valid role session was found. Please sign in.";
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
  if (active) window.setTimeout(updateAuthSessionTimer, Math.max(0, ayfaAuthContext.expiresAt - Date.now()));
}

function openSupervisorLogin() {
  if (isRoleAuthenticated()) { void manualRoleLogout(); return; }
  showAuthScreen("official");
}

function requireSupervisor() {
  if (isSupervisorLoggedIn()) return true;
  showToast("Officials access is required for this action.");
  return false;
}

function supervisorButtonHTML() {
  if (isRoleAuthenticated()) {
    return "";
  }
  return `<button type="button" class="ayfa-supervisor-btn" onclick="openSupervisorLogin()"><i class="fa-solid fa-lock"></i> Officials Login</button>`;
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
  showAuthScreen("", window.firebaseConfigError || "");
  if (window.firebaseAuth) window.firebaseAuth.onAuthStateChanged(user => {
    if (authLoginInProgress) return;
    void restoreRoleSession(user);
  });
});
function checkRoleExpiryOnResume() {
  if (ayfaAuthContext.user && Date.now() >= ayfaAuthContext.expiresAt) void expireRoleSession();
  else updateAuthSessionTimer();
}
document.addEventListener("visibilitychange", () => { if (!document.hidden) checkRoleExpiryOnResume(); });
window.addEventListener("pageshow", checkRoleExpiryOnResume);
