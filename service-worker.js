const CACHE_NAME = "alameen-shell-v8";
const APP_SHELL = ["./", "./index.html", "./manifest.json", "./css/style.css", "./assets/icons/icon-192.png", "./assets/icons/icon-512.png", "./assets/icons/apple-touch-icon.png", "./assets/icons/favicon-32.png", "./assets/icons/favicon-16.png", "./assets/app-icon.png"];

self.addEventListener("install", event => {
  event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(APP_SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key !== CACHE_NAME).map(key => caches.delete(key)))).then(() => self.clients.claim()));
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
      caches.open(CACHE_NAME).then(cache => cache.put("./index.html", copy));
      return response;
    }).catch(() => caches.match("./index.html")));
    return;
  }
  event.respondWith(caches.match(request).then(cached => cached || fetch(request).then(response => {
    if (response.ok) caches.open(CACHE_NAME).then(cache => cache.put(request, response.clone()));
    return response;
  })));
});
