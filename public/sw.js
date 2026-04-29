const CACHE_NAME = "acervo-mdl-inova-shell-v12";
const API_CACHE = "acervo-mdl-inova-api-v12";

const APP_SHELL = [
  "/",
  "/index.html",
  "/styles.css?v=20260428-cache-refresh-1",
  "/app.js?v=20260428-cache-refresh-1",
  "/artist-view-modes.css?v=20260428-cache-refresh-1",
  "/artist-view-modes.js?v=20260428-cache-refresh-1",
  "/dev-editor.js?v=20260428-cache-refresh-1",
  "/manifest.webmanifest",
  "/assets/logo-inova.jpg"
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL))
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(
      keys
        .filter((key) => ![CACHE_NAME, API_CACHE].includes(key))
        .map((key) => caches.delete(key))
    ))
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== location.origin) return;

  if (url.pathname.startsWith("/api/")) {
    event.respondWith(networkFirst(request, API_CACHE));
    return;
  }

  if (isAppShellAsset(url)) {
    event.respondWith(networkFirst(request, CACHE_NAME));
    return;
  }

  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request).catch(() => caches.match("/index.html"))
    );
    return;
  }

  event.respondWith(cacheFirst(request));
});

async function cacheFirst(request) {
  const cached = await caches.match(request);
  if (cached) return cached;
  const response = await fetch(request);
  const cache = await caches.open(CACHE_NAME);
  cache.put(request, response.clone());
  return response;
}

async function networkFirst(request, cacheName) {
  const cache = await caches.open(cacheName);
  try {
    const response = await fetch(request);
    cache.put(request, response.clone());
    return response;
  } catch {
    const cached = await cache.match(request);
    if (cached) return cached;
    throw new Error("offline-and-not-cached");
  }
}

function isAppShellAsset(url) {
  return [
    "/app.js",
    "/artist-view-modes.css",
    "/artist-view-modes.js",
    "/dev-editor.js",
    "/styles.css",
    "/manifest.webmanifest"
  ].includes(url.pathname);
}
