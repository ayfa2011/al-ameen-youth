// Bump this name when deploying asset changes; activation replaces the old shell cache.
// This is required in addition to ?v= query bumps on index.html: once a same-origin
// script is cached below, bumping its ?v= alone is not enough to evict it.
const CACHE_NAME = "alameen-shell-v34-host-dashboard";
const APP_SHELL = [
  "./", "./index.html", "./manifest.json", "./css/style.css",
  "./assets/icons/icon-192.png", "./assets/icons/icon-512.png", "./assets/icons/apple-touch-icon.png",
  "./assets/icons/favicon-32.png", "./assets/icons/favicon-16.png", "./assets/app-icon.png",
  "./assets/images/reports/r2026.jpg", "./assets/images/reports/r2025.jpg", "./assets/images/reports/r2024.jpg",
  "./assets/images/reports/r2022.jpg", "./assets/images/group-photo.png", "./assets/images/online-quiz-icon.png",
  "./css/hangout.css?v=20261110-chat-replies",
  "./js/hangout/hangout-firebase.js?v=20261109-single-login",
  "./js/hangout/hangout-auth.js?v=20261109-single-login",
  "./js/hangout/hangout.repository.js?v=20261109-scheduled-quiz-1",
  "./js/hangout/hangout-admin.repository.js?v=20261111-history-fix-1",
  "./js/hangout/hangout.service.js?v=20261109-cumulative-scoreboard-1",
  "./js/hangout/hangout-hub.view.js?v=20261110-native-mobile",
  "./js/hangout/quiz-chat.view.js?v=20261110-swipe-reply",
  "./js/hangout/quiz-admin.view.js?v=20261112-host-dashboard",
  "./js/hangout/quiz.view.js?v=20261110-native-mobile"
];

self.addEventListener("install", event => {
  event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(APP_SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key !== CACHE_NAME).map(key => caches.delete(key)))).then(() => self.clients.claim()).then(() => {
    self.clients.matchAll().then(clients => clients.forEach(client => client.postMessage({ type: "SW_UPDATE", reload: true })));
  }));
});

self.addEventListener("fetch", event => {
  const request = event.request;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  // Never cache data endpoints: Firebase and Apps Script responses can be stale or private.
  if (/\/(?:\.json|firebaseio\.com|firebasedatabase\.app)(?:$|\/)/i.test(url.pathname + url.hostname) || /script\.google\.com|googleapis\.com/i.test(url.hostname) || url.searchParams.has("auth") || url.searchParams.has("access_token")) return;
  if (request.mode === "navigate") {
    event.respondWith(fetch(request).then(response => {
      const copy = response.clone();
      event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.put("./index.html", copy)).catch(() => {}));
      return response;
    }).catch(() => caches.match("./index.html")));
    return;
  }
  event.respondWith(fetch(request).then(response => {
    if (response.ok) {
      const copy = response.clone();
      event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.put(request, copy)).catch(() => {}));
    }
    return response;
  }).catch(() => caches.match(request)));
});
