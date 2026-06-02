/**
 * Vector Learn — Service Worker (MOB-101)
 * Caches the app shell for offline support.
 * Cache-first for static assets, network-first for API calls.
 */

const CACHE_NAME = "vl-shell-v1";
const SHELL_ASSETS = ["/", "/index.html"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(SHELL_ASSETS)).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Skip cross-origin requests and API calls — always go to network
  if (url.origin !== self.location.origin || url.pathname.startsWith("/api/")) {
    return;
  }

  // For navigation requests (HTML), try network first, fall back to cached index.html
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request).catch(() =>
        caches.match("/index.html").then((r) => r ?? new Response("Offline", { status: 503 }))
      )
    );
    return;
  }

  // For static assets: cache first, then network
  event.respondWith(
    caches.match(request).then((cached) => {
      if (cached) return cached;
      return fetch(request).then((response) => {
        // Cache successful GET responses for static assets
        if (response.ok && request.method === "GET") {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
        }
        return response;
      });
    })
  );
});
